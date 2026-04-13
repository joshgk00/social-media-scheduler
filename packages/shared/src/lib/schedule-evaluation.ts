import { DateTime, type DurationLikeObject } from 'luxon';

type DurationUnit = keyof DurationLikeObject;

export function isWithinHourWindow(
  hourSlots: number[],
  userTimezone: string,
  now?: DateTime,
): boolean {
  const localNow = (now ?? DateTime.utc()).setZone(userTimezone);
  return hourSlots.includes(localNow.hour);
}

export function isDayOfWeekAllowed(
  daysOfWeek: number[],
  userTimezone: string,
  now?: DateTime,
): boolean {
  const localNow = (now ?? DateTime.utc()).setZone(userTimezone);
  const dow = localNow.weekday === 7 ? 0 : localNow.weekday;
  return daysOfWeek.includes(dow);
}

export function hasIntervalElapsed(
  intervalType: 'fixed' | 'variable',
  intervalValue: number,
  intervalUnit: string,
  lastPublishedAt: DateTime | null,
  userTimezone: string,
  now?: DateTime,
): boolean {
  if (lastPublishedAt === null) return true;

  const unit = intervalUnit as DurationUnit;
  const localNow = (now ?? DateTime.utc()).setZone(userTimezone);
  const localLast = lastPublishedAt.setZone(userTimezone);

  if (intervalType === 'variable') {
    const elapsed = localNow.diff(localLast, unit).as(unit);
    return elapsed >= intervalValue;
  }

  const startOfDayNow = localNow.startOf('day');
  const startOfDayLast = localLast.startOf('day');

  const slotNow = Math.floor(localNow.diff(startOfDayNow, unit).as(unit) / intervalValue);
  const dayDiffInUnits = startOfDayNow.diff(startOfDayLast, unit).as(unit);
  const slotLast = Math.floor(localLast.diff(startOfDayLast, unit).as(unit) / intervalValue);

  if (dayDiffInUnits > 0) return true;
  return slotNow !== slotLast;
}

export function isWithinSeasonalWindow(
  seasonalStart: string | null,
  seasonalEnd: string | null,
  seasonalRepeat: boolean,
  now?: DateTime,
): boolean {
  if (seasonalStart === null || seasonalEnd === null) return true;

  const currentNow = now ?? DateTime.utc();
  const startMonth = parseInt(seasonalStart.slice(0, 2), 10);
  const startDay = parseInt(seasonalStart.slice(3, 5), 10);
  const endMonth = parseInt(seasonalEnd.slice(0, 2), 10);
  const endDay = parseInt(seasonalEnd.slice(3, 5), 10);

  const currentMonthDay = currentNow.month * 100 + currentNow.day;
  const startMonthDay = startMonth * 100 + startDay;
  const endMonthDay = endMonth * 100 + endDay;

  if (startMonthDay <= endMonthDay) {
    return currentMonthDay >= startMonthDay && currentMonthDay <= endMonthDay;
  }

  return currentMonthDay >= startMonthDay || currentMonthDay <= endMonthDay;
}

interface QueueScheduleConfig {
  intervalType: string;
  intervalValue: number;
  intervalUnit: string;
  hourSlots: number[];
  daysOfWeek: number[];
  lastPublishedAt: Date | null;
  startDate: Date | null;
}

export function calculateNextRunAt(
  queue: QueueScheduleConfig,
  userTimezone: string,
  now?: DateTime,
): DateTime | null {
  const localNow = (now ?? DateTime.utc()).setZone(userTimezone);

  const startDateTime = queue.startDate
    ? DateTime.fromJSDate(queue.startDate).setZone(userTimezone)
    : null;
  if (startDateTime && localNow < startDateTime) {
    return findNextEligibleSlot(startDateTime, queue, userTimezone);
  }

  return findNextEligibleSlot(localNow, queue, userTimezone);
}

function findNextEligibleSlot(
  from: DateTime,
  queue: QueueScheduleConfig,
  userTimezone: string,
): DateTime | null {
  const unit = queue.intervalUnit as DurationUnit;
  const sortedSlots = [...queue.hourSlots].sort((a, b) => a - b);

  for (let dayOffset = 0; dayOffset < 365; dayOffset++) {
    const checkDay = from.plus({ days: dayOffset }).startOf('day');
    const dow = checkDay.weekday === 7 ? 0 : checkDay.weekday;

    if (!queue.daysOfWeek.includes(dow)) continue;

    for (const hour of sortedSlots) {
      const slot = checkDay.set({ hour, minute: 0, second: 0, millisecond: 0 });

      if (slot <= from) continue;

      if (queue.lastPublishedAt) {
        const lastPub = DateTime.fromJSDate(queue.lastPublishedAt).setZone(userTimezone);
        const elapsed = slot.diff(lastPub, unit).as(unit);
        if (elapsed < queue.intervalValue) continue;
      }

      return slot.toUTC();
    }
  }

  return null;
}
