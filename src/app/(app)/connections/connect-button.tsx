"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { oauthChannel, oauthResultPath } from "@/lib/oauth-popup";
import { createRequestId } from "@/lib/request-id";

export function ConnectButton({ provider, reconnect }: { provider: string; reconnect: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const href = `/api/oauth/${provider}/start`;

  useEffect(() => () => cleanupRef.current?.(), []);

  function connect(event: MouseEvent<HTMLAnchorElement>) {
    // Preserve normal links, modifier clicks and browsers without popup messaging.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (popupRef.current && !popupRef.current.closed) {
      event.preventDefault();
      popupRef.current.focus();
      return;
    }
    if (typeof BroadcastChannel === "undefined") return;

    let popupId: string;
    let channel: BroadcastChannel;
    try {
      popupId = createRequestId();
      channel = new BroadcastChannel(oauthChannel(popupId));
    } catch {
      return;
    }

    // Open synchronously inside the click so popup blockers can allow it.
    const popup = window.open("about:blank", "_blank", "popup,width=640,height=760");
    if (!popup) {
      channel.close();
      return; // The ordinary link takes over when popups are blocked.
    }
    event.preventDefault();
    cleanupRef.current?.();
    popupRef.current = popup;
    setPending(true);

    // Providers never need access to the app window. BroadcastChannel also works
    // when a provider's COOP policy severs the opener relationship.
    popup.opener = null;
    const refresh = () => router.refresh();
    window.addEventListener("focus", refresh);
    const closedTimer = window.setInterval(() => {
      if (popup.closed) {
        window.clearInterval(closedTimer);
        setPending(false);
        refresh();
        // Keep listening: COOP can report "closed" before OAuth finishes.
      }
    }, 500);
    const expiryTimer = window.setTimeout(() => {
      cleanupRef.current?.();
      setPending(false);
    }, 10 * 60 * 1000);

    cleanupRef.current = () => {
      channel.close();
      window.clearInterval(closedTimer);
      window.clearTimeout(expiryTimer);
      window.removeEventListener("focus", refresh);
      popupRef.current = null;
      cleanupRef.current = null;
    };
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const path = oauthResultPath(event.data, provider);
      if (!path) return;
      cleanupRef.current?.();
      // A fresh document clears prefetched connection/composer data as well.
      window.location.assign(path);
    };
    popup.location.replace(`${href}?popup=${popupId}`);
  }

  return (
    <a
      href={href}
      onClick={connect}
      aria-busy={pending}
      className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
    >
      {pending ? "Oczekiwanie na autoryzację…" : reconnect ? "Połącz ponownie" : "Połącz"}
    </a>
  );
}
