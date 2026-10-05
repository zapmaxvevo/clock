import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { RejectedError } from "@/server/action";
import { db } from "@/server/db";
import { membership } from "@/server/db/schema";
import type { Actor, MembershipStatus, Role } from "@/server/permissions";
import {
  buenosAires,
  defaultFormats,
  seedMember,
  seedProject,
  seedTimeEntry,
  seedWorkspace,
} from "@/test/factories";
import { timeEntriesOf, timeEntryById } from "@/test/queries";

import { projectMessages } from "@/modules/project/schema";

import { timeEntryRepository } from "./repository";
import { timeEntryMessages } from "./schema";
import {
  bulkDeleteEntries,
  bulkEditEntries,
  continueEntry,
  createManualEntry,
  deleteEntry,
  discardTimer,
  duplicateEntry,
  getTrackerState,
  startTimer,
  stopTimer,
  updateDescription,
  updateEntry,
  updateEntryProject,
  updateEntryTimes,
  updateRunningStart,
  type TrackerWorkspace,
} from "./service";

/** Las 12:00 del 2 de octubre de 2026 en Buenos Aires. */
const trackerNow = new Date("2026-10-02T15:00:00Z");

const roles: readonly Role[] = [
  "owner",
  "admin",
  "project_manager",
  "team_manager",
  "member",
];
const notActive: readonly MembershipStatus[] = ["inactive", "invited"];

/** El workspace tal como lo recibe el service. El piso no estorba a estos casos. */
const workspace: TrackerWorkspace = {
  timezone: buenosAires,
  createdAt: new Date("2020-01-01T00:00:00Z"),
  weekStart: 1,
  formats: defaultFormats,
};

/** El trío de la edición de horas sobre las entradas cerradas sembradas acá. */
const timesValues = { date: "2026-10-01", start: "09:00", end: "10:30" } as const;
const runningStartValues = { date: "2026-10-02", start: "07:00" } as const;

const manualValues = {
  projectId: null,
  taskId: null,
  description: "a mano",
  date: "2026-10-02",
  start: "08:00",
  end: "09:00",
} as const;

let workspaceId: string;
let ownerId: string;

beforeEach(async () => {
  const seeded = await seedWorkspace(buenosAires);
  workspaceId = seeded.workspaceId;
  ownerId = seeded.ownerId;
});

/** Actor del rol pedido en el workspace del test. El owner es el del workspace. */
async function seedActor(
  role: Role,
  status: MembershipStatus = "active",
): Promise<Actor> {
  const userId = role === "owner" ? ownerId : await seedMember(workspaceId, role);
  return { userId, workspaceId, role, status };
}

describe.each(roles)("rol %s", (role) => {
  /**
   * El recurso del arranque se arma desde el propio actor, así que las dos
   * comparaciones de `can()` contra el actor —workspace y dueño— dan siempre
   * falso ahí: lo que decide es `status` y la tabla de roles. No hay celda de
   * workspace ajeno ni de entrada ajena para esta acción.
   */
  describe("timeEntry.own.create", () => {
    it("arranca su propio timer", async () => {
      const actor = await seedActor(role);

      const result = await startTimer(actor, workspace, {
        projectId: null,
        taskId: null,
        id: randomUUID(),
        description: "trabajo",
      });

      const row = await timeEntryById(result.running.id);
      expect(row?.userId).toBe(actor.userId);
      expect(row?.workspaceId).toBe(workspaceId);
      expect(row?.endedAt).toBeNull();
      const state = await getTrackerState(actor, workspace, { from: null }, trackerNow);
      expect(state.canTrack).toBe(true);
    });

    it("agrega tiempo a mano sobre una entrada propia", async () => {
      const actor = await seedActor(role);

      const result = await createManualEntry(actor, workspace, manualValues);

      const row = await timeEntryById(result.created.id);
      expect(row?.userId).toBe(actor.userId);
      expect(row?.workspaceId).toBe(workspaceId);
      expect(row?.endedAt).not.toBeNull();
    });

    it.each(notActive)("no agrega nada a mano con la membresía %s", async (status) => {
      const actor = await seedActor(role, status);

      await expect(
        createManualEntry(actor, workspace, manualValues),
      ).rejects.toMatchObject({
        code: "forbidden",
        message: timeEntryMessages.forbidden,
      });
      expect(await timeEntriesOf(workspaceId, actor.userId)).toHaveLength(0);
    });

    it.each(notActive)("no abre nada con la membresía %s", async (status) => {
      const actor = await seedActor(role, status);

      await expect(
        startTimer(actor, workspace, {
          projectId: null,
          taskId: null,
          id: randomUUID(),
          description: "no va",
        }),
      ).rejects.toMatchObject({
        code: "forbidden",
        message: timeEntryMessages.forbidden,
      });

      expect(await timeEntriesOf(workspaceId, actor.userId)).toEqual([]);
    });

    it.each(notActive)(
      "deja la pantalla sin control de registro con la membresía %s",
      async (status) => {
        const actor = await seedActor(role, status);

        const state = await getTrackerState(actor, workspace, { from: null }, trackerNow);

        // La vista, no la mutación: el mismo `can()` que corta el arranque.
        expect(state.canTrack).toBe(false);
      },
    );
  });

  describe("timeEntry.own.update", () => {
    it("edita y detiene su propia entrada", async () => {
      const actor = await seedActor(role);
      const started = await startTimer(actor, workspace, {
        projectId: null,
        taskId: null,
        id: randomUUID(),
        description: "",
      });

      await updateDescription(actor, workspace, {
        id: started.running.id,
        description: "revisión",
      });
      const result = await stopTimer(actor, workspace, { id: started.running.id });

      expect(result.stopped.description).toBe("revisión");
      const row = await timeEntryById(started.running.id);
      expect(row?.description).toBe("revisión");
      expect(row?.endedAt).not.toBeNull();
    });

    it("no toca la entrada de otra persona del workspace", async () => {
      const actor = await seedActor(role);
      const otherId = await seedMember(workspaceId, "member");
      const row = await seedTimeEntry({
        workspaceId,
        userId: otherId,
        description: "ajena",
        startedAt: "2026-10-02T11:00:00Z",
      });

      await expect(
        updateDescription(actor, workspace, { id: row.id, description: "mía" }),
      ).rejects.toMatchObject({
        code: "forbidden",
        message: timeEntryMessages.forbiddenOtherOwner,
      });
      await expect(stopTimer(actor, workspace, { id: row.id })).rejects.toMatchObject({
        code: "forbidden",
        message: timeEntryMessages.forbiddenOtherOwner,
      });

      const after = await timeEntryById(row.id);
      expect(after?.description).toBe("ajena");
      expect(after?.endedAt).toBeNull();
    });

    it.each(notActive)(
      "no toca ni su propia entrada con la membresía %s",
      async (status) => {
        const actor = await seedActor(role, status);
        const row = await seedTimeEntry({
          workspaceId,
          userId: actor.userId,
          description: "propia",
          startedAt: "2026-10-02T11:00:00Z",
        });

        await expect(
          updateDescription(actor, workspace, { id: row.id, description: "otra" }),
        ).rejects.toMatchObject({
          code: "forbidden",
          message: timeEntryMessages.forbidden,
        });
        await expect(stopTimer(actor, workspace, { id: row.id })).rejects.toMatchObject({
          code: "forbidden",
          message: timeEntryMessages.forbidden,
        });

        const after = await timeEntryById(row.id);
        expect(after?.description).toBe("propia");
        expect(after?.endedAt).toBeNull();
      },
    );

    it("corrige las horas de su entrada cerrada y el inicio de su timer", async () => {
      const actor = await seedActor(role);
      const closed = await seedTimeEntry({
        workspaceId,
        userId: actor.userId,
        startedAt: "2026-10-01T11:00:00Z",
        endedAt: "2026-10-01T12:00:00Z",
      });
      const running = await seedTimeEntry({
        workspaceId,
        userId: actor.userId,
        startedAt: "2026-10-02T11:00:00Z",
      });

      await updateEntryTimes(actor, workspace, { id: closed.id, ...timesValues });
      await updateRunningStart(
        actor,
        workspace,
        { id: running.id, ...runningStartValues },
        trackerNow,
      );

      expect((await timeEntryById(closed.id))?.startedAt.toISOString()).toBe(
        "2026-10-01T12:00:00.000Z",
      );
      expect((await timeEntryById(running.id))?.startedAt.toISOString()).toBe(
        "2026-10-02T10:00:00.000Z",
      );
    });

    it("no corrige las horas ni el inicio de otra persona del workspace", async () => {
      const actor = await seedActor(role);
      const otherId = await seedMember(workspaceId, "member");
      const closed = await seedTimeEntry({
        workspaceId,
        userId: otherId,
        startedAt: "2026-10-01T11:00:00Z",
        endedAt: "2026-10-01T12:00:00Z",
      });
      const running = await seedTimeEntry({
        workspaceId,
        userId: otherId,
        startedAt: "2026-10-02T11:00:00Z",
      });

      await expect(
        updateEntryTimes(actor, workspace, { id: closed.id, ...timesValues }),
      ).rejects.toMatchObject({
        code: "forbidden",
        message: timeEntryMessages.forbiddenOtherOwner,
      });
      await expect(
        updateRunningStart(
          actor,
          workspace,
          { id: running.id, ...runningStartValues },
          trackerNow,
        ),
      ).rejects.toMatchObject({
        code: "forbidden",
        message: timeEntryMessages.forbiddenOtherOwner,
      });

      expect((await timeEntryById(closed.id))?.startedAt.toISOString()).toBe(
        "2026-10-01T11:00:00.000Z",
      );
      expect((await timeEntryById(running.id))?.startedAt.toISOString()).toBe(
        "2026-10-02T11:00:00.000Z",
      );
    });

    it.each(notActive)(
      "no corrige ni sus propias horas con la membresía %s",
      async (status) => {
        const actor = await seedActor(role, status);
        const closed = await seedTimeEntry({
          workspaceId,
          userId: actor.userId,
          startedAt: "2026-10-01T11:00:00Z",
          endedAt: "2026-10-01T12:00:00Z",
        });
        const running = await seedTimeEntry({
          workspaceId,
          userId: actor.userId,
          startedAt: "2026-10-02T11:00:00Z",
        });

        await expect(
          updateEntryTimes(actor, workspace, { id: closed.id, ...timesValues }),
        ).rejects.toMatchObject({
          code: "forbidden",
          message: timeEntryMessages.forbidden,
        });
        await expect(
          updateRunningStart(
            actor,
            workspace,
            { id: running.id, ...runningStartValues },
            trackerNow,
          ),
        ).rejects.toMatchObject({
          code: "forbidden",
          message: timeEntryMessages.forbidden,
        });

        expect((await timeEntryById(closed.id))?.startedAt.toISOString()).toBe(
          "2026-10-01T11:00:00.000Z",
        );
        expect((await timeEntryById(running.id))?.startedAt.toISOString()).toBe(
          "2026-10-02T11:00:00.000Z",
        );
      },
    );
  });

  describe("timeEntry.own.delete", () => {
    it("borra su propia entrada", async () => {
      const actor = await seedActor(role);
      const row = await seedTimeEntry({
        workspaceId,
        userId: actor.userId,
        startedAt: "2026-10-02T11:00:00Z",
        endedAt: "2026-10-02T12:00:00Z",
      });

      const result = await deleteEntry(actor, { id: row.id });

      expect(result.id).toBe(row.id);
      expect(await timeEntryById(row.id)).toBeUndefined();
    });

    it("no borra la entrada de otra persona del workspace", async () => {
      const actor = await seedActor(role);
      const otherId = await seedMember(workspaceId, "member");
      const row = await seedTimeEntry({
        workspaceId,
        userId: otherId,
        description: "ajena",
        startedAt: "2026-10-02T11:00:00Z",
      });

      await expect(deleteEntry(actor, { id: row.id })).rejects.toMatchObject({
        code: "forbidden",
        message: timeEntryMessages.forbiddenOtherOwner,
      });
      expect(await timeEntryById(row.id)).toBeDefined();
    });

    it.each(notActive)(
      "no borra ni su propia entrada con la membresía %s",
      async (status) => {
        const actor = await seedActor(role, status);
        const row = await seedTimeEntry({
          workspaceId,
          userId: actor.userId,
          startedAt: "2026-10-02T11:00:00Z",
        });

        await expect(deleteEntry(actor, { id: row.id })).rejects.toMatchObject({
          code: "forbidden",
          message: timeEntryMessages.forbidden,
        });
        expect(await timeEntryById(row.id)).toBeDefined();
      },
    );
  });

  /**
   * Continuar y duplicar consultan `timeEntry.own.create` dos veces: sobre el
   * actor y sobre el dueño de la original. Descartar, `timeEntry.own.delete`
   * sobre el dueño del timer.
   */
  describe("continuar, duplicar y descartar", () => {
    /** Una entrada cerrada de `userId`, la original de continuar y duplicar. */
    function seedSource(userId: string) {
      return seedTimeEntry({
        workspaceId,
        userId,
        description: "original",
        startedAt: "2026-10-01T11:00:00Z",
        endedAt: "2026-10-01T12:00:00Z",
      });
    }

    function seedRunningOf(userId: string) {
      return seedTimeEntry({ workspaceId, userId, startedAt: "2026-10-02T11:00:00Z" });
    }

    it("continúa, duplica y descarta lo propio", async () => {
      const actor = await seedActor(role);
      const source = await seedSource(actor.userId);

      const copy = await duplicateEntry(actor, workspace, {
        id: randomUUID(),
        sourceId: source.id,
      });
      const continued = await continueEntry(actor, workspace, {
        id: randomUUID(),
        sourceId: source.id,
      });
      const discarded = await discardTimer(actor, { id: continued.running.id });

      expect((await timeEntryById(copy.created.id))?.userId).toBe(actor.userId);
      expect(discarded.id).toBe(continued.running.id);
      expect(await timeEntriesOf(workspaceId, actor.userId)).toHaveLength(2);
    });

    it("no continúa, no duplica ni descarta lo de otra persona del workspace", async () => {
      const actor = await seedActor(role);
      const otherId = await seedMember(workspaceId, "member");
      const source = await seedSource(otherId);
      const running = await seedRunningOf(otherId);
      const expected = {
        code: "forbidden",
        message: timeEntryMessages.forbiddenOtherOwner,
      };

      await expect(
        continueEntry(actor, workspace, { id: randomUUID(), sourceId: source.id }),
      ).rejects.toMatchObject(expected);
      await expect(
        duplicateEntry(actor, workspace, { id: randomUUID(), sourceId: source.id }),
      ).rejects.toMatchObject(expected);
      await expect(discardTimer(actor, { id: running.id })).rejects.toMatchObject(
        expected,
      );
      expect(await timeEntriesOf(workspaceId, otherId)).toEqual([source, running]);
      expect(await timeEntriesOf(workspaceId, actor.userId)).toEqual([]);
    });

    it.each(notActive)(
      "con la membresía %s no continúa, no duplica ni descarta ni lo propio",
      async (status) => {
        const actor = await seedActor(role, status);
        const source = await seedSource(actor.userId);
        const running = await seedRunningOf(actor.userId);
        const expected = { code: "forbidden", message: timeEntryMessages.forbidden };

        await expect(
          continueEntry(actor, workspace, { id: randomUUID(), sourceId: source.id }),
        ).rejects.toMatchObject(expected);
        await expect(
          duplicateEntry(actor, workspace, { id: randomUUID(), sourceId: source.id }),
        ).rejects.toMatchObject(expected);
        await expect(discardTimer(actor, { id: running.id })).rejects.toMatchObject(
          expected,
        );
        expect(await timeEntriesOf(workspaceId, actor.userId)).toEqual([source, running]);
      },
    );
  });
});

describe("aislamiento entre workspaces", () => {
  it("un actor de otro workspace recibe not_found y no forbidden en las tres acciones", async () => {
    const other = await seedWorkspace(buenosAires);
    const outsider: Actor = {
      userId: other.ownerId,
      workspaceId: other.workspaceId,
      role: "owner",
      status: "active",
    };
    const row = await seedTimeEntry({
      workspaceId,
      userId: ownerId,
      description: "de este workspace",
      startedAt: "2026-10-02T11:00:00Z",
    });

    // Entre workspaces no se filtra ni siquiera la existencia de la fila.
    await expect(stopTimer(outsider, workspace, { id: row.id })).rejects.toMatchObject({
      code: "not_found",
      message: timeEntryMessages.notFound,
    });
    await expect(
      updateDescription(outsider, workspace, { id: row.id, description: "mía" }),
    ).rejects.toMatchObject({ code: "not_found", message: timeEntryMessages.notFound });
    await expect(deleteEntry(outsider, { id: row.id })).rejects.toMatchObject({
      code: "not_found",
      message: timeEntryMessages.notFound,
    });

    const after = await timeEntryById(row.id);
    expect(after?.description).toBe("de este workspace");
    expect(after?.endedAt).toBeNull();
  });

  it("el mismo usuario con membresía en los dos workspaces no alcanza su entrada del otro", async () => {
    const other = await seedWorkspace(buenosAires);
    await db
      .insert(membership)
      .values({ workspaceId: other.workspaceId, userId: ownerId, role: "member" });
    const elsewhere: Actor = {
      userId: ownerId,
      workspaceId: other.workspaceId,
      role: "member",
      status: "active",
    };
    const row = await seedTimeEntry({
      workspaceId,
      userId: ownerId,
      description: "propia pero de otro workspace",
      startedAt: "2026-10-02T11:00:00Z",
    });

    await expect(stopTimer(elsewhere, workspace, { id: row.id })).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      updateDescription(elsewhere, workspace, { id: row.id, description: "mía" }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(deleteEntry(elsewhere, { id: row.id })).rejects.toMatchObject({
      code: "not_found",
    });

    const after = await timeEntryById(row.id);
    expect(after?.description).toBe("propia pero de otro workspace");
    expect(after?.endedAt).toBeNull();
  });

  it("no ve en su estado las entradas de otro workspace", async () => {
    const other = await seedWorkspace(buenosAires);
    await db
      .insert(membership)
      .values({ workspaceId: other.workspaceId, userId: ownerId, role: "member" });
    const elsewhere: Actor = {
      userId: ownerId,
      workspaceId: other.workspaceId,
      role: "member",
      status: "active",
    };
    await seedTimeEntry({
      workspaceId,
      userId: ownerId,
      description: "cerrada",
      startedAt: "2026-10-02T11:00:00Z",
      endedAt: "2026-10-02T12:00:00Z",
    });
    await seedTimeEntry({
      workspaceId,
      userId: ownerId,
      description: "corriendo",
      startedAt: "2026-10-02T13:00:00Z",
    });

    const outside = await getTrackerState(
      elsewhere,
      workspace,
      { from: null },
      trackerNow,
    );
    const inside = await getTrackerState(
      { userId: ownerId, workspaceId, role: "owner", status: "active" },
      workspace,
      { from: null },
      trackerNow,
    );

    expect(outside.hasAnyEntry).toBe(false);
    expect(outside.weeks).toEqual([]);
    expect(outside.running).toBeNull();
    expect(inside.running?.description).toBe("corriendo");
    expect(
      inside.weeks.flatMap((week) => week.days).flatMap((day) => day.entries),
    ).toHaveLength(1);
  });

  it("un actor de otro workspace agrega su entrada a mano allá y no acá", async () => {
    const other = await seedWorkspace(buenosAires);
    const outsider: Actor = {
      userId: other.ownerId,
      workspaceId: other.workspaceId,
      role: "owner",
      status: "active",
    };

    // El workspace que recibe el service solo aporta la zona y el piso; de
    // dónde es la fila lo decide el actor.
    const result = await createManualEntry(outsider, workspace, manualValues);

    const row = await timeEntryById(result.created.id);
    expect(row?.workspaceId).toBe(other.workspaceId);
    expect(row?.userId).toBe(other.ownerId);
    expect(await timeEntriesOf(workspaceId, ownerId)).toEqual([]);
    const here = await getTrackerState(
      { userId: ownerId, workspaceId, role: "owner", status: "active" },
      workspace,
      { from: null },
      trackerNow,
    );
    expect(here.hasAnyEntry).toBe(false);
    expect(here.weeks).toEqual([]);
  });

  it("la entrada a mano del mismo usuario cae en el workspace de la sesión", async () => {
    const other = await seedWorkspace(buenosAires);
    await db
      .insert(membership)
      .values({ workspaceId: other.workspaceId, userId: ownerId, role: "member" });
    const elsewhere: Actor = {
      userId: ownerId,
      workspaceId: other.workspaceId,
      role: "member",
      status: "active",
    };
    await seedTimeEntry({
      workspaceId,
      userId: ownerId,
      description: "de acá",
      startedAt: "2026-10-02T11:00:00Z",
      endedAt: "2026-10-02T12:00:00Z",
    });

    const result = await createManualEntry(elsewhere, workspace, manualValues);

    expect((await timeEntryById(result.created.id))?.workspaceId).toBe(other.workspaceId);
    const here = await timeEntriesOf(workspaceId, ownerId);
    expect(here.map((row) => row.description)).toEqual(["de acá"]);
    const there = await timeEntriesOf(other.workspaceId, ownerId);
    expect(there.map((row) => row.id)).toEqual([result.created.id]);
    const state = await getTrackerState(
      { userId: ownerId, workspaceId, role: "owner", status: "active" },
      workspace,
      { from: null },
      trackerNow,
    );
    expect(
      state.weeks
        .flatMap((week) => week.days)
        .flatMap((day) => day.entries)
        .map((entry) => entry.id),
    ).not.toContain(result.created.id);
  });

  it("un timer corriendo en otro workspace no frena el agregado a mano acá", async () => {
    const other = await seedWorkspace(buenosAires);
    await db
      .insert(membership)
      .values({ workspaceId: other.workspaceId, userId: ownerId, role: "member" });
    const running = await seedTimeEntry({
      workspaceId: other.workspaceId,
      userId: ownerId,
      description: "corriendo allá",
      startedAt: "2026-10-02T11:00:00Z",
    });
    const actor: Actor = {
      userId: ownerId,
      workspaceId,
      role: "owner",
      status: "active",
    };

    // El corte de TT-30 mira el timer del workspace de la sesión, no el de
    // cualquier workspace de la persona.
    const result = await createManualEntry(actor, workspace, manualValues);

    expect((await timeEntryById(result.created.id))?.workspaceId).toBe(workspaceId);
    expect((await timeEntryById(running.id))?.endedAt).toBeNull();
  });

  it("arrancar en un workspace no cierra el timer activo del otro", async () => {
    const other = await seedWorkspace(buenosAires);
    await db
      .insert(membership)
      .values({ workspaceId: other.workspaceId, userId: ownerId, role: "member" });
    const elsewhere: Actor = {
      userId: ownerId,
      workspaceId: other.workspaceId,
      role: "member",
      status: "active",
    };
    await seedTimeEntry({
      workspaceId,
      userId: ownerId,
      description: "corriendo acá",
      startedAt: "2026-10-02T11:00:00Z",
    });

    const started = await startTimer(elsewhere, workspace, {
      projectId: null,
      taskId: null,
      id: randomUUID(),
      description: "corriendo allá",
    });

    expect(started.stopped).toBeNull();
    const here = await timeEntriesOf(workspaceId, ownerId);
    const there = await timeEntriesOf(other.workspaceId, ownerId);
    expect(here).toHaveLength(1);
    expect(here[0].endedAt).toBeNull();
    expect(there).toHaveLength(1);
    expect(there[0].endedAt).toBeNull();
  });
});

describe("aislamiento entre workspaces en la edición de horas", () => {
  it("un actor de otro workspace recibe not_found por las dos y no escribe", async () => {
    const other = await seedWorkspace(buenosAires);
    const outsider: Actor = {
      userId: other.ownerId,
      workspaceId: other.workspaceId,
      role: "owner",
      status: "active",
    };
    const closed = await seedTimeEntry({
      workspaceId,
      userId: ownerId,
      startedAt: "2026-10-01T11:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
    });
    const running = await seedTimeEntry({
      workspaceId,
      userId: ownerId,
      startedAt: "2026-10-02T11:00:00Z",
    });

    await expect(
      updateEntryTimes(outsider, workspace, { id: closed.id, ...timesValues }),
    ).rejects.toMatchObject({ code: "not_found", message: timeEntryMessages.notFound });
    await expect(
      updateRunningStart(
        outsider,
        workspace,
        { id: running.id, ...runningStartValues },
        trackerNow,
      ),
    ).rejects.toMatchObject({ code: "not_found", message: timeEntryMessages.notFound });

    expect((await timeEntryById(closed.id))?.startedAt.toISOString()).toBe(
      "2026-10-01T11:00:00.000Z",
    );
    expect((await timeEntryById(running.id))?.startedAt.toISOString()).toBe(
      "2026-10-02T11:00:00.000Z",
    );
  });
});

describe("membresía que dejó de estar activa", () => {
  it.each(notActive)("con %s sigue leyendo sus entradas y su timer", async (status) => {
    const actor = await seedActor("member", status);
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      description: "cerrada",
      startedAt: "2026-10-02T11:00:00Z",
      endedAt: "2026-10-02T12:00:00Z",
    });
    await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      description: "corriendo",
      startedAt: "2026-10-02T13:00:00Z",
    });

    const state = await getTrackerState(actor, workspace, { from: null }, trackerNow);

    expect(state.canTrack).toBe(false);
    expect(state.hasAnyEntry).toBe(true);
    expect(state.running?.description).toBe("corriendo");
    expect(
      state.weeks
        .flatMap((week) => week.days)
        .flatMap((day) => day.entries)
        .map((entry) => entry.description),
    ).toEqual(["cerrada"]);
  });
});

describe("el permiso va antes que la fila propia (ADR 0007)", () => {
  it.each(notActive)(
    "con %s, el id de una entrada propia que existe da forbidden y no la entrada",
    async (status) => {
      const actor = await seedActor("member", status);
      const own = await seedTimeEntry({
        workspaceId,
        userId: actor.userId,
        description: "propia",
        startedAt: "2026-10-02T11:00:00Z",
      });

      await expect(
        startTimer(actor, workspace, {
          projectId: null,
          taskId: null,
          id: own.id,
          description: "propia",
        }),
      ).rejects.toMatchObject({
        code: "forbidden",
        message: timeEntryMessages.forbidden,
      });
      expect(await timeEntriesOf(workspaceId, actor.userId)).toEqual([own]);
    },
  );
});

describe("el permiso va antes que la fila propia en continuar y duplicar (ADR 0007)", () => {
  it.each(notActive)(
    "con %s, el id de una entrada propia que existe da forbidden y no la entrada",
    async (status) => {
      const actor = await seedActor("member", status);
      const source = await seedTimeEntry({
        workspaceId,
        userId: actor.userId,
        startedAt: "2026-10-01T11:00:00Z",
        endedAt: "2026-10-01T12:00:00Z",
      });
      const own = await seedTimeEntry({
        workspaceId,
        userId: actor.userId,
        startedAt: "2026-10-02T11:00:00Z",
      });
      const values = { id: own.id, sourceId: source.id };

      await expect(continueEntry(actor, workspace, values)).rejects.toMatchObject({
        code: "forbidden",
        message: timeEntryMessages.forbidden,
      });
      await expect(duplicateEntry(actor, workspace, values)).rejects.toMatchObject({
        code: "forbidden",
        message: timeEntryMessages.forbidden,
      });
      expect(await timeEntriesOf(workspaceId, actor.userId)).toEqual([source, own]);
    },
  );
});

describe("aislamiento entre workspaces en continuar, duplicar y descartar", () => {
  it("un actor de otro workspace recibe not_found al continuar y duplicar, y el descarte no borra", async () => {
    const other = await seedWorkspace(buenosAires);
    const outsider: Actor = {
      userId: other.ownerId,
      workspaceId: other.workspaceId,
      role: "owner",
      status: "active",
    };
    const source = await seedTimeEntry({
      workspaceId,
      userId: ownerId,
      startedAt: "2026-10-01T11:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
    });
    const running = await seedTimeEntry({
      workspaceId,
      userId: ownerId,
      startedAt: "2026-10-02T11:00:00Z",
    });
    const missing = { code: "not_found", message: timeEntryMessages.notFound };

    await expect(
      continueEntry(outsider, workspace, { id: randomUUID(), sourceId: source.id }),
    ).rejects.toMatchObject(missing);
    await expect(
      duplicateEntry(outsider, workspace, { id: randomUUID(), sourceId: source.id }),
    ).rejects.toMatchObject(missing);
    // Lo que se pidió es que ese timer no esté: para quien no lo ve, no está.
    await expect(discardTimer(outsider, { id: running.id })).resolves.toEqual({
      id: running.id,
    });

    expect(await timeEntriesOf(workspaceId, ownerId)).toEqual([source, running]);
    expect(await timeEntriesOf(other.workspaceId, other.ownerId)).toEqual([]);
  });
});

describe("el filtro por dueño del repository", () => {
  // Defensa en profundidad: hoy el service nunca llega acá con una entrada
  // ajena, porque `readOwnEntry` la rechaza antes. El filtro es para cuando
  // exista una acción sobre entradas de otra persona. Cada caso termina con el
  // dueño real, para que se vea que lo que frenó la escritura fue el dueño y
  // no un id o un workspace equivocados.
  it("no borra la entrada de otra persona", async () => {
    const otherId = await seedMember(workspaceId, "member");
    const row = await seedTimeEntry({
      workspaceId,
      userId: otherId,
      description: "ajena",
      startedAt: "2026-10-02T11:00:00Z",
    });

    const foreign = await db.transaction((tx) =>
      timeEntryRepository.deleteById(tx, { workspaceId, userId: ownerId, id: row.id }),
    );

    expect(foreign).toBeUndefined();
    expect(await timeEntryById(row.id)).toBeDefined();
    const own = await db.transaction((tx) =>
      timeEntryRepository.deleteById(tx, { workspaceId, userId: otherId, id: row.id }),
    );
    expect(own?.id).toBe(row.id);
    expect(await timeEntryById(row.id)).toBeUndefined();
  });

  it("no cambia la descripción de la entrada de otra persona", async () => {
    const otherId = await seedMember(workspaceId, "member");
    const row = await seedTimeEntry({
      workspaceId,
      userId: otherId,
      description: "ajena",
      startedAt: "2026-10-02T11:00:00Z",
    });

    const foreign = await db.transaction((tx) =>
      timeEntryRepository.updateDescription(
        tx,
        { workspaceId, userId: ownerId, id: row.id },
        "mía",
      ),
    );

    expect(foreign).toBeUndefined();
    expect((await timeEntryById(row.id))?.description).toBe("ajena");
    const own = await db.transaction((tx) =>
      timeEntryRepository.updateDescription(
        tx,
        { workspaceId, userId: otherId, id: row.id },
        "de su dueña",
      ),
    );
    expect(own?.description).toBe("de su dueña");
  });

  it("no detiene el timer de otra persona", async () => {
    const otherId = await seedMember(workspaceId, "member");
    const row = await seedTimeEntry({
      workspaceId,
      userId: otherId,
      startedAt: "2026-10-02T11:00:00Z",
    });

    const foreign = await db.transaction((tx) =>
      timeEntryRepository.stopById(tx, { workspaceId, userId: ownerId, id: row.id }),
    );

    expect(foreign).toBeUndefined();
    expect((await timeEntryById(row.id))?.endedAt).toBeNull();
    const own = await db.transaction((tx) =>
      timeEntryRepository.stopById(tx, { workspaceId, userId: otherId, id: row.id }),
    );
    expect(own?.endedAt).not.toBeNull();
    expect((await timeEntryById(row.id))?.endedAt).not.toBeNull();
  });

  it("no corrige las horas de la entrada de otra persona", async () => {
    const otherId = await seedMember(workspaceId, "member");
    const row = await seedTimeEntry({
      workspaceId,
      userId: otherId,
      startedAt: "2026-10-01T11:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
    });
    const times = {
      startedAt: new Date("2026-10-01T12:00:00Z"),
      endedAt: new Date("2026-10-01T13:00:00Z"),
    };

    const foreign = await db.transaction((tx) =>
      timeEntryRepository.updateClosedEntry(
        tx,
        { workspaceId, userId: ownerId, id: row.id },
        times,
      ),
    );

    expect(foreign).toBeUndefined();
    expect((await timeEntryById(row.id))?.startedAt.toISOString()).toBe(
      "2026-10-01T11:00:00.000Z",
    );
    const own = await db.transaction((tx) =>
      timeEntryRepository.updateClosedEntry(
        tx,
        { workspaceId, userId: otherId, id: row.id },
        times,
      ),
    );
    expect(own?.startedAt.toISOString()).toBe("2026-10-01T12:00:00.000Z");
  });

  it("no descarta el timer de otra persona", async () => {
    const otherId = await seedMember(workspaceId, "member");
    const row = await seedTimeEntry({
      workspaceId,
      userId: otherId,
      startedAt: "2026-10-02T11:00:00Z",
    });

    const foreign = await db.transaction((tx) =>
      timeEntryRepository.deleteRunningById(tx, {
        workspaceId,
        userId: ownerId,
        id: row.id,
      }),
    );

    expect(foreign).toBeUndefined();
    expect(await timeEntryById(row.id)).toBeDefined();
    const own = await db.transaction((tx) =>
      timeEntryRepository.deleteRunningById(tx, {
        workspaceId,
        userId: otherId,
        id: row.id,
      }),
    );
    expect(own?.id).toBe(row.id);
    expect(await timeEntryById(row.id)).toBeUndefined();
  });

  it("no corrige el inicio del timer de otra persona", async () => {
    const otherId = await seedMember(workspaceId, "member");
    const row = await seedTimeEntry({
      workspaceId,
      userId: otherId,
      startedAt: "2026-10-02T11:00:00Z",
    });
    const startedAt = new Date("2026-10-02T10:00:00Z");

    const foreign = await db.transaction((tx) =>
      timeEntryRepository.updateRunningEntry(
        tx,
        { workspaceId, userId: ownerId, id: row.id },
        { startedAt },
      ),
    );

    expect(foreign).toBeUndefined();
    expect((await timeEntryById(row.id))?.startedAt.toISOString()).toBe(
      "2026-10-02T11:00:00.000Z",
    );
    const own = await db.transaction((tx) =>
      timeEntryRepository.updateRunningEntry(
        tx,
        { workspaceId, userId: otherId, id: row.id },
        { startedAt },
      ),
    );
    expect(own?.startedAt.toISOString()).toBe("2026-10-02T10:00:00.000Z");
  });
});

describe("quién asigna qué proyecto (§3: TT-08, PR-17)", () => {
  function seedOwnEntry(userId: string) {
    return seedTimeEntry({
      workspaceId,
      userId,
      startedAt: "2026-10-01T11:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
    });
  }

  it.each(roles)(
    "%s asigna un público, y un privado solo si es miembro",
    async (role) => {
      const actor = await seedActor(role);
      const open = await seedProject({ workspaceId });
      const vault = await seedProject({ workspaceId, isPublic: false });
      const joined = await seedProject({
        workspaceId,
        isPublic: false,
        members: [{ userId: actor.userId }],
      });
      const entry = await seedOwnEntry(actor.userId);

      for (const target of [open, joined]) {
        const result = await updateEntryProject(actor, workspace, {
          id: entry.id,
          projectId: target.id,
          taskId: null,
        });
        expect(result.entry.project?.id).toBe(target.id);
      }
      await expect(
        updateEntryProject(actor, workspace, {
          id: entry.id,
          projectId: vault.id,
          taskId: null,
        }),
      ).rejects.toMatchObject({
        code: "not_found",
        message: projectMessages.projectUnavailable,
      });
      expect((await timeEntryById(entry.id))?.projectId).toBe(joined.id);
    },
  );

  it.each(roles)(
    "%s no cambia el proyecto de la entrada de otra persona",
    async (role) => {
      const actor = await seedActor(role);
      const open = await seedProject({ workspaceId });
      const otherId = await seedMember(workspaceId, "member");
      const foreign = await seedOwnEntry(otherId);
      await expect(
        updateEntryProject(actor, workspace, {
          id: foreign.id,
          projectId: open.id,
          taskId: null,
        }),
      ).rejects.toMatchObject({
        code: "forbidden",
        message: timeEntryMessages.forbiddenOtherOwner,
      });
      expect((await timeEntryById(foreign.id))?.projectId).toBeNull();
    },
  );

  it.each(notActive)(
    "con la membresía %s no cambia el proyecto, tampoco a «Sin proyecto»",
    async (status) => {
      const actor = await seedActor("member", status);
      const open = await seedProject({
        workspaceId,
        members: [{ userId: actor.userId }],
      });
      const entry = await seedTimeEntry({
        workspaceId,
        userId: actor.userId,
        startedAt: "2026-10-01T11:00:00Z",
        endedAt: "2026-10-01T12:00:00Z",
        projectId: open.id,
      });
      for (const projectId of [null, open.id]) {
        await expect(
          updateEntryProject(actor, workspace, { id: entry.id, projectId, taskId: null }),
        ).rejects.toMatchObject({
          code: "forbidden",
          message: timeEntryMessages.forbidden,
        });
      }
      expect((await timeEntryById(entry.id))?.projectId).toBe(open.id);
    },
  );

  it("un actor de otro workspace recibe not_found y no escribe", async () => {
    const other = await seedWorkspace(buenosAires);
    const elsewhere: Actor = {
      userId: other.ownerId,
      workspaceId: other.workspaceId,
      role: "owner",
      status: "active",
    };
    const theirs = await seedProject({ workspaceId: other.workspaceId });
    const entry = await seedOwnEntry(ownerId);
    await expect(
      updateEntryProject(elsewhere, workspace, {
        id: entry.id,
        projectId: theirs.id,
        taskId: null,
      }),
    ).rejects.toMatchObject({ code: "not_found", message: timeEntryMessages.notFound });
    expect((await timeEntryById(entry.id))?.projectId).toBeNull();
  });

  it("el filtro por dueño del repository no cambia el proyecto de la entrada de otra persona", async () => {
    const open = await seedProject({ workspaceId });
    const otherId = await seedMember(workspaceId, "member");
    const row = await seedOwnEntry(otherId);
    const pair = { projectId: open.id, taskId: null, billable: false };

    const foreign = await db.transaction((tx) =>
      timeEntryRepository.updateProject(
        tx,
        { workspaceId, userId: ownerId, id: row.id },
        pair,
      ),
    );
    expect(foreign).toBeUndefined();
    expect((await timeEntryById(row.id))?.projectId).toBeNull();
    const own = await db.transaction((tx) =>
      timeEntryRepository.updateProject(
        tx,
        { workspaceId, userId: otherId, id: row.id },
        pair,
      ),
    );
    expect(own?.project?.id).toBe(open.id);
  });
});

/**
 * Las operaciones en masa consultan `can()` dos veces, como `discardTimer`:
 * sobre el actor antes de leer, y sobre el dueño de cada fila leída (§3).
 */
describe("operaciones en masa (criterio 16, TT-66)", () => {
  function seedClosedOf(userId: string, description = "") {
    return seedTimeEntry({
      workspaceId,
      userId,
      description,
      startedAt: "2026-10-01T13:00:00Z",
      endedAt: "2026-10-01T14:00:00Z",
    });
  }

  it.each(roles)("%s edita y borra en masa sus propias entradas", async (role) => {
    const actor = await seedActor(role);
    const edited = await seedClosedOf(actor.userId);
    const removed = await seedClosedOf(actor.userId);

    const result = await bulkEditEntries(actor, workspace, {
      ids: [edited.id],
      changes: { description: "nueva" },
    });
    await bulkDeleteEntries(actor, { ids: [removed.id] });

    expect(result.entries[0].description).toBe("nueva");
    expect(await timeEntryById(removed.id)).toBeUndefined();
  });

  it.each(roles)(
    "%s recibe un rechazo con el texto de TT-79 por la entrada de otra persona",
    async (role) => {
      const actor = await seedActor(role);
      const otherId = await seedMember(workspaceId, "member");
      const own = await seedClosedOf(actor.userId);
      const foreign = await seedClosedOf(otherId, "ajena");
      const rejection = {
        id: foreign.id,
        code: "forbidden",
        message: timeEntryMessages.forbiddenOtherOwner,
      };

      const edit = bulkEditEntries(actor, workspace, {
        ids: [own.id, foreign.id],
        changes: { description: "nueva" },
      });
      await expect(edit).rejects.toBeInstanceOf(RejectedError);
      await expect(edit).rejects.toMatchObject({ rejections: [rejection] });
      const remove = bulkDeleteEntries(actor, { ids: [own.id, foreign.id] });
      await expect(remove).rejects.toBeInstanceOf(RejectedError);
      await expect(remove).rejects.toMatchObject({ rejections: [rejection] });

      expect(await timeEntryById(foreign.id)).toMatchObject({ description: "ajena" });
      expect(await timeEntryById(own.id)).toMatchObject({ description: "" });
    },
  );

  it.each(notActive)(
    "con la membresía %s las dos responden forbidden sin lista, también con ids que no existen",
    async (status) => {
      const actor = await seedActor("member", status);
      const own = await seedClosedOf(actor.userId);
      const missing = randomUUID();

      for (const ids of [[own.id], [missing], [own.id, missing]]) {
        for (const work of [
          () => bulkEditEntries(actor, workspace, { ids, changes: { description: "x" } }),
          () => bulkDeleteEntries(actor, { ids }),
        ]) {
          const error: unknown = await work().then(
            () => null,
            (reason: unknown) => reason,
          );
          expect(error).not.toBeInstanceOf(RejectedError);
          expect(error).toMatchObject({
            code: "forbidden",
            message: timeEntryMessages.forbidden,
          });
        }
      }
      expect(await timeEntryById(own.id)).toMatchObject({ description: "" });
    },
  );

  it("un actor de otro workspace no alcanza la entrada: not_found al editar, y el borrado no la toca", async () => {
    const other = await seedWorkspace(buenosAires);
    const outsider: Actor = {
      userId: other.ownerId,
      workspaceId: other.workspaceId,
      role: "owner",
      status: "active",
    };
    const row = await seedClosedOf(ownerId, "de acá");

    await expect(
      bulkEditEntries(outsider, workspace, {
        ids: [row.id],
        changes: { description: "x" },
      }),
    ).rejects.toMatchObject({
      rejections: [
        { id: row.id, code: "not_found", message: timeEntryMessages.notFound },
      ],
    });
    expect(await bulkDeleteEntries(outsider, { ids: [row.id] })).toEqual({
      ids: [row.id],
    });
    expect(await timeEntryById(row.id)).toMatchObject({ description: "de acá" });
  });
});

describe("el guardado del diálogo (updateEntry, criterio 7, TT-66)", () => {
  function seedClosedOf(userId: string, description = "") {
    return seedTimeEntry({
      workspaceId,
      userId,
      description,
      startedAt: "2026-10-01T11:00:00Z",
      endedAt: "2026-10-01T12:00:00Z",
    });
  }

  it.each(roles)("%s guarda su entrada cerrada y su timer", async (role) => {
    const actor = await seedActor(role);
    const closed = await seedClosedOf(actor.userId);
    const running = await seedTimeEntry({
      workspaceId,
      userId: actor.userId,
      startedAt: "2026-10-02T11:00:00Z",
    });

    const fromClosed = await updateEntry(actor, workspace, {
      id: closed.id,
      changes: { description: "cerrada", times: timesValues },
    });
    const fromRunning = await updateEntry(
      actor,
      workspace,
      {
        id: running.id,
        changes: { description: "corriendo", runningStart: runningStartValues },
      },
      trackerNow,
    );

    expect(fromClosed.entry).toMatchObject({
      description: "cerrada",
      startedAt: "2026-10-01T12:00:00.000Z",
      endedAt: "2026-10-01T13:30:00.000Z",
    });
    expect(fromRunning.entry).toMatchObject({
      description: "corriendo",
      startedAt: "2026-10-02T10:00:00.000Z",
      endedAt: null,
    });
  });

  it.each(roles)(
    "%s recibe el texto de TT-79 por la ajena que corre y por la de más de un día, antes que su estado o su horario",
    async (role) => {
      const actor = await seedActor(role);
      const otherId = await seedMember(workspaceId, "member");
      const foreignRunning = await seedTimeEntry({
        workspaceId,
        userId: otherId,
        description: "ajena",
        startedAt: "2026-10-02T11:00:00Z",
      });
      const foreignMultiDay = await seedTimeEntry({
        workspaceId,
        userId: otherId,
        description: "ajena",
        startedAt: "2026-09-29T11:00:00Z",
        endedAt: "2026-10-01T12:00:00Z",
      });

      for (const row of [foreignRunning, foreignMultiDay]) {
        await expect(
          updateEntry(actor, workspace, {
            id: row.id,
            changes: { description: "mía", times: timesValues },
          }),
        ).rejects.toMatchObject({
          code: "forbidden",
          message: timeEntryMessages.forbiddenOtherOwner,
        });
        expect(await timeEntryById(row.id)).toEqual(row);
      }
    },
  );

  it.each(notActive)(
    "con la membresía %s no guarda ni su propia entrada",
    async (status) => {
      const actor = await seedActor("member", status);
      const own = await seedClosedOf(actor.userId, "propia");

      await expect(
        updateEntry(actor, workspace, { id: own.id, changes: { description: "otra" } }),
      ).rejects.toMatchObject({
        code: "forbidden",
        message: timeEntryMessages.forbidden,
      });
      expect(await timeEntryById(own.id)).toEqual(own);
    },
  );

  it("un actor de otro workspace recibe not_found y no escribe", async () => {
    const other = await seedWorkspace(buenosAires);
    const outsider: Actor = {
      userId: other.ownerId,
      workspaceId: other.workspaceId,
      role: "owner",
      status: "active",
    };
    const row = await seedClosedOf(ownerId, "de acá");

    await expect(
      updateEntry(outsider, workspace, { id: row.id, changes: { description: "x" } }),
    ).rejects.toMatchObject({ code: "not_found", message: timeEntryMessages.notFound });
    expect(await timeEntryById(row.id)).toEqual(row);
  });

  it("el filtro por dueño del repository no escribe el par en la entrada de otra persona", async () => {
    const otherId = await seedMember(workspaceId, "member");
    const web = await seedProject({ workspaceId });
    const closed = await seedClosedOf(otherId);
    const running = await seedTimeEntry({
      workspaceId,
      userId: otherId,
      startedAt: "2026-10-02T11:00:00Z",
    });
    const pair = { projectId: web.id, taskId: null };

    const foreign = await db.transaction(async (tx) => [
      await timeEntryRepository.updateClosedEntry(
        tx,
        { workspaceId, userId: ownerId, id: closed.id },
        { pair },
      ),
      await timeEntryRepository.updateRunningEntry(
        tx,
        { workspaceId, userId: ownerId, id: running.id },
        { pair },
      ),
    ]);

    expect(foreign).toEqual([undefined, undefined]);
    expect(await timeEntryById(closed.id)).toEqual(closed);
    expect(await timeEntryById(running.id)).toEqual(running);
  });
});
