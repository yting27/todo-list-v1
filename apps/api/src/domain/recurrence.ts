import { DateTime } from "luxon";

import { badRequest } from "./errors.js";

export type RecurrenceUnit = "day" | "week" | "month";

export interface RecurrenceSchedule {
  anchorLocal: string;
  anchorDay: number;
  intervalCount: number;
  intervalUnit: RecurrenceUnit;
  timezone: string;
}

export interface NextOccurrence {
  dueAt: string;
  sequence: number;
}

export function assertTimezone(timezone: string): void {
  if (!DateTime.now().setZone(timezone).isValid) {
    throw badRequest(
      "invalid_timezone",
      "Timezone must be a valid IANA timezone name.",
    );
  }
}

export function localAnchor(
  dueAt: string,
  timezone: string,
): { anchorLocal: string; anchorDay: number } {
  assertTimezone(timezone);
  const due = DateTime.fromISO(dueAt, { setZone: true });
  if (!due.isValid)
    throw badRequest(
      "invalid_due_at",
      "dueAt must be a valid RFC 3339 timestamp.",
    );
  const local = due.setZone(timezone);
  return {
    anchorLocal: local.toFormat("yyyy-MM-dd'T'HH:mm:ss.SSS"),
    anchorDay: local.day,
  };
}

export function scheduledLocal(
  schedule: RecurrenceSchedule,
  sequence: number,
): DateTime {
  const anchor = DateTime.fromISO(schedule.anchorLocal, {
    zone: schedule.timezone,
  });
  if (!anchor.isValid)
    throw new Error(
      `Invalid stored recurrence anchor: ${anchor.invalidReason ?? "unknown"}`,
    );
  const quantity = sequence * schedule.intervalCount;
  let candidate: DateTime;
  if (schedule.intervalUnit === "day")
    candidate = anchor.plus({ days: quantity });
  else if (schedule.intervalUnit === "week")
    candidate = anchor.plus({ weeks: quantity });
  else {
    const monthStart = anchor.startOf("month").plus({ months: quantity });
    const day = Math.min(
      schedule.anchorDay,
      monthStart.daysInMonth ?? schedule.anchorDay,
    );
    candidate = monthStart.set({
      day,
      hour: anchor.hour,
      minute: anchor.minute,
      second: anchor.second,
      millisecond: anchor.millisecond,
    });
  }
  if (!candidate.isValid)
    throw new Error(
      `Unable to calculate recurrence: ${candidate.invalidReason ?? "unknown"}`,
    );
  return candidate;
}

export function nextOccurrence(
  schedule: RecurrenceSchedule,
  currentSequence: number,
  completedAt: string,
): NextOccurrence {
  assertTimezone(schedule.timezone);
  const completed = DateTime.fromISO(completedAt, { setZone: true });
  if (!completed.isValid) throw new Error("Invalid completion timestamp");

  // Late completions intentionally skip missed slots. The loop is bounded to catch corrupt schedules.
  for (
    let sequence = currentSequence + 1;
    sequence <= currentSequence + 1_000_000;
    sequence += 1
  ) {
    const candidate = scheduledLocal(schedule, sequence);
    if (candidate.toUTC() > completed.toUTC()) {
      return {
        sequence,
        dueAt: candidate.toUTC().toISO({ suppressMilliseconds: true })!,
      };
    }
  }
  throw new Error("Recurrence calculation exceeded its safety bound");
}
