import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth-guard.js';

function createMockRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe('requireAuth middleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
  });

  it('returns 401 when req has no session at all', () => {
    const req = {} as Request;
    const res = createMockRes();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when session exists but no userId', () => {
    const req = { session: {} } as Request;
    const res = createMockRes();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when session has pendingTwoFactor=true and no userId', () => {
    const req = { session: { pendingTwoFactor: true } } as unknown as Request;
    const res = createMockRes();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when session has userId AND pendingTwoFactor=true (pending 2FA takes priority)', () => {
    const req = {
      session: { userId: 'abc', pendingTwoFactor: true },
    } as unknown as Request;
    const res = createMockRes();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Two-factor authentication required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when session has userId and pendingTwoFactor is false', () => {
    const req = {
      session: { userId: 'abc', pendingTwoFactor: false },
    } as unknown as Request;
    const res = createMockRes();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('calls next() when session has userId and pendingTwoFactor is undefined', () => {
    const req = {
      session: { userId: 'abc' },
    } as unknown as Request;
    const res = createMockRes();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
