import { initialsOf } from "@/lib/text";
import { recordAudit } from "@/server/audit";
import { db } from "@/server/db";
import { can, type Actor } from "@/server/permissions";
import {
  canonicalTimeZone,
  clockLabel,
  DATE_FORMATS,
  dayKey,
  formatDayKey,
  isUsableTimeZone,
  supportedTimeZones,
  TIME_FORMATS,
  utcOffsetLabel,
  type DateFormat,
  type TimeFormat,
  type TimeSettings,
  type WeekStart,
} from "@/server/time";
import { weekStartOf, type WorkspaceContext } from "@/modules/workspace/service";

import {
  profileRepository,
  type PreferenceColumn,
  type UserPreferenceRow,
} from "./repository";
import {
  THEMES,
  type Preferences,
  type Theme,
  type UpdateNameInput,
  type UpdateNameResult,
  type UpdatePreferenceInput,
  type UpdatePreferenceResult,
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
  theme: "system",
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

/** El `check` de la base impide un valor fuera de lista; si llega, lanza. */
function knownChoice<Choice extends string>(
  choices: readonly Choice[],
  value: string | null,
  fallback: Choice,
): Choice {
  if (value === null) {
    return fallback;
  }
  const known = choices.find((choice) => choice === value);
  if (known === undefined) {
    throw new RangeError(`Valor fuera de lista: ${value}.`);
  }
  return known;
}

/** Único lugar que aplica los predeterminados, columna por columna. */
export function resolvePreferences(row: UserPreferenceRow | undefined): Preferences {
  return {
    timezone: resolveTimeZone(row?.timezone ?? null),
    timeFormat: knownChoice<TimeFormat>(
      TIME_FORMATS,
      row?.timeFormat ?? null,
      PREFERENCE_DEFAULTS.timeFormat,
    ),
    dateFormat: knownChoice<DateFormat>(
      DATE_FORMATS,
      row?.dateFormat ?? null,
      PREFERENCE_DEFAULTS.dateFormat,
    ),
    theme: knownChoice<Theme>(THEMES, row?.theme ?? null, PREFERENCE_DEFAULTS.theme),
  };
}

/** Lo que la persona guardó de su cuenta, resuelto. */
export type StoredProfile = {
  readonly preferences: Preferences;
  /** El nombre que eligió, o `null` si nunca lo editó. */
  readonly displayName: string | null;
};

/** Una consulta por clave primaria: las preferencias resueltas y el nombre tal como está. */
export async function profileOf(userId: string): Promise<StoredProfile> {
  const row = await profileRepository.findPreferences(userId);
  return {
    preferences: resolvePreferences(row),
    displayName: row?.displayName ?? null,
  };
}

/** El nombre que se muestra: el editado, o el de la cuenta de Google (PF-08, PF-45). */
export function displayNameOf(stored: StoredProfile, accountName: string): string {
  return stored.displayName ?? accountName;
}

/**
 * La clase de `<html>` (PF-23, PF-24, ADR 0015). Sin sesión, o con «Seguir al
 * sistema», ninguna: lo resuelve la hoja de estilos. Única lectura del tema
 * para mostrar.
 */
export function themeClassOf(
  context: ProfileContext | null,
): "light" | "dark" | undefined {
  const theme = context?.preferences.theme;
  return theme === "light" || theme === "dark" ? theme : undefined;
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
    /** Sin ejemplo: el nombre de cada tema lo pone la pantalla. */
    readonly themes: readonly Theme[];
  };
};

/**
 * La opción del selector que equivale a la zona: la que lista el entorno para
 * su forma canónica, o la zona misma si el entorno ya no la lista (§5.2).
 */
function timeZoneOptionOf(timeZone: string, listed: readonly string[]): string {
  const canonical = canonicalTimeZone(timeZone);
  return canonical !== null && listed.includes(canonical) ? canonical : timeZone;
}

/** Sin consultas: todo está en la sesión o en el entorno. */
export function getProfileView(
  context: ProfileContext,
  user: ProfileUser,
  now: Date = new Date(),
): ProfileView {
  const settings = timeSettingsOf(context);
  const listed = supportedTimeZones();
  const timezoneOption = timeZoneOptionOf(settings.timezone, listed);
  const zones = listed.includes(timezoneOption)
    ? listed
    : [...listed, timezoneOption].sort();
  const todayKey = dayKey(now, settings.timezone);
  return {
    identity: { ...user, initials: initialsOf(user.name, user.email) },
    preferences: context.preferences,
    timezoneOption,
    weekStart: settings.weekStart,
    canEdit: can(context.actor, "profile.own.update", ownProfileResource(context.actor)),
    options: {
      timezones: zones.map((zone) => ({
        value: zone,
        example: utcOffsetLabel(zone, now),
      })),
      timeFormats: TIME_FORMATS.map((format) => ({
        value: format,
        example: clockLabel("13:00", format),
      })),
      dateFormats: DATE_FORMATS.map((format) => ({
        value: format,
        example: formatDayKey(todayKey, format, true),
      })),
      themes: THEMES,
    },
  };
}

const AUDIT_ENTITY = "user_preference";

/** Una columna de la fila con su valor: la clave de una preferencia, o el nombre. */
type ColumnChange =
  UpdatePreferenceInput | { readonly key: "displayName"; readonly value: string };

/** La columna que escribe el pedido, con su valor. */
function columnOf(change: ColumnChange): PreferenceColumn {
  switch (change.key) {
    case "timezone":
      return { timezone: change.value };
    case "timeFormat":
      return { timeFormat: change.value };
    case "dateFormat":
      return { dateFormat: change.value };
    case "theme":
      return { theme: change.value };
    case "displayName":
      return { displayName: change.value };
  }
}

/**
 * Pedir el valor ya guardado es un éxito sin efecto (TT-89). Un nulo no es
 * igual a ningún valor: elegir el predeterminado, o el nombre de Google (D1),
 * deja de seguirlo.
 */
async function writePreferenceColumn(
  actor: Actor,
  change: ColumnChange,
  auditAction: string,
): Promise<UserPreferenceRow | undefined> {
  return db.transaction(async (tx) => {
    // La fila asegurada pone en fila a los pedidos de la persona, también al primero.
    await profileRepository.ensurePreferences(tx, actor.userId);
    const row = await profileRepository.findPreferencesForUpdate(tx, actor.userId);
    const previous = row?.[change.key] ?? null;
    if (previous === change.value) {
      return row;
    }
    const written = await profileRepository.writePreference(
      tx,
      actor.userId,
      columnOf(change),
    );
    await recordAudit(tx, {
      workspaceId: actor.workspaceId,
      actorId: actor.userId,
      action: auditAction,
      entity: AUDIT_ENTITY,
      entityId: actor.userId,
      previousValue: { [change.key]: previous },
      nextValue: { [change.key]: change.value },
    });
    return written;
  });
}

/** PF-11 a PF-13, PF-23, PF-32, PF-35. El permiso (PF-34) lo consulta la action. */
export async function updatePreference(
  actor: Actor,
  input: UpdatePreferenceInput,
): Promise<UpdatePreferenceResult> {
  const row = await writePreferenceColumn(actor, input, "profile.updatePreference");
  return { preferences: resolvePreferences(row) };
}

/**
 * PF-07, PF-08, PF-35. El permiso (PF-34) lo consulta la action. Compara contra
 * `display_name` y nada más (D1): no lee `user.name`, y el nombre de Google
 * pedido después de haber editado otro se guarda.
 */
export async function updateName(
  actor: Actor,
  input: UpdateNameInput,
): Promise<UpdateNameResult> {
  await writePreferenceColumn(
    actor,
    { key: "displayName", value: input.name },
    "profile.updateName",
  );
  return { name: input.name };
}
