import { describe, expect, it } from "vitest";

import { currentElapsedSeconds, elapsedSeconds, measurementFor } from "./elapsed";

const startedAt = "2026-10-02T08:00:00.000Z";

describe("elapsedSeconds", () => {
  it("en el montaje mide desde el instante del servidor", () => {
    expect(
      elapsedSeconds({
        startedAt,
        serverNow: "2026-10-02T08:05:30.000Z",
        sinceMountMs: 0,
      }),
    ).toBe(330);
  });

  it("suma lo que pasó desde el montaje", () => {
    expect(
      elapsedSeconds({
        startedAt,
        serverNow: "2026-10-02T08:05:30.000Z",
        sinceMountMs: 10_000,
      }),
    ).toBe(340);
  });

  it("solo mira la distancia entre el inicio y el instante del servidor", () => {
    // TT-32: la cuenta no toma el reloj de la máquina, así que dos pares de
    // instantes a la misma distancia dan el mismo transcurrido por lejos que
    // esté uno del otro.
    const actual = elapsedSeconds({
      startedAt,
      serverNow: "2026-10-02T08:05:00.000Z",
      sinceMountMs: 2_000,
    });
    const lejano = elapsedSeconds({
      startedAt: "1999-01-01T00:00:00.000Z",
      serverNow: "1999-01-01T00:05:00.000Z",
      sinceMountMs: 2_000,
    });
    expect(actual).toBe(302);
    expect(lejano).toBe(actual);
  });

  it("trunca a segundos y no redondea hacia arriba", () => {
    expect(
      elapsedSeconds({
        startedAt,
        serverNow: "2026-10-02T08:00:40.999Z",
        sinceMountMs: 0,
      }),
    ).toBe(40);
  });

  it("devuelve cero cuando el inicio todavía no llegó", () => {
    expect(
      elapsedSeconds({
        startedAt,
        serverNow: "2026-10-02T07:59:00.000Z",
        sinceMountMs: 0,
      }),
    ).toBe(0);
  });

  it("cuenta un timer que lleva días corriendo", () => {
    // TT-42: no hay tope de duración, el contador sigue subiendo.
    expect(
      elapsedSeconds({
        startedAt,
        serverNow: "2026-10-05T08:00:00.000Z",
        sinceMountMs: 0,
      }),
    ).toBe(3 * 24 * 60 * 60);
  });

  it("devuelve cero con una fecha ilegible en vez de propagar NaN", () => {
    expect(elapsedSeconds({ startedAt: "", serverNow: "", sinceMountMs: 1_000 })).toBe(0);
  });
});

describe("measurementFor", () => {
  const serverNow = "2026-10-02T08:05:30.000Z";

  it("sin medición anterior empieza una contra el serverNow", () => {
    expect(measurementFor(null, serverNow, 1_000)).toEqual({
      anchor: serverNow,
      fromMs: 1_000,
    });
  });

  it("con el mismo ancla devuelve la medición anterior, la misma", () => {
    const previous = measurementFor(null, serverNow, 1_000);
    expect(measurementFor(previous, serverNow, 9_000)).toBe(previous);
  });

  it("con otro ancla empieza una medición nueva", () => {
    const previous = measurementFor(null, serverNow, 1_000);
    expect(measurementFor(previous, "2026-10-02T08:06:00.000Z", 9_000)).toEqual({
      anchor: "2026-10-02T08:06:00.000Z",
      fromMs: 9_000,
    });
  });
});

describe("currentElapsedSeconds", () => {
  const serverNow = "2026-10-02T08:05:30.000Z";
  const measurement = { anchor: serverNow, fromMs: 50_000 };

  it("suma lo medido desde que empezó la medición", () => {
    expect(
      currentElapsedSeconds(measurement, { startedAt, serverNow, nowMs: 70_000 }),
    ).toBe(330 + 20);
  });

  it("TT-28: con el mismo serverNow, un inicio diez minutos antes da exactamente 600 s más", () => {
    const before = currentElapsedSeconds(measurement, {
      startedAt,
      serverNow,
      nowMs: 95_000,
    });
    const after = currentElapsedSeconds(measurement, {
      startedAt: "2026-10-02T07:50:00.000Z",
      serverNow,
      nowMs: 95_000,
    });
    // Lo medido desde el montaje se conserva: no vuelve a cero con el inicio nuevo.
    expect(before).toBe(330 + 45);
    expect(after).toBe(before + 600);
  });

  it("un serverNow nuevo vuelve a medir desde cero", () => {
    expect(
      currentElapsedSeconds(measurement, {
        startedAt,
        serverNow: "2026-10-02T08:10:00.000Z",
        nowMs: 95_000,
      }),
    ).toBe(600);
  });

  it("reiniciar la medición con el mismo serverNow no hace retroceder el contador", () => {
    // Una parada que falla vuelve a mostrar el timer: el intervalo se reinicia
    // y pide su medición con el mismo ancla, más tarde.
    const before = currentElapsedSeconds(measurement, {
      startedAt,
      serverNow,
      nowMs: 80_000,
    });
    const restarted = measurementFor(measurement, serverNow, 81_000);
    const after = currentElapsedSeconds(restarted, {
      startedAt,
      serverNow,
      nowMs: 81_000,
    });
    expect(after).toBeGreaterThanOrEqual(before);
    expect(after).toBe(330 + 31);
  });
});
