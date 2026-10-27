import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/app-url";
import { db } from "@/lib/db";
import { consumeAuthorization } from "@/lib/oauth/flow";
import { ProviderHttpError } from "@/lib/oauth/http";
import { getProviderBySlug, redirectUri } from "@/lib/oauth/providers";
import { getCurrentUser } from "@/lib/session";
import { encryptToken } from "@/lib/token-crypto";

const CANCEL_ERRORS = new Set(["access_denied", "user_cancelled_authorize", "user_cancelled_login"]);

export async function GET(request: NextRequest, ctx: RouteContext<"/api/oauth/[provider]/callback">) {
  const { provider: slug } = await ctx.params;
  const back = (params: string, popupId?: string) => {
    const url = appUrl(`/connections?provider=${encodeURIComponent(slug)}&${params}`);
    if (popupId) url.searchParams.set("popup", popupId);
    return NextResponse.redirect(url);
  };

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(appUrl("/login"));

  const provider = getProviderBySlug(slug);
  if (!provider) return NextResponse.redirect(appUrl("/connections?error=unknown_provider"));

  const query = request.nextUrl.searchParams;
  // Always consume the flow cookie, even when the provider reports an error.
  const flow = await consumeAuthorization(provider, query.get("state"));
  if (!flow) return back("error=state");

  const providerError = query.get("error");
  if (providerError) {
    // The user cancelled on the provider's page (X: access_denied, LinkedIn: user_cancelled_*).
    if (CANCEL_ERRORS.has(providerError)) return back("error=denied", flow.popupId);
    // Anything else is a configuration problem, e.g. LinkedIn unauthorized_scope_error when a product is missing.
    console.error(`[oauth:${slug}] provider error`, providerError, query.get("error_description") ?? "");
    const code = providerError.replace(/[^a-z_]/gi, "").slice(0, 64);
    return back(`error=provider&code=${code}`, flow.popupId);
  }

  const code = query.get("code");
  if (!code) return back("error=exchange", flow.popupId);

  try {
    const tokens = await provider.exchangeCode({
      code,
      redirectUri: redirectUri(provider),
      codeVerifier: flow.codeVerifier,
    });
    const profile = await provider.fetchProfile(tokens.accessToken);

    const data = {
      externalId: profile.externalId,
      displayName: profile.displayName,
      accessTokenEnc: encryptToken(tokens.accessToken),
      refreshTokenEnc: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
      scopes: tokens.scopes,
      invalidatedAt: null,
      lastError: null,
    };
    await db.socialConnection.upsert({
      where: { userId_provider: { userId: user.id, provider: provider.provider } },
      create: { userId: user.id, provider: provider.provider, ...data },
      update: { ...data, connectedAt: new Date() },
    });
  } catch (error) {
    const detail = error instanceof ProviderHttpError ? JSON.stringify(error.body) : "";
    console.error(`[oauth:${slug}] connect failed`, error instanceof Error ? error.message : error, detail);
    return back("error=exchange", flow.popupId);
  }

  return back("connected=1", flow.popupId);
}
