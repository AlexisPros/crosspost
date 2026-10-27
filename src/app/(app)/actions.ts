"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import type { FormState } from "@/lib/form";
import { connectionStatus, connectionSummarySelect, toConnectionSummary } from "@/lib/oauth/status";
import { MAX_RAW_LENGTH, normalizePostText, PROVIDER_LABELS, validatePost } from "@/lib/post-rules";
import { createAndPublish, type PublishSummary } from "@/lib/publish";
import { requireUser } from "@/lib/session";
import type { Provider } from "@/generated/prisma/enums";

export type PublishState = FormState & {
  result?: PublishSummary;
};

const KNOWN_PROVIDERS: readonly Provider[] = ["X", "LINKEDIN"];

export async function publishPost(_prev: PublishState, formData: FormData): Promise<PublishState> {
  const user = await requireUser();

  const requestId = z.uuid().safeParse(formData.get("requestId"));
  if (!requestId.success) return { error: "Nieprawidłowe żądanie. Odśwież stronę i spróbuj ponownie." };

  const raw = String(formData.get("content") ?? "");
  if (raw.length > MAX_RAW_LENGTH) return { error: "Tekst jest za długi." };
  const text = normalizePostText(raw);

  const selected = new Set(formData.getAll("providers").map(String));
  const providers = KNOWN_PROVIDERS.filter((provider) => selected.has(provider));

  const errors = validatePost(text, providers);
  if (errors.length > 0) return { error: errors.join(" ") };

  // The composer disables unusable platforms, but the server must not trust that.
  // Checked before saving, so an obviously failing post is not created at all.
  const rows = await db.socialConnection.findMany({
    where: { userId: user.id, provider: { in: providers } },
    select: connectionSummarySelect,
  });
  const connections = rows.map(toConnectionSummary);
  const now = new Date();
  for (const provider of providers) {
    const connection = connections.find((c) => c.provider === provider);
    if (!connectionStatus(connection, now).usable) {
      return { error: `Konto ${PROVIDER_LABELS[provider]} nie jest połączone lub wymaga ponownego połączenia.` };
    }
  }

  const result = await createAndPublish({ userId: user.id, text, providers, clientRequestId: requestId.data });
  return { result };
}
