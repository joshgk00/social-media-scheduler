import { createLogger } from '@sms/shared/logger';

const logger = createLogger('linkedin-service');

// WR-03: runtime contract check on LinkedIn token responses. A partial 200
// (malformed proxy rewrite, test environment, future API change) would
// otherwise yield `undefined` fields — `expires_in * 1000` becomes `NaN` in
// downstream date math, and token sealing fails obscurely. Validating
// here keeps the typed LinkedInTokenResponse contract honest at runtime
// without pulling zod into the api package (see CLAUDE.md: don't add new
// dependencies unless required).
function validateLinkedInTokenResponse(
  payload: unknown,
): LinkedInTokenResponse | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.access_token !== 'string' || p.access_token.length === 0) return null;
  if (typeof p.expires_in !== 'number' || !Number.isFinite(p.expires_in) || p.expires_in <= 0) return null;
  if (typeof p.refresh_token !== 'string' || p.refresh_token.length === 0) return null;
  if (
    typeof p.refresh_token_expires_in !== 'number' ||
    !Number.isFinite(p.refresh_token_expires_in) ||
    p.refresh_token_expires_in <= 0
  ) {
    return null;
  }
  if (p.scope !== undefined && typeof p.scope !== 'string') return null;
  return p as unknown as LinkedInTokenResponse;
}

const AUTHORIZATION_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';
const ORG_ACLS_URL = 'https://api.linkedin.com/rest/organizationAcls';
const DEFAULT_API_VERSION = '202604';

// WR-04: redact any long token-shaped substrings (base64url, hex, jwt-like)
// from captured error bodies. LinkedIn's `invalid_grant` response can echo
// the submitted refresh_token back in some error conditions — retaining the
// raw body on the public `body` field is a latent credential-leakage risk
// if any future caller writes `logger.error({ err }, ...)`. The truncated +
// redacted summary is still useful for diagnostics.
const TOKEN_SHAPED_SEQUENCE_RE = /[A-Za-z0-9_-]{32,}/g;

function sanitizeErrorBody(body: string | null | undefined): string {
  if (!body) return '';
  return body.slice(0, 500).replace(TOKEN_SHAPED_SEQUENCE_RE, '[redacted]');
}

export class LinkedInApiError extends Error {
  public readonly status: number;
  public readonly body: string;

  constructor(status: number, body: string) {
    super(`LinkedIn API error ${status}`);
    this.name = 'LinkedInApiError';
    this.status = status;
    // WR-04: never retain the raw body — sanitize before storing.
    this.body = sanitizeErrorBody(body);
  }
}

export interface LinkedInTokenResponse {
  access_token: string;
  expires_in: number;
  // Per RESEARCH Pitfall 3: LinkedIn does NOT rotate the refresh token on refresh.
  refresh_token: string;
  refresh_token_expires_in: number;
  scope: string;
}

export interface LinkedInUserInfo {
  sub: string;
  name: string;
  email?: string;
  picture?: string;
}

export interface LinkedInPostableOrg {
  orgUrn: string;
  name: string;
}

function resolveApiVersion(): string {
  const fromEnv = process.env.LINKEDIN_API_VERSION;
  if (!fromEnv) {
    logger.warn({ missingEnv: 'LINKEDIN_API_VERSION' }, 'using default LinkedIn API version');
    return DEFAULT_API_VERSION;
  }
  return fromEnv;
}

export async function buildAuthorizeUrl(args: {
  state: string;
  clientId: string;
  redirectUri: string;
  scope: string;
}): Promise<string> {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    state: args.state,
    scope: args.scope,
  });
  return `${AUTHORIZATION_URL}?${params.toString()}`;
}

async function readBodyText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

export async function exchangeAuthorizationCode(args: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<LinkedInTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: args.code,
    client_id: args.clientId,
    client_secret: args.clientSecret,
    redirect_uri: args.redirectUri,
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const bodyText = await readBodyText(response);
    logger.warn({ statusCode: response.status, platform: 'linkedin' }, 'token exchange failed');
    throw new LinkedInApiError(response.status, bodyText);
  }

  const parsed = validateLinkedInTokenResponse(await response.json());
  if (!parsed) {
    logger.warn({ platform: 'linkedin' }, 'token exchange returned unexpected shape');
    throw new LinkedInApiError(response.status, 'unexpected token response shape');
  }
  return parsed;
}

export async function refreshAccessToken(args: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<LinkedInTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: args.refreshToken,
    client_id: args.clientId,
    client_secret: args.clientSecret,
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const bodyText = await readBodyText(response);
    logger.warn({ statusCode: response.status, platform: 'linkedin' }, 'refresh failed');
    throw new LinkedInApiError(response.status, bodyText);
  }

  const parsed = validateLinkedInTokenResponse(await response.json());
  if (!parsed) {
    logger.warn({ platform: 'linkedin' }, 'refresh returned unexpected shape');
    throw new LinkedInApiError(response.status, 'unexpected token response shape');
  }
  return parsed;
}

export async function fetchUserInfo(accessToken: string): Promise<LinkedInUserInfo> {
  const response = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const bodyText = await readBodyText(response);
    logger.warn({ statusCode: response.status, platform: 'linkedin' }, 'userinfo failed');
    throw new LinkedInApiError(response.status, bodyText);
  }

  return (await response.json()) as LinkedInUserInfo;
}

export async function fetchPostableOrgs(args: {
  accessToken: string;
  apiVersion?: string;
}): Promise<LinkedInPostableOrg[]> {
  const apiVersion = args.apiVersion ?? resolveApiVersion();
  const url = `${ORG_ACLS_URL}?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=50`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
      'Linkedin-Version': apiVersion,
    },
  });

  if (!response.ok) {
    const bodyText = await readBodyText(response);
    logger.warn({ statusCode: response.status, platform: 'linkedin' }, 'organizationAcls failed');
    throw new LinkedInApiError(response.status, bodyText);
  }

  const payload = (await response.json()) as {
    elements?: Array<Record<string, unknown>>;
  };

  const orgs: LinkedInPostableOrg[] = [];
  for (const rawElement of payload.elements ?? []) {
    // Defensive: LinkedIn has historically returned `organization` OR
    // `organizationTarget` depending on API version — read both (RESEARCH
    // Finding 4). Skip if neither is present so a malformed row doesn't
    // take down the entire picker.
    const element = rawElement as { organization?: string; organizationTarget?: string };
    const orgUrn = element.organization ?? element.organizationTarget;
    if (!orgUrn) {
      logger.warn({ platform: 'linkedin' }, 'skipping organizationAcls row missing both organization and organizationTarget');
      continue;
    }
    // Phase 7 returns the URN as the name placeholder. Phase 8 will enrich
    // via GET /rest/organizations/{urn} if a friendlier display is needed —
    // keeping this path simple avoids an extra round-trip per picker.
    orgs.push({ orgUrn, name: orgUrn });
  }
  return orgs;
}
