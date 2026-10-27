import Link from "next/link";
import { Suspense } from "react";
import { Card } from "@/components/ui";
import { db } from "@/lib/db";
import { dateFormat } from "@/lib/oauth/status";
import { PROVIDER_LABELS } from "@/lib/post-rules";
import { requireUser } from "@/lib/session";
import type { Provider, PublicationStatus } from "@/generated/prisma/enums";
import { RetryButton } from "./retry-button";

const PAGE_SIZE = 50;

export default function HistoryPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Historia</h1>
        <p className="mt-1 text-sm text-muted">Opublikowane posty i odpowiedzi platform.</p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted">Ładowanie…</p>}>
        <History />
      </Suspense>
    </div>
  );
}

type Attempt = {
  id: string;
  provider: Provider;
  status: PublicationStatus;
  postUrl: string | null;
  httpStatus: number | null;
  responseBody: unknown;
  errorMessage: string | null;
  attemptedAt: Date;
};

async function History() {
  const user = await requireUser();
  const posts = await db.post.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
    include: { publications: { orderBy: { attemptedAt: "asc" } } },
  });

  if (posts.length === 0) {
    return (
      <Card>
        <p className="text-sm text-muted">
          Brak postów.{" "}
          <Link href="/" className="text-accent hover:underline">
            Napisz pierwszy
          </Link>
          .
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {posts.map((post) => {
        // Attempts grouped per provider, in the order providers were first attempted.
        const byProvider = new Map<Provider, Attempt[]>();
        for (const publication of post.publications) {
          byProvider.set(publication.provider, [...(byProvider.get(publication.provider) ?? []), publication]);
        }

        return (
          // The id is the target of "Ponów w historii" links from the composer.
          <section key={post.id} id={`post-${post.id}`} className="scroll-mt-6 rounded-lg target:ring-2 target:ring-accent">
            <Card className="flex flex-col gap-4">
              <time dateTime={post.createdAt.toISOString()} className="text-xs text-muted">
                {dateFormat.format(post.createdAt)}
              </time>
              <p className="text-sm break-words whitespace-pre-wrap">{post.content}</p>
              <div className="flex flex-col gap-2">
                {[...byProvider.entries()].map(([provider, attempts]) => (
                  <ProviderResult key={provider} provider={provider} attempts={attempts} />
                ))}
              </div>
            </Card>
          </section>
        );
      })}
      {posts.length === PAGE_SIZE && (
        <p className="text-center text-xs text-muted">Wyświetlono {PAGE_SIZE} najnowszych postów.</p>
      )}
    </div>
  );
}

const statusStyles: Record<PublicationStatus, { label: string; className: string }> = {
  SUCCESS: { label: "Opublikowano", className: "bg-success/15 text-success" },
  FAILED: { label: "Błąd", className: "bg-danger/15 text-danger" },
  PENDING: { label: "W toku", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
};

function StatusBadge({ status }: { status: PublicationStatus }) {
  const style = statusStyles[status];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style.className}`}>{style.label}</span>;
}

function ProviderResult({ provider, attempts }: { provider: Provider; attempts: Attempt[] }) {
  const latest = attempts[attempts.length - 1];

  return (
    <div className="rounded-md border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{PROVIDER_LABELS[provider]}</span>
        <StatusBadge status={latest.status} />
        {latest.postUrl && (
          <a href={latest.postUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            Zobacz post
          </a>
        )}
        {latest.status === "FAILED" && (
          <div className="ml-auto">
            <RetryButton publicationId={latest.id} />
          </div>
        )}
      </div>
      {latest.errorMessage && <p className="mt-1 text-danger">{latest.errorMessage}</p>}

      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-muted select-none">
          Odpowiedź API{attempts.length > 1 ? ` · próby: ${attempts.length}` : ""}
        </summary>
        <div className="mt-2 flex flex-col gap-3">
          {[...attempts].reverse().map((attempt) => (
            <div key={attempt.id}>
              <p className="mb-1 text-xs text-muted">
                {dateFormat.format(attempt.attemptedAt)} · {statusStyles[attempt.status].label} · HTTP{" "}
                {attempt.httpStatus ?? "—"}
              </p>
              <pre className="max-h-64 overflow-auto rounded bg-background p-2 font-mono text-xs">
                {attempt.responseBody == null ? "brak odpowiedzi" : JSON.stringify(attempt.responseBody, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
