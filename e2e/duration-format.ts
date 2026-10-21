import { PERSON_TIMEZONE } from "./calendar-page";
import { minuteOfDayIn, todayIn, type CivilDay } from "./days";
import { test } from "./session";

/**
 * Lo que comparten los recorridos del formato de duración: los del completo
 * (`duration-format.full.spec.ts`, D-WS2a-12) y los que lo cambian desde
 * `/configuracion` (`duration-format.switch.spec.ts`, D-WS2b-12).
 */

/** El contador del timer: las horas sin relleno, con los dos formatos (PF-22). */
export const COUNTER = /^0:\d{2}:\d{2}$/;

/** El total de un grupo o del período en el completo, con su etiqueta. */
export const FULL_TOTAL = /^Total \d{2,}:\d{2}:\d{2}$/;

/**
 * Minutos del comienzo y del final del día en que los recorridos con timer o
 * con entradas de hoy no corren: el timer sembrado empezó hace diez minutos, y
 * las entradas de hoy van de las 00:00 a las 00:06:40. Al final del día, el
 * transcurrido pasaría al siguiente.
 */
const DAY_START_MARGIN_MINUTES = 15;
const DAY_END_MARGIN_MINUTES = 5;

/** Hoy en la zona de las personas sembradas. */
export function today(): CivilDay {
  return todayIn(PERSON_TIMEZONE);
}

/** Salta el recorrido cerca de la medianoche de la zona de las personas sembradas. */
export function skipNearMidnight(): void {
  const minute = minuteOfDayIn(PERSON_TIMEZONE);
  test.skip(
    minute < DAY_START_MARGIN_MINUTES || minute > 1440 - DAY_END_MARGIN_MINUTES,
    "cerca de la medianoche el timer sembrado y las entradas de hoy no caen en el mismo día",
  );
}
