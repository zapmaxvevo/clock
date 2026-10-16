import { CircleAlertIcon } from "lucide-react";
import { redirect } from "next/navigation";

import { GoogleSignInButton } from "@/components/layout/google-sign-in-button";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { loginErrorMessage } from "@/server/access";
import { currentSession } from "@/server/session";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const session = await currentSession();
  if (session !== null) {
    redirect("/");
  }
  const { error } = await searchParams;
  // D-E1a-14: el texto sale del motivo; el del parámetro nunca se muestra.
  const errorMessage = loginErrorMessage(Array.isArray(error) ? error[0] : error);

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 rounded-lg border p-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Clock</h1>
          <p className="text-muted-foreground text-sm">
            Entrá con la cuenta de Google de la empresa.
          </p>
        </div>
        {errorMessage === null ? null : (
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            <AlertTitle>{errorMessage}</AlertTitle>
          </Alert>
        )}
        <GoogleSignInButton />
      </div>
    </main>
  );
}
