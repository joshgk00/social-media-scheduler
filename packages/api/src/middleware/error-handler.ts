import type { Request, Response, NextFunction } from 'express';
import { logger } from './logger.js';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const correlationId = (req as any).id || 'unknown';
  logger.error({ err, correlationId }, 'Unhandled error');

  const status = (err as any).status || (err as any).statusCode || 500;
  const isSafeMessage = status < 500 && !err.message.includes('query:');
  res.status(status).json({
    error: isSafeMessage ? err.message : 'Internal server error',
    correlationId,
  });
}
