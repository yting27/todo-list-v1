import { describe, expect, it } from "vitest";

import { nextOccurrence, scheduledLocal } from "../src/domain/recurrence.js";

describe("recurrence scheduling", () => {
  it("preserves wall-clock time across daylight-saving changes", () => {
    const schedule = {
      anchorLocal: "2026-03-07T09:00:00.000",
      anchorDay: 7,
      intervalCount: 1,
      intervalUnit: "day" as const,
      timezone: "America/New_York",
    };
    expect(scheduledLocal(schedule, 0).toUTC().toISO()).toBe(
      "2026-03-07T14:00:00.000Z",
    );
    expect(scheduledLocal(schedule, 1).toUTC().toISO()).toBe(
      "2026-03-08T13:00:00.000Z",
    );
  });

  it("clamps month ends without drifting the anchor day", () => {
    const schedule = {
      anchorLocal: "2027-01-31T10:15:00.000",
      anchorDay: 31,
      intervalCount: 1,
      intervalUnit: "month" as const,
      timezone: "UTC",
    };
    expect(scheduledLocal(schedule, 1).toISODate()).toBe("2027-02-28");
    expect(scheduledLocal(schedule, 2).toISODate()).toBe("2027-03-31");
  });

  it("creates only the first future slot after a late completion", () => {
    const next = nextOccurrence(
      {
        anchorLocal: "2026-01-01T09:00:00.000",
        anchorDay: 1,
        intervalCount: 1,
        intervalUnit: "week",
        timezone: "UTC",
      },
      0,
      "2026-01-20T12:00:00Z",
    );
    expect(next).toEqual({ dueAt: "2026-01-22T09:00:00Z", sequence: 3 });
  });

  it("uses the next slot when completion is exactly on a scheduled instant", () => {
    const next = nextOccurrence(
      {
        anchorLocal: "2026-01-01T09:00:00.000",
        anchorDay: 1,
        intervalCount: 1,
        intervalUnit: "day",
        timezone: "UTC",
      },
      0,
      "2026-01-02T09:00:00Z",
    );
    expect(next).toEqual({ dueAt: "2026-01-03T09:00:00Z", sequence: 2 });
  });
});
