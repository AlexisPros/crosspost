import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { decryptToken, encryptToken } from "./token-crypto";

// The key is read on each call, so it can be set after import.
process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");

test("round-trips a token", () => {
  const token = "AQUvlL_DYEzvT2wz1QJiEPeLioeA-ąę-🙂";
  assert.equal(decryptToken(encryptToken(token)), token);
});

test("uses a fresh IV for each encryption", () => {
  assert.notEqual(encryptToken("same"), encryptToken("same"));
});

test("rejects tampered ciphertext", () => {
  const parts = encryptToken("secret").split(".");
  parts[3] = Buffer.from("tampered").toString("base64url");
  assert.throws(() => decryptToken(parts.join(".")));
});

test("rejects a different key", () => {
  const encrypted = encryptToken("secret");
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  assert.throws(() => decryptToken(encrypted));
});
