import { decodeCursor, encodeCursor } from "../../domain/cursor.js";
import { priorityCode, statusCode } from "../../domain/todo.js";
import type { Queryable } from "../../platform/db.js";
import { mapTodo, todoSelect, type TodoRow } from "./model.js";
import type { ListQuery } from "./schemas.js";

const sortDefinitions = {
  dueAt: {
    expression: "t.due_at",
    cast: "timestamptz",
    value: (row: TodoRow) => row.due_at.toISOString(),
  },
  priority: {
    expression: "t.priority",
    cast: "smallint",
    value: (row: TodoRow) => row.priority,
  },
  status: {
    expression: "t.status",
    cast: "smallint",
    value: (row: TodoRow) => row.status,
  },
  name: {
    expression: "lower(t.name)",
    cast: "text",
    value: (row: TodoRow) => row.name.toLowerCase(),
  },
} as const;

export async function listTodos(
  queryable: Queryable,
  workspaceId: string,
  input: ListQuery,
) {
  const values: unknown[] = [workspaceId];
  const conditions = ["t.workspace_id = $1", "t.deleted_at IS NULL"];
  const add = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (input.status)
    conditions.push(
      `t.status = ANY(${add(input.status.map(statusCode))}::smallint[])`,
    );
  if (input.priority)
    conditions.push(
      `t.priority = ANY(${add(input.priority.map(priorityCode))}::smallint[])`,
    );
  if (input.dueFrom)
    conditions.push(`t.due_at >= ${add(input.dueFrom)}::timestamptz`);
  if (input.dueTo)
    conditions.push(`t.due_at < ${add(input.dueTo)}::timestamptz`);
  if (input.search) {
    const escaped = input.search.replace(/[\\%_]/g, (char) => `\\${char}`);
    conditions.push(
      `(t.name ILIKE ${add(`%${escaped}%`)} ESCAPE '\\' OR t.description ILIKE ${add(`%${escaped}%`)} ESCAPE '\\')`,
    );
  }
  if (input.dependencyState) {
    const exists = `EXISTS (
      SELECT 1 FROM todo_dependencies ftd JOIN todos fd ON fd.id = ftd.depends_on_id
      WHERE ftd.todo_id = t.id AND fd.deleted_at IS NULL AND fd.status <> 2
    )`;
    conditions.push(
      input.dependencyState === "blocked" ? exists : `NOT ${exists}`,
    );
  }

  const sort = sortDefinitions[input.sort];
  if (input.cursor) {
    const cursor = decodeCursor(input.cursor, input.sort, input.direction);
    const operator = input.direction === "asc" ? ">" : "<";
    const valueParameter = add(cursor.value);
    const idParameter = add(cursor.id);
    if (input.sort === "name") {
      if (!cursor.secondary) {
        throw new Error(
          "Name cursor is missing its case-sensitive tie-breaker",
        );
      }
      const secondaryParameter = add(cursor.secondary);
      conditions.push(
        `(lower(t.name), t.name, t.id) ${operator} (${valueParameter}::text, ${secondaryParameter}::text, ${idParameter}::uuid)`,
      );
    } else {
      conditions.push(
        `(${sort.expression}, t.id) ${operator} (${valueParameter}::${sort.cast}, ${idParameter}::uuid)`,
      );
    }
  }

  const direction = input.direction === "asc" ? "ASC" : "DESC";
  const orderBy =
    input.sort === "name"
      ? `lower(t.name) ${direction}, t.name ${direction}, t.id ${direction}`
      : `${sort.expression} ${direction}, t.id ${direction}`;
  const limitParameter = add(input.limit + 1);
  const result = await queryable.query<TodoRow>(
    `${todoSelect}
     WHERE ${conditions.join(" AND ")}
     ORDER BY ${orderBy}
     LIMIT ${limitParameter}`,
    values,
  );
  const hasMore = result.rows.length > input.limit;
  const visibleRows = result.rows.slice(0, input.limit);
  const last = visibleRows.at(-1);
  return {
    items: visibleRows.map(mapTodo),
    nextCursor:
      hasMore && last
        ? encodeCursor({
            sort: input.sort,
            direction: input.direction,
            value: sort.value(last),
            ...(input.sort === "name" ? { secondary: last.name } : {}),
            id: last.id,
          })
        : null,
    hasMore,
  };
}
