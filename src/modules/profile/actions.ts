"use server";

import { handle, type ActionResult } from "@/server/action";

import * as service from "./service";
import {
  profileMessages,
  updatePreferenceInput,
  type UpdatePreferenceInput,
  type UpdatePreferenceResult,
} from "./schema";

// Todo el árbol: los formatos llegan al cliente por el layout y por cada
// pantalla que muestra horas (PF-33).
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
  return handle(
    async (session) =>
      service.updatePreference(session.actor, updatePreferenceInput.parse(input)),
    options,
  );
}
