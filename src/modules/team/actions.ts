"use server";

import { handle, type ActionResult } from "@/server/action";

import * as service from "./service";
import {
  changeRoleInput,
  changeStatusInput,
  teamMessages,
  type ChangeRoleInput,
  type ChangeRoleResult,
  type ChangeStatusInput,
  type ChangeStatusResult,
  type TeamErrorCode,
} from "./schema";

// El permiso lo consulta el service: el recurso necesita la membresía leída, y
// la autoridad se vuelve a leer bajo el bloqueo (D-R8-7).
// D-R8-8, D-E2-11: el árbol entero, como el perfil.
const paths = [{ path: "/", type: "layout" }] as const;

export async function changeRole(
  input: ChangeRoleInput,
): Promise<ActionResult<ChangeRoleResult, TeamErrorCode>> {
  return handle(
    async (session) => service.changeRole(session.actor, changeRoleInput.parse(input)),
    {
      paths,
      messages: {
        forbidden: teamMessages.forbidden,
        unexpected: teamMessages.unexpected,
      },
    },
  );
}

export async function changeStatus(
  input: ChangeStatusInput,
): Promise<ActionResult<ChangeStatusResult, TeamErrorCode>> {
  return handle(
    async (session) =>
      service.changeStatus(session.actor, changeStatusInput.parse(input)),
    {
      paths,
      messages: {
        forbidden: teamMessages.forbiddenAction,
        unexpected: teamMessages.unexpectedStatus,
      },
    },
  );
}
