// Post text rules shared by the composer (live counters) and the server (validation).
import twitterText from "twitter-text";
import type { Provider } from "@/generated/prisma/enums";

export const PROVIDER_LABELS: Record<Provider, string> = { X: "X", LINKEDIN: "LinkedIn" };

// X: 280 weighted characters (Premium accounts are not supported on purpose).
// LinkedIn: 3000 characters of post commentary.
export const LIMITS: Record<Provider, number> = { X: 280, LINKEDIN: 3000 };

// Hard cap on what the server accepts, regardless of selected platforms.
export const MAX_RAW_LENGTH = 10_000;

/** The exact text that will be published: unified line breaks, NFC (as X expects), no outer whitespace. */
export function normalizePostText(text: string): string {
  return text.replace(/\r\n?/g, "\n").normalize("NFC").trim();
}

export type ProviderCount = { length: number; limit: number; overLimit: boolean };

/**
 * X counts by its own rules (twitter-text): any URL = 23, emoji and CJK = 2,
 * Latin (incl. Polish letters) and Cyrillic = 1.
 */
export function countX(text: string): ProviderCount {
  const length = text ? twitterText.parseTweet(text).weightedLength : 0;
  return { length, limit: LIMITS.X, overLimit: length > LIMITS.X };
}

// LinkedIn "little text" reserved characters: | { } @ [ ] ( ) < > # \ * _ ~
// https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/little-text-format
const LITTLE_RESERVED = /[|{}@[\]()<>#\\*_~]/g;
// Hashtags (#word) are a valid little element and stay unescaped so LinkedIn links them.
// Only at the start or after whitespace/an opening bracket or quote, so "C#" and URL fragments stay plain text.
const HASHTAG = /(?<=^|[\s([{"'„«])#[\p{L}\p{N}_]+/gu;

/** Escapes text for the LinkedIn commentary field; otherwise LinkedIn may cut the post at a reserved character. */
export function escapeLinkedInText(text: string): string {
  let result = "";
  let last = 0;
  for (const match of text.matchAll(HASHTAG)) {
    result += text.slice(last, match.index).replace(LITTLE_RESERVED, "\\$&") + match[0];
    last = match.index + match[0].length;
  }
  return result + text.slice(last).replace(LITTLE_RESERVED, "\\$&");
}

/**
 * LinkedIn: UTF-16 length of the escaped text, so emoji count as 2 and each escaped
 * character as 2. Conservative: it is not documented whether escapes count toward the limit.
 */
export function countLinkedIn(text: string): ProviderCount {
  const length = escapeLinkedInText(text).length;
  return { length, limit: LIMITS.LINKEDIN, overLimit: length > LIMITS.LINKEDIN };
}

export function countFor(provider: Provider, text: string): ProviderCount {
  return provider === "X" ? countX(text) : countLinkedIn(text);
}

/**
 * Index in `text` (UTF-16) where content stops fitting into an X post, or null if it fits.
 * Used to highlight the overflowing part in the composer.
 */
export function xOverflowStart(text: string): number | null {
  if (!text) return null;
  const parsed = twitterText.parseTweet(text);
  return parsed.valid || parsed.weightedLength <= LIMITS.X ? null : parsed.validRangeEnd + 1;
}

/** Validation errors in Polish, shown to the user. Empty array means the post can be published. */
export function validatePost(text: string, providers: Provider[]): string[] {
  const errors: string[] = [];
  if (!text) errors.push("Wpisz treść posta.");
  if (providers.length === 0) errors.push("Wybierz co najmniej jedną platformę.");
  for (const provider of providers) {
    const count = countFor(provider, text);
    if (count.overLimit) {
      errors.push(`Tekst przekracza limit ${PROVIDER_LABELS[provider]} (${count.length}/${count.limit}).`);
    }
  }
  return errors;
}
