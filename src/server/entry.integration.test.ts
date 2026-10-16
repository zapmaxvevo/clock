import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { workspaceRepository } from "@/modules/workspace/repository";
import { accessDenialMessage } from "@/server/access";
import { env } from "@/server/env";
import { seedInvitation, seedMember, seedWorkspace } from "@/test/factories";

import {
  decideProfileEntry,
  decideStoredEmailEntry,
  loginErrorUrl,
  sessionEntryError,
} from "./entry";

/**
 * El ingreso con los hechos de la base (contrato de E1b, D-E1b-1, criterios 1
 * y 4 a 9). Los dominios y el owner son los de `src/test/setup.ts`:
 * `empresa.com` y `owner@empresa.com`.
 */

const allowed = { allowed: true };
const notHosted = { allowed: false, reason: "dominio_no_habilitado" };
const notInvited = { allowed: false, reason: "sin_invitacion" };

/** Un perfil de Google verificado, sin `hd` salvo que se pase. */
function profile(email: string, hd?: string) {
  return { email, email_verified: true, hd: hd ?? null };
}

/** Las dos decisiones del mismo correo: la del perfil y la del correo guardado. */
async function bothEntries(email: string, hd?: string) {
  return [
    await decideProfileEntry(profile(email, hd)),
    await decideStoredEmailEntry(email),
  ];
}

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.EXTERNAL_INVITE_EMAILS;
});

describe("con el workspace", () => {
  let workspaceId: string;

  beforeEach(async () => {
    ({ workspaceId } = await seedWorkspace());
  });

  describe("un correo del dominio con hd", () => {
    it("sin membresía ni invitación no entra (criterio 1)", async () => {
      expect(await bothEntries("ana@empresa.com", "empresa.com")).toEqual([
        notInvited,
        notInvited,
      ]);
    });

    it("con una invitación pendiente entra (EQ-17)", async () => {
      await seedInvitation({ workspaceId, email: "ana@empresa.com" });

      expect(await bothEntries("Ana@Empresa.com", "empresa.com")).toEqual([
        allowed,
        allowed,
      ]);
    });

    it("con membresía entra sin invitación (EQ-31)", async () => {
      await seedMember(workspaceId, "member", "active", { email: "ana@empresa.com" });

      expect(await bothEntries("ana@empresa.com", "empresa.com")).toEqual([
        allowed,
        allowed,
      ]);
    });

    it("con la invitación revocada, o aceptada sin membresía, no entra", async () => {
      await seedInvitation({ workspaceId, email: "rev@empresa.com", status: "revoked" });
      await seedInvitation({ workspaceId, email: "acc@empresa.com", status: "accepted" });

      expect(await bothEntries("rev@empresa.com", "empresa.com")).toEqual([
        notInvited,
        notInvited,
      ]);
      expect(await bothEntries("acc@empresa.com", "empresa.com")).toEqual([
        notInvited,
        notInvited,
      ]);
    });

    it("una membresía inactiva sigue dando acceso hasta E2 (criterio 9)", async () => {
      await seedMember(workspaceId, "member", "inactive", { email: "ana@empresa.com" });

      expect(await bothEntries("ana@empresa.com", "empresa.com")).toEqual([
        allowed,
        allowed,
      ]);
    });

    it("el correo del arranque, con workspace, necesita una invitación (criterio 8)", async () => {
      expect(await bothEntries("owner@empresa.com", "empresa.com")).toEqual([
        notInvited,
        notInvited,
      ]);

      await seedInvitation({ workspaceId, email: "owner@empresa.com" });

      expect(await bothEntries("owner@empresa.com", "empresa.com")).toEqual([
        allowed,
        allowed,
      ]);
    });
  });

  describe("un correo del dominio sin hd (criterio 5)", () => {
    it("no entra, aunque tenga invitación o membresía", async () => {
      await seedInvitation({ workspaceId, email: "ana@empresa.com" });
      await seedMember(workspaceId, "member", "active", { email: "leo@empresa.com" });

      expect(await decideProfileEntry(profile("ana@empresa.com"))).toEqual(notHosted);
      expect(await decideProfileEntry(profile("leo@empresa.com"))).toEqual(notHosted);
    });
  });

  describe("un correo externo (criterio 4)", () => {
    it.each([
      ["con una invitación pendiente entra", "pending", allowed],
      ["con la invitación aceptada y sin membresía no entra", "accepted", notInvited],
      ["con la invitación revocada no entra", "revoked", notInvited],
    ] as const)("%s", async (_case, status, decision) => {
      await seedInvitation({ workspaceId, email: "ana@gmail.com", status });

      expect(await decideProfileEntry(profile("Ana@Gmail.com"))).toEqual(decision);
      expect(await decideStoredEmailEntry("ana@gmail.com")).toEqual(decision);
    });

    it("con la invitación aceptada y membresía entra, también con el correo guardado con mayúsculas", async () => {
      await seedInvitation({ workspaceId, email: "ana@gmail.com", status: "accepted" });
      await seedMember(workspaceId, "member", "active", { email: " Ana@Gmail.com" });

      expect(await bothEntries("ana@gmail.com")).toEqual([allowed, allowed]);
    });

    it("sin invitación no entra, con sin_invitacion", async () => {
      expect(await bothEntries("nadie@gmail.com")).toEqual([notInvited, notInvited]);
    });

    it("con membresía y la invitación revocada no entra (EQ-24)", async () => {
      await seedInvitation({ workspaceId, email: "ana@gmail.com", status: "revoked" });
      await seedMember(workspaceId, "member", "active", { email: "ana@gmail.com" });

      expect(await bothEntries("ana@gmail.com")).toEqual([notInvited, notInvited]);
    });

    it("con el email sin verificar no entra, aunque esté invitado", async () => {
      await seedInvitation({ workspaceId, email: "ana@gmail.com" });

      expect(
        await decideProfileEntry({ email: "ana@gmail.com", email_verified: false }),
      ).toEqual({ allowed: false, reason: "email_no_verificado" });
    });
  });

  describe("la variable no se lee (criterio 6)", () => {
    it("un correo de la lista sin invitación no entra, y env() no tiene el campo", async () => {
      process.env.EXTERNAL_INVITE_EMAILS = "Variable@Gmail.com, ana@empresa.com";

      expect(await bothEntries("variable@gmail.com")).toEqual([notInvited, notInvited]);
      expect(await bothEntries("ana@empresa.com", "empresa.com")).toEqual([
        notInvited,
        notInvited,
      ]);
      expect(env()).not.toHaveProperty("EXTERNAL_INVITE_EMAILS");
    });
  });

  describe("la consulta", () => {
    it("sin correo o sin verificar no lee los hechos", async () => {
      const entryFacts = vi.spyOn(workspaceRepository, "entryFacts");

      expect(await decideProfileEntry({ email_verified: true })).toEqual({
        allowed: false,
        reason: "sin_email",
      });
      expect(
        await decideProfileEntry({
          email: "ana@empresa.com",
          email_verified: false,
          hd: "empresa.com",
        }),
      ).toEqual({ allowed: false, reason: "email_no_verificado" });
      expect(entryFacts).not.toHaveBeenCalled();
    });

    it("lee los hechos una vez por decisión, también con hd, con el correo normalizado", async () => {
      const entryFacts = vi.spyOn(workspaceRepository, "entryFacts");

      await decideProfileEntry(profile(" Ana@Empresa.com", "empresa.com"));
      await decideStoredEmailEntry("ANA@empresa.com ");

      expect(entryFacts.mock.calls).toEqual([["ana@empresa.com"], ["ana@empresa.com"]]);
    });
  });
});

describe("sin workspace, el arranque (criterio 7)", () => {
  it("entra el correo del arranque; otro del dominio no", async () => {
    expect(await bothEntries("Owner@Empresa.com", "empresa.com")).toEqual([
      allowed,
      allowed,
    ]);
    expect(await bothEntries("ana@empresa.com", "empresa.com")).toEqual([
      notInvited,
      notInvited,
    ]);
  });

  it("el correo del arranque sin hd no entra", async () => {
    expect(await decideProfileEntry(profile("owner@empresa.com"))).toEqual(notHosted);
  });
});

describe("los rechazos hacia /login (D-E1a-14)", () => {
  it("loginErrorUrl es absoluta sobre BETTER_AUTH_URL, con el motivo", () => {
    expect(loginErrorUrl("sin_invitacion")).toBe(
      `${new URL("/login", process.env.BETTER_AUTH_URL).toString()}?error=sin_invitacion`,
    );
  });

  it("sessionEntryError es FORBIDDEN con el motivo como código y su texto", () => {
    const error = sessionEntryError("sin_invitacion");

    expect(error.status).toBe("FORBIDDEN");
    expect(error.body).toMatchObject({
      code: "sin_invitacion",
      message: accessDenialMessage.sin_invitacion,
    });
  });
});
