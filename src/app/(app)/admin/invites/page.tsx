import { Suspense } from "react";
import { Button, Card } from "@/components/ui";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { revokeInvite } from "./actions";
import { CreateInviteForm } from "./create-invite-form";

const dateFormat = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Warsaw",
});

export default function InvitesPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Kody zaproszeń</h1>
      <Suspense fallback={<p className="text-sm text-muted">Ładowanie…</p>}>
        <Invites />
      </Suspense>
    </div>
  );
}

async function Invites() {
  await requireAdmin();

  const invites = await db.inviteCode.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { usedBy: { select: { email: true } } },
  });
  const now = new Date();

  return (
    <>
      <Card>
        <h2 className="mb-4 font-medium">Nowy kod</h2>
        <CreateInviteForm />
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Utworzony</th>
              <th className="px-4 py-3 font-medium">Dla</th>
              <th className="px-4 py-3 font-medium">Rola</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Wygasa</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {invites.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted">
                  Brak kodów.
                </td>
              </tr>
            )}
            {invites.map((invite) => {
              const active = !invite.usedAt && !invite.revokedAt && invite.expiresAt > now;
              return (
                <tr key={invite.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap">{dateFormat.format(invite.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div>{invite.email ?? <span className="text-muted">dowolny e-mail</span>}</div>
                    {invite.note && <div className="text-xs text-muted">{invite.note}</div>}
                  </td>
                  <td className="px-4 py-3">{invite.role === "ADMIN" ? "Administrator" : "Użytkownik"}</td>
                  <td className="px-4 py-3">
                    {invite.usedAt ? (
                      <span>Wykorzystany{invite.usedBy && <span className="text-muted"> · {invite.usedBy.email}</span>}</span>
                    ) : invite.revokedAt ? (
                      <span className="text-muted">Unieważniony</span>
                    ) : invite.expiresAt <= now ? (
                      <span className="text-muted">Wygasł</span>
                    ) : (
                      <span className="text-success">Aktywny</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{dateFormat.format(invite.expiresAt)}</td>
                  <td className="px-4 py-2 text-right">
                    {active && (
                      <form action={revokeInvite}>
                        <input type="hidden" name="id" value={invite.id} />
                        <Button type="submit" variant="danger">
                          Unieważnij
                        </Button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
