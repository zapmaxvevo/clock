import { randomUUID } from "node:crypto";

import { and, eq, isNull, notInArray } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

import { createManualEntry } from "@/modules/time-entry/service";
import { timeEntryMessages } from "@/modules/time-entry/schema";
import { projectMessages } from "@/modules/project/schema";
import { db } from "@/server/db";
import { auditLog, timeEntry, timeEntryTag } from "@/server/db/schema";
import {
  seedClient,
  seedMember,
  seedPreferences,
  seedProject,
  seedTag,
  seedTask,
  seedTimeEntry,
  seedWorkspace,
} from "@/test/factories";
import {
  callTool,
  issueTestGrant,
  registrations,
  type TestGrant,
  type ToolResult,
} from "@/test/mcp";
import { restoreEnv } from "@/test/mcp-env";
import { timeEntryById } from "@/test/queries";
import { actorIn, workspaceOf } from "@/test/time-entry";

import type { ToolEntry } from "./schema";

/**
 * §9.2, `tools.integration`: criterios 6 a 9 por `tools/call`, con tokens reales.
 * La persona escribe en Nueva York (su perfil) y el workspace está en Buenos
 * Aires: una hora mal convertida no pasa por casualidad.
 */
const savedEnv = await vi.hoisted(async () => {
  const { MCP_ON_ENV, replaceEnv } = await import("@/test/mcp-env");
  return replaceEnv(MCP_ON_ENV);
});

afterAll(() => {
  restoreEnv(savedEnv);
});

const NEW_YORK = "America/New_York";

type Seeded = Awaited<ReturnType<typeof seedConnected>>;

/** P, conectada por un asistente, con un proyecto facturable con tarea y una etiqueta. */
async function seedConnected() {
  const { workspaceId, ownerId } = await seedWorkspace();
  const email = `${randomUUID()}@empresa.com`;
  const userId = await seedMember(workspaceId, "member", "active", { email });
  await seedPreferences(userId, { timezone: NEW_YORK });
  const customer = await seedClient({ workspaceId });
  const project = await seedProject({
    workspaceId,
    clientId: customer.id,
    billableByDefault: true,
  });
  const task = await seedTask({ workspaceId, projectId: project.id });
  const tag = await seedTag({ workspaceId });
  const grant = await issueTestGrant(email);
  return { workspaceId, ownerId, userId, email, customer, project, task, tag, grant };
}

/** El `structuredContent` de un resultado que no es error. */
function contentOf<T>(result: ToolResult): T {
  expect(result.isError ?? false).toBe(false);
  expect(result.content).toEqual([
    { type: "text", text: JSON.stringify(result.structuredContent) },
  ]);
  return result.structuredContent as T;
}

/** Un error de dominio: `isError`, con su código y su texto en los dos lados. */
function expectToolError(result: ToolResult, code: string, message: string) {
  expect(result.isError).toBe(true);
  expect(result.structuredContent).toMatchObject({ code, message });
  expect(result.content).toEqual([{ type: "text", text: message }]);
}

async function writes() {
  const [entries, audits] = await Promise.all([
    db.select({ id: timeEntry.id }).from(timeEntry),
    db.select({ id: auditLog.id }).from(auditLog),
  ]);
  return { entries: entries.length, audits: audits.length };
}

/** Las constancias que dejó `work`, con su autor y su cliente. */
async function auditsOf(work: () => Promise<unknown>) {
  const before = (await db.select({ id: auditLog.id }).from(auditLog)).map(
    (row) => row.id,
  );
  await work();
  return db
    .select({
      action: auditLog.action,
      actorId: auditLog.actorId,
      oauthClientId: auditLog.oauthClientId,
    })
    .from(auditLog)
    .where(before.length === 0 ? undefined : notInArray(auditLog.id, before));
}

async function tagIdsOf(entryId: string) {
  const rows = await db
    .select({ tagId: timeEntryTag.tagId })
    .from(timeEntryTag)
    .where(eq(timeEntryTag.timeEntryId, entryId));
  return rows.map((row) => row.tagId);
}

describe("cada herramienta hace lo de su action (criterio 6)", () => {
  it("create_entry escribe las horas de pared en la zona del perfil, con el facturable del proyecto y las etiquetas", async () => {
    const seeded = await seedConnected();

    const { entry } = contentOf<{ entry: ToolEntry }>(
      await callTool(seeded.grant.accessToken, "create_entry", {
        date: "2026-10-14",
        start: "09:00",
        end: "10:30",
        description: "Revisión",
        projectId: seeded.project.id,
        taskId: seeded.task.id,
        tagIds: [seeded.tag.id],
      }),
    );

    const row = await timeEntryById(entry.id);
    expect(row).toMatchObject({
      userId: seeded.userId,
      workspaceId: seeded.workspaceId,
      description: "Revisión",
      startedAt: new Date("2026-10-14T13:00:00Z"),
      endedAt: new Date("2026-10-14T14:30:00Z"),
      projectId: seeded.project.id,
      taskId: seeded.task.id,
      billable: true,
    });
    expect(await tagIdsOf(entry.id)).toEqual([seeded.tag.id]);
    expect(entry).toMatchObject({
      date: "2026-10-14",
      start: "09:00",
      end: "10:30",
      durationMinutes: 90,
      running: false,
      billable: true,
      project: { id: seeded.project.id, name: seeded.project.name },
      task: { id: seeded.task.id, name: seeded.task.name },
      tags: [{ id: seeded.tag.id, name: seeded.tag.name }],
    });
  });

  it("update_entry cambia times, project y tagIds en una llamada", async () => {
    const seeded = await seedConnected();
    const other = await seedProject({ workspaceId: seeded.workspaceId });
    const entry = await seedTimeEntry({
      workspaceId: seeded.workspaceId,
      userId: seeded.userId,
      startedAt: "2026-10-14T13:00:00Z",
      endedAt: "2026-10-14T14:00:00Z",
      projectId: seeded.project.id,
      tagIds: [seeded.tag.id],
    });

    const { entry: updated } = contentOf<{ entry: ToolEntry }>(
      await callTool(seeded.grant.accessToken, "update_entry", {
        id: entry.id,
        times: { date: "2026-10-13", start: "16:00", end: "17:15" },
        project: { projectId: other.id, taskId: null },
        tagIds: [],
      }),
    );

    expect(await timeEntryById(entry.id)).toMatchObject({
      startedAt: new Date("2026-10-13T20:00:00Z"),
      endedAt: new Date("2026-10-13T21:15:00Z"),
      projectId: other.id,
      taskId: null,
    });
    expect(await tagIdsOf(entry.id)).toEqual([]);
    expect(updated).toMatchObject({ date: "2026-10-13", start: "16:00", end: "17:15" });
  });

  it("update_entry con runningStart mueve el inicio del timer que corre", async () => {
    const seeded = await seedConnected();
    const { running } = contentOf<{ running: ToolEntry }>(
      await callTool(seeded.grant.accessToken, "start_timer", { description: "Timer" }),
    );
    const started = new Date(running.startedAt);
    const earlier = new Date(started.getTime() - 2 * 60 * 60 * 1000);
    const local = new Intl.DateTimeFormat("en-CA", {
      timeZone: NEW_YORK,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(earlier);
    const part = (type: string) => local.find((item) => item.type === type)?.value ?? "";

    contentOf(
      await callTool(seeded.grant.accessToken, "update_entry", {
        id: running.id,
        runningStart: {
          date: `${part("year")}-${part("month")}-${part("day")}`,
          start: `${part("hour")}:${part("minute")}`,
        },
      }),
    );

    const row = await timeEntryById(running.id);
    expect(row?.endedAt).toBeNull();
    expect(row?.startedAt.toISOString().slice(0, 16)).toBe(
      earlier.toISOString().slice(0, 16),
    );
  });

  it("delete_entry borra la entrada", async () => {
    const seeded = await seedConnected();
    const entry = await seedTimeEntry({
      workspaceId: seeded.workspaceId,
      userId: seeded.userId,
      startedAt: "2026-10-14T13:00:00Z",
      endedAt: "2026-10-14T14:00:00Z",
    });

    expect(
      contentOf(
        await callTool(seeded.grant.accessToken, "delete_entry", { id: entry.id }),
      ),
    ).toEqual({ id: entry.id });
    expect(await timeEntryById(entry.id)).toBeUndefined();
  });

  it("start_timer cierra el que corría en el mismo instante en que arranca el nuevo", async () => {
    const seeded = await seedConnected();
    const previous = await seedTimeEntry({
      workspaceId: seeded.workspaceId,
      userId: seeded.userId,
      startedAt: new Date(Date.now() - 60 * 60 * 1000),
    });

    const { running, stopped } = contentOf<{
      running: ToolEntry;
      stopped: ToolEntry | null;
    }>(
      await callTool(seeded.grant.accessToken, "start_timer", {
        projectId: seeded.project.id,
      }),
    );

    expect(stopped?.id).toBe(previous.id);
    expect(stopped?.endedAt).toBe(running.startedAt);
    expect(running).toMatchObject({ running: true, billable: true });
    expect((await timeEntryById(previous.id))?.endedAt?.toISOString()).toBe(
      running.startedAt,
    );
  });

  it("stop_timer con id detiene ese timer, y sin id el que corre", async () => {
    const seeded = await seedConnected();
    const first = await seedTimeEntry({
      workspaceId: seeded.workspaceId,
      userId: seeded.userId,
      startedAt: new Date(Date.now() - 30 * 60 * 1000),
    });

    const withId = contentOf<{ stopped: ToolEntry }>(
      await callTool(seeded.grant.accessToken, "stop_timer", { id: first.id }),
    );
    expect(withId.stopped).toMatchObject({ id: first.id, running: false });
    expect((await timeEntryById(first.id))?.endedAt).not.toBeNull();

    const { running } = contentOf<{ running: ToolEntry }>(
      await callTool(seeded.grant.accessToken, "start_timer", {}),
    );
    const withoutId = contentOf<{ stopped: ToolEntry }>(
      await callTool(seeded.grant.accessToken, "stop_timer", {}),
    );
    expect(withoutId.stopped).toMatchObject({ id: running.id, running: false });
    expect((await timeEntryById(running.id))?.endedAt).not.toBeNull();
  });

  it("list_entries corta por el día de inicio en la zona del perfil y deja el timer aparte", async () => {
    const seeded = await seedConnected();
    const base = { workspaceId: seeded.workspaceId, userId: seeded.userId };
    // 23:30 del 13 en Nueva York: fuera del período aunque en UTC sea el 14.
    await seedTimeEntry({
      ...base,
      startedAt: "2026-10-14T03:30:00Z",
      endedAt: "2026-10-14T04:30:00Z",
    });
    // 23:30 del 14 en Nueva York, termina el 15: cuenta entera en el 14.
    const late = await seedTimeEntry({
      ...base,
      startedAt: "2026-10-15T03:30:00Z",
      endedAt: "2026-10-15T05:00:00Z",
    });
    const early = await seedTimeEntry({
      ...base,
      startedAt: "2026-10-14T13:00:00Z",
      endedAt: "2026-10-14T13:45:00Z",
    });
    // De otra persona del workspace, el mismo día: no aparece.
    const otherUser = await seedMember(seeded.workspaceId, "member");
    await seedTimeEntry({
      workspaceId: seeded.workspaceId,
      userId: otherUser,
      startedAt: "2026-10-14T14:00:00Z",
      endedAt: "2026-10-14T15:00:00Z",
    });
    const timer = await seedTimeEntry({
      ...base,
      startedAt: new Date(Date.now() - 60_000),
    });

    const listed = contentOf<{
      timezone: string;
      entries: ToolEntry[];
      running: ToolEntry | null;
      totalMinutes: number;
      truncated: boolean;
    }>(
      await callTool(seeded.grant.accessToken, "list_entries", {
        from: "2026-10-14",
        to: "2026-10-14",
      }),
    );

    expect(listed.timezone).toBe(NEW_YORK);
    expect(listed.entries.map((entry) => entry.id)).toEqual([early.id, late.id]);
    expect(listed.entries[1]).toMatchObject({
      date: "2026-10-14",
      start: "23:30",
      extraDays: 1,
    });
    expect(listed.totalMinutes).toBe(45 + 90);
    expect(listed.running?.id).toBe(timer.id);
    expect(listed.truncated).toBe(false);
  });

  it("list_projects ofrece lo que ofrece el selector del rastreador", async () => {
    const seeded = await seedConnected();
    const mine = await seedProject({
      workspaceId: seeded.workspaceId,
      isPublic: false,
      members: [{ userId: seeded.userId }],
    });
    const hidden = await seedProject({
      workspaceId: seeded.workspaceId,
      isPublic: false,
    });
    const archived = await seedProject({
      workspaceId: seeded.workspaceId,
      archived: true,
    });
    await seedTag({ workspaceId: seeded.workspaceId, archived: true });

    const listed = contentOf<{
      groups: {
        client: { id: string } | null;
        projects: { id: string; tasks: { id: string }[] }[];
      }[];
      tags: { id: string }[];
    }>(await callTool(seeded.grant.accessToken, "list_projects"));

    const projectIds = listed.groups.flatMap((group) =>
      group.projects.map((item) => item.id),
    );
    expect(projectIds).toEqual(expect.arrayContaining([seeded.project.id, mine.id]));
    expect(projectIds).not.toContain(hidden.id);
    expect(projectIds).not.toContain(archived.id);
    const withClient = listed.groups.find(
      (group) => group.client?.id === seeded.customer.id,
    );
    expect(withClient?.projects).toEqual([
      expect.objectContaining({
        id: seeded.project.id,
        tasks: [expect.objectContaining({ id: seeded.task.id })],
      }),
    ]);
    expect(listed.tags.map((item) => item.id)).toEqual([seeded.tag.id]);
  });

  it("get_context da la zona del perfil, hoy en esa zona y el timer", async () => {
    const seeded = await seedConnected();
    const timer = await seedTimeEntry({
      workspaceId: seeded.workspaceId,
      userId: seeded.userId,
      startedAt: new Date(Date.now() - 60_000),
    });

    const context = contentOf<{
      user: { email: string };
      timezone: string;
      today: string;
      running: ToolEntry | null;
    }>(await callTool(seeded.grant.accessToken, "get_context"));

    expect(context.user.email).toBe(seeded.email);
    expect(context.timezone).toBe(NEW_YORK);
    expect(context.today).toBe(
      new Intl.DateTimeFormat("en-CA", { timeZone: NEW_YORK }).format(new Date()),
    );
    expect(context.running?.id).toBe(timer.id);
  });
});

describe("los mismos errores, sin escribir (criterio 7)", () => {
  async function expectErrorWithoutWriting(
    seeded: Seeded,
    name: string,
    args: Record<string, unknown>,
    code: string,
    message: string,
  ) {
    const before = await writes();
    expectToolError(await callTool(seeded.grant.accessToken, name, args), code, message);
    expect(await writes()).toEqual(before);
  }

  it("una entrada de otra persona del workspace responde forbidden con el texto de la pantalla", async () => {
    const seeded = await seedConnected();
    const owner = await seedMember(seeded.workspaceId, "member");
    const foreign = await seedTimeEntry({
      workspaceId: seeded.workspaceId,
      userId: owner,
      startedAt: "2026-10-14T13:00:00Z",
      endedAt: "2026-10-14T14:00:00Z",
    });

    for (const [name, args] of [
      ["update_entry", { id: foreign.id, description: "ajena" }],
      ["delete_entry", { id: foreign.id }],
    ] as const) {
      await expectErrorWithoutWriting(
        seeded,
        name,
        args,
        "forbidden",
        timeEntryMessages.forbiddenOtherOwner,
      );
    }
  });

  it("una entrada de otro workspace responde not_found", async () => {
    const seeded = await seedConnected();
    const elsewhere = await seedWorkspace();
    const foreign = await seedTimeEntry({
      workspaceId: elsewhere.workspaceId,
      userId: elsewhere.ownerId,
      startedAt: "2026-10-14T13:00:00Z",
      endedAt: "2026-10-14T14:00:00Z",
    });

    for (const [name, args] of [
      ["update_entry", { id: foreign.id, description: "ajena" }],
      ["delete_entry", { id: foreign.id }],
      ["stop_timer", { id: foreign.id }],
    ] as const) {
      await expectErrorWithoutWriting(
        seeded,
        name,
        args,
        "not_found",
        timeEntryMessages.notFound,
      );
    }
  });

  it("un proyecto privado ajeno responde el error de assertTrackable", async () => {
    const seeded = await seedConnected();
    const hidden = await seedProject({
      workspaceId: seeded.workspaceId,
      isPublic: false,
    });

    await expectErrorWithoutWriting(
      seeded,
      "create_entry",
      { date: "2026-10-14", start: "09:00", end: "10:00", projectId: hidden.id },
      "not_found",
      projectMessages.projectUnavailable,
    );
  });

  it("una hora que no existe por el cambio de horario responde nonexistentClock", async () => {
    const seeded = await seedConnected();

    await expectErrorWithoutWriting(
      seeded,
      "create_entry",
      { date: "2026-03-08", start: "02:30", end: "04:00" },
      "validation",
      timeEntryMessages.nonexistentClock,
    );
  });

  it("un período de 32 días responde periodTooLong", async () => {
    const seeded = await seedConnected();

    expectToolError(
      await callTool(seeded.grant.accessToken, "list_entries", {
        from: "2026-09-01",
        to: "2026-10-02",
      }),
      "validation",
      "El período puede tener hasta 31 días.",
    );
  });

  it("stop_timer sin timer responde noRunningTimer", async () => {
    const seeded = await seedConnected();

    await expectErrorWithoutWriting(
      seeded,
      "stop_timer",
      {},
      "not_found",
      timeEntryMessages.noRunningTimer,
    );
  });
});

describe("idempotencia (criterio 8)", () => {
  it.each([
    ["create_entry", { date: "2026-10-14", start: "09:00", end: "10:00" }],
    ["start_timer", {}],
  ])(
    "%s con el mismo id dos veces deja una fila y una constancia",
    async (name, args) => {
      const seeded = await seedConnected();
      const id = randomUUID();

      const first = contentOf<Record<string, ToolEntry>>(
        await callTool(seeded.grant.accessToken, name, { ...args, id }),
      );
      const second = contentOf<Record<string, ToolEntry>>(
        await callTool(seeded.grant.accessToken, name, { ...args, id }),
      );

      expect(second).toEqual(first);
      expect(await db.select().from(timeEntry)).toHaveLength(1);
      expect(
        await db.select().from(auditLog).where(eq(auditLog.entityId, id)),
      ).toHaveLength(1);
    },
  );

  it.each([
    ["create_entry", { date: "2026-10-14", start: "09:00", end: "10:00" }, "entry"],
    ["start_timer", {}, "running"],
  ])(
    "%s sin id dos veces crea dos entradas, la primera cerrada",
    async (name, args, key) => {
      const seeded = await seedConnected();

      const first = contentOf<Record<string, ToolEntry>>(
        await callTool(seeded.grant.accessToken, name, args),
      );
      await callTool(seeded.grant.accessToken, name, args);

      const rows = await db
        .select({ id: timeEntry.id, endedAt: timeEntry.endedAt })
        .from(timeEntry);
      expect(rows).toHaveLength(2);
      expect(rows.find((row) => row.id === first[key]?.id)?.endedAt).not.toBeNull();
    },
  );
});

describe("el audit log dice por qué cliente llegó (criterio 9)", () => {
  /** Cada herramienta que escribe, con lo que necesita, en orden. */
  async function writeWithEveryTool(grant: TestGrant, seeded: Seeded) {
    const token = grant.accessToken;
    const created = contentOf<{ entry: ToolEntry }>(
      await callTool(token, "create_entry", {
        date: "2026-10-14",
        start: "09:00",
        end: "10:00",
        projectId: seeded.project.id,
      }),
    );
    return [
      () =>
        callTool(token, "update_entry", {
          id: created.entry.id,
          description: "editada",
          project: { projectId: null, taskId: null },
          times: { date: "2026-10-14", start: "11:00", end: "12:00" },
          tagIds: [seeded.tag.id],
        }),
      () => callTool(token, "start_timer", { description: "uno" }),
      () => callTool(token, "start_timer", { description: "dos" }),
      () => callTool(token, "stop_timer", {}),
      () => callTool(token, "delete_entry", { id: created.entry.id }),
    ];
  }

  it("cada constancia de una herramienta tiene la persona y su cliente; dos clientes, dos marcas", async () => {
    const seeded = await seedConnected();
    const second = await issueTestGrant(seeded.email, {
      registration: registrations.chatgpt(),
      cookie: seeded.grant.cookie,
    });

    for (const grant of [seeded.grant, second]) {
      const audits = await auditsOf(async () => {
        for (const call of await writeWithEveryTool(grant, seeded)) {
          await call();
        }
      });
      expect(audits.length).toBeGreaterThanOrEqual(6);
      for (const audit of audits) {
        expect(audit).toMatchObject({
          actorId: seeded.userId,
          oauthClientId: grant.clientId,
        });
      }
    }
  });

  it("cada llamada que escribe deja al menos una constancia, todas con el cliente", async () => {
    const seeded = await seedConnected();

    const calls = await writeWithEveryTool(seeded.grant, seeded);
    for (const call of calls) {
      const audits = await auditsOf(call);
      expect(audits.length).toBeGreaterThan(0);
      expect(audits.every((audit) => audit.oauthClientId === seeded.grant.clientId)).toBe(
        true,
      );
    }
  });

  it("una constancia de la pantalla tiene oauth_client_id nulo", async () => {
    const seeded = await seedConnected();

    const audits = await auditsOf(() =>
      createManualEntry(
        actorIn(seeded.workspaceId, seeded.userId),
        workspaceOf(NEW_YORK),
        {
          id: randomUUID(),
          date: "2026-10-14",
          start: "09:00",
          end: "10:00",
          description: "",
          projectId: null,
          taskId: null,
          tagIds: [],
        },
      ),
    );

    expect(audits).toEqual([
      { action: "timeEntry.createManual", actorId: seeded.userId, oauthClientId: null },
    ]);
    expect(
      await db
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.actorId, seeded.userId), isNull(auditLog.oauthClientId))),
    ).toHaveLength(1);
  });
});
