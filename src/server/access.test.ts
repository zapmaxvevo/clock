import { describe, expect, it } from "vitest";

import {
  accessDenialMessage,
  decideGoogleAccess,
  decideStoredEmail,
  loginErrorMessage,
  type AccessPolicy,
} from "./access";

const policy: AccessPolicy = { domains: ["empresa.com"] };

const denied = { allowed: false, reason: "dominio_no_habilitado" } as const;

describe("decideGoogleAccess", () => {
  it("acepta una cuenta del dominio con email verificado", () => {
    expect(
      decideGoogleAccess(
        { email: "ana@empresa.com", email_verified: true, hd: "empresa.com" },
        policy,
        false,
      ),
    ).toEqual({ allowed: true });
  });

  it("rechaza una cuenta de otro dominio sin invitación", () => {
    expect(
      decideGoogleAccess(
        { email: "otro@gmail.com", email_verified: true },
        policy,
        false,
      ),
    ).toEqual(denied);
  });

  it("rechaza un email sin verificar aunque sea del dominio", () => {
    expect(
      decideGoogleAccess(
        { email: "ana@empresa.com", email_verified: false, hd: "empresa.com" },
        policy,
        false,
      ),
    ).toEqual({ allowed: false, reason: "email_no_verificado" });
  });

  it("rechaza una cuenta de consumo con email del dominio pero sin hd", () => {
    // Las cuentas «no gestionadas», creadas antes de que el dominio pasara a
    // Workspace, tienen el email del dominio y no traen el claim.
    expect(
      decideGoogleAccess(
        { email: "ana@empresa.com", email_verified: true },
        policy,
        false,
      ),
    ).toEqual(denied);
  });

  it("rechaza un correo del dominio sin hd aunque tenga invitación (criterio 16)", () => {
    expect(
      decideGoogleAccess(
        { email: "ana@empresa.com", email_verified: true },
        policy,
        true,
      ),
    ).toEqual(denied);
  });

  it("acepta un segundo dominio habilitado, no solo el primero", () => {
    const dosDominios = { domains: ["empresa.com", "otra-empresa.com"] };
    expect(
      decideGoogleAccess(
        { email: "leo@otra-empresa.com", email_verified: true, hd: "otra-empresa.com" },
        dosDominios,
        false,
      ),
    ).toEqual({ allowed: true });
  });

  it("rechaza cuando el claim hd contradice al dominio del email", () => {
    expect(
      decideGoogleAccess(
        { email: "ana@empresa.com", email_verified: true, hd: "otra.com" },
        policy,
        false,
      ),
    ).toEqual(denied);
  });

  it("acepta un externo invitado, sin distinguir mayúsculas en el dominio", () => {
    expect(
      decideGoogleAccess(
        { email: "Freelance@Gmail.com", email_verified: true },
        { domains: ["EMPRESA.com"] },
        true,
      ),
    ).toEqual({ allowed: true });
  });

  it("rechaza un externo invitado con el email sin verificar", () => {
    expect(
      decideGoogleAccess(
        { email: "freelance@gmail.com", email_verified: false },
        policy,
        true,
      ),
    ).toEqual({ allowed: false, reason: "email_no_verificado" });
  });

  it("rechaza una cuenta sin email", () => {
    expect(decideGoogleAccess({ email_verified: true }, policy, true)).toEqual({
      allowed: false,
      reason: "sin_email",
    });
  });
});

describe("decideStoredEmail", () => {
  it("acepta el dominio por el sufijo, sin distinguir mayúsculas y sin invitación", () => {
    expect(decideStoredEmail("ANA@empresa.com", policy, false)).toEqual({
      allowed: true,
    });
  });

  it("acepta un externo invitado", () => {
    expect(decideStoredEmail("Freelance@gmail.com", policy, true)).toEqual({
      allowed: true,
    });
  });

  it("rechaza un externo sin invitación, con el motivo", () => {
    expect(decideStoredEmail("ex@gmail.com", policy, false)).toEqual(denied);
  });
});

describe("loginErrorMessage (criterio 24)", () => {
  it("da el texto de un motivo conocido", () => {
    expect(loginErrorMessage("dominio_no_habilitado")).toBe(
      accessDenialMessage.dominio_no_habilitado,
    );
    expect(loginErrorMessage("email_no_verificado")).toBe(
      accessDenialMessage.email_no_verificado,
    );
  });

  it("da el texto genérico con un código desconocido, vacío o heredado de Object", () => {
    const generic = "No se pudo iniciar sesión. Volvé a intentar.";
    expect(loginErrorMessage("state_not_found")).toBe(generic);
    expect(loginErrorMessage("")).toBe(generic);
    expect(loginErrorMessage("toString")).toBe(generic);
  });

  it("no devuelve nunca el texto del parámetro", () => {
    const crafted = "Tu cuenta fue suspendida: escribí a soporte@estafa.com";
    expect(loginErrorMessage(crafted)).not.toContain("estafa");
  });

  it("no da ningún aviso sin parámetro", () => {
    expect(loginErrorMessage(undefined)).toBeNull();
  });
});
