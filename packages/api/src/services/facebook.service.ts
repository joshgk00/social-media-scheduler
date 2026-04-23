import { createLogger } from '@sms/shared/logger';

const logger = createLogger('facebook-service');

const DEFAULT_GRAPH_VERSION = 'v25.0';

export class FacebookApiError extends Error {
  public readonly status: number;
  public readonly body: string;
  public readonly code?: number;

  constructor(status: number, body: string, code?: number) {
    super(`Facebook API error ${status}${code !== undefined ? ` (code ${code})` : ''}`);
    this.name = 'FacebookApiError';
    this.status = status;
    this.body = body;
    this.code = code;
  }
}

export interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  category?: string;
  tasks?: string[];
  fan_count?: number;
}

function resolveGraphVersion(): string {
  const fromEnv = process.env.FACEBOOK_GRAPH_VERSION;
  if (!fromEnv) {
    logger.warn({ missingEnv: 'FACEBOOK_GRAPH_VERSION' }, 'using default Facebook Graph version');
    return DEFAULT_GRAPH_VERSION;
  }
  return fromEnv;
}

async function readBodyText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function parseErrorCode(body: string): number | undefined {
  try {
    const parsed = JSON.parse(body) as { error?: { code?: number } };
    return parsed?.error?.code;
  } catch {
    return undefined;
  }
}

export async function buildAuthorizeUrl(args: {
  state: string;
  appId: string;
  redirectUri: string;
  scope: string;
  graphVersion?: string;
}): Promise<string> {
  const graphVersion = args.graphVersion ?? resolveGraphVersion();
  const params = new URLSearchParams({
    client_id: args.appId,
    redirect_uri: args.redirectUri,
    state: args.state,
    scope: args.scope,
    response_type: 'code',
  });
  return `https://www.facebook.com/${graphVersion}/dialog/oauth?${params.toString()}`;
}

export async function exchangeAuthorizationCode(args: {
  code: string;
  appId: string;
  appSecret: string;
  redirectUri: string;
  graphVersion?: string;
}): Promise<{ shortLivedToken: string; expiresIn: number }> {
  const graphVersion = args.graphVersion ?? resolveGraphVersion();
  const params = new URLSearchParams({
    client_id: args.appId,
    client_secret: args.appSecret,
    redirect_uri: args.redirectUri,
    code: args.code,
  });
  const url = `https://graph.facebook.com/${graphVersion}/oauth/access_token?${params.toString()}`;

  const response = await fetch(url);
  if (!response.ok) {
    const bodyText = await readBodyText(response);
    const code = parseErrorCode(bodyText);
    logger.warn({ statusCode: response.status, platform: 'facebook' }, 'code exchange failed');
    throw new FacebookApiError(response.status, bodyText, code);
  }

  const payload = (await response.json()) as { access_token: string; expires_in?: number };
  return { shortLivedToken: payload.access_token, expiresIn: payload.expires_in ?? 0 };
}

export async function exchangeShortLivedToken(args: {
  shortLivedToken: string;
  appId: string;
  appSecret: string;
  graphVersion?: string;
}): Promise<{ longLivedUserToken: string; expiresIn: number }> {
  const graphVersion = args.graphVersion ?? resolveGraphVersion();
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: args.appId,
    client_secret: args.appSecret,
    fb_exchange_token: args.shortLivedToken,
  });
  const url = `https://graph.facebook.com/${graphVersion}/oauth/access_token?${params.toString()}`;

  const response = await fetch(url);
  if (!response.ok) {
    const bodyText = await readBodyText(response);
    const code = parseErrorCode(bodyText);
    logger.warn({ statusCode: response.status, platform: 'facebook' }, 'long-lived exchange failed');
    throw new FacebookApiError(response.status, bodyText, code);
  }

  const payload = (await response.json()) as { access_token: string; expires_in?: number };
  return { longLivedUserToken: payload.access_token, expiresIn: payload.expires_in ?? 0 };
}

export async function fetchUserPages(args: {
  longLivedUserToken: string;
  graphVersion?: string;
}): Promise<FacebookPage[]> {
  const graphVersion = args.graphVersion ?? resolveGraphVersion();
  const params = new URLSearchParams({
    fields: 'id,name,access_token,category,tasks,fan_count',
    access_token: args.longLivedUserToken,
  });
  const url = `https://graph.facebook.com/${graphVersion}/me/accounts?${params.toString()}`;

  const response = await fetch(url);
  if (!response.ok) {
    const bodyText = await readBodyText(response);
    const code = parseErrorCode(bodyText);
    logger.warn({ statusCode: response.status, platform: 'facebook' }, 'me/accounts failed');
    throw new FacebookApiError(response.status, bodyText, code);
  }

  const payload = (await response.json()) as { data?: FacebookPage[] };
  const pages = payload.data ?? [];
  // CREATE_CONTENT is the task permission required to publish on behalf of a Page.
  // RESEARCH Open Q 5 — filter here to avoid presenting Pages the user can't post to.
  return pages.filter((page) => page.tasks?.includes('CREATE_CONTENT'));
}

export async function pingPageToken(args: {
  pageToken: string;
  graphVersion?: string;
}): Promise<{ ok: boolean; errorCode?: number }> {
  const graphVersion = args.graphVersion ?? resolveGraphVersion();
  const url = `https://graph.facebook.com/${graphVersion}/me?fields=id&access_token=${encodeURIComponent(args.pageToken)}`;

  // pingPageToken never throws on HTTP error — the worker branches on
  // `ok` + `errorCode === 190` to decide between refresh/re-auth flows.
  const response = await fetch(url);
  if (response.ok) {
    return { ok: true };
  }

  const bodyText = await readBodyText(response);
  const errorCode = parseErrorCode(bodyText);
  return { ok: false, errorCode };
}
