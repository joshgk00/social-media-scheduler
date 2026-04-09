import pino from 'pino';
import { createLogger } from '@sms/shared/logger';
import { pinoHttp } from 'pino-http';
import type { IncomingMessage } from 'node:http';

export const logger = createLogger('api');

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req: IncomingMessage) => (req as any).id as string,
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
});
