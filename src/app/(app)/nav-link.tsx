"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={`whitespace-nowrap rounded-md px-2.5 py-1.5 ${active ? "bg-border/60 font-medium" : "text-muted hover:text-foreground"}`}
    >
      {children}
    </Link>
  );
}
