import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";
import { getClientIp, getUserAgent } from "@/lib/request-info";
import type { Role } from "@/generated/prisma/enums";

export const SESSION_COOKIE = "cp_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type CurrentUser = {
  id: string;
  email: string;
  role: Role;
};

/** Creates a DB session and sets the cookie. Call only from Server Actions or Route Handlers. */
export async function createSession(userId: string): Promise<void> {
  const token = randomToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.session.create({
    data: { id: sha256(token), userId, expiresAt, userAgent: await getUserAgent(), ip: await getClientIp() },
  });
  // Housekeeping: drop this user's expired sessions.
  await db.session.deleteMany({ where: { userId, expiresAt: { lt: now } } });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Deletes the current session from the DB and clears the cookie. */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { id: sha256(token) } });
  }
  cookieStore.delete(SESSION_COOKIE);
}

/** DB id of the current session (hash of the cookie token), or null. */
export async function getCurrentSessionId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? sha256(token) : null;
}

/** Signs the user out everywhere except the current browser. Returns how many sessions were ended. */
export async function destroyOtherSessions(userId: string): Promise<number> {
  const currentId = await getCurrentSessionId();
  const { count } = await db.session.deleteMany({ where: { userId, id: { not: currentId ?? "" } } });
  return count;
}

/** Returns the signed-in user, or null. Reads the request, so render it behind <Suspense>. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { id: sha256(token) },
    select: {
      expiresAt: true,
      user: { select: { id: true, email: true, role: true } },
    },
  });
  if (!session || session.expiresAt < new Date()) return null;

  return session.user;
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}
