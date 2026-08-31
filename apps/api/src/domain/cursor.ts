import { z } from "zod";

import { badRequest } from "./errors.js";

export const listSortSchema = z.enum(["dueAt", "priority", "status", "name"]);
export const listDirectionSchema = z.enum(["asc", "desc"]);
export type ListSort = z.infer<typeof listSortSchema>;
export type ListDirection = z.infer<typeof listDirectionSchema>;

const cursorSchema = z.object({
  sort: listSortSchema,
  direction: listDirectionSchema,
  value: z.union([z.string(), z.number()]),
  secondary: z.string().optional(),
  id: z.string().uuid(),
});

export type Cursor = z.infer<typeof cursorSchema>;

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(
  raw: string,
  sort: ListSort,
  direction: ListDirection,
): Cursor {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    );
    const cursor = cursorSchema.parse(parsed);
    if (cursor.sort !== sort || cursor.direction !== direction) {
      throw new Error("Cursor sort does not match the request");
    }
    if (cursor.sort === "name" && !cursor.secondary) {
      throw new Error("Name cursor is missing its case-sensitive tie-breaker");
    }
    return cursor;
  } catch {
    throw badRequest(
      "invalid_cursor",
      "The pagination cursor is invalid or does not match the selected sort.",
    );
  }
}
