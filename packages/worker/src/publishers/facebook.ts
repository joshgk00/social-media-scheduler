import { createLogger } from '@sms/shared/logger';
import {
  PublishFailure,
  type MediaItem,
  type PublishFailureKind,
  type PublishResult,
  type Publisher,
} from '@sms/shared';
import type { Credentials, SafeProfile } from '@sms/shared/tokens';

// Credentials arrive pre-unsealed from TokenVault - see ADR-0005.

type ClassifiedError = {
  kind: PublishFailureKind;
  httpStatus: number | null;
  errorCode: string;
  message: string;
};

const DEFAULT_GRAPH_VERSION = 'v22.0';
const FACEBOOK_RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);
const FACEBOOK_AUTH_REVOKED_CODE = 190;

const logger = createLogger('facebook-publisher');

class FacebookPublisherCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FacebookPublisherCredentialError';
  }
}

class FacebookPublisherApiError extends Error {
  readonly status: number;
  readonly orphanedPhotoIds?: string[];

  constructor(status: number, message: string, orphanedPhotoIds?: string[]) {
    super(message);
    this.name = 'FacebookPublisherApiError';
    this.status = status;
    this.orphanedPhotoIds = orphanedPhotoIds;
  }
}

function resolveGraphVersion(): string {
  return process.env.FACEBOOK_GRAPH_VERSION ?? DEFAULT_GRAPH_VERSION;
}

function fbBase(): string {
  return `https://graph.facebook.com/${resolveGraphVersion()}`;
}

function readErrorStatus(err: unknown): number | null {
  if (err === null || typeof err !== 'object') return null;
  const candidate = (err as { status?: unknown }).status;
  return typeof candidate === 'number' ? candidate : null;
}

function readFacebookGraphCode(err: unknown): number | null {
  if (err === null || typeof err !== 'object') return null;
  const message = (err as { message?: unknown }).message;
  if (typeof message !== 'string') return null;
  const match = message.match(/code["']?\s*[:=]\s*(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

function classifyFacebookError(err: unknown): ClassifiedError {
  const message = err instanceof Error ? err.message : 'Unknown error';
  const httpStatus = readErrorStatus(err);
  const fbCode = readFacebookGraphCode(err);

  if (err instanceof FacebookPublisherCredentialError) {
    return { kind: 'permanent', httpStatus, errorCode: 'credential_error', message };
  }
  if (httpStatus === 401 || fbCode === FACEBOOK_AUTH_REVOKED_CODE) {
    return {
      kind: 'permanent',
      httpStatus: httpStatus ?? 401,
      errorCode: 'auth_revoked',
      message:
        'Facebook page access token is no longer valid - please reconnect the page',
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

function sanitizeErrorBody(body: string): string {
  return redactTokenShapedSubstrings(body.slice(0, 500));
}

function readFacebookCredentials(profile: SafeProfile, credentials: Credentials): {
  pageAccessToken: string;
  pageId: string;
} {
  if (credentials.kind !== 'oauth2') {
    throw new FacebookPublisherCredentialError(
      'FacebookPublisher requires kind=oauth2 credentials',
    );
  }
  const pageId = profile.platformAccountId;
  if (!pageId) {
    throw new FacebookPublisherCredentialError(
      'Facebook profile missing platformAccountId',
    );
  }

  return {
    pageAccessToken: credentials.accessToken,
    pageId,
  };
}

async function uploadUnpublishedPhoto(args: {
  pageId: string;
  pageAccessToken: string;
  photo: MediaItem;
}): Promise<string> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(args.photo.bytes)], {
    type: args.photo.mimeType,
  });
  formData.append('source', blob, args.photo.fileName ?? 'photo.jpg');
  formData.append('published', 'false');
  formData.append('access_token', args.pageAccessToken);

  const res = await fetch(`${fbBase()}/${args.pageId}/photos`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new FacebookPublisherApiError(
      res.status,
      `photo upload failed: ${sanitizeErrorBody(errBody)}`,
    );
  }
  const json = (await res.json()) as { id?: string };
  if (!json.id) {
    throw new FacebookPublisherApiError(500, 'photo upload response missing id');
  }
  return json.id;
}

export function createFacebookPublisher(): Publisher {
  return {
    async publish(profile, credentials, post, ctx): Promise<PublishResult> {
      try {
        const { pageAccessToken, pageId } = readFacebookCredentials(profile, credentials);
        const videoItem = post.media.find((item) => item.kind === 'video');
        const photoItems = videoItem
          ? []
          : post.media.filter((item) => item.kind === 'image');

        logger.info(
          {
            profileAccountId: profile.platformAccountId,
            correlationId: ctx.correlationId,
            textLength: post.text.length,
            photoCount: photoItems.length,
            hasVideo: !!videoItem,
            hasLink: !!post.linkUrl,
          },
          'Calling Facebook Graph publish',
        );

        if (videoItem) {
          const formData = new FormData();
          const videoBlob = new Blob([new Uint8Array(videoItem.bytes)], {
            type: videoItem.mimeType,
          });
          formData.append('source', videoBlob, videoItem.fileName ?? 'video.mp4');
          formData.append('description', post.text);
          formData.append('access_token', pageAccessToken);

          const res = await fetch(`${fbBase()}/${pageId}/videos`, {
            method: 'POST',
            body: formData,
          });
          if (!res.ok) {
            const errBody = await res.text().catch(() => '');
            throw new FacebookPublisherApiError(
              res.status,
              `video upload failed: ${sanitizeErrorBody(errBody)}`,
            );
          }
          const json = (await res.json()) as { id?: string };
          if (!json.id) {
            throw new FacebookPublisherApiError(500, 'video response missing id');
          }
          return { platformPostId: json.id };
        }

        const orphanedPhotoIds: string[] = [];
        for (const photo of photoItems) {
          try {
            const photoId = await uploadUnpublishedPhoto({
              pageId,
              pageAccessToken,
              photo,
            });
            orphanedPhotoIds.push(photoId);
          } catch (err) {
            const status = err instanceof FacebookPublisherApiError ? err.status : 500;
            const message = err instanceof Error ? err.message : 'unknown';
            throw new FacebookPublisherApiError(
              status,
              `multi-photo upload aborted at index ${orphanedPhotoIds.length}: ${message}`,
              orphanedPhotoIds,
            );
          }
        }

        const formBody = new URLSearchParams();
        formBody.set('message', post.text);
        formBody.set('access_token', pageAccessToken);
        if (post.linkUrl) formBody.set('link', post.linkUrl);
        orphanedPhotoIds.forEach((photoId, idx) => {
          formBody.set(`attached_media[${idx}]`, JSON.stringify({ media_fbid: photoId }));
        });

        const res = await fetch(`${fbBase()}/${pageId}/feed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formBody,
        });
        if (!res.ok) {
          const errBody = await res.text().catch(() => '');
          throw new FacebookPublisherApiError(
            res.status,
            `feed POST failed: ${sanitizeErrorBody(errBody)}`,
            orphanedPhotoIds.length > 0 ? orphanedPhotoIds : undefined,
          );
        }
        const json = (await res.json()) as { id?: string };
        if (!json.id) {
          throw new FacebookPublisherApiError(500, 'feed response missing id');
        }

        return { platformPostId: json.id };
      } catch (err) {
        if (err instanceof PublishFailure) throw err;
        const classification = classifyFacebookError(err);
        throw new PublishFailure({
          kind: classification.kind,
          errorCode: classification.errorCode,
          message: redactTokenShapedSubstrings(classification.message),
          httpStatus: classification.httpStatus ?? undefined,
          cause: err instanceof FacebookPublisherApiError ? undefined : err,
        });
      }
    },
  };
}

export function createFakeFacebookPublisher(
  options: { result?: PublishResult; error?: unknown } = {},
): Publisher<SafeProfile> {
  return {
    async publish() {
      if (Object.prototype.hasOwnProperty.call(options, 'error')) {
        throw options.error;
      }
      return options.result ?? { platformPostId: 'fb_fake_1' };
    },
  };
}
