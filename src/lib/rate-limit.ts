import "server-only";
import { db } from "@/lib/db";

// Failed password checks allowed per window, per account and per IP.
// Per IP is higher: several people can share one office IP.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_EMAIL = 5;
const MAX_FAILURES_PER_IP = 20;
const RETENTION_MS = 24 * 60 * 60 * 1000;

/** Minutes until the next attempt is allowed, or null when not blocked. */
async function minutesUntilAllowed(where: { email: string } | { ip: string }, max: number): Promise<number | null> {
  const failures = await db.loginAttempt.findMany({
    where: { ...where, createdAt: { gte: new Date(Date.now() - WINDOW_MS) } },
    orderBy: { createdAt: "desc" },
    take: max,
    select: { createdAt: true },
  });
  if (failures.length < max) return null;

  // Unblocked once the oldest of the last `max` failures leaves the window.
  const unblockAt = failures[max - 1].createdAt.getTime() + WINDOW_MS;
  return Math.max(1, Math.ceil((unblockAt - Date.now()) / 60_000));
}

export async function passwordCheckBlockedFor(email: string, ip: string | null): Promise<number | null> {
  const byEmail = await minutesUntilAllowed({ email }, MAX_FAILURES_PER_EMAIL);
  const byIp = ip ? await minutesUntilAllowed({ ip }, MAX_FAILURES_PER_IP) : null;
  if (byEmail === null && byIp === null) return null;
  return Math.max(byEmail ?? 0, byIp ?? 0);
}

export async function recordPasswordFailure(email: string, ip: string | null): Promise<void> {
  await db.loginAttempt.create({ data: { email, ip } });
  await db.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } } });
}

export async function clearPasswordFailures(email: string): Promise<void> {
  await db.loginAttempt.deleteMany({ where: { email } });
}

export function tooManyAttemptsMessage(minutes: number): string {
  return `Zbyt wiele nieudanych prób. Spróbuj ponownie za ${minutes} min.`;
}
