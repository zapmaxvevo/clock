/**
 * El zoom de la grilla del calendario (CAL-11, CAL-12): los minutos de cada
 * franja. Se recuerda por navegador en una cookie, como el modo del
 * rastreador: es una preferencia de presentación, no un dato del dominio. El
 * servidor la lee para dibujar el zoom recordado desde la primera respuesta.
 */
export const CALENDAR_ZOOMS = [60, 30, 15, 5] as const;
export type CalendarZoom = (typeof CALENDAR_ZOOMS)[number];

export const CALENDAR_ZOOM_COOKIE = "clock.calendar-zoom";

const DEFAULT_ZOOM: CalendarZoom = 60;
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/** Cualquier valor que no sea uno de los cuatro tamaños cae en franjas de una hora. */
export function parseCalendarZoom(value: string | undefined): CalendarZoom {
  return CALENDAR_ZOOMS.find((zoom) => String(zoom) === value) ?? DEFAULT_ZOOM;
}

/** Lo que los botones del zoom le asignan a `document.cookie`. */
export function calendarZoomCookie(zoom: CalendarZoom): string {
  return `${CALENDAR_ZOOM_COOKIE}=${zoom}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}

/** «Acercar»: la franja siguiente más chica, o `null` en la de 5 minutos. */
export function zoomedIn(zoom: CalendarZoom): CalendarZoom | null {
  return CALENDAR_ZOOMS[CALENDAR_ZOOMS.indexOf(zoom) + 1] ?? null;
}

/** «Alejar»: la franja siguiente más grande, o `null` en la de una hora. */
export function zoomedOut(zoom: CalendarZoom): CalendarZoom | null {
  return CALENDAR_ZOOMS[CALENDAR_ZOOMS.indexOf(zoom) - 1] ?? null;
}
