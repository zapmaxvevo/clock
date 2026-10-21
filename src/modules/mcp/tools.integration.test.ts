import { randomUUID } from "node:crypto";

import { and, eq, isNull, notInArray } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

import { releasedEmailOf } from "@/lib/email";
import { reportMessages } from "@/modules/report/schema";
import { createManualEntry } from "@/modules/time-entry/service";
import { timeEntryMessages } from "@/modules/time-entry/schema";
import { projectMessages } from "@/modules/project/schema";
import { db } from "@/server/db";
import { auditLog, membership, timeEntry, timeEntryTag } from "@/server/db/schema";
import type { MembershipStatus, Role } from "@/server/permissions";
import {
  seedClient,
  seedInvitation,
  seedMember,
  seedPreferences,
  seedProject,
  seedTag,
  seedTask,
  seedTimeEntry,
  seedUser,
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
import { descriptionIdOf } from "@/test/report";
import { actorIn, workspaceOf } from "@/test/time-entry";

import type { ListPeopleToolOutput, SummarizeHoursToolOutput, ToolEntry } from "./schema";

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

// Mejora 5, §7.2 de `mejoras-mcp-equipo.md`: `list_people` y `summarize_hours`
// por `tools/call`, criterios 2, 4 a 6, 10 a 13. La aplicación arma el contexto
// con el primer workspace (`ensureWorkspaceContext`): el equipo se siembra
// primero y el otro workspace, que nadie puede abrir, solo aporta datos.

/** Una persona del equipo, con el correo con que entra. */
type TeamPerson = { readonly id: string; readonly email: string };

type Team = Awaited<ReturnType<typeof seedTeam>>;

/**
 * El equipo de un workspace con horas en la semana del 12 al 18 de octubre de
 * 2026: owner en Nueva York (su perfil), el resto en Buenos Aires (el
 * workspace). Una inactiva con horas, una inactiva con el correo liberado, una
 * invitada con cuenta y sin alta, y otro workspace con su owner y sus horas.
 *
 * | Persona         | Minutos | Facturables |
 * | --------------- | ------- | ----------- |
 * | owner (Olga)    | 60      | 60          |
 * | member (Marta)  | 165     | 90          |
 * | inactive (Inés) | 20      | 0           |
 * | pm (Pablo)      | 10      | 0           |
 */
async function seedTeam() {
  const { workspaceId, ownerId } = await seedWorkspace();
  const owner: TeamPerson = { id: ownerId, email: `${ownerId}@empresa.com` };
  await seedPreferences(ownerId, { timezone: NEW_YORK, displayName: "Olga" });
  async function person(
    role: Role,
    displayName: string,
    status: MembershipStatus = "active",
  ): Promise<TeamPerson> {
    const email = `${randomUUID()}@empresa.com`;
    const id = await seedMember(workspaceId, role, status, { email });
    await seedPreferences(id, { displayName });
    return { id, email };
  }
  const admin = await person("admin", "Ana");
  const member = await person("member", "Marta");
  const pm = await person("project_manager", "Pablo");
  const tm = await person("team_manager", "Teo");
  const inactive = await person("member", "Inés", "inactive");
  const releasedId = randomUUID();
  await seedMember(workspaceId, "member", "inactive", {
    id: releasedId,
    email: releasedEmailOf(releasedId),
  });
  const inviteeEmail = `${randomUUID()}@gmail.com`;
  const inviteeId = await seedUser(inviteeEmail);
  const invitation = await seedInvitation({
    workspaceId,
    email: inviteeEmail,
    invitedById: ownerId,
  });
  // D-R9-2: miembros desde antes del período, para que las sin horas cuenten.
  await db
    .update(membership)
    .set({ createdAt: new Date("2026-01-01T00:00:00Z") })
    .where(eq(membership.workspaceId, workspaceId));

  const customer = await seedClient({ workspaceId });
  const billed = await seedProject({ workspaceId, clientId: customer.id });
  const internal = await seedProject({ workspaceId });
  const hidden = await seedProject({ workspaceId, isPublic: false });

  const entry = (
    userId: string,
    startedAt: string,
    endedAt: string,
    values: { description?: string; projectId?: string; billable?: boolean } = {},
  ) => seedTimeEntry({ workspaceId, userId, startedAt, endedAt, ...values });
  await entry(owner.id, "2026-10-13T13:00:00Z", "2026-10-13T14:00:00Z", {
    description: "Planificación",
    projectId: billed.id,
    billable: true,
  });
  await entry(member.id, "2026-10-13T14:00:00Z", "2026-10-13T15:30:00Z", {
    description: "Revisión",
    projectId: billed.id,
    billable: true,
  });
  await entry(member.id, "2026-10-14T13:00:00Z", "2026-10-14T13:45:00Z", {
    description: "Revisión",
  });
  // 23:30 del 14 en Nueva York, 00:30 del 15 en Buenos Aires (criterio 10).
  await entry(member.id, "2026-10-15T03:30:00Z", "2026-10-15T04:00:00Z", {
    description: "Cierre",
  });
  // Fuera del período.
  await entry(member.id, "2026-10-19T13:00:00Z", "2026-10-19T14:00:00Z");
  await entry(inactive.id, "2026-10-13T15:00:00Z", "2026-10-13T15:20:00Z", {
    description: "Soporte",
    projectId: internal.id,
  });
  await entry(pm.id, "2026-10-16T13:00:00Z", "2026-10-16T13:10:00Z");

  const elsewhere = await seedWorkspace();
  const foreignClient = await seedClient({ workspaceId: elsewhere.workspaceId });
  const foreignProject = await seedProject({
    workspaceId: elsewhere.workspaceId,
    clientId: foreignClient.id,
  });
  await seedTimeEntry({
    workspaceId: elsewhere.workspaceId,
    userId: elsewhere.ownerId,
    startedAt: "2026-10-13T13:00:00Z",
    endedAt: "2026-10-13T14:40:00Z",
    projectId: foreignProject.id,
    billable: true,
  });

  return {
    workspaceId,
    owner,
    admin,
    member,
    pm,
    tm,
    inactive,
    releasedId,
    inviteeId,
    invitationId: invitation.id,
    customer,
    billed,
    internal,
    hidden,
    elsewhere: {
      ownerId: elsewhere.ownerId,
      clientId: foreignClient.id,
      projectId: foreignProject.id,
    },
  };
}

const WEEK = { from: "2026-10-12", to: "2026-10-18" } as const;

/** Los roles que ven a todo el equipo y los que solo ven lo propio (P-02). */
const SEES_TEAM = ["owner", "admin"] as const;
const SEES_SELF = ["member", "pm", "tm"] as const;

function personOf(
  team: Team,
  role: (typeof SEES_TEAM)[number] | (typeof SEES_SELF)[number],
) {
  return team[role];
}

async function tokenOf(person: TeamPerson): Promise<string> {
  return (await issueTestGrant(person.email)).accessToken;
}

async function summarize(token: string, args: Record<string, unknown> = {}) {
  return contentOf<SummarizeHoursToolOutput>(
    await callTool(token, "summarize_hours", { ...WEEK, ...args }),
  );
}

async function listPeople(token: string) {
  return contentOf<ListPeopleToolOutput>(await callTool(token, "list_people"));
}

/** Un grupo de cualquier nivel, con lo que el árbol compara. */
type AnyGroup = {
  readonly key: string | null;
  readonly minutes: number;
  readonly children?: readonly AnyGroup[];
};

type Tree = {
  readonly [key: string]: { readonly minutes: number; readonly children?: Tree };
};

/** Los grupos por `key` (`"null"` en los «Sin …»), con sus minutos y sus hijos. */
function treeOf(groups: readonly AnyGroup[]): Tree {
  return Object.fromEntries(
    groups.map((group) => [
      String(group.key),
      group.children === undefined
        ? { minutes: group.minutes }
        : { minutes: group.minutes, children: treeOf(group.children) },
    ]),
  );
}

/**
 * Un error de herramienta sin nada más: ni grupos ni personas en la respuesta,
 * que es lo que se puede observar de «sin leer».
 */
function expectBareError(result: ToolResult, code: string, message: string) {
  expect(result.isError).toBe(true);
  expect(result.structuredContent).toEqual({ code, message });
  expect(result.content).toEqual([{ type: "text", text: message }]);
}

describe("list_people (criterio 2)", () => {
  it.each(SEES_TEAM)(
    "%s recibe everyone: activas e inactivas, sin la invitada ni el otro workspace, con correos y el liberado en null",
    async (role) => {
      const team = await seedTeam();
      const viewer = personOf(team, role);

      const listed = await listPeople(await tokenOf(viewer));

      const row = (person: TeamPerson, name: string, inactive = false) => ({
        id: person.id,
        name,
        email: person.email,
        inactive,
        self: person.id === viewer.id,
      });
      expect(listed).toEqual({
        scope: "everyone",
        people: [
          row(team.admin, "Ana"),
          row(team.inactive, "Inés", true),
          row(team.member, "Marta"),
          row(team.owner, "Olga"),
          row(team.pm, "Pablo"),
          {
            id: team.releasedId,
            name: "Persona de prueba",
            email: null,
            inactive: true,
            self: false,
          },
          row(team.tm, "Teo"),
        ],
      });
    },
  );

  it.each(SEES_SELF)(
    "%s recibe self: solo su fila, con self y sin correo",
    async (role) => {
      const team = await seedTeam();
      const viewer = personOf(team, role);

      const listed = await listPeople(await tokenOf(viewer));

      expect(listed.scope).toBe("self");
      expect(listed.people).toEqual([
        expect.objectContaining({
          id: viewer.id,
          email: null,
          inactive: false,
          self: true,
        }),
      ]);
    },
  );
});

describe("summarize_hours de owner y admin (criterio 4)", () => {
  it.each(SEES_TEAM)(
    "%s sin filtros resume a todo el workspace por persona, con la inactiva marcada",
    async (role) => {
      const team = await seedTeam();

      const summary = await summarize(await tokenOf(personOf(team, role)));

      expect(summary).toMatchObject({
        from: WEEK.from,
        to: WEEK.to,
        scope: "everyone",
        groupBy: "person",
        subgroups: [],
        levelsShown: 1,
        totalMinutes: 255,
        billableMinutes: 150,
      });
      expect(treeOf(summary.groups)).toEqual({
        [team.owner.id]: { minutes: 60 },
        [team.member.id]: { minutes: 165 },
        [team.inactive.id]: { minutes: 20 },
        [team.pm.id]: { minutes: 10 },
      });
      expect(summary.groups.find((group) => group.key === team.member.id)).toMatchObject({
        kind: "person",
        name: "Marta",
        inactive: false,
      });
      expect(
        summary.groups.find((group) => group.key === team.inactive.id),
      ).toMatchObject({ name: "Inés", inactive: true });
    },
  );

  it("por persona y proyecto, con el cliente del proyecto y el «Sin proyecto»", async () => {
    const team = await seedTeam();

    const summary = await summarize(await tokenOf(team.owner), {
      subgroups: ["project"],
    });

    expect(summary.levelsShown).toBe(2);
    expect(treeOf(summary.groups)).toEqual({
      [team.owner.id]: { minutes: 60, children: { [team.billed.id]: { minutes: 60 } } },
      [team.member.id]: {
        minutes: 165,
        children: { [team.billed.id]: { minutes: 90 }, null: { minutes: 75 } },
      },
      [team.inactive.id]: {
        minutes: 20,
        children: { [team.internal.id]: { minutes: 20 } },
      },
      [team.pm.id]: { minutes: 10, children: { null: { minutes: 10 } } },
    });
    const ownerProjects = summary.groups.find((group) => group.key === team.owner.id);
    expect(ownerProjects?.children).toEqual([
      expect.objectContaining({
        kind: "project",
        name: team.billed.name,
        client: team.customer.name,
      }),
    ]);
  });

  it("por persona, fecha y descripción, con los días cortados en la zona de quien pide (criterio 10)", async () => {
    const team = await seedTeam();

    const summary = await summarize(await tokenOf(team.owner), {
      userIds: [team.member.id],
      subgroups: ["date", "description"],
    });

    expect(summary.timezone).toBe(NEW_YORK);
    expect(summary.levelsShown).toBe(3);
    // El cierre empieza a las 23:30 del 14 en Nueva York y a las 00:30 del 15
    // en la zona de Marta: cuenta el 14.
    expect(treeOf(summary.groups)).toEqual({
      [team.member.id]: {
        minutes: 165,
        children: {
          "2026-10-13": {
            minutes: 90,
            children: { [descriptionIdOf("Revisión")]: { minutes: 90 } },
          },
          "2026-10-14": {
            minutes: 75,
            children: {
              [descriptionIdOf("Revisión")]: { minutes: 45 },
              [descriptionIdOf("Cierre")]: { minutes: 30 },
            },
          },
        },
      },
    });
    const [person] = summary.groups;
    const day = person?.children?.find((group) => group.key === "2026-10-14");
    expect(day).toMatchObject({ kind: "date", name: "2026-10-14" });
    expect(day?.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "description",
          name: "Cierre",
          truncated: false,
        }),
      ]),
    );
  });

  it("con userIds de una persona, solo ella; con la inactiva, sus horas marcadas", async () => {
    const team = await seedTeam();
    const token = await tokenOf(team.admin);

    const one = await summarize(token, { userIds: [team.member.id] });
    expect(one).toMatchObject({
      scope: "everyone",
      totalMinutes: 165,
      billableMinutes: 90,
    });
    expect(treeOf(one.groups)).toEqual({ [team.member.id]: { minutes: 165 } });

    const gone = await summarize(token, { userIds: [team.inactive.id] });
    expect(gone.totalMinutes).toBe(20);
    expect(gone.groups).toEqual([
      expect.objectContaining({ key: team.inactive.id, minutes: 20, inactive: true }),
    ]);
  });

  it("los filtros de proyecto, sin proyecto y cliente eligen sus entradas", async () => {
    const team = await seedTeam();
    const token = await tokenOf(team.owner);

    const byProject = await summarize(token, { projectIds: [team.billed.id] });
    expect(treeOf(byProject.groups)).toEqual({
      [team.owner.id]: { minutes: 60 },
      [team.member.id]: { minutes: 90 },
    });

    const withoutProject = await summarize(token, { withoutProject: true });
    expect(treeOf(withoutProject.groups)).toEqual({
      [team.member.id]: { minutes: 75 },
      [team.pm.id]: { minutes: 10 },
    });

    const byClient = await summarize(token, { clientIds: [team.customer.id] });
    expect(byClient.totalMinutes).toBe(150);

    // Un privado sin miembros está en el catálogo de un owner.
    const hidden = await summarize(token, { projectIds: [team.hidden.id] });
    expect(hidden).toMatchObject({ totalMinutes: 0, groups: [] });
  });

  it("includePeopleWithoutTime suma en 0 a las activas sin horas, no a las inactivas ni a la invitada", async () => {
    const team = await seedTeam();
    const token = await tokenOf(team.owner);

    const summary = await summarize(token, { includePeopleWithoutTime: true });

    expect(treeOf(summary.groups)).toEqual({
      [team.owner.id]: { minutes: 60 },
      [team.member.id]: { minutes: 165 },
      [team.inactive.id]: { minutes: 20 },
      [team.pm.id]: { minutes: 10 },
      [team.admin.id]: { minutes: 0 },
      [team.tm.id]: { minutes: 0 },
    });

    // Con otro primer nivel no hay personas en cero (D-R9-5).
    const byProject = await summarize(token, {
      groupBy: "project",
      includePeopleWithoutTime: true,
    });
    expect(byProject.groups.every((group) => group.kind === "project")).toBe(true);
  });

  it("el timer que corre no cuenta en ningún total (criterio 11)", async () => {
    const { workspaceId, ownerId } = await seedWorkspace();
    await seedPreferences(ownerId, { timezone: NEW_YORK });
    const email = `${randomUUID()}@empresa.com`;
    const userId = await seedMember(workspaceId, "member", "active", { email });
    const now = Date.now();
    await seedTimeEntry({
      workspaceId,
      userId,
      startedAt: new Date(now - 50 * 60_000),
      endedAt: new Date(now - 20 * 60_000),
    });
    await seedTimeEntry({ workspaceId, userId, startedAt: new Date(now - 10 * 60_000) });
    const dayInNewYork = (instant: number) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: NEW_YORK }).format(instant);
    const period = { from: dayInNewYork(now - 24 * 60 * 60_000), to: dayInNewYork(now) };

    for (const token of [
      (await issueTestGrant(`${ownerId}@empresa.com`)).accessToken,
      (await issueTestGrant(email)).accessToken,
    ]) {
      const summary = await summarize(token, period);
      expect(summary.totalMinutes).toBe(30);
      expect(treeOf(summary.groups)).toEqual({ [userId]: { minutes: 30 } });
    }
  });
});

describe("summarize_hours de los demás roles (criterio 5)", () => {
  /** Lo propio de cada rol en la semana: sus minutos y facturables. */
  const own = {
    member: { totalMinutes: 165, billableMinutes: 90 },
    pm: { totalMinutes: 10, billableMinutes: 0 },
    tm: { totalMinutes: 0, billableMinutes: 0 },
  } as const;

  it.each(SEES_SELF)(
    "%s resume solo lo propio con scope self; con userIds del propio id, lo mismo",
    async (role) => {
      const team = await seedTeam();
      const viewer = personOf(team, role);
      const token = await tokenOf(viewer);

      const summary = await summarize(token);
      expect(summary).toMatchObject({ scope: "self", ...own[role] });
      expect(treeOf(summary.groups)).toEqual(
        own[role].totalMinutes === 0
          ? {}
          : { [viewer.id]: { minutes: own[role].totalMinutes } },
      );

      expect(await summarize(token, { userIds: [viewer.id] })).toEqual(summary);
      // Con scope self no hay personas en cero.
      expect(await summarize(token, { includePeopleWithoutTime: true })).toEqual(summary);
    },
  );
});

describe("IDOR en summarize_hours (criterio 6)", () => {
  it.each(SEES_SELF)(
    "%s con un id que no es el propio responde forbidden con othersForbidden",
    async (role) => {
      const team = await seedTeam();
      const viewer = personOf(team, role);
      const token = await tokenOf(viewer);

      for (const userIds of [
        [team.owner.id],
        [viewer.id, team.member.id === viewer.id ? team.owner.id : team.member.id],
        [team.elsewhere.ownerId],
        [randomUUID()],
      ]) {
        expectBareError(
          await callTool(token, "summarize_hours", { ...WEEK, userIds }),
          "forbidden",
          reportMessages.othersForbidden,
        );
      }
    },
  );

  it.each(SEES_TEAM)(
    "%s con una persona de otro workspace, inexistente o invitada responde el mismo not_found",
    async (role) => {
      const team = await seedTeam();
      const token = await tokenOf(personOf(team, role));

      for (const userIds of [
        [team.elsewhere.ownerId],
        [randomUUID()],
        [team.inviteeId],
        [team.invitationId],
        // Una ajena junto a una propia no se reduce a la propia.
        [team.member.id, team.elsewhere.ownerId],
      ]) {
        expectBareError(
          await callTool(token, "summarize_hours", { ...WEEK, userIds }),
          "not_found",
          reportMessages.peopleNotFound,
        );
      }
    },
  );

  it("un proyecto de otro workspace o inexistente responde not_found, también junto a uno propio", async () => {
    const team = await seedTeam();
    const token = await tokenOf(team.owner);

    for (const projectIds of [
      [team.elsewhere.projectId],
      [randomUUID()],
      [team.billed.id, team.elsewhere.projectId],
    ]) {
      expectBareError(
        await callTool(token, "summarize_hours", { ...WEEK, projectIds }),
        "not_found",
        reportMessages.projectsNotFound,
      );
    }
  });

  it("un member con un proyecto privado ajeno responde not_found de proyectos", async () => {
    const team = await seedTeam();

    expectBareError(
      await callTool(await tokenOf(team.member), "summarize_hours", {
        ...WEEK,
        projectIds: [team.hidden.id],
      }),
      "not_found",
      reportMessages.projectsNotFound,
    );
  });

  it("un cliente de otro workspace o inexistente responde not_found de clientes", async () => {
    const team = await seedTeam();
    const token = await tokenOf(team.admin);

    for (const clientIds of [
      [team.elsewhere.clientId],
      [randomUUID()],
      [team.customer.id, team.elsewhere.clientId],
    ]) {
      expectBareError(
        await callTool(token, "summarize_hours", { ...WEEK, clientIds }),
        "not_found",
        reportMessages.clientsNotFound,
      );
    }
  });

  it("con varias listas fuera del catálogo responde la primera: personas, proyectos, clientes", async () => {
    const team = await seedTeam();
    const token = await tokenOf(team.owner);
    const all = {
      userIds: [team.elsewhere.ownerId],
      projectIds: [team.elsewhere.projectId],
      clientIds: [team.elsewhere.clientId],
    };

    expectBareError(
      await callTool(token, "summarize_hours", { ...WEEK, ...all }),
      "not_found",
      reportMessages.peopleNotFound,
    );
    expectBareError(
      await callTool(token, "summarize_hours", {
        ...WEEK,
        projectIds: all.projectIds,
        clientIds: all.clientIds,
      }),
      "not_found",
      reportMessages.projectsNotFound,
    );
  });

  it("un member con su id y un proyecto de otro workspace responde not_found, no forbidden", async () => {
    const team = await seedTeam();

    expectBareError(
      await callTool(await tokenOf(team.member), "summarize_hours", {
        ...WEEK,
        userIds: [team.member.id],
        projectIds: [team.elsewhere.projectId],
      }),
      "not_found",
      reportMessages.projectsNotFound,
    );
  });
});

describe("summarize_hours valida el pedido (§4.8)", () => {
  it.each([
    [
      "un período invertido",
      { from: "2026-10-18", to: "2026-10-12" },
      reportMessages.endBeforeStart,
    ],
    ["367 días", { from: "2026-01-01", to: "2027-01-02" }, reportMessages.rangeTooLong],
    [
      "niveles repetidos",
      { ...WEEK, groupBy: "person", subgroups: ["date", "person"] },
      reportMessages.levelsRepeated,
    ],
  ])("%s responde validation sin leer", async (_, args, message) => {
    const team = await seedTeam();

    expectBareError(
      await callTool(await tokenOf(team.owner), "summarize_hours", args),
      "validation",
      message,
    );
  });
});

describe("el tope de 500 filas (criterio 7)", () => {
  /** Una persona con `count` descripciones distintas el 13 de octubre, un minuto cada una. */
  async function seedDescriptions(count: number) {
    const { workspaceId, ownerId } = await seedWorkspace();
    const start = Date.parse("2026-10-13T13:00:00Z");
    await db.insert(timeEntry).values(
      Array.from({ length: count }, (_, index) => ({
        workspaceId,
        userId: ownerId,
        description: `Tarea ${index}`,
        startedAt: new Date(start + index * 60_000),
        endedAt: new Date(start + (index + 1) * 60_000),
      })),
    );
    return {
      ownerId,
      token: await tokenOf({ id: ownerId, email: `${ownerId}@empresa.com` }),
    };
  }

  const levels = { subgroups: ["date", "description"] } as const;

  it("con 500 filas entre los tres niveles los muestra todos", async () => {
    const { token } = await seedDescriptions(498);

    const summary = await summarize(token, levels);

    expect(summary.levelsShown).toBe(3);
    expect(summary.groups[0]?.children?.[0]?.children).toHaveLength(498);
  });

  it("con 501 filas muestra dos niveles, con los grupos de los que entraron y el total entero", async () => {
    const { ownerId, token } = await seedDescriptions(499);

    const summary = await summarize(token, levels);

    expect(summary).toMatchObject({
      subgroups: ["date", "description"],
      levelsShown: 2,
      totalMinutes: 499,
    });
    expect(treeOf(summary.groups)).toEqual({
      [ownerId]: { minutes: 499, children: { "2026-10-13": { minutes: 499 } } },
    });
  });
});

describe("sin constancias (criterio 12)", () => {
  it("list_people y summarize_hours, con y sin error, no escriben en audit_log ni en time_entry", async () => {
    const team = await seedTeam();
    const ownerToken = await tokenOf(team.owner);
    const memberToken = await tokenOf(team.member);
    const before = await writes();

    await listPeople(ownerToken);
    await summarize(ownerToken, { subgroups: ["project", "date"] });
    await listPeople(memberToken);
    await summarize(memberToken);
    await callTool(memberToken, "summarize_hours", { ...WEEK, userIds: [team.owner.id] });
    await callTool(ownerToken, "summarize_hours", { ...WEEK, userIds: [randomUUID()] });

    expect(await writes()).toEqual(before);
  });
});

describe("el permiso se decide en cada llamada (criterio 13)", () => {
  async function setRole(team: Team, person: TeamPerson, role: Role) {
    await db
      .update(membership)
      .set({ role })
      .where(
        and(
          eq(membership.workspaceId, team.workspaceId),
          eq(membership.userId, person.id),
        ),
      );
  }

  it("un owner pasado a member ve solo lo propio con el mismo token, y no puede pedir a otra persona", async () => {
    const team = await seedTeam();
    const token = await tokenOf(team.owner);
    expect((await listPeople(token)).scope).toBe("everyone");
    expect((await summarize(token)).scope).toBe("everyone");

    await setRole(team, team.owner, "member");

    const listed = await listPeople(token);
    expect(listed).toEqual({
      scope: "self",
      people: [
        { id: team.owner.id, name: "Olga", email: null, inactive: false, self: true },
      ],
    });
    const summary = await summarize(token);
    expect(summary).toMatchObject({ scope: "self", totalMinutes: 60 });
    expect(treeOf(summary.groups)).toEqual({ [team.owner.id]: { minutes: 60 } });
    expectBareError(
      await callTool(token, "summarize_hours", { ...WEEK, userIds: [team.member.id] }),
      "forbidden",
      reportMessages.othersForbidden,
    );
  });

  it("un member pasado a admin ve a todo el equipo con el mismo token", async () => {
    const team = await seedTeam();
    const token = await tokenOf(team.member);
    expect((await summarize(token)).scope).toBe("self");

    await setRole(team, team.member, "admin");

    expect((await listPeople(token)).scope).toBe("everyone");
    expect(await summarize(token)).toMatchObject({
      scope: "everyone",
      totalMinutes: 255,
    });
  });
});
