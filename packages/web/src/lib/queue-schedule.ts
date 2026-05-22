import { format, formatDistanceStrict } from "date-fns";
import { DateTime } from "luxon";
import type { QueueListItem } from "@/hooks/use-queues";

export type ScheduleMode = "specific" | "fixed" | "variable";

export const WEEK_DAYS = [
  { index: 0, short: "Sun", full: "Sunday" },
  { index: 1, short: "Mon", full: "Monday" },
  { index: 2, short: "Tue", full: "Tuesday" },
  { index: 3, short: "Wed", full: "Wednesday" },
  { index: 4, short: "Thu", full: "Thursday" },
  { index: 5, short: "Fri", full: "Friday" },
  { index: 6, short: "Sat", full: "Saturday" },
] as const;

const INTERVAL_UNIT_ABBREVIATIONS: Record<string, string> = {
  minutes: "min",
  hours: "h",
  days: "d",
  weeks: "wk",
  months: "mo",
  years: "yr",
};

function intervalUnitAbbreviation(unit: string): string {
  return INTERVAL_UNIT_ABBREVIATIONS[unit] ?? unit;
}

function parsePreviewTime(time: string): { hour: number; minute: number } | null {
  const [hour, minute] = time.split(":").map(Number);
  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  return { hour, minute };
}

export function inferScheduleMode(
  queue?: Pick<QueueListItem, "intervalType" | "intervalValue" | "intervalUnit"> & { scheduleMode?: ScheduleMode | null },
): ScheduleMode {
  if (!queue) return "specific";
  if (queue.scheduleMode) return queue.scheduleMode;
  if (queue.intervalType === "variable") return "variable";
  return "fixed";
}

export function formatHour(hour: number): string {
  if (hour === 0) return "12a";
  if (hour < 12) return `${hour}a`;
  if (hour === 12) return "12p";
  return `${hour - 12}p`;
}

export function timeToHour(time: string): number {
  const [hour] = time.split(":");
  return Math.max(0, Math.min(23, Number(hour) || 0));
}

export function hourToTime(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function daySummary(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 5 && [1, 2, 3, 4, 5].every((day) => sorted.includes(day))) {
    return "Weekdays";
  }
  if (sorted.length === 7) return "Every day";
  if (sorted.length === 0) return "No days";
  return sorted
    .map((day) => WEEK_DAYS.find((item) => item.index === day)?.short ?? "")
    .filter(Boolean)
    .join(", ");
}

export function cadenceSummary(queue: QueueListItem): { primary: string; secondary: string; mono: string } {
  const days = daySummary(queue.daysOfWeek ?? []);
  const hours = [...(queue.hourSlots ?? [])].sort((a, b) => a - b);

  if (inferScheduleMode(queue) === "specific") {
    const times = hours.map(hourToTime);
    return {
      primary: times.length > 0 ? times.join(" · ") : "No times",
      secondary: days,
      mono: `${days} at ${times.join(", ") || "no times"}`,
    };
  }

  if (queue.intervalType === "variable") {
    return {
      primary: `${queue.intervalValue}${intervalUnitAbbreviation(queue.intervalUnit)} after last publish`,
      secondary: days,
      mono: `${queue.intervalValue} ${queue.intervalUnit} after last publish on ${days}`,
    };
  }

  return {
    primary: `Every ${queue.intervalValue}${intervalUnitAbbreviation(queue.intervalUnit)}`,
    secondary: days,
    mono: `Every ${queue.intervalValue} ${queue.intervalUnit} on ${days}`,
  };
}

export function nextPublishPreview(input: {
  mode: ScheduleMode;
  times: string[];
  days: number[];
  every: number;
  unit: string;
  hourWindows: number[];
  now?: Date;
  timeZone?: string;
}): Date[] {
  const now = input.now ?? new Date();
  const timeZone = input.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const localNow = DateTime.fromJSDate(now).setZone(timeZone);
  const results: Date[] = [];
  const days = new Set(input.days);
  const windows = [...input.hourWindows].sort((a, b) => a - b);
  const every = Math.max(1, Number(input.every) || 1);

  for (let offset = 0; offset < 14 && results.length < 5; offset += 1) {
    const date = localNow.plus({ days: offset });
    // App day indexes follow Date.getDay(): Sunday = 0 ... Saturday = 6.
    // Luxon uses ISO weekdays, so modulo maps Luxon Sunday 7 back to 0.
    const dayIndex = date.weekday % 7;
    if (!days.has(dayIndex)) continue;

    const candidates =
      input.mode === "specific"
        ? input.times.flatMap((time) => {
            const parsed = parsePreviewTime(time);
            return parsed ? [parsed] : [];
          })
        : windows
            // Minute cadences can fire multiple times inside an hour window; the compact
            // preview lists the first opportunity in each selected window.
            .filter((hour) => input.mode === "variable" || (input.unit === "hours" ? hour % every === 0 : true))
            .map((hour) => ({ hour, minute: 0 }));

    for (const candidate of candidates) {
      const publishAt = date.set({
        hour: candidate.hour,
        minute: candidate.minute,
        second: 0,
        millisecond: 0,
      });
      if (publishAt > localNow) results.push(publishAt.toJSDate());
      if (results.length === 5) break;
    }
  }

  return results.sort((a, b) => a.getTime() - b.getTime()).slice(0, 5);
}

export function formatPreviewDistance(date: Date, now = new Date()): string {
  return `in ${formatDistanceStrict(date, now, {
    addSuffix: false,
    unit: date.getTime() - now.getTime() > 36 * 60 * 60 * 1000 ? "day" : undefined,
  })}`;
}

export function formatNextRun(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return format(date, "EEE h:mmaaa");
}
