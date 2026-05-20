// Twitter delete service. Given a social_profiles row (with encrypted OAuth
// tokens) plus the platform post ID, constructs a TwitterApi client and
// deletes the tweet via the v2 endpoint.
//
// CREDENTIAL DISCIPLINE (T-05-03-01): mirrors Twitter publisher handling
// exactly -- plaintext tokens are const-scoped, never logged, never cached.
//
// D-13: Platform 404 (post already deleted externally) is treated as
// success. The auto-destruct lifecycle service sees { deleted: true } and
// commits the post to 'destroyed' status.

import { TwitterApi, ApiResponseError } from 'twitter-api-v2';
import { createLogger } from '@sms/shared/logger';
import type { ProfileWithEncryptedTokens, TokenVault } from '@sms/shared/tokens';
import type { socialProfiles } from '@sms/db';

export interface DeleteTweetArgs {
  profile: typeof socialProfiles.$inferSelect;
  platformPostId: string;
  correlationId: string;
  vault: TokenVault;
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
  const { profile, platformPostId, correlationId, vault } = args;

  const credentials = vault.unsealForProfile(profile as ProfileWithEncryptedTokens);
  if (credentials.kind !== 'twitter') {
    throw new TwitterDeleteCredentialError(
      `Profile ${profile.id} is not a Twitter credential profile`,
    );
  }

  const client = new TwitterApi({
    appKey: credentials.consumerKey,
    appSecret: credentials.consumerSecret,
    accessToken: credentials.accessToken,
    accessSecret: credentials.accessTokenSecret,
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
