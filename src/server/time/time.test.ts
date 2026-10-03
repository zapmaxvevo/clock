import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  dayBounds,
  dayKey,
  dayLabel,
  durationMinutes,
  durationSeconds,
  extraDays,
  formatClock,
  formatDuration,
  formatElapsed,
  roundMinutes,
  addDaysToKey,
  clockDifferenceMinutes,
  crossesMidnight,
  dayKeyLabel,
  earliestDayKey,
  instantFromLocal,
  isAfterYear9999,
  isClock,
  parseClockInput,
  parseDayKey,
  parseDurationInput,
  parseWeekStart,
  shiftClock,
  startOfDayKey,
  startOfLocalDay,
  toDayKey,
  weekBounds,
  weekKeyLabel,
  weekStartKey,
  type WeekStart,
} from "./index";

const buenosAires = "America/Argentina/Buenos_Aires";
const madrid = "Europe/Madrid";

/**
 * Deja `TZ` como estaba. Asignar `undefined` a una variable de entorno la
 * guarda como el texto "undefined", que Node lee como UTC.
 */
function restoreProcessTimeZone(original: string | undefined): void {
  if (original === undefined) {
    delete process.env.TZ;
    return;
  }
  process.env.TZ = original;
}

describe("dayBounds", () => {
  it("corta el día en la zona horaria del usuario, no en UTC", () => {
    // 2026-03-10T02:00:00Z son las 23:00 del 9 de marzo en Buenos Aires.
    const { start, end } = dayBounds(new Date("2026-03-10T02:00:00Z"), buenosAires);
    expect(start.toISOString()).toBe("2026-03-09T03:00:00.000Z");
    expect(end.toISOString()).toBe("2026-03-10T03:00:00.000Z");
  });

  it("mantiene 24 horas en un día sin cambio de horario", () => {
    const { start, end } = dayBounds(new Date("2026-07-15T10:00:00Z"), madrid);
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("da 23 horas el día en que entra el horario de verano", () => {
    // En Madrid el 29 de marzo de 2026 el reloj salta de las 2 a las 3.
    const { start, end } = dayBounds(new Date("2026-03-29T12:00:00Z"), madrid);
    expect(end.getTime() - start.getTime()).toBe(23 * 60 * 60 * 1000);
  });
});

describe("weekBounds", () => {
  it("arranca el lunes cuando el usuario lo configura así", () => {
    const { start, end } = weekBounds(new Date("2026-10-02T12:00:00Z"), buenosAires, 1);
    expect(start.toISOString()).toBe("2026-09-28T03:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-05T03:00:00.000Z");
  });

  it("arranca el domingo cuando el usuario lo configura así", () => {
    const { start } = weekBounds(new Date("2026-10-02T12:00:00Z"), buenosAires, 0);
    expect(start.toISOString()).toBe("2026-09-27T03:00:00.000Z");
  });
});

const santiago = "America/Santiago";
const azores = "Atlantic/Azores";
const allWeekStarts: readonly WeekStart[] = [0, 1, 2, 3, 4, 5, 6];

/** Día de la semana de una clave, calculado aparte de `weekStartKey`. */
function weekdayOf(key: string): number {
  return new Date(`${key}T12:00:00Z`).getUTCDay();
}

/** Las claves de todos los días de un año. */
function daysOfYear(year: number): string[] {
  const days: string[] = [];
  for (let key = `${year}-01-01`; key.startsWith(`${year}`); key = addDaysToKey(key, 1)) {
    days.push(key);
  }
  return days;
}

describe("earliestDayKey", () => {
  it("devuelve el día más viejo, sin importar el orden", () => {
    expect(earliestDayKey("2026-10-01", "2025-12-31", "2026-09-30")).toBe("2025-12-31");
    expect(earliestDayKey("2026-09-30", "2026-10-01")).toBe("2026-09-30");
    expect(earliestDayKey("2026-10-01", "2026-09-30")).toBe("2026-09-30");
  });

  it("con una sola clave o con claves iguales, esa", () => {
    expect(earliestDayKey("2026-10-01")).toBe("2026-10-01");
    expect(earliestDayKey("2026-10-01", "2026-10-01")).toBe("2026-10-01");
  });

  it("sin claves, null", () => {
    const none: readonly string[] = [];
    expect(earliestDayKey(...none)).toBeNull();
  });
});

describe("weekStartKey", () => {
  it("corta en el lunes o en el domingo según el primer día de la persona (TT-48)", () => {
    // El domingo 04/10/2026 cierra la semana del lunes 28/09 y abre la del domingo.
    expect(weekStartKey("2026-10-04", 1)).toBe("2026-09-28");
    expect(weekStartKey("2026-10-04", 0)).toBe("2026-10-04");
    expect(weekStartKey("2026-09-28", 1)).toBe("2026-09-28");
    expect(weekStartKey("2026-10-03", 6)).toBe("2026-10-03");
  });

  it("cruza el mes y el año", () => {
    expect(weekStartKey("2026-01-01", 1)).toBe("2025-12-29");
    expect(weekStartKey("2026-03-01", 1)).toBe("2026-02-23");
  });

  it("deja tal cual una clave que no es un día", () => {
    expect(weekStartKey("2026-02-30", 1)).toBe("2026-02-30");
  });
});

describe("startOfDayKey", () => {
  it("es la medianoche local de un día común", () => {
    expect(startOfDayKey("2026-10-02", buenosAires).toISOString()).toBe(
      "2026-10-02T03:00:00.000Z",
    );
  });

  it("es la 01:00 el día en que Santiago no tiene 00:00", () => {
    // El 06/09/2026 Santiago salta de las 00:00 a las 01:00.
    const start = startOfDayKey("2026-09-06", santiago);
    expect(start.toISOString()).toBe("2026-09-06T04:00:00.000Z");
    expect(dayKey(start, santiago)).toBe("2026-09-06");
    expect(dayKey(new Date(start.getTime() - 1), santiago)).toBe("2026-09-05");
  });

  it("lanza en un día que no existe en la zona", () => {
    // Samoa pasó del 29 al 31 de diciembre de 2011.
    expect(() => startOfDayKey("2011-12-30", "Pacific/Apia")).toThrow(RangeError);
  });

  it("es la 00:00 en un día cuyo adelanto de hora arranca a las 12:00", () => {
    const start = startOfDayKey("2000-01-15", "Africa/Khartoum");
    expect(start.toISOString()).toBe("2000-01-14T22:00:00.000Z");
    expect(dayKey(new Date(start.getTime() - 1), "Africa/Khartoum")).toBe("2000-01-14");
  });

  it("es la primera de las dos 00:00 el día en que Azores atrasa de 01:00 a 00:00", () => {
    const start = startOfDayKey("2026-10-25", azores);
    expect(start.toISOString()).toBe("2026-10-25T00:00:00.000Z");
    expect(dayKey(new Date(start.getTime() - 1), azores)).toBe("2026-10-24");
  });

  it("es la 00:00 que `startOfLocalDay` corría una hora en Sydney 1990", () => {
    const start = startOfDayKey("1990-03-04", "Australia/Sydney");
    expect(start.toISOString()).toBe("1990-03-03T13:00:00.000Z");
    expect(dayKey(new Date(start.getTime() - 1), "Australia/Sydney")).toBe("1990-03-03");
  });

  // Falla conocida heredada de `startOfLocalDay` (contrato del slice 5, §8),
  // que queda solo en los días sin 00:00: el instante cae en el día, pero 60
  // minutos después de su primer instante real, así que el milisegundo anterior
  // también es del mismo día. Si una versión nueva de date-fns la corrige, este
  // caso avisa.
  it("falla conocida: en America/Argentina/Salta el 1991-10-20 el milisegundo anterior sigue en el día", () => {
    const zone = "America/Argentina/Salta";
    const start = startOfDayKey("1991-10-20", zone);
    expect(dayKey(start, zone)).toBe("1991-10-20");
    expect(dayKey(new Date(start.getTime() - 1), zone)).toBe("1991-10-20");
  });
});

describe("los cortes de semana sobre todos los días de 2026 (TT-97)", () => {
  const days = daysOfYear(2026);

  it.each([madrid, buenosAires, santiago, azores])(
    "%s: startOfDayKey cae en su día y el milisegundo anterior en el día previo",
    (zone) => {
      const failures = days.filter((key) => {
        const start = startOfDayKey(key, zone);
        return (
          dayKey(start, zone) !== key ||
          dayKey(new Date(start.getTime() - 1), zone) !== addDaysToKey(key, -1)
        );
      });
      expect(failures).toEqual([]);
    },
  );

  it.each([madrid, buenosAires, santiago, azores])(
    "%s: weekBounds de cualquier instante del día da la semana de weekStartKey",
    (zone) => {
      const failures: string[] = [];
      for (const weekStart of allWeekStarts) {
        for (const key of days) {
          const first = weekStartKey(key, weekStart);
          const offset = parseDayKey(key) === null ? -1 : daysBetween(first, key);
          const start = startOfDayKey(first, zone).getTime();
          const end = startOfDayKey(addDaysToKey(first, 7), zone).getTime();
          const firstInstant = startOfDayKey(key, zone);
          const lastInstant = new Date(
            startOfDayKey(addDaysToKey(key, 1), zone).getTime() - 1,
          );
          const cuts = [firstInstant, lastInstant].map((instant) =>
            weekBounds(instant, zone, weekStart),
          );
          const consistent =
            weekdayOf(first) === weekStart &&
            offset >= 0 &&
            offset <= 6 &&
            cuts.every(
              (cut) => cut.start.getTime() === start && cut.end.getTime() === end,
            );
          if (!consistent) {
            failures.push(`${weekStart} ${key}`);
          }
        }
      }
      expect(failures).toEqual([]);
    },
  );
});

/** Días civiles entre dos claves, aparte de las funciones bajo prueba. */
function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}

describe("weekKeyLabel", () => {
  it("rotula esta semana y la anterior", () => {
    expect(weekKeyLabel("2026-09-28", "2026-10-02", 1)).toBe("Esta semana");
    expect(weekKeyLabel("2026-09-21", "2026-10-02", 1)).toBe("Semana anterior");
  });

  it("mide esta semana con el primer día de la persona", () => {
    expect(weekKeyLabel("2026-09-27", "2026-10-02", 0)).toBe("Esta semana");
    expect(weekKeyLabel("2026-09-20", "2026-10-02", 0)).toBe("Semana anterior");
    // El domingo 04/10 abre semana con domingo y cierra la del lunes 28/09.
    expect(weekKeyLabel("2026-09-27", "2026-10-04", 0)).toBe("Semana anterior");
    expect(weekKeyLabel("2026-09-28", "2026-10-04", 1)).toBe("Esta semana");
  });

  it("rotula con el rango una semana más vieja y una futura (TT-47)", () => {
    expect(weekKeyLabel("2026-09-14", "2026-10-02", 1)).toBe("14/09 – 20/09");
    expect(weekKeyLabel("2026-10-05", "2026-10-02", 1)).toBe("05/10 – 11/10");
  });

  it("lleva el año en los dos extremos si alguno no es del año de hoy", () => {
    expect(weekKeyLabel("2025-12-29", "2026-03-10", 1)).toBe("29/12/2025 – 04/01/2026");
    expect(weekKeyLabel("2026-12-28", "2026-03-10", 1)).toBe("28/12/2026 – 03/01/2027");
    expect(weekKeyLabel("2025-06-02", "2026-03-10", 1)).toBe("02/06/2025 – 08/06/2025");
  });
});

describe("parseWeekStart", () => {
  it("devuelve los siete valores tal cual", () => {
    expect(allWeekStarts.map((value) => parseWeekStart(value))).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
  });

  it.each([7, -1, 1.5, Number.NaN])("lanza con %s", (value) => {
    expect(() => parseWeekStart(value)).toThrow(RangeError);
  });
});

describe("durationMinutes", () => {
  it("mide entre inicio y fin", () => {
    expect(
      durationMinutes(
        new Date("2026-10-02T09:00:00Z"),
        new Date("2026-10-02T10:30:00Z"),
        new Date("2026-10-02T12:00:00Z"),
      ),
    ).toBe(90);
  });

  it("mide hasta ahora cuando el timer sigue corriendo", () => {
    expect(
      durationMinutes(
        new Date("2026-10-02T09:00:00Z"),
        null,
        new Date("2026-10-02T09:45:00Z"),
      ),
    ).toBe(45);
  });

  it("nunca devuelve negativo", () => {
    expect(
      durationMinutes(
        new Date("2026-10-02T09:00:00Z"),
        new Date("2026-10-02T08:00:00Z"),
        new Date("2026-10-02T12:00:00Z"),
      ),
    ).toBe(0);
  });
});

describe("formatDuration", () => {
  it("usa el formato h:mm", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(5)).toBe("0:05");
    expect(formatDuration(90)).toBe("1:30");
    expect(formatDuration(600)).toBe("10:00");
  });
});

describe("roundMinutes", () => {
  it("redondea hacia arriba al paso configurado", () => {
    expect(roundMinutes(1, 15)).toBe(15);
    expect(roundMinutes(16, 15)).toBe(30);
  });

  it("deja la duración intacta con paso 0", () => {
    expect(roundMinutes(17, 0)).toBe(17);
  });
});

describe("startOfLocalDay", () => {
  it("corta en la medianoche de la zona del usuario, no en la de UTC", () => {
    expect(
      startOfLocalDay(new Date("2026-10-02T12:00:00Z"), buenosAires).toISOString(),
    ).toBe("2026-10-02T03:00:00.000Z");
    expect(startOfLocalDay(new Date("2026-10-02T12:00:00Z"), madrid).toISOString()).toBe(
      "2026-10-01T22:00:00.000Z",
    );
  });

  it("es idempotente sobre un instante que ya es medianoche local", () => {
    const start = startOfLocalDay(new Date("2026-10-02T12:00:00Z"), buenosAires);
    expect(startOfLocalDay(start, buenosAires).toISOString()).toBe(start.toISOString());
  });

  it("coincide con el inicio que devuelve dayBounds", () => {
    for (const instant of ["2026-03-29T12:00:00Z", "2026-07-15T10:00:00Z"]) {
      expect(startOfLocalDay(new Date(instant), madrid).toISOString()).toBe(
        dayBounds(new Date(instant), madrid).start.toISOString(),
      );
    }
  });
});

describe("dayKey", () => {
  it("usa el día local y no el de UTC", () => {
    // 2026-10-03T02:00:00Z son las 23:00 del 2 de octubre en Buenos Aires.
    expect(dayKey(new Date("2026-10-03T02:00:00Z"), buenosAires)).toBe("2026-10-02");
    expect(dayKey(new Date("2026-10-03T02:00:00Z"), madrid)).toBe("2026-10-03");
  });

  it("pone la medianoche exacta en el día que empieza", () => {
    expect(dayKey(new Date("2026-10-02T03:00:00Z"), buenosAires)).toBe("2026-10-02");
  });
});

describe("dayLabel", () => {
  const now = new Date("2026-10-02T15:00:00Z");

  it("rotula hoy y ayer", () => {
    expect(dayLabel(new Date("2026-10-02T09:00:00Z"), now, buenosAires)).toBe("Hoy");
    expect(dayLabel(new Date("2026-10-01T09:00:00Z"), now, buenosAires)).toBe("Ayer");
  });

  it("usa día de la semana y dd/MM dentro del año en curso", () => {
    expect(dayLabel(new Date("2026-09-30T09:00:00Z"), now, buenosAires)).toBe(
      "mié, 30/09",
    );
  });

  it("agrega el año cuando el día cae fuera del año en curso", () => {
    expect(dayLabel(new Date("2025-12-31T09:00:00Z"), now, buenosAires)).toBe(
      "mié, 31/12/2025",
    );
  });

  it("decide hoy y ayer con la zona horaria, no con UTC", () => {
    // Las 00:30 UTC del 3 de octubre siguen siendo el 2 en Buenos Aires.
    expect(dayLabel(new Date("2026-10-03T00:30:00Z"), now, buenosAires)).toBe("Hoy");
  });
});

describe("formatClock", () => {
  it("muestra la hora local en 24 h", () => {
    expect(formatClock(new Date("2026-10-02T11:00:00Z"), buenosAires)).toBe("08:00");
    expect(formatClock(new Date("2026-10-03T05:00:00Z"), buenosAires)).toBe("02:00");
  });
});

describe("extraDays", () => {
  it("es 0 cuando la entrada no cruza la medianoche", () => {
    expect(
      extraDays(
        new Date("2026-10-02T11:00:00Z"),
        new Date("2026-10-02T14:00:00Z"),
        buenosAires,
      ),
    ).toBe(0);
  });

  it("cuenta un día cuando el fin cae en el día local siguiente", () => {
    // 08:00 a 02:00 del día siguiente en Buenos Aires.
    expect(
      extraDays(
        new Date("2026-10-02T11:00:00Z"),
        new Date("2026-10-03T05:00:00Z"),
        buenosAires,
      ),
    ).toBe(1);
  });

  it("cuenta los días que haga falta en un timer largo", () => {
    expect(
      extraDays(
        new Date("2026-10-02T11:00:00Z"),
        new Date("2026-10-05T05:00:00Z"),
        buenosAires,
      ),
    ).toBe(3);
  });

  it("no se corre con un cambio de horario en el medio", () => {
    // Del 28 al 29 de marzo de 2026 en Madrid hay un día de 23 horas.
    expect(
      extraDays(
        new Date("2026-03-28T22:00:00Z"),
        new Date("2026-03-29T10:00:00Z"),
        madrid,
      ),
    ).toBe(1);
  });
});

describe("isAfterYear9999", () => {
  it("separa el último instante del 9999 del primero del 10000, en UTC", () => {
    expect(isAfterYear9999(new Date("9999-12-31T23:59:59.999Z"))).toBe(false);
    expect(isAfterYear9999(new Date(Date.UTC(10000, 0, 1)))).toBe(true);
  });
});

describe("durationSeconds", () => {
  it("mide en segundos exactos, sin redondear al minuto", () => {
    expect(
      durationSeconds(new Date("2026-10-02T09:00:00Z"), new Date("2026-10-02T09:00:40Z")),
    ).toBe(40);
  });

  it("admite duración cero", () => {
    const instant = new Date("2026-10-02T09:00:00Z");
    expect(durationSeconds(instant, instant)).toBe(0);
  });

  it("nunca devuelve negativo", () => {
    expect(
      durationSeconds(new Date("2026-10-02T09:00:00Z"), new Date("2026-10-02T08:00:00Z")),
    ).toBe(0);
  });

  it("mide sobre instantes UTC aunque haya cambio de horario en el medio", () => {
    expect(
      durationSeconds(new Date("2026-03-29T00:30:00Z"), new Date("2026-03-29T01:30:00Z")),
    ).toBe(3600);
  });
});

describe("formatElapsed", () => {
  it("usa el formato h:mm:ss", () => {
    expect(formatElapsed(0)).toBe("0:00:00");
    expect(formatElapsed(59)).toBe("0:00:59");
    expect(formatElapsed(3661)).toBe("1:01:01");
  });

  it("no corta las horas en un timer de más de un día", () => {
    expect(formatElapsed(90_000)).toBe("25:00:00");
  });

  it("trunca los segundos sueltos en vez de redondearlos", () => {
    expect(formatElapsed(59.9)).toBe("0:00:59");
    expect(formatElapsed(-5)).toBe("0:00:00");
  });
});

describe("parseDayKey", () => {
  it("devuelve los tres números de una fecha del calendario", () => {
    expect(parseDayKey("2026-10-02")).toEqual({ year: 2026, month: 10, day: 2 });
    expect(parseDayKey("2024-02-29")).toEqual({ year: 2024, month: 2, day: 29 });
  });

  it("rechaza un día que tiene la forma pero no existe", () => {
    expect(parseDayKey("2026-02-30")).toBeNull();
    expect(parseDayKey("2026-13-01")).toBeNull();
    expect(parseDayKey("2026-00-10")).toBeNull();
    expect(parseDayKey("2025-02-29")).toBeNull();
  });

  it("rechaza lo que no tiene la forma", () => {
    for (const value of ["2026-1-02", "02/10/2026", "", "2026-10-02T00:00:00Z"]) {
      expect(parseDayKey(value)).toBeNull();
    }
  });
});

describe("toDayKey", () => {
  it("completa con ceros el mes y el día", () => {
    expect(toDayKey({ year: 2026, month: 1, day: 5 })).toBe("2026-01-05");
  });

  it("es la inversa de parseDayKey", () => {
    for (const key of ["2026-10-02", "2024-02-29", "9999-12-31"]) {
      const date = parseDayKey(key);
      expect(date === null ? null : toDayKey(date)).toBe(key);
    }
  });
});

describe("addDaysToKey", () => {
  it("cruza el fin de mes y el fin de año", () => {
    expect(addDaysToKey("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysToKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToKey("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("cruza el 29 de febrero de un año bisiesto", () => {
    expect(addDaysToKey("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDaysToKey("2025-02-28", 1)).toBe("2025-03-01");
  });
});

describe("dayKeyLabel", () => {
  it("rotula hoy, ayer y el resto", () => {
    expect(dayKeyLabel("2026-10-02", "2026-10-02")).toBe("Hoy");
    expect(dayKeyLabel("2026-10-01", "2026-10-02")).toBe("Ayer");
    expect(dayKeyLabel("2026-09-30", "2026-10-02")).toBe("mié, 30/09");
  });

  it("agrega el año fuera del año en curso", () => {
    expect(dayKeyLabel("2025-12-31", "2026-10-02")).toBe("mié, 31/12/2025");
  });

  it("no inventa un rótulo para el día siguiente", () => {
    expect(dayKeyLabel("2026-10-03", "2026-10-02")).toBe("sáb, 03/10");
  });
});

describe("parseClockInput", () => {
  it("interpreta la tabla de TT-20", () => {
    const table: ReadonlyArray<readonly [string, string | null]> = [
      ["1", "01:00"],
      ["12", "12:00"],
      ["930", "09:30"],
      ["0345", "03:45"],
      ["9:45", "09:45"],
      ["9.45", "09:45"],
      // Un minuto de una sola cifra se completa: el campo es tolerante y
      // rechazar una abreviatura obvia es peor que no aceptarla nunca.
      ["9:5", "09:05"],
      // El punto separa hora y minutos: en este campo no es un decimal, al
      // revés que en el de duración, donde "9.5" son nueve horas y media.
      ["9.5", "09:05"],
      ["23:59", "23:59"],
      ["24:00", null],
      ["9:60", null],
      ["1pm", null],
    ];
    for (const [text, expected] of table) {
      expect([text, parseClockInput(text)]).toEqual([text, expected]);
    }
  });

  it("acepta espacios alrededor y rechaza lo vacío", () => {
    expect(parseClockInput("  08:00  ")).toBe("08:00");
    expect(parseClockInput("")).toBeNull();
  });
});

describe("parseDurationInput", () => {
  it("interpreta la tabla de TT-19", () => {
    const table: ReadonlyArray<readonly [string, number | null]> = [
      ["30", 30],
      ["2", 2],
      ["2h", 120],
      ["2:00", 120],
      ["2:30", 150],
      ["2.75", 165],
      ["2,75", 165],
      ["1h30m", 90],
      ["1h30m1s", 90],
      ["45s", 0],
      ["0", 0],
      ["2:75", null],
      ["24:00", null],
      ["25h", null],
      ["-1", null],
      ["ab", null],
    ];
    for (const [text, expected] of table) {
      expect([text, parseDurationInput(text)]).toEqual([text, expected]);
    }
  });

  it("no expresa 24 horas o más por ningún camino", () => {
    expect(parseDurationInput("23:59")).toBe(1439);
    expect(parseDurationInput("1440")).toBeNull();
    expect(parseDurationInput("24.0")).toBeNull();
  });
});

describe("clockDifferenceMinutes", () => {
  it("da la vuelta por la medianoche cuando el fin es menor (TT-72)", () => {
    expect(clockDifferenceMinutes("23:00", "02:00")).toBe(180);
    expect(clockDifferenceMinutes("08:00", "10:30")).toBe(150);
  });

  it("da 0 con las dos horas iguales, que es lo que TT-73 rechaza", () => {
    expect(clockDifferenceMinutes("08:00", "08:00")).toBe(0);
  });
});

describe("isClock", () => {
  it("acepta solo la forma canónica HH:mm de 24 h", () => {
    for (const text of ["00:00", "09:45", "23:59"]) {
      expect([text, isClock(text)]).toEqual([text, true]);
    }
    for (const text of ["24:00", "08:60", "8:00", "0800", "1h30m", ""]) {
      expect([text, isClock(text)]).toEqual([text, false]);
    }
  });
});

describe("crossesMidnight", () => {
  it("cruza cuando el fin es anterior al inicio (TT-72)", () => {
    expect(crossesMidnight("23:00", "02:00")).toBe(true);
    expect(crossesMidnight("00:01", "00:00")).toBe(true);
  });

  it("no cruza cuando el fin es posterior o igual al inicio", () => {
    expect(crossesMidnight("08:00", "10:30")).toBe(false);
    expect(crossesMidnight("08:00", "08:00")).toBe(false);
  });

  it("no cruza con una hora que no es canónica", () => {
    expect(crossesMidnight("23:00", "2:00")).toBe(false);
  });
});

describe("shiftClock", () => {
  it("corre la hora y da la vuelta a las 24 h", () => {
    expect(shiftClock("08:00", 150)).toBe("10:30");
    expect(shiftClock("23:00", 180)).toBe("02:00");
    expect(shiftClock("00:30", -60)).toBe("23:30");
  });
});

describe("instantFromLocal", () => {
  it("convierte una hora de pared con la zona del workspace", () => {
    expect(instantFromLocal("2026-10-02", "08:00", buenosAires)?.toISOString()).toBe(
      "2026-10-02T11:00:00.000Z",
    );
  });

  it("resuelve la hora ambigua con el segundo instante", () => {
    // El 25/10/2026 Madrid pasa de +02:00 a +01:00: las 02:30 ocurren dos veces.
    expect(instantFromLocal("2026-10-25", "02:30", madrid)?.toISOString()).toBe(
      "2026-10-25T01:30:00.000Z",
    );
  });

  it("toma el segundo instante también al oeste de Greenwich", () => {
    // El 01/11/2026 New York pasa de -04:00 a -05:00: las 01:30 ocurren dos veces.
    expect(
      instantFromLocal("2026-11-01", "01:30", "America/New_York")?.toISOString(),
    ).toBe("2026-11-01T06:30:00.000Z");
    // El 05/04/2026 Santiago vuelve de la medianoche a las 23:00 del día anterior.
    expect(
      instantFromLocal("2026-04-04", "23:30", "America/Santiago")?.toISOString(),
    ).toBe("2026-04-05T03:30:00.000Z");
  });

  it("rechaza la hora de pared que no existe", () => {
    // El 29/03/2026 Madrid salta de las 02:00 a las 03:00.
    expect(instantFromLocal("2026-03-29", "02:30", madrid)).toBeNull();
    expect(instantFromLocal("2026-03-29", "02:00", madrid)).toBeNull();
  });

  it("acepta la primera hora que sí existe después del salto", () => {
    expect(instantFromLocal("2026-03-29", "03:00", madrid)?.toISOString()).toBe(
      "2026-03-29T01:00:00.000Z",
    );
  });

  it("rechaza un día o una hora que no son canónicos", () => {
    expect(instantFromLocal("2026-02-30", "08:00", buenosAires)).toBeNull();
    expect(instantFromLocal("2026-10-02", "8:00", buenosAires)).toBeNull();
    expect(instantFromLocal("2026-10-02", "24:00", buenosAires)).toBeNull();
  });

  it("conserva el orden de los extremos en el día del salto", () => {
    // Si la hora inexistente se desplazara, el fin quedaría antes del inicio.
    const start = instantFromLocal("2026-03-29", "01:30", madrid);
    const end = instantFromLocal("2026-03-29", "03:00", madrid);
    expect(start).not.toBeNull();
    expect(end).not.toBeNull();
    expect(end?.getTime()).toBeGreaterThan(start?.getTime() ?? 0);
  });
});

/**
 * La zona del proceso no tiene que influir en nada que trabaje con claves de
 * día. Buenos Aires es -03:00, así que `new Date("2026-10-02")` —medianoche
 * UTC— cae el día anterior en local y una implementación ingenua se corre un
 * día. En una máquina en UTC ese error pasa inadvertido.
 */
describe("claves de día en un huso negativo", () => {
  const original = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = buenosAires;
  });

  afterAll(() => {
    restoreProcessTimeZone(original);
  });

  it("confirma que el proceso quedó en el huso de la prueba", () => {
    expect(new Date("2026-10-02T00:00:00Z").getHours()).toBe(21);
  });

  it("no corre el día al rotular", () => {
    expect(dayKeyLabel("2026-10-02", "2026-10-05")).toBe("vie, 02/10");
    expect(dayKeyLabel("2026-10-02", "2026-10-02")).toBe("Hoy");
  });

  it("no corre el día al sumar", () => {
    expect(addDaysToKey("2026-10-02", 1)).toBe("2026-10-03");
    expect(addDaysToKey("2026-10-02", -1)).toBe("2026-10-01");
  });

  it("no corre el día al validar", () => {
    expect(parseDayKey("2026-10-02")).toEqual({ year: 2026, month: 10, day: 2 });
  });

  it("resuelve la hora de pared con la zona pedida y no con la del proceso", () => {
    expect(instantFromLocal("2026-10-02", "08:00", madrid)?.toISOString()).toBe(
      "2026-10-02T06:00:00.000Z",
    );
  });
});

/**
 * La hora de pared no puede depender de la zona del proceso. Madrid tiene
 * cambio de horario, así que acá un resultado que se apoye en la zona local
 * sí se nota: Buenos Aires no tiene y no sirve para esto.
 */
describe("hora de pared con el proceso en una zona con cambio de horario", () => {
  const original = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = madrid;
  });

  afterAll(() => {
    restoreProcessTimeZone(original);
  });

  it("confirma que el proceso quedó en el huso de la prueba", () => {
    expect(new Date("2026-07-01T00:00:00Z").getHours()).toBe(2);
    expect(new Date("2026-01-01T00:00:00Z").getHours()).toBe(1);
  });

  it("resuelve la hora ambigua con el segundo instante", () => {
    expect(instantFromLocal("2026-10-25", "02:30", madrid)?.toISOString()).toBe(
      "2026-10-25T01:30:00.000Z",
    );
  });

  it("rechaza la hora de pared que no existe", () => {
    expect(instantFromLocal("2026-03-29", "02:30", madrid)).toBeNull();
    expect(instantFromLocal("2026-03-29", "02:00", madrid)).toBeNull();
  });

  it("acepta la primera hora que sí existe después del salto", () => {
    expect(instantFromLocal("2026-03-29", "03:00", madrid)?.toISOString()).toBe(
      "2026-03-29T01:00:00.000Z",
    );
  });

  it("acepta una hora que existe en la zona pedida aunque no en la del proceso", () => {
    // Londres atrasa a la 01:00 cuando Madrid atrasa a las 02:00: las 02:30 de
    // Londres ocurren una sola vez.
    expect(instantFromLocal("2026-10-25", "02:30", "Europe/London")?.toISOString()).toBe(
      "2026-10-25T02:30:00.000Z",
    );
  });
});
