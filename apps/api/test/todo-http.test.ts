import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";
import { expect, it, vi } from "vitest";

import { createApiRouter } from "../src/http/routes.js";

it("does not cache dependency snapshots under the dependent's write version", async () => {
  const todo = {
    version: 1,
    dependencies: [{ name: "Seed TODO 00001", status: "InProgress" }],
  };
  const dependencies = {
    config: { sessionCookieName: "session" },
    sessions: { get: vi.fn().mockResolvedValue({ userId: "user" }) },
    todos: { get: vi.fn().mockImplementation(async () => todo) },
  } as unknown as Parameters<typeof createApiRouter>[0];
  const app = express();
  app.use(cookieParser());
  app.use(createApiRouter(dependencies));
  const path =
    "/workspaces/00000000-0000-7000-8000-000000000001/todos/00000000-0000-7000-8000-000000000002";
  const first = await request(app).get(path).set("Cookie", "session=test");
  expect(first.status).toBe(200);
  expect(first.headers["cache-control"]).toBe("no-store");
  expect(first.headers.etag).toBe('"1"');

  todo.dependencies[0]!.status = "Archived";
  // Fetch with cache: no-store sends no conditional cache validator.
  const refreshed = await request(app).get(path).set("Cookie", "session=test");
  expect(refreshed.status).toBe(200);
  expect(refreshed.body.dependencies[0].status).toBe("Archived");
  expect(refreshed.headers.etag).toBe(first.headers.etag);
});
