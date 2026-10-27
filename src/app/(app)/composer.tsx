"use client";

import Link from "next/link";
import { useActionState, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button, ErrorMessage } from "@/components/ui";
import { countFor, normalizePostText, PROVIDER_LABELS, validatePost, xOverflowStart } from "@/lib/post-rules";
import type { PublishSummary } from "@/lib/publish";
import type { Provider } from "@/generated/prisma/enums";
import { createRequestId } from "@/lib/request-id";
import { publishPost, type PublishState } from "./actions";

export type PlatformOption = {
  provider: Provider;
  label: string;
  account: string | null;
  usable: boolean;
  statusLabel: string;
};

// Shared by the textarea and the highlight layer behind it, so both wrap text identically.
const TEXT_BOX = "px-3 py-2 text-sm leading-6 whitespace-pre-wrap break-words border";

export function Composer({ platforms, draftKey }: { platforms: PlatformOption[]; draftKey: string }) {
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<Provider[]>(() =>
    platforms.filter((p) => p.usable).map((p) => p.provider),
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // One id per post being composed: a repeated submit (double click, lost response) is deduplicated on the server.
  const requestIdRef = useRef<string | null>(null);

  const [state, action, pending] = useActionState(async (prev: PublishState, formData: FormData) => {
    try {
      requestIdRef.current ??= createRequestId();
    } catch {
      return { error: "Nie można utworzyć identyfikatora publikacji. Użyj aktualnej przeglądarki. Twój szkic został zachowany." };
    }
    formData.set("requestId", requestIdRef.current);
    const next = await publishPost(prev, formData);
    if (next.result) {
      // The post is saved in the history now; start a fresh one.
      requestIdRef.current = null;
      updateText("");
    }
    return next;
  }, {});

  // Restore the draft after hydration (localStorage is not available on the server).
  useEffect(() => {
    try {
      const draft = localStorage.getItem(draftKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from browser storage
      if (draft) setText(draft);
    } catch {
      // Storage can be blocked (private mode); the composer works without a draft.
    }
  }, [draftKey]);

  // Grow the textarea with its content, so it never scrolls and the highlight layer stays aligned.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [text]);

  function updateText(value: string) {
    setText(value);
    try {
      if (value) localStorage.setItem(draftKey, value);
      else localStorage.removeItem(draftKey);
    } catch {
      // Ignore storage errors, see above.
    }
  }

  function toggle(provider: Provider, checked: boolean) {
    setSelected((current) => (checked ? [...current, provider] : current.filter((p) => p !== provider)));
  }

  const normalized = normalizePostText(text);
  const errors = validatePost(normalized, selected);
  const overflowStart = selected.includes("X") ? xOverflowStart(text) : null;
  const noUsablePlatform = platforms.every((p) => !p.usable);

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="relative rounded-md bg-surface">
        <div aria-hidden className={`${TEXT_BOX} pointer-events-none absolute inset-0 border-transparent text-transparent`}>
          {overflowStart === null ? (
            text
          ) : (
            <>
              {text.slice(0, overflowStart)}
              <mark className="rounded-sm bg-danger/25 text-transparent">{text.slice(overflowStart)}</mark>
            </>
          )}
        </div>
        <textarea
          ref={textareaRef}
          name="content"
          value={text}
          readOnly={pending}
          onChange={(event) => updateText(event.target.value)}
          placeholder="Co chcesz opublikować?"
          rows={6}
          className={`${TEXT_BOX} relative block min-h-40 w-full resize-none overflow-hidden rounded-md border-border bg-transparent outline-none focus:border-accent focus:ring-2 focus:ring-accent/20`}
        />
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {platforms.map((platform) => (
          <Counter
            key={platform.provider}
            label={platform.label}
            active={selected.includes(platform.provider)}
            {...countFor(platform.provider, normalized)}
          />
        ))}
      </div>
      {overflowStart !== null && (
        <p className="-mt-3 text-xs text-danger">Podświetlony fragment nie zmieści się w poście na X.</p>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Publikuj na</legend>
        {platforms.map((platform) => (
          <label
            key={platform.provider}
            className={`flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2.5 text-sm ${platform.usable ? "cursor-pointer" : "opacity-60"}`}
          >
            <input
              type="checkbox"
              name="providers"
              value={platform.provider}
              checked={selected.includes(platform.provider)}
              disabled={pending || !platform.usable}
              onChange={(event) => toggle(platform.provider, event.target.checked)}
              className="size-4 accent-accent"
            />
            <span className="font-medium">{platform.label}</span>
            {platform.account && <span className="text-muted">{platform.account}</span>}
            {!platform.usable && (
              <span className="ml-auto text-xs text-muted">
                {platform.statusLabel} ·{" "}
                <Link href="/connections" className="text-accent hover:underline">
                  Połączenia
                </Link>
              </span>
            )}
          </label>
        ))}
        {noUsablePlatform && (
          <p className="text-sm text-muted">
            Aby publikować, podłącz co najmniej jedno konto w zakładce{" "}
            <Link href="/connections" className="text-accent hover:underline">
              Połączenia
            </Link>
            .
          </p>
        )}
      </fieldset>

      <ErrorMessage>{state.error}</ErrorMessage>
      {state.result && <PublishResults result={state.result} />}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || errors.length > 0}>
          {pending ? "Publikowanie…" : "Opublikuj"}
        </Button>
        {/* Why the button is disabled; hidden while the field is empty to avoid noise. */}
        {text && errors.length > 0 && <span className="text-sm text-muted">{errors[0]}</span>}
      </div>
    </form>
  );
}

function PublishResults({ result }: { result: PublishSummary }) {
  const succeeded = result.outcomes.filter((outcome) => outcome.status === "SUCCESS").length;
  const inProgress = result.outcomes.some((outcome) => outcome.status === "PENDING");
  const allOk = succeeded === result.outcomes.length;
  const heading = inProgress
    ? "Publikacja w toku."
    : allOk
      ? "Opublikowano."
      : succeeded === 0
        ? "Publikacja nie powiodła się."
        : "Publikacja nie powiodła się na części platform.";

  return (
    <div
      role="status"
      className={`rounded-md border px-4 py-3 text-sm ${inProgress ? "border-border bg-surface" : allOk ? "border-success/30 bg-success/10" : "border-danger/30 bg-danger/10"}`}
    >
      <p className="mb-2 font-medium">{heading}</p>
      <ul className="flex flex-col gap-1">
        {result.outcomes.map((outcome) => (
          <li key={outcome.publicationId}>
            <span className="font-medium">{PROVIDER_LABELS[outcome.provider]}:</span>{" "}
            {outcome.status === "SUCCESS" ? (
              <>
                opublikowano
                {outcome.postUrl && (
                  <>
                    {" · "}
                    <a href={outcome.postUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                      zobacz post
                    </a>
                  </>
                )}
              </>
            ) : outcome.status === "PENDING" ? (
              <span className="text-muted">w toku</span>
            ) : (
              <span className="text-danger">{outcome.errorMessage}</span>
            )}
          </li>
        ))}
      </ul>
      {!allOk && (
        <p className="mt-2">
          <Link href={`/history#post-${result.postId}`} className="text-accent hover:underline">
            {inProgress ? "Sprawdź status w historii" : "Ponów w historii"}
          </Link>
        </p>
      )}
    </div>
  );
}

function Counter({ label, active, length, limit, overLimit }: { label: string; active: boolean; length: number; limit: number; overLimit: boolean }) {
  const tone = !active
    ? "text-muted/60"
    : overLimit
      ? "font-medium text-danger"
      : length >= limit * 0.9
        ? "text-amber-600 dark:text-amber-400"
        : "text-muted";

  return (
    <span className={`tabular-nums ${tone}`}>
      {label}: {length} / {limit}
    </span>
  );
}
