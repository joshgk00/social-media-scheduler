import { describe, it, expect, beforeEach } from 'vitest';
import { Writable } from 'node:stream';
import pino from 'pino';
import pinoHttp from 'pino-http';
import express from 'express';
import request from 'supertest';

function createTestLogger() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });

  const logger = pino(
    {
      level: 'info',
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["set-cookie"]'],
        censor: '[REDACTED]',
      },
    },
    stream,
  );

  return { logger, lines, stream };
}

describe('Logger', () => {
  beforeEach(() => {
    process.env.CSRF_SECRET = 'a'.repeat(64);
  });

  it('log output is structured JSON with timestamp, level, and message fields', () => {
    const { logger, lines } = createTestLogger();
    logger.info('test message');

    expect(lines.length).toBeGreaterThan(0);
    const parsed = JSON.parse(lines[0]);
    expect(parsed).toHaveProperty('time');
    expect(parsed).toHaveProperty('level');
    expect(parsed).toHaveProperty('msg', 'test message');
  });

  it('redacts Authorization header from log output', async () => {
    const { logger, lines } = createTestLogger();

    const httpMiddleware = pinoHttp({
      logger,
      genReqId: (req) => (req as any).id || 'test-id',
      serializers: {
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res,
      },
    });

    const app = express();
    app.use((req, _res, next) => {
      (req as any).id = 'test-correlation-id';
      next();
    });
    app.use(httpMiddleware);
    app.get('/test', (_req, res) => res.json({ ok: true }));

    await request(app)
      .get('/test')
      .set('Authorization', 'Bearer secret-token-value');

    const allOutput = lines.join('');
    expect(allOutput).not.toContain('secret-token-value');

    const requestLog = lines.find((l) => {
      try {
        const parsed = JSON.parse(l);
        return parsed.req?.headers?.authorization !== undefined;
      } catch {
        return false;
      }
    });

    if (requestLog) {
      const parsed = JSON.parse(requestLog);
      expect(parsed.req.headers.authorization).toBe('[REDACTED]');
    }
  });

  it('redacts Cookie header from log output', async () => {
    const { logger, lines } = createTestLogger();

    const httpMiddleware = pinoHttp({
      logger,
      genReqId: (req) => (req as any).id || 'test-id',
      serializers: {
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res,
      },
    });

    const app = express();
    app.use((req, _res, next) => {
      (req as any).id = 'test-correlation-id';
      next();
    });
    app.use(httpMiddleware);
    app.get('/test', (_req, res) => res.json({ ok: true }));

    await request(app)
      .get('/test')
      .set('Cookie', 'session=super-secret-session-value');

    const allOutput = lines.join('');
    expect(allOutput).not.toContain('super-secret-session-value');

    const requestLog = lines.find((l) => {
      try {
        const parsed = JSON.parse(l);
        return parsed.req?.headers?.cookie !== undefined;
      } catch {
        return false;
      }
    });

    if (requestLog) {
      const parsed = JSON.parse(requestLog);
      expect(parsed.req.headers.cookie).toBe('[REDACTED]');
    }
  });
});
