import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { preferencesOf, type ProfileContext } from "@/modules/profile/service";
import { ensureWorkspaceContext } from "@/modules/workspace/service";
import { auth } from "@/server/auth";

export type CurrentUser = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly image: string | null;
};

export type SessionContext = ProfileContext & { readonly user: CurrentUser };

/**
 * Punto central de autenticación del servidor. Toda lectura y toda mutación
 * arranca por acá, y ninguna repite la comprobación por su cuenta.
 */
export async function currentSession(): Promise<SessionContext | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session === null) {
    return null;
  }
  // Dos lecturas independientes, fuera de toda transacción común.
  const [context, preferences] = await Promise.all([
    ensureWorkspaceContext({ id: session.user.id, email: session.user.email }),
    preferencesOf(session.user.id),
  ]);
  return {
    ...context,
    preferences,
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image ?? null,
    },
  };
}

/** Variante para páginas y actions que exigen sesión. */
export async function requireSession(): Promise<SessionContext> {
  const session = await currentSession();
  if (session === null) {
    redirect("/login");
  }
  return session;
}
