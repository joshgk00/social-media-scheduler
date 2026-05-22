import { describe, expect, it } from 'vitest';
import { cadenceSummary, formatPreviewDistance, inferScheduleMode, nextPublishPreview } from '../queue-schedule';

describe('inferScheduleMode', () => {
  it('treats legacy fixed one-hour queues as fixed interval queues', () => {
    expect(
      inferScheduleMode({
        intervalType: 'fixed',
        intervalValue: 1,
        intervalUnit: 'hours',
      }),
    ).toBe('fixed');
  });
});

describe('cadenceSummary', () => {
  it('uses unambiguous interval unit abbreviations', () => {
    const baseQueue = {
      scheduleMode: 'fixed',
      intervalType: 'fixed',
      daysOfWeek: [1, 2, 3],
      hourSlots: [9],
    };

    expect(cadenceSummary({
      ...baseQueue,
      intervalValue: 4,
      intervalUnit: 'minutes',
    } as never).primary).toBe('Every 4min');
    expect(cadenceSummary({
      ...baseQueue,
      intervalValue: 4,
      intervalUnit: 'months',
    } as never).primary).toBe('Every 4mo');
  });
});

describe('nextPublishPreview', () => {
  it('builds candidate slots in the requested timezone', () => {
    const preview = nextPublishPreview({
      mode: 'specific',
      times: ['08:00', '12:00'],
      days: [1],
      every: 1,
      unit: 'hours',
      hourWindows: [8, 12],
      now: new Date('2026-04-13T12:30:00.000Z'),
      timeZone: 'America/New_York',
    });

    expect(preview[0]?.toISOString()).toBe('2026-04-13T16:00:00.000Z');
  });

  it('maps Sunday from Luxon weekday 7 to the app day index 0', () => {
    const preview = nextPublishPreview({
      mode: 'specific',
      times: ['08:00'],
      days: [0],
      every: 1,
      unit: 'hours',
      hourWindows: [8],
      now: new Date('2026-04-12T11:00:00.000Z'),
      timeZone: 'America/New_York',
    });

    expect(preview[0]?.toISOString()).toBe('2026-04-12T12:00:00.000Z');
  });

  it('keeps Saturday on the app day index 6', () => {
    const preview = nextPublishPreview({
      mode: 'specific',
      times: ['08:00'],
      days: [6],
      every: 1,
      unit: 'hours',
      hourWindows: [8],
      now: new Date('2026-04-11T11:00:00.000Z'),
      timeZone: 'America/New_York',
    });

    expect(preview[0]?.toISOString()).toBe('2026-04-11T12:00:00.000Z');
  });

  it('filters fixed interval previews to aligned hour windows', () => {
    const preview = nextPublishPreview({
      mode: 'fixed',
      times: [],
      days: [1],
      every: 4,
      unit: 'hours',
      hourWindows: [8, 9, 12, 16],
      now: new Date('2026-04-13T12:30:00.000Z'),
      timeZone: 'America/New_York',
    });

    expect(preview.map((date) => date.toISOString()).slice(0, 2)).toEqual([
      '2026-04-13T16:00:00.000Z',
      '2026-04-13T20:00:00.000Z',
    ]);
  });

  it('uses every selected hour window for variable previews', () => {
    const preview = nextPublishPreview({
      mode: 'variable',
      times: [],
      days: [1],
      every: 4,
      unit: 'hours',
      hourWindows: [9, 12],
      now: new Date('2026-04-13T12:30:00.000Z'),
      timeZone: 'America/New_York',
    });

    expect(preview.map((date) => date.toISOString()).slice(0, 2)).toEqual([
      '2026-04-13T13:00:00.000Z',
      '2026-04-13T16:00:00.000Z',
    ]);
  });

  it('returns no previews when no days are selected', () => {
    const preview = nextPublishPreview({
      mode: 'specific',
      times: ['08:00'],
      days: [],
      every: 1,
      unit: 'hours',
      hourWindows: [8],
      now: new Date('2026-04-13T12:30:00.000Z'),
      timeZone: 'America/New_York',
    });

    expect(preview).toEqual([]);
  });

  it('does not turn malformed specific times into midnight previews', () => {
    const preview = nextPublishPreview({
      mode: 'specific',
      times: ['not-a-time', '08:00'],
      days: [1],
      every: 1,
      unit: 'hours',
      hourWindows: [8],
      now: new Date('2026-04-13T04:00:00.000Z'),
      timeZone: 'America/New_York',
    });

    expect(preview[0]?.toISOString()).toBe('2026-04-13T12:00:00.000Z');
    expect(preview.map((date) => date.toISOString())).not.toContain(
      '2026-04-13T04:00:00.000Z',
    );
  });
});

describe('formatPreviewDistance', () => {
  it('formats sub-day previews relative to the provided reference date', () => {
    expect(
      formatPreviewDistance(
        new Date('2026-04-13T16:30:00.000Z'),
        new Date('2026-04-13T12:30:00.000Z'),
      ),
    ).toBe('in 4 hours');
  });

  it('uses day precision after the 36-hour threshold', () => {
    expect(
      formatPreviewDistance(
        new Date('2026-04-15T12:30:00.000Z'),
        new Date('2026-04-13T12:30:00.000Z'),
      ),
    ).toBe('in 2 days');
  });
});
