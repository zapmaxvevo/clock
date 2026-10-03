import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/server/db";
import { membership, workspace } from "@/server/db/schema";
import {
  buenosAires,
  seedTimeEntry,
  seedUser,
  seedWorkspace,
  type SeededWorkspace,
} from "@/test/factories";
import { allTimeEntries } from "@/test/queries";

import { timeEntryMessages, type StartTimerInput } from "./schema";

/**
 * La capa de actions no se puede ejecutar como está: `next/headers` y
 * `next/cache` exigen contexto de petición, y `auth.api.getSession` necesita
 * una cookie firmada. Se reemplazan esas tres puertas y el resto corre de
 * verdad: `requireSession`, `ensureWorkspaceContext`, `can()`, el service y la
 * base. Lo que se verifica acá es lo que ningún otro test alcanza —la
 * traducción de errores a `ActionResult`, qué permiso pide cada action, y que
 * la revalidación ocurra también en el camino de error—.
 *
 * De la entrada manual, además: que la action le pase al service el workspace
 * de la sesión —su zona horaria y su fecha de creación—, que el piso del
 * workspace se compare por día local y no por instante, y que una fecha u
 * hora imposible salga como `validation` y no como `unexpected`.
 */
const mocks = vi.hoisted(() => ({
  sessionUser: null as null | { id: string; email: string },
  revalidated: [] as string[],
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
  revalidatePath: (path: string) => {
    mocks.revalidated.push(path);
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

const ownerEmail = "owner@empresa.com";
const madrid = "Europe/Madrid";

async function signIn(email = ownerEmail): Promise<string> {
  const id = await seedUser(email);
  mocks.sessionUser = { id, email };
  return id;
}

/**
 * Workspace con la zona y la fecha de creación que el caso necesita, y una
 * sesión adentro. La membresía la crea `ensureWorkspaceContext` al entrar.
 */
async function signInOn(options: { timezone?: string; createdAt?: string } = {}) {
  const seeded = await seedWorkspace(options.timezone ?? buenosAires);
  if (options.createdAt !== undefined) {
    await db
      .update(workspace)
      .set({ createdAt: new Date(options.createdAt) })
      .where(eq(workspace.id, seeded.workspaceId));
  }
  const email = `${randomUUID()}@empresa.com`;
  mocks.sessionUser = { id: await seedUser(email), email };
  return seeded;
}

function sessionUserId(): string {
  if (mocks.sessionUser === null) {
    throw new Error("El test no abrió sesión.");
  }
  return mocks.sessionUser.id;
}

beforeEach(() => {
  mocks.sessionUser = null;
  mocks.revalidated.length = 0;
  mocks.redirects.length = 0;
});

afterEach(() => {
  mocks.sessionUser = null;
});

describe("sin sesión", () => {
  it("manda al login en vez de ejecutar la action", async () => {
    await expect(actions.startTimer({ id: randomUUID() })).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(mocks.redirects).toEqual(["/login"]);
  });

  it("no revalida nada, porque no llegó a entrar al recorrido", async () => {
    await expect(actions.startTimer({ id: randomUUID() })).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(mocks.revalidated).toEqual([]);
  });
});

describe("traducción del error al resultado tipado", () => {
  it("un error de Zod sale como validation con el mensaje del issue", async () => {
    await signIn();

    const result = await actions.startTimer({
      id: randomUUID(),
      description: "a".repeat(3001),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("validation");
    expect(result.message).toBe("La descripción no puede superar los 3000 caracteres.");
  });

  it("un error de dominio conserva su código y su mensaje", async () => {
    await signIn();

    const result = await actions.stopTimer({
      id: "11111111-1111-4111-8111-111111111111",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("not_found");
    expect(result.message).toBe("Esa entrada ya no existe.");
  });

  it("la falta de permiso sale con el mensaje neutro y no con el de entrada ajena", async () => {
    const userId = await signIn();
    await actions.startTimer({ id: randomUUID() });
    await db
      .update(membership)
      .set({ status: "inactive" })
      .where(eq(membership.userId, userId));

    const result = await actions.startTimer({ id: randomUUID() });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("forbidden");
    expect(result.message).toBe("No tenés permiso para hacer esto.");
  });
});

describe("la revalidación corre siempre", () => {
  it("después de una mutación exitosa", async () => {
    await signIn();

    const result = await actions.startTimer({ id: randomUUID(), description: "algo" });

    expect(result.ok).toBe(true);
    expect(mocks.revalidated).toContain("/");
  });

  it("después de un error de dominio: es lo que resincroniza la pestaña vieja", async () => {
    await signIn();

    const result = await actions.deleteEntry({
      id: "11111111-1111-4111-8111-111111111111",
    });

    expect(result.ok).toBe(false);
    expect(mocks.revalidated).toContain("/");
  });

  it("después de un error de validación", async () => {
    await signIn();

    const result = await actions.updateDescription({
      id: "11111111-1111-4111-8111-111111111111",
      description: "a".repeat(3001),
    });

    expect(result.ok).toBe(false);
    expect(mocks.revalidated).toContain("/");
  });

  it("después de un rechazo de la entrada manual: la pestaña vuelve a ver el timer", async () => {
    await signIn();
    await actions.startTimer({ id: randomUUID() });
    mocks.revalidated.length = 0;

    const result = await actions.createManualEntry({
      date: "2026-10-01",
      start: "09:00",
      end: "10:00",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("timer_running");
    expect(mocks.revalidated).toContain("/");
  });
});

describe("cada action exige su permiso antes de tocar nada", () => {
  it("las cuatro del tracker y la manual niegan con la membresía desactivada", async () => {
    const userId = await signIn();
    await actions.startTimer({ id: randomUUID() });
    await db
      .update(membership)
      .set({ status: "inactive" })
      .where(eq(membership.userId, userId));

    const id = "11111111-1111-4111-8111-111111111111";
    const results = [
      await actions.startTimer({ id: randomUUID() }),
      await actions.stopTimer({ id }),
      await actions.updateDescription({ id, description: "x" }),
      await actions.deleteEntry({ id }),
      await actions.createManualEntry({
        date: "2026-10-01",
        start: "09:00",
        end: "10:00",
      }),
    ];

    for (const result of results) {
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.code).toBe("forbidden");
    }
  });

  it("las dos de horas niegan con el mensaje neutro antes de buscar la fila", async () => {
    const userId = await signIn();
    await actions.startTimer({ id: randomUUID() });
    await db
      .update(membership)
      .set({ status: "inactive" })
      .where(eq(membership.userId, userId));

    // Con un id que no existe: sin el permiso de la action, el service
    // respondería not_found.
    const id = "11111111-1111-4111-8111-111111111111";
    const results = [
      await actions.updateEntryTimes({
        id,
        date: "2026-10-01",
        start: "09:00",
        end: "10:00",
      }),
      await actions.updateRunningStart({ id, date: "2026-10-01", start: "09:00" }),
    ];

    for (const result of results) {
      expect(result).toEqual({
        ok: false,
        code: "forbidden",
        message: timeEntryMessages.forbidden,
      });
    }
  });
});

describe("el id que elige el cliente para «Iniciar»", () => {
  it.each([
    ["sin id", {}],
    ["con un texto que no es uuid", { id: "no-es-uuid" }],
    ["con el uuid nulo", { id: "00000000-0000-0000-0000-000000000000" }],
    ["con un uuid v7", { id: "01890a5d-ac96-774b-bcce-b302099a8057" }],
  ])("%s responde validation, no escribe y revalida", async (_, input) => {
    await signIn();

    // Lo que puede mandar un cliente que no respeta el tipo.
    const result = await actions.startTimer(input as StartTimerInput);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("validation");
    expect(mocks.revalidated).toContain("/");
    expect(await allTimeEntries()).toHaveLength(0);
  });

  /** El dueño de la entrada ajena, armado después de que la sesión entró. */
  const foreignOwners = {
    "otra persona del workspace": (seeded: SeededWorkspace) => Promise.resolve(seeded),
    "otra persona de otro workspace": () => seedWorkspace(buenosAires),
    // Mismo usuario: lo único que la deja afuera es el filtro por workspace.
    "la misma persona en otro workspace": async () => {
      const other = await seedWorkspace(buenosAires);
      const userId = sessionUserId();
      await db
        .insert(membership)
        .values({ workspaceId: other.workspaceId, userId, role: "member" });
      return { workspaceId: other.workspaceId, ownerId: userId };
    },
  };

  it.each(Object.entries(foreignOwners))(
    "el id de una entrada de %s responde forbidden con el mensaje neutro",
    async (_, ownerOf) => {
      const seeded = await signInOn();
      const mine = await actions.startTimer({ id: randomUUID(), description: "mío" });
      expect(mine.ok).toBe(true);
      const foreignOwner = await ownerOf(seeded);
      const foreign = await seedTimeEntry({
        workspaceId: foreignOwner.workspaceId,
        userId: foreignOwner.ownerId,
        startedAt: "2026-10-02T09:00:00Z",
        endedAt: "2026-10-02T10:00:00Z",
      });
      const rows = await allTimeEntries();

      const result = await actions.startTimer({ id: foreign.id, description: "ajeno" });

      expect(result).toEqual({
        ok: false,
        code: "forbidden",
        message: timeEntryMessages.forbidden,
      });
      expect(await allTimeEntries()).toEqual(rows);
    },
  );
});

describe("la action convierte con el workspace de la sesión", () => {
  it("usa su zona horaria y no la del proceso", async () => {
    const seeded = await signInOn({
      timezone: madrid,
      createdAt: "2020-01-01T00:00:00Z",
    });

    const result = await actions.createManualEntry({
      description: "reunión",
      date: "2026-07-01",
      start: "12:00",
      end: "13:30",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // El 1/7/2026 Madrid está en +02:00.
    expect(result.data.created.startedAt).toBe("2026-07-01T10:00:00.000Z");
    expect(result.data.created.endedAt).toBe("2026-07-01T11:30:00.000Z");
    expect(result.data.created.startLabel).toBe("12:00");

    const rows = await allTimeEntries();
    expect(rows).toHaveLength(1);
    expect(rows[0].workspaceId).toBe(seeded.workspaceId);
    expect(rows[0].userId).toBe(mocks.sessionUser?.id);
  });
});

describe("el piso del workspace se mide por día local", () => {
  /**
   * Las 23:00 del 1 de setiembre en Buenos Aires, que en UTC ya son del 2. El
   * día local de creación es el 1: con una comparación por instante, o por día
   * UTC, los dos casos que acá se aceptan quedarían rechazados.
   */
  const createdAt = "2026-09-02T02:00:00Z";

  it("acepta el mismo día aunque la hora sea anterior a la creación", async () => {
    await signInOn({ createdAt });

    const result = await actions.createManualEntry({
      description: "temprano",
      date: "2026-09-01",
      start: "10:00",
      end: "11:00",
    });

    // Instante anterior a la creación y día UTC anterior; día local, el mismo.
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.created.startedAt).toBe("2026-09-01T13:00:00.000Z");
    expect(await allTimeEntries()).toHaveLength(1);
  });

  it("acepta ese día entero, desde su primer minuto", async () => {
    await signInOn({ createdAt });

    const result = await actions.createManualEntry({
      date: "2026-09-01",
      start: "00:00",
      end: "00:01",
    });

    // El otro de los dos: el primer minuto del día de creación, casi un día
    // entero antes de ese instante y todavía del lado aceptado.
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.created.startedAt).toBe("2026-09-01T03:00:00.000Z");
    expect(result.data.created.durationSeconds).toBe(60);
  });

  it("rechaza el día anterior hasta su último minuto y no deja fila", async () => {
    await signInOn({ createdAt });

    const result = await actions.createManualEntry({
      date: "2026-08-31",
      start: "23:00",
      end: "23:59",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("validation");
    expect(result.message).toBe(timeEntryMessages.beforeWorkspace);
    expect(await allTimeEntries()).toEqual([]);
  });
});

describe("la hora de pared del cambio de horario", () => {
  // El 29/3/2026 Madrid salta de las 02:00 a las 03:00; el 25/10 las 02:30
  // ocurren dos veces.
  const enMadrid = { timezone: madrid, createdAt: "2020-01-01T00:00:00Z" };

  it.each([
    ["en el inicio", { date: "2026-03-29", start: "02:30", end: "04:00" }],
    ["en el fin", { date: "2026-03-29", start: "01:30", end: "02:30" }],
  ])(
    "la hora que no existe %s sale como validation y no deja fila",
    async (_, values) => {
      await signInOn(enMadrid);

      const result = await actions.createManualEntry(values);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      // El error es de la persona, no una falla del servidor: con `unexpected`
      // la interfaz ofrecería «Reintentar» para algo que nunca va a funcionar.
      expect(result.code).toBe("validation");
      expect(result.message).toBe(timeEntryMessages.nonexistentClock);
      expect(await allTimeEntries()).toEqual([]);
    },
  );

  it("la hora ambigua se acepta y se guarda con el segundo instante", async () => {
    await signInOn(enMadrid);

    const result = await actions.createManualEntry({
      date: "2026-10-25",
      start: "02:30",
      end: "04:00",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.created.startedAt).toBe("2026-10-25T01:30:00.000Z");
    expect(result.data.created.startLabel).toBe("02:30");
    const rows = await allTimeEntries();
    expect(rows).toHaveLength(1);
    expect(rows[0].startedAt.toISOString()).toBe("2026-10-25T01:30:00.000Z");
  });
});

describe("la forma canónica se revalida en el servidor", () => {
  it.each([
    ["un día que no existe", { date: "2026-02-30" }, timeEntryMessages.invalidDate],
    ["una fecha con otro formato", { date: "01/09/2026" }, timeEntryMessages.invalidDate],
    ["una hora sin normalizar", { start: "9:45" }, timeEntryMessages.invalidClock],
    ["una hora de 24 h", { end: "24:00" }, timeEntryMessages.invalidClock],
    ["un texto tolerante", { start: "1h30m" }, timeEntryMessages.invalidClock],
  ])("%s sale como validation y no deja fila", async (_, patch, message) => {
    await signInOn();

    const result = await actions.createManualEntry({
      date: "2026-09-01",
      start: "08:00",
      end: "09:00",
      ...patch,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("validation");
    expect(result.message).toBe(message);
    expect(await allTimeEntries()).toEqual([]);
  });
});

describe("lo que pasa la forma pero la base no puede guardar", () => {
  it("una descripción con el carácter nulo sale como validation", async () => {
    // Un workspace viejo: sin el control del esquema, la entrada llegaría a la base.
    await signInOn({ createdAt: "2020-01-01T00:00:00Z" });

    const result = await actions.createManualEntry({
      description: "antes\u0000después",
      date: "2026-09-01",
      start: "08:00",
      end: "09:00",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("validation");
    expect(result.message).toBe(timeEntryMessages.descriptionNullCharacter);
    expect(await allTimeEntries()).toEqual([]);
  });

  it("el 9999-12-31 a la noche en Buenos Aires ya es el año 10000 en UTC", async () => {
    await signInOn();

    const result = await actions.createManualEntry({
      date: "9999-12-31",
      start: "23:00",
      end: "23:30",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // La fecha es de la persona y no se puede guardar: con `unexpected` la
    // interfaz ofrecería «Reintentar» para algo que nunca va a funcionar.
    expect(result.code).toBe("validation");
    expect(result.message).toBe(timeEntryMessages.invalidDate);
    expect(await allTimeEntries()).toEqual([]);
  });
});

describe("updateEntryTimes y updateRunningStart", () => {
  const longAgo = "2020-01-01T00:00:00Z";
  const unknownId = "11111111-1111-4111-8111-111111111111";

  /** Una entrada cerrada de la persona de la sesión, el 1/10 de 08:00 a 09:00. */
  function seedOwnClosed(seeded: SeededWorkspace) {
    return seedTimeEntry({
      workspaceId: seeded.workspaceId,
      userId: sessionUserId(),
      startedAt: "2026-10-01T11:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
    });
  }

  /** El timer activo de la persona de la sesión, arrancado el 2/10 a las 08:00. */
  function seedOwnRunning(seeded: SeededWorkspace) {
    return seedTimeEntry({
      workspaceId: seeded.workspaceId,
      userId: sessionUserId(),
      startedAt: "2026-10-02T11:00:00Z",
    });
  }

  it("guardan con la zona del workspace de la sesión y revalidan", async () => {
    const seeded = await signInOn({ timezone: madrid, createdAt: longAgo });
    const closed = await seedOwnClosed(seeded);
    const running = await seedOwnRunning(seeded);

    const times = await actions.updateEntryTimes({
      id: closed.id,
      date: "2026-07-01",
      start: "12:00",
      end: "13:30",
    });
    expect(mocks.revalidated).toEqual(["/"]);
    const start = await actions.updateRunningStart({
      id: running.id,
      date: "2026-10-02",
      start: "09:00",
    });

    expect(times.ok && times.data.entry.startedAt).toBe("2026-07-01T10:00:00.000Z");
    expect(start.ok && start.data.running.startedAt).toBe("2026-10-02T07:00:00.000Z");
    expect(mocks.revalidated).toEqual(["/", "/"]);
  });

  it("un error de Zod del trío sale como validation con el mensaje del issue", async () => {
    await signInOn({ createdAt: longAgo });

    const results = [
      [
        timeEntryMessages.invalidClock,
        await actions.updateEntryTimes({
          id: unknownId,
          date: "2026-10-01",
          start: "8:00",
          end: "10:00",
        }),
      ],
      [
        timeEntryMessages.invalidDate,
        await actions.updateEntryTimes({
          id: unknownId,
          date: "2026-02-30",
          start: "08:00",
          end: "10:00",
        }),
      ],
      [
        timeEntryMessages.invalidClock,
        await actions.updateRunningStart({
          id: unknownId,
          date: "2026-10-01",
          start: "0800",
        }),
      ],
      [
        timeEntryMessages.invalidDate,
        await actions.updateRunningStart({
          id: unknownId,
          date: "01/10/2026",
          start: "08:00",
        }),
      ],
    ] as const;

    for (const [message, result] of results) {
      expect(result).toEqual({ ok: false, code: "validation", message });
    }
    expect(mocks.revalidated).toEqual(["/", "/", "/", "/"]);
  });

  it("un error de dominio conserva su código y su mensaje, y revalida", async () => {
    const seeded = await signInOn({ createdAt: longAgo });
    const closed = await seedOwnClosed(seeded);
    const running = await seedOwnRunning(seeded);

    const tooShort = await actions.updateEntryTimes({
      id: closed.id,
      date: "2026-10-01",
      start: "10:00",
      end: "10:00",
    });
    const onRunning = await actions.updateEntryTimes({
      id: running.id,
      date: "2026-10-01",
      start: "09:00",
      end: "10:00",
    });
    const missing = await actions.updateRunningStart({
      id: unknownId,
      date: "2026-10-02",
      start: "07:00",
    });

    expect(tooShort).toEqual({
      ok: false,
      code: "validation",
      message: timeEntryMessages.tooShort,
    });
    expect(onRunning).toEqual({
      ok: false,
      code: "timer_running",
      message: timeEntryMessages.runningEntryTimes,
    });
    expect(missing).toEqual({
      ok: false,
      code: "not_found",
      message: timeEntryMessages.notFound,
    });
    expect(mocks.revalidated).toEqual(["/", "/", "/"]);
  });

  it("el piso es el del workspace de la sesión", async () => {
    const seeded = await signInOn({ createdAt: "2026-09-01T12:00:00Z" });
    const closed = await seedOwnClosed(seeded);
    const running = await seedOwnRunning(seeded);

    const times = await actions.updateEntryTimes({
      id: closed.id,
      date: "2026-08-31",
      start: "08:00",
      end: "09:00",
    });
    const start = await actions.updateRunningStart({
      id: running.id,
      date: "2026-08-31",
      start: "08:00",
    });

    for (const result of [times, start]) {
      expect(result).toEqual({
        ok: false,
        code: "validation",
        message: timeEntryMessages.beforeWorkspace,
      });
    }
  });

  it("TT-41: el timer que otra pestaña detuvo llega como already_stopped tipado", async () => {
    const seeded = await signInOn({ createdAt: longAgo });
    const running = await seedOwnRunning(seeded);
    await actions.stopTimer({ id: running.id });
    mocks.revalidated.length = 0;

    const result = await actions.updateRunningStart({
      id: running.id,
      date: "2026-10-02",
      start: "07:00",
    });

    expect(result).toEqual({
      ok: false,
      code: "already_stopped",
      message: timeEntryMessages.alreadyStopped,
    });
    expect(mocks.revalidated).toEqual(["/"]);
    const rows = await allTimeEntries();
    expect(rows[0].startedAt.toISOString()).toBe("2026-10-02T11:00:00.000Z");
  });

  it("TT-79, TT-80: la entrada ajena y la que no existe, con su texto", async () => {
    const seeded = await signInOn({ createdAt: longAgo });
    const other = await seedUser();
    await db
      .insert(membership)
      .values({ workspaceId: seeded.workspaceId, userId: other, role: "member" });
    const foreign = await seedTimeEntry({
      workspaceId: seeded.workspaceId,
      userId: other,
      startedAt: "2026-10-01T11:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
    });

    const forbidden = await actions.updateEntryTimes({
      id: foreign.id,
      date: "2026-10-01",
      start: "09:00",
      end: "10:00",
    });
    const missing = await actions.updateEntryTimes({
      id: unknownId,
      date: "2026-10-01",
      start: "09:00",
      end: "10:00",
    });

    expect(forbidden).toEqual({
      ok: false,
      code: "forbidden",
      message: timeEntryMessages.forbiddenOtherOwner,
    });
    expect(missing).toEqual({
      ok: false,
      code: "not_found",
      message: timeEntryMessages.notFound,
    });
  });

  it.each(["inactive", "invited"] as const)(
    "TT-92: con la membresía %s responden el mensaje neutro y no escriben",
    async (status) => {
      const seeded = await signInOn({ createdAt: longAgo });
      const closed = await seedOwnClosed(seeded);
      const running = await seedOwnRunning(seeded);
      // La primera action crea la membresía; recién ahí se le cambia el estado.
      await actions.updateDescription({ id: closed.id, description: "" });
      await db
        .update(membership)
        .set({ status })
        .where(eq(membership.userId, sessionUserId()));
      mocks.revalidated.length = 0;

      const results = [
        await actions.updateEntryTimes({
          id: closed.id,
          date: "2026-10-01",
          start: "09:00",
          end: "10:00",
        }),
        await actions.updateRunningStart({
          id: running.id,
          date: "2026-10-02",
          start: "07:00",
        }),
      ];

      for (const result of results) {
        expect(result).toEqual({
          ok: false,
          code: "forbidden",
          message: timeEntryMessages.forbidden,
        });
      }
      expect(mocks.revalidated).toEqual(["/", "/"]);
      const rows = await allTimeEntries();
      expect(rows.map((row) => row.startedAt.toISOString())).toEqual([
        "2026-10-01T11:00:00.000Z",
        "2026-10-02T11:00:00.000Z",
      ]);
    },
  );
});
