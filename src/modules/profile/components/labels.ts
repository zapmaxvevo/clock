import type { TimeFormat } from "@/server/time";

/**
 * Textos de la pantalla de perfil y del menú de la cuenta. Los mensajes de
 * error de la action no viven acá: salen de `profileMessages`, en el esquema
 * del módulo.
 */
export const profileLabels = {
  title: "Perfil",
  identity: "Datos de la cuenta",
  /** PF-06 y PF-09: la identidad es de Google, en solo lectura. */
  identityNote: "El nombre, la foto y el correo salen de tu cuenta de Google.",
  name: "Nombre",
  email: "Correo",
  preferences: "Preferencias",
  timeAndDate: "Hora y fecha",
  timezone: "Zona horaria",
  dateFormat: "Formato de fecha",
  timeFormat: "Formato de hora",
  /** El buscador del selector de zona y su vacío. */
  timezoneSearch: "Buscar zona horaria",
  timezoneEmpty: "Ninguna zona horaria coincide con la búsqueda.",
  /** PF-01: el primer día es de la membresía y lo edita un admin. */
  weekStart: "Primer día de la semana",
  weekStartNote: "Lo administra el equipo.",
  /** PF-02: el formato de duración es del workspace y hoy tiene un solo valor. */
  durationFormat: "Formato de duración",
  durationValue: "Compacto (h:mm)",
  durationNote: "Lo define el workspace.",
  /** PF-46: el título es el de TT-92; la línea, propia del perfil. */
  inactiveTitle: "Tu acceso al workspace está desactivado.",
  inactiveMessage:
    "Podés ver tu perfil, pero no cambiarlo. Pedile a quien administra el workspace que vuelva a activar tu membresía.",
} as const;

export const timeFormatNames = {
  "24h": "24 horas",
  "12h": "12 horas",
} as const satisfies Record<TimeFormat, string>;

/** Indexado por `WeekStart`: el domingo es 0. */
export const dayNames = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

/** TT-90: el aviso nombra la operación que no se hizo. */
export const failureTitles = {
  timezone: "No se pudo cambiar la zona horaria.",
  dateFormat: "No se pudo cambiar el formato de fecha.",
  timeFormat: "No se pudo cambiar el formato de hora.",
} as const;

/** PF-10 y PF-30: el menú de la cuenta, en la cabecera del shell. */
export const menuLabels = {
  trigger: "Menú de la cuenta",
  profile: "Perfil",
  signOut: "Salir",
  signingOut: "Saliendo…",
} as const;
