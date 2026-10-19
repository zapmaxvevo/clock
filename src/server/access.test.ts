import { describe, expect, it } from "vitest";

import {
  accessDenialMessage,
  decideGoogleAccess,
  decideStoredEmail,
  decideStoredIdentity,
  isBootstrapOwner,
  loginErrorMessage,
  NO_ENTRY_FACTS,
  type AccessPolicy,
  type EntryFacts,
  type GoogleProfile,
  verifiedEmailOf,
} from "./access";

const policy: AccessPolicy = {
  domains: ["empresa.com"],
  bootstrapOwnerEmail: "owner@empresa.com",
};

const allowed = { allowed: true } as const;
const notHosted = { allowed: false, reason: "dominio_no_habilitado" } as const;
const notInvited = { allowed: false, reason: "sin_invitacion" } as const;
const inactive = { allowed: false, reason: "membresia_inactiva" } as const;

function facts(values: Partial<EntryFacts>): EntryFacts {
  return { ...NO_ENTRY_FACTS, ...values };
}

const member = facts({ membership: "active" });
const pending = facts({ invitation: "pending" });

const domainProfile: GoogleProfile = {
  email: "ana@empresa.com",
  email_verified: true,
  hd: "empresa.com",
};
const externalProfile: GoogleProfile = {
  email: "freelance@gmail.com",
  email_verified: true,
};

/**
 * Un objeto que lanza al leer cualquier campo: `decideGoogleAccess` no tiene
 * que mirar los hechos sin correo o sin verificar (§4.1).
 */
const unreadableFacts = new Proxy({} as EntryFacts, {
  get() {
    throw new Error("Leyó los hechos.");
  },
});

describe("verifiedEmailOf", () => {
  it("da el correo normalizado si viene y está verificado", () => {
    expect(verifiedEmailOf({ email: " Ana@Empresa.com ", email_verified: true })).toEqual(
      {
        verified: true,
        email: "ana@empresa.com",
      },
    );
  });

  it("da el motivo sin correo, con uno en blanco o sin verificar", () => {
    expect(verifiedEmailOf({ email: null, email_verified: true })).toEqual({
      verified: false,
      reason: "sin_email",
    });
    expect(verifiedEmailOf({ email: " ", email_verified: true })).toEqual({
      verified: false,
      reason: "sin_email",
    });
    expect(verifiedEmailOf({ email: "ana@empresa.com" })).toEqual({
      verified: false,
      reason: "email_no_verificado",
    });
  });
});

describe("isBootstrapOwner", () => {
  it("compara recortado y en minúsculas", () => {
    expect(isBootstrapOwner(" Owner@Empresa.com", "owner@EMPRESA.com ")).toBe(true);
    expect(isBootstrapOwner("ana@empresa.com", "owner@empresa.com")).toBe(false);
  });
});

describe("decideGoogleAccess, el perfil", () => {
  it("rechaza una cuenta sin email, sin leer los hechos", () => {
    expect(decideGoogleAccess({ email_verified: true }, policy, unreadableFacts)).toEqual(
      {
        allowed: false,
        reason: "sin_email",
      },
    );
    expect(
      decideGoogleAccess({ email: "  ", email_verified: true }, policy, unreadableFacts),
    ).toEqual({ allowed: false, reason: "sin_email" });
  });

  it("rechaza un email sin verificar, del dominio o externo, sin leer los hechos", () => {
    for (const profile of [domainProfile, externalProfile]) {
      expect(
        decideGoogleAccess(
          { ...profile, email_verified: false },
          policy,
          unreadableFacts,
        ),
      ).toEqual({ allowed: false, reason: "email_no_verificado" });
    }
  });
});

describe("decideGoogleAccess, la identidad del dominio", () => {
  it("con hd y membresía, entra", () => {
    expect(decideGoogleAccess(domainProfile, policy, member)).toEqual(allowed);
  });

  it("acepta un segundo dominio habilitado, no solo el primero", () => {
    const twoDomains = { ...policy, domains: ["empresa.com", "otra-empresa.com"] };
    expect(
      decideGoogleAccess(
        { email: "leo@otra-empresa.com", email_verified: true, hd: "otra-empresa.com" },
        twoDomains,
        member,
      ),
    ).toEqual(allowed);
  });

  it("sin hd no entra, aunque tenga invitación o membresía (criterio 5)", () => {
    // Las cuentas «no gestionadas», creadas antes de que el dominio pasara a
    // Workspace, tienen el email del dominio y no traen el claim.
    const withoutHd = { email: "ana@empresa.com", email_verified: true };
    for (const known of [
      NO_ENTRY_FACTS,
      pending,
      facts({ invitation: "accepted" }),
      member,
      facts({ invitation: "pending", membership: "active" }),
    ]) {
      expect(decideGoogleAccess(withoutHd, policy, known)).toEqual(notHosted);
    }
  });

  it("con un hd que contradice al dominio del email no entra", () => {
    expect(
      decideGoogleAccess({ ...domainProfile, hd: "otra.com" }, policy, member),
    ).toEqual(notHosted);
  });

  it("con hd y sin membresía ni invitación no entra, con sin_invitacion (criterio 1)", () => {
    expect(decideGoogleAccess(domainProfile, policy, NO_ENTRY_FACTS)).toEqual(notInvited);
  });

  it("con hd y una invitación revocada, o aceptada sin membresía, no entra", () => {
    for (const invitation of ["revoked", "accepted"] as const) {
      expect(decideGoogleAccess(domainProfile, policy, facts({ invitation }))).toEqual(
        notInvited,
      );
    }
  });

  it("con hd e invitación pendiente entra (EQ-17)", () => {
    expect(decideGoogleAccess(domainProfile, policy, pending)).toEqual(allowed);
  });
});

describe("decideGoogleAccess, la identidad externa (criterio 4)", () => {
  it("con pendiente entra, sin distinguir mayúsculas en el correo ni en el dominio", () => {
    expect(
      decideGoogleAccess(
        { email: "Freelance@Gmail.com", email_verified: true },
        { ...policy, domains: ["EMPRESA.com"] },
        pending,
      ),
    ).toEqual(allowed);
  });

  it("con aceptada y membresía entra", () => {
    expect(
      decideGoogleAccess(
        externalProfile,
        policy,
        facts({ invitation: "accepted", membership: "active" }),
      ),
    ).toEqual(allowed);
  });

  it("con aceptada sin membresía, revocada o sin fila, no entra con sin_invitacion", () => {
    for (const invitation of ["accepted", "revoked", null] as const) {
      expect(decideGoogleAccess(externalProfile, policy, facts({ invitation }))).toEqual(
        notInvited,
      );
    }
  });

  it("con membresía y sin invitación abierta no entra (EQ-24)", () => {
    for (const invitation of ["revoked", null] as const) {
      expect(
        decideGoogleAccess(
          externalProfile,
          policy,
          facts({ invitation, membership: "active" }),
        ),
      ).toEqual(notInvited);
    }
  });
});

describe("decideGoogleAccess, el acceso", () => {
  it("solo una membresía activa da acceso; inactive e invited, membresia_inactiva (D-E2-1)", () => {
    expect(
      decideGoogleAccess(domainProfile, policy, facts({ membership: "active" })),
    ).toEqual(allowed);
    for (const membership of ["inactive", "invited"] as const) {
      expect([
        membership,
        decideGoogleAccess(domainProfile, policy, facts({ membership })),
      ]).toEqual([membership, inactive]);
    }
  });

  it("la membresía no activa gana sobre una invitación pendiente (D-E2-1)", () => {
    for (const membership of ["inactive", "invited"] as const) {
      expect([
        membership,
        decideGoogleAccess(
          domainProfile,
          policy,
          facts({ invitation: "pending", membership }),
        ),
      ]).toEqual([membership, inactive]);
    }
  });

  it("un externo con aceptada o pendiente y la membresía inactiva, membresia_inactiva (criterio 10)", () => {
    for (const invitation of ["accepted", "pending"] as const) {
      expect([
        invitation,
        decideGoogleAccess(
          externalProfile,
          policy,
          facts({ invitation, membership: "inactive" }),
        ),
      ]).toEqual([invitation, inactive]);
    }
  });

  it("la identidad va primero: un externo inactivo sin invitación abierta, sin_invitacion", () => {
    for (const invitation of ["revoked", null] as const) {
      expect(
        decideGoogleAccess(
          externalProfile,
          policy,
          facts({ invitation, membership: "inactive" }),
        ),
      ).toEqual(notInvited);
    }
  });

  it("la identidad va primero: el dominio sin hd e inactivo, dominio_no_habilitado", () => {
    expect(
      decideGoogleAccess(
        { email: "ana@empresa.com", email_verified: true },
        policy,
        facts({ membership: "inactive" }),
      ),
    ).toEqual(notHosted);
  });

  it("sin workspace, el correo del arranque entra, con mayúsculas y blancos (criterio 7)", () => {
    expect(
      decideGoogleAccess(
        { email: "  Owner@Empresa.com ", email_verified: true, hd: "empresa.com" },
        { ...policy, bootstrapOwnerEmail: " OWNER@empresa.com" },
        facts({ bootstrap: true }),
      ),
    ).toEqual(allowed);
  });

  it("sin workspace, otro correo del dominio no entra (criterio 7)", () => {
    expect(decideGoogleAccess(domainProfile, policy, facts({ bootstrap: true }))).toEqual(
      notInvited,
    );
  });

  it("con workspace, el correo del arranque necesita membresía o invitación (criterio 8)", () => {
    const owner = { ...domainProfile, email: "owner@empresa.com" };
    expect(decideGoogleAccess(owner, policy, NO_ENTRY_FACTS)).toEqual(notInvited);
    expect(decideGoogleAccess(owner, policy, pending)).toEqual(allowed);
  });

  it("sin workspace, un correo del arranque externo no entra: la identidad sigue valiendo", () => {
    expect(
      decideGoogleAccess(
        externalProfile,
        { ...policy, bootstrapOwnerEmail: "freelance@gmail.com" },
        facts({ bootstrap: true }),
      ),
    ).toEqual(notInvited);
  });
});

describe("decideStoredEmail", () => {
  it("el dominio, por el sufijo y sin distinguir mayúsculas, entra con membresía", () => {
    expect(decideStoredEmail("ANA@empresa.com", policy, member)).toEqual(allowed);
  });

  it("el dominio sin membresía ni invitación no entra (criterio 1)", () => {
    expect(decideStoredEmail("ana@empresa.com", policy, NO_ENTRY_FACTS)).toEqual(
      notInvited,
    );
  });

  it("el dominio con pendiente entra; con aceptada sola o revocada, no", () => {
    expect(decideStoredEmail("ana@empresa.com", policy, pending)).toEqual(allowed);
    for (const invitation of ["accepted", "revoked"] as const) {
      expect(decideStoredEmail("ana@empresa.com", policy, facts({ invitation }))).toEqual(
        notInvited,
      );
    }
  });

  it("un externo con pendiente, o con aceptada y membresía activa, entra", () => {
    expect(decideStoredEmail("Freelance@gmail.com", policy, pending)).toEqual(allowed);
    expect(
      decideStoredEmail(
        "freelance@gmail.com",
        policy,
        facts({ invitation: "accepted", membership: "active" }),
      ),
    ).toEqual(allowed);
  });

  it("un externo con aceptada o pendiente y la membresía inactiva, membresia_inactiva (criterio 10)", () => {
    for (const invitation of ["accepted", "pending"] as const) {
      expect([
        invitation,
        decideStoredEmail(
          "freelance@gmail.com",
          policy,
          facts({ invitation, membership: "inactive" }),
        ),
      ]).toEqual([invitation, inactive]);
    }
  });

  it("un externo inactivo sin invitación abierta, sin_invitacion: la identidad va primero", () => {
    for (const invitation of ["revoked", null] as const) {
      expect(
        decideStoredEmail(
          "freelance@gmail.com",
          policy,
          facts({ invitation, membership: "inactive" }),
        ),
      ).toEqual(notInvited);
    }
  });

  it("un externo sin fila, revocado o aceptado sin membresía, no entra", () => {
    for (const invitation of [null, "revoked", "accepted"] as const) {
      expect(decideStoredEmail("ex@gmail.com", policy, facts({ invitation }))).toEqual(
        notInvited,
      );
    }
    expect(
      decideStoredEmail(
        "ex@gmail.com",
        policy,
        facts({ invitation: "revoked", membership: "active" }),
      ),
    ).toEqual(notInvited);
  });

  it("solo una membresía activa da acceso; inactive e invited, membresia_inactiva (D-E2-1)", () => {
    expect(
      decideStoredEmail("ana@empresa.com", policy, facts({ membership: "active" })),
    ).toEqual(allowed);
    for (const membership of ["inactive", "invited"] as const) {
      expect([
        membership,
        decideStoredEmail("ana@empresa.com", policy, facts({ membership })),
      ]).toEqual([membership, inactive]);
    }
  });

  it("la membresía no activa gana sobre una invitación pendiente (D-E2-1)", () => {
    for (const membership of ["inactive", "invited"] as const) {
      expect([
        membership,
        decideStoredEmail(
          "ana@empresa.com",
          policy,
          facts({ invitation: "pending", membership }),
        ),
      ]).toEqual([membership, inactive]);
    }
  });

  it("el arranque: solo el correo configurado y solo sin workspace (criterios 7 y 8)", () => {
    const bootstrap = facts({ bootstrap: true });
    expect(decideStoredEmail(" Owner@Empresa.com", policy, bootstrap)).toEqual(allowed);
    expect(decideStoredEmail("ana@empresa.com", policy, bootstrap)).toEqual(notInvited);
    expect(decideStoredEmail("owner@empresa.com", policy, NO_ENTRY_FACTS)).toEqual(
      notInvited,
    );
  });

  it("sin workspace, un correo del arranque externo no entra: la identidad sigue valiendo", () => {
    expect(
      decideStoredEmail(
        "freelance@gmail.com",
        { ...policy, bootstrapOwnerEmail: "freelance@gmail.com" },
        facts({ bootstrap: true }),
      ),
    ).toEqual(notInvited);
  });
});

describe("decideStoredIdentity (D-E2-2)", () => {
  const memberships = [null, "active", "inactive", "invited"] as const;

  it("el dominio, por el sufijo, sin mirar la membresía ni la invitación", () => {
    for (const membership of memberships) {
      for (const invitation of [null, "pending", "accepted", "revoked"] as const) {
        expect([
          membership,
          invitation,
          decideStoredIdentity(
            "ANA@empresa.com",
            policy,
            facts({ membership, invitation }),
          ),
        ]).toEqual([membership, invitation, allowed]);
      }
    }
  });

  it("un externo con pendiente o aceptada, sin mirar la membresía", () => {
    for (const membership of memberships) {
      for (const invitation of ["pending", "accepted"] as const) {
        expect([
          membership,
          invitation,
          decideStoredIdentity(
            "freelance@gmail.com",
            policy,
            facts({ membership, invitation }),
          ),
        ]).toEqual([membership, invitation, allowed]);
      }
    }
  });

  it("un externo revocado o sin fila, sin_invitacion, aunque tenga membresía activa", () => {
    for (const membership of memberships) {
      for (const invitation of ["revoked", null] as const) {
        expect([
          membership,
          invitation,
          decideStoredIdentity(
            "freelance@gmail.com",
            policy,
            facts({ membership, invitation }),
          ),
        ]).toEqual([membership, invitation, notInvited]);
      }
    }
  });

  it("sin workspace, no decide el arranque: el dominio pasa y el externo sin invitación no", () => {
    const bootstrap = facts({ bootstrap: true });
    expect(decideStoredIdentity("ana@empresa.com", policy, bootstrap)).toEqual(allowed);
    expect(decideStoredIdentity("freelance@gmail.com", policy, bootstrap)).toEqual(
      notInvited,
    );
  });
});

describe("un dominio sacado de la política (D-E1b-13, criterio 21)", () => {
  // `vieja.com` estaba en la política cuando se invitó y entró la persona.
  const withoutOld: AccessPolicy = { ...policy, domains: ["empresa.com"] };

  it("quien tiene una aceptada y membresía sigue entrando, como externa", () => {
    expect(
      decideStoredEmail(
        "ana@vieja.com",
        withoutOld,
        facts({ invitation: "accepted", membership: "active" }),
      ),
    ).toEqual(allowed);
  });

  it("quien tiene membresía sin invitación deja de entrar, con sin_invitacion", () => {
    expect(decideStoredEmail("leo@vieja.com", withoutOld, member)).toEqual(notInvited);
  });
});

describe("loginErrorMessage (criterio 24 de E1a)", () => {
  it("da el texto de un motivo conocido", () => {
    expect(loginErrorMessage("dominio_no_habilitado")).toBe(
      accessDenialMessage.dominio_no_habilitado,
    );
    expect(loginErrorMessage("email_no_verificado")).toBe(
      accessDenialMessage.email_no_verificado,
    );
  });

  it("sin_invitacion da el texto de EQ-91", () => {
    expect(loginErrorMessage("sin_invitacion")).toBe(
      "Tu cuenta no tiene una invitación a Clock. Pedísela a quien administra el equipo.",
    );
  });

  it("membresia_inactiva da el texto de EQ-92 (criterio 10)", () => {
    expect(loginErrorMessage("membresia_inactiva")).toBe(
      "Tu acceso al workspace está desactivado. Pedile a quien administra el equipo que te vuelva a activar.",
    );
  });

  it("dominio_no_habilitado da el texto que no menciona una invitación (D-E1b-2)", () => {
    expect(loginErrorMessage("dominio_no_habilitado")).toBe(
      "La cuenta no es la de Google Workspace de la empresa.",
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
