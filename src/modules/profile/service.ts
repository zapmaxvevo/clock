import type { Actor } from "@/server/permissions";
import {
  DATE_FORMATS,
  isUsableTimeZone,
  TIME_FORMATS,
  type DateFormat,
  type TimeFormat,
  type TimeSettings,
  type WeekStart,
} from "@/server/time";
import { weekStartOf, type WorkspaceContext } from "@/modules/workspace/service";

import { profileRepository, type UserPreferenceRow } from "./repository";
import type {
  Preferences,
  UpdatePreferenceInput,
  UpdatePreferenceResult,
} from "./schema";

/** Lo que pide quien muestra horas: la sesión, con las preferencias resueltas. */
export type ProfileContext = WorkspaceContext & { readonly preferences: Preferences };

/**
 * Los predeterminados de P-03. El de la zona es un valor, no `workspace.timezone`:
 * cambiar la zona del cron no mueve de día a nadie (PF-05). Hoy coincide con
 * ella y con `DEFAULT_TIMEZONE`.
 */
export const PREFERENCE_DEFAULTS: Preferences = {
  timezone: "America/Argentina/Buenos_Aires",
  timeFormat: "24h",
  dateFormat: "dd/MM/yyyy",
};

/**
 * Una zona que el entorno ya no sabe convertir cae al predeterminado: es un
 * cambio de versión de Node, no un dato corrupto, y lanzar dejaría a la
 * persona sin ninguna pantalla. Una que convierte se usa aunque ya no esté en
 * la lista, para no moverla de día sin que haya hecho nada.
 */
function resolveTimeZone(value: string | null): string {
  return value !== null && isUsableTimeZone(value) ? value : PREFERENCE_DEFAULTS.timezone;
}

/** El `check` de la base impide un formato fuera de lista; si llega, lanza. */
function knownFormat<Format extends string>(
  formats: readonly Format[],
  value: string | null,
  fallback: Format,
): Format {
  if (value === null) {
    return fallback;
  }
  const known = formats.find((format) => format === value);
  if (known === undefined) {
    throw new RangeError(`Formato fuera de lista: ${value}.`);
  }
  return known;
}

/** Único lugar que aplica los predeterminados, columna por columna. */
export function resolvePreferences(row: UserPreferenceRow | undefined): Preferences {
  return {
    timezone: resolveTimeZone(row?.timezone ?? null),
    timeFormat: knownFormat<TimeFormat>(
      TIME_FORMATS,
      row?.timeFormat ?? null,
      PREFERENCE_DEFAULTS.timeFormat,
    ),
    dateFormat: knownFormat<DateFormat>(
      DATE_FORMATS,
      row?.dateFormat ?? null,
      PREFERENCE_DEFAULTS.dateFormat,
    ),
  };
}

/** Las preferencias de quien pide, ya resueltas. Una consulta por clave primaria. */
export async function preferencesOf(userId: string): Promise<Preferences> {
  return resolvePreferences(await profileRepository.findPreferences(userId));
}

/**
 * Zona, formatos y primer día de la semana con que quien pide ve el tiempo.
 * Única lectura de `context.preferences` para mostrar; el primer día sale de
 * `weekStartOf`, nunca de la membresía directo. Pura, como `weekStartOf`.
 */
export function timeSettingsOf(context: ProfileContext): TimeSettings {
  return {
    timezone: context.preferences.timezone,
    weekStart: weekStartOf(context),
    formats: {
      time: context.preferences.timeFormat,
      date: context.preferences.dateFormat,
    },
  };
}

/** El recurso del perfil propio: la única forma de armarlo (PF-34). */
export function ownProfileResource(actor: Actor) {
  return {
    kind: "profile",
    workspaceId: actor.workspaceId,
    userId: actor.userId,
  } as const;
}

export type ProfileUser = {
  readonly name: string;
  readonly email: string;
  readonly image: string | null;
};

type Choice<Value extends string> = {
  readonly value: Value;
  /** Lo que el control muestra al lado: el desplazamiento o el ejemplo. */
  readonly example: string;
};

export type ProfileView = {
  readonly identity: ProfileUser & { readonly initials: string };
  readonly preferences: Preferences;
  /** La opción de `options.timezones` equivalente a `preferences.timezone`. */
  readonly timezoneOption: string;
  /** Sale de `weekStartOf` (PF-01). Solo lectura. */
  readonly weekStart: WeekStart;
  /** `can(actor, "profile.own.update", ownProfileResource(actor))`. */
  readonly canEdit: boolean;
  readonly options: {
    readonly timezones: readonly Choice<string>[];
    readonly timeFormats: readonly Choice<TimeFormat>[];
    readonly dateFormats: readonly Choice<DateFormat>[];
  };
};

/** Sin consultas: todo está en la sesión o en el entorno. */
export function getProfileView(
  context: ProfileContext,
  user: ProfileUser,
  now: Date = new Date(),
): ProfileView {
  throw new Error(
    `getProfileView sin implementar (${context.actor.userId}, ${user.email}, ${now.toISOString()}).`,
  );
}

/** PF-11 a PF-13, PF-32, PF-34, PF-35. */
export async function updatePreference(
  actor: Actor,
  input: UpdatePreferenceInput,
): Promise<UpdatePreferenceResult> {
  throw new Error(`updatePreference sin implementar (${actor.userId}, ${input.key}).`);
}
