"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashInviteCode } from "@/lib/crypto";
import { burnPasswordCheck, hashPassword, verifyPassword } from "@/lib/password";
import {
  clearPasswordFailures,
  passwordCheckBlockedFor,
  recordPasswordFailure,
  tooManyAttemptsMessage,
} from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-info";
import { createSession, destroySession } from "@/lib/session";
import { emailField, newPasswordField } from "@/lib/validation";
import { Prisma } from "@/generated/prisma/client";
import type { FormState } from "@/lib/form";

const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Podaj hasło."),
});

const registerSchema = z
  .object({
    email: emailField,
    inviteCode: z.string().trim().min(1, "Podaj kod zaproszenia."),
    password: newPasswordField,
    passwordConfirm: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "Hasła nie są identyczne.",
  });

const INVALID_INVITE = "Kod zaproszenia jest nieprawidłowy, wykorzystany lub wygasł.";

class InviteClaimError extends Error {}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { email: String(formData.get("email") ?? "") };
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };

  const { email, password } = parsed.data;
  const ip = await getClientIp();

  // Checked before the password, and the same for unknown emails, so it reveals nothing about accounts.
  const blockedMinutes = await passwordCheckBlockedFor(email, ip);
  if (blockedMinutes) return { error: tooManyAttemptsMessage(blockedMinutes), values };

  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    await burnPasswordCheck(password);
    await recordPasswordFailure(email, ip);
    return { error: "Nieprawidłowy e-mail lub hasło.", values };
  }
  if (!(await verifyPassword(user.passwordHash, password))) {
    await recordPasswordFailure(email, ip);
    return { error: "Nieprawidłowy e-mail lub hasło.", values };
  }

  await clearPasswordFailures(email);
  await createSession(user.id);
  redirect("/");
}

export async function register(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = {
    email: String(formData.get("email") ?? ""),
    inviteCode: String(formData.get("inviteCode") ?? ""),
  };
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };

  const { email, inviteCode, password } = parsed.data;
  const now = new Date();

  const invite = await db.inviteCode.findUnique({ where: { codeHash: hashInviteCode(inviteCode) } });
  if (
    !invite ||
    invite.usedAt ||
    invite.revokedAt ||
    invite.expiresAt < now ||
    (invite.email && invite.email !== email)
  ) {
    return { error: INVALID_INVITE, values };
  }

  if (await db.user.findUnique({ where: { email }, select: { id: true } })) {
    return { error: "Konto z tym adresem e-mail już istnieje.", values };
  }

  const passwordHash = await hashPassword(password);

  let userId: string;
  try {
    userId = await db.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email, passwordHash, role: invite.role } });
      // Conditional update so two parallel registrations cannot both use the same code.
      const claimed = await tx.inviteCode.updateMany({
        where: { id: invite.id, usedAt: null, revokedAt: null },
        data: { usedAt: now, usedById: user.id },
      });
      if (claimed.count !== 1) throw new InviteClaimError();
      return user.id;
    });
  } catch (error) {
    if (error instanceof InviteClaimError) return { error: INVALID_INVITE, values };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Konto z tym adresem e-mail już istnieje.", values };
    }
    throw error;
  }

  await createSession(userId);
  redirect("/");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}
