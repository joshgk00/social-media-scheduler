import { randomBytes } from 'node:crypto';
import type { Redis } from 'ioredis';
import { AppError } from '@sms/shared';
import { createLogger } from '@sms/shared/logger';

const logger = createLogger('oauth-service');

const STATE_TTL_SECONDS = 10 * 60;
const PENDING_TTL_SECONDS = 15 * 60;
const STATE_KEY_PREFIX = 'oauth:state:';
const PENDING_KEY_PREFIX = 'oauth:pending:';

// Subclass exists so structured logs show 'OAuthServiceError' instead of 'AppError'.
// Shape mirrors ProfileServiceError (message, statusCode) plus an optional `code` that
// the callback handler surfaces as the `oauth_error=` query param on redirect.
export class OAuthServiceError extends AppError {
  public readonly code?: string;

  constructor(message: string, statusCode: number, code?: string) {
    super(message, statusCode);
    this.code = code;
  }
}

export interface OAuthStatePayload {
  userId: string;
  platform: 'linkedin' | 'facebook';
  scope: string;
  // Server-validated allowlist — must be a relative path starting with a single '/'.
  // See validateReturnTo() for the accepted character set and T-07-02 in the plan.
  returnTo: string;
  reconnectProfileId: string | null;
}

export interface PendingSelectionAccount {
  platformAccountId: string;
  name: string;
  subLabel?: string;
  // Facebook-only: per-page access token; persisted as the oauth2 access token
  // (NOT the long-lived user token) — RESEARCH §Pitfall 4.
  pageAccessToken?: string;
}

export interface PendingSelectionPayload {
  userId: string;
  platform: 'linkedin' | 'facebook';
  platformUserId: string;
  displayName: string;
  handle: string;
  // Plaintext — in-memory (or Redis) only. Never persisted to the DB as plaintext.
  // Lifetime is bounded by PENDING_TTL_SECONDS (15 min).
  userToken: string;
  // LinkedIn only. Facebook does not issue a refresh token (long-lived page tokens
  // instead — see facebook.service.ts).
  refreshToken?: string;
  refreshTokenExpiresInSeconds?: number;
  tokenExpiresInSeconds: number;
  accounts: PendingSelectionAccount[];
}

function generateNonce(): string {
  return randomBytes(32).toString('base64url');
}

function redactToken(token: string): string {
  return token.length > 8 ? `${token.slice(0, 8)}…` : '[redacted]';
}

export async function createOAuthState(
  redis: Redis,
  payload: OAuthStatePayload,
): Promise<string> {
  const nonce = generateNonce();
  const key = `${STATE_KEY_PREFIX}${nonce}`;

  await redis.set(key, JSON.stringify(payload), 'EX', STATE_TTL_SECONDS);

  logger.debug(
    {
      userId: payload.userId,
      platform: payload.platform,
      reconnectProfileId: payload.reconnectProfileId,
      noncePrefix: redactToken(nonce),
    },
    'oauth state nonce created',
  );

  return nonce;
}

async function atomicConsume<T>(redis: Redis, key: string): Promise<T | null> {
  // Pipelined GET+DEL so two concurrent callbacks can't both "win" — only the
  // first exec sees the payload; the second sees null. Replay-safe per T-07-01.
  const results = await redis.multi().get(key).del(key).exec();
  if (!results) return null;
  const getResult = results[0];
  if (!getResult) return null;
  const [getErr, value] = getResult as [Error | null, string | null];
  if (getErr) {
    logger.error({ err: getErr, key: key.replace(/[a-zA-Z0-9_-]{8,}$/, '…') }, 'atomic consume failed');
    return null;
  }
  if (value === null || value === undefined) return null;
  try {
    return JSON.parse(value) as T;
  } catch (err) {
    logger.error({ err }, 'failed to parse redis payload');
    return null;
  }
}

export async function consumeOAuthState(
  redis: Redis,
  nonce: string,
): Promise<OAuthStatePayload | null> {
  return atomicConsume<OAuthStatePayload>(redis, `${STATE_KEY_PREFIX}${nonce}`);
}

export async function createPendingSelection(
  redis: Redis,
  payload: PendingSelectionPayload,
): Promise<string> {
  const tempToken = generateNonce();
  const key = `${PENDING_KEY_PREFIX}${tempToken}`;

  await redis.set(key, JSON.stringify(payload), 'EX', PENDING_TTL_SECONDS);

  logger.debug(
    {
      userId: payload.userId,
      platform: payload.platform,
      accountCount: payload.accounts.length,
      tempTokenPrefix: redactToken(tempToken),
    },
    'oauth pending selection created',
  );

  return tempToken;
}

export async function consumePendingSelection(
  redis: Redis,
  tempToken: string,
): Promise<PendingSelectionPayload | null> {
  return atomicConsume<PendingSelectionPayload>(redis, `${PENDING_KEY_PREFIX}${tempToken}`);
}

export async function peekPendingSelection(
  redis: Redis,
  tempToken: string,
): Promise<PendingSelectionPayload | null> {
  const value = await redis.get(`${PENDING_KEY_PREFIX}${tempToken}`);
  if (value === null || value === undefined) return null;
  try {
    return JSON.parse(value) as PendingSelectionPayload;
  } catch (err) {
    logger.error({ err }, 'failed to parse pending selection payload');
    return null;
  }
}

// Only accept server-local paths. Rejects absolute URLs, protocol-relative URLs,
// and anything with `://`. Allowed charset matches the URL path/query surface
// we actually use (A-Z, a-z, 0-9, `/`, `_`, `-`, `?`, `=`, `&`, `%`, `.`).
// Rejecting backslashes blocks Windows-style path tricks that some frameworks
// normalize inconsistently. See threat T-07-02.
const DEFAULT_RETURN_TO = '/profiles';
const ALLOWED_RETURN_TO_PATTERN = /^\/[A-Za-z0-9/_\-?=&%.]*$/;

export function validateReturnTo(value: string | undefined): string {
  if (value === undefined || value === '') return DEFAULT_RETURN_TO;

  // Reject protocol-relative (`//host/path`) before any other check.
  if (value.startsWith('//')) {
    throw new OAuthServiceError(
      'Invalid returnTo parameter',
      400,
      'invalid_return_to',
    );
  }

  // Reject anything containing `://` — catches absolute URLs even if the
  // prefix isn't http/https (e.g., javascript: or data: tricks).
  if (value.includes('://')) {
    throw new OAuthServiceError(
      'Invalid returnTo parameter',
      400,
      'invalid_return_to',
    );
  }

  if (!value.startsWith('/')) {
    throw new OAuthServiceError(
      'Invalid returnTo parameter',
      400,
      'invalid_return_to',
    );
  }

  if (!ALLOWED_RETURN_TO_PATTERN.test(value)) {
    throw new OAuthServiceError(
      'Invalid returnTo parameter',
      400,
      'invalid_return_to',
    );
  }

  return value;
}
