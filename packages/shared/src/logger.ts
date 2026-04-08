import pino from 'pino';

const DEFAULT_REDACT = {
  paths: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["set-cookie"]'],
  censor: '[REDACTED]',
};

export function createLogger(name?: string) {
  return pino({
    name,
    level: process.env.LOG_LEVEL || 'info',
    ...(process.env.NODE_ENV === 'development' && {
      transport: { target: 'pino-pretty' },
    }),
    redact: DEFAULT_REDACT,
  });
}
