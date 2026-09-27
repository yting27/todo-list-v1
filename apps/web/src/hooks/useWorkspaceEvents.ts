import { useQueryClient } from "@tanstack/react-query";
import { TODO_EVENT_TYPES, type WorkspaceEvent } from "@todo/contracts";
import { useEffect } from "react";

import { eventStreamUrl } from "@/lib/api";

export function useWorkspaceEvents(workspaceId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!workspaceId) return;
    let source: EventSource | undefined;
    let timer: number | undefined;
    let cancelled = false;
    let reconnectDelay = 1_000;
    let openedOnce = false;

    const invalidateTodos = () =>
      queryClient.invalidateQueries({
        predicate: (query) =>
          (query.queryKey[0] === "todos" || query.queryKey[0] === "todo") &&
          query.queryKey[1] === workspaceId,
      });

    const connect = () => {
      if (cancelled) return;
      source = new EventSource(eventStreamUrl(workspaceId), {
        withCredentials: true,
      });
      source.onopen = () => {
        if (openedOnce) void invalidateTodos();
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
      // A current copy of the changed TODO does not guarantee that cached
      // dependents contain its latest status.
      void invalidateTodos();
    }

    connect();
    const focus = () => void invalidateTodos();
    window.addEventListener("focus", focus);
    return () => {
      cancelled = true;
      source?.close();
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("focus", focus);
    };
  }, [queryClient, workspaceId]);
}
