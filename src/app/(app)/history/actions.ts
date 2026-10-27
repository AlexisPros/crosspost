"use server";

import { refresh } from "next/cache";
import { retryPublication, RetryNotAllowedError } from "@/lib/publish";
import { requireUser } from "@/lib/session";

export type RetryState = { error?: string };

export async function retry(_prev: RetryState, formData: FormData): Promise<RetryState> {
  const user = await requireUser();
  const publicationId = String(formData.get("publicationId") ?? "");

  try {
    await retryPublication(user.id, publicationId);
  } catch (error) {
    if (error instanceof RetryNotAllowedError) return { error: error.message };
    throw error;
  }

  // The new attempt (success or failure) shows up in the refreshed history.
  refresh();
  return {};
}
