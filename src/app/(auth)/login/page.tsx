import Link from "next/link";
import { Card } from "@/components/ui";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <Card>
      <h1 className="mb-5 text-xl font-semibold">Logowanie</h1>
      <LoginForm />
      <p className="mt-5 text-center text-sm text-muted">
        Masz kod zaproszenia?{" "}
        <Link href="/register" className="text-accent hover:underline">
          Załóż konto
        </Link>
      </p>
    </Card>
  );
}
