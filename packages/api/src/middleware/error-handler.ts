import type { Request, Response, NextFunction } from 'express';
import { AppError } from '@sms/shared';
import { logger } from './logger.js';

// Prefer the matched route pattern (e.g. `/api/oauth/pending/:tempToken`) over
// the concrete URL — concrete URLs may carry capability tokens or other
// secrets in path params, while the pattern preserves endpoint identity for
// log analysis without recording the secret material itself. Falls back to
// `<unrouted>` when no route matched (404, or error from middleware before
// routing); the concrete URL would still leak secrets there and the
// surrounding pino-http request log line carries the original path if
// operators truly need it.
function getRouteLabel(req: Request): string {
  if (req.route?.path) {
    return `${req.baseUrl}${req.route.path}`;
  }
  return '<unrouted>';
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const correlationId = (req as any).id || 'unknown';
  // gh#54 acceptance: structured log MUST carry correlationId, route, and the
  // underlying error class. `err` is serialized by pino's default error
  // serializer (name, message, stack); `method` + `route` are explicit so
  // grep-by-endpoint works without re-instrumenting.
  const route = getRouteLabel(req);
  logger.error({ err, correlationId, method: req.method, route }, 'Unhandled error');

  if (err instanceof AppError) {
    const code = (err as { code?: unknown }).code;
    res.status(err.statusCode).json({
      error: err.message,
      ...(typeof code === 'string' ? { code } : {}),
      correlationId,
    });
    return;
  }

  const rawStatus = (err as any).status || (err as any).statusCode || 500;
  const status = (rawStatus >= 400 && rawStatus < 600) ? rawStatus : 500;
  // Dev mode shows the raw error message to aid local debugging.
  // Production must never leak internal error details to clients.
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(status).json({
    error: isDev ? err.message : 'Internal server error',
    correlationId,
  });
}
