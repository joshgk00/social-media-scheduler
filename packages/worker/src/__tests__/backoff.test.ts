import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Job } from 'bullmq';
import { buildBackoffStrategy, tokenRefreshBackoffStrategy } from '../backoff.js';
import { buildApiResponseError } from './helpers/mock-twitter.js';

const fakeJob = {} as Job;

describe('buildBackoffStrategy', () => {
  const strategy = buildBackoffStrategy();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-09T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('first retry returns 30 seconds', () => {
    const delay = strategy(1, 'publishBackoff', new Error('network blip'), fakeJob);
    expect(delay).toBe(30_000);
  });

  it('second retry returns 5 minutes', () => {
    const delay = strategy(2, 'publishBackoff', new Error('network blip'), fakeJob);
    expect(delay).toBe(5 * 60_000);
  });

  it('third retry returns 30 minutes', () => {
    const delay = strategy(3, 'publishBackoff', new Error('network blip'), fakeJob);
    expect(delay).toBe(30 * 60_000);
  });

  it('fourth and beyond retries cap at 30 minutes', () => {
    const delay = strategy(4, 'publishBackoff', new Error('network blip'), fakeJob);
    const delayFive = strategy(5, 'publishBackoff', new Error('network blip'), fakeJob);
    expect(delay).toBe(30 * 60_000);
    expect(delayFive).toBe(30 * 60_000);
  });

  it('rate-limit error with future reset honors the reset timestamp', () => {
    const resetEpoch = Math.floor(Date.now() / 1000) + 600; // 10 minutes from now
    const err = buildApiResponseError({
      httpStatus: 429,
      isRateLimit: true,
      rateLimitResetEpoch: resetEpoch,
    });
    const delay = strategy(1, 'publishBackoff', err, fakeJob);
    // 600 seconds = 600_000 ms, under the 30-minute cap
    expect(delay).toBe(600_000);
  });

  it('rate-limit error with future reset BEYOND 30 min is clamped to 30 min', () => {
    const resetEpoch = Math.floor(Date.now() / 1000) + 3600; // 60 minutes from now
    const err = buildApiResponseError({
      httpStatus: 429,
      isRateLimit: true,
      rateLimitResetEpoch: resetEpoch,
    });
    const delay = strategy(1, 'publishBackoff', err, fakeJob);
    expect(delay).toBe(30 * 60_000);
  });

  it('rate-limit error with reset in the past falls back to the schedule', () => {
    const resetEpoch = Math.floor(Date.now() / 1000) - 60; // 1 minute ago
    const err = buildApiResponseError({
      httpStatus: 429,
      isRateLimit: true,
      rateLimitResetEpoch: resetEpoch,
    });
    const delay = strategy(2, 'publishBackoff', err, fakeJob);
    expect(delay).toBe(5 * 60_000);
  });

  it('non-rate-limit ApiResponseError uses the schedule', () => {
    const err = buildApiResponseError({ httpStatus: 500, detail: 'boom' });
    const delay = strategy(1, 'publishBackoff', err, fakeJob);
    expect(delay).toBe(30_000);
  });
});

describe('tokenRefreshBackoffStrategy', () => {
  it('first retry returns 5 minutes', () => {
    expect(tokenRefreshBackoffStrategy(1, new Error('boom'))).toBe(5 * 60_000);
  });

  it('second retry returns 30 minutes', () => {
    expect(tokenRefreshBackoffStrategy(2, new Error('boom'))).toBe(30 * 60_000);
  });

  it('third retry returns 2 hours', () => {
    expect(tokenRefreshBackoffStrategy(3, new Error('boom'))).toBe(120 * 60_000);
  });

  it('fourth and beyond retries cap at 2 hours', () => {
    expect(tokenRefreshBackoffStrategy(4, new Error('boom'))).toBe(120 * 60_000);
    expect(tokenRefreshBackoffStrategy(10, new Error('boom'))).toBe(120 * 60_000);
  });
});
