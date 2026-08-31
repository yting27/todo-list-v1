import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ProblemError } from "../../src/domain/errors.js";
import { TodoService } from "../../src/modules/todos/service.js";
import { WorkspaceService } from "../../src/modules/workspaces/service.js";
import { loadConfig } from "../../src/config.js";
import { createPool } from "../../src/platform/db.js";

const pool = createPool(loadConfig({ ...process.env, NODE_ENV: "test" }));
const workspaces = new WorkspaceService(pool);
const service = new TodoService(pool, workspaces);
const userId = "00000000-0000-7000-8000-000000000101";
const workspaceId = "00000000-0000-7000-8000-000000000102";

async function create(name: string, overrides: Record<string, unknown> = {}) {
  return service.create(userId, workspaceId, {
    name,
    description: "integration test",
    dueAt: "2026-09-01T10:00:00Z",
    status: "NotStarted",
    priority: "Medium",
    dependencyIds: [],
    ...overrides,
  });
}

beforeAll(async () => {
  await pool.query("SELECT 1 FROM schema_migrations LIMIT 1");
});

beforeEach(async () => {
  await pool.query(
    "TRUNCATE outbox_events, todo_dependencies, todos, recurrence_series, workspace_members, workspaces, users CASCADE",
  );
  await pool.query(
    `INSERT INTO users (id, email, display_name, password_hash) VALUES ($1, 'test@example.com', 'Test', 'not-used')`,
    [userId],
  );
  await pool.query(
    "INSERT INTO workspaces (id, name, timezone) VALUES ($1, 'Test', 'UTC')",
    [workspaceId],
  );
  await pool.query(
    "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')",
    [workspaceId, userId],
  );
});

afterAll(async () => pool.end());

describe.sequential("TodoService PostgreSQL invariants", () => {
  it("enforces blockers, cycle rejection, and dependency-delete safety", async () => {
    const prerequisite = await create("Prerequisite");
    let dependent = await create("Dependent");
    dependent = await service.addDependency(
      userId,
      workspaceId,
      dependent.id,
      prerequisite.id,
      dependent.version,
    );
    await expect(
      service.update(userId, workspaceId, dependent.id, dependent.version, {
        status: "InProgress",
        cascadeDependents: false,
      }),
    ).rejects.toMatchObject({ status: 409, code: "todo_blocked" });
    await expect(
      service.addDependency(
        userId,
        workspaceId,
        prerequisite.id,
        dependent.id,
        prerequisite.version,
      ),
    ).rejects.toMatchObject({ status: 409, code: "dependency_cycle" });
    await expect(
      service.delete(
        userId,
        workspaceId,
        prerequisite.id,
        prerequisite.version,
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: "todo_has_dependents",
    });
  });

  it("requires confirmation and atomically resets a transitive reopen chain", async () => {
    let a = await create("A", { status: "Completed" });
    let b = await create("B", { status: "Completed" });
    let c = await create("C", { status: "Completed" });
    b = await service.addDependency(userId, workspaceId, b.id, a.id, b.version);
    c = await service.addDependency(userId, workspaceId, c.id, b.id, c.version);
    await expect(
      service.update(userId, workspaceId, a.id, a.version, {
        status: "NotStarted",
        cascadeDependents: false,
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "reopen_requires_confirmation",
    });
    a = (
      await service.update(userId, workspaceId, a.id, a.version, {
        status: "NotStarted",
        cascadeDependents: true,
      })
    ).todo;
    const [freshB, freshC] = await Promise.all([
      service.get(userId, workspaceId, b.id),
      service.get(userId, workspaceId, c.id),
    ]);
    expect([a.status, freshB.status, freshC.status]).toEqual([
      "NotStarted",
      "NotStarted",
      "NotStarted",
    ]);
    expect(freshB.blocked).toBe(true);
    expect(freshC.blocked).toBe(true);
  });

  it("lets exactly one concurrent writer use an ETag", async () => {
    const todo = await create("Concurrent");
    const results = await Promise.allSettled([
      service.update(userId, workspaceId, todo.id, todo.version, {
        name: "Writer A",
        cascadeDependents: false,
      }),
      service.update(userId, workspaceId, todo.id, todo.version, {
        name: "Writer B",
        cascadeDependents: false,
      }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejection = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(rejection?.reason).toBeInstanceOf(ProblemError);
    expect(rejection?.reason).toMatchObject({
      status: 412,
      code: "stale_version",
    });
  });

  it("creates exactly one next occurrence under concurrent completion", async () => {
    const todo = await create("Recurring", {
      recurrence: { intervalCount: 1, intervalUnit: "day" },
    });
    const results = await Promise.allSettled([
      service.update(userId, workspaceId, todo.id, todo.version, {
        status: "Completed",
        cascadeDependents: false,
      }),
      service.update(userId, workspaceId, todo.id, todo.version, {
        status: "Completed",
        cascadeDependents: false,
      }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const count = await pool.query<{ count: string }>(
      "SELECT count(*) FROM todos WHERE recurrence_series_id IS NOT NULL",
    );
    expect(Number(count.rows[0]!.count)).toBe(2);
  });

  it("schedules the next occurrence when a recurring TODO is created completed", async () => {
    await create("Already done", {
      status: "Completed",
      recurrence: { intervalCount: 1, intervalUnit: "week" },
    });
    const rows = await pool.query<{
      status: number;
      recurrence_sequence: number;
    }>(
      "SELECT status, recurrence_sequence FROM todos WHERE recurrence_series_id IS NOT NULL ORDER BY recurrence_sequence",
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows[0]).toEqual({ status: 2, recurrence_sequence: 0 });
    expect(rows.rows[1]!.status).toBe(0);
    expect(rows.rows[1]!.recurrence_sequence).toBeGreaterThan(0);
  });

  it("soft-deletes records and keeps stable keyset pagination", async () => {
    const first = await create("Alpha", { priority: "High" });
    await create("Bravo", { priority: "High" });
    await create("Charlie", { priority: "Low" });
    const pageOne = await service.list(userId, workspaceId, {
      sort: "name",
      direction: "asc",
      limit: 1,
    });
    const pageTwo = await service.list(userId, workspaceId, {
      sort: "name",
      direction: "asc",
      limit: 1,
      cursor: pageOne.nextCursor!,
    });
    expect(pageOne.items[0]?.name).toBe("Alpha");
    expect(pageTwo.items[0]?.name).toBe("Bravo");
    await service.delete(userId, workspaceId, first.id, first.version);
    await expect(
      service.get(userId, workspaceId, first.id),
    ).rejects.toMatchObject({ status: 404 });
    const retained = await pool.query(
      "SELECT deleted_at FROM todos WHERE id = $1",
      [first.id],
    );
    expect(retained.rows[0]?.deleted_at).toBeTruthy();
  });
});
