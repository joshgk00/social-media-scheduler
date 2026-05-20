import { TwitterApi, ApiRequestError, ApiResponseError } from 'twitter-api-v2';
import { decrypt, validateEncryptionKey } from '@sms/shared/encryption';
import { createLogger } from '@sms/shared/logger';
import {
  PublishFailure,
  type PublishFailureKind,
  type PublishResult,
  type Publisher,
} from '@sms/shared';
import type { socialProfiles } from '@sms/db';

type ClassifiedError = {
  kind: PublishFailureKind;
  httpStatus: number | null;
  errorCode: string;
  message: string;
};

const PERMANENT_HTTP = new Set([400, 401, 403, 404, 422]);
const TRANSIENT_HTTP = new Set([408, 429, 500, 502, 503, 504]);
const DUPLICATE_STATUS_CODE = 187;

const logger = createLogger('twitter-publisher');

class TwitterCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TwitterCredentialError';
  }
}

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

function classifyTwitterError(err: unknown): ClassifiedError {
  if (err instanceof TwitterCredentialError) {
    return {
      kind: 'permanent',
      httpStatus: null,
      errorCode: 'credential_error',
      message: err.message,
    };
  }

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
    const httpStatus = err.code;
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

    if (twitterErrors.some((entry) => readTwitterErrorCode(entry) === DUPLICATE_STATUS_CODE)) {
      return {
        kind: 'permanent',
        httpStatus,
        errorCode: 'duplicate_content',
        message: 'Duplicate content - Twitter rejected this tweet',
      };
    }

    if (err.isAuthError || httpStatus === 401) {
      return {
        kind: 'permanent',
        httpStatus,
        errorCode: 'auth_revoked',
        message:
          'Twitter credentials are no longer valid - please reconnect the profile',
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

    return {
      kind: 'transient',
      httpStatus,
      errorCode: `http_${httpStatus}_unknown`,
      message: twitterDetail,
    };
  }

  const message = err instanceof Error ? err.message : 'Unknown error';
  return { kind: 'transient', httpStatus: null, errorCode: 'unknown', message };
}

function redactTokenShapedSubstrings(message: string): string {
  return message
    .replace(/(authorization\s*:\s*(?:bearer|oauth)\s+)[^\r\n]+/gi, '$1[redacted]')
    .replace(/((?:access_token|oauth_(?:token|nonce|signature|consumer_key))\s*=\s*["']?)[^"',\s&]+/gi, '$1[redacted]')
    .replace(/[A-Za-z0-9_-]{32,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}/g, '[redacted-token]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[redacted-token]');
}

function asHexString(value: string | Buffer | null): string | null {
  if (value === null) return null;
  return typeof value === 'string' ? value : value.toString('hex');
}

function readTwitterCredentials(profile: typeof socialProfiles.$inferSelect) {
  const rawKey = process.env.ENCRYPTION_KEY;
  if (!rawKey) {
    throw new TwitterCredentialError(
      'ENCRYPTION_KEY env var is not set - cannot decrypt Twitter credentials',
    );
  }
  let encryptionKey: Buffer;
  try {
    encryptionKey = validateEncryptionKey(rawKey);
  } catch {
    throw new TwitterCredentialError('ENCRYPTION_KEY env var is invalid');
  }

  const consumerKeyCiphertext = asHexString(profile.consumerKeyCiphertext);
  const consumerKeyIv = asHexString(profile.consumerKeyIv);
  const consumerKeyAuthTag = asHexString(profile.consumerKeyAuthTag);
  const consumerSecretCiphertext = asHexString(profile.consumerSecretCiphertext);
  const consumerSecretIv = asHexString(profile.consumerSecretIv);
  const consumerSecretAuthTag = asHexString(profile.consumerSecretAuthTag);
  const accessTokenCiphertext = asHexString(profile.accessTokenCiphertext);
  const accessTokenIv = asHexString(profile.accessTokenIv);
  const accessTokenAuthTag = asHexString(profile.accessTokenAuthTag);
  const accessTokenSecretCiphertext = asHexString(profile.accessTokenSecretCiphertext);
  const accessTokenSecretIv = asHexString(profile.accessTokenSecretIv);
  const accessTokenSecretAuthTag = asHexString(profile.accessTokenSecretAuthTag);

  if (
    !consumerKeyCiphertext ||
    !consumerKeyIv ||
    !consumerKeyAuthTag ||
    !consumerSecretCiphertext ||
    !consumerSecretIv ||
    !consumerSecretAuthTag ||
    !accessTokenCiphertext ||
    !accessTokenIv ||
    !accessTokenAuthTag ||
    !accessTokenSecretCiphertext ||
    !accessTokenSecretIv ||
    !accessTokenSecretAuthTag
  ) {
    throw new TwitterCredentialError(
      `Profile ${profile.id} is missing one or more encrypted Twitter credential fields`,
    );
  }

  try {
    return {
      consumerKey: decrypt(consumerKeyCiphertext, consumerKeyIv, consumerKeyAuthTag, encryptionKey),
      consumerSecret: decrypt(
        consumerSecretCiphertext,
        consumerSecretIv,
        consumerSecretAuthTag,
        encryptionKey,
      ),
      accessToken: decrypt(accessTokenCiphertext, accessTokenIv, accessTokenAuthTag, encryptionKey),
      accessSecret: decrypt(
        accessTokenSecretCiphertext,
        accessTokenSecretIv,
        accessTokenSecretAuthTag,
        encryptionKey,
      ),
    };
  } catch {
    throw new TwitterCredentialError(
      `Profile ${profile.id} has Twitter credentials that could not be decrypted`,
    );
  }
}

export function createTwitterPublisher(): Publisher<typeof socialProfiles.$inferSelect> {
  return {
    async publish(profile, post, ctx): Promise<PublishResult> {
      if (post.isThread) {
        throw new PublishFailure({
          kind: 'permanent',
          errorCode: 'thread_unsupported',
          message: 'Thread publishing is not supported for Twitter yet',
        });
      }

      try {
        const { consumerKey, consumerSecret, accessToken, accessSecret } =
          readTwitterCredentials(profile);
        const client = new TwitterApi({
          appKey: consumerKey,
          appSecret: consumerSecret,
          accessToken,
          accessSecret,
        });

        logger.info(
          {
            profileId: profile.id,
            correlationId: ctx.correlationId,
            textLength: post.text.length,
          },
          'Calling Twitter v2.tweet',
        );

        const response = await client.v2.tweet({ text: post.text });
        if (!response?.data?.id) {
          throw new Error('Twitter API returned no tweet id in response');
        }
        return { platformPostId: response.data.id };
      } catch (err) {
        if (err instanceof PublishFailure) throw err;
        const classification = classifyTwitterError(err);
        throw new PublishFailure({
          kind: classification.kind,
          errorCode: classification.errorCode,
          message: redactTokenShapedSubstrings(classification.message),
          httpStatus: classification.httpStatus ?? undefined,
          cause: err,
        });
      }
    },
  };
}

export function createFakeTwitterPublisher(
  options: { result?: PublishResult; error?: unknown } = {},
): Publisher<typeof socialProfiles.$inferSelect> {
  return {
    async publish() {
      if (Object.prototype.hasOwnProperty.call(options, 'error')) {
        throw options.error;
      }
      return options.result ?? { platformPostId: 'tw_fake_1' };
    },
  };
}
