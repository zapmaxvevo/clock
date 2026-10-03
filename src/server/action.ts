import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ForbiddenError } from "@/server/permissions";
import { requireSession, type SessionContext } from "@/server/session";

/** Los códigos que puede devolver cualquier action. Un módulo los amplía. */
export type ActionErrorCode = "validation" | "not_found" | "forbidden" | "unexpected";

export type ActionResult<T, Code extends string = ActionErrorCode> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly code: Code; readonly message: string };

/** Error de dominio de un módulo. La action lo traduce con su código y su mensaje. */
export class DomainError<Code extends string = ActionErrorCode> extends Error {
  constructor(
    readonly code: Code,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

/** Los textos de cada módulo para las causas que no traen mensaje propio. */
export type ActionMessages = {
  readonly forbidden: string;
  readonly unexpected: string;
};

export function failure<T, Code extends string = ActionErrorCode>(
  error: unknown,
  messages: ActionMessages,
): ActionResult<T, Code | ActionErrorCode> {
  if (error instanceof DomainError) {
    return { ok: false, code: error.code, message: error.message };
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
  options: { readonly paths: readonly string[]; readonly messages: ActionMessages },
): Promise<ActionResult<T, Code | ActionErrorCode>> {
  const session = await requireSession();
  try {
    return { ok: true, data: await work(session) };
  } catch (error) {
    return failure<T, Code>(error, options.messages);
  } finally {
    for (const path of options.paths) {
      revalidatePath(path);
    }
  }
}
