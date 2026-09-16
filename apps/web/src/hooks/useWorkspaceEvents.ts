import { useQueryClient } from "@tanstack/react-query";
import { TODO_EVENT_TYPES, type WorkspaceEvent } from "@todo/contracts";
import { useEffect } from "react";

import { eventStreamUrl } from "@/lib/api";
import type { Todo, TodoList } from "@/lib/types";

export function useWorkspaceEvents(workspaceId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!workspaceId) return;
    let source: EventSource | undefined;
    let timer: number | undefined;
    let cancelled = false;
    let reconnectDelay = 1_000;
    let openedOnce = false;

    const invalidateTodoLists = () =>
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
        if (openedOnce) void invalidateTodoLists();
        openedOnce = true;
        reconnectDelay = 1_000;
      };
      source.onmessage = receive;
      for (const type of TODO_EVENT_TYPES)
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
      let event: WorkspaceEvent;
      try {
        event = JSON.parse(message.data) as WorkspaceEvent;
      } catch {
        return;
      }
      if (event.workspaceId !== workspaceId) return;
      // Get previous TODOs
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
      // Only refresh if the received version is newer.
      if (event.version <= cachedVersion) return;
      // Invalidate the whole `["todo", workspaceId]` prefix, not just the
      // changed TODO: dependent TODOs cache a snapshot of this TODO's status
      // in their `dependencies` array and must be refetched too.
      void queryClient.invalidateQueries({
        queryKey: ["todo", workspaceId],
      });
      void invalidateTodoLists();
    }

    connect();
    const focus = () => void invalidateTodoLists();
    window.addEventListener("focus", focus);
    return () => {
      cancelled = true;
      source?.close();
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("focus", focus);
    };
  }, [queryClient, workspaceId]);
}
