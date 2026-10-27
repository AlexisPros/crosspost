import { Suspense } from "react";
import { Card } from "@/components/ui";
import { db } from "@/lib/db";
import { dateFormat } from "@/lib/oauth/status";
import { getCurrentSessionId, requireUser } from "@/lib/session";
import { ChangePasswordForm, LogoutOthersForm } from "./forms";

export default function AccountPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Konto</h1>
      <Suspense fallback={<p className="text-sm text-muted">Ładowanie…</p>}>
        <Account />
      </Suspense>
    </div>
  );
}

// Order matters: Edge and Opera also contain "Chrome", Chrome also contains "Safari", Android contains "Linux".
const BROWSERS: [RegExp, string][] = [
  [/Edg\//, "Edge"],
  [/OPR\//, "Opera"],
  [/Firefox\//, "Firefox"],
  [/Chrome\//, "Chrome"],
  [/Safari\//, "Safari"],
];
const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad/, "iOS"],
  [/Android/, "Android"],
  [/Mac OS X/, "macOS"],
  [/Windows/, "Windows"],
  [/Linux/, "Linux"],
];

/** "Chrome · macOS" from a user agent string; good enough to recognize one's own devices. */
function describeUserAgent(userAgent: string | null): string {
  if (!userAgent) return "Nieznane urządzenie";
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? "Przeglądarka";
  const os = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1];
  return os ? `${browser} · ${os}` : browser;
}

async function Account() {
  const user = await requireUser();
  const currentId = await getCurrentSessionId();
  const rows = await db.session.findMany({
    where: { userId: user.id, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, userAgent: true, ip: true, createdAt: true },
  });

  // Session ids are hashes of cookie tokens; they are not sent to the browser.
  const sessions = rows
    .map((row) => ({ device: describeUserAgent(row.userAgent), ip: row.ip, createdAt: row.createdAt, current: row.id === currentId }))
    .sort((a, b) => Number(b.current) - Number(a.current));
  const otherCount = sessions.filter((s) => !s.current).length;

  return (
    <>
      <Card>
        <h2 className="mb-3 font-medium">Dane konta</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
          <dt className="text-muted">E-mail</dt>
          <dd>{user.email}</dd>
          <dt className="text-muted">Rola</dt>
          <dd>{user.role === "ADMIN" ? "Administrator" : "Użytkownik"}</dd>
        </dl>
      </Card>

      <Card>
        <h2 className="mb-1 font-medium">Zmień hasło</h2>
        <p className="mb-4 text-sm text-muted">Po zmianie hasła zostaniesz wylogowany na pozostałych urządzeniach.</p>
        <ChangePasswordForm />
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="font-medium">Aktywne sesje</h2>
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border text-sm">
          {sessions.map((session, index) => (
            <li key={index} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
              <span className="font-medium">{session.device}</span>
              {session.current && (
                <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">To urządzenie</span>
              )}
              <span className="ml-auto text-xs text-muted">
                {session.ip ? `${session.ip} · ` : ""}zalogowano {dateFormat.format(session.createdAt)}
              </span>
            </li>
          ))}
        </ul>
        <LogoutOthersForm otherCount={otherCount} />
      </Card>
    </>
  );
}
