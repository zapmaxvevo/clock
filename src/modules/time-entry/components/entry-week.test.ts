import { describe, expect, it } from "vitest";

import { reachFloor, weekToReach } from "./entry-week";

const reachFrom = "2026-09-21";

describe("weekToReach", () => {
  it("una semana anterior a la ventana es la que hay que alcanzar", () => {
    expect(weekToReach(reachFrom, ["2026-08-17"])).toBe("2026-08-17");
  });

  it("la semana del piso ya se ve", () => {
    expect(weekToReach(reachFrom, [reachFrom])).toBeNull();
  });

  it("una semana posterior al piso ya se ve", () => {
    expect(weekToReach(reachFrom, ["2026-09-28"])).toBeNull();
  });

  it("entre varias, alcanza la única anterior al piso", () => {
    expect(weekToReach(reachFrom, ["2026-09-28", "2026-08-31", reachFrom])).toBe(
      "2026-08-31",
    );
  });

  it("con varias anteriores, alcanza la más vieja", () => {
    expect(weekToReach(reachFrom, ["2026-09-07", "2026-08-10", "2026-08-31"])).toBe(
      "2026-08-10",
    );
  });

  it("sin semanas no hay nada que alcanzar", () => {
    expect(weekToReach(reachFrom, [])).toBeNull();
  });
});

describe("reachFloor", () => {
  it("sin semana pedida, la cota es el piso del último render", () => {
    expect(reachFloor(reachFrom, null)).toBe(reachFrom);
  });

  it("una semana pedida que todavía no llegó baja la cota", () => {
    expect(reachFloor(reachFrom, "2026-08-03")).toBe("2026-08-03");
  });

  it("una semana pedida que ya llegó no la cambia", () => {
    expect(reachFloor(reachFrom, "2026-09-28")).toBe(reachFrom);
  });

  it("la segunda respuesta en vuelo no pide una semana posterior a la ya pedida", () => {
    const floor = reachFloor(reachFrom, "2026-08-03");
    expect(weekToReach(floor, ["2026-08-31"])).toBeNull();
    expect(weekToReach(floor, ["2026-07-27"])).toBe("2026-07-27");
  });
});
