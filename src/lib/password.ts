import "server-only";
import { hash, verify } from "@node-rs/argon2";

export { PASSWORD_MIN_LENGTH } from "@/lib/password-rules";

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password);
}

// Used when the email is unknown, so a failed login takes as long as a wrong password.
let dummyHash: Promise<string> | undefined;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hash("dummy-password-for-timing");
  await verify(await dummyHash, password);
}
