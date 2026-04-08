import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

export function correlationId(req: Request, res: Response, next: NextFunction) {
  req.id = (req.headers['x-request-id'] as string) || randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}
