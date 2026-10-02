"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { signIn } from "@/lib/auth-client";

export function GoogleSignInButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick(): Promise<void> {
    setPending(true);
    setError(null);
    const result = await signIn.social({ provider: "google", callbackURL: "/" });
    if (result.error !== null && result.error !== undefined) {
      setError(result.error.message ?? "No se pudo iniciar sesión.");
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button className="w-full" disabled={pending} onClick={handleClick}>
        {pending ? "Redirigiendo…" : "Entrar con Google"}
      </Button>
      {error === null ? null : (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
