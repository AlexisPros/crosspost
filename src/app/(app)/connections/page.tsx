import { Suspense, type ReactNode } from "react";
import { Button, Card } from "@/components/ui";
import { db } from "@/lib/db";
import { getProviderBySlug, providers } from "@/lib/oauth/providers";
import {
  connectionStatus,
  connectionSummarySelect,
  dateFormat,
  toConnectionSummary,
  type ConnectionStatus,
  type ConnectionSummary,
} from "@/lib/oauth/status";
import type { OAuthProvider } from "@/lib/oauth/types";
import { requireUser } from "@/lib/session";
import { parsePopupId } from "@/lib/oauth-popup";
import { disconnect } from "./actions";
import { ConnectButton } from "./connect-button";
import { OAuthCompletion } from "./oauth-completion";

export default function ConnectionsPage({ searchParams }: PageProps<"/connections">) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Połączenia</h1>
        <p className="mt-1 text-sm text-muted">Podłącz konta, na których będą publikowane posty.</p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted">Ładowanie…</p>}>
        <Connections searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Connections({ searchParams }: { searchParams: PageProps<"/connections">["searchParams"] }) {
  const user = await requireUser();
  const params = await searchParams;
  const popupId = parsePopupId(params.popup);
  const resultParams = new URLSearchParams();
  for (const key of ["provider", "connected", "error", "code"]) {
    const value = params[key];
    if (typeof value === "string") resultParams.set(key, value);
  }

  const rows = await db.socialConnection.findMany({ where: { userId: user.id }, select: connectionSummarySelect });
  const connections = rows.map(toConnectionSummary);

  return (
    <>
      {popupId && <OAuthCompletion popupId={popupId} search={`?${resultParams}`} />}
      <Flash params={params} />
      <div className="grid gap-4 sm:grid-cols-2">
        {providers.map((provider) => (
          <ProviderCard
            key={provider.slug}
            provider={provider}
            connection={connections.find((c) => c.provider === provider.provider)}
          />
        ))}
      </div>
    </>
  );
}

const toneStyles: Record<ConnectionStatus["tone"], string> = {
  ok: "bg-success/15 text-success",
  warn: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  error: "bg-danger/15 text-danger",
  none: "bg-border/60 text-muted",
};

function ProviderCard({ provider, connection }: { provider: OAuthProvider; connection?: ConnectionSummary }) {
  const configured = provider.isConfigured();
  const status = connectionStatus(connection, new Date());

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{provider.label}</h2>
          {connection?.displayName && <p className="text-sm">{connection.displayName}</p>}
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${toneStyles[status.tone]}`}>
          {status.label}
        </span>
      </div>

      <div className="flex-1 text-sm text-muted">
        {status.detail && <p>{status.detail}</p>}
        {connection && <p>Połączono {dateFormat.format(connection.connectedAt)}.</p>}
        {!configured && (
          <p className="mt-2 text-danger">
            Brak kluczy API {provider.label} w konfiguracji serwera. Skontaktuj się z administratorem.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {configured && (
          <ConnectButton provider={provider.slug} reconnect={!!connection} />
        )}
        {connection && (
          <form action={disconnect}>
            <input type="hidden" name="provider" value={provider.slug} />
            <Button type="submit" variant="danger">
              Odłącz
            </Button>
          </form>
        )}
      </div>
    </Card>
  );
}

const errorMessages: Record<string, (label: string) => string> = {
  denied: (label) => `Autoryzacja w ${label} została anulowana.`,
  state: () => "Sesja autoryzacji wygasła lub jest nieprawidłowa. Spróbuj ponownie.",
  exchange: (label) => `Nie udało się połączyć z ${label}. Spróbuj ponownie później.`,
  not_configured: (label) => `${label} nie jest skonfigurowany na serwerze (brak kluczy API).`,
  unknown_provider: () => "Nieznana platforma.",
};

/** The provider rejected the request itself (not the user); `code` is the provider's error code. */
function providerErrorMessage(label: string, code: string | undefined): string {
  if (code === "unauthorized_scope_error") {
    return `${label} odmówił wymaganych uprawnień. Administrator musi dodać do aplikacji w panelu dewelopera ${label} produkty: „Sign In with LinkedIn using OpenID Connect” i „Share on LinkedIn”.`;
  }
  return `${label} zwrócił błąd${code ? ` (${code})` : ""}. Spróbuj ponownie lub skontaktuj się z administratorem.`;
}

function Flash({ params }: { params: Record<string, string | string[] | undefined> }) {
  const single = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);
  const label = getProviderBySlug(single("provider") ?? "")?.label ?? "";
  const error = single("error");

  if (error) {
    const message =
      error === "provider"
        ? providerErrorMessage(label, single("code"))
        : (errorMessages[error] ?? errorMessages.exchange)(label);
    return <Notice tone="error">{message}</Notice>;
  }
  if (single("connected")) return <Notice tone="ok">Połączono konto {label}.</Notice>;
  if (single("disconnected")) {
    return (
      <Notice tone="ok">
        Odłączono konto {label}.
        {single("provider") === "linkedin" &&
          " Aby całkowicie cofnąć dostęp aplikacji, usuń ją także w ustawieniach prywatności konta LinkedIn."}
      </Notice>
    );
  }
  return null;
}

function Notice({ tone, children }: { tone: "ok" | "error"; children: ReactNode }) {
  const styles = tone === "ok" ? "border-success/30 bg-success/10" : "border-danger/30 bg-danger/10 text-danger";
  return (
    <p role="status" className={`rounded-md border px-3 py-2 text-sm ${styles}`}>
      {children}
    </p>
  );
}
