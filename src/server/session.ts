import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/server/auth";
import {
  readUserContext,
  type SessionContext,
  type SessionRead,
} from "@/server/user-context";

export type { CurrentUser, SessionContext } from "@/server/user-context";

/**
 * Punto central de autenticación del servidor. Toda lectura y toda mutación
 * arranca por acá, y ninguna repite la comprobación por su cuenta. Una lectura
 * por pedido (ADR 0015): el layout raíz, el del shell y la página la comparten.
 *
 * Una sesión sin acceso existe si la invitación se revoca entre la creación de
 * la sesión y el primer pedido (D-E1b-5), o si sale de la política el dominio
 * de quien entró sin invitación (D-E1b-13). Su fila queda: cada pedido vuelve
 * a decidir, y si a la persona la vuelven a invitar, el siguiente acepta.
 */
const readSession = cache(async (): Promise<SessionRead> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session === null) {
    return { kind: "anonymous" };
  }
  return readUserContext(session.user);
});

/** El contexto de quien pide, o `null` sin sesión o sin acceso (D-E1b-5). */
export const currentSession = async (): Promise<SessionContext | null> => {
  const read = await readSession();
  return read.kind === "ready" ? read.context : null;
};

/**
 * Sin sesión, redirige a `/login`; con sesión y sin acceso, a `/login` con el
 * motivo, `sin_invitacion`. Relativa: vale en cualquier preview.
 */
export async function requireSession(): Promise<SessionContext> {
  const read = await readSession();
  if (read.kind === "anonymous") {
    redirect("/login");
  }
  if (read.kind === "denied") {
    redirect(`/login?error=${read.reason}`);
  }
  return read.context;
}
