import { priorityName, statusName } from "../../domain/todo.js";

export interface DependencyJson {
  id: string;
  name: string;
  status: number;
}

export interface TodoRow {
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
  created_at: Date;
  updated_at: Date;
  interval_count: number | null;
  interval_unit: "day" | "week" | "month" | null;
  anchor_local: Date | string | null;
  anchor_day: number | null;
  dependencies: DependencyJson[];
  blocking_dependency_ids: string[];
}

export function mapTodo(row: TodoRow) {
  const recurrence =
    row.recurrence_series_id &&
    row.recurrence_sequence !== null &&
    row.interval_count !== null &&
    row.interval_unit &&
    row.anchor_local
      ? {
          seriesId: row.recurrence_series_id,
          sequence: row.recurrence_sequence,
          intervalCount: row.interval_count,
          intervalUnit: row.interval_unit,
          anchorLocal:
            row.anchor_local instanceof Date
              ? row.anchor_local.toISOString().replace("Z", "")
              : String(row.anchor_local).replace(" ", "T"),
        }
      : null;

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description,
    dueAt: row.due_at.toISOString(),
    status: statusName(row.status),
    priority: priorityName(row.priority),
    version: row.version,
    blocked: row.blocking_dependency_ids.length > 0,
    blockingDependencyIds: row.blocking_dependency_ids,
    dependencies: row.dependencies.map((dependency) => ({
      id: dependency.id,
      name: dependency.name,
      status: statusName(dependency.status),
      completed: dependency.status === 2,
    })),
    recurrence,
    completedAt: row.completed_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export const todoSelect = `
  SELECT t.id, t.workspace_id, t.name, t.description, t.due_at, t.status, t.priority,
    t.version, t.recurrence_series_id, t.recurrence_sequence, t.completed_at,
    t.created_at, t.updated_at, rs.interval_count, rs.interval_unit,
    rs.anchor_local, rs.anchor_day,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'status', d.status) ORDER BY lower(d.name), d.id)
      FROM todo_dependencies td JOIN todos d ON d.id = td.depends_on_id
      WHERE td.todo_id = t.id AND d.deleted_at IS NULL
    ), '[]'::jsonb) AS dependencies,
    COALESCE((
      SELECT array_agg(d.id ORDER BY d.id)
      FROM todo_dependencies td JOIN todos d ON d.id = td.depends_on_id
      WHERE td.todo_id = t.id AND d.deleted_at IS NULL AND d.status <> 2
    ), ARRAY[]::uuid[]) AS blocking_dependency_ids
  FROM todos t
  LEFT JOIN recurrence_series rs ON rs.id = t.recurrence_series_id`;
