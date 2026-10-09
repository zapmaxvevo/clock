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

/**
 * Las partes de este instante en una zona horaria, como números: lo que
 * `Intl` arma con `options`, sin pasar por `src/server/time`.
 */
function partsIn(
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): (type: Intl.DateTimeFormatPartTypes) => number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, ...options }).formatToParts(
    new Date(),
  );
  return (type) => Number(parts.find((candidate) => candidate.type === type)?.value);
}

/** Hoy en una zona horaria, que no tiene por qué ser la del proceso. */
export function todayIn(timeZone: string): CivilDay {
  const part = partsIn(timeZone, { year: "numeric", month: "numeric", day: "numeric" });
  return { year: part("year"), month: part("month"), day: part("day") };
}

/** Minutos de reloj desde las 00:00 en una zona horaria, de 0 a 1439. */
export function minuteOfDayIn(timeZone: string): number {
  const part = partsIn(timeZone, {
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  });
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

export function sameDay(left: CivilDay, right: CivilDay): boolean {
  return left.year === right.year && left.month === right.month && left.day === right.day;
}

/** Febrero tiene 29 días en los años divisibles por 4, salvo los seculares que no lo son por 400. */
function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** El año y el mes que están `months` meses después del de `civil`; antes, si es negativo. */
function monthAfter(civil: CivilDay, months: number): { year: number; month: number } {
  const index = civil.year * 12 + (civil.month - 1) + months;
  return { year: Math.floor(index / 12), month: (((index % 12) + 12) % 12) + 1 };
}

/** El primer día del mes que está `months` meses después del de `civil`. */
export function monthStartOf(civil: CivilDay, months = 0): CivilDay {
  return { ...monthAfter(civil, months), day: 1 };
}

/** El último día de ese mismo mes. */
export function monthEndOf(civil: CivilDay, months = 0): CivilDay {
  const { year, month } = monthAfter(civil, months);
  return { year, month, day: daysInMonth(year, month) };
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

/** Los días de la semana enteros, los de `date-fns` en español. */
const FULL_WEEKDAYS = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];

/**
 * El día en el nombre de una celda de la planilla: «miércoles 01/10», que
 * lleva el año solo si no es el de hoy (TS-100). Es la forma larga de
 * `weekdayLabel`.
 */
export function fullWeekdayLabel(civil: CivilDay, today: CivilDay): string {
  const weekday = FULL_WEEKDAYS[utcOf(civil).getUTCDay()];
  const date = `${pad(civil.day)}/${pad(civil.month)}`;
  return civil.year === today.year
    ? `${weekday} ${date}`
    : `${weekday} ${date}/${civil.year}`;
}

/** El día como lo escribe la URL en `desde`: «2026-09-28». */
export function dayKeyOf({ year, month, day }: CivilDay): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Lunes, el primer día de la semana de toda membresía nueva (PF-16), con el
 * domingo en cero como `membership.week_start`. Solo los recorridos 17 y 18
 * del reporte lo cambian, sobre su propia persona (D-R10-14).
 */
const MONDAY = 1;

/** El domingo, el otro primer día de la semana que eligen los recorridos. */
export const SUNDAY = 0;

/**
 * Primer día de la semana que contiene a `civil` (TT-48), con la semana que
 * empieza en `weekStart`, del domingo en cero al sábado en seis.
 */
export function weekStartOf(civil: CivilDay, weekStart = MONDAY): CivilDay {
  const weekday = utcOf(civil).getUTCDay();
  return addDays(civil, -((weekday - weekStart + 7) % 7));
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
  return dayRangeLabel(start, addDays(start, 6), today);
}

/**
 * Rótulo de un período que no es una semana con nombre: «05/10 – 18/10», que
 * lleva el año en los dos extremos si alguno no es del año de hoy, y un solo
 * día sin guion: «05/10».
 */
export function dayRangeLabel(first: CivilDay, last: CivilDay, today: CivilDay): string {
  const withYear = first.year !== today.year || last.year !== today.year;
  const format = (civil: CivilDay): string =>
    withYear
      ? `${pad(civil.day)}/${pad(civil.month)}/${civil.year}`
      : `${pad(civil.day)}/${pad(civil.month)}`;
  return sameDay(first, last) ? format(first) : `${format(first)} – ${format(last)}`;
}

/**
 * Rótulo con que el reporte nombra un mes (D-R10-3): «octubre», que lleva
 * «de 2025» solo si no es del año de hoy.
 */
export function monthLabel(civil: CivilDay, today: CivilDay): string {
  const name = MONTHS[civil.month - 1];
  return civil.year === today.year ? name : `${name} de ${civil.year}`;
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
