"use client";

import { useEffect } from "react";
import { OAUTH_COMPLETE, oauthChannel } from "@/lib/oauth-popup";

export function OAuthCompletion({ popupId, search }: { popupId: string; search: string }) {
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    let channel: BroadcastChannel;
    try {
      channel = new BroadcastChannel(oauthChannel(popupId));
    } catch {
      return; // The normal connections page remains usable.
    }
    channel.postMessage({ type: OAUTH_COMPLETE, search });
    const timer = window.setTimeout(() => window.close(), 100);
    return () => {
      window.clearTimeout(timer);
      channel.close();
    };
  }, [popupId, search]);

  return <p role="status" className="text-sm text-muted">Możesz zamknąć to okno i wrócić do aplikacji.</p>;
}
