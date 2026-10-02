import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  ensureWorkspaceContext,
  type WorkspaceContext,
} from "@/modules/workspace/service";
import { auth } from "@/server/auth";

export type CurrentUser = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly image: string | null;
};

export type SessionContext = WorkspaceContext & { readonly user: CurrentUser };

/**
 * Punto central de autenticación del servidor. Toda lectura y toda mutación
 * arranca por acá, y ninguna repite la comprobación por su cuenta.
 */
export async function currentSession(): Promise<SessionContext | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session === null) {
    return null;
  }
  const context = await ensureWorkspaceContext({
    id: session.user.id,
    email: session.user.email,
  });
  return {
    ...context,
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
