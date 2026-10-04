import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { CHECK_VIOLATION, constraintOf } from "@/server/db/constraint-error";
import { user, userPreference } from "@/server/db/schema";
import { DATE_FORMATS, TIME_FORMATS } from "@/server/time";
import { seedUser } from "@/test/factories";

/**
 * La tabla, escrita de forma directa y sin pasar por el service: lo que tiene
 * que aceptar o rechazar aunque el service se equivoque (criterio 1).
 */

/** El error de una escritura que la base tiene que rechazar. */
async function rejection(work: Promise<unknown>): Promise<unknown> {
  try {
    await work;
  } catch (error) {
    return error;
  }
  throw new Error("La base aceptó la escritura.");
}

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

  it("borrar el usuario borra su fila", async () => {
    const other = await seedUser();
    await db.insert(userPreference).values({ userId, timeFormat: "12h" });
    await db.insert(userPreference).values({ userId: other, timeFormat: "12h" });

    await db.delete(user).where(eq(user.id, userId));

    expect(await rowOf(userId)).toBeUndefined();
    expect(await rowOf(other)).toBeDefined();
  });
});
