import { Router } from 'express';
import { requireAuth } from '../middleware/auth-guard.js';

export function createSystemRouter(): Router {
  const router = Router();

  router.get('/api/system/smtp-status', requireAuth, (_req, res) => {
    const isConfigured = Boolean(
      process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.SMTP_FROM,
    );
    res.json({ configured: isConfigured });
  });

  return router;
}
