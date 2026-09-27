import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { useWorkspaceEvents } from "./useWorkspaceEvents";

class FakeEventSource {
  static current: FakeEventSource;
  onopen?: () => void;
  onmessage?: (event: MessageEvent<string>) => void;
  addEventListener = vi.fn();
  close = vi.fn();
  constructor() {
    FakeEventSource.current = this;
  }
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup() {
  vi.stubGlobal("EventSource", FakeEventSource);
  const client = new QueryClient();
  client.setQueryData(["todo", "workspace", "prerequisite"], { version: 2 });
  client.setQueryData(["todo", "workspace", "dependent"], {
    version: 1,
    dependencies: [{ id: "prerequisite", status: "InProgress" }],
  });
  client.setQueryData(["todos", "workspace"], { items: [] });
  client.setQueryData(["todo", "other", "dependent"], { version: 1 });
  renderHook(() => useWorkspaceEvents("workspace"), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return client;
}

it("refreshes dependent snapshots even when the changed TODO is already current", () => {
  const client = setup();
  act(() =>
    FakeEventSource.current.onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify({
          workspaceId: "workspace",
          todoId: "prerequisite",
          version: 2,
        }),
      }),
    ),
  );
  expect(
    client.getQueryState(["todo", "workspace", "dependent"])?.isInvalidated,
  ).toBe(true);
  expect(
    client.getQueryState(["todo", "other", "dependent"])?.isInvalidated,
  ).toBe(false);
});

it.each(["focus", "reconnect"])(
  "refreshes details and lists after %s",
  (trigger) => {
    const client = setup();
    act(() => {
      if (trigger === "focus") window.dispatchEvent(new Event("focus"));
      else {
        FakeEventSource.current.onopen?.();
        FakeEventSource.current.onopen?.();
      }
    });
    expect(
      client.getQueryState(["todo", "workspace", "dependent"])?.isInvalidated,
    ).toBe(true);
    expect(client.getQueryState(["todos", "workspace"])?.isInvalidated).toBe(
      true,
    );
  },
);
