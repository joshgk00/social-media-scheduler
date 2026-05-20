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

const DEFAULT_API_VERSION = '202604';
const LINKEDIN_BASE = 'https://api.linkedin.com/rest';

const logger = createLogger('linkedin-publisher');

class LinkedInPublisherCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LinkedInPublisherCredentialError';
  }
}

class LinkedInPublisherApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'LinkedInPublisherApiError';
    this.status = status;
  }
}

function resolveApiVersion(): string {
  return process.env.LINKEDIN_API_VERSION ?? DEFAULT_API_VERSION;
}

function readErrorStatus(err: unknown): number | null {
  if (err === null || typeof err !== 'object') return null;
  const candidate = (err as { status?: unknown }).status;
  return typeof candidate === 'number' ? candidate : null;
}

function classifyLinkedInError(err: unknown): ClassifiedError {
  const message = err instanceof Error ? err.message : 'Unknown error';
  const httpStatus = readErrorStatus(err);

  if (err instanceof LinkedInPublisherCredentialError) {
    return { kind: 'permanent', httpStatus, errorCode: 'credential_error', message };
  }
  if (httpStatus === 401) {
    return {
      kind: 'permanent',
      httpStatus,
      errorCode: 'auth_revoked',
      message:
        'LinkedIn credentials are no longer valid - please reconnect the profile',
    };
  }
  if (httpStatus === 429) {
    return { kind: 'transient', httpStatus, errorCode: 'rate_limited', message };
  }
  if (httpStatus !== null && httpStatus >= 500) {
    return { kind: 'transient', httpStatus, errorCode: `http_${httpStatus}`, message };
  }
  if (httpStatus !== null && httpStatus >= 400) {
    return { kind: 'permanent', httpStatus, errorCode: `http_${httpStatus}`, message };
  }
  return { kind: 'transient', httpStatus, errorCode: 'unknown', message };
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

function readLinkedInCredentials(profile: typeof socialProfiles.$inferSelect): string {
  const rawKey = process.env.ENCRYPTION_KEY;
  if (!rawKey) {
    throw new LinkedInPublisherCredentialError('ENCRYPTION_KEY env var is not set');
  }
  const encryptionKey = validateEncryptionKey(rawKey);

  const cipher = asHexString(profile.oauth2AccessTokenCiphertext);
  const iv = asHexString(profile.oauth2AccessTokenIv);
  const authTag = asHexString(profile.oauth2AccessTokenAuthTag);
  if (!cipher || !iv || !authTag) {
    throw new LinkedInPublisherCredentialError(
      `Profile ${profile.id} is missing one or more encrypted OAuth 2.0 token fields`,
    );
  }
  return decrypt(cipher, iv, authTag, encryptionKey);
}

function buildAuthorUrn(profile: typeof socialProfiles.$inferSelect): string {
  const accountId = profile.platformAccountId;
  if (!accountId) {
    throw new LinkedInPublisherCredentialError(
      `Profile ${profile.id} missing platformAccountId`,
    );
  }
  if (accountId.startsWith('urn:li:')) return accountId;
  return profile.linkedinAccountType === 'organization'
    ? `urn:li:organization:${accountId}`
    : `urn:li:person:${accountId}`;
}

async function initializeImageUpload(args: {
  accessToken: string;
  ownerUrn: string;
  apiVersion: string;
}): Promise<{ uploadUrl: string; imageUrn: string }> {
  const res = await fetch(`${LINKEDIN_BASE}/images?action=initializeUpload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${args.accessToken}`,
      'LinkedIn-Version': args.apiVersion,
      'X-Restli-Protocol-Version': '2.0.0',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ initializeUploadRequest: { owner: args.ownerUrn } }),
  });
  if (!res.ok) {
    throw new LinkedInPublisherApiError(
      res.status,
      `initializeUpload failed: HTTP ${res.status}`,
    );
  }

  const json = (await res.json()) as { value?: { uploadUrl?: string; image?: string } };
  if (!json.value?.uploadUrl || !json.value?.image) {
    throw new LinkedInPublisherApiError(
      500,
      'initializeUpload response missing uploadUrl or image URN',
    );
  }
  return { uploadUrl: json.value.uploadUrl, imageUrn: json.value.image };
}

async function putImageBinary(args: {
  uploadUrl: string;
  imageBytes: Buffer;
}): Promise<void> {
  const res = await fetch(args.uploadUrl, {
    method: 'PUT',
    body: new Uint8Array(args.imageBytes),
  });
  if (!res.ok) {
    throw new LinkedInPublisherApiError(
      res.status,
      `image PUT failed: HTTP ${res.status}`,
    );
  }
}

export function createLinkedInPublisher(): Publisher<typeof socialProfiles.$inferSelect> {
  return {
    async publish(profile, post, ctx): Promise<PublishResult> {
      try {
        const accessToken = readLinkedInCredentials(profile);
        const apiVersion = resolveApiVersion();
        const ownerUrn = buildAuthorUrn(profile);
        const mediaItem = post.media[0];
        if (mediaItem && mediaItem.kind !== 'image') {
          throw new PublishFailure({
            kind: 'permanent',
            errorCode: 'media_unsupported',
            message: 'LinkedIn publisher supports a single image media item',
          });
        }

        let imageUrn: string | undefined;
        if (mediaItem) {
          const init = await initializeImageUpload({
            accessToken,
            ownerUrn,
            apiVersion,
          });
          await putImageBinary({
            uploadUrl: init.uploadUrl,
            imageBytes: mediaItem.bytes,
          });
          imageUrn = init.imageUrn;
        }

        const body: Record<string, unknown> = {
          author: ownerUrn,
          commentary: post.text,
          visibility: post.visibility ?? 'PUBLIC',
          distribution: {
            feedDistribution: 'MAIN_FEED',
            targetEntities: [],
            thirdPartyDistributionChannels: [],
          },
          lifecycleState: 'PUBLISHED',
          isReshareDisabledByAuthor: false,
        };
        if (imageUrn) {
          body.content = { media: { id: imageUrn, title: '' } };
        }

        logger.info(
          {
            profileId: profile.id,
            correlationId: ctx.correlationId,
            textLength: post.text.length,
            hasImage: !!imageUrn,
          },
          'Calling LinkedIn /rest/posts',
        );

        const res = await fetch(`${LINKEDIN_BASE}/posts`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'LinkedIn-Version': apiVersion,
            'X-Restli-Protocol-Version': '2.0.0',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const errBody = await res.text().catch(() => '');
          throw new LinkedInPublisherApiError(
            res.status,
            `posts call failed: HTTP ${res.status} body=${errBody.slice(0, 500)}`,
          );
        }

        const headerId = res.headers.get('x-restli-id');
        let platformPostId = headerId ?? '';
        if (!platformPostId) {
          try {
            const json = (await res.json()) as { id?: string };
            platformPostId = json.id ?? '';
          } catch {
            // Missing id is handled below.
          }
        }
        if (!platformPostId) {
          throw new LinkedInPublisherApiError(
            500,
            'LinkedIn /posts response missing x-restli-id header and id field',
          );
        }

        return { platformPostId };
      } catch (err) {
        if (err instanceof PublishFailure) throw err;
        const classification = classifyLinkedInError(err);
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

export function createFakeLinkedInPublisher(
  options: { result?: PublishResult; error?: unknown } = {},
): Publisher<typeof socialProfiles.$inferSelect> {
  return {
    async publish() {
      if (Object.prototype.hasOwnProperty.call(options, 'error')) {
        throw options.error;
      }
      return options.result ?? { platformPostId: 'li_fake_1' };
    },
  };
}
