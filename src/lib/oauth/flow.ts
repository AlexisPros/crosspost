import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { randomToken } from "@/lib/crypto";
import { parsePopupId } from "@/lib/oauth-popup";
import type { OAuthProvider } from "./types";

// Short-lived cookie that carries state and the PKCE verifier from /start to /callback.
const FLOW_TTL_SECONDS = 10 * 60;

type FlowCookie = { state: string; codeVerifier?: string; popupId?: string };

function cookieName(provider: OAuthProvider) {
  return `cp_oauth_${provider.slug}`;
}

function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Stores state (and PKCE verifier) in a cookie and returns the provider's authorize URL. */
export async function beginAuthorization(provider: OAuthProvider, redirectUri: string, popupId?: string): Promise<string> {
  const flow: FlowCookie = { state: randomToken(24), popupId: parsePopupId(popupId) };
  if (provider.usesPkce) flow.codeVerifier = randomToken(48);

  (await cookies()).set(cookieName(provider), JSON.stringify(flow), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // lax: the cookie must be sent on the top-level redirect back from the provider.
    sameSite: "lax",
    path: `/api/oauth/${provider.slug}`,
    maxAge: FLOW_TTL_SECONDS,
  });

  return provider.authorizeUrl({
    state: flow.state,
    redirectUri,
    codeChallenge: flow.codeVerifier && pkceChallenge(flow.codeVerifier),
  });
}

/**
 * Reads and clears the flow cookie, then checks the returned state.
 * Returns the PKCE verifier (if any), or null when the state is missing or does not match.
 */
export async function consumeAuthorization(
  provider: OAuthProvider,
  returnedState: string | null,
): Promise<{ codeVerifier?: string; popupId?: string } | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(cookieName(provider))?.value;
  cookieStore.delete({ name: cookieName(provider), path: `/api/oauth/${provider.slug}` });

  if (!raw || !returnedState) return null;

  let flow: FlowCookie;
  try {
    flow = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!flow || typeof flow.state !== "string" || (flow.codeVerifier !== undefined && typeof flow.codeVerifier !== "string")) return null;

  const expected = Buffer.from(flow.state ?? "");
  const actual = Buffer.from(returnedState);
  if (expected.length === 0 || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  return { codeVerifier: flow.codeVerifier, popupId: parsePopupId(flow.popupId) };
}
