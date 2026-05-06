import pino from 'pino';

export const DEFAULT_REDACT = {
  paths: [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["set-cookie"]',
    'req.body.openai_api_key',
    'req.body.openaiApiKey',
    'req.body.OPENAI_API_KEY',
    '*.openai_api_key',
    '*.openaiApiKey',
    '*.OPENAI_API_KEY',
    '*.*.openai_api_key',
    '*.*.openaiApiKey',
    '*.*.OPENAI_API_KEY',
  ],
  censor: '[REDACTED]',
};

export function createLogger(name?: string): pino.Logger {
  return pino({
    name,
    level: process.env.LOG_LEVEL || 'info',
    ...(process.env.NODE_ENV === 'development' && {
      transport: { target: 'pino-pretty' },
    }),
    redact: DEFAULT_REDACT,
  });
}
