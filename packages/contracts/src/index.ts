export type { components, operations, paths } from "./generated.js";

export const TODO_STATUSES = [
  "NotStarted",
  "InProgress",
  "Completed",
  "Archived",
] as const;
export const TODO_PRIORITIES = ["Low", "Medium", "High"] as const;
export const WORKSPACE_ROLES = ["owner", "editor", "viewer"] as const;

export type TodoStatus = (typeof TODO_STATUSES)[number];
export type TodoPriority = (typeof TODO_PRIORITIES)[number];
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const TODO_EVENT_TYPES = [
  "todo.created",
  "todo.updated",
  "todo.deleted",
] as const;

export type TodoEventType = (typeof TODO_EVENT_TYPES)[number];

export interface WorkspaceEvent {
  eventId: string;
  eventType: TodoEventType;
  workspaceId: string;
  todoId: string;
  version: number;
}
