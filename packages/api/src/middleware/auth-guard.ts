import type { Request, Response, NextFunction } from 'express';

declare module 'express-session' {
  interface SessionData {
    userId: string;
    pendingTwoFactor?: boolean;
    pendingUserId?: string;
    twoFactorExpiresAt?: number;
    pendingTotpSecret?: string;
    recoveryEmail?: string;
    recoveryVerified?: boolean;
    recoveryVerifiedAt?: number;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (req.session.pendingTwoFactor === true) {
    res.status(401).json({ error: 'Two-factor authentication required' });
    return;
  }

  next();
}
