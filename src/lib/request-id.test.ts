import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { test, type TestContext } from "node:test";
import { z } from "zod";
import { createRequestId } from "./request-id";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function mockCrypto(t: TestContext, value: unknown) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto")!;
  Object.defineProperty(globalThis, "crypto", { configurable: true, value });
  t.after(() => Object.defineProperty(globalThis, "crypto", original));
}

test("uses native randomUUID with its crypto receiver", (t) => {
  const crypto = {
    randomUUID() {
      assert.equal(this, crypto);
      return "cc35b49d-5a2c-4cb0-9e53-bd87a1d7c60d";
    },
  };
  mockCrypto(t, crypto);
  assert.equal(createRequestId(), "cc35b49d-5a2c-4cb0-9e53-bd87a1d7c60d");
});

test("without randomUUID, creates UUIDs accepted by publication validation", (t) => {
  mockCrypto(t, {
    getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
  });
  const ids = Array.from({ length: 100 }, () => createRequestId());
  for (const id of ids) {
    assert.match(id, UUID_V4);
    assert.equal(z.uuid().safeParse(id).success, true);
  }
  assert.equal(new Set(ids).size, ids.length);
});

test("fallback preserves padding and sets the UUID version and variant bits", (t) => {
  const crypto = {
    getRandomValues(bytes: Uint8Array) {
      assert.equal(this, crypto);
      bytes.fill(0);
      bytes[6] = 0xff;
      bytes[8] = 0xff;
      return bytes;
    },
  };
  mockCrypto(t, crypto);
  assert.equal(createRequestId(), "00000000-0000-4f00-bf00-000000000000");
});

test("missing Web Crypto produces a controlled error", (t) => {
  mockCrypto(t, undefined);
  assert.throws(createRequestId, /przeglądarka/);
});
