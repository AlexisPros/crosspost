import "server-only";
import { db } from "@/lib/db";
import { ProviderHttpError } from "@/lib/oauth/http";
import { getProvider } from "@/lib/oauth/providers";
import { getAccessToken, ReconnectRequiredError } from "@/lib/oauth/tokens";
import type { PublishResult } from "@/lib/oauth/types";
import { PROVIDER_LABELS } from "@/lib/post-rules";
import { Prisma } from "@/generated/prisma/client";
import type { Provider, PublicationStatus } from "@/generated/prisma/enums";

export type PublicationOutcome = {
  publicationId: string;
  provider: Provider;
  status: PublicationStatus;
  postUrl: string | null;
  errorMessage: string | null;
};

export type PublishSummary = { postId: string; outcomes: PublicationOutcome[] };

/** Turns anything thrown before or during the API call into a failed result with a Polish message. */
function failureFromError(provider: Provider, error: unknown): PublishResult {
  const label = PROVIDER_LABELS[provider];
  if (error instanceof ReconnectRequiredError) {
    return { ok: false, httpStatus: null, responseBody: null, errorMessage: `Konto ${label} wymaga ponownego połączenia.` };
  }
  if (error instanceof ProviderHttpError) {
    return { ok: false, httpStatus: error.status, responseBody: error.body, errorMessage: `Błąd ${label}: HTTP ${error.status}.` };
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    // The post may or may not have been created; warn before a retry duplicates it.
    return {
      ok: false,
      httpStatus: null,
      responseBody: null,
      errorMessage: `Brak odpowiedzi od ${label}. Sprawdź profil, zanim ponowisz publikację.`,
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { ok: false, httpStatus: null, responseBody: null, errorMessage: `Błąd połączenia z ${label}: ${message}` };
}

/** Calls the provider for one PENDING publication row and stores the outcome in it. */
async function runPublication(publicationId: string, userId: string, provider: Provider, text: string): Promise<PublicationOutcome> {
  let result: PublishResult;
  try {
    const accessToken = await getAccessToken(userId, provider);
    const connection = await db.socialConnection.findUniqueOrThrow({
      where: { userId_provider: { userId, provider } },
      select: { externalId: true },
    });
    result = await getProvider(provider).publish({ accessToken, externalId: connection.externalId, text });
  } catch (error) {
    console.error(`[publish:${provider}] ${publicationId} failed`, error instanceof Error ? error.message : error);
    result = failureFromError(provider, error);
  }

  const status: PublicationStatus = result.ok ? "SUCCESS" : "FAILED";
  await db.postPublication.update({
    where: { id: publicationId },
    data: {
      status,
      externalPostId: result.externalPostId ?? null,
      postUrl: result.postUrl ?? null,
      httpStatus: result.httpStatus,
      responseBody: result.responseBody == null ? Prisma.JsonNull : (result.responseBody as Prisma.InputJsonValue),
      errorMessage: result.ok ? null : (result.errorMessage ?? "Nieznany błąd."),
    },
  });

  return {
    publicationId,
    provider,
    status,
    postUrl: result.postUrl ?? null,
    errorMessage: result.ok ? null : (result.errorMessage ?? "Nieznany błąd."),
  };
}

/** Latest attempt per provider, in the order the providers were first attempted. */
function latestOutcomes(
  publications: { id: string; provider: Provider; status: PublicationStatus; postUrl: string | null; errorMessage: string | null; attemptedAt: Date }[],
): PublicationOutcome[] {
  const latest = new Map<Provider, (typeof publications)[number]>();
  for (const publication of [...publications].sort((a, b) => a.attemptedAt.getTime() - b.attemptedAt.getTime())) {
    latest.set(publication.provider, publication);
  }
  return [...latest.values()].map((p) => ({
    publicationId: p.id,
    provider: p.provider,
    status: p.status,
    postUrl: p.postUrl,
    errorMessage: p.errorMessage,
  }));
}

/**
 * Saves the post and publishes it to all providers in parallel.
 * The same clientRequestId returns the already created post instead of publishing twice.
 */
export async function createAndPublish(params: {
  userId: string;
  text: string;
  providers: Provider[];
  clientRequestId: string;
}): Promise<PublishSummary> {
  const { userId, text, providers, clientRequestId } = params;
  const existingQuery = { where: { userId_clientRequestId: { userId, clientRequestId } }, include: { publications: true } };

  const existing = await db.post.findUnique(existingQuery);
  if (existing) return { postId: existing.id, outcomes: latestOutcomes(existing.publications) };

  let post;
  try {
    post = await db.post.create({
      data: { userId, content: text, clientRequestId, publications: { create: providers.map((provider) => ({ provider })) } },
      include: { publications: true },
    });
  } catch (error) {
    // A parallel submit with the same id won the race.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await db.post.findUniqueOrThrow(existingQuery);
      return { postId: winner.id, outcomes: latestOutcomes(winner.publications) };
    }
    throw error;
  }

  const outcomes = await Promise.all(
    post.publications.map((publication) => runPublication(publication.id, userId, publication.provider, text)),
  );
  return { postId: post.id, outcomes };
}

export class RetryNotAllowedError extends Error {}

/** Publishes the post again on one provider, as a new attempt. Allowed only when the latest attempt failed. */
export async function retryPublication(userId: string, publicationId: string): Promise<PublicationOutcome> {
  const created = await db.$transaction(async (tx) => {
    const publication = await tx.postPublication.findFirst({
      where: { id: publicationId, post: { userId } },
      select: { postId: true, provider: true },
    });
    if (!publication) throw new RetryNotAllowedError("Nie znaleziono publikacji.");

    // Lock the post so two clicks cannot start two retries.
    await tx.$queryRaw`SELECT id FROM "Post" WHERE id = ${publication.postId} FOR UPDATE`;
    const latest = await tx.postPublication.findFirstOrThrow({
      where: { postId: publication.postId, provider: publication.provider },
      orderBy: { attemptedAt: "desc" },
      select: { status: true },
    });
    if (latest.status !== "FAILED") throw new RetryNotAllowedError("Ta publikacja nie wymaga ponowienia.");

    const attempt = await tx.postPublication.create({
      data: { postId: publication.postId, provider: publication.provider },
      select: { id: true, provider: true, post: { select: { content: true } } },
    });
    return attempt;
  });

  return runPublication(created.id, userId, created.provider, created.post.content);
}
