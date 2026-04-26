// Multi-platform publish error classifier. Lives in @sms/shared so that both
// @sms/api (pre-flight tests, manual retry flow) and @sms/worker (retry
// decisions inside the BullMQ job handler) import the SAME classification
// logic. Per revision Blocker 4 — eliminates any worker→api dependency.
//
// The classifier reads only Twitter-authored fields from the error object
// (twitter-api-v2 `ApiResponseError` / `ApiRequestError`). It NEVER echoes
// the request's OAuth header, body, or any credential material into the
// returned `message`. Downstream callers persist `message` into the
// `post_attempts.error_message` column and surface it in the UI, so keeping
// it credential-free is a mitigation for T-04-02-04.

import { ApiResponseError, ApiRequestError } from 'twitter-api-v2';

export type ClassifiedError =
  | { kind: 'transient'; httpStatus: number | null; errorCode: string; message: string }
  | { kind: 'permanent'; httpStatus: number | null; errorCode: string; message: string };

const PERMANENT_HTTP = new Set([400, 401, 403, 404, 422]);
const TRANSIENT_HTTP = new Set([408, 429, 500, 502, 503, 504]);

// Twitter v1.1 error code 187 = "Status is a duplicate". Twitter rejects
// the tweet; retrying is pointless and would burn the user's retry budget.
const DUPLICATE_STATUS_CODE = 187;

// twitter-api-v2 exposes `ErrorV1` (v1.1 endpoints, has `code` and `message`)
// and `ErrorV2` (v2 endpoints, has `detail`/`title` but no numeric code).
// These helpers safely pull shared fields from either shape without `any`.
function readTwitterErrorCode(entry: unknown): number | null {
  if (entry !== null && typeof entry === 'object' && 'code' in entry) {
    const raw = (entry as { code?: unknown }).code;
    return typeof raw === 'number' ? raw : null;
  }
  return null;
}

function readTwitterErrorMessage(entry: unknown): string | null {
  if (entry !== null && typeof entry === 'object') {
    const candidate = entry as { message?: unknown; detail?: unknown };
    if (typeof candidate.message === 'string') return candidate.message;
    if (typeof candidate.detail === 'string') return candidate.detail;
  }
  return null;
}

export function classifyTwitterError(err: unknown): ClassifiedError {
  // Network error before HTTP (DNS, ECONNRESET, socket timeout, etc.)
  const nodeErr = err as NodeJS.ErrnoException | undefined;
  if (err instanceof ApiRequestError || nodeErr?.code === 'ECONNRESET') {
    return {
      kind: 'transient',
      httpStatus: null,
      errorCode: nodeErr?.code ?? 'network_error',
      message: 'Network error contacting Twitter API',
    };
  }

  if (err instanceof ApiResponseError) {
    const httpStatus = err.code; // ApiResponseError.code is the HTTP status
    const twitterErrors = err.errors ?? [];
    const firstEntry: unknown = twitterErrors[0];
    const firstNumericCode = readTwitterErrorCode(firstEntry);
    const firstErrorCode =
      firstNumericCode != null ? String(firstNumericCode) : 'unknown';
    const v2Detail =
      err.data !== null && typeof err.data === 'object' && 'detail' in err.data
        ? (err.data as { detail?: unknown }).detail
        : undefined;
    const twitterDetail =
      readTwitterErrorMessage(firstEntry) ??
      (typeof v2Detail === 'string' ? v2Detail : null) ??
      err.message;

    // 187 = "Status is a duplicate" — Twitter-specific permanent failure.
    if (twitterErrors.some((entry) => readTwitterErrorCode(entry) === DUPLICATE_STATUS_CODE)) {
      return {
        kind: 'permanent',
        httpStatus,
        errorCode: 'duplicate_content',
        message: 'Duplicate content — Twitter rejected this tweet',
      };
    }

    if (err.isAuthError || httpStatus === 401) {
      return {
        kind: 'permanent',
        httpStatus,
        errorCode: 'auth_revoked',
        message:
          'Twitter credentials are no longer valid — please reconnect the profile',
      };
    }

    if (PERMANENT_HTTP.has(httpStatus)) {
      return {
        kind: 'permanent',
        httpStatus,
        errorCode: `http_${httpStatus}_${firstErrorCode}`,
        message: twitterDetail,
      };
    }

    if (TRANSIENT_HTTP.has(httpStatus)) {
      return {
        kind: 'transient',
        httpStatus,
        errorCode: `http_${httpStatus}`,
        message: twitterDetail,
      };
    }

    // Unknown HTTP: treat as transient to give the user one more shot.
    return {
      kind: 'transient',
      httpStatus,
      errorCode: `http_${httpStatus}_unknown`,
      message: twitterDetail,
    };
  }

  // Unknown error shape — treat as transient (safer default). We do NOT
  // leak the raw stack trace; only Error.message.
  const message = err instanceof Error ? err.message : 'Unknown error';
  return { kind: 'transient', httpStatus: null, errorCode: 'unknown', message };
}

// ============================================================================
// Phase 8 — LinkedIn / Facebook publish error classifiers
// ============================================================================
//
// Both platforms surface a `status: number` on the thrown error (the worker
// publish services attach this on LinkedInPublishApiError /
// FacebookPublishApiError). Decisions:
//
//   401 → permanent / auth_revoked (token invalid; needs reconnect)
//   403 → permanent / forbidden (scope or page-permission misconfig)
//   429 → transient / rate_limited
//   5xx → transient / upstream
//   4xx (other) → permanent / client_error
//   Network / no-status → transient (safer default — give caller one retry)

function readErrorStatus(err: unknown): number | null {
  if (err === null || typeof err !== 'object') return null;
  const candidate = (err as { status?: unknown }).status;
  return typeof candidate === 'number' ? candidate : null;
}

export function classifyLinkedInError(err: unknown): ClassifiedError {
  const message = err instanceof Error ? err.message : 'Unknown error';
  const httpStatus = readErrorStatus(err);

  if (httpStatus === 401) {
    return {
      kind: 'permanent',
      httpStatus: 401,
      errorCode: 'auth_revoked',
      message:
        'LinkedIn credentials are no longer valid — please reconnect the profile',
    };
  }
  if (httpStatus === 429) {
    return { kind: 'transient', httpStatus, errorCode: 'rate_limited', message };
  }
  if (httpStatus !== null && httpStatus >= 500) {
    return {
      kind: 'transient',
      httpStatus,
      errorCode: `http_${httpStatus}`,
      message,
    };
  }
  if (httpStatus !== null && httpStatus >= 400) {
    return {
      kind: 'permanent',
      httpStatus,
      errorCode: `http_${httpStatus}`,
      message,
    };
  }
  // Network / unknown — transient default.
  return { kind: 'transient', httpStatus, errorCode: 'unknown', message };
}

// Facebook Graph API error envelope: { error: { code, type, message } }.
// Codes 4 / 17 / 32 / 613 are the user/app/page/permission rate-limit codes;
// code 190 means the access token has been invalidated (needs_reauth).
const FACEBOOK_RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);
const FACEBOOK_AUTH_REVOKED_CODE = 190;

function readFacebookGraphCode(err: unknown): number | null {
  if (err === null || typeof err !== 'object') return null;
  const message = (err as { message?: unknown }).message;
  if (typeof message !== 'string') return null;
  // Match `"code":190` or `code: 190` from sanitized error bodies. Anchored
  // word boundary on the right keeps `1900` from matching `190`.
  const match = message.match(/code["']?\s*[:=]\s*(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

export function classifyFacebookError(err: unknown): ClassifiedError {
  const message = err instanceof Error ? err.message : 'Unknown error';
  const httpStatus = readErrorStatus(err);
  const fbCode = readFacebookGraphCode(err);

  if (httpStatus === 401 || fbCode === FACEBOOK_AUTH_REVOKED_CODE) {
    return {
      kind: 'permanent',
      httpStatus: httpStatus ?? 401,
      errorCode: 'auth_revoked',
      message:
        'Facebook page access token is no longer valid — please reconnect the page',
    };
  }
  if (fbCode !== null && FACEBOOK_RATE_LIMIT_CODES.has(fbCode)) {
    return {
      kind: 'transient',
      httpStatus,
      errorCode: `fb_code_${fbCode}`,
      message,
    };
  }
  if (httpStatus === 429) {
    return { kind: 'transient', httpStatus, errorCode: 'rate_limited', message };
  }
  if (httpStatus !== null && httpStatus >= 500) {
    return {
      kind: 'transient',
      httpStatus,
      errorCode: `http_${httpStatus}`,
      message,
    };
  }
  if (httpStatus !== null && httpStatus >= 400) {
    return {
      kind: 'permanent',
      httpStatus,
      errorCode: `http_${httpStatus}`,
      message,
    };
  }
  return { kind: 'transient', httpStatus, errorCode: 'unknown', message };
}
