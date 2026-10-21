import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { CHECK_VIOLATION, constraintOf } from "@/server/db/constraint-error";
import { user, userPreference } from "@/server/db/schema";
import { DATE_FORMATS, TIME_FORMATS } from "@/server/time";
import { seedUser } from "@/test/factories";
import { rejection } from "@/test/queries";

import { NAME_MAX, THEMES } from "./schema";

/**
 * La tabla, escrita de forma directa y sin pasar por el service: lo que tiene
 * que aceptar o rechazar aunque el service se equivoque (criterio 1).
 */

async function violatedCheck(work: Promise<unknown>): Promise<string | null> {
  return constraintOf(await rejection(work), CHECK_VIOLATION);
}

async function rowOf(userId: string) {
  const rows = await db
    .select()
    .from(userPreference)
    .where(eq(userPreference.userId, userId));
  return rows.at(0);
}

let userId: string;

beforeEach(async () => {
  userId = await seedUser();
});

describe("user_preference (criterio 1)", () => {
  it("acepta una fila con las tres columnas en nulo", async () => {
    await db.insert(userPreference).values({ userId });
    expect(await rowOf(userId)).toMatchObject({
      timezone: null,
      timeFormat: null,
      dateFormat: null,
    });
  });

  it("acepta cada valor de TIME_FORMATS y de DATE_FORMATS", async () => {
    for (const timeFormat of TIME_FORMATS) {
      const owner = await seedUser();
      await db.insert(userPreference).values({ userId: owner, timeFormat });
      expect((await rowOf(owner))?.timeFormat).toBe(timeFormat);
    }
    for (const dateFormat of DATE_FORMATS) {
      const owner = await seedUser();
      await db.insert(userPreference).values({ userId: owner, dateFormat });
      expect((await rowOf(owner))?.dateFormat).toBe(dateFormat);
    }
  });

  it("acepta la zona de omisión, que la lista del entorno no nombra", async () => {
    await db
      .insert(userPreference)
      .values({ userId, timezone: "America/Argentina/Buenos_Aires" });
    expect((await rowOf(userId))?.timezone).toBe("America/Argentina/Buenos_Aires");
  });

  it("rechaza un formato de hora fuera de lista", async () => {
    expect(
      await violatedCheck(
        db.insert(userPreference).values({ userId, timeFormat: "25h" }),
      ),
    ).toBe("user_preference_time_format_known");
  });

  it("rechaza un formato de fecha fuera de lista", async () => {
    expect(
      await violatedCheck(
        db.insert(userPreference).values({ userId, dateFormat: "d/M/y" }),
      ),
    ).toBe("user_preference_date_format_known");
  });

  it("rechaza una zona vacía y una de más de 64 caracteres", async () => {
    expect(
      await violatedCheck(db.insert(userPreference).values({ userId, timezone: "" })),
    ).toBe("user_preference_timezone_len");
    expect(
      await violatedCheck(
        db.insert(userPreference).values({ userId, timezone: "x".repeat(65) }),
      ),
    ).toBe("user_preference_timezone_len");
  });

  it("acepta el nombre y el tema en nulo", async () => {
    await db.insert(userPreference).values({ userId });
    expect(await rowOf(userId)).toMatchObject({ displayName: null, theme: null });
  });

  it("acepta cada valor de THEMES", async () => {
    for (const theme of THEMES) {
      const owner = await seedUser();
      await db.insert(userPreference).values({ userId: owner, theme });
      expect((await rowOf(owner))?.theme).toBe(theme);
    }
  });

  it("acepta un nombre de 1 y uno de 100 caracteres, contados como caracteres", async () => {
    for (const displayName of ["A", "x".repeat(NAME_MAX), "ñ".repeat(NAME_MAX)]) {
      const owner = await seedUser();
      await db.insert(userPreference).values({ userId: owner, displayName });
      expect((await rowOf(owner))?.displayName).toBe(displayName);
    }
  });

  it("rechaza un nombre vacío y uno de 101 caracteres", async () => {
    for (const displayName of ["", "x".repeat(NAME_MAX + 1)]) {
      expect(
        await violatedCheck(db.insert(userPreference).values({ userId, displayName })),
      ).toBe("user_preference_display_name_len");
    }
  });

  it("rechaza un tema fuera de lista, también con otras mayúsculas", async () => {
    for (const theme of ["Dark", "auto"]) {
      expect(
        await violatedCheck(db.insert(userPreference).values({ userId, theme })),
      ).toBe("user_preference_theme_known");
    }
  });

  it("borrar el usuario borra su fila", async () => {
    const other = await seedUser();
    await db.insert(userPreference).values({ userId, timeFormat: "12h" });
    await db.insert(userPreference).values({ userId: other, timeFormat: "12h" });

    await db.delete(user).where(eq(user.id, userId));

    expect(await rowOf(userId)).toBeUndefined();
    expect(await rowOf(other)).toBeDefined();
  });
});
