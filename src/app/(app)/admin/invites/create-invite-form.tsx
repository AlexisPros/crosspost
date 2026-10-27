"use client";

import { useActionState, useState } from "react";
import { Button, ErrorMessage, Field, Input, Select } from "@/components/ui";
import { createInvite } from "./actions";

export function CreateInviteForm() {
  const [state, action, pending] = useActionState(createInvite, {});

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="grid gap-4 sm:grid-cols-2">
        <Field label="E-mail (opcjonalnie)" hint="Jeśli podasz, tylko ten adres użyje kodu.">
          <Input name="email" type="email" autoComplete="off" />
        </Field>
        <Field label="Notatka (opcjonalnie)" hint="Np. dla kogo jest kod.">
          <Input name="note" maxLength={200} />
        </Field>
        <Field label="Rola">
          <Select name="role" defaultValue="USER">
            <option value="USER">Użytkownik</option>
            <option value="ADMIN">Administrator</option>
          </Select>
        </Field>
        <Field label="Ważny przez (dni)">
          <Input name="expiresInDays" type="number" min={1} max={90} defaultValue={7} required />
        </Field>
        <div className="flex items-end sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Generowanie…" : "Wygeneruj kod"}
          </Button>
        </div>
      </form>
      <ErrorMessage>{state.error}</ErrorMessage>
      {state.code && <NewCode code={state.code} />}
    </div>
  );
}

function NewCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
  }

  return (
    <div className="rounded-md border border-success/40 bg-success/10 p-4">
      <p className="mb-2 text-sm">Nowy kod zaproszenia. Skopiuj go teraz, nie będzie już widoczny:</p>
      <div className="flex flex-wrap items-center gap-3">
        <code className="rounded bg-surface px-3 py-1.5 font-mono text-lg tracking-wider">{code}</code>
        <Button type="button" variant="ghost" onClick={copy}>
          {copied ? "Skopiowano" : "Kopiuj"}
        </Button>
      </div>
    </div>
  );
}
