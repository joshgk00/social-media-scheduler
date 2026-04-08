import { Router } from 'express';
import argon2 from 'argon2';
import { recoveryVerifyEmailSchema, recoveryVerifyAnswersSchema, recoveryResetPasswordSchema, createLogger } from '@sms/shared';
import type { Redis } from 'ioredis';
import type { Db } from '@sms/db';

import { findUserByEmail, hashPassword, getSecurityQuestions, resetPasswordAndDisableTotp } from '../services/auth.service.js';
import { invalidateAllSessions } from '../services/session.service.js';
import { recoveryLimiter } from '../middleware/rate-limiter.js';

const RECOVERY_STATE_TIMEOUT_MS = 10 * 60 * 1000;
const logger = createLogger('recovery-routes');

interface RecoveryDependencies {
  db: Db;
  redis: Redis;
}

export function createRecoveryRouter({ db, redis }: RecoveryDependencies) {
  const router = Router();

  router.post('/api/auth/recover/verify-email', recoveryLimiter, async (req, res) => {
    const parsed = recoveryVerifyEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const { email } = parsed.data;
    const user = await findUserByEmail(db, email);

    if (!user) {
      res.json({ questionsConfigured: false });
      return;
    }

    const questions = await getSecurityQuestions(db, user.id);

    if (questions.length === 0) {
      res.json({ questionsConfigured: false });
      return;
    }

    req.session.recoveryEmail = email;
    res.json({
      questionsConfigured: true,
      questionIndices: questions.map(q => q.questionIndex),
    });
  });

  router.post('/api/auth/recover/verify-answers', recoveryLimiter, async (req, res) => {
    const parsed = recoveryVerifyAnswersSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    if (!req.session.recoveryEmail) {
      res.status(401).json({ error: 'Recovery session expired. Start over.' });
      return;
    }

    const user = await findUserByEmail(db, req.session.recoveryEmail);
    if (!user) {
      res.status(401).json({ error: 'Incorrect answers. Please try again.' });
      return;
    }

    const questions = await getSecurityQuestions(db, user.id);

    if (questions.length !== 3) {
      res.status(401).json({ error: 'Incorrect answers. Please try again.' });
      return;
    }

    const { answers } = parsed.data;

    // Sort questions by questionIndex to match answer order
    questions.sort((a, b) => a.questionIndex - b.questionIndex);

    try {
      // Verify all answers concurrently -- avoids timing side-channel on early exit
      // and cuts wall-clock time from ~3x argon2_cost to ~1x argon2_cost
      const results = await Promise.all(
        questions.map((q, i) => {
          const normalizedAnswer = answers[i].toLowerCase().trim();
          return argon2.verify(q.answerHash, normalizedAnswer);
        }),
      );
      const areAnswersCorrect = results.every(Boolean);

      if (!areAnswersCorrect) {
        res.status(401).json({ error: 'Incorrect answers. Please try again.' });
        return;
      }
    } catch (err) {
      logger.error({ err, recoveryStep: 'verify-answers', email: req.session.recoveryEmail }, 'Recovery answer verification failed');
      throw err;
    }

    req.session.recoveryVerified = true;
    req.session.recoveryVerifiedAt = Date.now();
    res.json({ verified: true });
  });

  router.post('/api/auth/recover/reset-password', recoveryLimiter, async (req, res) => {
    const parsed = recoveryResetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    if (req.session.recoveryVerified !== true) {
      res.status(401).json({ error: 'Recovery not verified. Start over.' });
      return;
    }

    // Check recovery state expiry (10-minute window since answers were verified)
    if (
      !req.session.recoveryVerifiedAt ||
      Date.now() - req.session.recoveryVerifiedAt > RECOVERY_STATE_TIMEOUT_MS
    ) {
      delete req.session.recoveryVerified;
      delete req.session.recoveryVerifiedAt;
      delete req.session.recoveryEmail;
      res.status(401).json({ error: 'Recovery session expired. Start over.' });
      return;
    }

    const user = await findUserByEmail(db, req.session.recoveryEmail!);
    if (!user) {
      res.status(401).json({ error: 'Recovery not verified. Start over.' });
      return;
    }

    try {
      const { newPassword } = parsed.data;
      const passwordHash = await hashPassword(newPassword);

      await resetPasswordAndDisableTotp(db, user.id, passwordHash);

      // D-16: Invalidate all sessions after password reset
      await invalidateAllSessions(redis);
    } catch (err) {
      logger.error({ err, recoveryStep: 'reset-password', email: req.session.recoveryEmail }, 'Recovery password reset failed');
      throw err;
    }

    // D-13: Recovery disables 2FA. This is intentional -- security questions serve
    // as the alternative auth factor. D-20 (password + TOTP) applies only to
    // voluntary 2FA disable via settings.

    // Clear recovery state
    delete req.session.recoveryVerified;
    delete req.session.recoveryVerifiedAt;
    delete req.session.recoveryEmail;

    res.json({ success: true });
  });

  return router;
}
