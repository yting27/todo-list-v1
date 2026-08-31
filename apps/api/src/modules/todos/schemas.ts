import { TODO_PRIORITIES, TODO_STATUSES } from "@todo/contracts";
import { z } from "zod";

import { listDirectionSchema, listSortSchema } from "../../domain/cursor.js";

export const recurrenceSchema = z.object({
  intervalCount: z.number().int().min(1).max(365),
  intervalUnit: z.enum(["day", "week", "month"]),
});

export const createTodoSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(10_000).default(""),
    dueAt: z.iso.datetime({ offset: true }),
    status: z.enum(TODO_STATUSES).default("NotStarted"),
    priority: z.enum(TODO_PRIORITIES).default("Medium"),
    recurrence: recurrenceSchema.nullable().optional(),
    dependencyIds: z.array(z.uuid()).max(50).default([]),
  })
  .strict();

export const updateTodoSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(10_000).optional(),
    dueAt: z.iso.datetime({ offset: true }).optional(),
    status: z.enum(TODO_STATUSES).optional(),
    priority: z.enum(TODO_PRIORITIES).optional(),
    cascadeDependents: z.boolean().default(false),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).some((key) => key !== "cascadeDependents"),
    "At least one TODO field must be supplied.",
  );

function splitList<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T[] | undefined {
  if (value === undefined) return undefined;
  const values = (
    Array.isArray(value) ? value : String(value).split(",")
  ).flatMap((item) => String(item).split(","));
  return values.every((item): item is T => allowed.includes(item as T))
    ? [...new Set(values)]
    : ([] as T[]);
}

export const listQuerySchema = z
  .object({
    status: z
      .unknown()
      .transform((value) => splitList(value, TODO_STATUSES))
      .optional(),
    priority: z
      .unknown()
      .transform((value) => splitList(value, TODO_PRIORITIES))
      .optional(),
    dueFrom: z.iso.datetime({ offset: true }).optional(),
    dueTo: z.iso.datetime({ offset: true }).optional(),
    dependencyState: z.enum(["blocked", "unblocked"]).optional(),
    sort: listSortSchema.default("dueAt"),
    direction: listDirectionSchema.default("asc"),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().optional(),
  })
  .refine((value) => value.status === undefined || value.status.length > 0, {
    message: "Invalid status filter",
    path: ["status"],
  })
  .refine(
    (value) => value.priority === undefined || value.priority.length > 0,
    { message: "Invalid priority filter", path: ["priority"] },
  )
  .refine(
    (value) => !value.dueFrom || !value.dueTo || value.dueFrom < value.dueTo,
    {
      message: "dueFrom must be earlier than dueTo",
      path: ["dueTo"],
    },
  );

export type CreateTodoInput = z.infer<typeof createTodoSchema>;
export type UpdateTodoInput = z.infer<typeof updateTodoSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
