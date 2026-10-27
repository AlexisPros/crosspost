"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { retry } from "./actions";

export function RetryButton({ publicationId }: { publicationId: string }) {
  const [state, action, pending] = useActionState(retry, {});

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="publicationId" value={publicationId} />
      <Button type="submit" variant="ghost" disabled={pending} className="py-1">
        {pending ? "Ponawianie…" : "Ponów"}
      </Button>
      {state.error && <span className="text-xs text-danger">{state.error}</span>}
    </form>
  );
}
