import "server-only";
import { z } from "zod";
import { formBody, providerErrorMessage, requestJson, sendRequest } from "./http";
import { expiresAt, type OAuthProvider, type TokenSet } from "./types";

// https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code
const AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.x.com/2/oauth2/token";
const REVOKE_URL = "https://api.x.com/2/oauth2/revoke";
const ME_URL = "https://api.x.com/2/users/me";
// https://docs.x.com/x-api/posts/create-post
const CREATE_POST_URL = "https://api.x.com/2/tweets";

// offline.access is required to get a refresh token (access tokens live ~2 hours).
const SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access"];

const tokenResponse = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number().optional(),
  scope: z.string().optional(),
});

const meResponse = z.object({
  data: z.object({ id: z.string(), name: z.string(), username: z.string() }),
});

const createPostResponse = z.object({ data: z.object({ id: z.string() }) });

function credentials() {
  return { clientId: process.env.X_CLIENT_ID ?? "", clientSecret: process.env.X_CLIENT_SECRET ?? "" };
}

// Confidential client: credentials go in a Basic auth header, not in the body.
function basicAuthHeader(): string {
  const { clientId, clientSecret } = credentials();
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

function toTokenSet(json: unknown): TokenSet {
  const data = tokenResponse.parse(json);
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    accessTokenExpiresAt: expiresAt(data.expires_in),
    refreshTokenExpiresAt: null,
    scopes: data.scope ?? null,
  };
}

async function postToken(params: Record<string, string>): Promise<TokenSet> {
  const json = await requestJson(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: basicAuthHeader() },
    body: formBody(params),
  });
  return toTokenSet(json);
}

export const xProvider: OAuthProvider = {
  provider: "X",
  slug: "x",
  label: "X",
  usesPkce: true,

  isConfigured() {
    const { clientId, clientSecret } = credentials();
    return Boolean(clientId && clientSecret);
  },

  authorizeUrl({ state, redirectUri, codeChallenge }) {
    const url = new URL(AUTHORIZE_URL);
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: credentials().clientId,
      redirect_uri: redirectUri,
      scope: SCOPES.join(" "),
      state,
      code_challenge: codeChallenge ?? "",
      code_challenge_method: "S256",
    })
      .toString()
      // Encode spaces in scope as %20, as in the provider docs (URLSearchParams uses +).
      .replaceAll("+", "%20");
    return url.toString();
  },

  exchangeCode({ code, redirectUri, codeVerifier }) {
    return postToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier ?? "",
    });
  },

  refresh(refreshToken) {
    return postToken({ grant_type: "refresh_token", refresh_token: refreshToken });
  },

  async revoke(token) {
    await requestJson(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: basicAuthHeader() },
      body: formBody({ token }),
    });
  },

  async fetchProfile(accessToken) {
    const json = await requestJson(ME_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
    const { data } = meResponse.parse(json);
    return { externalId: data.id, displayName: `@${data.username}` };
  },

  async publish({ accessToken, text }) {
    const response = await sendRequest(CREATE_POST_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const parsed = createPostResponse.safeParse(response.body);
    const responseBody = { body: response.body, headers: response.headers };

    if (response.status === 201 && parsed.success) {
      const id = parsed.data.data.id;
      return { ok: true, httpStatus: response.status, responseBody, externalPostId: id, postUrl: `https://x.com/i/web/status/${id}` };
    }
    return {
      ok: false,
      httpStatus: response.status,
      responseBody,
      errorMessage: providerErrorMessage(response.body) ?? `HTTP ${response.status}`,
    };
  },
};
