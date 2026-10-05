"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth-client";
import { initialsOf } from "@/lib/text";

import { menuLabels } from "./labels";
import { UserAvatar } from "./user-avatar";

type UserMenuProps = {
  readonly name: string;
  readonly email: string;
  /** La foto de Google, o `null`: el disparador muestra las iniciales (PF-44). */
  readonly image: string | null;
};

/** PF-10 y PF-30: la cuenta de quien está, con el enlace al perfil y la salida. */
export function UserMenu({ name, email, image }: UserMenuProps) {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);

  async function handleSignOut(): Promise<void> {
    if (pending) {
      return;
    }
    setPending(true);
    await signOut();
    // Una carga completa y no una navegación del cliente (D2 del 7b): el layout
    // raíz se dibuja de nuevo sin sesión, sin la clase del tema de quien salió,
    // y la caché del router se va con las pantallas de esa persona.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- la carga completa es la intención (D2)
    window.location.assign("/login");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={menuLabels.trigger}
        className={buttonVariants({ variant: "ghost", size: "icon" })}
      >
        <UserAvatar image={image} initials={initialsOf(name, email)} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-56">
        {/* El nombre y el correo rotulan el grupo: se anuncian al entrar a sus opciones. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-foreground flex flex-col text-sm font-normal">
            <span className="font-medium">{name}</span>
            <span className="text-muted-foreground">{email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            render={
              <Link
                href="/perfil"
                aria-current={pathname === "/perfil" ? "page" : undefined}
              />
            }
          >
            {menuLabels.profile}
          </DropdownMenuItem>
          {/* El menú sigue abierto mientras sale, para que «Saliendo…» se vea. */}
          <DropdownMenuItem
            closeOnClick={false}
            aria-disabled={pending || undefined}
            onClick={handleSignOut}
          >
            {pending ? menuLabels.signingOut : menuLabels.signOut}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
