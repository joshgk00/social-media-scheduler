import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createMockRedis } from './helpers/mock-redis.js';
import { createMockSql } from './helpers/mock-sql.js';

function createTestApp() {
  return createApp({
    redis: createMockRedis({
      get: vi.fn().mockResolvedValue(Date.now().toString()),
    }),
    sql: createMockSql(),
    db: {} as any,
    sessionSecret: 'test-secret-that-is-long-enough-for-session',
  });
}

function appWithCleanRedis(appFactory = createApp) {
  return appFactory({
    redis: createMockRedis(),
    sql: createMockSql(),
    db: {} as any,
    sessionSecret: 'test-secret-that-is-long-enough-for-session',
  });
}

async function appWithFreshEnv(nodeEnv: 'development' | 'production') {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', nodeEnv);
  vi.stubEnv('CSRF_SECRET', 'a'.repeat(64));
  const { createApp: createFreshApp } = await import('../app.js');
  return appWithCleanRedis(createFreshApp);
}

function getSetCookies(res: { headers: Record<string, string | string[] | undefined> }) {
  const setCookies = res.headers['set-cookie'];
  if (!setCookies) return [];
  return Array.isArray(setCookies) ? setCookies : [setCookies];
}

function findCookie(cookies: string[], name: string) {
  return cookies.find((cookie) => cookie.startsWith(`${name}=`));
}

describe('Middleware', () => {
  beforeEach(() => {
    vi.stubEnv('CSRF_SECRET', 'a'.repeat(64));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('responses include X-Request-Id header with UUID format', async () => {
    const app = createTestApp();
    const res = await request(app).get('/health');

    expect(res.headers['x-request-id']).toBeDefined();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(res.headers['x-request-id']).toMatch(uuidRegex);
  });

  it('responses include helmet security headers', async () => {
    const app = createTestApp();
    const res = await request(app).get('/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  it('GET requests are not blocked by CSRF middleware', async () => {
    const app = createTestApp();
    const res = await request(app).get('/health');

    expect(res.status).not.toBe(403);
  });

  it('POST requests without CSRF token return 403', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/health')
      .send({ test: true });

    expect(res.status).toBe(403);
  });

  it('preserves existing X-Request-Id header from client', async () => {
    const app = createTestApp();
    const customId = '550e8400-e29b-41d4-a716-446655440000';
    const res = await request(app)
      .get('/health')
      .set('X-Request-Id', customId);

    expect(res.headers['x-request-id']).toBe(customId);
  });
});

describe('trust proxy (issue #50)', () => {
  beforeEach(() => {
    vi.stubEnv('CSRF_SECRET', 'a'.repeat(64));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('enables `trust proxy` so X-Forwarded-Proto is honored behind a reverse proxy', () => {
    const app = createTestApp();
    // Express normalizes any non-false `trust proxy` setting into a function
    // and stores the original at `'trust proxy'` plus the resolved fn at
    // `'trust proxy fn'`. Both must be set when trust-proxy is enabled.
    expect(app.get('trust proxy')).not.toBe(false);
    expect(app.get('trust proxy fn')).toBeDefined();
    expect(typeof app.get('trust proxy fn')).toBe('function');
  });

  it('trust-proxy fn accepts only loopback and the bundled Docker proxy range', () => {
    // Express stores trust-proxy as a compiled function `(addr, hopIdx) => boolean`.
    // The bundled nginx reaches the API from Docker's private 172.16/12
    // range; arbitrary LAN or sidecar sources should not be able to forge
    // X-Forwarded-* and affect req.ip/rate-limit keys.
    const app = createTestApp();
    const trustFn = app.get('trust proxy fn') as (
      addr: string,
      hopIdx: number,
    ) => boolean;
    expect(typeof trustFn).toBe('function');
    expect(trustFn('127.0.0.1', 0)).toBe(true);
    expect(trustFn('172.18.0.5', 0)).toBe(true);
    expect(trustFn('10.0.0.1', 0)).toBe(false);
    expect(trustFn('192.168.1.10', 0)).toBe(false);
  });

  it('nginx overwrites spoofable forwarded headers after optional real-ip resolution', () => {
    const prodConfig = readFileSync(new URL('../../../../nginx/nginx.conf', import.meta.url), 'utf8');
    const devConfig = readFileSync(new URL('../../../../nginx/nginx.dev.conf', import.meta.url), 'utf8');
    const dockerfile = readFileSync(new URL('../../../../Dockerfile', import.meta.url), 'utf8');
    const composeConfig = readFileSync(new URL('../../../../docker-compose.yml', import.meta.url), 'utf8');

    expect(prodConfig).not.toContain('$proxy_add_x_forwarded_for');
    expect(devConfig).not.toContain('$proxy_add_x_forwarded_for');
    expect(prodConfig).toContain('include /tmp/nginx-realip/*.conf;');
    expect(prodConfig.indexOf('include /tmp/nginx-realip/*.conf;')).toBeLessThan(
      prodConfig.indexOf('limit_req_zone $binary_remote_addr zone=api_per_ip:10m rate=10r/s;'),
    );
    expect(prodConfig.match(/proxy_set_header X-Forwarded-For \$remote_addr;/g)).toHaveLength(4);
    expect(devConfig.match(/proxy_set_header X-Forwarded-For \$remote_addr;/g)).toHaveLength(5);
    expect(prodConfig).toContain('default $scheme;');
    expect(prodConfig).toContain('"http"  http;');
    expect(prodConfig).toContain('"https" https;');
    expect(dockerfile).toContain('COPY nginx/realip-env.sh /docker-entrypoint.d/40-realip-env.sh');
    expect(dockerfile).toContain('chmod +x /docker-entrypoint.d/40-realip-env.sh');
    expect(composeConfig).toContain('NGINX_TRUSTED_PROXY_CIDR: ${NGINX_TRUSTED_PROXY_CIDR:-}');
  });

  it('generates real_ip trust only when NGINX_TRUSTED_PROXY_CIDR is set', () => {
    const scriptPath = fileURLToPath(new URL('../../../../nginx/realip-env.sh', import.meta.url));
    const tempDir = mkdtempSync(join(tmpdir(), 'sms-realip-'));
    const outputPath = join(tempDir, 'realip.conf');

    try {
      execFileSync('sh', [scriptPath], {
        env: {
          ...process.env,
          NGINX_REALIP_CONF_PATH: outputPath,
          NGINX_TRUSTED_PROXY_CIDR: '',
        },
      });
      expect(readFileSync(outputPath, 'utf8')).toBe('');

      execFileSync('sh', [scriptPath], {
        env: {
          ...process.env,
          NGINX_REALIP_CONF_PATH: outputPath,
          NGINX_TRUSTED_PROXY_CIDR: '127.0.0.1/32 172.16.0.0/12',
        },
      });
      expect(readFileSync(outputPath, 'utf8')).toBe(
        [
          'set_real_ip_from 127.0.0.1/32;',
          'set_real_ip_from 172.16.0.0/12;',
          'real_ip_header X-Forwarded-For;',
          'real_ip_recursive on;',
          '',
        ].join('\n'),
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('issues session and CSRF cookies with Secure flag when X-Forwarded-Proto: https in production', async () => {
    const app = await appWithFreshEnv('production');
    const res = await request(app)
      .get('/api/auth/csrf-token')
      .set('X-Forwarded-Proto', 'https');
    const cookies = getSetCookies(res);
    const sessionCookie = findCookie(cookies, 'sms.sid');
    const csrfCookie = findCookie(cookies, '__csrf');

    expect(sessionCookie).toBeDefined();
    expect(csrfCookie).toBeDefined();
    expect(sessionCookie).toMatch(/;\s*Secure(?:;|$)/);
    expect(csrfCookie).toMatch(/;\s*Secure(?:;|$)/);
  });

  it('does NOT issue the secure session cookie over plain HTTP in production (no leak)', async () => {
    // Negative case for the original production bug: with X-Forwarded-Proto:
    // http and cookie.secure:true, express-session refuses to set the cookie
    // at all — exactly the production failure mode that motivated issue #50.
    // The fix is upstream: an external reverse proxy MUST forward
    // X-Forwarded-Proto: https for cookies to flow. This test pins the safety
    // semantic so a misconfigured proxy never silently exposes the cookie
    // over plain HTTP.
    const app = await appWithFreshEnv('production');
    const res = await request(app)
      .get('/health')
      .set('X-Forwarded-Proto', 'http');
    const sessionCookie = findCookie(getSetCookies(res), 'sms.sid');
    expect(sessionCookie).toBeUndefined();
  });

  it('does NOT issue the secure session cookie in production when X-Forwarded-Proto is absent', async () => {
    const app = await appWithFreshEnv('production');
    const res = await request(app).get('/health');
    const sessionCookie = findCookie(getSetCookies(res), 'sms.sid');
    expect(sessionCookie).toBeUndefined();
  });

  it('issues non-Secure session and CSRF cookies in development even when X-Forwarded-Proto is https', async () => {
    const app = await appWithFreshEnv('development');
    const res = await request(app)
      .get('/api/auth/csrf-token')
      .set('X-Forwarded-Proto', 'https');
    const cookies = getSetCookies(res);
    const sessionCookie = findCookie(cookies, 'sms.sid');
    const csrfCookie = findCookie(cookies, '__csrf');

    expect(sessionCookie).toBeDefined();
    expect(csrfCookie).toBeDefined();
    expect(sessionCookie).not.toMatch(/;\s*Secure(?:;|$)/);
    expect(csrfCookie).not.toMatch(/;\s*Secure(?:;|$)/);
  });
});

describe('production nginx security controls (issue #25)', () => {
  const prodConfig = readFileSync(new URL('../../../../nginx/nginx.conf', import.meta.url), 'utf8');
  const staticCsp =
    "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; base-uri 'self'; frame-ancestors 'none'; object-src 'none'";
  const adminCsp =
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'self'; frame-ancestors 'self'; object-src 'none'";

  it('adds security headers at the reverse proxy and static asset layers', () => {
    expect(prodConfig.match(/add_header X-Frame-Options "DENY" always;/g)).toHaveLength(4);
    expect(prodConfig).toContain('proxy_hide_header Content-Security-Policy;');
    expect(prodConfig).toContain('proxy_hide_header X-Frame-Options;');
    expect(prodConfig).toContain('add_header X-Frame-Options "SAMEORIGIN" always;');
    expect(prodConfig.match(/add_header X-Content-Type-Options "nosniff" always;/g)).toHaveLength(5);
    expect(prodConfig.match(/add_header Referrer-Policy "strict-origin-when-cross-origin" always;/g)).toHaveLength(5);
    expect(prodConfig.split(`add_header Content-Security-Policy "${staticCsp}" always;`)).toHaveLength(5);
    expect(prodConfig).toContain(`add_header Content-Security-Policy "${adminCsp}" always;`);
    expect(prodConfig.match(/add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;/g)).toHaveLength(5);
    expect(prodConfig).toContain('add_header Permissions-Policy "accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()" always;');
  });

  it('rate limits API and admin traffic with 429 responses', () => {
    expect(prodConfig).toContain('limit_req_status 429;');
    expect(prodConfig).toContain('limit_req_zone $binary_remote_addr zone=api_per_ip:10m rate=10r/s;');
    expect(prodConfig).toContain('limit_req zone=api_per_ip burst=20 nodelay;');
    expect(prodConfig).toContain('limit_req_zone $binary_remote_addr zone=admin_per_ip:10m rate=2r/s;');
    expect(prodConfig).toContain('limit_req zone=admin_per_ip burst=10 nodelay;');
  });

  it('compresses proxied responses and prevents SPA index caching', () => {
    expect(prodConfig).toContain('gzip_proxied any;');
    expect(prodConfig).toContain('location = /index.html');
    expect(prodConfig.match(/add_header Cache-Control "no-cache";/g)).toHaveLength(2);
    expect(prodConfig).toContain('add_header Cache-Control "public, immutable";');
  });
});
