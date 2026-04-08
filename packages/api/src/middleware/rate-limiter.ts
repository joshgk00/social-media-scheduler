import rateLimit from 'express-rate-limit';

// Per-IP rate limiting. For this single-user app, per-IP and per-account are equivalent.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many failed attempts. Try again in 15 minutes.' },
  skipSuccessfulRequests: true,
});

export const recoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many failed attempts. Try again in 15 minutes.' },
  skipSuccessfulRequests: true,
});
