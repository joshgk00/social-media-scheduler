import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { createLogger } from '@sms/shared/logger';
import { pinoHttp } from 'pino-http';
import type { Request, Response } from 'express';
import type { HttpLogger } from 'pino-http';

export const logger = createLogger('api');

export const httpLogger: HttpLogger<Request, Response> = pinoHttp<Request, Response>({
  logger,
  genReqId: (req) => {
    if (typeof req.id === 'string' && req.id.length > 0) {
      return req.id;
    }

    const correlationId = randomUUID();
    req.id = correlationId;
    return correlationId;
  },
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
});
