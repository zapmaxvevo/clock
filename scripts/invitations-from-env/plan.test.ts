import { describe, expect, it } from "vitest";

import { describeStep, planFromEnv } from "./plan";

describe("planFromEnv (contrato de E1a, §4.6)", () => {
  it("crea accepted para el correo con membresía y pending para el que no", () => {
    expect(
      planFromEnv(
        ["Ya@Gmail.com", "nueva@gmail.com"],
        ["empresa.com"],
        ["ya@gmail.com"],
        [],
      ),
    ).toEqual([
      { email: "ya@gmail.com", inDomain: false, kind: "create", status: "accepted" },
      { email: "nueva@gmail.com", inDomain: false, kind: "create", status: "pending" },
    ]);
  });

  it.each(["pending", "accepted", "revoked"] as const)(
    "no toca una fila %s que ya existe, tenga o no membresía",
    (status) => {
      expect(
        planFromEnv(
          ["ana@gmail.com"],
          [],
          ["ana@gmail.com"],
          [{ email: "ana@gmail.com", status }],
        ),
      ).toEqual([{ email: "ana@gmail.com", inDomain: false, kind: "exists", status }]);
    },
  );

  it("quita los repetidos y conserva el orden de la variable", () => {
    expect(
      planFromEnv(["b@gmail.com", "a@gmail.com", "B@gmail.com"], [], [], []).map(
        (step) => step.email,
      ),
    ).toEqual(["b@gmail.com", "a@gmail.com"]);
  });

  it("señala un correo de los dominios de la empresa (D-E1a-4)", () => {
    const [step] = planFromEnv(["ana@empresa.com"], ["Empresa.com"], [], []);

    expect(step.inDomain).toBe(true);
    expect(describeStep(step)).toContain("¡del dominio!");
  });

  it("describe cada paso con su acción", () => {
    const [created, existing] = planFromEnv(
      ["nueva@gmail.com", "vieja@gmail.com"],
      [],
      [],
      [{ email: "vieja@gmail.com", status: "revoked" }],
    );

    expect(describeStep(created)).toMatch(/se crea pending\s+nueva@gmail\.com$/);
    expect(describeStep(existing)).toMatch(/ya existe \(revoked\)\s+vieja@gmail\.com$/);
  });
});
