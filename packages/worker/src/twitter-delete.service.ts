// Twitter delete service. Given a social_profiles row (with encrypted OAuth
// tokens) plus the platform post ID, constructs a TwitterApi client and
// deletes the tweet via the v2 endpoint.
//
// CREDENTIAL DISCIPLINE (T-05-03-01): mirrors twitter-publish.service.ts
// exactly -- plaintext tokens are const-scoped, never logged, never cached.
//
// D-13: Platform 404 (post already deleted externally) is treated as
// success. The auto-destruct lifecycle service sees { deleted: true } and
// commits the post to 'destroyed' status.

import { TwitterApi, ApiResponseError } from 'twitter-api-v2';
import { decrypt, validateEncryptionKey } from '@sms/shared/encryption';
import { createLogger } from '@sms/shared/logger';
import type { socialProfiles } from '@sms/db';

export interface DeleteTweetArgs {
  profile: typeof socialProfiles.$inferSelect;
  platformPostId: string;
  correlationId: string;
}

export interface DeleteTweetResult {
  deleted: boolean;
}

export class TwitterDeleteCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TwitterDeleteCredentialError';
  }
}

const logger = createLogger('twitter-delete');

export async function deleteTweet(args: DeleteTweetArgs): Promise<DeleteTweetResult> {
  const { profile, platformPostId, correlationId } = args;

  const rawKey = process.env.ENCRYPTION_KEY;
  if (!rawKey) {
    throw new TwitterDeleteCredentialError(
      'ENCRYPTION_KEY env var is not set -- cannot decrypt Twitter credentials',
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
    throw new TwitterDeleteCredentialError(
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
    { profileId: profile.id, correlationId, platformPostId },
    'Calling Twitter v2.deleteTweet',
  );

  try {
    const response = await client.v2.deleteTweet(platformPostId);
    return { deleted: response?.data?.deleted ?? false };
  } catch (err) {
    // D-13: 404 means the post was already deleted externally -- treat as success
    if (err instanceof ApiResponseError && err.code === 404) {
      logger.info(
        { profileId: profile.id, correlationId, platformPostId },
        'Tweet already deleted (404) -- treating as success',
      );
      return { deleted: true };
    }
    throw err;
  }
}
