import { z } from "zod";

import type { ActionResult } from "@/server/action";
import {
  DATE_FORMATS,
  isSupportedTimeZone,
  TIME_FORMATS,
  type DateFormat,
  type TimeFormat,
} from "@/server/time";

/** Textos que la interfaz muestra tal cual. */
export const profileMessages = {
  timeZoneUnknown: "Esa zona horaria no existe.",
  formatUnavailable: "Ese formato no está disponible.",
  forbidden: "No tenés permiso para hacer esto.",
  unexpected: "No se pudo guardar. Revisá la conexión y volvé a intentar.",
} as const;

/** Las preferencias ya resueltas: nunca hay un nulo (PF-37). */
export type Preferences = {
  readonly timezone: string;
  readonly timeFormat: TimeFormat;
  readonly dateFormat: DateFormat;
};

/**
 * Una preferencia por pedido: cada control guarda solo (PF-32), y dos cambios
 * de claves distintas no se pisan. Una clave desconocida responde
 * `formatUnavailable`. La zona se guarda tal como llega, sin normalizar.
 */
export const updatePreferenceInput = z.discriminatedUnion(
  "key",
  [
    z.object({
      key: z.literal("timezone"),
      // El mismo mensaje cuando el valor ni siquiera es texto.
      value: z
        .string({ error: profileMessages.timeZoneUnknown })
        .refine(isSupportedTimeZone, { error: profileMessages.timeZoneUnknown }),
    }),
    z.object({
      key: z.literal("timeFormat"),
      value: z.enum(TIME_FORMATS, { error: profileMessages.formatUnavailable }),
    }),
    z.object({
      key: z.literal("dateFormat"),
      value: z.enum(DATE_FORMATS, { error: profileMessages.formatUnavailable }),
    }),
  ],
  { error: profileMessages.formatUnavailable },
);

export type UpdatePreferenceInput = z.infer<typeof updatePreferenceInput>;
export type UpdatePreferenceResult = { readonly preferences: Preferences };

/** La action, como la recibe la pantalla por props desde `page.tsx`. */
export type ProfileActions = {
  readonly updatePreference: (
    input: UpdatePreferenceInput,
  ) => Promise<ActionResult<UpdatePreferenceResult>>;
};
