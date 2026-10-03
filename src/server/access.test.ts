import { describe, expect, it } from "vitest";

import { decideGoogleAccess, isAllowedEmail, type AccessPolicy } from "./access";

const policy: AccessPolicy = {
  domains: ["empresa.com"],
  invitedEmails: ["freelance@gmail.com"],
};

describe("decideGoogleAccess", () => {
  it("acepta una cuenta del dominio con email verificado", () => {
    expect(
      decideGoogleAccess(
        { email: "ana@empresa.com", email_verified: true, hd: "empresa.com" },
        policy,
      ),
    ).toEqual({ allowed: true });
  });

  it("rechaza una cuenta de otro dominio", () => {
    expect(
      decideGoogleAccess({ email: "otro@gmail.com", email_verified: true }, policy),
    ).toEqual({ allowed: false, reason: "dominio_no_habilitado" });
  });

  it("rechaza un email sin verificar aunque sea del dominio", () => {
    expect(
      decideGoogleAccess(
        { email: "ana@empresa.com", email_verified: false, hd: "empresa.com" },
        policy,
      ),
    ).toEqual({ allowed: false, reason: "email_no_verificado" });
  });

  it("rechaza una cuenta de consumo con email del dominio pero sin hd", () => {
    // Las cuentas «no gestionadas», creadas antes de que el dominio pasara a
    // Workspace, tienen el email del dominio y no traen el claim.
    expect(
      decideGoogleAccess({ email: "ana@empresa.com", email_verified: true }, policy),
    ).toEqual({ allowed: false, reason: "dominio_no_habilitado" });
  });

  it("acepta un segundo dominio habilitado, no solo el primero", () => {
    const dosDominios = {
      domains: ["empresa.com", "otra-empresa.com"],
      invitedEmails: [],
    };
    expect(
      decideGoogleAccess(
        { email: "leo@otra-empresa.com", email_verified: true, hd: "otra-empresa.com" },
        dosDominios,
      ),
    ).toEqual({ allowed: true });
  });

  it("rechaza cuando el claim hd contradice al dominio del email", () => {
    expect(
      decideGoogleAccess(
        { email: "ana@empresa.com", email_verified: true, hd: "otra.com" },
        policy,
      ),
    ).toEqual({ allowed: false, reason: "dominio_no_habilitado" });
  });

  it("acepta un externo invitado", () => {
    expect(
      decideGoogleAccess({ email: "Freelance@Gmail.com", email_verified: true }, policy),
    ).toEqual({ allowed: true });
  });

  it("rechaza una cuenta sin email", () => {
    expect(decideGoogleAccess({ email_verified: true }, policy)).toEqual({
      allowed: false,
      reason: "sin_email",
    });
  });
});

describe("isAllowedEmail", () => {
  it("acepta el dominio y la lista de invitados, sin distinguir mayúsculas", () => {
    expect(isAllowedEmail("ANA@empresa.com", policy)).toBe(true);
    expect(isAllowedEmail("freelance@gmail.com", policy)).toBe(true);
  });

  it("rechaza a quien ya no está en la lista", () => {
    expect(isAllowedEmail("ex@gmail.com", policy)).toBe(false);
  });
});
