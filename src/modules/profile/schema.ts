import { z } from "zod";

import { noNullCharacter } from "@/lib/text";
import type { ActionResult } from "@/server/action";
import {
  DATE_FORMATS,
  isSupportedTimeZone,
  TIME_FORMATS,
  type DateFormat,
  type TimeFormat,
} from "@/server/time";

/** Los tres temas (PF-23), en el orden del selector. El `check` de la base los repite. */
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

/** El largo máximo del nombre (PF-35). El `check` de la base lo repite. */
export const NAME_MAX = 100;

/** Textos que la interfaz muestra tal cual. */
export const profileMessages = {
  timeZoneUnknown: "Esa zona horaria no existe.",
  formatUnavailable: "Ese formato no está disponible.",
  forbidden: "No tenés permiso para hacer esto.",
  unexpected: "No se pudo guardar. Revisá la conexión y volvé a intentar.",
  themeUnavailable: "Ese tema no está disponible.",
  nameRequired: "Escribí un nombre.",
  nameTooLong: "El nombre no puede superar los 100 caracteres.",
  nameNullCharacter: "El nombre tiene un carácter que no se puede guardar.",
} as const;

/** Las preferencias ya resueltas: nunca hay un nulo (PF-37). */
export type Preferences = {
  readonly timezone: string;
  readonly timeFormat: TimeFormat;
  readonly dateFormat: DateFormat;
  readonly theme: Theme;
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
    z.object({
      key: z.literal("theme"),
      value: z.enum(THEMES, { error: profileMessages.themeUnavailable }),
    }),
  ],
  { error: profileMessages.formatUnavailable },
);

export type UpdatePreferenceInput = z.infer<typeof updatePreferenceInput>;
export type UpdatePreferenceResult = { readonly preferences: Preferences };

/** El nombre editado (PF-07, PF-35): recortado, entre 1 y 100, sin el carácter nulo. */
export const updateNameInput = z.object(
  {
    name: z
      .string({ error: profileMessages.nameRequired })
      .trim()
      .min(1, profileMessages.nameRequired)
      .max(NAME_MAX, profileMessages.nameTooLong)
      .refine(noNullCharacter, profileMessages.nameNullCharacter),
  },
  { error: profileMessages.nameRequired },
);

export type UpdateNameInput = z.infer<typeof updateNameInput>;
export type UpdateNameResult = { readonly name: string };

/** Las actions, como las recibe la pantalla por props desde `page.tsx`. */
export type ProfileActions = {
  readonly updatePreference: (
    input: UpdatePreferenceInput,
  ) => Promise<ActionResult<UpdatePreferenceResult>>;
  readonly updateName: (
    input: UpdateNameInput,
  ) => Promise<ActionResult<UpdateNameResult>>;
};
