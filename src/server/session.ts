import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { displayNameOf, profileOf, type ProfileContext } from "@/modules/profile/service";
import { ensureWorkspaceContext } from "@/modules/workspace/service";
import type { AccessDenialReason } from "@/server/access";
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

/** D-E1b-5: el motivo con que `requireSession` manda a `/login` una sesión sin acceso. */
const NO_ACCESS: AccessDenialReason = "sin_invitacion";

/** D-E1b-5: la lectura de un pedido, con sus tres resultados. */
type SessionRead =
  | { readonly kind: "anonymous" }
  | { readonly kind: "denied" }
  | { readonly kind: "ready"; readonly context: SessionContext };

/**
 * Punto central de autenticación del servidor. Toda lectura y toda mutación
 * arranca por acá, y ninguna repite la comprobación por su cuenta. Una lectura
 * por pedido (ADR 0015): el layout raíz, el del shell y la página la comparten.
 *
 * Una sesión sin acceso existe si la invitación se revoca entre la creación de
 * la sesión y el primer pedido (D-E1b-5). Su fila queda: cada pedido vuelve a
 * decidir, y si a la persona la vuelven a invitar, el siguiente acepta.
 */
const readSession = cache(async (): Promise<SessionRead> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session === null) {
    return { kind: "anonymous" };
  }
  // Dos lecturas independientes, fuera de toda transacción común.
  const [context, stored] = await Promise.all([
    ensureWorkspaceContext({ id: session.user.id, email: session.user.email }),
    profileOf(session.user.id),
  ]);
  if (context === null) {
    return { kind: "denied" };
  }
  return {
    kind: "ready",
    context: {
      ...context,
      preferences: stored.preferences,
      user: {
        id: session.user.id,
        // Único lugar que compone el nombre de quien mira (PF-08, PF-45).
        name: displayNameOf(stored, session.user.name),
        email: session.user.email,
        image: googlePhotoOf(session.user.image),
      },
    },
  };
});

/** El contexto de quien pide, o `null` sin sesión o sin acceso (D-E1b-5). */
export const currentSession = async (): Promise<SessionContext | null> => {
  const read = await readSession();
  return read.kind === "ready" ? read.context : null;
};

/**
 * Sin sesión, redirige a `/login`; con sesión y sin acceso, a
 * `/login?error=sin_invitacion`. Relativa: vale en cualquier preview.
 */
export async function requireSession(): Promise<SessionContext> {
  const read = await readSession();
  if (read.kind === "anonymous") {
    redirect("/login");
  }
  if (read.kind === "denied") {
    redirect(`/login?error=${NO_ACCESS}`);
  }
  return read.context;
}
