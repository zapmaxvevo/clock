"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/** Cada fase agrega su entrada acá. */
const items = [
  { href: "/", label: "Inicio" },
  { href: "/proyectos", label: "Proyectos" },
] as const;

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Principal">
      <ul className="flex items-center gap-4 text-sm">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
              className={cn(
                "hover:text-foreground transition-colors",
                pathname === item.href
                  ? "text-foreground font-medium"
                  : "text-muted-foreground",
              )}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
