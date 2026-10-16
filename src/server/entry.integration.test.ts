import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { workspaceRepository } from "@/modules/workspace/repository";
import { accessDenialMessage } from "@/server/access";
import { seedInvitation, seedWorkspace } from "@/test/factories";

import {
  decideProfileEntry,
  decideStoredEmailEntry,
  loginErrorUrl,
  sessionEntryError,
} from "./entry";

/**
 * El ingreso con la variable y la base (D-E1a-4, criterios 14 a 16). Los
 * dominios son los de `src/test/setup.ts`: `empresa.com`.
 */

const original = process.env.EXTERNAL_INVITE_EMAILS;
let workspaceId: string;

beforeEach(async () => {
  process.env.EXTERNAL_INVITE_EMAILS = "Variable@Gmail.com, otra@yahoo.com";
  ({ workspaceId } = await seedWorkspace());
});

afterEach(() => {
  vi.restoreAllMocks();
  if (original === undefined) {
    delete process.env.EXTERNAL_INVITE_EMAILS;
  } else {
    process.env.EXTERNAL_INVITE_EMAILS = original;
  }
});

const allowed = { allowed: true };
const denied = { allowed: false, reason: "dominio_no_habilitado" };

/** Un perfil de Google verificado, sin `hd` salvo que se pase. */
function profile(email: string, hd?: string) {
  return { email, email_verified: true, hd: hd ?? null };
}

describe("un correo externo", () => {
  it.each([
    ["con una invitación pendiente", "pending", allowed],
    ["con una invitación aceptada", "accepted", allowed],
    ["con la invitación revocada (criterio 15)", "revoked", denied],
  ] as const)("%s", async (_case, status, decision) => {
    await seedInvitation({ workspaceId, email: "ana@gmail.com", status });

    expect(await decideProfileEntry(profile("Ana@Gmail.com"))).toEqual(decision);
    expect(await decideStoredEmailEntry("ana@gmail.com")).toEqual(decision);
  });

  it("sin invitación ni variable no entra (criterio 14)", async () => {
    expect(await decideProfileEntry(profile("nadie@gmail.com"))).toEqual(denied);
    expect(await decideStoredEmailEntry("nadie@gmail.com")).toEqual(denied);
  });

  it("solo en la variable entra, aunque su invitación esté revocada (criterio 15)", async () => {
    await seedInvitation({ workspaceId, email: "variable@gmail.com", status: "revoked" });

    expect(await decideProfileEntry(profile("variable@gmail.com"))).toEqual(allowed);
    expect(await decideStoredEmailEntry("VARIABLE@gmail.com")).toEqual(allowed);
  });

  it("con el email sin verificar no entra, aunque esté invitado", async () => {
    await seedInvitation({ workspaceId, email: "ana@gmail.com" });

    expect(
      await decideProfileEntry({ email: "ana@gmail.com", email_verified: false }),
    ).toEqual({ allowed: false, reason: "email_no_verificado" });
  });
});

describe("un correo del dominio", () => {
  it("con invitación y sin hd no entra por la vía externa (criterio 16)", async () => {
    await seedInvitation({ workspaceId, email: "ana@empresa.com" });

    expect(await decideProfileEntry(profile("ana@empresa.com"))).toEqual(denied);
  });

  it("en la variable y sin hd tampoco entra (D-E1a-4)", async () => {
    process.env.EXTERNAL_INVITE_EMAILS = "ana@empresa.com";

    expect(await decideProfileEntry(profile("ana@empresa.com"))).toEqual(denied);
  });

  it("con hd entra sin consultar la base (criterio 17)", async () => {
    const hasOpenInvitation = vi.spyOn(workspaceRepository, "hasOpenInvitation");

    expect(await decideProfileEntry(profile("ana@empresa.com", "empresa.com"))).toEqual(
      allowed,
    );
    expect(await decideStoredEmailEntry("ana@empresa.com")).toEqual(allowed);
    expect(hasOpenInvitation).not.toHaveBeenCalled();
  });
});

describe("los rechazos hacia /login (D-E1a-14)", () => {
  it("loginErrorUrl es absoluta sobre BETTER_AUTH_URL, con el motivo", () => {
    expect(loginErrorUrl("dominio_no_habilitado")).toBe(
      `${new URL("/login", process.env.BETTER_AUTH_URL).toString()}?error=dominio_no_habilitado`,
    );
  });

  it("sessionEntryError es FORBIDDEN con el motivo como código y su texto", () => {
    const error = sessionEntryError("dominio_no_habilitado");

    expect(error.status).toBe("FORBIDDEN");
    expect(error.body).toMatchObject({
      code: "dominio_no_habilitado",
      message: accessDenialMessage.dominio_no_habilitado,
    });
  });
});
