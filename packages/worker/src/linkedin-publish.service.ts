// LinkedIn publish service. Given a social_profiles row (with encrypted OAuth 2.0
// access token) plus the post text and optional image, calls the LinkedIn
// /rest/posts endpoint and returns the LinkedIn-assigned URN for persistence
// into `posts.platform_post_id`.
//
// CREDENTIAL DISCIPLINE (T-WORKER-03 / SEC-04): plaintext token stays in
// function scope, no caching, no logging of token-shaped values. Mirrors
// twitter-publish.service.ts exactly.
//
// IMAGE UPLOAD (T-WORKER-01): the 3-step flow (initializeUpload → PUT →
// /rest/posts) MUST abort on PUT failure BEFORE the /rest/posts call so we
// never leave a /posts entry referencing a half-uploaded image URN.

import { decrypt, validateEncryptionKey } from '@sms/shared/encryption';
import { createLogger } from '@sms/shared/logger';
import type { socialProfiles } from '@sms/db';

const DEFAULT_API_VERSION = '202604';
const LINKEDIN_BASE = 'https://api.linkedin.com/rest';

function resolveApiVersion(): string {
  return process.env.LINKEDIN_API_VERSION ?? DEFAULT_API_VERSION;
}

export interface CallLinkedInArgs {
  profile: typeof socialProfiles.$inferSelect;
  postText: string;
  visibility: 'PUBLIC' | 'CONNECTIONS';
  imageBytes?: Buffer;
  correlationId: string;
}

export interface CallLinkedInResult {
  platformPostId: string;
}

export class LinkedInPublishCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LinkedInPublishCredentialError';
  }
}

export class LinkedInPublishApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'LinkedInPublishApiError';
    this.status = status;
  }
}

const logger = createLogger('linkedin-publish');

function buildAuthorUrn(
  profile: typeof socialProfiles.$inferSelect,
): string {
  // Pitfall 9: person vs organization URN.
  // Plan 02 added social_profiles.linkedinAccountType (varchar(16) NOT NULL
  // DEFAULT 'person') — typed access, no `as Record<string, unknown>` cast.
  const accountType = profile.linkedinAccountType;
  const accountId = profile.platformAccountId;
  if (!accountId) {
    throw new LinkedInPublishCredentialError(
      `Profile ${profile.id} missing platformAccountId`,
    );
  }
  // platformAccountId may already be a full URN; if so, use as-is.
  if (accountId.startsWith('urn:li:')) return accountId;
  return accountType === 'organization'
    ? `urn:li:organization:${accountId}`
    : `urn:li:person:${accountId}`;
}

interface InitializeUploadResult {
  uploadUrl: string;
  imageUrn: string;
}

async function initializeImageUpload(args: {
  accessToken: string;
  ownerUrn: string;
  apiVersion: string;
}): Promise<InitializeUploadResult> {
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
    throw new LinkedInPublishApiError(
      res.status,
      `initializeUpload failed: HTTP ${res.status}`,
    );
  }
  const json = (await res.json()) as { value?: { uploadUrl?: string; image?: string } };
  if (!json.value?.uploadUrl || !json.value?.image) {
    throw new LinkedInPublishApiError(
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
    body: args.imageBytes,
  });
  if (!res.ok) {
    // T-WORKER-01: throw before any /posts call so we don't leave an orphaned
    // image URN referenced by a post that never existed.
    throw new LinkedInPublishApiError(
      res.status,
      `image PUT failed: HTTP ${res.status}`,
    );
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

export async function callLinkedIn(
  args: CallLinkedInArgs,
): Promise<CallLinkedInResult> {
  const startedAt = Date.now();
  const callLogger = logger.child({
    profileId: args.profile.id,
    correlationId: args.correlationId,
    textLength: args.postText.length,
    hasImage: !!args.imageBytes,
  });

  // Read env inside function (CLAUDE.md: no module-scope env reads).
  const rawKey = process.env.ENCRYPTION_KEY;
  if (!rawKey) {
    throw new LinkedInPublishCredentialError(
      'ENCRYPTION_KEY env var is not set',
    );
  }
  const encryptionKey = validateEncryptionKey(rawKey);

  // Phase 7 added oauth2AccessToken* columns. Direct field access — no casts.
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
    throw new LinkedInPublishCredentialError(
      `Profile ${args.profile.id} is missing one or more encrypted OAuth 2.0 token fields`,
    );
  }
  const accessToken = decrypt(cipher, iv, authTag, encryptionKey);

  const apiVersion = resolveApiVersion();
  const ownerUrn = buildAuthorUrn(args.profile);

  // 3-step image upload, only if an image is provided.
  let imageUrn: string | undefined;
  if (args.imageBytes) {
    const init = await initializeImageUpload({
      accessToken,
      ownerUrn,
      apiVersion,
    });
    await putImageBinary({
      uploadUrl: init.uploadUrl,
      imageBytes: args.imageBytes,
    });
    imageUrn = init.imageUrn;
  }

  const body: Record<string, unknown> = {
    author: ownerUrn,
    commentary: args.postText,
    visibility: args.visibility,
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
    // Slice prevents over-long bodies from blowing up logs; never echo the
    // request's Authorization header.
    throw new LinkedInPublishApiError(
      res.status,
      `posts call failed: HTTP ${res.status} body=${errBody.slice(0, 500)}`,
    );
  }

  const headerId = res.headers.get('x-restli-id');
  let platformPostId = headerId ?? '';
  if (!platformPostId) {
    // Fallback to body parse (Assumption A3).
    try {
      const json = (await res.json()) as { id?: string };
      platformPostId = json.id ?? '';
    } catch {
      // Swallow — caller will see the missing-id error below.
    }
  }
  if (!platformPostId) {
    throw new LinkedInPublishApiError(
      500,
      'LinkedIn /posts response missing x-restli-id header and id field',
    );
  }

  callLogger.info(
    { durationMs: Date.now() - startedAt },
    'LinkedIn publish succeeded',
  );
  return { platformPostId };
}
