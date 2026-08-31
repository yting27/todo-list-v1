import { describe, expect, it } from "vitest";

import { decodeCursor, encodeCursor } from "../src/domain/cursor.js";
import { ProblemError } from "../src/domain/errors.js";
import { formatEtag, parseIfMatch } from "../src/http/etag.js";

describe("keyset cursors", () => {
  it("round-trips sort state and tie-breaker", () => {
    const encoded = encodeCursor({
      sort: "dueAt",
      direction: "asc",
      value: "2026-08-31T00:00:00Z",
      id: "00000000-0000-7000-8000-000000000001",
    });
    expect(decodeCursor(encoded, "dueAt", "asc")).toEqual({
      sort: "dueAt",
      direction: "asc",
      value: "2026-08-31T00:00:00Z",
      id: "00000000-0000-7000-8000-000000000001",
    });
  });

  it("rejects reuse under different ordering", () => {
    const encoded = encodeCursor({
      sort: "name",
      direction: "asc",
      value: "alpha",
      id: "00000000-0000-7000-8000-000000000001",
    });
    expect(() => decodeCursor(encoded, "priority", "asc")).toThrow(
      ProblemError,
    );
  });
});

describe("ETags", () => {
  it("accepts strong and weak version tags", () => {
    expect(parseIfMatch('"12"')).toBe(12);
    expect(parseIfMatch('W/"12"')).toBe(12);
    expect(formatEtag(12)).toBe('"12"');
  });

  it("rejects missing and malformed versions", () => {
    expect(() => parseIfMatch(undefined)).toThrow(ProblemError);
    expect(() => parseIfMatch("anything")).toThrow(ProblemError);
  });
});
