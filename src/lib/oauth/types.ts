import type { Provider } from "@/generated/prisma/enums";

export type ProviderSlug = "x" | "linkedin";

export type TokenSet = {
  accessToken: string;
  refreshToken: string | null;
  accessTokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  scopes: string | null;
};

export type ProviderProfile = {
  externalId: string;
  displayName: string;
};

/** Outcome of one publish call, stored as-is in PostPublication. */
export type PublishResult = {
  ok: boolean;
  httpStatus: number | null;
  responseBody: unknown;
  externalPostId?: string;
  postUrl?: string;
  errorMessage?: string;
};

export interface OAuthProvider {
  provider: Provider;
  slug: ProviderSlug;
  label: string;
  usesPkce: boolean;
  isConfigured(): boolean;
  authorizeUrl(params: { state: string; redirectUri: string; codeChallenge?: string }): string;
  exchangeCode(params: { code: string; redirectUri: string; codeVerifier?: string }): Promise<TokenSet>;
  fetchProfile(accessToken: string): Promise<ProviderProfile>;
  /** Publishes a text post. `text` is already normalized and validated against the limits. */
  publish(params: { accessToken: string; externalId: string; text: string }): Promise<PublishResult>;
  /** Present only when the provider issues refresh tokens. */
  refresh?(refreshToken: string): Promise<TokenSet>;
  /** Best-effort token revocation on disconnect. */
  revoke?(token: string): Promise<void>;
}

export function expiresAt(seconds: unknown): Date | null {
  return typeof seconds === "number" && seconds > 0 ? new Date(Date.now() + seconds * 1000) : null;
}
