import { TODO_PRIORITIES, TODO_STATUSES } from "@todo/contracts";

import { badRequest } from "./errors.js";

export const statusToCode = new Map(
  TODO_STATUSES.map((status, index) => [status, index] as const),
);
export const priorityToCode = new Map(
  TODO_PRIORITIES.map((priority, index) => [priority, index] as const),
);

export function statusName(value: number) {
  const status = TODO_STATUSES[value];
  if (!status) throw new Error(`Invalid stored TODO status: ${value}`);
  return status;
}

export function priorityName(value: number) {
  const priority = TODO_PRIORITIES[value];
  if (!priority) throw new Error(`Invalid stored TODO priority: ${value}`);
  return priority;
}

export function statusCode(value: string) {
  const code = statusToCode.get(value as (typeof TODO_STATUSES)[number]);
  if (code === undefined)
    throw badRequest("invalid_status", `Unsupported TODO status: ${value}`);
  return code;
}

export function priorityCode(value: string) {
  const code = priorityToCode.get(value as (typeof TODO_PRIORITIES)[number]);
  if (code === undefined)
    throw badRequest("invalid_priority", `Unsupported TODO priority: ${value}`);
  return code;
}
