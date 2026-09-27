import { afterEach, expect, it, vi } from "vitest";

import { api } from "./api";

afterEach(() => vi.unstubAllGlobals());

it("bypasses browser cached detail responses when prerequisites change", async () => {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ dependencies: [{ status: "Archived" }] }),
  });
  vi.stubGlobal("fetch", fetch);

  const todo = await api.getTodo("workspace", "dependent");

  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining("/workspaces/workspace/todos/dependent"),
    expect.objectContaining({ cache: "no-store" }),
  );
  expect(todo.dependencies[0]?.status).toBe("Archived");
});
