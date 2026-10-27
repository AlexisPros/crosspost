"use client";

import { useActionState } from "react";
import { Button, ErrorMessage, Field, Input } from "@/components/ui";
import { login } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, {});

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="E-mail">
        <Input name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} />
      </Field>
      <Field label="Hasło">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <ErrorMessage>{state.error}</ErrorMessage>
      <Button type="submit" disabled={pending}>
        {pending ? "Logowanie…" : "Zaloguj się"}
      </Button>
    </form>
  );
}
