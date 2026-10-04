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
 * La foto sale de Google (PF-09): una que no viene de su servidor de imágenes
 * no se muestra, y quedan las iniciales (PF-44).
 */
const GOOGLE_PHOTO_PREFIX = "https://lh3.googleusercontent.com/";

function googlePhotoOf(image: string | null | undefined): string | null {
  return image?.startsWith(GOOGLE_PHOTO_PREFIX) === true ? image : null;
}

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
      image: googlePhotoOf(session.user.image),
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
