import { Router } from 'express';
import type { Redis } from 'ioredis';
import type { Db } from '@sms/db';

import {
  oauthStartQuerySchema,
  oauthCallbackQuerySchema,
  finalizeOAuthSchema,
  finalizeAsNewSchema,
} from '@sms/shared';
import { createLogger } from '@sms/shared/logger';

import {
  OAuthServiceError,
  MismatchedAccountError,
  createOAuthState,
  consumeOAuthState,
  createPendingSelection,
  peekPendingSelection,
  consumePendingSelection,
  validateReturnTo,
  type OAuthStatePayload,
  type PendingSelectionPayload,
} from '../services/oauth.service.js';
import {
  buildAuthorizeUrl as linkedinBuildAuthorizeUrl,
  exchangeAuthorizationCode as linkedinExchangeAuthorizationCode,
  fetchUserInfo as linkedinFetchUserInfo,
  fetchPostableOrgs as linkedinFetchPostableOrgs,
  LinkedInApiError,
} from '../services/linkedin.service.js';
import {
  buildAuthorizeUrl as facebookBuildAuthorizeUrl,
  exchangeAuthorizationCode as facebookExchangeAuthorizationCode,
  exchangeShortLivedToken as facebookExchangeShortLivedToken,
  fetchUserPages as facebookFetchUserPages,
  FacebookApiError,
} from '../services/facebook.service.js';
import {
  createProfileFromOAuth,
  reconnectProfile,
  ProfileServiceError,
} from '../services/profile.service.js';
import { requireAuth } from '../middleware/auth-guard.js';

const logger = createLogger('oauth-router');

// Scope supersets — Personal vs Company profiles share the same authorize URL;
// the Company connect simply exercises the org scopes while Personal ignores
// them. Picked per platform at /oauth/start time.
const LINKEDIN_SCOPE =
  'openid profile email w_member_social w_organization_social r_organization_social rw_organization_admin';
const FACEBOOK_SCOPE = 'pages_show_list,pages_read_engagement,pages_manage_posts';

interface OAuthRouterDependencies {
  db: Db;
  redis: Redis;
}

type Platform = 'linkedin' | 'facebook';

function resolveRedirectUri(platform: Platform): string {
  const base = process.env.OAUTH_REDIRECT_BASE_URL;
  if (!base) {
    throw new OAuthServiceError('oauth not configured', 500, 'oauth_not_configured');
  }
  return `${base}/api/oauth/callback/${platform}`;
}

function errorRedirect(res: import('express').Response, returnTo: string, code: string): void {
  // WR-01: use URLSearchParams.set() so a replayed callback (or a returnTo
  // that already carries `oauth_error`) doesn't produce
  // `?oauth_error=foo&oauth_error=bar`. `validateReturnTo` guarantees
  // `returnTo` is a relative path starting with `/`, so the dummy base is
  // only used to parse pathname/search/hash.
  const url = new URL(returnTo, 'http://internal');
  url.searchParams.set('oauth_error', code);
  res.redirect(`${url.pathname}${url.search}${url.hash}`);
}

export function createOAuthRouter({ db, redis }: OAuthRouterDependencies): Router {
  const router = Router();

  // ------------------------------------------------------------------
  // GET /api/oauth/start/:platform
  // ------------------------------------------------------------------
  router.get('/api/oauth/start/:platform', requireAuth, async (req, res) => {
    const parsed = oauthStartQuerySchema.safeParse({
      platform: req.params.platform,
      reconnect: req.query.reconnect,
      returnTo: req.query.returnTo,
    });
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid platform or query' });
      return;
    }

    try {
      const returnTo = validateReturnTo(parsed.data.returnTo);
      const platform = parsed.data.platform as Platform;
      const scope = platform === 'linkedin' ? LINKEDIN_SCOPE : FACEBOOK_SCOPE;

      const payload: OAuthStatePayload = {
        userId: req.session.userId!,
        platform,
        scope,
        returnTo,
        reconnectProfileId: parsed.data.reconnect ?? null,
      };
      const state = await createOAuthState(redis, payload);
      const redirectUri = resolveRedirectUri(platform);

      let authorizeUrl: string;
      if (platform === 'linkedin') {
        const clientId = process.env.LINKEDIN_CLIENT_ID;
        if (!clientId) {
          throw new OAuthServiceError('linkedin not configured', 500, 'oauth_not_configured');
        }
        authorizeUrl = await linkedinBuildAuthorizeUrl({
          state,
          clientId,
          redirectUri,
          scope,
        });
      } else {
        const appId = process.env.FACEBOOK_APP_ID;
        if (!appId) {
          throw new OAuthServiceError('facebook not configured', 500, 'oauth_not_configured');
        }
        authorizeUrl = await facebookBuildAuthorizeUrl({
          state,
          appId,
          redirectUri,
          scope,
        });
      }

      res.redirect(authorizeUrl);
    } catch (err: unknown) {
      if (err instanceof OAuthServiceError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code });
        return;
      }
      throw err;
    }
  });

  // ------------------------------------------------------------------
  // GET /api/oauth/callback/:platform
  // NO requireAuth — provider invokes this and the session cookie still
  // rides along. Inside we verify session.userId === statePayload.userId.
  // ------------------------------------------------------------------
  router.get('/api/oauth/callback/:platform', async (req, res) => {
    // Default redirect target when we have no state payload yet.
    let returnTo = '/profiles';

    // Validate the route param against the same enum as the start handler so
    // an unknown :platform never reaches the provider-specific branches below.
    const platformParse = oauthStartQuerySchema.shape.platform.safeParse(req.params.platform);
    if (!platformParse.success) {
      errorRedirect(res, returnTo, 'invalid_state');
      return;
    }
    const platform: Platform = platformParse.data;

    try {
      const parsed = oauthCallbackQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        errorRedirect(res, returnTo, 'invalid_state');
        return;
      }

      if (parsed.data.error) {
        // Most commonly `access_denied` when the user clicks Cancel on the
        // provider's consent screen. Surface as a friendly toast.
        const code = parsed.data.error === 'access_denied' ? 'access_denied' : 'token_exchange_failed';
        errorRedirect(res, returnTo, code);
        return;
      }

      if (!parsed.data.code) {
        errorRedirect(res, returnTo, 'invalid_state');
        return;
      }

      const statePayload = await consumeOAuthState(redis, parsed.data.state);
      if (!statePayload) {
        errorRedirect(res, returnTo, 'invalid_state');
        return;
      }

      returnTo = statePayload.returnTo;

      // The callback route must match the platform originally bound into the
      // OAuth state; otherwise a valid nonce could be consumed on the wrong
      // provider callback route, producing a pending selection/profile for the
      // wrong provider.
      if (platform !== statePayload.platform) {
        errorRedirect(res, returnTo, 'invalid_state');
        return;
      }

      // Session binding check — the nonce was allocated to this user; if the
      // browser's session cookie disagrees, treat it as a stale/replayed flow.
      const sessionUserId = req.session?.userId;
      if (!sessionUserId || sessionUserId !== statePayload.userId) {
        errorRedirect(res, returnTo, 'invalid_state');
        return;
      }

      const redirectUri = resolveRedirectUri(platform);
      let pendingPayload: PendingSelectionPayload;

      if (platform === 'linkedin') {
        const clientId = process.env.LINKEDIN_CLIENT_ID;
        const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
          errorRedirect(res, returnTo, 'token_exchange_failed');
          return;
        }

        let tokenResponse;
        try {
          tokenResponse = await linkedinExchangeAuthorizationCode({
            code: parsed.data.code,
            clientId,
            clientSecret,
            redirectUri,
          });
        } catch (err) {
          logger.warn({ err: err instanceof Error ? err.message : String(err), platform }, 'token exchange failed');
          errorRedirect(res, returnTo, 'token_exchange_failed');
          return;
        }

        let userInfo;
        let orgs: Array<{ orgUrn: string; name: string }> = [];
        try {
          userInfo = await linkedinFetchUserInfo(tokenResponse.access_token);
          // Only fetch orgs when the scope requested it. Personal-only flows
          // skip this to avoid unnecessary 403s.
          if (statePayload.scope.includes('rw_organization_admin')) {
            orgs = await linkedinFetchPostableOrgs({
              accessToken: tokenResponse.access_token,
              apiVersion: process.env.LINKEDIN_API_VERSION ?? '202604',
            });
          }
        } catch (err) {
          if (err instanceof LinkedInApiError) {
            errorRedirect(res, returnTo, 'platform_api_error');
            return;
          }
          throw err;
        }

        const accounts: PendingSelectionPayload['accounts'] = [];
        // Personal profile is always an option.
        accounts.push({
          platformAccountId: userInfo.sub,
          name: userInfo.name,
          subLabel: 'Personal profile',
          kind: 'personal',
        });
        for (const org of orgs) {
          accounts.push({
            platformAccountId: org.orgUrn,
            name: org.name,
            subLabel: 'Company page',
            kind: 'organization',
            orgName: org.name,
          });
        }

        pendingPayload = {
          userId: statePayload.userId,
          platform,
          platformUserId: userInfo.sub,
          displayName: userInfo.name,
          handle: userInfo.name,
          userToken: tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token,
          refreshTokenExpiresInSeconds: tokenResponse.refresh_token_expires_in,
          tokenExpiresInSeconds: tokenResponse.expires_in,
          accounts,
        };
      } else {
        const appId = process.env.FACEBOOK_APP_ID;
        const appSecret = process.env.FACEBOOK_APP_SECRET;
        if (!appId || !appSecret) {
          errorRedirect(res, returnTo, 'token_exchange_failed');
          return;
        }

        const graphVersion = process.env.FACEBOOK_GRAPH_VERSION ?? 'v25.0';

        try {
          const shortExchange = await facebookExchangeAuthorizationCode({
            code: parsed.data.code,
            appId,
            appSecret,
            redirectUri,
            graphVersion,
          });
          const longExchange = await facebookExchangeShortLivedToken({
            shortLivedToken: shortExchange.shortLivedToken,
            appId,
            appSecret,
            graphVersion,
          });

          const pages = await facebookFetchUserPages({
            longLivedUserToken: longExchange.longLivedUserToken,
            graphVersion,
          });

          pendingPayload = {
            userId: statePayload.userId,
            platform,
            platformUserId: 'me',
            displayName: '',
            handle: '',
            userToken: longExchange.longLivedUserToken,
            tokenExpiresInSeconds: longExchange.expiresIn,
            accounts: pages.map((page) => ({
              platformAccountId: page.id,
              name: page.name,
              subLabel: page.category,
              kind: 'page' as const,
              pageName: page.name,
              followerCount: page.fan_count,
              pageAccessToken: page.access_token,
            })),
          };
        } catch (err) {
          if (err instanceof FacebookApiError) {
            const code = err.status >= 500 ? 'token_exchange_failed' : 'platform_api_error';
            errorRedirect(res, returnTo, code);
            return;
          }
          throw err;
        }
      }

      const tempToken = await createPendingSelection(redis, pendingPayload);
      const separator = returnTo.includes('?') ? '&' : '?';
      res.redirect(`${returnTo}${separator}connect=${encodeURIComponent(tempToken)}`);
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, 'callback unexpected error');
      errorRedirect(res, returnTo, 'platform_api_error');
    }
  });

  // ------------------------------------------------------------------
  // GET /api/oauth/pending/:tempToken
  // ------------------------------------------------------------------
  router.get('/api/oauth/pending/:tempToken', requireAuth, async (req, res) => {
    const tempToken = req.params.tempToken as string;
    const payload = await peekPendingSelection(redis, tempToken);
    if (!payload) {
      res.status(404).json({ error: 'Pending selection not found or expired' });
      return;
    }
    if (payload.userId !== req.session.userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    // Strip token material — the picker UI only needs the account list and
    // the platform. WR-08: emit the fields the picker actually reads
    // (`displayName`, `kind`, `orgName`, `pageName`, `followerCount`) so
    // LinkedIn Company Pages stop rendering as "— Personal Profile".
    res.json({
      platform: payload.platform,
      accounts: payload.accounts.map((account) => ({
        platformAccountId: account.platformAccountId,
        displayName: account.name,
        subLabel: account.subLabel,
        kind: account.kind,
        orgName: account.orgName,
        pageName: account.pageName,
        followerCount: account.followerCount,
      })),
    });
  });

  // ------------------------------------------------------------------
  // Shared finalize path — used by both /finalize and /finalize-as-new.
  // The `forceNew` flag forces create even when the pending payload
  // carried a reconnectProfileId.
  // ------------------------------------------------------------------
  async function handleFinalize(
    req: import('express').Request,
    res: import('express').Response,
    forceNew: boolean,
  ): Promise<void> {
    const schema = forceNew ? finalizeAsNewSchema : finalizeOAuthSchema;
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const payload = await consumePendingSelection(redis, parsed.data.tempToken);
    if (!payload) {
      res.status(404).json({ error: 'Pending selection not found or expired' });
      return;
    }
    if (payload.userId !== req.session.userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const selected = payload.accounts.find(
      (account) => account.platformAccountId === parsed.data.platformAccountId,
    );
    if (!selected) {
      res.status(404).json({ error: 'Selected account not in pending list' });
      return;
    }

    // For Facebook the persisted access token is the per-page token (RESEARCH
    // Pitfall 4), not the long-lived user token.
    const accessTokenForPersist =
      payload.platform === 'facebook' && selected.pageAccessToken
        ? selected.pageAccessToken
        : payload.userToken;

    const tokenExpiresAt = payload.tokenExpiresInSeconds
      ? new Date(Date.now() + payload.tokenExpiresInSeconds * 1000)
      : null;
    const refreshTokenExpiresAt = payload.refreshTokenExpiresInSeconds
      ? new Date(Date.now() + payload.refreshTokenExpiresInSeconds * 1000)
      : null;

    // The pending payload is created by the callback handler, and the
    // reconnectProfileId travels on the state nonce. We keep a copy of it on
    // the pending payload in practice — but the interface intentionally lets
    // the caller override via forceNew.
    const reconnectProfileId = forceNew
      ? null
      : ((payload as PendingSelectionPayload & { reconnectProfileId?: string | null }).reconnectProfileId ?? null);

    try {
      let profileId: string;
      if (reconnectProfileId) {
        const result = await reconnectProfile(db, {
          userId: payload.userId,
          profileId: reconnectProfileId,
          platform: payload.platform,
          incomingPlatformUserId: payload.platformUserId,
          incomingPlatformAccountId: selected.platformAccountId,
          accessToken: accessTokenForPersist,
          refreshToken: payload.refreshToken ?? null,
          tokenExpiresAt,
          refreshTokenExpiresAt,
          incomingHandle: payload.handle || selected.name,
        });
        profileId = result.profileId;
      } else {
        const result = await createProfileFromOAuth(db, {
          userId: payload.userId,
          platform: payload.platform,
          platformUserId: payload.platformUserId,
          platformAccountId: selected.platformAccountId,
          displayName: selected.name,
          handle: payload.handle || selected.name,
          avatarUrl: null,
          accessToken: accessTokenForPersist,
          refreshToken: payload.refreshToken ?? null,
          tokenExpiresAt,
          refreshTokenExpiresAt,
        });
        profileId = result.profileId;
      }

      res.status(201).json({ profileId });
    } catch (err: unknown) {
      if (err instanceof MismatchedAccountError) {
        // WR-02: pull the handles off the typed error rather than regex-parsing
        // the message, so a future service-side message tweak can't silently
        // break the frontend contract.
        res.status(err.statusCode).json({
          error: 'mismatched_account',
          existingHandle: err.existingHandle,
          incomingHandle: err.incomingHandle,
          // Re-issue the temp token so the frontend can call /finalize-as-new
          // without forcing the user back through the provider.
          tempToken: await createPendingSelection(redis, payload),
        });
        return;
      }
      if (err instanceof ProfileServiceError || err instanceof OAuthServiceError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      throw err;
    }
  }

  router.post('/api/oauth/finalize', requireAuth, async (req, res) => {
    await handleFinalize(req, res, false);
  });

  router.post('/api/oauth/finalize-as-new', requireAuth, async (req, res) => {
    await handleFinalize(req, res, true);
  });

  return router;
}
