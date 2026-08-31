import { badRequest } from "../domain/errors.js";

export function formatEtag(version: number): string {
  return `"${version}"`;
}

export function parseIfMatch(header: string | undefined): number {
  if (!header)
    throw badRequest(
      "if_match_required",
      "If-Match is required for this operation.",
    );
  const match = /^(?:W\/)?"?(\d+)"?$/.exec(header.trim());
  const version = match?.[1] ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(version) || version < 1) {
    throw badRequest(
      "invalid_if_match",
      "If-Match must contain a positive integer TODO version.",
    );
  }
  return version;
}
