import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/server/db";
import { membership, userPreference } from "@/server/db/schema";
import type { MembershipStatus, Role } from "@/server/permissions";
import {
  seedPreferences,
  seedUser,
  seedWorkspace,
  type SeededWorkspace,
} from "@/test/factories";
import { auditFor } from "@/test/queries";

import { profileMessages, type UpdatePreferenceInput } from "./schema";

/**
 * La capa de actions con sus tres puertas de Next y de Better Auth
 * reemplazadas, como en `time-entry` y `project`: el resto corre de verdad
 * (`requireSession` con las preferencias, `ensureWorkspaceContext`, Zod,
 * `can()`, el service y la base). Se verifica la traducción a `ActionResult`
 * y que el árbol entero se revalide también en el camino de error (PF-33).
 */
const mocks = vi.hoisted(() => ({
  sessionUser: null as null | { id: string; email: string },
  revalidated: [] as (string | { path: string; type: string })[],
  redirects: [] as string[],
}));

class RedirectError extends Error {
  constructor(readonly to: string) {
    super(`redirect ${to}`);
  }
}

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string, type?: string) => {
    mocks.revalidated.push(type === undefined ? path : { path, type });
  },
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    mocks.redirects.push(path);
    throw new RedirectError(path);
  },
}));

vi.mock("@/server/auth", () => ({
  auth: {
    api: {
      getSession: async () =>
        mocks.sessionUser === null
          ? null
          : {
              user: {
                id: mocks.sessionUser.id,
                email: mocks.sessionUser.email,
                name: "Persona de prueba",
                image: null,
              },
            },
    },
  },
}));

const actions = await import("./actions");

const wholeTree = { path: "/", type: "layout" };

let seeded: SeededWorkspace;

/** Una sesión en el workspace sembrado, con la membresía ya creada en ese estado y rol. */
async function signInAs(status: MembershipStatus = "active", role: Role = "member") {
  const email = `${randomUUID()}@empresa.com`;
  const id = await seedUser(email);
  await db
    .insert(membership)
    .values({ workspaceId: seeded.workspaceId, userId: id, role, status });
  mocks.sessionUser = { id, email };
  return id;
}

async function rowOf(id: string) {
  const rows = await db
    .select()
    .from(userPreference)
    .where(eq(userPreference.userId, id));
  return rows.at(0);
}

beforeEach(async () => {
  mocks.sessionUser = null;
  mocks.revalidated.length = 0;
  mocks.redirects.length = 0;
  seeded = await seedWorkspace();
});

afterEach(() => {
  mocks.sessionUser = null;
});

describe("sin sesión", () => {
  it("manda al login sin ejecutar ni revalidar", async () => {
    await expect(
      actions.updatePreference({ key: "timeFormat", value: "12h" }),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(mocks.redirects).toEqual(["/login"]);
    expect(mocks.revalidated).toEqual([]);
    expect(await db.select().from(userPreference)).toEqual([]);
  });
});

describe("updatePreference (criterio 12)", () => {
  it("guarda la preferencia de quien tiene la sesión, responde las resueltas y revalida el árbol", async () => {
    const userId = await signInAs();

    const result = await actions.updatePreference({ key: "timeFormat", value: "12h" });

    expect(result).toEqual({
      ok: true,
      data: {
        preferences: {
          timezone: "America/Argentina/Buenos_Aires",
          timeFormat: "12h",
          dateFormat: "dd/MM/yyyy",
        },
      },
    });
    expect((await rowOf(userId))?.timeFormat).toBe("12h");
    expect(mocks.revalidated).toEqual([wholeTree]);
  });

  it("el segundo pedido conserva la clave del primero", async () => {
    await signInAs();
    await actions.updatePreference({ key: "timezone", value: "Asia/Tokyo" });

    const result = await actions.updatePreference({
      key: "dateFormat",
      value: "yyyy-MM-dd",
    });

    expect(result.ok && result.data.preferences).toEqual({
      timezone: "Asia/Tokyo",
      timeFormat: "24h",
      dateFormat: "yyyy-MM-dd",
    });
    expect(mocks.revalidated).toEqual([wholeTree, wholeTree]);
  });

  it("acepta el valor de omisión de la zona aunque la lista no lo nombre (criterio 10)", async () => {
    const userId = await signInAs();

    const result = await actions.updatePreference({
      key: "timezone",
      value: "America/Argentina/Buenos_Aires",
    });

    expect(result.ok).toBe(true);
    expect((await rowOf(userId))?.timezone).toBe("America/Argentina/Buenos_Aires");
  });

  it("acepta UTC aunque el entorno no la liste (PF-11)", async () => {
    const userId = await signInAs();

    const result = await actions.updatePreference({ key: "timezone", value: "UTC" });

    expect(result.ok && result.data.preferences.timezone).toBe("UTC");
    expect((await rowOf(userId))?.timezone).toBe("UTC");
  });

  it.each([
    ["una zona inventada", { key: "timezone", value: "Marte/Olympus_Mons" }],
    ["una zona fuera de la lista", { key: "timezone", value: "Etc/GMT+3" }],
    ["una zona que no es texto", { key: "timezone", value: 42 }],
  ])(
    "%s responde «Esa zona horaria no existe.», no escribe y revalida (criterio 10)",
    async (_label, input) => {
      const userId = await signInAs();

      const result = await actions.updatePreference(input as UpdatePreferenceInput);

      expect(result).toEqual({
        ok: false,
        code: "validation",
        message: profileMessages.timeZoneUnknown,
      });
      expect(await rowOf(userId)).toBeUndefined();
      expect(mocks.revalidated).toEqual([wholeTree]);
    },
  );

  it.each([
    ["un formato de hora desconocido", { key: "timeFormat", value: "25h" }],
    ["un formato de fecha desconocido", { key: "dateFormat", value: "d/M/y" }],
    ["una clave desconocida", { key: "theme", value: "dark" }],
  ])(
    "%s responde «Ese formato no está disponible.», no escribe y revalida (criterio 10)",
    async (_label, input) => {
      const userId = await signInAs();

      const result = await actions.updatePreference(input as UpdatePreferenceInput);

      expect(result).toEqual({
        ok: false,
        code: "validation",
        message: profileMessages.formatUnavailable,
      });
      expect(await rowOf(userId)).toBeUndefined();
      expect(mocks.revalidated).toEqual([wholeTree]);
    },
  );

  it.each(["inactive", "invited"] as const)(
    "una membresía %s responde forbidden, no escribe ni deja registro, y revalida (PF-46)",
    async (status) => {
      const userId = await signInAs(status);

      const result = await actions.updatePreference({
        key: "timeFormat",
        value: "12h",
      });

      expect(result).toEqual({
        ok: false,
        code: "forbidden",
        message: profileMessages.forbidden,
      });
      expect(await rowOf(userId)).toBeUndefined();
      expect(await auditFor("user_preference")).toEqual([]);
      expect(mocks.revalidated).toEqual([wholeTree]);
    },
  );

  it("una membresía inactive no cambia una fila que ya existe, tampoco con el valor guardado", async () => {
    const userId = await signInAs("inactive");
    await seedPreferences(userId, { timeFormat: "24h" });

    for (const value of ["24h", "12h"] as const) {
      const result = await actions.updatePreference({ key: "timeFormat", value });
      expect([value, result.ok || result.code]).toEqual([value, "forbidden"]);
    }
    expect((await rowOf(userId))?.timeFormat).toBe("24h");
    expect(await auditFor("user_preference")).toEqual([]);
  });

  it("los cinco roles cambian sus preferencias (PF-34)", async () => {
    for (const role of [
      "owner",
      "admin",
      "project_manager",
      "team_manager",
      "member",
    ] as const) {
      const userId = await signInAs("active", role);

      const result = await actions.updatePreference({ key: "timeFormat", value: "12h" });

      expect([role, result.ok, (await rowOf(userId))?.timeFormat]).toEqual([
        role,
        true,
        "12h",
      ]);
    }
  });

  it("una membresía inactive con un pedido inválido responde la validación, que corre antes del permiso", async () => {
    await signInAs("inactive");
    const input: { key: string; value: string } = { key: "timeFormat", value: "25h" };

    const result = await actions.updatePreference(input as UpdatePreferenceInput);

    expect(result).toMatchObject({
      ok: false,
      code: "validation",
      message: profileMessages.formatUnavailable,
    });
  });
});
