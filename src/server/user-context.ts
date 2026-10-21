/**
 * El armado de un pedido a partir de la persona (D-MCP-3, D-MCP-4). No importa
 * `auth.ts` ni `next/headers`: lo usan la sesión, el token del MCP y el gancho
 * que autoriza asistentes.
 */

import { displayNameOf, profileOf, type ProfileContext } from "@/modules/profile/service";
import { ensureWorkspaceContext } from "@/modules/workspace/service";
import type { AccessDenialReason } from "@/server/access";
import { decideSessionIdentity } from "@/server/entry";

export type CurrentUser = {
  readonly id: string;
  /** El nombre que se muestra: el editado o el de Google (`displayNameOf`). */
  readonly name: string;
  readonly email: string;
  readonly image: string | null;
};

export type SessionContext = ProfileContext & { readonly user: CurrentUser };

/** D-E1b-5: la lectura de un pedido, con sus tres resultados. */
export type SessionRead =
  | { readonly kind: "anonymous" }
  | { readonly kind: "denied"; readonly reason: AccessDenialReason }
  | { readonly kind: "ready"; readonly context: SessionContext };

/** La persona de una sesión o de un token, como la guarda `user`. */
export type SessionUser = {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly image?: string | null;
};

/**
 * La foto sale de Google (PF-09): una que no viene de su servidor de imágenes
 * no se muestra, y quedan las iniciales (PF-44).
 */
const GOOGLE_PHOTO_PREFIX = "https://lh3.googleusercontent.com/";

function googlePhotoOf(image: string | null | undefined): string | null {
  return image?.startsWith(GOOGLE_PHOTO_PREFIX) === true ? image : null;
}

/** D-E1b-5: el motivo con que se manda a `/login` a una persona sin acceso. */
const NO_ACCESS: AccessDenialReason = "sin_invitacion";

/**
 * D-MCP-3, D-MCP-4: el armado de un pedido a partir de la persona, sin cookies:
 * identidad por pedido, `ensureWorkspaceContext` y el perfil. Lo usan
 * `readSession` y `readAssistantContext`, que lee el token del MCP en
 * `readMcpContext` y autoriza en `mcpAuthMiddleware`; la regla vive una vez.
 */
export async function readUserContext(
  user: SessionUser,
): Promise<Exclude<SessionRead, { kind: "anonymous" }>> {
  const identity = await decideSessionIdentity(user.email);
  if (!identity.allowed) {
    return { kind: "denied", reason: identity.reason };
  }
  // Dos lecturas independientes, fuera de toda transacción común.
  const [context, stored] = await Promise.all([
    ensureWorkspaceContext({ id: user.id, email: user.email }),
    profileOf(user.id),
  ]);
  if (context === null) {
    return { kind: "denied", reason: NO_ACCESS };
  }
  return {
    kind: "ready",
    context: {
      ...context,
      preferences: stored.preferences,
      user: {
        id: user.id,
        // Único lugar que compone el nombre de quien mira (PF-08, PF-45).
        name: displayNameOf(stored, user.name),
        email: user.email,
        image: googlePhotoOf(user.image),
      },
    },
  };
}
