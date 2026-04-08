import { Router } from 'express';
import { loginSchema, totpVerifySchema } from '@sms/shared';
import type { Redis } from 'ioredis';
import type { Db } from '@sms/db';

import { findUserByEmail, verifyPassword, getUserById, updateLastLogin } from '../services/auth.service.js';
import { verifyTotpCode } from '../services/totp.service.js';
import { requireAuth } from '../middleware/auth-guard.js';
import { loginLimiter } from '../middleware/rate-limiter.js';
import { generateCsrfToken } from '../middleware/csrf.js';

interface AuthDependencies {
  db: Db;
  redis: Redis;
}

export function createAuthRouter({ db }: AuthDependencies) {
  const router = Router();

  router.get('/api/auth/csrf-token', (req, res) => {
    const token = generateCsrfToken(req, res);
    res.json({ token });
  });

  router.post('/api/auth/login', loginLimiter, async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const { email, password } = parsed.data;
    const user = await findUserByEmail(db, email);

    if (!user) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const valid = await verifyPassword(user.passwordHash, password);
    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    if (user.totpEnabled) {
      // Pending-2FA session lifecycle:
      // 1. Regenerate session to prevent fixation
      // 2. Set ONLY pending flags (no userId)
      // 3. requireAuth will reject this session for all protected routes
      // 4. 5-minute expiry for the 2FA step
      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => (err ? reject(err) : resolve()));
      });
      req.session.pendingTwoFactor = true;
      req.session.pendingUserId = user.id;
      req.session.twoFactorExpiresAt = Date.now() + 5 * 60 * 1000;
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => (err ? reject(err) : resolve()));
      });
      res.json({ requiresTwoFactor: true });
      return;
    }

    // Non-2FA login: regenerate session, set userId
    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });
    req.session.userId = user.id;
    delete req.session.pendingTwoFactor;
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });
    updateLastLogin(db, user.id).catch(() => {});
    res.json({ requiresTwoFactor: false });
  });

  router.post('/api/auth/login/verify-2fa', loginLimiter, async (req, res) => {
    const parsed = totpVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const { code } = parsed.data;

    if (!req.session.pendingTwoFactor || !req.session.pendingUserId) {
      res.status(401).json({ error: 'No pending two-factor authentication.' });
      return;
    }

    if (req.session.twoFactorExpiresAt && Date.now() > req.session.twoFactorExpiresAt) {
      req.session.destroy(() => {});
      res.status(401).json({ error: 'Session expired. Please sign in again.' });
      return;
    }

    const user = await getUserById(db, req.session.pendingUserId);
    if (!user || !user.totpEnabled || !user.totpSecret) {
      req.session.destroy(() => {});
      res.status(401).json({ error: 'Invalid authentication state.' });
      return;
    }

    const valid = verifyTotpCode(user.totpSecret, code);
    if (!valid) {
      res.status(401).json({ error: 'Invalid code. Please try again.' });
      return;
    }

    // Successful 2FA: clear pending state, set userId
    delete req.session.pendingTwoFactor;
    delete req.session.pendingUserId;
    delete req.session.twoFactorExpiresAt;
    req.session.userId = user.id;
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });
    updateLastLogin(db, user.id).catch(() => {});
    res.json({ success: true });
  });

  router.post('/api/auth/logout', requireAuth, (req, res) => {
    req.session.destroy(() => {});
    res.clearCookie('sms.sid');
    res.json({ success: true });
  });

  router.get('/api/auth/me', requireAuth, async (req, res) => {
    const user = await getUserById(db, req.session.userId!);
    if (!user) {
      res.status(401).json({ error: 'User not found.' });
      return;
    }

    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImagePath: user.profileImagePath,
      timezone: user.timezone,
      dateFormat: user.dateFormat,
      entriesPerPage: user.entriesPerPage,
      totpEnabled: user.totpEnabled,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    });
  });

  return router;
}
