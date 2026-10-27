"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { generateInviteCode, hashInviteCode } from "@/lib/crypto";
import { requireAdmin } from "@/lib/session";
import type { FormState } from "@/lib/form";

export type CreateInviteState = FormState & {
  // The plain code; returned only once, right after creation.
  code?: string;
};

const createInviteSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .transform((value) => value || null)
    .pipe(z.email("Podaj poprawny adres e-mail lub zostaw pole puste.").nullable()),
  role: z.enum(["USER", "ADMIN"]),
  expiresInDays: z.coerce.number().int().min(1, "Minimum 1 dzień.").max(90, "Maksimum 90 dni."),
  note: z
    .string()
    .trim()
    .max(200, "Notatka może mieć maksymalnie 200 znaków.")
    .transform((value) => value || null),
});

export async function createInvite(_prev: CreateInviteState, formData: FormData): Promise<CreateInviteState> {
  const admin = await requireAdmin();

  const parsed = createInviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { email, role, expiresInDays, note } = parsed.data;
  const code = generateInviteCode();

  await db.inviteCode.create({
    data: {
      codeHash: hashInviteCode(code),
      email,
      role,
      note,
      createdById: admin.id,
      expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
    },
  });

  refresh();
  return { code };
}

export async function revokeInvite(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  await db.inviteCode.updateMany({
    where: { id, usedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  refresh();
}
