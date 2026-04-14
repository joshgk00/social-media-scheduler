import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import {
  isWithinHourWindow,
  isDayOfWeekAllowed,
  hasIntervalElapsed,
  isWithinSeasonalWindow,
  calculateNextRunAt,
} from '../lib/schedule-evaluation.js';

describe('Schedule Evaluation Functions', () => {
  describe('isWithinHourWindow', () => {
    it('returns true when current hour matches a slot', () => {
      const now = DateTime.fromISO('2026-04-13T09:30:00', { zone: 'America/New_York' });
      expect(isWithinHourWindow([9, 12, 15], 'America/New_York', now)).toBe(true);
    });

    it('returns false when current hour does not match any slot', () => {
      const now = DateTime.fromISO('2026-04-13T10:30:00', { zone: 'America/New_York' });
      expect(isWithinHourWindow([9, 12, 15], 'America/New_York', now)).toBe(false);
    });

    it('handles UTC time converted to user timezone', () => {
      // 14:00 UTC = 10:00 AM Eastern (EDT, UTC-4)
      const nowUtc = DateTime.fromISO('2026-04-13T14:00:00Z');
      expect(isWithinHourWindow([10], 'America/New_York', nowUtc)).toBe(true);
      expect(isWithinHourWindow([14], 'America/New_York', nowUtc)).toBe(false);
    });

    it('handles DST spring-forward: hour 2 does not exist in America/New_York', () => {
      // On March 8 2026, 2:00 AM EST -> 3:00 AM EDT
      // At 2:30 AM EST, the clock jumps to 3:30 AM EDT, so hour 2 never occurs
      const springForward = DateTime.fromISO('2026-03-08T07:30:00Z'); // 3:30 AM EDT
      expect(isWithinHourWindow([2], 'America/New_York', springForward)).toBe(false);
      expect(isWithinHourWindow([3], 'America/New_York', springForward)).toBe(true);
    });

    it('handles DST fall-back: hour 1 repeats in America/New_York', () => {
      // On Nov 1 2026, 2:00 AM EDT -> 1:00 AM EST (hour 1 repeats)
      const fallBack = DateTime.fromISO('2026-11-01T06:30:00Z'); // 1:30 AM EST
      expect(isWithinHourWindow([1], 'America/New_York', fallBack)).toBe(true);
    });

    it('works with edge hour values', () => {
      const earlyMorning = DateTime.fromISO('2026-04-13T06:00:00', { zone: 'America/New_York' });
      expect(isWithinHourWindow([6], 'America/New_York', earlyMorning)).toBe(true);
      const lateNight = DateTime.fromISO('2026-04-13T23:45:00', { zone: 'America/New_York' });
      expect(isWithinHourWindow([23], 'America/New_York', lateNight)).toBe(true);
    });
  });

  describe('isDayOfWeekAllowed', () => {
    it('returns true for weekday when weekdays are allowed (1=Mon..5=Fri)', () => {
      // Monday April 13, 2026
      const monday = DateTime.fromISO('2026-04-13T12:00:00', { zone: 'America/New_York' });
      expect(isDayOfWeekAllowed([1, 2, 3, 4, 5], 'America/New_York', monday)).toBe(true);
    });

    it('returns false for Sunday when only weekdays are allowed', () => {
      // Sunday April 12, 2026
      const sunday = DateTime.fromISO('2026-04-12T12:00:00', { zone: 'America/New_York' });
      expect(isDayOfWeekAllowed([1, 2, 3, 4, 5], 'America/New_York', sunday)).toBe(false);
    });

    it('maps Luxon weekday 7 (Sunday) to SocialOomph convention 0', () => {
      // Sunday April 12, 2026 -- Luxon weekday is 7
      const sunday = DateTime.fromISO('2026-04-12T12:00:00', { zone: 'America/New_York' });
      expect(isDayOfWeekAllowed([0], 'America/New_York', sunday)).toBe(true);
    });

    it('handles Saturday (6)', () => {
      // Saturday April 11, 2026
      const saturday = DateTime.fromISO('2026-04-11T12:00:00', { zone: 'America/New_York' });
      expect(isDayOfWeekAllowed([6], 'America/New_York', saturday)).toBe(true);
    });

    it('handles timezone where UTC date differs from local date', () => {
      // 2026-04-14 01:00 UTC = 2026-04-13 21:00 EDT (still Monday in ET)
      const utcTuesday = DateTime.fromISO('2026-04-14T01:00:00Z');
      // In New York, this is still Monday (day 1)
      expect(isDayOfWeekAllowed([1], 'America/New_York', utcTuesday)).toBe(true);
      // In UTC, this would be Tuesday (day 2)
      expect(isDayOfWeekAllowed([2], 'America/New_York', utcTuesday)).toBe(false);
    });
  });

  describe('hasIntervalElapsed', () => {
    it('returns true when lastPublishedAt is null (first publish)', () => {
      expect(hasIntervalElapsed('fixed', 4, 'hours', null, 'America/New_York')).toBe(true);
    });

    it('returns true for variable interval when enough time has passed', () => {
      const lastPub = DateTime.fromISO('2026-04-13T08:00:00', { zone: 'America/New_York' });
      const now = DateTime.fromISO('2026-04-13T12:00:00', { zone: 'America/New_York' });
      expect(hasIntervalElapsed('variable', 4, 'hours', lastPub, 'America/New_York', now)).toBe(true);
    });

    it('returns false for variable interval when not enough time has passed', () => {
      const lastPub = DateTime.fromISO('2026-04-13T10:00:00', { zone: 'America/New_York' });
      const now = DateTime.fromISO('2026-04-13T12:00:00', { zone: 'America/New_York' });
      expect(hasIntervalElapsed('variable', 4, 'hours', lastPub, 'America/New_York', now)).toBe(false);
    });

    it('returns true for fixed interval across different days', () => {
      const lastPub = DateTime.fromISO('2026-04-12T20:00:00', { zone: 'America/New_York' });
      const now = DateTime.fromISO('2026-04-13T09:00:00', { zone: 'America/New_York' });
      expect(hasIntervalElapsed('fixed', 4, 'hours', lastPub, 'America/New_York', now)).toBe(true);
    });

    it('handles minutes interval unit', () => {
      const lastPub = DateTime.fromISO('2026-04-13T12:00:00', { zone: 'America/New_York' });
      const now = DateTime.fromISO('2026-04-13T12:30:00', { zone: 'America/New_York' });
      expect(hasIntervalElapsed('variable', 30, 'minutes', lastPub, 'America/New_York', now)).toBe(true);
    });

    it('handles days interval unit', () => {
      const lastPub = DateTime.fromISO('2026-04-10T12:00:00', { zone: 'America/New_York' });
      const now = DateTime.fromISO('2026-04-13T12:00:00', { zone: 'America/New_York' });
      expect(hasIntervalElapsed('variable', 3, 'days', lastPub, 'America/New_York', now)).toBe(true);
    });

    it('returns false for days interval when not enough days', () => {
      const lastPub = DateTime.fromISO('2026-04-11T12:00:00', { zone: 'America/New_York' });
      const now = DateTime.fromISO('2026-04-13T12:00:00', { zone: 'America/New_York' });
      expect(hasIntervalElapsed('variable', 3, 'days', lastPub, 'America/New_York', now)).toBe(false);
    });
  });

  describe('isWithinSeasonalWindow', () => {
    it('returns true when both start and end are null (no restriction)', () => {
      expect(isWithinSeasonalWindow(null, null)).toBe(true);
    });

    it('returns true when date is within a standard seasonal window', () => {
      const november = DateTime.fromISO('2026-11-15T12:00:00Z');
      expect(isWithinSeasonalWindow('11-01', '12-31', november)).toBe(true);
    });

    it('returns false when date is outside a standard seasonal window', () => {
      const march = DateTime.fromISO('2026-03-15T12:00:00Z');
      expect(isWithinSeasonalWindow('11-01', '12-31', march)).toBe(false);
    });

    it('handles cross-year seasonal window (Dec-Jan)', () => {
      const december = DateTime.fromISO('2026-12-15T12:00:00Z');
      expect(isWithinSeasonalWindow('12-01', '01-31', december)).toBe(true);

      const january = DateTime.fromISO('2026-01-15T12:00:00Z');
      expect(isWithinSeasonalWindow('12-01', '01-31', january)).toBe(true);

      const march = DateTime.fromISO('2026-03-15T12:00:00Z');
      expect(isWithinSeasonalWindow('12-01', '01-31', march)).toBe(false);
    });

    it('handles exact boundary dates', () => {
      const startDate = DateTime.fromISO('2026-06-01T12:00:00Z');
      expect(isWithinSeasonalWindow('06-01', '08-31', startDate)).toBe(true);

      const endDate = DateTime.fromISO('2026-08-31T12:00:00Z');
      expect(isWithinSeasonalWindow('06-01', '08-31', endDate)).toBe(true);

      const dayBefore = DateTime.fromISO('2026-05-31T12:00:00Z');
      expect(isWithinSeasonalWindow('06-01', '08-31', dayBefore)).toBe(false);

      const dayAfter = DateTime.fromISO('2026-09-01T12:00:00Z');
      expect(isWithinSeasonalWindow('06-01', '08-31', dayAfter)).toBe(false);
    });
  });

  describe('calculateNextRunAt', () => {
    it('finds the next eligible hour slot on the current day', () => {
      const now = DateTime.fromISO('2026-04-13T08:30:00', { zone: 'America/New_York' });
      const result = calculateNextRunAt(
        {
          intervalType: 'fixed',
          intervalValue: 4,
          intervalUnit: 'hours',
          hourSlots: [9, 12, 15, 18],
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          lastPublishedAt: null,
          startDate: null,
        },
        'America/New_York',
        now,
      );
      expect(result).not.toBeNull();
      expect(result!.setZone('America/New_York').hour).toBe(9);
    });

    it('skips to next allowed day when current day is not allowed', () => {
      // Sunday April 12, 2026 at 20:00 — weekdays only
      const sundayEvening = DateTime.fromISO('2026-04-12T20:00:00', { zone: 'America/New_York' });
      const result = calculateNextRunAt(
        {
          intervalType: 'fixed',
          intervalValue: 4,
          intervalUnit: 'hours',
          hourSlots: [9],
          daysOfWeek: [1, 2, 3, 4, 5], // weekdays only
          lastPublishedAt: null,
          startDate: null,
        },
        'America/New_York',
        sundayEvening,
      );
      expect(result).not.toBeNull();
      // Should be Monday April 13 at 9am
      const local = result!.setZone('America/New_York');
      expect(local.weekday).toBe(1); // Monday
      expect(local.hour).toBe(9);
    });

    it('respects interval elapsed from last publish', () => {
      const now = DateTime.fromISO('2026-04-13T09:30:00', { zone: 'America/New_York' });
      const lastPub = new Date('2026-04-13T13:00:00Z'); // 9am ET
      const result = calculateNextRunAt(
        {
          intervalType: 'variable',
          intervalValue: 4,
          intervalUnit: 'hours',
          hourSlots: [9, 12, 15, 18],
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          lastPublishedAt: lastPub,
          startDate: null,
        },
        'America/New_York',
        now,
      );
      expect(result).not.toBeNull();
      // 9am slot already passed and interval from lastPub at 9am means next at 15 (9+4=13, but 12 < 13 so skip, 15 >= 13)
      // Actually: lastPub at 9am ET, interval 4 hours, so next eligible >= 1pm. slot 12 is noon < 1pm, slot 15 is 3pm >= 1pm
      expect(result!.setZone('America/New_York').hour).toBe(15);
    });

    it('respects startDate by not scheduling before it', () => {
      const now = DateTime.fromISO('2026-04-10T12:00:00', { zone: 'America/New_York' });
      const startDate = new Date('2026-04-15T04:00:00Z'); // midnight ET April 15
      const result = calculateNextRunAt(
        {
          intervalType: 'fixed',
          intervalValue: 4,
          intervalUnit: 'hours',
          hourSlots: [9, 12, 15],
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          lastPublishedAt: null,
          startDate,
        },
        'America/New_York',
        now,
      );
      expect(result).not.toBeNull();
      const local = result!.setZone('America/New_York');
      expect(local.day).toBe(15);
      expect(local.hour).toBe(9);
    });

    it('returns null when no eligible slot exists within 365 days (impossible scenario)', () => {
      const now = DateTime.fromISO('2026-04-13T12:00:00', { zone: 'America/New_York' });
      const result = calculateNextRunAt(
        {
          intervalType: 'fixed',
          intervalValue: 4,
          intervalUnit: 'hours',
          hourSlots: [9],
          daysOfWeek: [], // no days allowed
          lastPublishedAt: null,
          startDate: null,
        },
        'America/New_York',
        now,
      );
      expect(result).toBeNull();
    });
  });
});
