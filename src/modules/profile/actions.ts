"use server";

import { handle, type ActionResult } from "@/server/action";
import { assertCan } from "@/server/permissions";

import * as service from "./service";
import { ownProfileResource } from "./service";
import {
  profileMessages,
  updateNameInput,
  updatePreferenceInput,
  type UpdateNameInput,
  type UpdateNameResult,
  type UpdatePreferenceInput,
  type UpdatePreferenceResult,
} from "./schema";

// Todo el árbol: los formatos llegan al cliente por el layout y por cada
// pantalla que muestra horas, el nombre por el encabezado del shell (PF-33), y
// el tema por la clase que dibuja el layout raíz (PF-24).
const options = {
  paths: [{ path: "/", type: "layout" }],
  messages: {
    forbidden: profileMessages.forbidden,
    unexpected: profileMessages.unexpected,
  },
} as const;

export async function updatePreference(
  input: UpdatePreferenceInput,
): Promise<ActionResult<UpdatePreferenceResult>> {
  return handle(async (session) => {
    const values = updatePreferenceInput.parse(input);
    assertCan(session.actor, "profile.own.update", ownProfileResource(session.actor));
    return service.updatePreference(session.actor, values);
  }, options);
}

export async function updateName(
  input: UpdateNameInput,
): Promise<ActionResult<UpdateNameResult>> {
  return handle(async (session) => {
    const values = updateNameInput.parse(input);
    assertCan(session.actor, "profile.own.update", ownProfileResource(session.actor));
    return service.updateName(session.actor, values);
  }, options);
}
