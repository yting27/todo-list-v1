import { v7 as uuidv7 } from "uuid";

import { conflict, notFound, staleVersion } from "../../domain/errors.js";
import { localAnchor, nextOccurrence } from "../../domain/recurrence.js";
import { priorityCode, statusCode, statusName } from "../../domain/todo.js";
import type { DbClient, DbPool, Queryable } from "../../platform/db.js";
import { inTransaction, serializable } from "../../platform/db.js";
import type { WorkspaceService } from "../workspaces/service.js";
import { listTodos } from "./list-query.js";
import { mapTodo, todoSelect, type TodoRow } from "./model.js";
import type { CreateTodoInput, ListQuery, UpdateTodoInput } from "./schemas.js";

interface LockedTodo {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  due_at: Date;
  status: number;
  priority: number;
  version: number;
  recurrence_series_id: string | null;
  recurrence_sequence: number | null;
  completed_at: Date | null;
}

interface SeriesRow {
  id: string;
  interval_count: number;
  interval_unit: "day" | "week" | "month";
  anchor_local: Date | string;
  anchor_day: number;
  timezone: string;
}

const IN_PROGRESS_STATUS = statusCode("InProgress");
const COMPLETED_STATUS = statusCode("Completed");

async function insertOutbox(
  client: Queryable,
  eventType: "todo.created" | "todo.updated" | "todo.deleted",
  workspaceId: string,
  todoId: string,
  version: number,
) {
  const id = uuidv7();
  const payload = { eventId: id, eventType, workspaceId, todoId, version };
  await client.query(
    `INSERT INTO outbox_events (id, event_type, aggregate_id, workspace_id, aggregate_version, payload)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [id, eventType, todoId, workspaceId, version, JSON.stringify(payload)],
  );
}

async function fetchTodo(
  queryable: Queryable,
  workspaceId: string,
  todoId: string,
) {
  const result = await queryable.query<TodoRow>(
    `${todoSelect} WHERE t.workspace_id = $1 AND t.id = $2 AND t.deleted_at IS NULL`,
    [workspaceId, todoId],
  );
  const row = result.rows[0];
  if (!row) throw notFound("TODO not found.");
  return mapTodo(row);
}

async function lockTodo(
  client: DbClient,
  workspaceId: string,
  todoId: string,
): Promise<LockedTodo> {
  const result = await client.query<LockedTodo>(
    `SELECT id, workspace_id, name, description, due_at, status, priority, version,
      recurrence_series_id, recurrence_sequence, completed_at
     FROM todos WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL FOR UPDATE`,
    [workspaceId, todoId],
  );
  const row = result.rows[0];
  if (!row) throw notFound("TODO not found.");
  return row;
}

function verifyVersion(todo: LockedTodo, expectedVersion: number) {
  if (todo.version !== expectedVersion) throw staleVersion();
}

function requiresCompletedPrerequisites(status: number) {
  return status === IN_PROGRESS_STATUS || status === COMPLETED_STATUS;
}

export class TodoService {
  constructor(
    private readonly pool: DbPool,
    private readonly workspaces: WorkspaceService,
  ) {}

  async list(userId: string, workspaceId: string, query: ListQuery) {
    await this.workspaces.requireRole(userId, workspaceId, [
      "owner",
      "editor",
      "viewer",
    ]);
    return listTodos(this.pool, workspaceId, query);
  }

  async get(userId: string, workspaceId: string, todoId: string) {
    await this.workspaces.requireRole(userId, workspaceId, [
      "owner",
      "editor",
      "viewer",
    ]);
    return fetchTodo(this.pool, workspaceId, todoId);
  }

  async create(userId: string, workspaceId: string, input: CreateTodoInput) {
    return inTransaction(this.pool, async (client) => {
      await this.workspaces.requireRole(
        userId,
        workspaceId,
        ["owner", "editor"],
        client,
      );
      const workspace = await client.query<{ timezone: string }>(
        "SELECT timezone FROM workspaces WHERE id = $1",
        [workspaceId],
      );
      const timezone = workspace.rows[0]!.timezone;
      const todoId = uuidv7();
      let seriesId: string | null = null;
      if (input.recurrence) {
        seriesId = uuidv7();
        const anchor = localAnchor(input.dueAt, timezone);
        await client.query(
          `INSERT INTO recurrence_series
            (id, workspace_id, interval_count, interval_unit, anchor_local, anchor_day)
           VALUES ($1, $2, $3, $4, $5::timestamp, $6)`,
          [
            seriesId,
            workspaceId,
            input.recurrence.intervalCount,
            input.recurrence.intervalUnit,
            anchor.anchorLocal,
            anchor.anchorDay,
          ],
        );
      }

      const todoStatus = statusCode(input.status);
      await this.validateDependencies(
        client,
        workspaceId,
        input.dependencyIds,
        requiresCompletedPrerequisites(todoStatus),
      );
      const created = await client.query<LockedTodo>(
        `INSERT INTO todos
          (id, workspace_id, name, description, due_at, status, priority, recurrence_series_id,
           recurrence_sequence, completed_at, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5::timestamptz, $6::smallint, $7::smallint, $8, $9,
           CASE WHEN $6::smallint = 2 THEN clock_timestamp() ELSE NULL END, $10, $10)
         RETURNING id, workspace_id, name, description, due_at, status, priority, version,
           recurrence_series_id, recurrence_sequence, completed_at`,
        [
          todoId,
          workspaceId,
          input.name,
          input.description,
          input.dueAt,
          todoStatus,
          priorityCode(input.priority),
          seriesId,
          seriesId ? 0 : null,
          userId,
        ],
      );
      for (const dependencyId of input.dependencyIds) {
        await client.query(
          "INSERT INTO todo_dependencies (todo_id, depends_on_id, created_by) VALUES ($1, $2, $3)",
          [todoId, dependencyId, userId],
        );
      }
      await insertOutbox(client, "todo.created", workspaceId, todoId, 1);
      const createdTodo = created.rows[0]!;
      if (
        createdTodo.status === 2 &&
        createdTodo.recurrence_series_id &&
        createdTodo.completed_at
      ) {
        await this.createNextOccurrence(
          client,
          userId,
          workspaceId,
          createdTodo,
          createdTodo.completed_at,
        );
      }
      return fetchTodo(client, workspaceId, todoId);
    });
  }

  async update(
    userId: string,
    workspaceId: string,
    todoId: string,
    expectedVersion: number,
    input: UpdateTodoInput,
  ) {
    return inTransaction(this.pool, async (client) => {
      await this.workspaces.requireRole(
        userId,
        workspaceId,
        ["owner", "editor"],
        client,
      );
      if (input.cascadeDependents) {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          workspaceId,
        ]);
      }
      const current = await lockTodo(client, workspaceId, todoId);
      verifyVersion(current, expectedVersion);
      const nextStatus =
        input.status === undefined ? current.status : statusCode(input.status);

      if (requiresCompletedPrerequisites(nextStatus)) {
        const blockers = await client.query(
          `SELECT 1 FROM todo_dependencies td JOIN todos d ON d.id = td.depends_on_id
           WHERE td.todo_id = $1 AND d.deleted_at IS NULL AND d.status <> 2 LIMIT 1`,
          [todoId],
        );
        if (blockers.rowCount)
          throw conflict(
            "todo_blocked",
            "Complete all prerequisites before starting or completing this TODO.",
          );
      }

      if (current.status === 2 && nextStatus !== 2) {
        await this.handleReopen(
          client,
          userId,
          workspaceId,
          current,
          input.cascadeDependents,
        );
      }

      const completedAtSql =
        current.status !== 2 && nextStatus === 2
          ? "clock_timestamp()"
          : current.status === 2 && nextStatus !== 2
            ? "NULL"
            : "completed_at";
      const updated = await client.query<{
        version: number;
        completed_at: Date | null;
      }>(
        `UPDATE todos SET
          name = $4, description = $5, due_at = $6::timestamptz, status = $7, priority = $8,
          completed_at = ${completedAtSql}, version = version + 1,
          updated_at = clock_timestamp(), updated_by = $3
         WHERE workspace_id = $1 AND id = $2 AND version = $9 AND deleted_at IS NULL
         RETURNING version, completed_at`,
        [
          workspaceId,
          todoId,
          userId,
          input.name ?? current.name,
          input.description ?? current.description,
          input.dueAt ?? current.due_at.toISOString(),
          nextStatus,
          input.priority === undefined
            ? current.priority
            : priorityCode(input.priority),
          expectedVersion,
        ],
      );
      const mutation = updated.rows[0];
      if (!mutation) throw staleVersion();
      await insertOutbox(
        client,
        "todo.updated",
        workspaceId,
        todoId,
        mutation.version,
      );

      let generatedOccurrenceId: string | null = null;
      if (
        current.status !== 2 &&
        nextStatus === 2 &&
        current.recurrence_series_id &&
        current.recurrence_sequence !== null
      ) {
        generatedOccurrenceId = await this.createNextOccurrence(
          client,
          userId,
          workspaceId,
          current,
          mutation.completed_at!,
        );
      }
      return {
        todo: await fetchTodo(client, workspaceId, todoId),
        generatedOccurrenceId,
      };
    });
  }

  async delete(
    userId: string,
    workspaceId: string,
    todoId: string,
    expectedVersion: number,
  ) {
    await inTransaction(this.pool, async (client) => {
      await this.workspaces.requireRole(
        userId,
        workspaceId,
        ["owner", "editor"],
        client,
      );
      const current = await lockTodo(client, workspaceId, todoId);
      verifyVersion(current, expectedVersion);
      const dependents = await client.query<{ id: string; name: string }>(
        `SELECT d.id, d.name FROM todo_dependencies td JOIN todos d ON d.id = td.todo_id
         WHERE td.depends_on_id = $1 AND d.deleted_at IS NULL AND d.status <> 3
         ORDER BY lower(d.name), d.id LIMIT 20`,
        [todoId],
      );
      if (dependents.rows.length) {
        throw conflict(
          "todo_has_dependents",
          "Remove active dependency links before deleting this prerequisite.",
          {
            affectedTodos: dependents.rows,
          },
        );
      }
      const result = await client.query<{ version: number }>(
        `UPDATE todos SET deleted_at = clock_timestamp(), deleted_by = $3, updated_at = clock_timestamp(),
          updated_by = $3, version = version + 1
         WHERE workspace_id = $1 AND id = $2 AND version = $4 AND deleted_at IS NULL RETURNING version`,
        [workspaceId, todoId, userId, expectedVersion],
      );
      const row = result.rows[0];
      if (!row) throw staleVersion();
      await insertOutbox(
        client,
        "todo.deleted",
        workspaceId,
        todoId,
        row.version,
      );
    });
  }

  async addDependency(
    userId: string,
    workspaceId: string,
    todoId: string,
    dependsOnId: string,
    expectedVersion: number,
  ) {
    return serializable(this.pool, async (client) => {
      await this.workspaces.requireRole(
        userId,
        workspaceId,
        ["owner", "editor"],
        client,
      );
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        workspaceId,
      ]);
      if (todoId === dependsOnId)
        throw conflict("self_dependency", "A TODO cannot depend on itself.");
      const locked = await client.query<LockedTodo>(
        `SELECT id, workspace_id, name, description, due_at, status, priority, version,
          recurrence_series_id, recurrence_sequence, completed_at
         FROM todos WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL ORDER BY id FOR UPDATE`,
        [[todoId, dependsOnId]],
      );
      const todo = locked.rows.find((row) => row.id === todoId);
      const dependency = locked.rows.find((row) => row.id === dependsOnId);
      if (
        !todo ||
        !dependency ||
        todo.workspace_id !== workspaceId ||
        dependency.workspace_id !== workspaceId
      ) {
        throw conflict(
          "cross_workspace_dependency",
          "Dependencies must be active TODOs in the same workspace.",
        );
      }
      verifyVersion(todo, expectedVersion);
      if (
        requiresCompletedPrerequisites(todo.status) &&
        dependency.status !== 2
      ) {
        throw conflict(
          "incomplete_prerequisite",
          "Only completed TODOs can be prerequisites for an in-progress or completed TODO.",
        );
      }
      const cycle = await client.query(
        `WITH RECURSIVE prerequisites(id) AS (
           SELECT depends_on_id FROM todo_dependencies WHERE todo_id = $1
           UNION
           SELECT td.depends_on_id FROM todo_dependencies td JOIN prerequisites p ON td.todo_id = p.id
         ) SELECT 1 FROM prerequisites WHERE id = $2 LIMIT 1`,
        [dependsOnId, todoId],
      );
      if (cycle.rowCount)
        throw conflict(
          "dependency_cycle",
          "This dependency would create a cycle.",
        );
      try {
        await client.query(
          "INSERT INTO todo_dependencies (todo_id, depends_on_id, created_by) VALUES ($1, $2, $3)",
          [todoId, dependsOnId, userId],
        );
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "23505"
        ) {
          throw conflict(
            "duplicate_dependency",
            "This dependency already exists.",
          );
        }
        throw error;
      }
      const changed = await client.query<{ version: number }>(
        `UPDATE todos SET version = version + 1, updated_at = clock_timestamp(), updated_by = $3
         WHERE id = $1 AND version = $2 RETURNING version`,
        [todoId, expectedVersion, userId],
      );
      if (!changed.rows[0]) throw staleVersion();
      await insertOutbox(
        client,
        "todo.updated",
        workspaceId,
        todoId,
        changed.rows[0].version,
      );
      return fetchTodo(client, workspaceId, todoId);
    });
  }

  async removeDependency(
    userId: string,
    workspaceId: string,
    todoId: string,
    dependsOnId: string,
    expectedVersion: number,
  ) {
    return serializable(this.pool, async (client) => {
      await this.workspaces.requireRole(
        userId,
        workspaceId,
        ["owner", "editor"],
        client,
      );
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        workspaceId,
      ]);
      const todo = await lockTodo(client, workspaceId, todoId);
      verifyVersion(todo, expectedVersion);
      const removed = await client.query(
        "DELETE FROM todo_dependencies WHERE todo_id = $1 AND depends_on_id = $2",
        [todoId, dependsOnId],
      );
      if (!removed.rowCount) throw notFound("Dependency not found.");
      const changed = await client.query<{ version: number }>(
        `UPDATE todos SET version = version + 1, updated_at = clock_timestamp(), updated_by = $3
         WHERE id = $1 AND version = $2 RETURNING version`,
        [todoId, expectedVersion, userId],
      );
      if (!changed.rows[0]) throw staleVersion();
      await insertOutbox(
        client,
        "todo.updated",
        workspaceId,
        todoId,
        changed.rows[0].version,
      );
      return fetchTodo(client, workspaceId, todoId);
    });
  }

  private async validateDependencies(
    client: DbClient,
    workspaceId: string,
    dependencyIds: string[],
    mustBeComplete: boolean,
  ) {
    if (!dependencyIds.length) return;
    const result = await client.query<{ id: string; status: number }>(
      `SELECT id, status FROM todos
       WHERE workspace_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL FOR SHARE`,
      [workspaceId, dependencyIds],
    );
    if (result.rows.length !== dependencyIds.length) {
      throw conflict(
        "invalid_dependency",
        "Every dependency must be an active TODO in the same workspace.",
      );
    }
    if (mustBeComplete && result.rows.some((row) => row.status !== 2)) {
      throw conflict(
        "todo_blocked",
        "An in-progress or completed TODO cannot have incomplete prerequisites.",
      );
    }
  }

  private async handleReopen(
    client: DbClient,
    userId: string,
    workspaceId: string,
    current: LockedTodo,
    confirmed: boolean,
  ) {
    if (confirmed)
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        workspaceId,
      ]);
    const affected = await client.query<{
      id: string;
      name: string;
      status: number;
    }>(
      `WITH RECURSIVE downstream(id) AS (
         SELECT td.todo_id FROM todo_dependencies td WHERE td.depends_on_id = $1
         UNION
         SELECT td.todo_id FROM todo_dependencies td JOIN downstream d ON td.depends_on_id = d.id
       )
       SELECT t.id, t.name, t.status FROM downstream d JOIN todos t ON t.id = d.id
       WHERE t.workspace_id = $2 AND t.deleted_at IS NULL AND t.status IN (1, 2)
       ORDER BY t.id FOR UPDATE OF t`,
      [current.id, workspaceId],
    );
    if (affected.rows.length && !confirmed) {
      throw conflict(
        "reopen_requires_confirmation",
        "Reopening this prerequisite will reset affected downstream TODOs.",
        {
          affectedTodos: affected.rows.map((row) => ({
            id: row.id,
            name: row.name,
            status: statusName(row.status),
          })),
        },
      );
    }
    for (const row of affected.rows) {
      const result = await client.query<{ version: number }>(
        `UPDATE todos SET status = 0, completed_at = NULL, version = version + 1,
          updated_at = clock_timestamp(), updated_by = $2 WHERE id = $1 RETURNING version`,
        [row.id, userId],
      );
      await insertOutbox(
        client,
        "todo.updated",
        workspaceId,
        row.id,
        result.rows[0]!.version,
      );
    }
  }

  private async createNextOccurrence(
    client: DbClient,
    userId: string,
    workspaceId: string,
    current: LockedTodo,
    completedAt: Date,
  ): Promise<string | null> {
    const series = await client.query<SeriesRow>(
      `SELECT rs.id, rs.interval_count, rs.interval_unit, rs.anchor_local, rs.anchor_day, w.timezone
       FROM recurrence_series rs JOIN workspaces w ON w.id = rs.workspace_id
       WHERE rs.id = $1 AND rs.stopped_at IS NULL FOR UPDATE`,
      [current.recurrence_series_id],
    );
    const row = series.rows[0];
    if (!row) return null;
    const occurrence = nextOccurrence(
      {
        anchorLocal:
          row.anchor_local instanceof Date
            ? row.anchor_local.toISOString().replace("Z", "")
            : String(row.anchor_local).replace(" ", "T"),
        anchorDay: row.anchor_day,
        intervalCount: row.interval_count,
        intervalUnit: row.interval_unit,
        timezone: row.timezone,
      },
      current.recurrence_sequence!,
      completedAt.toISOString(),
    );
    const id = uuidv7();
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO todos
        (id, workspace_id, name, description, due_at, status, priority, recurrence_series_id,
         recurrence_sequence, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5::timestamptz, 0, $6, $7, $8, $9, $9)
       ON CONFLICT (recurrence_series_id, recurrence_sequence)
         WHERE recurrence_series_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [
        id,
        workspaceId,
        current.name,
        current.description,
        occurrence.dueAt,
        current.priority,
        row.id,
        occurrence.sequence,
        userId,
      ],
    );
    if (!inserted.rows[0]) return null;
    await insertOutbox(client, "todo.created", workspaceId, id, 1);
    return id;
  }
}
