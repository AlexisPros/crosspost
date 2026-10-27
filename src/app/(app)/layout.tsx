import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { requireUser } from "@/lib/session";
import { logout } from "../(auth)/actions";
import { NavLink } from "./nav-link";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex min-h-14 max-w-4xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2">
          <Link href="/" className="font-semibold tracking-tight">
            Crosspost
          </Link>
          <Suspense fallback={<div className="flex-1" />}>
            <UserNav />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}

async function UserNav() {
  const user = await requireUser();

  return (
    <>
      {/* On narrow screens the nav moves to its own row below the logo and logout. */}
      <nav className="order-last -mx-2.5 flex w-full items-center gap-1 overflow-x-auto text-sm sm:order-none sm:mx-0 sm:w-auto sm:flex-1">
        <NavLink href="/">Nowy post</NavLink>
        <NavLink href="/history">Historia</NavLink>
        <NavLink href="/connections">Połączenia</NavLink>
        <NavLink href="/account">Konto</NavLink>
        {user.role === "ADMIN" && <NavLink href="/admin/invites">Zaproszenia</NavLink>}
      </nav>
      <div className="ml-auto flex items-center gap-3 text-sm">
        <span className="hidden text-muted sm:inline">{user.email}</span>
        <form action={logout}>
          <button type="submit" className="rounded-md px-2 py-1 text-muted hover:bg-border/50 hover:text-foreground">
            Wyloguj
          </button>
        </form>
      </div>
    </>
  );
}
