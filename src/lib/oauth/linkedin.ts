import "server-only";
import { z } from "zod";
import { escapeLinkedInText } from "@/lib/post-rules";
import { formBody, providerErrorMessage, requestJson, sendRequest } from "./http";
import { expiresAt, type OAuthProvider } from "./types";

// https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
const AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
// https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
const POSTS_URL = "https://api.linkedin.com/rest/posts";
// Versioned API (YYYYMM). Each version is supported for about a year, so bump it periodically.
const API_VERSION = process.env.LINKEDIN_API_VERSION || "202610";

// openid + profile: "Sign In with LinkedIn using OpenID Connect" (member id and name).
// w_member_social: "Share on LinkedIn" (posting as the member).
const SCOPES = ["openid", "profile", "w_member_social"];

const tokenResponse = z.object({
  access_token: z.string(),
  expires_in: z.number().optional(),
  // Only issued to apps approved for programmatic refresh; normally absent.
  refresh_token: z.string().optional(),
  refresh_token_expires_in: z.number().optional(),
  scope: z.string().optional(),
});

const userinfoResponse = z.object({
  sub: z.string(),
  name: z.string().optional(),
});

function credentials() {
  return {
    clientId: process.env.LINKEDIN_CLIENT_ID ?? "",
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET ?? "",
  };
}

// No refresh(): LinkedIn tokens live 60 days and are renewed by running the
// authorization flow again (consent is skipped while the member is logged in).
// No revoke(): LinkedIn does not document a revocation endpoint for member tokens;
// members remove access in their LinkedIn settings.
export const linkedinProvider: OAuthProvider = {
  provider: "LINKEDIN",
  slug: "linkedin",
  label: "LinkedIn",
  usesPkce: false,

  isConfigured() {
    const { clientId, clientSecret } = credentials();
    return Boolean(clientId && clientSecret);
  },

  authorizeUrl({ state, redirectUri }) {
    const url = new URL(AUTHORIZE_URL);
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: credentials().clientId,
      redirect_uri: redirectUri,
      scope: SCOPES.join(" "),
      state,
    })
      .toString()
      // Encode spaces in scope as %20, as in the provider docs (URLSearchParams uses +).
      .replaceAll("+", "%20");
    return url.toString();
  },

  async exchangeCode({ code, redirectUri }) {
    const { clientId, clientSecret } = credentials();
    const json = await requestJson(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    const data = tokenResponse.parse(json);
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      accessTokenExpiresAt: expiresAt(data.expires_in),
      refreshTokenExpiresAt: expiresAt(data.refresh_token_expires_in),
      scopes: data.scope ?? null,
    };
  },

  async fetchProfile(accessToken) {
    const json = await requestJson(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = userinfoResponse.parse(json);
    return { externalId: data.sub, displayName: data.name ?? data.sub };
  },

  async publish({ accessToken, externalId, text }) {
    const response = await sendRequest(POSTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": API_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        // The OpenID Connect `sub` is the member id used in person URNs.
        author: `urn:li:person:${externalId}`,
        commentary: escapeLinkedInText(text),
        visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
    });
    const responseBody = { body: response.body, headers: response.headers };

    // The post URN (urn:li:share:… or urn:li:ugcPost:…) comes in a header; the body is empty.
    const urn = response.headers["x-restli-id"];
    if (response.status === 201 && urn) {
      return {
        ok: true,
        httpStatus: response.status,
        responseBody,
        externalPostId: urn,
        postUrl: `https://www.linkedin.com/feed/update/${urn}/`,
      };
    }
    return {
      ok: false,
      httpStatus: response.status,
      responseBody,
      errorMessage: providerErrorMessage(response.body) ?? `HTTP ${response.status}`,
    };
  },
};
