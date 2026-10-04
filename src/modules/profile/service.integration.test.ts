import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db, type Transaction } from "@/server/db";
import { membership, userPreference } from "@/server/db/schema";
import type { Actor, MembershipStatus } from "@/server/permissions";
import {
  canonicalTimeZone,
  DATE_FORMATS,
  supportedTimeZones,
  TIME_FORMATS,
  utcOffsetLabel,
} from "@/server/time";
import { raceThroughBarrier } from "@/test/concurrency";
import {
  seedMember,
  seedPreferences,
  seedWorkspace,
  type SeedPreferenceValues,
} from "@/test/factories";
import { auditFor } from "@/test/queries";
import { workspaceRepository } from "@/modules/workspace/repository";

import { type UserPreferenceRow } from "./repository";
import { type UpdatePreferenceInput } from "./schema";
import {
  getProfileView,
  PREFERENCE_DEFAULTS,
  preferencesOf,
  resolvePreferences,
  updatePreference,
  type ProfileContext,
} from "./service";

const fallbackZone = "America/Argentina/Buenos_Aires";
/** La opción que el entorno lista para el valor de omisión, sin escribirla a mano. */
const fallbackOption = new Intl.DateTimeFormat("en-US", {
  timeZone: fallbackZone,
}).resolvedOptions().timeZone;
/** Una zona que el entorno convierte y que su lista no nombra. */
const unlistedZone = "Etc/GMT+3";

let workspaceId: string;
let userId: string;

/** El permiso lo consulta la action: el service recibe siempre una membresía activa. */
function actorFor(id: string): Actor {
  return { userId: id, workspaceId, role: "member", status: "active" };
}

async function rowOf(id: string) {
  const rows = await db
    .select()
    .from(userPreference)
    .where(eq(userPreference.userId, id));
  return rows.at(0);
}

/** La sesión de esa persona, como la arma `currentSession`. */
async function contextFor(id: string): Promise<ProfileContext> {
  const row = await workspaceRepository.findFirstWorkspace();
  const member = await workspaceRepository.findMembership(workspaceId, id);
  if (row === undefined || member === undefined) {
    throw new Error("Falta el workspace o la membresía sembrados.");
  }
  return {
    workspace: row,
    membership: member,
    actor: { userId: id, workspaceId, role: member.role, status: member.status },
    preferences: await preferencesOf(id),
  };
}

async function setMembership(
  id: string,
  values: { status?: MembershipStatus; weekStart?: number },
) {
  await db
    .update(membership)
    .set(values)
    .where(and(eq(membership.workspaceId, workspaceId), eq(membership.userId, id)));
}

/** Los registros de auditoría de la persona, con los valores ya leídos. */
async function auditOf(id: string) {
  const rows = await auditFor("user_preference", id);
  return rows.map((row) => ({
    workspaceId: row.workspaceId,
    actorId: row.actorId,
    action: row.action,
    previousValue: JSON.parse(row.previousValue ?? "null") as unknown,
    nextValue: JSON.parse(row.nextValue ?? "null") as unknown,
  }));
}

/** Una fila como la devuelve la base, para las reglas de `resolvePreferences`. */
function rowWith(values: SeedPreferenceValues): UserPreferenceRow {
  return {
    userId,
    timezone: values.timezone ?? null,
    timeFormat: values.timeFormat ?? null,
    dateFormat: values.dateFormat ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

beforeEach(async () => {
  const seeded = await seedWorkspace();
  workspaceId = seeded.workspaceId;
  userId = await seedMember(workspaceId, "member");
});

describe("los predeterminados (criterio 2: PF-11, PF-12, PF-13, PF-37)", () => {
  it("sin fila, las preferencias son las de P-03", async () => {
    expect(await preferencesOf(userId)).toEqual({
      timezone: fallbackZone,
      timeFormat: "24h",
      dateFormat: "dd/MM/yyyy",
    });
  });

  it("con solo time_format guardado, las otras dos son las predeterminadas", async () => {
    await seedPreferences(userId, { timeFormat: "12h" });
    expect(await preferencesOf(userId)).toEqual({
      timezone: fallbackZone,
      timeFormat: "12h",
      dateFormat: "dd/MM/yyyy",
    });
  });

  it("lee la fila de quien pide y no la de otra persona", async () => {
    const other = await seedMember(workspaceId, "member");
    await seedPreferences(other, { timezone: "Asia/Tokyo", dateFormat: "yyyy-MM-dd" });
    expect(await preferencesOf(userId)).toEqual(PREFERENCE_DEFAULTS);
    expect(await preferencesOf(other)).toMatchObject({ timezone: "Asia/Tokyo" });
  });

  it("una zona guardada que el entorno no convierte cae al predeterminado", () => {
    expect(resolvePreferences(rowWith({ timezone: "Marte/Olympus_Mons" }))).toEqual(
      PREFERENCE_DEFAULTS,
    );
  });

  it("una zona que el entorno convierte con su forma canónica fuera de la lista se usa", () => {
    expect(supportedTimeZones()).not.toContain(unlistedZone);
    expect(resolvePreferences(rowWith({ timezone: unlistedZone })).timezone).toBe(
      unlistedZone,
    );
  });

  it("la zona guardada vuelve tal como se guardó, sin la forma canónica", () => {
    expect(resolvePreferences(rowWith({ timezone: fallbackZone })).timezone).toBe(
      fallbackZone,
    );
  });

  it("un formato fuera de lista lanza, en las dos columnas", () => {
    expect(() => resolvePreferences(rowWith({ timeFormat: "25h" }))).toThrow(RangeError);
    expect(() => resolvePreferences(rowWith({ dateFormat: "d/M/y" }))).toThrow(
      RangeError,
    );
  });
});

describe("updatePreference (criterio 9: PF-32)", () => {
  it("el primer cambio crea la fila con solo esa columna y responde las preferencias resueltas", async () => {
    const result = await updatePreference(actorFor(userId), {
      key: "timeFormat",
      value: "12h",
    });

    expect(result).toEqual({
      preferences: {
        timezone: fallbackZone,
        timeFormat: "12h",
        dateFormat: "dd/MM/yyyy",
      },
    });
    expect(await rowOf(userId)).toMatchObject({
      timezone: null,
      timeFormat: "12h",
      dateFormat: null,
    });
  });

  it("dos cambios seguidos de claves distintas conservan los dos", async () => {
    await updatePreference(actorFor(userId), { key: "timezone", value: "Asia/Tokyo" });
    const result = await updatePreference(actorFor(userId), {
      key: "dateFormat",
      value: "yyyy-MM-dd",
    });

    expect(result.preferences).toEqual({
      timezone: "Asia/Tokyo",
      timeFormat: "24h",
      dateFormat: "yyyy-MM-dd",
    });
    expect(await rowOf(userId)).toMatchObject({
      timezone: "Asia/Tokyo",
      timeFormat: null,
      dateFormat: "yyyy-MM-dd",
    });
  });

  it.each<UpdatePreferenceInput>([
    { key: "timezone", value: "Asia/Tokyo" },
    { key: "timeFormat", value: "12h" },
    { key: "dateFormat", value: "MM/dd/yyyy" },
  ])("la clave $key escribe solo su columna", async (input) => {
    const stored = {
      timezone: "Europe/Madrid",
      timeFormat: "24h",
      dateFormat: "dd-MM-yyyy",
    } as const;
    await seedPreferences(userId, stored);

    await updatePreference(actorFor(userId), input);

    expect(await rowOf(userId)).toMatchObject({ ...stored, [input.key]: input.value });
  });

  it("la zona se guarda tal como llega, sin la forma canónica", async () => {
    const result = await updatePreference(actorFor(userId), {
      key: "timezone",
      value: "US/Eastern",
    });
    expect(result.preferences.timezone).toBe("US/Eastern");
    expect((await rowOf(userId))?.timezone).toBe("US/Eastern");
  });

  it("pedir el valor ya guardado no escribe ni deja registro, y responde lo guardado", async () => {
    const seeded = await seedPreferences(userId, {
      timezone: "Asia/Tokyo",
      timeFormat: "12h",
    });

    const result = await updatePreference(actorFor(userId), {
      key: "timeFormat",
      value: "12h",
    });

    expect(result.preferences).toEqual({
      timezone: "Asia/Tokyo",
      timeFormat: "12h",
      dateFormat: "dd/MM/yyyy",
    });
    expect((await rowOf(userId))?.updatedAt).toEqual(seeded.updatedAt);
    expect(await auditOf(userId)).toEqual([]);
  });

  it("elegir el predeterminado con la columna en nulo sí escribe: deja de seguirlo", async () => {
    await updatePreference(actorFor(userId), { key: "dateFormat", value: "dd/MM/yyyy" });

    expect((await rowOf(userId))?.dateFormat).toBe("dd/MM/yyyy");
    expect(await auditOf(userId)).toHaveLength(1);
  });

  it("elegir el texto de omisión de la zona sin fila sí escribe, aunque la zona efectiva sea la misma", async () => {
    await updatePreference(actorFor(userId), { key: "timezone", value: fallbackZone });
    expect((await rowOf(userId))?.timezone).toBe(fallbackZone);
  });

  /** La barrera toma el bloqueo de la fila de la persona: los dos pedidos se traban ahí. */
  function holdRow(tx: Transaction) {
    return tx
      .select()
      .from(userPreference)
      .where(eq(userPreference.userId, userId))
      .for("update");
  }

  it("dos pedidos simultáneos de claves distintas sobre una fila existente dejan las dos columnas escritas", async () => {
    await seedPreferences(userId, {});

    await raceThroughBarrier(holdRow, [
      () => updatePreference(actorFor(userId), { key: "timezone", value: "Asia/Tokyo" }),
      () => updatePreference(actorFor(userId), { key: "timeFormat", value: "12h" }),
    ]);

    expect(await rowOf(userId)).toMatchObject({
      timezone: "Asia/Tokyo",
      timeFormat: "12h",
      dateFormat: null,
    });
    expect(await auditOf(userId)).toHaveLength(2);
  });

  it("dos pedidos simultáneos de la misma clave registran cada uno el valor que encontró", async () => {
    await seedPreferences(userId, { timezone: "Europe/Madrid" });

    await raceThroughBarrier(holdRow, [
      () => updatePreference(actorFor(userId), { key: "timezone", value: "Asia/Tokyo" }),
      () =>
        updatePreference(actorFor(userId), {
          key: "timezone",
          value: "America/New_York",
        }),
    ]);

    // El bloqueo los pone en fila: el segundo lee lo que escribió el primero.
    const rows = await auditFor("user_preference", userId);
    const stored = JSON.stringify({ timezone: "Europe/Madrid" });
    const first = rows.find((row) => row.previousValue === stored);
    const second = rows.find((row) => row !== first);
    expect(rows).toHaveLength(2);
    expect(second?.previousValue).toBe(first?.nextValue);
    expect(JSON.stringify({ timezone: (await rowOf(userId))?.timezone })).toBe(
      second?.nextValue,
    );
  });

  describe("dos primeros pedidos simultáneos de la misma clave", () => {
    // La barrera inserta la fila sin confirmarla y la descarta: los dos pedidos
    // llegan sin fila y se traban al asegurarla.
    const holdInsert = (tx: Transaction) => tx.insert(userPreference).values({ userId });

    it("con el mismo valor, el segundo sale sin efecto: un solo registro", async () => {
      await raceThroughBarrier(holdInsert, [
        () =>
          updatePreference(actorFor(userId), { key: "timezone", value: "Asia/Tokyo" }),
        () =>
          updatePreference(actorFor(userId), { key: "timezone", value: "Asia/Tokyo" }),
      ]);

      expect((await rowOf(userId))?.timezone).toBe("Asia/Tokyo");
      expect(await auditOf(userId)).toEqual([
        expect.objectContaining({
          previousValue: { timezone: null },
          nextValue: { timezone: "Asia/Tokyo" },
        }),
      ]);
    });

    it("con valores distintos, el segundo registra como anterior el valor del primero", async () => {
      await raceThroughBarrier(holdInsert, [
        () =>
          updatePreference(actorFor(userId), { key: "timezone", value: "Asia/Tokyo" }),
        () =>
          updatePreference(actorFor(userId), {
            key: "timezone",
            value: "America/New_York",
          }),
      ]);

      const rows = await auditFor("user_preference", userId);
      const first = rows.find(
        (row) => row.previousValue === JSON.stringify({ timezone: null }),
      );
      const second = rows.find((row) => row !== first);
      expect(rows).toHaveLength(2);
      expect(second?.previousValue).toBe(first?.nextValue);
      expect(JSON.stringify({ timezone: (await rowOf(userId))?.timezone })).toBe(
        second?.nextValue,
      );
    });
  });

  it("dos primeros pedidos simultáneos de claves distintas crean una fila con las dos columnas", async () => {
    // La barrera inserta la fila sin confirmarla: los dos pedidos no la ven y
    // se traban al insertar contra su clave primaria.
    const holdInsert = (tx: Transaction) => tx.insert(userPreference).values({ userId });

    await raceThroughBarrier(holdInsert, [
      () =>
        updatePreference(actorFor(userId), { key: "dateFormat", value: "yyyy-MM-dd" }),
      () => updatePreference(actorFor(userId), { key: "timeFormat", value: "12h" }),
    ]);

    expect(await rowOf(userId)).toMatchObject({
      timezone: null,
      timeFormat: "12h",
      dateFormat: "yyyy-MM-dd",
    });
  });
});

describe("updatePreference: la auditoría (criterio 13)", () => {
  it("cada clave deja su registro con el valor anterior crudo, nulo si no había, y el nuevo", async () => {
    await updatePreference(actorFor(userId), { key: "timezone", value: "Asia/Tokyo" });
    await updatePreference(actorFor(userId), { key: "timeFormat", value: "12h" });
    await updatePreference(actorFor(userId), { key: "dateFormat", value: "yyyy-MM-dd" });
    await updatePreference(actorFor(userId), { key: "timezone", value: "Europe/Madrid" });

    const expected = (previousValue: unknown, nextValue: unknown) => ({
      workspaceId,
      actorId: userId,
      action: "profile.updatePreference",
      previousValue,
      nextValue,
    });
    const rows = await auditOf(userId);
    expect(rows).toHaveLength(4);
    expect(rows).toEqual(
      expect.arrayContaining([
        expected({ timezone: null }, { timezone: "Asia/Tokyo" }),
        expected({ timeFormat: null }, { timeFormat: "12h" }),
        expected({ dateFormat: null }, { dateFormat: "yyyy-MM-dd" }),
        expected({ timezone: "Asia/Tokyo" }, { timezone: "Europe/Madrid" }),
      ]),
    );
  });

  it("el registro va a la persona que actúa, con su id como entidad", async () => {
    const other = await seedMember(workspaceId, "member");
    await updatePreference(actorFor(other), { key: "timeFormat", value: "12h" });
    expect(await auditOf(userId)).toEqual([]);
    expect(await auditOf(other)).toHaveLength(1);
    expect(await rowOf(userId)).toBeUndefined();
  });
});

describe("getProfileView (criterios 15 y 17)", () => {
  /** El sábado 3/10/2026 a las 22:00 en Buenos Aires: ya domingo en Tokio. */
  const now = new Date("2026-10-04T01:00:00Z");
  const user = {
    name: "Ana María López",
    email: "ana@empresa.com",
    image: "https://lh3.googleusercontent.com/a/foto",
  };

  it("con los predeterminados elige la opción que el entorno lista para Buenos Aires", async () => {
    const view = getProfileView(await contextFor(userId), user, now);

    expect(view.preferences).toEqual(PREFERENCE_DEFAULTS);
    expect(view.timezoneOption).toBe(fallbackOption);
    expect(view.timezoneOption).not.toBe(fallbackZone);
    expect(view.options.timezones.map((zone) => zone.value)).toEqual(
      supportedTimeZones(),
    );
  });

  it("cada zona trae su desplazamiento en ese instante", async () => {
    const view = getProfileView(await contextFor(userId), user, now);
    const byZone = new Map(
      view.options.timezones.map((zone) => [zone.value, zone.example]),
    );

    expect(byZone.get(fallbackOption)).toBe("UTC−03:00");
    // CLDR lista Katmandú con su nombre viejo: se busca por la forma canónica.
    expect(byZone.get(canonicalTimeZone("Asia/Kathmandu") ?? "")).toBe("UTC+05:45");
    expect(
      view.options.timezones.every(
        (zone) => zone.example === utcOffsetLabel(zone.value, now),
      ),
    ).toBe(true);
  });

  it("con una zona guardada de la lista, la elige", async () => {
    await seedPreferences(userId, { timezone: "Asia/Tokyo" });
    const view = getProfileView(await contextFor(userId), user, now);
    expect(view.timezoneOption).toBe("Asia/Tokyo");
    expect(view.preferences.timezone).toBe("Asia/Tokyo");
  });

  it("con un alias guardado, elige la opción de su forma canónica y no lo suma a la lista", async () => {
    await seedPreferences(userId, { timezone: "US/Eastern" });
    const view = getProfileView(await contextFor(userId), user, now);
    expect(view.preferences.timezone).toBe("US/Eastern");
    expect(view.timezoneOption).toBe("America/New_York");
    expect(view.options.timezones.map((zone) => zone.value)).toEqual(
      supportedTimeZones(),
    );
  });

  it("con una zona guardada que el entorno no lista, la suma en orden y la elige", async () => {
    await seedPreferences(userId, { timezone: unlistedZone });
    const view = getProfileView(await contextFor(userId), user, now);
    const values = view.options.timezones.map((zone) => zone.value);

    expect(view.timezoneOption).toBe(unlistedZone);
    expect(values).toEqual([...supportedTimeZones(), unlistedZone].sort());
    expect(
      view.options.timezones.find((zone) => zone.value === unlistedZone)?.example,
    ).toBe("UTC−03:00");
  });

  it("los formatos de hora traen de ejemplo las 13:00", async () => {
    const view = getProfileView(await contextFor(userId), user, now);
    expect(view.options.timeFormats).toEqual([
      { value: "24h", example: "13:00" },
      { value: "12h", example: "1:00 PM" },
    ]);
    expect(view.options.timeFormats.map((format) => format.value)).toEqual(TIME_FORMATS);
  });

  it("los formatos de fecha traen de ejemplo hoy en la zona de la persona, con año", async () => {
    const inBuenosAires = getProfileView(await contextFor(userId), user, now);
    expect(inBuenosAires.options.dateFormats).toEqual([
      { value: "dd/MM/yyyy", example: "03/10/2026" },
      { value: "dd-MM-yyyy", example: "03-10-2026" },
      { value: "yyyy-MM-dd", example: "2026-10-03" },
      { value: "MM/dd/yyyy", example: "10/03/2026" },
    ]);

    await seedPreferences(userId, { timezone: "Asia/Tokyo" });
    const inTokyo = getProfileView(await contextFor(userId), user, now);
    expect(inTokyo.options.dateFormats.map((format) => format.example)).toEqual([
      "04/10/2026",
      "04-10-2026",
      "2026-10-04",
      "10/04/2026",
    ]);
    expect(inTokyo.options.dateFormats.map((format) => format.value)).toEqual(
      DATE_FORMATS,
    );
  });

  it("la identidad trae la foto y las iniciales", async () => {
    const view = getProfileView(await contextFor(userId), user, now);
    expect(view.identity).toEqual({ ...user, initials: "AM" });
    const noPhoto = getProfileView(
      await contextFor(userId),
      { name: "", email: "zoe@empresa.com", image: null },
      now,
    );
    expect(noPhoto.identity).toEqual({
      name: "",
      email: "zoe@empresa.com",
      image: null,
      initials: "Z",
    });
  });

  it("el primer día de la semana es el de la membresía (PF-01)", async () => {
    await setMembership(userId, { weekStart: 0 });
    expect(getProfileView(await contextFor(userId), user, now).weekStart).toBe(0);
    await setMembership(userId, { weekStart: 6 });
    expect(getProfileView(await contextFor(userId), user, now).weekStart).toBe(6);
  });

  it("canEdit es verdadero con la membresía activa y falso con una inactive o invited (PF-46)", async () => {
    expect(getProfileView(await contextFor(userId), user, now).canEdit).toBe(true);
    for (const status of ["inactive", "invited"] as const) {
      await setMembership(userId, { status });
      const view = getProfileView(await contextFor(userId), user, now);
      expect([status, view.canEdit]).toEqual([status, false]);
      // Los valores se siguen viendo.
      expect(view.timezoneOption).toBe(fallbackOption);
    }
  });
});
