"use server";

import { handle, type ActionResult } from "@/server/action";

import * as service from "./service";
import {
  changeRoleInput,
  teamMessages,
  type ChangeRoleInput,
  type ChangeRoleResult,
  type TeamErrorCode,
} from "./schema";

// El permiso lo consulta el service: el recurso necesita la membresía leída, y
// la autoridad se vuelve a leer bajo el bloqueo (D-R8-7).
const options = {
  // D-R8-8: el árbol entero, como el perfil.
  paths: [{ path: "/", type: "layout" }],
  messages: { forbidden: teamMessages.forbidden, unexpected: teamMessages.unexpected },
} as const;

export async function changeRole(
  input: ChangeRoleInput,
): Promise<ActionResult<ChangeRoleResult, TeamErrorCode>> {
  return handle(
    async (session) => service.changeRole(session.actor, changeRoleInput.parse(input)),
    options,
  );
}
