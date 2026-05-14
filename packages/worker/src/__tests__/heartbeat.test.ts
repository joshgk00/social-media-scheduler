import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startHeartbeat, stopHeartbeat } from '../heartbeat.js';

function createMockRedis() {
  return {
    set: vi.fn().mockResolvedValue('OK'),
  } as any;
}

describe('Worker Heartbeat', () => {
  let intervalId: NodeJS.Timeout;

  afterEach(() => {
    if (intervalId) stopHeartbeat(intervalId);
  });

  it('calls redis.set with worker:heartbeat key immediately', () => {
    const redis = createMockRedis();
    intervalId = startHeartbeat(redis);

    expect(redis.set).toHaveBeenCalledTimes(1);
    expect(redis.set.mock.calls[0][0]).toBe('worker:heartbeat');
  });

  it('heartbeat value is a numeric timestamp', () => {
    const redis = createMockRedis();
    intervalId = startHeartbeat(redis);

    const value = redis.set.mock.calls[0][1];
    const parsed = parseInt(value, 10);
    expect(parsed).not.toBeNaN();
    expect(parsed).toBeGreaterThan(0);
    expect(parsed.toString()).toBe(value);
  });

  it('redis key has TTL set via EX parameter', () => {
    const redis = createMockRedis();
    intervalId = startHeartbeat(redis);

    const call = redis.set.mock.calls[0];
    expect(call[2]).toBe('EX');
    expect(typeof call[3]).toBe('number');
    expect(call[3]).toBeGreaterThan(0);
  });
});
