import type { Provider } from "@/generated/prisma/enums";

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRY_WARNING_DAYS = 7;

export const dateFormat = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Warsaw",
});

/** Connection fields needed to compute a status; never includes the tokens themselves. */
export type ConnectionSummary = {
  provider: Provider;
  displayName: string | null;
  accessTokenExpiresAt: Date | null;
  hasRefreshToken: boolean;
  invalidatedAt: Date | null;
  connectedAt: Date;
};

export const connectionSummarySelect = {
  provider: true,
  displayName: true,
  accessTokenExpiresAt: true,
  refreshTokenEnc: true,
  invalidatedAt: true,
  connectedAt: true,
} as const;

export function toConnectionSummary(row: {
  provider: Provider;
  displayName: string | null;
  accessTokenExpiresAt: Date | null;
  refreshTokenEnc: string | null;
  invalidatedAt: Date | null;
  connectedAt: Date;
}): ConnectionSummary {
  const { refreshTokenEnc, ...rest } = row;
  return { ...rest, hasRefreshToken: refreshTokenEnc !== null };
}

export type ConnectionStatus = {
  tone: "ok" | "warn" | "error" | "none";
  label: string;
  detail?: string;
  /** Whether posts can be published with this connection right now. */
  usable: boolean;
};

export function connectionStatus(connection: ConnectionSummary | undefined, now: Date): ConnectionStatus {
  if (!connection) return { tone: "none", label: "Nie połączono", usable: false };
  if (connection.invalidatedAt) {
    return {
      tone: "error",
      label: "Wymaga ponownego połączenia",
      detail: "Platforma odrzuciła token dostępu.",
      usable: false,
    };
  }
  // With a refresh token (X) the access token is renewed automatically before publishing.
  if (connection.hasRefreshToken) {
    return { tone: "ok", label: "Połączono", detail: "Token odnawiany automatycznie.", usable: true };
  }

  const expiresAt = connection.accessTokenExpiresAt;
  if (!expiresAt) return { tone: "ok", label: "Połączono", usable: true };
  if (expiresAt <= now) {
    return { tone: "error", label: "Token wygasł", detail: "Połącz konto ponownie, aby publikować.", usable: false };
  }

  const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS);
  if (daysLeft <= EXPIRY_WARNING_DAYS) {
    return {
      tone: "warn",
      label: `Wygasa za ${daysLeft} ${daysLeft === 1 ? "dzień" : "dni"}`,
      detail: "Połącz ponownie, aby przedłużyć.",
      usable: true,
    };
  }
  return { tone: "ok", label: "Połączono", detail: `Ważne do ${dateFormat.format(expiresAt)}.`, usable: true };
}
