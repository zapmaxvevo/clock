import { describe, expect, it } from "vitest";

import {
  dayBounds,
  durationMinutes,
  formatDuration,
  roundMinutes,
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
