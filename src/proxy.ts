import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/app-url";

// Optimistic check only: sends visitors without a session cookie to /login.
// The real check (session exists and is valid) happens in getCurrentUser().
const SESSION_COOKIE = "cp_session";
const PUBLIC_PATHS = ["/login", "/register"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const canonical = appUrl(`${pathname}${request.nextUrl.search}`);
  const host = request.headers.get("x-forwarded-host")?.split(",")[0].trim()
    || request.headers.get("host") || request.nextUrl.host;
  const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim()
    || request.nextUrl.protocol.slice(0, -1);
  // Login and OAuth must share an origin, otherwise host-only cookies disappear.
  if (host !== canonical.host || `${protocol}:` !== canonical.protocol) {
    return NextResponse.redirect(canonical);
  }
  const isPublic = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  if (!isPublic && !request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(appUrl("/login"));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)$).*)"],
};
