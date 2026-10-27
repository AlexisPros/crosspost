"use client";

import { useActionState } from "react";
import { Button, ErrorMessage, Field, Input } from "@/components/ui";
import { PASSWORD_MIN_LENGTH } from "@/lib/password-rules";
import { changePassword, logoutOtherSessions } from "./actions";

function Notice({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <p role="status" className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm">
      {children}
    </p>
  );
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePassword, {});

  return (
    <form action={action} className="flex max-w-sm flex-col gap-4">
      <Field label="Obecne hasło">
        <Input name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="Nowe hasło" hint={`Co najmniej ${PASSWORD_MIN_LENGTH} znaków.`}>
        <Input name="newPassword" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} />
      </Field>
      <Field label="Powtórz nowe hasło">
        <Input name="newPasswordConfirm" type="password" autoComplete="new-password" required />
      </Field>
      <ErrorMessage>{state.error}</ErrorMessage>
      <Notice>{state.notice}</Notice>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Zapisywanie…" : "Zmień hasło"}
        </Button>
      </div>
    </form>
  );
}

export function LogoutOthersForm({ otherCount }: { otherCount: number }) {
  const [state, action, pending] = useActionState(logoutOtherSessions, {});

  return (
    <form action={action} className="flex flex-col gap-3">
      <Notice>{state.notice}</Notice>
      {otherCount > 0 && (
        <div>
          <Button type="submit" variant="danger" disabled={pending}>
            {pending ? "Wylogowywanie…" : "Wyloguj z pozostałych urządzeń"}
          </Button>
        </div>
      )}
    </form>
  );
}
