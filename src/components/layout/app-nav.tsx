"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/** Cada fase agrega su entrada acá. */
const items = [
  { href: "/", label: "Inicio" },
  { href: "/calendario", label: "Calendario" },
  { href: "/planilla", label: "Planilla" },
  { href: "/reportes", label: "Reportes" },
  { href: "/proyectos", label: "Proyectos" },
] as const;

/** D-R8-2: solo con `team.manage`, que decide el layout. */
const teamItem = { href: "/equipo", label: "Equipo" } as const;

type AppNavProps = {
  /** `canManageTeam` de quien mira. */
  readonly showTeam: boolean;
};

export function AppNav({ showTeam }: AppNavProps) {
  const pathname = usePathname();
  const shown = showTeam ? [...items, teamItem] : items;

  return (
    <nav aria-label="Principal">
      <ul className="flex items-center gap-4 text-sm">
        {shown.map((item) => (
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
