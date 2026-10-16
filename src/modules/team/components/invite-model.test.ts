import { describe, expect, it } from "vitest";

import { invitationMessages } from "@/modules/workspace/schema";

import { checkEmails, splitEmails, withoutRejected } from "./invite-model";

describe("splitEmails", () => {
  it("parte por coma, espacio, tabulación y salto de línea, sin vacíos", () => {
    expect(
      splitEmails("ana@empresa.com, bruno@empresa.com\ncarla@otro.com\tdiego@otro.com"),
    ).toEqual([
      "ana@empresa.com",
      "bruno@empresa.com",
      "carla@otro.com",
      "diego@otro.com",
    ]);
    expect(splitEmails(" ,, ana@empresa.com ,\n\n")).toEqual(["ana@empresa.com"]);
  });

  it("descarta los repetidos sin distinguir mayúsculas y se queda con el primero", () => {
    expect(
      splitEmails("Ana@Empresa.com  ana@empresa.com, bruno@empresa.com ANA@EMPRESA.COM"),
    ).toEqual(["Ana@Empresa.com", "bruno@empresa.com"]);
  });

  it("no valida el formato: eso lo hace el servidor, correo por correo", () => {
    expect(splitEmails("no-es-correo ana@empresa.com")).toEqual([
      "no-es-correo",
      "ana@empresa.com",
    ]);
  });

  it("un campo vacío o solo con separadores no da ningún correo", () => {
    expect(splitEmails("")).toEqual([]);
    expect(splitEmails(" ,\n ,")).toEqual([]);
  });
});

/** `n` correos distintos, separados por comas. */
function emailsText(n: number): string {
  return Array.from({ length: n }, (_, index) => `persona${index}@empresa.com`).join(",");
}

describe("checkEmails", () => {
  it("sin correos, EQ-77", () => {
    expect(checkEmails("  \n")).toEqual({
      ok: false,
      message: invitationMessages.noEmails,
    });
  });

  it("con 50, los manda; con 51, EQ-78", () => {
    const fifty = checkEmails(emailsText(50));
    expect(fifty.ok && fifty.emails).toHaveLength(50);
    expect(checkEmails(emailsText(51))).toEqual({
      ok: false,
      message: invitationMessages.tooMany,
    });
  });

  it("con un texto de más de 1000 caracteres, el tope del servidor, sin mandar", () => {
    const long = `${"a".repeat(990)}@empresa.com`;

    expect(checkEmails(`ana@empresa.com ${long}`)).toEqual({
      ok: false,
      message: invitationMessages.inputTooLong,
    });
  });

  it("uno de 1000 caracteres justos se manda: entre 321 y 1000 lo rechaza el servidor por correo", () => {
    const limit = `${"a".repeat(988)}@empresa.com`;
    const check = checkEmails(limit);

    expect(limit).toHaveLength(1000);
    expect(check.ok && check.emails).toEqual([limit]);
  });

  it("cuenta los correos sin repetidos: 51 con uno repetido son 50", () => {
    const check = checkEmails(`${emailsText(50)}, PERSONA0@empresa.com`);
    expect(check.ok && check.emails).toHaveLength(50);
  });
});

describe("withoutRejected", () => {
  const rejections = [
    {
      id: "no-es-correo",
      code: "invalid_email",
      message: "no-es-correo no es un correo válido.",
    },
    {
      id: "carla@empresa.com",
      code: "inactive_member",
      message: "carla@empresa.com está desactivada: reactivala desde la lista.",
    },
  ];

  it("deja los correos sin rechazo, uno por línea, en el orden escrito", () => {
    expect(
      withoutRejected(
        "ana@empresa.com, no-es-correo carla@empresa.com\nbruno@otro.com",
        rejections,
      ),
    ).toEqual("ana@empresa.com\nbruno@otro.com");
  });

  it("compara con el correo normalizado: el rechazo alcanza la forma escrita con mayúsculas", () => {
    expect(withoutRejected("Carla@Empresa.com ana@empresa.com", rejections)).toEqual(
      "ana@empresa.com",
    );
  });

  it("si todos fallan, el campo queda vacío", () => {
    expect(withoutRejected("no-es-correo carla@empresa.com", rejections)).toEqual("");
  });
});
