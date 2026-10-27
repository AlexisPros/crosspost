import { z } from "zod";
import { PASSWORD_MIN_LENGTH } from "@/lib/password-rules";

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Podaj poprawny adres e-mail."));

export const newPasswordField = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Hasło musi mieć co najmniej ${PASSWORD_MIN_LENGTH} znaków.`)
  .max(200, "Hasło jest za długie.");
