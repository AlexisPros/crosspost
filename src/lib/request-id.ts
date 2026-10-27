/** Browser-safe UUID v4 for publication deduplication, including plain HTTP. */
export function createRequestId(): string {
  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();

  // Unlike randomUUID, getRandomValues is also available in insecure contexts.
  // Keep cryptographic randomness: collisions could silently discard a new post.
  if (typeof crypto?.getRandomValues !== "function") {
    throw new Error("Ta przeglądarka nie obsługuje bezpiecznego generowania identyfikatorów. Użyj aktualnej przeglądarki.");
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
