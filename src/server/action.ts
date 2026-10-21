import { revalidatePath } from "next/cache";

import type { ActionErrorCode, Rejection } from "@/server/errors";
import { failureOf, type ActionMessages } from "@/server/failure";
import { requireSession, type SessionContext } from "@/server/session";

export type ActionResult<T, Code extends string = ActionErrorCode> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false;
      readonly code: Code;
      readonly message: string;
      /** Solo con `rejected`: cada fila que impidió la operación en masa. */
      readonly rejections?: readonly Rejection<Code>[];
    };

/**
 * Una ruta suelta, o una ruta con el tipo de `revalidatePath`: con `layout`,
 * todo lo que cuelga de ella.
 */
export type RevalidationTarget =
  string | { readonly path: string; readonly type: "layout" | "page" };

function revalidate(target: RevalidationTarget): void {
  if (typeof target === "string") {
    revalidatePath(target);
    return;
  }
  revalidatePath(target.path, target.type);
}

/**
 * Recorrido común: sesión, trabajo del módulo y resultado tipado. La
 * revalidación corre también cuando hay error de dominio, para que una pestaña
 * desactualizada se resincronice con el estado real.
 */
export async function handle<T, Code extends string = ActionErrorCode>(
  work: (session: SessionContext) => Promise<T>,
  options: {
    readonly paths: readonly RevalidationTarget[];
    readonly messages: ActionMessages;
  },
): Promise<ActionResult<T, Code | ActionErrorCode>> {
  const session = await requireSession();
  try {
    return { ok: true, data: await work(session) };
  } catch (error) {
    return { ok: false, ...failureOf<Code>(error, options.messages) };
  } finally {
    for (const target of options.paths) {
      revalidate(target);
    }
  }
}
