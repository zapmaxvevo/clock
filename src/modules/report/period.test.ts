import { describe, expect, it } from "vitest";

import { daysBetweenKeys, type WeekStart } from "@/server/time";

import { reportPeriodOf } from "./period";
import type { ReportRange } from "./schema";

/** El jueves de las lecturas de R2a. */
const today = "2026-10-08";

function settingsWith(weekStart: WeekStart = 1) {
  return { weekStart, formats: { time: "24h", date: "dd/MM/yyyy" } } as const;
}

const monday = settingsWith(1);

function range(first: string, last: string): ReportRange {
  return { first, last };
}

/** Los atajos como `[id, rótulo, inicio, fin]`, en orden. */
function shortcutRows(todayKey: string, weekStart: WeekStart = 1) {
  return reportPeriodOf(todayKey, settingsWith(weekStart), null).shortcuts.map(
    (shortcut) => [
      shortcut.id,
      shortcut.label,
      shortcut.range.first,
      shortcut.range.last,
    ],
  );
}

/** El período de un atajo con hoy en `todayKey`. */
function shortcutRange(todayKey: string, id: string): ReportRange | undefined {
  return reportPeriodOf(todayKey, monday, null).shortcuts.find(
    (shortcut) => shortcut.id === id,
  )?.range;
}

/** Las dos flechas del período pedido. */
function arrows(requested: ReportRange, todayKey = today) {
  const period = reportPeriodOf(todayKey, monday, requested);
  return [period.previous, period.next];
}

describe("los atajos (D-R2b-2, RP-20, RP-24)", () => {
  it("con hoy el jueves 2026-10-08 y el lunes como primer día, los nueve en orden", () => {
    expect(shortcutRows(today)).toEqual([
      ["today", "Hoy", "2026-10-08", "2026-10-08"],
      ["yesterday", "Ayer", "2026-10-07", "2026-10-07"],
      ["thisWeek", "Esta semana", "2026-10-05", "2026-10-11"],
      ["lastWeek", "Semana anterior", "2026-09-28", "2026-10-04"],
      ["lastTwoWeeks", "Últimas dos semanas", "2026-09-28", "2026-10-11"],
      ["thisMonth", "Este mes", "2026-10-01", "2026-10-31"],
      ["lastMonth", "Mes pasado", "2026-09-01", "2026-09-30"],
      ["thisYear", "Este año", "2026-01-01", "2026-12-31"],
      ["lastYear", "Año pasado", "2025-01-01", "2025-12-31"],
    ]);
  });

  it("con el domingo como primer día, los tres de semana empiezan el domingo", () => {
    const weeks = shortcutRows(today, 0).filter(([id]) =>
      ["thisWeek", "lastWeek", "lastTwoWeeks"].includes(String(id)),
    );
    expect(weeks).toEqual([
      ["thisWeek", "Esta semana", "2026-10-04", "2026-10-10"],
      ["lastWeek", "Semana anterior", "2026-09-27", "2026-10-03"],
      ["lastTwoWeeks", "Últimas dos semanas", "2026-09-27", "2026-10-10"],
    ]);
  });

  it("con hoy el 2024-02-10, «Este mes» termina el 29 y «Este año» tiene 366 días", () => {
    expect(shortcutRange("2024-02-10", "thisMonth")).toEqual(
      range("2024-02-01", "2024-02-29"),
    );
    const year = shortcutRange("2024-02-10", "thisYear");
    expect(year).toEqual(range("2024-01-01", "2024-12-31"));
    expect(year === undefined ? null : daysBetweenKeys(year.first, year.last) + 1).toBe(
      366,
    );
  });

  it("con hoy el 2026-01-05, «Mes pasado» es diciembre de 2025 y «Año pasado», 2025", () => {
    expect(shortcutRange("2026-01-05", "lastMonth")).toEqual(
      range("2025-12-01", "2025-12-31"),
    );
    expect(shortcutRange("2026-01-05", "lastYear")).toEqual(
      range("2025-01-01", "2025-12-31"),
    );
  });

  it("con hoy el 2026-03-31, «Mes pasado» es febrero entero y no los 30 días antes", () => {
    expect(shortcutRange("2026-03-31", "lastMonth")).toEqual(
      range("2026-02-01", "2026-02-28"),
    );
  });

  it("con hoy el 9999-12-31 solo se ofrecen los que terminan antes", () => {
    const period = reportPeriodOf(
      "9999-12-31",
      monday,
      range("9999-12-30", "9999-12-30"),
    );
    expect(period.shortcuts.map((shortcut) => [shortcut.id, shortcut.range])).toEqual([
      ["yesterday", range("9999-12-30", "9999-12-30")],
      ["lastWeek", range("9999-12-20", "9999-12-26")],
      ["lastMonth", range("9999-11-01", "9999-11-30")],
      ["lastYear", range("9998-01-01", "9998-12-31")],
    ]);
  });

  it("con hoy el 0100-01-01, «Mes pasado» y «Año pasado» no se ofrecen", () => {
    const ids = reportPeriodOf(
      "0100-01-01",
      monday,
      range("0100-01-01", "0100-01-01"),
    ).shortcuts.map((shortcut) => shortcut.id);
    expect(ids).not.toContain("lastMonth");
    expect(ids).not.toContain("lastYear");
    expect(ids).toContain("thisMonth");
  });
});

describe("el rótulo del período (D-R2b-2)", () => {
  it("el período de cada atajo se rotula con su nombre", () => {
    const { shortcuts } = reportPeriodOf(today, monday, null);
    expect(shortcuts).toHaveLength(9);
    for (const shortcut of shortcuts) {
      expect([
        shortcut.id,
        reportPeriodOf(today, monday, shortcut.range).rangeLabel,
      ]).toEqual([shortcut.id, shortcut.label]);
    }
  });

  it("un mes entero que no es este ni el pasado se rotula con sus días", () => {
    expect(
      reportPeriodOf(today, monday, range("2026-08-01", "2026-08-31")).rangeLabel,
    ).toBe("01/08 – 31/08");
  });

  it("una semana alineada lejana y un rango libre se rotulan como en R2a", () => {
    expect(
      reportPeriodOf(today, monday, range("2026-09-14", "2026-09-20")).rangeLabel,
    ).toBe("14/09 – 20/09");
    expect(
      reportPeriodOf(today, monday, range("2026-10-01", "2026-10-01")).rangeLabel,
    ).toBe("01/10");
  });

  it("sin pedido, el período es «Esta semana»", () => {
    const period = reportPeriodOf(today, monday, null);
    expect([period.range, period.rangeLabel, period.currentWeek]).toEqual([
      range("2026-10-05", "2026-10-11"),
      "Esta semana",
      range("2026-10-05", "2026-10-11"),
    ]);
  });
});

describe("las flechas (D-R2b-3)", () => {
  it("«Este mes» de octubre de 2026 va a septiembre entero y a noviembre", () => {
    expect(arrows(range("2026-10-01", "2026-10-31"))).toEqual([
      range("2026-09-01", "2026-09-30"),
      range("2026-11-01", "2026-11-30"),
    ]);
  });

  it("febrero de 2026 va a enero y a marzo", () => {
    expect(arrows(range("2026-02-01", "2026-02-28"))).toEqual([
      range("2026-01-01", "2026-01-31"),
      range("2026-03-01", "2026-03-31"),
    ]);
  });

  it("enero a marzo de 2026 va a octubre a diciembre de 2025 y a abril a junio", () => {
    expect(arrows(range("2026-01-01", "2026-03-31"))).toEqual([
      range("2025-10-01", "2025-12-31"),
      range("2026-04-01", "2026-06-30"),
    ]);
  });

  it("«Este año» 2024, de 366 días, va a 2023 y a 2025 enteros", () => {
    expect(arrows(range("2024-01-01", "2024-12-31"), "2024-06-15")).toEqual([
      range("2023-01-01", "2023-12-31"),
      range("2025-01-01", "2025-12-31"),
    ]);
  });

  it("«Hoy» va a «Ayer»", () => {
    const [previous] = arrows(range(today, today));
    expect(previous).toEqual(range("2026-10-07", "2026-10-07"));
    expect(
      previous === null ? null : reportPeriodOf(today, monday, previous).rangeLabel,
    ).toBe("Ayer");
  });

  it("«Últimas dos semanas» se mueve 14 días", () => {
    expect(arrows(range("2026-09-28", "2026-10-11"))).toEqual([
      range("2026-09-14", "2026-09-27"),
      range("2026-10-12", "2026-10-25"),
    ]);
  });

  it("31 días que no son un mes entero se mueven 31 días", () => {
    expect(arrows(range("2026-10-02", "2026-11-01"))).toEqual([
      range("2026-09-01", "2026-10-01"),
      range("2026-11-02", "2026-12-02"),
    ]);
  });

  it("noviembre de 9999 no tiene siguiente y un mes desde el 0100-01-01 no tiene anterior", () => {
    expect(arrows(range("9999-11-01", "9999-11-30"))).toEqual([
      range("9999-10-01", "9999-10-31"),
      null,
    ]);
    expect(arrows(range("0100-01-01", "0100-01-31"))).toEqual([
      null,
      range("0100-02-01", "0100-02-28"),
    ]);
  });

  it("una semana del 9999-12-18 al 24 no tiene siguiente y una desde el 0100-01-01 no tiene anterior", () => {
    // El destino terminaría el 9999-12-31, cuyo día siguiente no tiene clave.
    expect(arrows(range("9999-12-18", "9999-12-24"))).toEqual([
      range("9999-12-11", "9999-12-17"),
      null,
    ]);
    expect(arrows(range("0100-01-01", "0100-01-07"))).toEqual([
      null,
      range("0100-01-08", "0100-01-14"),
    ]);
  });

  it("sin pedido, las flechas de «Esta semana» se mueven 7 días", () => {
    const period = reportPeriodOf(today, monday, null);
    expect([period.previous, period.next]).toEqual([
      range("2026-09-28", "2026-10-04"),
      range("2026-10-12", "2026-10-18"),
    ]);
  });
});
