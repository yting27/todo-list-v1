import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { eventStreamUrl } from "@/lib/api";
import type { Todo, TodoList } from "@/lib/types";

interface TodoEvent {
  eventId: string;
  eventType: "todo.created" | "todo.updated" | "todo.deleted";
  workspaceId: string;
  todoId: string;
  version: number;
}

export function useWorkspaceEvents(workspaceId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!workspaceId) return;
    let source: EventSource | undefined;
    let timer: number | undefined;
    let cancelled = false;
    let reconnectDelay = 1_000;
    let openedOnce = false;

    const reconcile = () =>
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === "todos" && query.queryKey[1] === workspaceId,
      });

    const connect = () => {
      if (cancelled) return;
      source = new EventSource(eventStreamUrl(workspaceId), {
        withCredentials: true,
      });
      source.onopen = () => {
        if (openedOnce) void reconcile();
        openedOnce = true;
        reconnectDelay = 1_000;
      };
      source.onmessage = receive;
      for (const type of ["todo.created", "todo.updated", "todo.deleted"])
        source.addEventListener(type, receive);
      source.onerror = () => {
        source?.close();
        if (!cancelled) {
          timer = window.setTimeout(connect, reconnectDelay);
          reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
        }
      };
    };

    function receive(message: MessageEvent<string>) {
      let event: TodoEvent;
      try {
        event = JSON.parse(message.data) as TodoEvent;
      } catch {
        return;
      }
      if (event.workspaceId !== workspaceId) return;
      const detail = queryClient.getQueryData<Todo>([
        "todo",
        workspaceId,
        event.todoId,
      ]);
      const lists = queryClient.getQueriesData<TodoList>({
        queryKey: ["todos", workspaceId],
      });
      const cachedVersion = Math.max(
        detail?.version ?? 0,
        ...lists.map(
          ([, list]) =>
            list?.items.find((todo) => todo.id === event.todoId)?.version ?? 0,
        ),
      );
      if (event.version <= cachedVersion) return;
      void queryClient.invalidateQueries({
        queryKey: ["todo", workspaceId, event.todoId],
      });
      void reconcile();
    }

    connect();
    const focus = () => void reconcile();
    window.addEventListener("focus", focus);
    return () => {
      cancelled = true;
      source?.close();
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("focus", focus);
    };
  }, [queryClient, workspaceId]);
}
