import "server-only";

/** Non-2xx response from a provider API. Keeps the parsed body for logging and the publication history. */
export class ProviderHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    message: string,
  ) {
    super(message);
  }
}

export type ProviderResponse = {
  status: number;
  // Only headers useful for debugging (ids, rate limits); never cookies.
  headers: Record<string, string>;
  body: unknown;
};

const KEPT_HEADERS = [
  "x-restli-id",
  "x-li-uuid",
  "x-transaction-id",
  "x-rate-limit-limit",
  "x-rate-limit-remaining",
  "x-rate-limit-reset",
  "retry-after",
];

/** Sends a request and returns status, selected headers and parsed body. Throws only on network errors and timeouts. */
export async function sendRequest(url: string, init: RequestInit = {}): Promise<ProviderResponse> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  const text = await response.text();

  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Keep the raw text when the body is not JSON.
  }

  const headers: Record<string, string> = {};
  for (const name of KEPT_HEADERS) {
    const value = response.headers.get(name);
    if (value !== null) headers[name] = value;
  }
  return { status: response.status, headers, body };
}

export async function requestJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const response = await sendRequest(url, init);
  if (response.status < 200 || response.status >= 300) {
    throw new ProviderHttpError(response.status, response.body, `${init.method ?? "GET"} ${url} returned ${response.status}`);
  }
  return response.body;
}

export function formBody(params: Record<string, string>): URLSearchParams {
  return new URLSearchParams(params);
}

/** Best-effort human-readable message from a provider error body (X and LinkedIn formats). */
export function providerErrorMessage(body: unknown): string | null {
  if (typeof body === "string") return body.slice(0, 300) || null;
  if (!body || typeof body !== "object") return null;

  const record = body as Record<string, unknown>;
  for (const key of ["detail", "message", "error_description", "title"]) {
    if (typeof record[key] === "string" && record[key]) return record[key] as string;
  }
  if (Array.isArray(record.errors)) {
    const first = record.errors[0] as Record<string, unknown> | undefined;
    if (typeof first?.message === "string") return first.message;
  }
  return null;
}
