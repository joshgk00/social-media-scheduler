import rateLimit, { type Options } from 'express-rate-limit';

// Per-IP rate limiting. For this single-user app, per-IP and per-account are equivalent.
function createLimiter(overrides: Partial<Options>) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    standardHeaders: true,
    legacyHeaders: false,
    ...overrides,
  });
}

export const loginLimiter = createLimiter({
  max: 5,
  message: { error: 'Too many failed attempts. Try again in 15 minutes.' },
  skipSuccessfulRequests: true,
});

export const recoveryLimiter = createLimiter({
  max: 5,
  message: { error: 'Too many failed attempts. Try again in 15 minutes.' },
  skipSuccessfulRequests: true,
});

export const profileLimiter = createLimiter({
  max: 10,
  message: { error: 'Too many profile creation attempts. Try again in 15 minutes.' },
});

export const queueMutationLimiter = createLimiter({
  max: 60,
  message: { error: 'Too many queue requests. Try again in 15 minutes.' },
});
