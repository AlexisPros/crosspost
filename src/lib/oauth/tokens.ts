import "server-only";
import { db } from "@/lib/db";
import { decryptToken, encryptToken } from "@/lib/token-crypto";
import type { Provider } from "@/generated/prisma/enums";
import { ProviderHttpError } from "./http";
import { getProvider } from "./providers";

/** The connection is missing, expired or rejected by the provider; the user must reconnect. */
export class ReconnectRequiredError extends Error {
  constructor(
    readonly provider: Provider,
    message: string,
  ) {
    super(message);
  }
}

// Refresh a little before the real expiry so a request in flight does not fail.
const EXPIRY_MARGIN_MS = 2 * 60 * 1000;

function isFresh(expiresAt: Date | null): boolean {
  return !expiresAt || expiresAt.getTime() > Date.now() + EXPIRY_MARGIN_MS;
}

/**
 * Returns a usable access token for the user's connection, refreshing it when the
 * provider supports refresh (X). Throws ReconnectRequiredError when the user must reconnect.
 */
export async function getAccessToken(userId: string, providerId: Provider): Promise<string> {
  const connection = await db.socialConnection.findUnique({
    where: { userId_provider: { userId, provider: providerId } },
  });
  if (!connection) throw new ReconnectRequiredError(providerId, "Not connected");
  if (connection.invalidatedAt) throw new ReconnectRequiredError(providerId, connection.lastError ?? "Connection invalidated");
  if (isFresh(connection.accessTokenExpiresAt)) return decryptToken(connection.accessTokenEnc);

  const provider = getProvider(providerId);
  if (!provider.refresh || !connection.refreshTokenEnc) {
    throw new ReconnectRequiredError(providerId, "Access token expired");
  }
  const refresh = provider.refresh;

  // X refresh tokens are single-use: lock the row so parallel requests do not
  // both spend the same refresh token. Errors are returned (not thrown) so the
  // invalidation is committed rather than rolled back.
  const result = await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "SocialConnection" WHERE id = ${connection.id} FOR UPDATE`;
      const current = await tx.socialConnection.findUniqueOrThrow({ where: { id: connection.id } });

      // Another request refreshed it while we waited for the lock.
      if (isFresh(current.accessTokenExpiresAt)) return { token: decryptToken(current.accessTokenEnc) };
      if (!current.refreshTokenEnc) return { reconnect: "Missing refresh token" };

      try {
        const tokens = await refresh(decryptToken(current.refreshTokenEnc));
        await tx.socialConnection.update({
          where: { id: current.id },
          data: {
            accessTokenEnc: encryptToken(tokens.accessToken),
            refreshTokenEnc: tokens.refreshToken ? encryptToken(tokens.refreshToken) : current.refreshTokenEnc,
            accessTokenExpiresAt: tokens.accessTokenExpiresAt,
            scopes: tokens.scopes ?? current.scopes,
          },
        });
        return { token: tokens.accessToken };
      } catch (error) {
        // 400/401: the refresh token was revoked or already used. Other errors may be transient.
        if (error instanceof ProviderHttpError && (error.status === 400 || error.status === 401)) {
          const message = `Token refresh rejected (${error.status})`;
          await tx.socialConnection.update({
            where: { id: current.id },
            data: { invalidatedAt: new Date(), lastError: message },
          });
          return { reconnect: message };
        }
        throw error;
      }
    },
    { timeout: 20_000 },
  );

  if ("reconnect" in result) throw new ReconnectRequiredError(providerId, result.reconnect ?? "Reconnect required");
  return result.token;
}
