import assert from "node:assert/strict";
import { test } from "node:test";
import { OAUTH_COMPLETE, oauthResultPath, parsePopupId } from "./oauth-popup";

test("popup ids accept only UUIDs", () => {
  assert.equal(parsePopupId("b405d672-7861-413e-949c-e30dbd970996"), "b405d672-7861-413e-949c-e30dbd970996");
  for (const input of [null, undefined, [], "", "https://other.example", "anything"]) {
    assert.equal(parsePopupId(input), undefined);
  }
});

test("popup success and cancellation refresh the correct provider without reopening a popup", () => {
  assert.equal(oauthResultPath({ type: OAUTH_COMPLETE, search: "?provider=x&connected=1&popup=ignored" }, "x"), "/connections?provider=x&connected=1");
  assert.equal(oauthResultPath({ type: OAUTH_COMPLETE, search: "?provider=linkedin&error=denied" }, "linkedin"), "/connections?provider=linkedin&error=denied");
});

test("popup messages cannot redirect externally or complete another provider's flow", () => {
  for (const data of [null, {}, { type: "other", search: "?provider=x" }, { type: OAUTH_COMPLETE, search: "//other.example" }, { type: OAUTH_COMPLETE, search: "?provider=linkedin&connected=1" }]) {
    assert.equal(oauthResultPath(data, "x"), null);
  }
  assert.equal(oauthResultPath({ type: OAUTH_COMPLETE, search: "?provider=x&connected=1&next=https://other.example" }, "x"), "/connections?provider=x&connected=1");
});
