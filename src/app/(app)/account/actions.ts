"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import type { FormState } from "@/lib/form";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  clearPasswordFailures,
  passwordCheckBlockedFor,
  recordPasswordFailure,
  tooManyAttemptsMessage,
} from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-info";
import { destroyOtherSessions, requireUser } from "@/lib/session";
import { newPasswordField } from "@/lib/validation";

export type AccountState = FormState & { notice?: string };

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Podaj obecne hasło."),
    newPassword: newPasswordField,
    newPasswordConfirm: z.string(),
  })
  .refine((data) => data.newPassword === data.newPasswordConfirm, { message: "Nowe hasła nie są identyczne." })
  .refine((data) => data.newPassword !== data.currentPassword, { message: "Nowe hasło musi się różnić od obecnego." });

export async function changePassword(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const user = await requireUser();
  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Same limiter as login: someone with an open session must not be able to guess the password.
  const ip = await getClientIp();
  const blockedMinutes = await passwordCheckBlockedFor(user.email, ip);
  if (blockedMinutes) return { error: tooManyAttemptsMessage(blockedMinutes) };

  const { passwordHash } = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
  if (!(await verifyPassword(passwordHash, parsed.data.currentPassword))) {
    await recordPasswordFailure(user.email, ip);
    return { error: "Obecne hasło jest nieprawidłowe." };
  }

  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(parsed.data.newPassword) } });
  await clearPasswordFailures(user.email);
  // A changed password must lock out anyone who used the old one.
  const ended = await destroyOtherSessions(user.id);

  refresh();
  return {
    notice: ended > 0 ? `Hasło zostało zmienione. Wylogowano z pozostałych urządzeń (${ended}).` : "Hasło zostało zmienione.",
  };
}

export async function logoutOtherSessions(): Promise<AccountState> {
  const user = await requireUser();
  const ended = await destroyOtherSessions(user.id);
  refresh();
  return { notice: `Wylogowano z pozostałych urządzeń (${ended}).` };
}
