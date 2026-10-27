import { createHash, randomBytes } from "node:crypto";

// Crockford base32 alphabet: no I, L, O, U, so codes are easy to read and type.
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Generates an invite code like `7K3Q-M9XD-2PFA-H4TN` (80 bits of entropy). */
export function generateInviteCode(): string {
  const bytes = randomBytes(16);
  let code = "";
  for (let i = 0; i < 16; i++) {
    code += CODE_ALPHABET[bytes[i] % 32];
    if (i % 4 === 3 && i < 15) code += "-";
  }
  return code;
}

/** Normalizes user input: ignores case, spaces and dashes. */
export function normalizeInviteCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "");
}

export function hashInviteCode(code: string): string {
  return sha256(normalizeInviteCode(code));
}
