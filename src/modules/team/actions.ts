"use server";

import { handle, type ActionResult } from "@/server/action";

import * as service from "./service";
import {
  changeRoleInput,
  changeStatusInput,
  releaseEmailInput,
  setAccountLinkInput,
  teamMessages,
  type ChangeRoleInput,
  type ChangeRoleResult,
  type ChangeStatusInput,
  type ChangeStatusResult,
  type ReleaseEmailInput,
  type ReleaseEmailResult,
  type SetAccountLinkInput,
  type SetAccountLinkResult,
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

export async function setAccountLink(
  input: SetAccountLinkInput,
): Promise<ActionResult<SetAccountLinkResult, TeamErrorCode>> {
  return handle(
    async (session) =>
      service.setAccountLink(session.actor, setAccountLinkInput.parse(input)),
    {
      paths,
      messages: {
        forbidden: teamMessages.forbiddenAction,
        unexpected: teamMessages.unexpectedLink,
      },
    },
  );
}

export async function releaseEmail(
  input: ReleaseEmailInput,
): Promise<ActionResult<ReleaseEmailResult, TeamErrorCode>> {
  return handle(
    async (session) =>
      service.releaseEmail(session.actor, releaseEmailInput.parse(input)),
    {
      paths,
      messages: {
        forbidden: teamMessages.forbiddenAction,
        unexpected: teamMessages.unexpectedRelease,
      },
    },
  );
}
