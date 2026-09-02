import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines class names and resolves Tailwind CSS conflicts.
 *
 * Uses `clsx` to join arbitrary class inputs (strings, arrays, objects, falsy
 * values) into a single string, then `tailwind-merge` to deduplicate and
 * reconcile conflicting Tailwind utility classes (e.g. `px-2` vs `px-4`,
 * `text-red-500` vs `text-blue-500`) so the last one wins.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
