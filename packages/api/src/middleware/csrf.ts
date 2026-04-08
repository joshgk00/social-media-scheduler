import { doubleCsrf } from 'csrf-csrf';

const {
  doubleCsrfProtection,
  generateCsrfToken,
} = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET!,
  getSessionIdentifier: (req) => {
    // TODO(phase-2): Replace with actual session ID once express-session is wired up.
    // Until then, single shared identifier is acceptable for single-user app.
    return (req as any).session?.id ?? 'anonymous';
  },
  cookieOptions: {
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    path: '/',
  },
  cookieName: '__csrf',
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
});

export { doubleCsrfProtection, generateCsrfToken };
