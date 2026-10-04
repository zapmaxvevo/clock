"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth-client";
import { initialsOf } from "@/lib/text";
import { menuLabels } from "@/modules/profile/components/labels";

type UserMenuProps = {
  readonly name: string;
  readonly email: string;
  /** La foto de Google, o `null`: el disparador muestra las iniciales (PF-44). */
  readonly image: string | null;
};

/** PF-10 y PF-30: la cuenta de quien está, con el enlace al perfil y la salida. */
export function UserMenu({ name, email, image }: UserMenuProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, setPending] = useState(false);

  async function handleSignOut(): Promise<void> {
    if (pending) {
      return;
    }
    setPending(true);
    await signOut();
    router.replace("/login");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={menuLabels.trigger}
        className={buttonVariants({ variant: "ghost", size: "icon" })}
      >
        <Avatar>
          {image !== null && (
            // La foto de Google se pide sin referer; el CSP ya admite su
            // dominio, y `next/image` pediría configurar `remotePatterns`.
            <AvatarImage src={image} alt="" referrerPolicy="no-referrer" />
          )}
          <AvatarFallback aria-hidden="true">{initialsOf(name, email)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-56">
        <div className="flex flex-col px-1.5 py-1 text-sm">
          <span className="font-medium">{name}</span>
          <span className="text-muted-foreground">{email}</span>
        </div>
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
