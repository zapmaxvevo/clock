import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { membership } from "@/server/db/schema";
import type { Actor, MembershipStatus, Role } from "@/server/permissions";
import { buenosAires, seedMember, seedTimeEntry, seedWorkspace } from "@/test/factories";
import { timeEntriesOf, timeEntryById } from "@/test/queries";

import { timeEntryRepository } from "./repository";
import { timeEntryMessages } from "./schema";
import {
  deleteEntry,
  getTrackerState,
  startTimer,
  stopTimer,
  updateDescription,
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

      const result = await startTimer(actor, buenosAires, { description: "trabajo" });

      const row = await timeEntryById(result.running.id);
      expect(row?.userId).toBe(actor.userId);
      expect(row?.workspaceId).toBe(workspaceId);
      expect(row?.endedAt).toBeNull();
      const state = await getTrackerState(actor, buenosAires, trackerNow);
      expect(state.canTrack).toBe(true);
    });

    it.each(notActive)("no abre nada con la membresía %s", async (status) => {
      const actor = await seedActor(role, status);

      await expect(
        startTimer(actor, buenosAires, { description: "no va" }),
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

        const state = await getTrackerState(actor, buenosAires, trackerNow);

        // La vista, no la mutación: el mismo `can()` que corta el arranque.
        expect(state.canTrack).toBe(false);
      },
    );
  });

  describe("timeEntry.own.update", () => {
    it("edita y detiene su propia entrada", async () => {
      const actor = await seedActor(role);
      const started = await startTimer(actor, buenosAires, { description: "" });

      await updateDescription(actor, buenosAires, {
        id: started.running.id,
        description: "revisión",
      });
      const result = await stopTimer(actor, buenosAires, { id: started.running.id });

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
        updateDescription(actor, buenosAires, { id: row.id, description: "mía" }),
      ).rejects.toMatchObject({
        code: "forbidden",
        message: timeEntryMessages.forbiddenOtherOwner,
      });
      await expect(stopTimer(actor, buenosAires, { id: row.id })).rejects.toMatchObject({
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
          updateDescription(actor, buenosAires, { id: row.id, description: "otra" }),
        ).rejects.toMatchObject({
          code: "forbidden",
          message: timeEntryMessages.forbidden,
        });
        await expect(stopTimer(actor, buenosAires, { id: row.id })).rejects.toMatchObject(
          {
            code: "forbidden",
            message: timeEntryMessages.forbidden,
          },
        );

        const after = await timeEntryById(row.id);
        expect(after?.description).toBe("propia");
        expect(after?.endedAt).toBeNull();
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
    await expect(stopTimer(outsider, buenosAires, { id: row.id })).rejects.toMatchObject({
      code: "not_found",
      message: timeEntryMessages.notFound,
    });
    await expect(
      updateDescription(outsider, buenosAires, { id: row.id, description: "mía" }),
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

    await expect(stopTimer(elsewhere, buenosAires, { id: row.id })).rejects.toMatchObject(
      { code: "not_found" },
    );
    await expect(
      updateDescription(elsewhere, buenosAires, { id: row.id, description: "mía" }),
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

    const outside = await getTrackerState(elsewhere, buenosAires, trackerNow);
    const inside = await getTrackerState(
      { userId: ownerId, workspaceId, role: "owner", status: "active" },
      buenosAires,
      trackerNow,
    );

    expect(outside.hasAnyEntry).toBe(false);
    expect(outside.days).toEqual([]);
    expect(outside.running).toBeNull();
    expect(inside.running?.description).toBe("corriendo");
    expect(inside.days.flatMap((day) => day.entries)).toHaveLength(1);
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

    const started = await startTimer(elsewhere, buenosAires, {
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

    const state = await getTrackerState(actor, buenosAires, trackerNow);

    expect(state.canTrack).toBe(false);
    expect(state.hasAnyEntry).toBe(true);
    expect(state.running?.description).toBe("corriendo");
    expect(
      state.days.flatMap((day) => day.entries).map((entry) => entry.description),
    ).toEqual(["cerrada"]);
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

    const ajeno = await db.transaction((tx) =>
      timeEntryRepository.deleteById(tx, { workspaceId, userId: ownerId, id: row.id }),
    );

    expect(ajeno).toBeUndefined();
    expect(await timeEntryById(row.id)).toBeDefined();
    const propio = await db.transaction((tx) =>
      timeEntryRepository.deleteById(tx, { workspaceId, userId: otherId, id: row.id }),
    );
    expect(propio?.id).toBe(row.id);
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

    const ajeno = await db.transaction((tx) =>
      timeEntryRepository.updateDescription(
        tx,
        { workspaceId, userId: ownerId, id: row.id },
        "mía",
      ),
    );

    expect(ajeno).toBeUndefined();
    expect((await timeEntryById(row.id))?.description).toBe("ajena");
    const propio = await db.transaction((tx) =>
      timeEntryRepository.updateDescription(
        tx,
        { workspaceId, userId: otherId, id: row.id },
        "de su dueña",
      ),
    );
    expect(propio?.description).toBe("de su dueña");
  });

  it("no detiene el timer de otra persona", async () => {
    const otherId = await seedMember(workspaceId, "member");
    const row = await seedTimeEntry({
      workspaceId,
      userId: otherId,
      startedAt: "2026-10-02T11:00:00Z",
    });

    const ajeno = await db.transaction((tx) =>
      timeEntryRepository.stopById(tx, { workspaceId, userId: ownerId, id: row.id }),
    );

    expect(ajeno).toBeUndefined();
    expect((await timeEntryById(row.id))?.endedAt).toBeNull();
    const propio = await db.transaction((tx) =>
      timeEntryRepository.stopById(tx, { workspaceId, userId: otherId, id: row.id }),
    );
    expect(propio?.endedAt).not.toBeNull();
    expect((await timeEntryById(row.id))?.endedAt).not.toBeNull();
  });
});
