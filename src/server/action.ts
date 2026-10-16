import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  DomainError,
  RejectedError,
  type ActionErrorCode,
  type Rejection,
} from "@/server/errors";
import { ForbiddenError } from "@/server/permissions";
import { requireSession, type SessionContext } from "@/server/session";

export {
  DomainError,
  RejectedError,
  type ActionErrorCode,
  type Rejection,
} from "@/server/errors";

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

/** Los textos de cada módulo para las causas que no traen mensaje propio. */
export type ActionMessages = {
  readonly forbidden: string;
  readonly unexpected: string;
};

function failure<T, Code extends string = ActionErrorCode>(
  error: unknown,
  messages: ActionMessages,
): ActionResult<T, Code | ActionErrorCode> {
  if (error instanceof DomainError) {
    const result = { ok: false, code: error.code, message: error.message } as const;
    // `RejectedError` es un `DomainError`: sin reconocerlo acá, el rechazo
    // saldría sin la lista. Esta pregunta la resuelve antes de responder, que es
    // lo que pide el ADR 0011. Una rama propia, delante de esta, vería el código
    // `rejected` fuera de `Code` y obligaría a afirmar el tipo del resultado.
    return error instanceof RejectedError
      ? { ...result, rejections: error.rejections }
      : result;
  }
  if (error instanceof ForbiddenError) {
    return { ok: false, code: "forbidden", message: messages.forbidden };
  }
  if (error instanceof z.ZodError) {
    const issue = error.issues.at(0);
    return {
      ok: false,
      code: "validation",
      message: issue?.message ?? messages.unexpected,
    };
  }
  console.error(error);
  return { ok: false, code: "unexpected", message: messages.unexpected };
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
    return failure<T, Code>(error, options.messages);
  } finally {
    for (const target of options.paths) {
      revalidate(target);
    }
  }
}
