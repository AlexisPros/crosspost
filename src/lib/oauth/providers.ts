import "server-only";
import { appUrl } from "@/lib/app-url";
import type { Provider } from "@/generated/prisma/enums";
import { linkedinProvider } from "./linkedin";
import type { OAuthProvider } from "./types";
import { xProvider } from "./x";

export const providers: OAuthProvider[] = [xProvider, linkedinProvider];

export function getProviderBySlug(slug: string): OAuthProvider | undefined {
  return providers.find((provider) => provider.slug === slug);
}

export function getProvider(provider: Provider): OAuthProvider {
  const found = providers.find((p) => p.provider === provider);
  if (!found) throw new Error(`Unknown provider ${provider}`);
  return found;
}

export function redirectUri(provider: OAuthProvider): string {
  return appUrl(`/api/oauth/${provider.slug}/callback`).toString();
}
