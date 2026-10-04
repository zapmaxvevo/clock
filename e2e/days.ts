/**
 * Cuentas de días civiles para los recorridos que eligen fechas. Se arman acá
 * y no con `src/server/time`: un test que calcula lo esperado con el mismo
 * código que lo produce no puede encontrarle un error.
 */

/** Un día civil, con el mes de 1 a 12. */
export type CivilDay = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
};

/** Nombres que usa el calendario, el de `date-fns` en español. */
const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** Abreviaturas del rótulo de la fecha, las de `date-fns` en español. */
const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** Hoy en una zona horaria, que no tiene por qué ser la del proceso. */
export function todayIn(timeZone: string): CivilDay {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((candidate) => candidate.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

/** Minutos de reloj desde las 00:00 en una zona horaria, de 0 a 1439. */
export function minuteOfDayIn(timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((candidate) => candidate.type === type)?.value);
  return part("hour") * 60 + part("minute");
}

function utcOf({ year, month, day }: CivilDay): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDays(civil: CivilDay, days: number): CivilDay {
  const date = utcOf(civil);
  date.setUTCDate(date.getUTCDate() + days);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function sameDay(left: CivilDay, right: CivilDay): boolean {
  return left.year === right.year && left.month === right.month && left.day === right.day;
}

/** Meses que hay que avanzar desde `from` para llegar a `to`; negativo, atrás. */
export function monthsBetween(from: CivilDay, to: CivilDay): number {
  return (to.year - from.year) * 12 + (to.month - from.month);
}

/**
 * Rótulo con que la pantalla nombra un día (TT-44): «Hoy», «Ayer», o el día
 * de la semana con la fecha, que lleva el año solo si no es el de hoy.
 */
export function dayLabel(civil: CivilDay, today: CivilDay): string {
  if (sameDay(civil, today)) {
    return "Hoy";
  }
  if (sameDay(civil, addDays(today, -1))) {
    return "Ayer";
  }
  return weekdayLabel(civil, today);
}

/**
 * Rótulo de un día sin «Hoy» ni «Ayer»: el día de la semana con la fecha, que
 * lleva el año solo si no es el de hoy. Es el de cada columna del calendario
 * y el que nombra el día en un bloque (CAL-09, CAL-75).
 */
export function weekdayLabel(civil: CivilDay, today: CivilDay): string {
  const weekday = WEEKDAYS[utcOf(civil).getUTCDay()];
  const date = `${pad(civil.day)}/${pad(civil.month)}`;
  return civil.year === today.year
    ? `${weekday}, ${date}`
    : `${weekday}, ${date}/${civil.year}`;
}

/** El día como lo escribe la URL en `desde`: «2026-09-28». */
export function dayKeyOf({ year, month, day }: CivilDay): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Lunes, el primer día de la semana de toda membresía nueva (PF-16), con el
 * domingo en cero como `membership.week_start`. Los recorridos no lo cambian.
 */
const MONDAY = 1;

/** Primer día de la semana que contiene a `civil` (TT-48). */
export function weekStartOf(civil: CivilDay): CivilDay {
  const weekday = utcOf(civil).getUTCDay();
  return addDays(civil, -((weekday - MONDAY + 7) % 7));
}

/**
 * Rótulo con que la pantalla nombra una semana (TT-47): «Esta semana»,
 * «Semana anterior», o el rango «28/09 – 04/10», que lleva el año en los dos
 * extremos si alguno no es del año de hoy.
 */
export function weekLabel(start: CivilDay, today: CivilDay): string {
  const current = weekStartOf(today);
  if (sameDay(start, current)) {
    return "Esta semana";
  }
  if (sameDay(start, addDays(current, -7))) {
    return "Semana anterior";
  }
  const end = addDays(start, 6);
  const withYear = start.year !== today.year || end.year !== today.year;
  const format = (civil: CivilDay): string =>
    withYear
      ? `${pad(civil.day)}/${pad(civil.month)}/${civil.year}`
      : `${pad(civil.day)}/${pad(civil.month)}`;
  return `${format(start)} – ${format(end)}`;
}

/**
 * Lo que identifica a un día en el nombre accesible de su botón del
 * calendario: «sábado, 5 de septiembre de 2026», que además puede llevar
 * marcas de hoy y de elegido. La coma de adelante evita que el 5 encuentre
 * al 15 y al 25.
 */
export function calendarDayName(civil: CivilDay): RegExp {
  return new RegExp(`, ${civil.day} de ${MONTHS[civil.month - 1]} de ${civil.year}\\b`);
}

/**
 * El mes que muestra el calendario abierto, por el nombre de su grilla:
 * «septiembre 2026», el de `date-fns` en español. Devuelve su primer día.
 */
export function monthOfCaption(caption: string): CivilDay {
  const match = /^(\p{L}+) (\d{4})$/u.exec(caption.trim());
  const month = match === null ? -1 : MONTHS.indexOf(match[1].toLowerCase());
  if (match === null || month === -1) {
    throw new Error(`El mes del calendario no se pudo leer: «${caption}»`);
  }
  return { year: Number(match[2]), month: month + 1, day: 1 };
}
