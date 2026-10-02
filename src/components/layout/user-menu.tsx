"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-client";

export function UserMenu({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSignOut(): Promise<void> {
    setPending(true);
    await signOut();
    router.replace("/login");
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-muted-foreground" title={email}>
        {name}
      </span>
      <Button variant="outline" size="sm" disabled={pending} onClick={handleSignOut}>
        {pending ? "Saliendo…" : "Salir"}
      </Button>
    </div>
  );
}
