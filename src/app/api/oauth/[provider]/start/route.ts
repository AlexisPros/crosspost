import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/app-url";
import { parsePopupId } from "@/lib/oauth-popup";
import { beginAuthorization } from "@/lib/oauth/flow";
import { getProviderBySlug, redirectUri } from "@/lib/oauth/providers";
import { getCurrentUser } from "@/lib/session";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/oauth/[provider]/start">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(appUrl("/login"));

  const { provider: slug } = await ctx.params;
  const provider = getProviderBySlug(slug);
  if (!provider) return NextResponse.redirect(appUrl("/connections?error=unknown_provider"));
  const popupId = parsePopupId(request.nextUrl.searchParams.get("popup"));
  if (!provider.isConfigured()) {
    const back = appUrl(`/connections?provider=${slug}&error=not_configured`);
    if (popupId) back.searchParams.set("popup", popupId);
    return NextResponse.redirect(back);
  }

  const authorizeUrl = await beginAuthorization(provider, redirectUri(provider), popupId);
  return NextResponse.redirect(authorizeUrl);
}
