import { Suspense } from "react";
import { db } from "@/lib/db";
import { connectionStatus, connectionSummarySelect, toConnectionSummary } from "@/lib/oauth/status";
import { providers } from "@/lib/oauth/providers";
import { requireUser } from "@/lib/session";
import { Composer, type PlatformOption } from "./composer";

export default function NewPostPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Nowy post</h1>
      <Suspense fallback={<p className="text-sm text-muted">Ładowanie…</p>}>
        <NewPost />
      </Suspense>
    </div>
  );
}

async function NewPost() {
  const user = await requireUser();
  const rows = await db.socialConnection.findMany({ where: { userId: user.id }, select: connectionSummarySelect });
  const connections = rows.map(toConnectionSummary);
  const now = new Date();

  const platforms: PlatformOption[] = providers.map((provider) => {
    const connection = connections.find((c) => c.provider === provider.provider);
    const status = connectionStatus(connection, now);
    return {
      provider: provider.provider,
      label: provider.label,
      account: connection?.displayName ?? null,
      usable: status.usable,
      statusLabel: status.label,
    };
  });

  // Draft is stored per user, so a shared browser does not show one user's draft to another.
  return <Composer platforms={platforms} draftKey={`cp_draft:${user.id}`} />;
}
