import type { Request, Response, NextFunction } from 'express';
import { logger } from './logger.js';
import { TagServiceError } from '../services/tag.service.js';
import { PostServiceError } from '../services/post.service.js';
import { ProfileServiceError } from '../services/profile.service.js';
import { ValidationError } from './validation.js';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const correlationId = (req as any).id || 'unknown';
  logger.error({ err, correlationId }, 'Unhandled error');

  const isKnownError = err instanceof TagServiceError
    || err instanceof PostServiceError
    || err instanceof ProfileServiceError
    || err instanceof ValidationError;
  const status = (err as any).status || (err as any).statusCode || 500;
  res.status(status).json({
    error: isKnownError ? err.message : 'Internal server error',
    correlationId,
  });
}
