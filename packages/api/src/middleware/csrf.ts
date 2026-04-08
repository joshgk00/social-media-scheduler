import { doubleCsrf } from 'csrf-csrf';

const {
  doubleCsrfProtection,
  generateCsrfToken,
} = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET!,
  getSessionIdentifier: (req) => {
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
