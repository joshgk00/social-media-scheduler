import { addDays, format, formatDistanceToNowStrict, isAfter } from "date-fns";
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

export function inferScheduleMode(queue?: Pick<QueueListItem, "intervalType" | "intervalValue" | "intervalUnit">): ScheduleMode {
  if (!queue) return "specific";
  if (queue.intervalType === "variable") return "variable";
  if (queue.intervalValue === 1 && queue.intervalUnit === "hours") return "specific";
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
      primary: `${queue.intervalValue}${queue.intervalUnit[0]} after last publish`,
      secondary: days,
      mono: `${queue.intervalValue} ${queue.intervalUnit} after last publish on ${days}`,
    };
  }

  return {
    primary: `Every ${queue.intervalValue}${queue.intervalUnit[0]}`,
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
}): Date[] {
  const now = input.now ?? new Date();
  const results: Date[] = [];
  const days = new Set(input.days);
  const windows = [...input.hourWindows].sort((a, b) => a - b);
  const every = Math.max(1, Number(input.every) || 1);

  for (let offset = 0; offset < 14 && results.length < 5; offset += 1) {
    const date = addDays(now, offset);
    if (!days.has(date.getDay())) continue;

    const candidates =
      input.mode === "specific"
        ? input.times.map((time) => {
            const [hour, minute] = time.split(":").map(Number);
            return { hour: hour || 0, minute: minute || 0 };
          })
        : windows
            .filter((hour) => input.mode === "variable" || (input.unit === "hours" ? hour % every === 0 : true))
            .map((hour) => ({ hour, minute: 0 }));

    for (const candidate of candidates) {
      const publishAt = new Date(date);
      publishAt.setHours(candidate.hour, candidate.minute, 0, 0);
      if (isAfter(publishAt, now)) results.push(publishAt);
      if (results.length === 5) break;
    }
  }

  return results.sort((a, b) => a.getTime() - b.getTime()).slice(0, 5);
}

export function formatPreviewDistance(date: Date, now = new Date()): string {
  return `in ${formatDistanceToNowStrict(date, { addSuffix: false, unit: date.getTime() - now.getTime() > 36 * 60 * 60 * 1000 ? "day" : undefined })}`;
}

export function formatNextRun(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return format(date, "EEE h:mmaaa");
}
