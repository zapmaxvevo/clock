import { describe, expect, it } from "vitest";

import { elapsedSeconds } from "./elapsed";

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
