// Shared by the popup and its opener. No credentials are sent over this channel.
export const OAUTH_COMPLETE = "crosspost:oauth-complete";

export function parsePopupId(value: unknown): string | undefined {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : undefined;
}

export function oauthChannel(popupId: string): string {
  return `crosspost:oauth:${popupId}`;
}

/** Only allow a result on our own connections page, never a supplied redirect URL. */
export function oauthResultPath(data: unknown, provider: string): string | null {
  if (!data || typeof data !== "object" || !("type" in data) || data.type !== OAUTH_COMPLETE) return null;
  if (!("search" in data) || typeof data.search !== "string" || !data.search.startsWith("?") || data.search.length > 512) return null;
  const params = new URLSearchParams(data.search);
  if (params.get("provider") !== provider) return null;
  const result = new URLSearchParams({ provider });
  for (const key of ["connected", "error", "code"]) {
    const value = params.get(key);
    if (value) result.set(key, value);
  }
  return `/connections?${result}`;
}
