"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getProviderBySlug } from "@/lib/oauth/providers";
import { requireUser } from "@/lib/session";
import { decryptToken } from "@/lib/token-crypto";

export async function disconnect(formData: FormData): Promise<void> {
  const user = await requireUser();
  const provider = getProviderBySlug(String(formData.get("provider") ?? ""));
  if (!provider) redirect("/connections");

  const connection = await db.socialConnection.findUnique({
    where: { userId_provider: { userId: user.id, provider: provider.provider } },
  });

  if (connection) {
    if (provider.revoke) {
      // Best effort: the local connection is removed even if the provider call fails.
      for (const encrypted of [connection.refreshTokenEnc, connection.accessTokenEnc]) {
        if (!encrypted) continue;
        try {
          await provider.revoke(decryptToken(encrypted));
        } catch (error) {
          console.warn(`[oauth:${provider.slug}] revoke failed`, error instanceof Error ? error.message : error);
        }
      }
    }
    await db.socialConnection.delete({ where: { id: connection.id } });
  }

  redirect(`/connections?provider=${provider.slug}&disconnected=1`);
}
