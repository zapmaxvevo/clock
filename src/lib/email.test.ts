import { describe, expect, it } from "vitest";

import {
  domainOf,
  isCompanyEmail,
  isReleasedEmail,
  normalizeEmail,
  parseDomainList,
  RELEASED_EMAIL_DOMAIN,
  releasedEmailOf,
} from "./email";

describe("normalizeEmail (EQ-105)", () => {
  it("recorta y pasa a minúsculas", () => {
    expect(normalizeEmail("  Ana@Empresa.COM \n")).toBe("ana@empresa.com");
  });

  it("deja igual un correo ya normalizado", () => {
    expect(normalizeEmail("ana@empresa.com")).toBe("ana@empresa.com");
  });
});

describe("domainOf", () => {
  it("da lo que sigue a la última arroba", () => {
    expect(domainOf("ana@empresa.com")).toBe("empresa.com");
    expect(domainOf('"a@b"@otra.com')).toBe("otra.com");
  });

  it("da la cadena vacía sin arroba", () => {
    expect(domainOf("ana.empresa.com")).toBe("");
  });
});

describe("isCompanyEmail", () => {
  it("compara el dominio del correo con los de la empresa, sin distinguir mayúsculas ni blancos", () => {
    expect(isCompanyEmail(" Ana@EMPRESA.com", ["otra.com", " Empresa.com "])).toBe(true);
  });

  it("no toma un subdominio ni un sufijo como el dominio", () => {
    expect(isCompanyEmail("ana@ventas.empresa.com", ["empresa.com"])).toBe(false);
    expect(isCompanyEmail("ana@otraempresa.com", ["empresa.com"])).toBe(false);
  });

  it("es falso sin arroba o sin dominios", () => {
    expect(isCompanyEmail("empresa.com", ["empresa.com"])).toBe(false);
    expect(isCompanyEmail("ana@empresa.com", [])).toBe(false);
  });
});

describe("parseDomainList", () => {
  it("separa por comas, normaliza y descarta los vacíos", () => {
    expect(parseDomainList(" Empresa.com, ,OTRA-empresa.com,")).toEqual([
      "empresa.com",
      "otra-empresa.com",
    ]);
  });

  it("da una lista vacía con la cadena vacía", () => {
    expect(parseDomainList("")).toEqual([]);
  });
});

describe("releasedEmailOf e isReleasedEmail (D-E2b-9)", () => {
  it("arma `<userId>@liberado.invalid`", () => {
    expect(releasedEmailOf("u-123")).toBe("u-123@liberado.invalid");
    expect(RELEASED_EMAIL_DOMAIN).toBe("liberado.invalid");
  });

  it("reconoce el correo que arma, sin distinguir mayúsculas ni blancos", () => {
    expect(isReleasedEmail(releasedEmailOf("u-123"))).toBe(true);
    expect(isReleasedEmail("  U-123@Liberado.INVALID \n")).toBe(true);
  });

  it("no reconoce un correo de la empresa, uno externo ni un subdominio", () => {
    expect(isReleasedEmail("ana@empresa.com")).toBe(false);
    expect(isReleasedEmail("ana@gmail.com")).toBe(false);
    expect(isReleasedEmail("ana@otro.liberado.invalid")).toBe(false);
    expect(isReleasedEmail("liberado.invalid")).toBe(false);
  });

  it("un correo liberado no es de ningún dominio de la empresa", () => {
    expect(isCompanyEmail(releasedEmailOf("u-123"), ["empresa.com"])).toBe(false);
  });
});
