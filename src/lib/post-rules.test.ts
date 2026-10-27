import assert from "node:assert/strict";
import { test } from "node:test";
import { countLinkedIn, countX, escapeLinkedInText, normalizePostText, validatePost, xOverflowStart } from "./post-rules";

test("X: 280 plain characters fit, 281 do not", () => {
  assert.equal(countX("a".repeat(280)).overLimit, false);
  assert.equal(countX("a".repeat(281)).overLimit, true);
});

test("X: Polish letters and Cyrillic count as 1", () => {
  assert.equal(countX("zażółć gęślą jaźń").length, 17);
  assert.equal(countX("Привіт").length, 6);
});

test("X: emoji counts as 2", () => {
  assert.equal(countX("🙂").length, 2);
  assert.equal(countX("ok 👍🏽").length, 5); // emoji with skin tone is still one emoji
});

test("X: any URL counts as 23", () => {
  assert.equal(countX("https://example.com/a/very/long/path/that/goes/on/and/on").length, 23);
  assert.equal(countX("see example.com").length, 4 + 23);
});

test("LinkedIn: 3000 limit, emoji counted as UTF-16 length", () => {
  assert.equal(countLinkedIn("a".repeat(3000)).overLimit, false);
  assert.equal(countLinkedIn("a".repeat(3001)).overLimit, true);
  assert.equal(countLinkedIn("🙂").length, 2);
});

test("LinkedIn: escapes reserved characters but keeps hashtags", () => {
  assert.equal(escapeLinkedInText("plain text, ąę!"), "plain text, ąę!");
  assert.equal(escapeLinkedInText("a (b) [c] {d} <e> @f *g* _h_ ~i~ j|k \\"), "a \\(b\\) \\[c\\] \\{d\\} \\<e\\> \\@f \\*g\\* \\_h\\_ \\~i\\~ j\\|k \\\\");
  assert.equal(escapeLinkedInText("#launch and #nowy_produkt2026 today"), "#launch and #nowy_produkt2026 today");
  assert.equal(escapeLinkedInText("(#tag)"), "\\(#tag\\)");
  assert.equal(escapeLinkedInText("# alone"), "\\# alone");
  assert.equal(escapeLinkedInText("C# i C#sharp"), "C\\# i C\\#sharp");
});

test("LinkedIn: URL fragments and underscores are escaped, not turned into hashtags", () => {
  assert.equal(escapeLinkedInText("https://site.pl/a_b#sekcja"), "https://site.pl/a\\_b\\#sekcja");
});

test("LinkedIn: escaped characters count toward the limit", () => {
  assert.equal(countLinkedIn("(a)").length, 5);
  assert.equal(countLinkedIn("#tag").length, 4);
});

test("normalizes line breaks, NFC and outer whitespace", () => {
  assert.equal(normalizePostText("  a\r\nb\rc  \n"), "a\nb\nc");
  const decomposed = "ż"; // z + combining dot above
  assert.equal(normalizePostText(decomposed), "ż");
});

test("overflow starts right after the last character that fits", () => {
  assert.equal(xOverflowStart("a".repeat(280)), null);
  assert.equal(xOverflowStart("a".repeat(285)), 280);
  assert.equal(xOverflowStart(""), null);
});

test("validatePost reports empty text, no platform and each exceeded limit", () => {
  assert.deepEqual(validatePost("hello", ["X", "LINKEDIN"]), []);
  assert.deepEqual(validatePost("", ["X"]), ["Wpisz treść posta."]);
  assert.deepEqual(validatePost("hello", []), ["Wybierz co najmniej jedną platformę."]);

  const long = "a".repeat(300);
  assert.deepEqual(validatePost(long, ["X", "LINKEDIN"]), ["Tekst przekracza limit X (300/280)."]);
  assert.deepEqual(validatePost(long, ["LINKEDIN"]), []);
});
