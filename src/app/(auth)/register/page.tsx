import Link from "next/link";
import { Card } from "@/components/ui";
import { RegisterForm } from "./register-form";

export default function RegisterPage() {
  return (
    <Card>
      <h1 className="mb-1 text-xl font-semibold">Załóż konto</h1>
      <p className="mb-5 text-sm text-muted">Rejestracja jest możliwa tylko z jednorazowym kodem zaproszenia.</p>
      <RegisterForm />
      <p className="mt-5 text-center text-sm text-muted">
        Masz już konto?{" "}
        <Link href="/login" className="text-accent hover:underline">
          Zaloguj się
        </Link>
      </p>
    </Card>
  );
}
