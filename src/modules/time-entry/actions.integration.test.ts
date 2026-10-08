import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/server/db";
import { membership, workspace } from "@/server/db/schema";
import {
  buenosAires,
  seedMember,
  seedPreferences,
  seedProject,
  seedTag,
  seedTask,
  seedTimeEntry,
  seedUser,
  seedWorkspace,
  type SeededWorkspace,
} from "@/test/factories";
import { allTimeEntries, timeEntryById } from "@/test/queries";

import { projectMessages } from "@/modules/project/schema";

import { timeEntryRepository } from "./repository";
import { getCalendarState, trackerWorkspaceOf } from "./service";
import {
  timeEntryMessages,
  type BulkEditEntriesInput,
  type CreateManualEntryInput,
  type StartTimerInput,
  type UpdateEntryChanges,
} from "./schema";

/**
 * La capa de actions no se puede ejecutar como está: `next/headers` y
 * `next/cache` exigen contexto de petición, y `auth.api.getSession` necesita
 * una cookie firmada. Se reemplazan esas tres puertas y el resto corre de
 * verdad: `requireSession`, `ensureWorkspaceContext`, `can()`, el service y la
 * base. Lo que se verifica acá es lo que ningún otro test alcanza —la
 * traducción de errores a `ActionResult`, qué permiso pide cada action, y que
 * la revalidación ocurra también en el camino de error—.
 *
 * De la entrada manual, además: que la action le pase al service la zona de
 * la persona de la sesión, que el piso se compare por día local y no por
 * instante, que la creación del workspace no sea un piso, y que una fecha u
 * hora imposible salga como `validation` y no como `unexpected`.
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
const { requireSession } = await import("@/server/session");

/** Lo que revalidan `calls` llamadas a actions del módulo: las tres pantallas cada una (§4.11 del 13). */
function revalidatedFor(calls: number): string[] {
  return Array.from({ length: calls }, () => ["/", "/calendario", "/planilla"]).flat();
}

const ownerEmail = "owner@empresa.com";
const madrid = "Europe/Madrid";

async function signIn(email = ownerEmail): Promise<string> {
  const id = await seedUser(email);
  mocks.sessionUser = { id, email };
  return id;
}

/**
 * Workspace, creado ahora o en la fecha que el caso pida, y una sesión
 * adentro, de una persona con la zona del caso (`seedPreferences`) y su
 * membresía activa de `member`: con `time_entry_membership_fk`, sus entradas
 * no se siembran sin ella.
 */
async function signInOn(
  options: {
    personTimezone?: string;
    workspaceTimezone?: string;
    createdAt?: string;
  } = {},
) {
  const seeded = await seedWorkspace(options.workspaceTimezone ?? buenosAires);
  if (options.createdAt !== undefined) {
    await db
      .update(workspace)
      .set({ createdAt: new Date(options.createdAt) })
      .where(eq(workspace.id, seeded.workspaceId));
  }
  const email = `${randomUUID()}@empresa.com`;
  const id = await seedUser(email);
  await db
    .insert(membership)
    .values({ workspaceId: seeded.workspaceId, userId: id, role: "member" });
  if (options.personTimezone !== undefined) {
    await seedPreferences(id, { timezone: options.personTimezone });
  }
  mocks.sessionUser = { id, email };
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

  it("después de un rechazo de dominio de la entrada manual", async () => {
    await signIn();

    const result = await actions.createManualEntry({
      id: randomUUID(),
      date: "2026-10-01",
      start: "09:00",
      end: "09:00",
    });

    expect(result).toEqual({
      ok: false,
      code: "validation",
      message: timeEntryMessages.tooShort,
    });
    expect(mocks.revalidated).toContain("/");
  });

  // Cada una con un pedido que no pasa su esquema: la revalidación corre igual.
  const rejectedCalls = {
    startTimer: () => actions.startTimer({ id: "no-es-uuid" }),
    stopTimer: () => actions.stopTimer({ id: "no-es-uuid" }),
    updateDescription: () =>
      actions.updateDescription({ id: "no-es-uuid", description: "" }),
    updateEntryProject: () =>
      actions.updateEntryProject({ id: "no-es-uuid", projectId: null, taskId: null }),
    deleteEntry: () => actions.deleteEntry({ id: "no-es-uuid" }),
    createManualEntry: () =>
      actions.createManualEntry({
        id: randomUUID(),
        date: "2026-02-30",
        start: "09:00",
        end: "10:00",
      }),
    updateEntryTimes: () =>
      actions.updateEntryTimes({
        id: "no-es-uuid",
        date: "2026-10-01",
        start: "09:00",
        end: "10:00",
      }),
    updateRunningStart: () =>
      actions.updateRunningStart({
        id: "no-es-uuid",
        date: "2026-10-01",
        start: "09:00",
      }),
    updateEntry: () =>
      actions.updateEntry({ id: "no-es-uuid", changes: { description: "" } }),
    continueEntry: () => actions.continueEntry({ id: "no-es-uuid", sourceId: "x" }),
    duplicateEntry: () => actions.duplicateEntry({ id: "no-es-uuid", sourceId: "x" }),
    discardTimer: () => actions.discardTimer({ id: "no-es-uuid" }),
    bulkEditEntries: () =>
      actions.bulkEditEntries({ ids: [], changes: { description: "" } }),
    bulkDeleteEntries: () => actions.bulkDeleteEntries({ ids: [] }),
    setTimesheetCell: () =>
      actions.setTimesheetCell({
        date: "2026-10-01",
        projectId: null,
        taskId: null,
        minutes: 0,
      }),
    removeTimesheetRow: () =>
      actions.removeTimesheetRow({
        weekStart: "2026-09-28",
        projectId: null,
        taskId: null,
        ids: [],
      }),
  } satisfies Record<keyof typeof actions, () => Promise<{ readonly ok: boolean }>>;

  it.each(Object.entries(rejectedCalls))(
    "%s revalida el rastreador, el calendario y la planilla también con error (§4.7, §4.11 del 13)",
    async (_, call) => {
      await signIn();

      const result = await call();

      expect(result.ok).toBe(false);
      expect(mocks.revalidated).toEqual(revalidatedFor(1));
    },
  );
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
        id: randomUUID(),
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

  it("las de horas y el guardado del diálogo niegan con el mensaje neutro antes de buscar la fila", async () => {
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
      await actions.updateEntry({ id, changes: { description: "x" } }),
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

describe("el id que elige el cliente para el alta manual (slice 2c)", () => {
  const values = { date: "2026-10-01", start: "09:00", end: "10:00" };

  it.each([
    ["sin id", {}],
    ["con un texto que no es uuid", { id: "no-es-uuid" }],
    ["con el uuid nulo", { id: "00000000-0000-0000-0000-000000000000" }],
    ["con un uuid v7", { id: "01890a5d-ac96-774b-bcce-b302099a8057" }],
  ])("%s responde validation, no escribe y revalida", async (_, id) => {
    await signIn();

    // Lo que puede mandar un cliente que no respeta el tipo.
    const result = await actions.createManualEntry({
      ...values,
      ...id,
    } as CreateManualEntryInput);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("validation");
    expect(mocks.revalidated).toEqual(revalidatedFor(1));
    expect(await allTimeEntries()).toHaveLength(0);
  });

  it("el reintento de un alta aplicada responde ok con los mismos datos y no escribe", async () => {
    await signInOn();
    const input = { ...values, id: randomUUID(), description: "reunión" };
    const first = await actions.createManualEntry(input);
    expect(first.ok).toBe(true);
    const rows = await allTimeEntries();

    const retry = await actions.createManualEntry(input);

    expect(retry).toEqual(first);
    expect(mocks.revalidated).toEqual(revalidatedFor(2));
    expect(await allTimeEntries()).toEqual(rows);
  });

  it.each(Object.entries(foreignOwners))(
    "el id de una entrada de %s responde forbidden con el mensaje neutro",
    async (_, ownerOf) => {
      const seeded = await signInOn();
      const mine = await actions.createManualEntry({ ...values, id: randomUUID() });
      expect(mine.ok).toBe(true);
      const foreignOwner = await ownerOf(seeded);
      const foreign = await seedTimeEntry({
        workspaceId: foreignOwner.workspaceId,
        userId: foreignOwner.ownerId,
        startedAt: "2026-10-02T09:00:00Z",
        endedAt: "2026-10-02T10:00:00Z",
      });
      const rows = await allTimeEntries();

      const result = await actions.createManualEntry({ ...values, id: foreign.id });

      expect(result).toEqual({
        ok: false,
        code: "forbidden",
        message: "No tenés permiso para hacer esto.",
      });
      expect(await allTimeEntries()).toEqual(rows);
    },
  );
});

describe("la action convierte con la zona de la persona de la sesión (criterio 7, ADR 0005)", () => {
  it("usa la zona de la persona, y no la del workspace ni la del proceso", async () => {
    const seeded = await signInOn({ personTimezone: madrid });

    const result = await actions.createManualEntry({
      id: randomUUID(),
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

  it("sin zona elegida usa el predeterminado aunque el workspace esté en otra zona (PF-05)", async () => {
    await signInOn({ workspaceTimezone: madrid });

    const result = await actions.createManualEntry({
      id: randomUUID(),
      date: "2026-07-01",
      start: "12:00",
      end: "13:30",
    });

    expect(result.ok && result.data.created.startedAt).toBe("2026-07-01T15:00:00.000Z");
  });

  it("los rótulos de la respuesta salen con los formatos de la persona", async () => {
    await signInOn();
    await seedPreferences(sessionUserId(), { timeFormat: "12h" });

    const result = await actions.createManualEntry({
      id: randomUUID(),
      date: "2026-07-01",
      start: "12:00",
      end: "13:30",
    });

    expect(result.ok && result.data.created).toMatchObject({
      startLabel: "12:00 PM",
      endLabel: "1:30 PM",
      startClock: "12:00",
      endClock: "13:30",
    });
  });
});

describe("el piso se mide por día local", () => {
  it("acepta el 1 de enero de 2000 aunque en UTC todavía sea 1999", async () => {
    await signInOn({ personTimezone: madrid });

    const result = await actions.createManualEntry({
      id: randomUUID(),
      description: "año nuevo",
      date: "2000-01-01",
      start: "00:00",
      end: "00:30",
    });

    // Día local, el del piso; instante y día UTC, el 31 de diciembre.
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.created.startedAt).toBe("1999-12-31T23:00:00.000Z");
    expect(await allTimeEntries()).toHaveLength(1);
  });

  it("rechaza el 31 de diciembre de 1999 hasta su último minuto con el texto del piso, y no deja fila", async () => {
    await signInOn();

    const result = await actions.createManualEntry({
      id: randomUUID(),
      date: "1999-12-31",
      start: "23:00",
      end: "23:59",
    });

    // En Buenos Aires esas horas ya son del 1 de enero en UTC.
    expect(result).toEqual({
      ok: false,
      code: "validation",
      message: "No se pueden cargar horas anteriores al 1 de enero de 2000.",
    });
    expect(await allTimeEntries()).toEqual([]);
  });
});

describe("la creación del workspace no es un piso (fix/piso-fijo)", () => {
  /**
   * El primer login de producción: el workspace nace el miércoles 7 de octubre
   * de 2026 y el lunes 5 ya se tiene que poder cargar.
   */
  const createdAt = "2026-10-07T13:00:00Z";
  const monday = "2026-10-05";
  /** Las 10:00 a 11:00 de ese lunes en Buenos Aires. */
  const mondayInstants = {
    startedAt: "2026-10-05T13:00:00.000Z",
    endedAt: "2026-10-05T14:00:00.000Z",
  };

  /** Una entrada de la persona de la sesión, del día de creación de 10:00 a 11:00. */
  function seedOwnToday(seeded: SeededWorkspace) {
    return seedTimeEntry({
      workspaceId: seeded.workspaceId,
      userId: sessionUserId(),
      startedAt: "2026-10-07T13:00:00Z",
      endedAt: "2026-10-07T14:00:00Z",
    });
  }

  async function instantsOf(id: string) {
    const row = await timeEntryById(id);
    return {
      startedAt: row?.startedAt.toISOString(),
      endedAt: row?.endedAt?.toISOString(),
    };
  }

  function createOnMonday() {
    return actions.createManualEntry({
      id: randomUUID(),
      description: "lunes",
      date: monday,
      start: "10:00",
      end: "11:00",
    });
  }

  it("el alta manual, la de la barra y la del calendario, acepta el lunes anterior", async () => {
    await signInOn({ createdAt });

    const result = await createOnMonday();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.created.dayDate).toBe(monday);
    expect(await instantsOf(result.data.created.id)).toEqual(mondayInstants);
  });

  it("la edición de horas y el arrastre del calendario llevan una entrada al lunes", async () => {
    const seeded = await signInOn({ createdAt });
    const row = await seedOwnToday(seeded);

    const result = await actions.updateEntryTimes({
      id: row.id,
      date: monday,
      start: "10:00",
      end: "11:00",
    });

    expect(result.ok && result.data.entry.dayDate).toBe(monday);
    expect(await instantsOf(row.id)).toEqual(mondayInstants);
  });

  it("el diálogo de la entrada la lleva al lunes", async () => {
    const seeded = await signInOn({ createdAt });
    const row = await seedOwnToday(seeded);

    const result = await actions.updateEntry({
      id: row.id,
      changes: { times: { date: monday, start: "10:00", end: "11:00" } },
    });

    expect(result.ok).toBe(true);
    expect(await instantsOf(row.id)).toEqual(mondayInstants);
  });

  it("la edición en masa lleva las entradas al lunes", async () => {
    const seeded = await signInOn({ createdAt });
    const rows = [await seedOwnToday(seeded), await seedOwnToday(seeded)];

    const result = await actions.bulkEditEntries({
      ids: rows.map((row) => row.id),
      changes: { date: monday },
    });

    expect(result.ok).toBe(true);
    for (const row of rows) {
      expect(await instantsOf(row.id)).toEqual(mondayInstants);
    }
  });

  it("el inicio del timer pasa al lunes", async () => {
    const seeded = await signInOn({ createdAt });
    const running = await seedTimeEntry({
      workspaceId: seeded.workspaceId,
      userId: sessionUserId(),
      startedAt: "2026-10-07T13:00:00Z",
    });

    const result = await actions.updateRunningStart({
      id: running.id,
      date: monday,
      start: "10:00",
    });

    expect(result.ok && result.data.running.dayDate).toBe(monday);
  });

  it("una entrada del lunes se duplica y se continúa", async () => {
    await signInOn({ createdAt });
    const source = await createOnMonday();
    expect(source.ok).toBe(true);
    if (!source.ok) return;

    const copy = await actions.duplicateEntry({
      id: randomUUID(),
      sourceId: source.data.created.id,
    });
    const continued = await actions.continueEntry({
      id: randomUUID(),
      sourceId: source.data.created.id,
    });

    expect(copy.ok && copy.data.created.dayDate).toBe(monday);
    expect(continued.ok && continued.data.running.description).toBe("lunes");
  });

  it("el calendario de la sesión no raya el lunes ni el martes", async () => {
    await signInOn({ createdAt });
    const session = await requireSession();

    const state = await getCalendarState(
      session.actor,
      trackerWorkspaceOf(session),
      { mode: "week", day: null },
      new Date("2026-10-07T15:00:00Z"),
    );

    expect(state.minDayKey).toBe("2000-01-01");
    expect(state.days.filter((day) => day.beforeFloor)).toEqual([]);
  });
});

describe("la hora de pared del cambio de horario", () => {
  // El 29/3/2026 Madrid salta de las 02:00 a las 03:00; el 25/10 las 02:30
  // ocurren dos veces.
  const enMadrid = { personTimezone: madrid };

  it.each([
    ["en el inicio", { date: "2026-03-29", start: "02:30", end: "04:00" }],
    ["en el fin", { date: "2026-03-29", start: "01:30", end: "02:30" }],
  ])(
    "la hora que no existe %s sale como validation y no deja fila",
    async (_, values) => {
      await signInOn(enMadrid);

      const result = await actions.createManualEntry({ id: randomUUID(), ...values });

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
      id: randomUUID(),
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
      id: randomUUID(),
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
    // Sin el control del esquema, la entrada llegaría a la base.
    await signInOn();

    const result = await actions.createManualEntry({
      id: randomUUID(),
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
      id: randomUUID(),
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

  it("guardan con la zona de la persona de la sesión y revalidan", async () => {
    const seeded = await signInOn({ personTimezone: madrid });
    const closed = await seedOwnClosed(seeded);
    const running = await seedOwnRunning(seeded);

    const times = await actions.updateEntryTimes({
      id: closed.id,
      date: "2026-07-01",
      start: "12:00",
      end: "13:30",
    });
    expect(mocks.revalidated).toEqual(revalidatedFor(1));
    const start = await actions.updateRunningStart({
      id: running.id,
      date: "2026-10-02",
      start: "09:00",
    });

    expect(times.ok && times.data.entry.startedAt).toBe("2026-07-01T10:00:00.000Z");
    expect(start.ok && start.data.running.startedAt).toBe("2026-10-02T07:00:00.000Z");
    expect(mocks.revalidated).toEqual(revalidatedFor(2));
  });

  it("un error de Zod del trío sale como validation con el mensaje del issue", async () => {
    await signInOn();

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
    expect(mocks.revalidated).toEqual(revalidatedFor(4));
  });

  it("un error de dominio conserva su código y su mensaje, y revalida", async () => {
    const seeded = await signInOn();
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
    expect(mocks.revalidated).toEqual(revalidatedFor(3));
  });

  it("el piso rechaza el 31 de diciembre de 1999 en las dos", async () => {
    const seeded = await signInOn();
    const closed = await seedOwnClosed(seeded);
    const running = await seedOwnRunning(seeded);

    const times = await actions.updateEntryTimes({
      id: closed.id,
      date: "1999-12-31",
      start: "08:00",
      end: "09:00",
    });
    const start = await actions.updateRunningStart({
      id: running.id,
      date: "1999-12-31",
      start: "08:00",
    });

    for (const result of [times, start]) {
      expect(result).toEqual({
        ok: false,
        code: "validation",
        message: timeEntryMessages.beforeFloor,
      });
    }
  });

  it("TT-41: el timer que otra pestaña detuvo llega como already_stopped tipado", async () => {
    const seeded = await signInOn();
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
    expect(mocks.revalidated).toEqual(revalidatedFor(1));
    const rows = await allTimeEntries();
    expect(rows[0].startedAt.toISOString()).toBe("2026-10-02T11:00:00.000Z");
  });

  it("TT-79, TT-80: la entrada ajena y la que no existe, con su texto", async () => {
    const seeded = await signInOn();
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
      const seeded = await signInOn();
      const closed = await seedOwnClosed(seeded);
      const running = await seedOwnRunning(seeded);
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
      expect(mocks.revalidated).toEqual(revalidatedFor(2));
      const rows = await allTimeEntries();
      expect(rows.map((row) => row.startedAt.toISOString())).toEqual([
        "2026-10-01T11:00:00.000Z",
        "2026-10-02T11:00:00.000Z",
      ]);
    },
  );
});

describe("continueEntry, duplicateEntry y discardTimer", () => {
  const unknownId = "11111111-1111-4111-8111-111111111111";

  /** Una entrada cerrada de la persona de la sesión, la original de las altas. */
  function seedOwnSource(seeded: SeededWorkspace) {
    return seedTimeEntry({
      workspaceId: seeded.workspaceId,
      userId: sessionUserId(),
      description: "original",
      startedAt: "2026-10-01T11:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
    });
  }

  /** El timer activo de la persona de la sesión. */
  function seedOwnRunning(seeded: SeededWorkspace) {
    return seedTimeEntry({
      workspaceId: seeded.workspaceId,
      userId: sessionUserId(),
      startedAt: "2026-10-02T11:00:00Z",
    });
  }

  /** Abre la sesión y crea su membresía, que crea la primera action. */
  async function signInWithMembership() {
    const seeded = await signInOn();
    await actions.discardTimer({ id: unknownId });
    mocks.revalidated.length = 0;
    return seeded;
  }

  it("las tres aplican y revalidan", async () => {
    const seeded = await signInWithMembership();
    const source = await seedOwnSource(seeded);

    const duplicated = await actions.duplicateEntry({
      id: randomUUID(),
      sourceId: source.id,
    });
    const continued = await actions.continueEntry({
      id: randomUUID(),
      sourceId: source.id,
    });
    expect(duplicated.ok).toBe(true);
    expect(continued.ok).toBe(true);
    if (!continued.ok) return;
    expect(continued.data.running.description).toBe("original");
    const discarded = await actions.discardTimer({ id: continued.data.running.id });

    expect(discarded).toEqual({ ok: true, data: { id: continued.data.running.id } });
    expect(mocks.revalidated).toEqual(revalidatedFor(3));
    expect(await allTimeEntries()).toHaveLength(2);
  });

  describe.each(["continueEntry", "duplicateEntry"] as const)("%s", (name) => {
    const create = (input: { id: string; sourceId: string }) => actions[name](input);

    it.each([
      ["un id que no es uuid v4", () => "01890a5d-ac96-774b-bcce-b302099a8057"],
      ["un id que no es uuid", () => "no-es-uuid"],
    ])("con %s responde validation, no escribe y revalida", async (_, idOf) => {
      const seeded = await signInWithMembership();
      const source = await seedOwnSource(seeded);

      const result = await create({ id: idOf(), sourceId: source.id });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("validation");
      expect(mocks.revalidated).toEqual(revalidatedFor(1));
      expect(await allTimeEntries()).toHaveLength(1);
    });

    it.each([
      ["el mismo id", (id: string) => id],
      ["el mismo id con otras mayúsculas", (id: string) => id.toUpperCase()],
    ])(
      "con %s que la original responde el rechazo explícito y no escribe",
      async (_, sameAs) => {
        const seeded = await signInWithMembership();
        const source = await seedOwnSource(seeded);

        const result = await create({ id: source.id, sourceId: sameAs(source.id) });

        expect(result).toEqual({
          ok: false,
          code: "validation",
          message: timeEntryMessages.sameEntryId,
        });
        expect(mocks.revalidated).toEqual(revalidatedFor(1));
        expect(await allTimeEntries()).toEqual([source]);
      },
    );

    it("TT-79, TT-80: la original ajena y la que no existe, con su texto, y revalida", async () => {
      const seeded = await signInWithMembership();
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

      const forbidden = await create({ id: randomUUID(), sourceId: foreign.id });
      const missing = await create({ id: randomUUID(), sourceId: unknownId });

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
      expect(mocks.revalidated).toEqual(revalidatedFor(2));
      expect(await allTimeEntries()).toEqual([foreign]);
    });

    it.each(Object.entries(foreignOwners))(
      "ADR 0007: el id de una entrada de %s responde forbidden con el mensaje neutro",
      async (_, ownerOf) => {
        const seeded = await signInWithMembership();
        const source = await seedOwnSource(seeded);
        const running = await seedOwnRunning(seeded);
        const foreignOwner = await ownerOf(seeded);
        const foreign = await seedTimeEntry({
          workspaceId: foreignOwner.workspaceId,
          userId: foreignOwner.ownerId,
          startedAt: "2026-10-02T09:00:00Z",
          endedAt: "2026-10-02T10:00:00Z",
        });
        const rows = await allTimeEntries();

        const result = await create({ id: foreign.id, sourceId: source.id });

        expect(result).toEqual({
          ok: false,
          code: "forbidden",
          message: timeEntryMessages.forbidden,
        });
        expect(await allTimeEntries()).toEqual(rows);
        expect(
          (await allTimeEntries()).find((row) => row.id === running.id)?.endedAt,
        ).toBeNull();
      },
    );
  });

  it("duplicar la entrada que corre conserva el código y el mensaje, y revalida", async () => {
    const seeded = await signInWithMembership();
    const running = await seedOwnRunning(seeded);

    const result = await actions.duplicateEntry({
      id: randomUUID(),
      sourceId: running.id,
    });

    expect(result).toEqual({
      ok: false,
      code: "timer_running",
      message: timeEntryMessages.runningEntryTimes,
    });
    expect(mocks.revalidated).toEqual(revalidatedFor(1));
    expect(await allTimeEntries()).toEqual([running]);
  });

  it("TT-65: descartar un timer que otra pestaña detuvo llega como already_stopped tipado", async () => {
    const seeded = await signInWithMembership();
    const running = await seedOwnRunning(seeded);
    await actions.stopTimer({ id: running.id });
    mocks.revalidated.length = 0;

    const result = await actions.discardTimer({ id: running.id });

    expect(result).toEqual({
      ok: false,
      code: "already_stopped",
      message: timeEntryMessages.alreadyStopped,
    });
    expect(mocks.revalidated).toEqual(revalidatedFor(1));
    expect(await allTimeEntries()).toHaveLength(1);
  });

  it("descartar con un id que no es uuid responde validation y revalida", async () => {
    await signInWithMembership();

    const result = await actions.discardTimer({ id: "no-es-uuid" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("validation");
    expect(mocks.revalidated).toEqual(revalidatedFor(1));
  });

  it.each(["inactive", "invited"] as const)(
    "TT-92: con la membresía %s las tres responden el mensaje neutro, también con el id de una entrada propia",
    async (status) => {
      const seeded = await signInWithMembership();
      const source = await seedOwnSource(seeded);
      const running = await seedOwnRunning(seeded);
      await db
        .update(membership)
        .set({ status })
        .where(eq(membership.userId, sessionUserId()));
      const rows = await allTimeEntries();

      const results = [
        await actions.continueEntry({ id: randomUUID(), sourceId: source.id }),
        await actions.duplicateEntry({ id: randomUUID(), sourceId: source.id }),
        // El id de una entrada propia que existe: sin el permiso antes de la
        // fila propia, respondería esa fila como si la hubiera creado.
        await actions.continueEntry({ id: running.id, sourceId: source.id }),
        await actions.duplicateEntry({ id: running.id, sourceId: source.id }),
        await actions.discardTimer({ id: running.id }),
        await actions.discardTimer({ id: unknownId }),
      ];

      for (const result of results) {
        expect(result).toEqual({
          ok: false,
          code: "forbidden",
          message: timeEntryMessages.forbidden,
        });
      }
      expect(mocks.revalidated).toEqual(revalidatedFor(results.length));
      expect(await allTimeEntries()).toEqual(rows);
    },
  );
});

describe("weekStart en las vistas, con el primer día de la persona de la sesión", () => {
  const unknownId = "11111111-1111-4111-8111-111111111111";

  /** Abre la sesión, crea su membresía y le fija el primer día de la semana. */
  async function signInWithWeekStart(weekStart: number) {
    const seeded = await signInOn();
    await actions.discardTimer({ id: unknownId });
    await db
      .update(membership)
      .set({ weekStart })
      .where(
        and(
          eq(membership.workspaceId, seeded.workspaceId),
          eq(membership.userId, sessionUserId()),
        ),
      );
    mocks.revalidated.length = 0;
    return seeded;
  }

  /**
   * La semana de una vista, medida aparte del service: empieza el día de la
   * semana pedido y a no más de seis días antes del día de la entrada.
   */
  function weekOf(view: { readonly dayDate: string; readonly weekStart: string }) {
    const offset =
      (Date.parse(`${view.dayDate}T00:00:00Z`) -
        Date.parse(`${view.weekStart}T00:00:00Z`)) /
      86_400_000;
    return {
      weekday: new Date(`${view.weekStart}T12:00:00Z`).getUTCDay(),
      inRange: offset >= 0 && offset <= 6,
    };
  }

  /** Los domingos del caso y su semana con lunes (1) y con domingo (0). */
  const weeks = {
    "2026-10-04": { 1: "2026-09-28", 0: "2026-10-04" },
    "2026-09-27": { 1: "2026-09-21", 0: "2026-09-27" },
    "2026-09-20": { 1: "2026-09-14", 0: "2026-09-20" },
  } as const;

  it.each([1, 0] as const)(
    "con %i, cada action que devuelve vistas trae la semana de cada una",
    async (weekStart) => {
      await signInWithWeekStart(weekStart);

      const manual = await actions.createManualEntry({
        id: randomUUID(),
        date: "2026-10-04",
        start: "08:00",
        end: "09:00",
      });
      if (!manual.ok) throw new Error(manual.message);
      expect(Object.keys(manual.data)).toEqual(["created"]);
      expect(manual.data.created.weekStart).toBe(weeks["2026-10-04"][weekStart]);

      const moved = await actions.updateEntryTimes({
        id: manual.data.created.id,
        date: "2026-09-27",
        start: "08:00",
        end: "09:00",
      });
      if (!moved.ok) throw new Error(moved.message);
      expect(Object.keys(moved.data)).toEqual(["entry"]);
      expect(moved.data.entry.weekStart).toBe(weeks["2026-09-27"][weekStart]);

      const duplicated = await actions.duplicateEntry({
        id: randomUUID(),
        sourceId: manual.data.created.id,
      });
      if (!duplicated.ok) throw new Error(duplicated.message);
      expect(duplicated.data.created.weekStart).toBe(weeks["2026-09-27"][weekStart]);

      const timerId = randomUUID();
      const started = await actions.startTimer({ id: timerId });
      if (!started.ok) throw new Error(started.message);
      expect(weekOf(started.data.running)).toEqual({ weekday: weekStart, inRange: true });

      const restarted = await actions.updateRunningStart({
        id: timerId,
        date: "2026-09-20",
        start: "08:00",
      });
      if (!restarted.ok) throw new Error(restarted.message);
      expect(restarted.data.running.weekStart).toBe(weeks["2026-09-20"][weekStart]);

      const described = await actions.updateDescription({
        id: timerId,
        description: "algo",
      });
      if (!described.ok) throw new Error(described.message);
      expect(described.data.entry.weekStart).toBe(weeks["2026-09-20"][weekStart]);

      // Continuar cierra el timer del 20/09: el cerrado trae la semana de su inicio.
      const continued = await actions.continueEntry({
        id: randomUUID(),
        sourceId: manual.data.created.id,
      });
      if (!continued.ok) throw new Error(continued.message);
      expect(continued.data.stopped?.weekStart).toBe(weeks["2026-09-20"][weekStart]);
      expect(weekOf(continued.data.running)).toEqual({
        weekday: weekStart,
        inRange: true,
      });

      const stopped = await actions.stopTimer({ id: continued.data.running.id });
      if (!stopped.ok) throw new Error(stopped.message);
      expect(weekOf(stopped.data.stopped)).toEqual({ weekday: weekStart, inRange: true });

      // El reintento del primer arranque responde su fila, ya cerrada, con su semana.
      const replayed = await actions.startTimer({ id: timerId });
      expect(replayed).toEqual({
        ok: true,
        data: {
          running: expect.objectContaining({
            id: timerId,
            weekStart: weeks["2026-09-20"][weekStart],
          }),
          stopped: null,
        },
      });
    },
  );
});

describe("updateEntryProject y el par en las altas (criterio 12)", () => {
  const unknownId = "11111111-1111-4111-8111-111111111111";

  /** Abre la sesión y crea su membresía, que crea la primera action. */
  async function signInWithMembership() {
    const seeded = await signInOn();
    await actions.discardTimer({ id: unknownId });
    mocks.revalidated.length = 0;
    return seeded;
  }

  function seedOwnEntry(seeded: SeededWorkspace) {
    return seedTimeEntry({
      workspaceId: seeded.workspaceId,
      userId: sessionUserId(),
      description: "original",
      startedAt: "2026-10-01T11:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
    });
  }

  async function deactivate(seeded: SeededWorkspace) {
    await db
      .update(membership)
      .set({ status: "inactive" })
      .where(
        and(
          eq(membership.workspaceId, seeded.workspaceId),
          eq(membership.userId, sessionUserId()),
        ),
      );
  }

  it("aplica, responde la vista con el proyecto y revalida /", async () => {
    const seeded = await signInWithMembership();
    const web = await seedProject({
      workspaceId: seeded.workspaceId,
      name: "Web",
      color: "pink",
    });
    const design = await seedTask({ workspaceId: seeded.workspaceId, projectId: web.id });
    const entry = await seedOwnEntry(seeded);

    const result = await actions.updateEntryProject({
      id: entry.id,
      projectId: web.id,
      taskId: design.id,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.entry.project).toEqual({ id: web.id, name: "Web", color: "pink" });
    expect(result.data.entry.task).toEqual({ id: design.id, name: design.name });
    expect(mocks.revalidated).toEqual(revalidatedFor(1));
  });

  it("exige su permiso antes de tocar nada: con la membresía desactivada responde el mensaje neutro, también con un id que no existe", async () => {
    const seeded = await signInWithMembership();
    const web = await seedProject({ workspaceId: seeded.workspaceId });
    const entry = await seedOwnEntry(seeded);
    await deactivate(seeded);

    for (const id of [entry.id, unknownId]) {
      expect(
        await actions.updateEntryProject({ id, projectId: web.id, taskId: null }),
      ).toEqual({ ok: false, code: "forbidden", message: timeEntryMessages.forbidden });
    }
    expect(await timeEntryById(entry.id)).toMatchObject({
      projectId: null,
      taskId: null,
    });
    expect(mocks.revalidated).toEqual(revalidatedFor(2));
  });

  it("traduce el ZodError: la tarea sin proyecto y un id que no es uuid salen como validation, y revalida", async () => {
    await signInWithMembership();
    expect(
      await actions.updateEntryProject({
        id: unknownId,
        projectId: null,
        taskId: unknownId,
      }),
    ).toEqual({
      ok: false,
      code: "validation",
      message: timeEntryMessages.taskNeedsProject,
    });
    const malformed = await actions.updateEntryProject({
      id: unknownId,
      projectId: "web",
      taskId: null,
    });
    expect(malformed).toMatchObject({ ok: false, code: "validation" });
    expect(mocks.revalidated).toEqual(revalidatedFor(2));
  });

  it("conserva el código y el mensaje del TimeEntryError: TT-80 y TT-79", async () => {
    const seeded = await signInWithMembership();
    const web = await seedProject({ workspaceId: seeded.workspaceId });
    const otherId = await seedMember(seeded.workspaceId, "member");
    const foreign = await seedTimeEntry({
      workspaceId: seeded.workspaceId,
      userId: otherId,
      startedAt: "2026-10-01T11:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
    });

    expect(
      await actions.updateEntryProject({
        id: unknownId,
        projectId: web.id,
        taskId: null,
      }),
    ).toEqual({ ok: false, code: "not_found", message: timeEntryMessages.notFound });
    expect(
      await actions.updateEntryProject({
        id: foreign.id,
        projectId: web.id,
        taskId: null,
      }),
    ).toEqual({
      ok: false,
      code: "forbidden",
      message: timeEntryMessages.forbiddenOtherOwner,
    });
  });

  it("conserva el código y el mensaje del ProjectError de otro módulo, y revalida", async () => {
    const seeded = await signInWithMembership();
    const old = await seedProject({ workspaceId: seeded.workspaceId, archived: true });
    const web = await seedProject({ workspaceId: seeded.workspaceId });
    const done = await seedTask({
      workspaceId: seeded.workspaceId,
      projectId: web.id,
      status: "done",
    });
    const entry = await seedOwnEntry(seeded);

    expect(
      await actions.updateEntryProject({ id: entry.id, projectId: old.id, taskId: null }),
    ).toEqual({
      ok: false,
      code: "not_found",
      message: projectMessages.projectUnavailable,
    });
    expect(
      await actions.updateEntryProject({
        id: entry.id,
        projectId: web.id,
        taskId: done.id,
      }),
    ).toEqual({ ok: false, code: "not_found", message: projectMessages.taskUnavailable });
    expect(mocks.revalidated).toEqual(revalidatedFor(2));
  });

  it("responde unexpected con un error cualquiera, lo registra y revalida", async () => {
    const seeded = await signInWithMembership();
    const web = await seedProject({ workspaceId: seeded.workspaceId });
    const entry = await seedOwnEntry(seeded);
    const cause = new Error("la base se cayó");
    const write = vi
      .spyOn(timeEntryRepository, "updateProject")
      .mockRejectedValueOnce(cause);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      expect(
        await actions.updateEntryProject({
          id: entry.id,
          projectId: web.id,
          taskId: null,
        }),
      ).toEqual({ ok: false, code: "unexpected", message: timeEntryMessages.unexpected });
      expect(logged).toHaveBeenCalledWith(cause);
    } finally {
      write.mockRestore();
      logged.mockRestore();
    }
    expect(mocks.revalidated).toEqual(revalidatedFor(1));
  });

  it("startTimer, createManualEntry, continueEntry y duplicateEntry responden TT-77 con not_found", async () => {
    const seeded = await signInWithMembership();
    const old = await seedProject({ workspaceId: seeded.workspaceId, archived: true });
    const source = await seedTimeEntry({
      workspaceId: seeded.workspaceId,
      userId: sessionUserId(),
      startedAt: "2026-10-01T11:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
      projectId: old.id,
    });
    const tt77 = {
      ok: false,
      code: "not_found",
      message: projectMessages.projectUnavailable,
    };

    expect(
      await actions.startTimer({ id: randomUUID(), projectId: old.id, taskId: null }),
    ).toEqual(tt77);
    expect(
      await actions.createManualEntry({
        id: randomUUID(),
        date: "2026-10-01",
        start: "08:00",
        end: "09:00",
        projectId: old.id,
      }),
    ).toEqual(tt77);
    expect(
      await actions.continueEntry({ id: randomUUID(), sourceId: source.id }),
    ).toEqual(tt77);
    expect(
      await actions.duplicateEntry({ id: randomUUID(), sourceId: source.id }),
    ).toEqual(tt77);
    expect(await allTimeEntries()).toHaveLength(1);
    expect(mocks.revalidated).toEqual(revalidatedFor(4));
  });

  it("las altas guardan el par pedido", async () => {
    const seeded = await signInWithMembership();
    const web = await seedProject({ workspaceId: seeded.workspaceId });
    const design = await seedTask({ workspaceId: seeded.workspaceId, projectId: web.id });

    const started = await actions.startTimer({
      id: randomUUID(),
      projectId: web.id,
      taskId: design.id,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.data.running.task?.id).toBe(design.id);
    expect(await timeEntryById(started.data.running.id)).toMatchObject({
      projectId: web.id,
      taskId: design.id,
    });
  });
});

describe("bulkEditEntries y bulkDeleteEntries (criterio 17)", () => {
  const unknownId = "11111111-1111-4111-8111-111111111111";

  /** Abre la sesión y crea su membresía, que crea la primera action. */
  async function signInWithMembership() {
    const seeded = await signInOn();
    await actions.discardTimer({ id: unknownId });
    mocks.revalidated.length = 0;
    return seeded;
  }

  function seedOwnEntry(seeded: SeededWorkspace, startedAt = "2026-10-01T13:00:00Z") {
    return seedTimeEntry({
      workspaceId: seeded.workspaceId,
      userId: sessionUserId(),
      description: "original",
      startedAt,
      endedAt: new Date(new Date(startedAt).getTime() + 3_600_000),
    });
  }

  it("aplican, responden sus datos y revalidan /", async () => {
    const seeded = await signInWithMembership();
    const edited = await seedOwnEntry(seeded);
    const removed = await seedOwnEntry(seeded, "2026-09-30T13:00:00Z");

    const edit = await actions.bulkEditEntries({
      ids: [edited.id],
      changes: { description: "nueva", start: "09:00" },
    });
    const remove = await actions.bulkDeleteEntries({ ids: [removed.id] });

    expect(edit.ok).toBe(true);
    if (!edit.ok) return;
    expect(edit.data.entries).toHaveLength(1);
    expect(edit.data.entries[0]).toMatchObject({
      id: edited.id,
      description: "nueva",
      startLabel: "09:00",
      startedAt: "2026-10-01T12:00:00.000Z",
    });
    expect(remove).toEqual({ ok: true, data: { ids: [removed.id] } });
    expect(await timeEntryById(removed.id)).toBeUndefined();
    expect(mocks.revalidated).toEqual(revalidatedFor(2));
  });

  it("los ids llegan al service en minúsculas y sin repetir", async () => {
    const seeded = await signInWithMembership();
    const entry = await seedOwnEntry(seeded);
    const upper = entry.id.toUpperCase();

    const edit = await actions.bulkEditEntries({
      ids: [upper, entry.id],
      changes: { description: "nueva" },
    });
    const remove = await actions.bulkDeleteEntries({ ids: [upper, entry.id] });

    expect(edit.ok).toBe(true);
    if (!edit.ok) return;
    expect(edit.data.entries.map((view) => view.id)).toEqual([entry.id]);
    expect(remove).toEqual({ ok: true, data: { ids: [entry.id] } });
    expect(await timeEntryById(entry.id)).toBeUndefined();
  });

  it("traducen el ZodError con su mensaje, sin lista, y revalidan", async () => {
    const seeded = await signInWithMembership();
    const entry = await seedOwnEntry(seeded);
    const tooMany = Array.from({ length: 201 }, () => randomUUID());
    // Un campo que el slice no conoce, como lo mandaría una pestaña del 12.
    const withProject = { description: "x", projectId: null };

    const cases = [
      [await actions.bulkDeleteEntries({ ids: [] }), timeEntryMessages.bulkEmpty],
      [await actions.bulkDeleteEntries({ ids: tooMany }), timeEntryMessages.bulkTooMany],
      [
        await actions.bulkEditEntries({ ids: [entry.id], changes: {} }),
        timeEntryMessages.bulkNoChanges,
      ],
      [
        await actions.bulkEditEntries({ ids: [entry.id], changes: withProject }),
        timeEntryMessages.unexpected,
      ],
      [
        await actions.bulkEditEntries({ ids: [entry.id], changes: { start: "9:00" } }),
        timeEntryMessages.invalidClock,
      ],
    ] as const;

    for (const [result, message] of cases) {
      expect(result).toEqual({ ok: false, code: "validation", message });
    }
    expect(await timeEntryById(entry.id)).toMatchObject({ description: "original" });
    expect(mocks.revalidated).toEqual(revalidatedFor(5));
  });

  it("exigen su permiso antes de tocar nada: con la membresía desactivada responden forbidden sin lista, también con un id que no existe", async () => {
    const seeded = await signInWithMembership();
    const entry = await seedOwnEntry(seeded);
    await db
      .update(membership)
      .set({ status: "inactive" })
      .where(
        and(
          eq(membership.workspaceId, seeded.workspaceId),
          eq(membership.userId, sessionUserId()),
        ),
      );

    for (const ids of [[entry.id], [unknownId]]) {
      const forbidden = {
        ok: false,
        code: "forbidden",
        message: timeEntryMessages.forbidden,
      };
      expect(
        await actions.bulkEditEntries({ ids, changes: { description: "x" } }),
      ).toEqual(forbidden);
      expect(await actions.bulkDeleteEntries({ ids })).toEqual(forbidden);
    }
    expect(await timeEntryById(entry.id)).toMatchObject({ description: "original" });
    expect(mocks.revalidated).toEqual(revalidatedFor(4));
  });

  it("devuelven rejected con la lista intacta, en el orden pedido, y revalidan", async () => {
    const seeded = await signInWithMembership();
    const own = await seedOwnEntry(seeded);
    const otherId = await seedMember(seeded.workspaceId, "member");
    const foreign = await seedTimeEntry({
      workspaceId: seeded.workspaceId,
      userId: otherId,
      startedAt: "2026-10-01T13:00:00Z",
      endedAt: "2026-10-01T14:00:00Z",
    });

    const edit = await actions.bulkEditEntries({
      ids: [foreign.id, own.id, unknownId],
      changes: { description: "nueva" },
    });
    const remove = await actions.bulkDeleteEntries({
      ids: [unknownId, own.id, foreign.id],
    });

    expect(edit).toEqual({
      ok: false,
      code: "rejected",
      message: timeEntryMessages.bulkEditRejected,
      rejections: [
        {
          id: foreign.id,
          code: "forbidden",
          message: timeEntryMessages.forbiddenOtherOwner,
        },
        { id: unknownId, code: "not_found", message: timeEntryMessages.notFound },
      ],
    });
    expect(remove).toEqual({
      ok: false,
      code: "rejected",
      message: timeEntryMessages.bulkDeleteRejected,
      rejections: [
        {
          id: foreign.id,
          code: "forbidden",
          message: timeEntryMessages.forbiddenOtherOwner,
        },
      ],
    });
    expect(await timeEntryById(own.id)).toMatchObject({ description: "original" });
    expect(mocks.revalidated).toEqual(revalidatedFor(2));
  });

  it("un error de dominio de una fila sola no trae lista", async () => {
    await signInWithMembership();

    expect(
      await actions.updateEntryTimes({
        id: unknownId,
        date: "2026-10-01",
        start: "09:00",
        end: "10:00",
      }),
    ).toEqual({ ok: false, code: "not_found", message: timeEntryMessages.notFound });
  });
});

describe("updateEntry (ADR 0013)", () => {
  const unknownId = "11111111-1111-4111-8111-111111111111";

  /** Una entrada cerrada de la persona de la sesión, el 1/10 de 08:00 a 09:00 en Madrid. */
  function seedOwnClosed(seeded: SeededWorkspace) {
    return seedTimeEntry({
      workspaceId: seeded.workspaceId,
      userId: sessionUserId(),
      description: "antes",
      startedAt: "2026-10-01T06:00:00Z",
      endedAt: "2026-10-01T07:00:00Z",
    });
  }

  it("guarda los grupos juntos con la zona de la persona de la sesión y revalida", async () => {
    const seeded = await signInOn({ personTimezone: madrid });
    const closed = await seedOwnClosed(seeded);

    const result = await actions.updateEntry({
      id: closed.id,
      changes: {
        description: "  después  ",
        times: { date: "2026-10-01", start: "08:00", end: "09:30" },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.entry).toMatchObject({
      description: "después",
      startedAt: "2026-10-01T06:00:00.000Z",
      endedAt: "2026-10-01T07:30:00.000Z",
    });
    expect(mocks.revalidated).toEqual(revalidatedFor(1));
  });

  it("sin grupos responde validation con bulkNoChanges, y un grupo desconocido con unexpected", async () => {
    await signInOn();

    const empty = await actions.updateEntry({ id: unknownId, changes: {} });
    // Lo que puede mandar un cliente que no respeta el tipo.
    const unknown = await actions.updateEntry({
      id: unknownId,
      changes: { labels: [] } as UpdateEntryChanges,
    });

    expect(empty).toEqual({
      ok: false,
      code: "validation",
      message: timeEntryMessages.bulkNoChanges,
    });
    expect(unknown).toEqual({
      ok: false,
      code: "validation",
      message: timeEntryMessages.unexpected,
    });
    expect(mocks.revalidated).toEqual(revalidatedFor(2));
  });

  it("un error de dominio conserva su código y su mensaje, y revalida", async () => {
    const seeded = await signInOn();
    const closed = await seedOwnClosed(seeded);

    const missing = await actions.updateEntry({
      id: unknownId,
      changes: { description: "x" },
    });
    const stopped = await actions.updateEntry({
      id: closed.id,
      changes: { runningStart: { date: "2026-10-01", start: "07:00" } },
    });

    expect(missing).toEqual({
      ok: false,
      code: "not_found",
      message: timeEntryMessages.notFound,
    });
    expect(stopped).toEqual({
      ok: false,
      code: "already_stopped",
      message: timeEntryMessages.alreadyStopped,
    });
    expect(mocks.revalidated).toEqual(revalidatedFor(2));
  });

  it("guarda el facturable solo y revalida las dos rutas (criterio 11 del 11a)", async () => {
    const seeded = await signInOn();
    const closed = await seedOwnClosed(seeded);

    const result = await actions.updateEntry({
      id: closed.id,
      changes: { billable: true },
    });

    expect(result).toMatchObject({ ok: true, data: { entry: { billable: true } } });
    expect((await timeEntryById(closed.id))?.billable).toBe(true);
    expect(mocks.revalidated).toEqual(revalidatedFor(1));
  });

  it("con el facturable, conserva TT-77 y responde validation a un facturable que no es booleano", async () => {
    const seeded = await signInOn();
    const closed = await seedOwnClosed(seeded);
    const old = await seedProject({ workspaceId: seeded.workspaceId, archived: true });

    const unavailable = await actions.updateEntry({
      id: closed.id,
      changes: { project: { projectId: old.id, taskId: null }, billable: true },
    });
    const malformed = await actions.updateEntry({
      id: closed.id,
      changes: {
        // @ts-expect-error: un pedido armado a mano, con un facturable que no es booleano.
        billable: "true",
      },
    });

    expect(unavailable).toEqual({
      ok: false,
      code: "not_found",
      message: projectMessages.projectUnavailable,
    });
    expect(malformed).toMatchObject({ ok: false, code: "validation" });
    expect((await timeEntryById(closed.id))?.billable).toBe(false);
    expect(mocks.revalidated).toEqual(revalidatedFor(2));
  });
});

describe("las etiquetas en las actions (criterio 15 del 11b: TT-78)", () => {
  const unknownId = "11111111-1111-4111-8111-111111111111";

  /** Abre la sesión y crea su membresía, que crea la primera action. */
  async function signInWithMembership() {
    const seeded = await signInOn();
    await actions.discardTimer({ id: unknownId });
    mocks.revalidated.length = 0;
    return seeded;
  }

  it("las cuatro altas y updateEntry responden TT-78 con not_found, y revalidan", async () => {
    const seeded = await signInWithMembership();
    const old = await seedTag({ workspaceId: seeded.workspaceId, archived: true });
    const source = await seedTimeEntry({
      workspaceId: seeded.workspaceId,
      userId: sessionUserId(),
      startedAt: "2026-10-01T11:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
      tagIds: [old.id],
    });
    const plain = await seedTimeEntry({
      workspaceId: seeded.workspaceId,
      userId: sessionUserId(),
      startedAt: "2026-10-01T13:00:00Z",
      endedAt: "2026-10-01T14:00:00Z",
    });
    const tt78 = {
      ok: false,
      code: "not_found",
      message: projectMessages.tagUnavailable,
    };

    expect(await actions.startTimer({ id: randomUUID(), tagIds: [old.id] })).toEqual(
      tt78,
    );
    expect(
      await actions.createManualEntry({
        id: randomUUID(),
        date: "2026-10-01",
        start: "08:00",
        end: "09:00",
        tagIds: [old.id],
      }),
    ).toEqual(tt78);
    expect(
      await actions.continueEntry({ id: randomUUID(), sourceId: source.id }),
    ).toEqual(tt78);
    expect(
      await actions.duplicateEntry({ id: randomUUID(), sourceId: source.id }),
    ).toEqual(tt78);
    expect(
      await actions.updateEntry({ id: plain.id, changes: { tags: [old.id] } }),
    ).toEqual(tt78);
    expect(await allTimeEntries()).toHaveLength(2);
    expect(mocks.revalidated).toEqual(revalidatedFor(5));
  });

  it("51 etiquetas responden validation con el texto de D-4", async () => {
    await signInWithMembership();
    const tagIds = Array.from({ length: 51 }, () => randomUUID());
    expect(await actions.startTimer({ id: randomUUID(), tagIds })).toEqual({
      ok: false,
      code: "validation",
      message: timeEntryMessages.tooManyTags,
    });
    expect(await allTimeEntries()).toEqual([]);
  });

  it("updateEntry guarda las etiquetas pedidas y responde la vista con ellas", async () => {
    const seeded = await signInWithMembership();
    const design = await seedTag({ workspaceId: seeded.workspaceId, name: "Diseño" });
    const entry = await seedTimeEntry({
      workspaceId: seeded.workspaceId,
      userId: sessionUserId(),
      startedAt: "2026-10-01T11:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
    });

    const result = await actions.updateEntry({
      id: entry.id,
      changes: { tags: [design.id] },
    });

    expect(result).toMatchObject({
      ok: true,
      data: { entry: { tags: [{ id: design.id, name: "Diseño" }] } },
    });
    expect(mocks.revalidated).toEqual(revalidatedFor(1));
  });
});

describe("bulkEditEntries con el par, el facturable y las etiquetas (criterio 17 del 12)", () => {
  const unknownId = "11111111-1111-4111-8111-111111111111";

  /** Abre la sesión y crea su membresía, que crea la primera action. */
  async function signInWithMembership() {
    const seeded = await signInOn();
    await actions.discardTimer({ id: unknownId });
    mocks.revalidated.length = 0;
    return seeded;
  }

  function seedOwnEntry(seeded: SeededWorkspace) {
    return seedTimeEntry({
      workspaceId: seeded.workspaceId,
      userId: sessionUserId(),
      startedAt: "2026-10-01T13:00:00Z",
      endedAt: "2026-10-01T14:00:00Z",
    });
  }

  it("aplica y responde las vistas con el par, el facturable y las etiquetas, y revalida", async () => {
    const seeded = await signInWithMembership();
    const web = await seedProject({ workspaceId: seeded.workspaceId, name: "Web" });
    const design = await seedTag({ workspaceId: seeded.workspaceId, name: "Diseño" });
    const entry = await seedOwnEntry(seeded);

    const result = await actions.bulkEditEntries({
      ids: [entry.id],
      changes: {
        project: { projectId: web.id, taskId: null },
        billable: true,
        tags: { mode: "add", ids: [design.id.toUpperCase()] },
      },
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        entries: [
          {
            id: entry.id,
            project: { id: web.id, name: "Web" },
            billable: true,
            tags: [{ id: design.id, name: "Diseño" }],
          },
        ],
      },
    });
    expect(mocks.revalidated).toEqual(revalidatedFor(1));
  });

  it("traduce el error de project con su código y su mensaje, sin lista, y revalida", async () => {
    const seeded = await signInWithMembership();
    const old = await seedProject({ workspaceId: seeded.workspaceId, archived: true });
    const web = await seedProject({ workspaceId: seeded.workspaceId });
    const done = await seedTask({
      workspaceId: seeded.workspaceId,
      projectId: web.id,
      status: "done",
    });
    const oldTag = await seedTag({ workspaceId: seeded.workspaceId, archived: true });
    const entry = await seedOwnEntry(seeded);

    const cases: [BulkEditEntriesInput["changes"], string][] = [
      [
        { project: { projectId: old.id, taskId: null } },
        projectMessages.projectUnavailable,
      ],
      [
        { project: { projectId: web.id, taskId: done.id } },
        projectMessages.taskUnavailable,
      ],
      [{ tags: { mode: "add", ids: [oldTag.id] } }, projectMessages.tagUnavailable],
    ];

    for (const [changes, message] of cases) {
      expect(await actions.bulkEditEntries({ ids: [entry.id], changes })).toEqual({
        ok: false,
        code: "not_found",
        message,
      });
    }
    expect(await timeEntryById(entry.id)).toMatchObject({
      projectId: null,
      taskId: null,
    });
    expect(mocks.revalidated).toEqual(revalidatedFor(3));
  });

  it("traduce los ZodError de los campos nuevos con su mensaje, y revalida", async () => {
    const seeded = await signInWithMembership();
    const entry = await seedOwnEntry(seeded);
    const tooMany = Array.from({ length: 51 }, () => randomUUID());

    const cases: [BulkEditEntriesInput["changes"], string][] = [
      [
        { project: { projectId: null, taskId: randomUUID() } },
        timeEntryMessages.taskNeedsProject,
      ],
      [{ tags: { mode: "add", ids: [] } }, timeEntryMessages.unexpected],
      [{ tags: { mode: "replace", ids: tooMany } }, timeEntryMessages.tooManyTags],
    ];

    for (const [changes, message] of cases) {
      expect(await actions.bulkEditEntries({ ids: [entry.id], changes })).toEqual({
        ok: false,
        code: "validation",
        message,
      });
    }
    expect(mocks.revalidated).toEqual(revalidatedFor(3));
  });
});

describe("setTimesheetCell y removeTimesheetRow (criterio 18 del 13)", () => {
  const unknownId = "11111111-1111-4111-8111-111111111111";

  /** Abre la sesión y crea su membresía, que crea la primera action. */
  async function signInWithMembership() {
    const seeded = await signInOn();
    await actions.discardTimer({ id: unknownId });
    mocks.revalidated.length = 0;
    return seeded;
  }

  /** Una entrada propia cerrada; el miércoles 30/09/2026 a las 10:00 locales por omisión. */
  function seedOwnEntry(
    seeded: SeededWorkspace,
    values: { startedAt?: string; endedAt?: string; projectId?: string | null } = {},
  ) {
    return seedTimeEntry({
      workspaceId: seeded.workspaceId,
      userId: sessionUserId(),
      startedAt: values.startedAt ?? "2026-09-30T13:00:00Z",
      endedAt: values.endedAt ?? "2026-09-30T14:00:00Z",
      projectId: values.projectId ?? null,
    });
  }

  it("escribe una celda vacía, responde la vista y revalida las tres pantallas", async () => {
    await signInWithMembership();

    const result = await actions.setTimesheetCell({
      date: "2026-09-30",
      projectId: null,
      taskId: null,
      minutes: 90,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.entry).toMatchObject({
      startedAt: "2026-09-30T12:00:00.000Z",
      endedAt: "2026-09-30T13:30:00.000Z",
      durationLabel: "1:30",
    });
    expect(mocks.revalidated).toEqual(revalidatedFor(1));
  });

  it("traduce cellNeedsEntryEdit, el ProjectError y el ZodError, y revalida cada vez", async () => {
    const seeded = await signInWithMembership();
    // Dos entradas «Sin proyecto» el miércoles; la que empieza más tarde dura un minuto.
    await seedOwnEntry(seeded);
    await seedOwnEntry(seeded, {
      startedAt: "2026-09-30T15:00:00Z",
      endedAt: "2026-09-30T15:01:00Z",
    });
    const archived = await seedProject({
      workspaceId: seeded.workspaceId,
      archived: true,
    });

    const trim = await actions.setTimesheetCell({
      date: "2026-09-30",
      projectId: null,
      taskId: null,
      minutes: 60,
    });
    const unavailable = await actions.setTimesheetCell({
      date: "2026-09-30",
      projectId: archived.id,
      taskId: null,
      minutes: 60,
    });
    const zero = await actions.setTimesheetCell({
      date: "2026-09-30",
      projectId: null,
      taskId: null,
      minutes: 0,
    });
    const taskAlone = await actions.setTimesheetCell({
      date: "2026-09-30",
      projectId: null,
      taskId: unknownId,
      minutes: 30,
    });

    expect(trim).toEqual({
      ok: false,
      code: "validation",
      message: timeEntryMessages.cellNeedsEntryEdit,
    });
    expect(unavailable).toEqual({
      ok: false,
      code: "not_found",
      message: projectMessages.projectUnavailable,
    });
    expect(zero).toEqual({
      ok: false,
      code: "validation",
      message: timeEntryMessages.tooShort,
    });
    expect(taskAlone).toEqual({
      ok: false,
      code: "validation",
      message: timeEntryMessages.taskNeedsProject,
    });
    expect(await allTimeEntries()).toHaveLength(2);
    expect(mocks.revalidated).toEqual(revalidatedFor(4));
  });

  it("quita una fila, responde los ids borrados y revalida", async () => {
    const seeded = await signInWithMembership();
    const entry = await seedOwnEntry(seeded);

    const result = await actions.removeTimesheetRow({
      weekStart: "2026-09-28",
      projectId: null,
      taskId: null,
      ids: [entry.id.toUpperCase()],
    });

    expect(result).toEqual({ ok: true, data: { ids: [entry.id] } });
    expect(await timeEntryById(entry.id)).toBeUndefined();
    expect(mocks.revalidated).toEqual(revalidatedFor(1));
  });

  it("201 ids responden rowTooManyEntries sin borrar nada (TS-52)", async () => {
    const seeded = await signInWithMembership();
    const entry = await seedOwnEntry(seeded);
    const ids = [entry.id, ...Array.from({ length: 200 }, () => randomUUID())];

    const result = await actions.removeTimesheetRow({
      weekStart: "2026-09-28",
      projectId: null,
      taskId: null,
      ids,
    });

    expect(result).toEqual({
      ok: false,
      code: "validation",
      message: timeEntryMessages.rowTooManyEntries,
    });
    expect(await timeEntryById(entry.id)).toBeDefined();
    expect(mocks.revalidated).toEqual(revalidatedFor(1));
  });

  it("otro error del esquema sale con su propio texto, también junto a 201 ids", async () => {
    await signInWithMembership();
    const tooMany = Array.from({ length: 201 }, () => randomUUID());

    const results = [
      await actions.removeTimesheetRow({
        weekStart: "2026-09-28",
        projectId: null,
        taskId: null,
        ids: [],
      }),
      await actions.removeTimesheetRow({
        weekStart: "2026-02-30",
        projectId: null,
        taskId: null,
        ids: [unknownId],
      }),
      await actions.removeTimesheetRow({
        weekStart: "2026-09-28",
        projectId: null,
        taskId: unknownId,
        ids: [unknownId],
      }),
      await actions.removeTimesheetRow({
        weekStart: "2026-09-28",
        projectId: null,
        taskId: null,
        ids: ["no-es-uuid"],
      }),
    ];

    expect(results.slice(0, 3)).toEqual([
      { ok: false, code: "validation", message: timeEntryMessages.bulkEmpty },
      { ok: false, code: "validation", message: timeEntryMessages.invalidDate },
      { ok: false, code: "validation", message: timeEntryMessages.taskNeedsProject },
    ]);
    expect(results[3]).toMatchObject({ ok: false, code: "validation" });
    expect(results[3]).not.toMatchObject({
      message: timeEntryMessages.rowTooManyEntries,
    });
    // Con 201 ids y además una semana inválida, el tope gana: es lo que la
    // persona puede resolver.
    expect(
      await actions.removeTimesheetRow({
        weekStart: "2026-02-30",
        projectId: null,
        taskId: null,
        ids: tooMany,
      }),
    ).toEqual({
      ok: false,
      code: "validation",
      message: timeEntryMessages.rowTooManyEntries,
    });
    expect(mocks.revalidated).toEqual(revalidatedFor(5));
  });

  it("las dos niegan con la membresía desactivada antes de tocar nada", async () => {
    const seeded = await signInWithMembership();
    const entry = await seedOwnEntry(seeded);
    await db
      .update(membership)
      .set({ status: "inactive" })
      .where(
        and(
          eq(membership.workspaceId, seeded.workspaceId),
          eq(membership.userId, sessionUserId()),
        ),
      );

    const results = [
      await actions.setTimesheetCell({
        date: "2026-09-30",
        projectId: null,
        taskId: null,
        minutes: 120,
      }),
      await actions.removeTimesheetRow({
        weekStart: "2026-09-28",
        projectId: null,
        taskId: null,
        ids: [entry.id],
      }),
    ];

    for (const result of results) {
      expect(result).toEqual({
        ok: false,
        code: "forbidden",
        message: timeEntryMessages.forbidden,
      });
    }
    expect(await timeEntryById(entry.id)).toMatchObject({
      endedAt: new Date("2026-09-30T14:00:00Z"),
    });
    expect(mocks.revalidated).toEqual(revalidatedFor(2));
  });
});
