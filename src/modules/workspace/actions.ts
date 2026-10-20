"use server";

import { handle, type ActionResult } from "@/server/action";

import * as service from "./service";
import {
  invitationMessages,
  inviteInput,
  revokeInvitationInput,
  updateWorkspaceNameInput,
  workspaceSettingsMessages,
  type InvitationErrorCode,
  type InviteInput,
  type InviteResult,
  type RevokeInvitationInput,
  type RevokeInvitationResult,
  type UpdateWorkspaceNameInput,
  type UpdateWorkspaceNameResult,
  type WorkspaceSettingsErrorCode,
} from "./schema";

// El permiso lo consulta el service: la autoridad se vuelve a leer bajo el
// bloqueo (D-E1a-9).
const options = {
  // La tabla de `/equipo`; ni la navegación ni el resto del shell cambian.
  paths: ["/equipo"],
} as const;

export async function inviteMembers(
  input: InviteInput,
): Promise<ActionResult<InviteResult, InvitationErrorCode>> {
  return handle(
    async (session) => service.inviteMembers(session.actor, inviteInput.parse(input)),
    {
      ...options,
      messages: {
        forbidden: invitationMessages.forbidden,
        unexpected: invitationMessages.unexpectedInvite,
      },
    },
  );
}

export async function revokeInvitation(
  input: RevokeInvitationInput,
): Promise<ActionResult<RevokeInvitationResult, InvitationErrorCode>> {
  return handle(
    async (session) =>
      service.revokeInvitation(session.actor, revokeInvitationInput.parse(input)),
    {
      ...options,
      messages: {
        forbidden: invitationMessages.forbidden,
        unexpected: invitationMessages.unexpectedRevoke,
      },
    },
  );
}

// Todo el árbol: el nombre está en el encabezado del shell (WS-64, D-WS1-4). El
// permiso lo consulta el service, que relee la autoridad bajo el bloqueo
// (D-WS1-2).
const settingsOptions = {
  paths: [{ path: "/", type: "layout" }],
  messages: {
    forbidden: workspaceSettingsMessages.forbidden,
    unexpected: workspaceSettingsMessages.unexpected,
  },
} as const;

export async function updateWorkspaceName(
  input: UpdateWorkspaceNameInput,
): Promise<ActionResult<UpdateWorkspaceNameResult, WorkspaceSettingsErrorCode>> {
  return handle(
    async (session) =>
      service.updateWorkspaceName(session.actor, updateWorkspaceNameInput.parse(input)),
    settingsOptions,
  );
}
