// Minimal factory helpers for mocking the twitter-api-v2 error shapes the
// classifier and lifecycle tests need. We don't use MSW here because the
// worker lifecycle tests never actually spin up a client — they inject a
// mocked `callTwitter` directly via `ctx.callTwitter`. These helpers
// fabricate error objects that pass `instanceof ApiResponseError` checks
// so the classifier sees the same shape it would in production.

import { ApiResponseError, ApiRequestError } from 'twitter-api-v2';

interface ApiErrorInit {
  httpStatus?: number;
  code?: number;
  detail?: string;
  message?: string;
  isRateLimit?: boolean;
  rateLimitResetEpoch?: number;
}

/**
 * Build an object that passes `instanceof ApiResponseError` with the fields
 * the classifier reads. Uses Object.setPrototypeOf to avoid fighting with
 * the ApiResponseError constructor signature (which expects a full request
 * context we don't have in unit tests).
 */
export function buildApiResponseError(init: ApiErrorInit = {}): ApiResponseError {
  const httpStatus = init.httpStatus ?? 500;
  const code = init.code ?? 0;
  const detail = init.detail ?? 'Test Twitter error';

  const err = new Error(init.message ?? detail) as Error & {
    code: number;
    errors: Array<{ code: number; message: string }>;
    data: { detail: string };
    rateLimit?: { reset: number; limit: number; remaining: number };
    rateLimitError?: boolean;
    isAuthError?: boolean;
  };
  err.code = httpStatus;
  err.errors = code > 0 ? [{ code, message: detail }] : [];
  err.data = { detail };

  if (init.isRateLimit) {
    err.rateLimitError = true;
    err.rateLimit = {
      reset: init.rateLimitResetEpoch ?? Math.floor(Date.now() / 1000) + 300,
      limit: 500,
      remaining: 0,
    };
  }

  if (httpStatus === 401) {
    err.isAuthError = true;
  }

  Object.setPrototypeOf(err, ApiResponseError.prototype);
  return err as unknown as ApiResponseError;
}

export function buildApiRequestError(message = 'ECONNRESET'): ApiRequestError {
  const err = new Error(message) as Error & { code: string };
  err.code = 'ECONNRESET';
  Object.setPrototypeOf(err, ApiRequestError.prototype);
  return err as unknown as ApiRequestError;
}

export function buildSuccessfulTweetResponse(tweetId = 'tw_test_123') {
  return {
    data: {
      id: tweetId,
      text: 'Test tweet body',
      edit_history_tweet_ids: [tweetId],
    },
  };
}
