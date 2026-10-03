import { describe, expect, it } from "vitest";

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
  startOfDayBefore,
  startOfLocalDay,
  weekBounds,
} from "./index";

const buenosAires = "America/Argentina/Buenos_Aires";
const madrid = "Europe/Madrid";

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

describe("startOfDayBefore", () => {
  it("resuelve el inicio del día anterior en la zona del usuario", () => {
    expect(
      startOfDayBefore(new Date("2026-10-02T12:00:00Z"), 1, buenosAires).toISOString(),
    ).toBe("2026-10-01T03:00:00.000Z");
  });

  it("cuenta días de calendario y no bloques de 24 horas", () => {
    // El 29 de marzo de 2026 Madrid dura 23 horas.
    expect(
      startOfDayBefore(new Date("2026-03-30T10:00:00Z"), 1, madrid).toISOString(),
    ).toBe("2026-03-28T23:00:00.000Z");
  });

  it("con 0 días devuelve el inicio del día del instante", () => {
    expect(
      startOfDayBefore(new Date("2026-10-02T12:00:00Z"), 0, buenosAires).toISOString(),
    ).toBe("2026-10-02T03:00:00.000Z");
  });

  it("retrocede varios días cruzando un cambio de horario", () => {
    // Del 1 de abril al 27 de marzo de 2026 en Madrid hay un día de 23 horas.
    expect(
      startOfDayBefore(new Date("2026-04-01T10:00:00Z"), 5, madrid).toISOString(),
    ).toBe("2026-03-26T23:00:00.000Z");
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
