// Facebook publish service. Mirrors callTwitter / callLinkedIn shape; uses
// node:fetch directly to graph.facebook.com (RESEARCH §Pitfall 8 — the
// business-sdk targets marketing/ads, not Page publishing).
//
// CREDENTIAL DISCIPLINE (T-WORKER-03 / SEC-04): plaintext page access token
// stays in function scope, no caching, no logging. Error bodies are scrubbed
// of token-shaped substrings before they leave this module.
//
// MULTI-PHOTO PARTIAL FAILURE (T-WORKER-02): when a photo upload fails
// mid-sequence, the thrown FacebookPublishApiError carries the
// `orphanedPhotoIds` collected so far so the caller can clean up.

import { decrypt, validateEncryptionKey } from '@sms/shared/encryption';
import { createLogger } from '@sms/shared/logger';
import type { socialProfiles } from '@sms/db';

const DEFAULT_GRAPH_VERSION = 'v22.0';

function resolveGraphVersion(): string {
  return process.env.FACEBOOK_GRAPH_VERSION ?? DEFAULT_GRAPH_VERSION;
}

function fbBase(): string {
  return `https://graph.facebook.com/${resolveGraphVersion()}`;
}

// Match Phase 7 facebook.service.ts sanitization — long base64url/hex/jwt-like
// substrings are the highest-risk credential leak vector in error bodies.
const TOKEN_SHAPED_SEQUENCE_RE = /[A-Za-z0-9_-]{32,}/g;
function sanitizeErrorBody(body: string): string {
  return body.slice(0, 500).replace(TOKEN_SHAPED_SEQUENCE_RE, '[redacted]');
}

export type FacebookMediaItem =
  | { kind: 'image'; bytes: Buffer; fileName?: string; mimeType?: string }
  | { kind: 'video'; bytes: Buffer; fileName?: string; mimeType?: string };

export interface CallFacebookArgs {
  profile: typeof socialProfiles.$inferSelect;
  postText: string;
  linkUrl?: string | null;
  mediaItems?: FacebookMediaItem[];
  correlationId: string;
}

export interface CallFacebookResult {
  platformPostId: string;
  observedCallCount?: number;
  uploadedPhotoIds?: string[];
}

export class FacebookPublishCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FacebookPublishCredentialError';
  }
}

export class FacebookPublishApiError extends Error {
  readonly status: number;
  readonly orphanedPhotoIds?: string[]; // T-WORKER-02: surfaced for cleanup
  constructor(status: number, message: string, orphanedPhotoIds?: string[]) {
    super(message);
    this.name = 'FacebookPublishApiError';
    this.status = status;
    this.orphanedPhotoIds = orphanedPhotoIds;
  }
}

const logger = createLogger('facebook-publish');

function readPageUsage(res: Response): number | undefined {
  const header = res.headers.get('x-page-usage');
  if (!header) return undefined;
  try {
    const parsed = JSON.parse(header) as { call_count?: number };
    return parsed.call_count;
  } catch {
    return undefined;
  }
}

function asHexString(value: string | Buffer | null): string | null {
  if (value === null) return null;
  // Schema declares these as varchar/text (hex strings), but Wave-0 test
  // fixtures pass Buffers. Normalize either shape into the hex string the
  // shared decrypt() helper expects.
  if (typeof value === 'string') return value;
  return value.toString('hex');
}

async function uploadUnpublishedPhoto(args: {
  pageId: string;
  pageAccessToken: string;
  photo: { bytes: Buffer; fileName?: string; mimeType?: string };
}): Promise<string> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(args.photo.bytes)], {
    type: args.photo.mimeType ?? 'application/octet-stream',
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
    throw new FacebookPublishApiError(
      res.status,
      `photo upload failed: ${sanitizeErrorBody(errBody)}`,
    );
  }
  const json = (await res.json()) as { id?: string };
  if (!json.id) {
    throw new FacebookPublishApiError(500, 'photo upload response missing id');
  }
  return json.id;
}

export async function callFacebook(
  args: CallFacebookArgs,
): Promise<CallFacebookResult> {
  const startedAt = Date.now();
  const photoCount = (args.mediaItems ?? []).filter(
    (item) => item.kind === 'image',
  ).length;
  const videoItem = (args.mediaItems ?? []).find(
    (item): item is FacebookMediaItem & { kind: 'video' } => item.kind === 'video',
  );
  const callLogger = logger.child({
    profileId: args.profile.id,
    correlationId: args.correlationId,
    textLength: args.postText.length,
    photoCount,
    hasVideo: !!videoItem,
    hasLink: !!args.linkUrl,
  });

  // Read env inside function (CLAUDE.md).
  const rawKey = process.env.ENCRYPTION_KEY;
  if (!rawKey) {
    throw new FacebookPublishCredentialError(
      'ENCRYPTION_KEY env var is not set',
    );
  }
  const encryptionKey = validateEncryptionKey(rawKey);

  const cipher = asHexString(
    args.profile.oauth2AccessTokenCiphertext as string | Buffer | null,
  );
  const iv = asHexString(
    args.profile.oauth2AccessTokenIv as string | Buffer | null,
  );
  const authTag = asHexString(
    args.profile.oauth2AccessTokenAuthTag as string | Buffer | null,
  );
  if (!cipher || !iv || !authTag) {
    throw new FacebookPublishCredentialError(
      `Profile ${args.profile.id} missing OAuth 2.0 token fields`,
    );
  }
  const pageAccessToken = decrypt(cipher, iv, authTag, encryptionKey);
  const pageId = args.profile.platformAccountId;
  if (!pageId) {
    throw new FacebookPublishCredentialError(
      `Profile ${args.profile.id} missing platformAccountId`,
    );
  }

  // Path A: video post (POST-FB-03). Single-stage upload (Pitfall 5 — 100 MB cap).
  if (videoItem) {
    const formData = new FormData();
    const videoBlob = new Blob([new Uint8Array(videoItem.bytes)], {
      type: videoItem.mimeType ?? 'video/mp4',
    });
    formData.append('source', videoBlob, videoItem.fileName ?? 'video.mp4');
    formData.append('description', args.postText);
    formData.append('access_token', pageAccessToken);
    const res = await fetch(`${fbBase()}/${pageId}/videos`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new FacebookPublishApiError(
        res.status,
        `video upload failed: ${sanitizeErrorBody(errBody)}`,
      );
    }
    const json = (await res.json()) as { id?: string };
    if (!json.id) {
      throw new FacebookPublishApiError(500, 'video response missing id');
    }
    callLogger.info(
      { durationMs: Date.now() - startedAt },
      'Facebook video publish succeeded',
    );
    return { platformPostId: json.id, observedCallCount: readPageUsage(res) };
  }

  // Path B: multi-photo carousel (POST-FB-02).
  const orphanedPhotoIds: string[] = [];
  const photoItems = (args.mediaItems ?? []).filter(
    (item): item is FacebookMediaItem & { kind: 'image' } => item.kind === 'image',
  );
  if (photoItems.length > 0) {
    for (const photo of photoItems) {
      try {
        const photoId = await uploadUnpublishedPhoto({
          pageId,
          pageAccessToken,
          photo,
        });
        orphanedPhotoIds.push(photoId);
      } catch (err) {
        // T-WORKER-02: surface partial state so the caller can record orphans.
        const status = err instanceof FacebookPublishApiError ? err.status : 500;
        const message = err instanceof Error ? err.message : 'unknown';
        throw new FacebookPublishApiError(
          status,
          `multi-photo upload aborted at index ${orphanedPhotoIds.length}: ${message}`,
          orphanedPhotoIds,
        );
      }
    }
  }

  // Path C / final: feed POST (POST-FB-01 + POST-FB-04). Always issued unless
  // we returned for video.
  const formBody = new URLSearchParams();
  formBody.set('message', args.postText);
  formBody.set('access_token', pageAccessToken);
  if (args.linkUrl) formBody.set('link', args.linkUrl);
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
    throw new FacebookPublishApiError(
      res.status,
      `feed POST failed: ${sanitizeErrorBody(errBody)}`,
      orphanedPhotoIds.length > 0 ? orphanedPhotoIds : undefined,
    );
  }
  const json = (await res.json()) as { id?: string };
  if (!json.id) {
    throw new FacebookPublishApiError(500, 'feed response missing id');
  }
  callLogger.info(
    {
      durationMs: Date.now() - startedAt,
      uploadedPhotoCount: orphanedPhotoIds.length,
    },
    'Facebook publish succeeded',
  );
  return {
    platformPostId: json.id,
    observedCallCount: readPageUsage(res),
    uploadedPhotoIds: orphanedPhotoIds.length > 0 ? orphanedPhotoIds : undefined,
  };
}
