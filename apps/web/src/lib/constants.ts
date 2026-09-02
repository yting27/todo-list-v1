import type { TodoStatus } from "@/lib/types";

/** Human-readable labels for TODO statuses, shared across the UI. */
export const TODO_STATUS_LABELS: Record<TodoStatus, string> = {
  NotStarted: "Not started",
  InProgress: "In progress",
  Completed: "Completed",
  Archived: "Archived",
};
