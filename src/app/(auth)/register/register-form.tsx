"use client";

import { useActionState } from "react";
import { Button, ErrorMessage, Field, Input } from "@/components/ui";
import { PASSWORD_MIN_LENGTH } from "@/lib/password-rules";
import { register } from "../actions";

export function RegisterForm() {
  const [state, action, pending] = useActionState(register, {});

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="E-mail">
        <Input name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} />
      </Field>
      <Field label="Kod zaproszenia">
        <Input
          name="inviteCode"
          required
          autoComplete="off"
          spellCheck={false}
          placeholder="XXXX-XXXX-XXXX-XXXX"
          className="font-mono uppercase"
          defaultValue={state.values?.inviteCode}
        />
      </Field>
      <Field label="Hasło" hint={`Co najmniej ${PASSWORD_MIN_LENGTH} znaków.`}>
        <Input name="password" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} />
      </Field>
      <Field label="Powtórz hasło">
        <Input name="passwordConfirm" type="password" autoComplete="new-password" required />
      </Field>
      <ErrorMessage>{state.error}</ErrorMessage>
      <Button type="submit" disabled={pending}>
        {pending ? "Tworzenie konta…" : "Załóż konto"}
      </Button>
    </form>
  );
}
