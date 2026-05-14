// Twitter publish service. Given a social_profiles row (with encrypted OAuth
// tokens) plus the post text, constructs a TwitterApi client and posts a
// single tweet via the v2 endpoint. Returns the Twitter-assigned tweet id
// for persistence into `posts.platform_post_id`.
//
// CREDENTIAL DISCIPLINE (SEC-04 / D-06 / T-04-03-01):
//   - Plaintext tokens are created as `const` inside this single function.
//   - They are passed directly to the TwitterApi constructor and never
//     retained outside the function scope.
//   - They are never logged. The logger binding includes only profileId,
//     postId, and correlationId — no token-shaped values.
//   - No caching: a fresh client is built per call. The decrypt cost is
//     ~microseconds; the risk of a cached-token leak is not worth it.
//
// THREADS: Phase 4 ships single-tweet publishing only. A post flagged
// `isThread = true` is rejected with a lifecycle abort so it stays in the
// scheduled state for Phase 4.5 to handle without a half-written thread.

import { TwitterApi } from 'twitter-api-v2';
import { decrypt, validateEncryptionKey } from '@sms/shared/encryption';
import { createLogger } from '@sms/shared/logger';
import type { socialProfiles } from '@sms/db';

export interface CallTwitterArgs {
  profile: typeof socialProfiles.$inferSelect;
  postText: string;
  isThread: boolean;
  correlationId: string;
}

export interface CallTwitterResult {
  platformPostId: string;
}

export class TwitterPublishCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TwitterPublishCredentialError';
  }
}

export class TwitterPublishUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TwitterPublishUnsupportedError';
  }
}

const logger = createLogger('twitter-publish');

export async function callTwitter(args: CallTwitterArgs): Promise<CallTwitterResult> {
  const { profile, postText, isThread, correlationId } = args;

  // Phase 4 scope: single-tweet path only.
  if (isThread) {
    throw new TwitterPublishUnsupportedError(
      'Thread publishing is not supported in Phase 4 — single-tweet path only.',
    );
  }

  // Env var read here, inside the function (CLAUDE.md: no module-scope env).
  const rawKey = process.env.ENCRYPTION_KEY;
  if (!rawKey) {
    throw new TwitterPublishCredentialError(
      'ENCRYPTION_KEY env var is not set — cannot decrypt Twitter credentials',
    );
  }
  const encryptionKey = validateEncryptionKey(rawKey);

  if (
    !profile.consumerKeyCiphertext ||
    !profile.consumerKeyIv ||
    !profile.consumerKeyAuthTag ||
    !profile.consumerSecretCiphertext ||
    !profile.consumerSecretIv ||
    !profile.consumerSecretAuthTag ||
    !profile.accessTokenCiphertext ||
    !profile.accessTokenIv ||
    !profile.accessTokenAuthTag ||
    !profile.accessTokenSecretCiphertext ||
    !profile.accessTokenSecretIv ||
    !profile.accessTokenSecretAuthTag
  ) {
    throw new TwitterPublishCredentialError(
      `Profile ${profile.id} is missing one or more encrypted Twitter credential fields`,
    );
  }

  const consumerKey = decrypt(
    profile.consumerKeyCiphertext,
    profile.consumerKeyIv,
    profile.consumerKeyAuthTag,
    encryptionKey,
  );
  const consumerSecret = decrypt(
    profile.consumerSecretCiphertext,
    profile.consumerSecretIv,
    profile.consumerSecretAuthTag,
    encryptionKey,
  );
  const accessToken = decrypt(
    profile.accessTokenCiphertext,
    profile.accessTokenIv,
    profile.accessTokenAuthTag,
    encryptionKey,
  );
  const accessSecret = decrypt(
    profile.accessTokenSecretCiphertext,
    profile.accessTokenSecretIv,
    profile.accessTokenSecretAuthTag,
    encryptionKey,
  );

  const client = new TwitterApi({
    appKey: consumerKey,
    appSecret: consumerSecret,
    accessToken,
    accessSecret,
  });

  logger.info(
    { profileId: profile.id, correlationId, textLength: postText.length },
    'Calling Twitter v2.tweet',
  );

  const response = await client.v2.tweet({ text: postText });

  if (!response?.data?.id) {
    throw new Error('Twitter API returned no tweet id in response');
  }

  return { platformPostId: response.data.id };
}
