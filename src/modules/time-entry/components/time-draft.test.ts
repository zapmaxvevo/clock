import { describe, expect, it } from "vitest";

import {
  commitChange,
  draftDuration,
  draftExtraDays,
  fromView,
  reset,
  sameDraft,
  withDate,
  withDuration,
  withEnd,
  withStart,
  type TimeDraft,
} from "./time-draft";

/**
 * Ni UTC ni la zona de quien corre los tests: con cualquiera de las dos, un
 * `reset` que ignorara la zona de la persona daría lo mismo y pasaría.
 */
const tokyo = "Asia/Tokyo";
const draft: TimeDraft = { date: "2026-10-02", start: "09:00", end: "11:30" };

describe("reset", () => {
  it("arranca en el día y la hora de la persona, sin duración", () => {
    // 2026-10-02T03:30:00Z son las 12:30 del 2 de octubre en Tokio.
    expect(reset("2026-10-02T03:30:00.000Z", tokyo)).toEqual({
      date: "2026-10-02",
      start: "12:30",
      end: "12:30",
    });
  });

  it("resuelve el día con la zona del workspace y no con UTC", () => {
    // 2026-10-02T20:00:00Z ya es el 3 de octubre en Tokio.
    expect(reset("2026-10-02T20:00:00.000Z", tokyo)).toEqual({
      date: "2026-10-03",
      start: "05:00",
      end: "05:00",
    });
  });

  it("el borrador inicial dura cero, que es lo que deja «Agregar» inactivo", () => {
    expect(draftDuration(reset("2026-10-02T03:30:00.000Z", tokyo))).toBe(0);
  });
});

describe("derivados del borrador", () => {
  it("la duración sale de las dos horas de pared", () => {
    expect(draftDuration(draft)).toBe(150);
  });

  it("un fin anterior al inicio da la vuelta por la medianoche", () => {
    expect(draftDuration({ ...draft, start: "23:00", end: "02:00" })).toBe(180);
    expect(draftExtraDays({ ...draft, start: "23:00", end: "02:00" })).toBe(1);
  });

  it("sin cruce de medianoche no hay día extra", () => {
    expect(draftExtraDays(draft)).toBe(0);
  });

  it("dos horas iguales duran cero", () => {
    expect(draftDuration({ ...draft, end: draft.start })).toBe(0);
  });
});

describe("withStart", () => {
  it("interpreta el formato tolerante y conserva el fin", () => {
    expect(withStart(draft, "0345", "24h")).toEqual({
      draft: { date: "2026-10-02", start: "03:45", end: "11:30" },
      rejected: null,
    });
  });

  it("mover el inicio recalcula la duración", () => {
    const { draft: next } = withStart(draft, "10:00", "24h");
    expect(draftDuration(next)).toBe(90);
  });

  it("un texto que no se puede interpretar deja el borrador igual y marca el campo", () => {
    expect(withStart(draft, "1pm", "24h")).toEqual({ draft, rejected: "start" });
  });

  it("con 12 h acepta el sufijo y guarda la hora canónica (PF-14)", () => {
    expect(withStart(draft, "1:30pm", "12h")).toEqual({
      draft: { date: "2026-10-02", start: "13:30", end: "11:30" },
      rejected: null,
    });
    expect(withStart(draft, "12 am", "12h").draft.start).toBe("00:00");
  });

  it("con 12 h sigue aceptando la hora sin sufijo", () => {
    expect(withStart(draft, "0345", "12h").draft.start).toBe("03:45");
    expect(withStart(draft, "13:00", "12h").draft.start).toBe("13:00");
  });

  it("con 12 h rechaza una hora de 12 h fuera de rango", () => {
    expect(withStart(draft, "13pm", "12h")).toEqual({ draft, rejected: "start" });
  });
});

describe("withEnd", () => {
  it("interpreta el formato tolerante y conserva el inicio", () => {
    expect(withEnd(draft, "9.45", "24h")).toEqual({
      draft: { date: "2026-10-02", start: "09:00", end: "09:45" },
      rejected: null,
    });
  });

  it("un texto ilegible deja el borrador igual y marca el fin", () => {
    expect(withEnd(draft, "25:00", "24h")).toEqual({ draft, rejected: "end" });
  });

  it("con 12 h, «12:02 am» guarda las 00:02 (criterio 5)", () => {
    expect(withEnd(draft, "12:02 am", "12h")).toEqual({
      draft: { date: "2026-10-02", start: "09:00", end: "00:02" },
      rejected: null,
    });
  });

  it("con 24 h rechaza todo sufijo", () => {
    expect(withEnd(draft, "9am", "24h")).toEqual({ draft, rejected: "end" });
  });
});

describe("withDuration", () => {
  it("mueve el fin y no toca el inicio", () => {
    expect(withDuration(draft, "2h")).toEqual({
      draft: { date: "2026-10-02", start: "09:00", end: "11:00" },
      rejected: null,
    });
  });

  it("acepta los formatos de TT-19 y deja la duración que dicen", () => {
    expect(draftDuration(withDuration(draft, "30").draft)).toBe(30);
    expect(draftDuration(withDuration(draft, "2:00").draft)).toBe(120);
    expect(draftDuration(withDuration(draft, "2.75").draft)).toBe(165);
    expect(draftDuration(withDuration(draft, "2,75").draft)).toBe(165);
    expect(draftDuration(withDuration(draft, "1h30m1s").draft)).toBe(90);
  });

  it("una duración que cruza la medianoche deja el fin del día siguiente", () => {
    const { draft: next } = withDuration({ ...draft, start: "23:00" }, "3h");
    expect(next.end).toBe("02:00");
    expect(draftExtraDays(next)).toBe(1);
  });

  it("un texto ilegible deja el borrador igual y marca la duración", () => {
    expect(withDuration(draft, "ab")).toEqual({ draft, rejected: "duration" });
    expect(withDuration(draft, "24:00")).toEqual({ draft, rejected: "duration" });
  });
});

describe("withDate", () => {
  it("cambia el día y deja las dos horas donde estaban", () => {
    expect(withDate(draft, "2026-09-15")).toEqual({
      date: "2026-09-15",
      start: "09:00",
      end: "11:30",
    });
  });
});

describe("fromView", () => {
  /** Los tres campos de la vista que el editor de la fila necesita (§5). */
  const view = { dayDate: "2026-10-02", startClock: "08:00", endClock: "10:30" };

  it("arma el trío con el día y las dos horas canónicas de la vista", () => {
    expect(fromView(view)).toEqual({ date: "2026-10-02", start: "08:00", end: "10:30" });
  });

  it("lee las horas canónicas y no los rótulos, también con 12 h", () => {
    const shown12h = { ...view, startLabel: "8:00 AM", endLabel: "10:30 AM" };
    expect(fromView(shown12h)).toEqual({
      date: "2026-10-02",
      start: "08:00",
      end: "10:30",
    });
  });

  it("deriva la duración de las dos horas de pared", () => {
    expect(draftDuration(fromView(view))).toBe(150);
    expect(draftExtraDays(fromView(view))).toBe(0);
  });

  it("una entrada que cruza la medianoche vuelve a dar el día siguiente", () => {
    const next = fromView({ ...view, startClock: "22:00", endClock: "01:15" });
    expect(draftDuration(next)).toBe(195);
    expect(draftExtraDays(next)).toBe(1);
  });
});

/** "HH:mm" de un minuto del día, para recorrer el reloj entero. */
function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

describe("el borrador de la fila", () => {
  const row = fromView({ dayDate: "2026-10-02", startClock: "08:00", endClock: "10:30" });

  it("acepta los mismos formatos que la barra manual (TT-19, TT-20)", () => {
    expect(withStart(row, "7", "24h").draft.start).toBe("07:00");
    expect(withStart(row, "0745", "24h").draft.start).toBe("07:45");
    expect(withStart(row, "7.45", "24h").draft.start).toBe("07:45");
    expect(withEnd(row, "11:15", "24h").draft.end).toBe("11:15");
  });

  it("un valor rechazado deja el borrador igual (TT-21)", () => {
    expect(withStart(row, "1pm", "24h")).toEqual({ draft: row, rejected: "start" });
    expect(withEnd(row, "25:00", "24h")).toEqual({ draft: row, rejected: "end" });
  });

  it("cada transición recalcula la duración", () => {
    const moved = withStart(row, "09:00", "24h").draft;
    expect(draftDuration(moved)).toBe(90);
    const stretched = withEnd(moved, "12:00", "24h").draft;
    expect(draftDuration(stretched)).toBe(180);
    expect(draftDuration(withDate(stretched, "2026-09-30"))).toBe(180);
  });

  it("dejar el fin por debajo del inicio lo manda al día siguiente (TT-72)", () => {
    const next = withEnd(row, "07:00", "24h").draft;
    expect(draftDuration(next)).toBe(23 * 60);
    expect(draftExtraDays(next)).toBe(1);
  });

  it("ninguna combinación de horas da una duración negativa (TT-81)", () => {
    for (let start = 0; start < 24 * 60; start += 7) {
      for (let end = 0; end < 24 * 60; end += 11) {
        const next: TimeDraft = {
          date: "2026-10-02",
          start: clock(start),
          end: clock(end),
        };
        const minutes = draftDuration(next);
        expect(minutes).toBeGreaterThanOrEqual(0);
        expect(minutes).toBeLessThan(24 * 60);
        expect(draftExtraDays(next)).toBe(end < start ? 1 : 0);
      }
    }
  });
});

describe("sameDraft", () => {
  it("el mismo trío es el mismo borrador", () => {
    expect(sameDraft(draft, { ...draft })).toBe(true);
  });

  it("cualquiera de los tres campos distinto lo hace otro", () => {
    expect(sameDraft(draft, { ...draft, date: "2026-10-03" })).toBe(false);
    expect(sameDraft(draft, { ...draft, start: "09:01" })).toBe(false);
    expect(sameDraft(draft, { ...draft, end: "11:31" })).toBe(false);
  });
});

describe("commitChange", () => {
  it("con el valor aceptado entrega el borrador y devuelve lo que el campo muestra", () => {
    const applied: TimeDraft[] = [];
    const shown = commitChange(
      withStart(draft, "0745", "24h"),
      (next) => applied.push(next),
      (next) => next.start,
    );
    expect(shown).toBe("07:45");
    expect(applied).toEqual([{ ...draft, start: "07:45" }]);
  });

  it("con el valor rechazado no entrega nada y devuelve null", () => {
    const applied: TimeDraft[] = [];
    const shown = commitChange(
      withDuration(draft, "ab"),
      (next) => applied.push(next),
      (next) => next.end,
    );
    expect(shown).toBeNull();
    expect(applied).toEqual([]);
  });
});
