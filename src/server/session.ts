import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { displayNameOf, profileOf, type ProfileContext } from "@/modules/profile/service";
import { ensureWorkspaceContext } from "@/modules/workspace/service";
import { auth } from "@/server/auth";

export type CurrentUser = {
  readonly id: string;
  /** El nombre que se muestra: el editado o el de Google (`displayNameOf`). */
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
 * arranca por acá, y ninguna repite la comprobación por su cuenta. Una lectura
 * por pedido (ADR 0015): el layout raíz, el del shell y la página la comparten.
 */
export const currentSession = cache(async (): Promise<SessionContext | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session === null) {
    return null;
  }
  // Dos lecturas independientes, fuera de toda transacción común.
  const [context, stored] = await Promise.all([
    ensureWorkspaceContext({ id: session.user.id, email: session.user.email }),
    profileOf(session.user.id),
  ]);
  return {
    ...context,
    preferences: stored.preferences,
    user: {
      id: session.user.id,
      // Único lugar que compone el nombre que se muestra (PF-08, PF-45).
      name: displayNameOf(stored, session.user.name),
      email: session.user.email,
      image: googlePhotoOf(session.user.image),
    },
  };
});

/** Variante para páginas y actions que exigen sesión. */
export async function requireSession(): Promise<SessionContext> {
  const session = await currentSession();
  if (session === null) {
    redirect("/login");
  }
  return session;
}
