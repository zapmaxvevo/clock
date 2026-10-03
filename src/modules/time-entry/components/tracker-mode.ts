/**
 * Modo de la barra del rastreador (TT-16). Se recuerda por navegador en una
 * cookie y no por persona: es una preferencia de presentación, no un dato del
 * dominio, así que no pasa por el service ni se audita. El servidor la lee
 * para dibujar el modo recordado desde la primera respuesta.
 */
export type TrackerMode = "timer" | "manual";

export const TRACKER_MODE_COOKIE = "clock.tracker-mode";

const DEFAULT_MODE: TrackerMode = "timer";
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/** Cualquier valor que no sea uno de los dos modos cae en el modo timer. */
export function parseTrackerMode(value: string | undefined): TrackerMode {
  return value === "timer" || value === "manual" ? value : DEFAULT_MODE;
}

/** Lo que el conmutador le asigna a `document.cookie`. */
export function trackerModeCookie(mode: TrackerMode): string {
  return `${TRACKER_MODE_COOKIE}=${mode}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}
