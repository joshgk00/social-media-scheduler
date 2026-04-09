import type { Request, Response, NextFunction } from 'express';
import { AppError } from '@sms/shared';
import { logger } from './logger.js';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const correlationId = (req as any).id || 'unknown';
  logger.error({ err, correlationId }, 'Unhandled error');

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, correlationId });
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
