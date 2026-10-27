import "server-only";
import { headers } from "next/headers";

/**
 * Client IP from proxy headers. Behind a trusted proxy (Vercel, nginx) this is the real client;
 * without one the header can be spoofed, so use it only for rate limiting and display.
 */
export async function getClientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || null;
}

export async function getUserAgent(): Promise<string | null> {
  return (await headers()).get("user-agent")?.slice(0, 300) ?? null;
}
