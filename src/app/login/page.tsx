import { redirect } from "next/navigation";

import { GoogleSignInButton } from "@/components/layout/google-sign-in-button";
import { currentSession } from "@/server/session";

export default async function LoginPage() {
  const session = await currentSession();
  if (session !== null) {
    redirect("/");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 rounded-lg border p-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Clock</h1>
          <p className="text-muted-foreground text-sm">
            Entrá con la cuenta de Google de la empresa.
          </p>
        </div>
        <GoogleSignInButton />
      </div>
    </main>
  );
}
