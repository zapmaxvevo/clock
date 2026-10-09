import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/server/db";
import { tag, task, timeEntry, timeEntryTag, user } from "@/server/db/schema";
import type { Actor, MembershipStatus, Role } from "@/server/permissions";
import { type TimeSettings } from "@/server/time";
import {
  buenosAires,
  seedClient,
  seedMember,
  seedPreferences,
  seedProject,
  seedTag,
  seedTask,
  seedTimeEntry,
  seedWorkspace,
} from "@/test/factories";
import { actorIn, workspaceOf } from "@/test/time-entry";

import { projectLabels } from "@/modules/project/components/labels";
import { getTimesheetState } from "@/modules/time-entry/service";

import {
  REPORT_GROUP_BYS,
  reportReadyState,
  type ReportRange,
  type ReportReadyState,
} from "./schema";
import { reportRepository } from "./repository";
import { getReportState, type ReportRequest } from "./service";

const madrid = "Europe/Madrid";

/** El jueves 08/10/2026 a las 12:00 en Buenos Aires: el «hoy» de las lecturas. */
const readNow = new Date("2026-10-08T15:00:00Z");

/** La semana de `readNow` con lunes como primer día, y la anterior. */
const thisWeek: ReportRange = { first: "2026-10-05", last: "2026-10-11" };
const lastWeek: ReportRange = { first: "2026-09-28", last: "2026-10-04" };

const settings = workspaceOf(buenosAires);

let workspaceId: string;
let ownerId: string;
let owner: Actor;

beforeEach(async () => {
  const seeded = await seedWorkspace(buenosAires);
  workspaceId = seeded.workspaceId;
  ownerId = seeded.ownerId;
  owner = actorIn(workspaceId, ownerId, { role: "owner" });
  await renameAccount(ownerId, "Owner");
});

async function renameAccount(userId: string, name: string) {
  await db.update(user).set({ name }).where(eq(user.id, userId));
}

/** Una persona con su nombre de cuenta y, si se pasa, el editado. */
async function seedPerson(values: {
  readonly accountName: string;
  readonly displayName?: string;
  readonly role?: Role;
  readonly status?: MembershipStatus;
}): Promise<string> {
  const userId = await seedMember(workspaceId, values.role ?? "member", values.status);
  await renameAccount(userId, values.accountName);
  if (values.displayName !== undefined) {
    await seedPreferences(userId, { displayName: values.displayName });
  }
  return userId;
}

/** Una entrada cerrada de `seconds` segundos desde un instante ISO. */
function seedClosed(
  userId: string,
  startedAt: string,
  seconds: number,
  extra: {
    readonly projectId?: string | null;
    readonly taskId?: string | null;
    readonly billable?: boolean;
    readonly tagIds?: readonly string[];
  } = {},
) {
  const start = new Date(startedAt);
  return seedTimeEntry({
    workspaceId,
    userId,
    startedAt: start,
    endedAt: new Date(start.getTime() + seconds * 1000),
    ...extra,
  });
}

async function readyState(
  actor: Actor,
  request: Partial<ReportRequest> = {},
  options: { readonly settings?: TimeSettings; readonly now?: Date } = {},
): Promise<ReportReadyState> {
  const state = await getReportState(
    actor,
    options.settings ?? settings,
    { range: request.range ?? null, groupBy: request.groupBy ?? null },
    options.now ?? readNow,
  );
  if (state.kind !== "ready") {
    throw new Error(`Se esperaba el reporte y llegó ${state.kind}.`);
  }
  return state;
}

/** Las filas por persona como `[nombre, segundos]`, en orden. */
function personRows(state: ReportReadyState) {
  return state.groups.map((group) =>
    group.kind === "person" ? [group.name, group.seconds] : ["?", group.seconds],
  );
}

/** Las filas por proyecto como `[nombre, segundos]`, en orden; «Sin proyecto» por su rótulo. */
function projectRows(state: ReportReadyState) {
  return state.groups.map((group) =>
    group.kind === "project"
      ? [group.project?.name ?? projectLabels.noProject, group.seconds]
      : ["?", group.seconds],
  );
}

/** Las filas por fecha como `[día, rótulo, segundos]`, en orden. */
function dateRows(state: ReportReadyState) {
  return state.groups.map((group) =>
    group.kind === "date"
      ? [group.dayKey, group.label, group.seconds]
      : ["?", "?", group.seconds],
  );
}

/** Las filas por cliente como `[nombre, segundos]`, en orden; «Sin cliente» por su rótulo. */
function clientRows(state: ReportReadyState) {
  return state.groups.map((group) =>
    group.kind === "client"
      ? [group.client?.name ?? projectLabels.noClient, group.seconds]
      : ["?", group.seconds],
  );
}

describe("qué cuenta (RP-23, RP-28, RP-29, RP-30, RP-61)", () => {
  // La semana anterior en Buenos Aires: [2026-09-28T03:00Z, 2026-10-05T03:00Z).
  const from = "2026-09-28T03:00:00Z";
  const to = "2026-10-05T03:00:00Z";

  let inactiveId: string;
  let archivedId: string;
  let doneTaskId: string;

  beforeEach(async () => {
    inactiveId = await seedPerson({ accountName: "Inés", status: "inactive" });
    const archived = await seedProject({
      workspaceId,
      name: "Archivado",
      archived: true,
    });
    archivedId = archived.id;
    const doneTask = await seedTask({
      workspaceId,
      projectId: archived.id,
      name: "Hecha",
      status: "done",
    });
    doneTaskId = doneTask.id;

    // Empieza exactamente en `from`: cuenta.
    await seedClosed(ownerId, from, 60);
    // Empieza exactamente en `to`: no cuenta.
    await seedClosed(ownerId, to, 3600);
    // Empieza el día anterior al rango y termina adentro: no cuenta.
    await seedClosed(ownerId, "2026-09-28T02:00:00Z", 7200);
    // Empieza el último día y termina el siguiente: cuenta entera.
    await seedClosed(ownerId, "2026-10-05T02:00:00Z", 7200);
    // El timer abierto, con el inicio en el rango: no cuenta.
    await seedTimeEntry({
      workspaceId,
      userId: ownerId,
      startedAt: "2026-10-01T12:00:00Z",
    });
    // Proyecto archivado y tarea hecha: cuenta.
    await seedClosed(inactiveId, "2026-09-30T13:00:00Z", 600, {
      projectId: archivedId,
      taskId: doneTaskId,
    });
    // Sin proyecto, de una persona inactiva: cuenta.
    await seedClosed(inactiveId, "2026-10-01T13:00:00Z", 300);
  });

  it("por persona: solo las cerradas con el inicio en [from, to), con la inactiva marcada", async () => {
    const state = await readyState(owner, { range: lastWeek, groupBy: "person" });
    expect(state.groups).toEqual([
      { kind: "person", userId: ownerId, name: "Owner", inactive: false, seconds: 7260 },
      { kind: "person", userId: inactiveId, name: "Inés", inactive: true, seconds: 900 },
    ]);
    expect(state.totalSeconds).toBe(8160);
  });

  it("por proyecto: el archivado con su tarea hecha cuenta, y lo que no tiene proyecto va a «Sin proyecto»", async () => {
    const state = await readyState(owner, { range: lastWeek, groupBy: "project" });
    expect(state.groups).toEqual([
      { kind: "project", project: null, client: null, seconds: 7560 },
      {
        kind: "project",
        project: { id: archivedId, name: "Archivado", color: "blue" },
        client: null,
        seconds: 600,
      },
    ]);
    expect(state.totalSeconds).toBe(8160);
  });

  it("el timer abierto de hoy no está en ningún total; la que empieza en `to` es de la semana siguiente", async () => {
    await seedTimeEntry({ workspaceId, userId: inactiveId, startedAt: readNow });
    const state = await readyState(owner, { range: thisWeek, groupBy: "person" });
    expect(personRows(state)).toEqual([["Owner", 3600]]);
    expect(state.totalSeconds).toBe(3600);
  });
});

describe("la zona y la semana de quien mira (RP-22, RP-24)", () => {
  it("el lunes 01:00 UTC es de esta semana en Madrid y de la anterior en Buenos Aires", async () => {
    await seedClosed(ownerId, "2026-10-05T01:00:00Z", 600);
    const inMadrid = workspaceOf(madrid);

    expect((await readyState(owner, {}, { settings: inMadrid })).totalSeconds).toBe(600);
    expect((await readyState(owner)).totalSeconds).toBe(0);
    expect((await readyState(owner, { range: lastWeek })).totalSeconds).toBe(600);
    expect(
      (await readyState(owner, { range: lastWeek }, { settings: inMadrid })).totalSeconds,
    ).toBe(0);
  });

  it("los días se cortan en la zona del perfil, y el estado la dice", async () => {
    const state = await readyState(owner, {}, { settings: workspaceOf(madrid) });
    expect(state.timeZone).toBe(madrid);
    expect((await readyState(owner)).timeZone).toBe(buenosAires);
  });

  it("con el primer día en domingo, «Esta semana» empieza el domingo", async () => {
    // El domingo 04/10 a las 12:00 en Buenos Aires.
    await seedClosed(ownerId, "2026-10-04T15:00:00Z", 900);
    const state = await readyState(owner, {}, { settings: workspaceOf(buenosAires, 0) });
    expect(state.range).toEqual({ first: "2026-10-04", last: "2026-10-10" });
    expect(state.currentWeek).toEqual({ first: "2026-10-04", last: "2026-10-10" });
    expect(state.rangeLabel).toBe("Esta semana");
    expect(state.totalSeconds).toBe(900);
  });

  it("una semana que cruza el atraso de Madrid del 2026-10-25 cuenta la entrada de las 23:30 del domingo", async () => {
    // Lunes 19/10 00:30 en Madrid (UTC+2): adentro.
    await seedClosed(ownerId, "2026-10-18T22:30:00Z", 60);
    // Domingo 25/10 23:30 en Madrid, ya en UTC+1: adentro.
    await seedClosed(ownerId, "2026-10-25T22:30:00Z", 120);
    // Lunes 26/10 00:30 en Madrid: afuera.
    await seedClosed(ownerId, "2026-10-25T23:30:00Z", 240);
    // Domingo 18/10 23:30 en Madrid: afuera.
    await seedClosed(ownerId, "2026-10-18T21:30:00Z", 480);

    const state = await readyState(
      owner,
      { range: { first: "2026-10-19", last: "2026-10-25" } },
      { settings: workspaceOf(madrid) },
    );
    expect(state.totalSeconds).toBe(180);
  });

  it("en Pacific/Apia, desde = hasta = 2011-12-30, el día que falta, da cero sin error", async () => {
    const apia = workspaceOf("Pacific/Apia");
    // El 31/12/2011 a las 10:00 en Apia (UTC+14), el día siguiente al que falta.
    await seedClosed(ownerId, "2011-12-30T20:00:00Z", 600);
    const missing = await readyState(
      owner,
      { range: { first: "2011-12-30", last: "2011-12-30" } },
      { settings: apia },
    );
    expect([missing.groups, missing.totalSeconds]).toEqual([[], 0]);
    const next = await readyState(
      owner,
      { range: { first: "2011-12-31", last: "2011-12-31" } },
      { settings: apia },
    );
    expect(next.totalSeconds).toBe(600);
  });
});

describe("la medida (ADR 0021, D-R2a-6)", () => {
  /** Una entrada con los instantes escritos por SQL, con microsegundos. */
  async function seedExact(
    userId: string,
    startedAt: string,
    endedAt: string,
    billable: boolean,
  ) {
    await db.insert(timeEntry).values({
      workspaceId,
      userId,
      startedAt: sql`${startedAt}::timestamptz`,
      endedAt: sql`${endedAt}::timestamptz`,
      billable,
    });
  }

  it("el total del reporte es el de la planilla, con microsegundos, y el facturable suma solo las facturables", async () => {
    const memberId = await seedPerson({ accountName: "Marta" });
    const member = actorIn(workspaceId, memberId);
    const day = "2026-09-30";
    await seedExact(
      memberId,
      `${day} 10:00:00.000900-03`,
      `${day} 10:00:01.000500-03`,
      true,
    );
    await seedExact(
      memberId,
      `${day} 11:00:00.000500-03`,
      `${day} 11:00:01.000400-03`,
      false,
    );
    await seedExact(memberId, `${day} 12:00:00-03`, `${day} 12:00:01.5-03`, true);
    // Cruza dos límites de segundo: truncar a segundos daría 2 s.
    await seedExact(memberId, `${day} 13:00:00.75-03`, `${day} 13:00:02.25-03`, false);
    // Lo de otra persona no entra en el reporte propio ni en su fila.
    await seedClosed(ownerId, "2026-09-30T15:00:00Z", 3600, { billable: true });

    const timesheet = await getTimesheetState(member, settings, { day }, readNow);
    const own = await readyState(member, { range: lastWeek });
    const ownByClient = await readyState(member, { range: lastWeek, groupBy: "client" });
    const ownByDate = await readyState(member, { range: lastWeek, groupBy: "date" });
    const everyone = await readyState(owner, { range: lastWeek, groupBy: "person" });
    const memberRow = everyone.groups.find(
      (group) => group.kind === "person" && group.userId === memberId,
    );

    expect(own.scope).toBe("self");
    expect(own.totalSeconds).toBe(timesheet.closedSeconds);
    expect(memberRow?.seconds).toBe(timesheet.closedSeconds);
    // Con los instantes truncados a milisegundos, las cuatro miden 1 s.
    expect(timesheet.closedSeconds).toBe(4);
    expect(own.billableSeconds).toBe(2);
    // Por cliente (D-R2b-5): la fila «Sin cliente» y el total son los de la planilla.
    expect(ownByClient.groups).toEqual([
      { kind: "client", client: null, seconds: timesheet.closedSeconds },
    ]);
    expect([ownByClient.totalSeconds, ownByClient.billableSeconds]).toEqual([
      timesheet.closedSeconds,
      2,
    ]);
    // Por fecha (D-R2b-6): la fila del día y el total, igual.
    expect(dateRows(ownByDate)).toEqual([[day, "mié, 30/09", timesheet.closedSeconds]]);
    expect([ownByDate.totalSeconds, ownByDate.billableSeconds]).toEqual([
      timesheet.closedSeconds,
      2,
    ]);
  });

  it("una persona sin facturables da 0 en el facturable, no nulo", async () => {
    await seedClosed(ownerId, "2026-09-30T15:00:00Z", 3600, { billable: false });
    const state = await readyState(owner, { range: lastWeek, groupBy: "project" });
    expect([state.totalSeconds, state.billableSeconds]).toEqual([3600, 0]);
  });
});

describe("la agrupación y el orden (D-R2a-3, D-R2a-8, RP-12, RP-18)", () => {
  it("por persona, el nombre editado o, sin él, el de la cuenta", async () => {
    const edited = await seedPerson({ accountName: "Cuenta Ana", displayName: "Ana" });
    const plain = await seedPerson({ accountName: "Bruno de Google" });
    await seedClosed(edited, "2026-09-30T13:00:00Z", 600);
    await seedClosed(plain, "2026-09-30T14:00:00Z", 300);
    const state = await readyState(owner, { range: lastWeek, groupBy: "person" });
    expect(personRows(state)).toEqual([
      ["Ana", 600],
      ["Bruno de Google", 300],
    ]);
  });

  it("por persona, por duración descendente y no alfabético; con la misma, por nombre", async () => {
    const zoe = await seedPerson({ accountName: "Zoe" });
    const ana = await seedPerson({ accountName: "Ana" });
    const beto = await seedPerson({ accountName: "Beto" });
    await seedClosed(zoe, "2026-09-30T13:00:00Z", 900);
    await seedClosed(beto, "2026-09-30T13:00:00Z", 300);
    await seedClosed(ana, "2026-09-30T13:00:00Z", 300);
    const state = await readyState(owner, { range: lastWeek });
    expect(state.groupBy).toBe("person");
    expect(personRows(state)).toEqual([
      ["Zoe", 900],
      ["Ana", 300],
      ["Beto", 300],
    ]);
  });

  it("por proyecto: nombre, color y cliente; «Sin proyecto» sin cliente y después de un proyecto de igual duración", async () => {
    const acme = await seedClient({ workspaceId, name: "Acme" });
    const web = await seedProject({
      workspaceId,
      name: "Web",
      color: "green",
      clientId: acme.id,
    });
    const app = await seedProject({ workspaceId, name: "App", color: "violet" });
    const zeta = await seedProject({ workspaceId, name: "Zeta", color: "red" });
    await seedClosed(ownerId, "2026-09-29T13:00:00Z", 1200, { projectId: zeta.id });
    await seedClosed(ownerId, "2026-09-29T14:00:00Z", 600, { projectId: web.id });
    await seedClosed(ownerId, "2026-09-29T15:00:00Z", 600, { projectId: app.id });
    await seedClosed(ownerId, "2026-09-29T16:00:00Z", 600);

    const state = await readyState(owner, { range: lastWeek, groupBy: "project" });

    expect(reportReadyState.parse(state)).toEqual(state);
    expect(state.groups).toEqual([
      {
        kind: "project",
        project: { id: zeta.id, name: "Zeta", color: "red" },
        client: null,
        seconds: 1200,
      },
      {
        kind: "project",
        project: { id: app.id, name: "App", color: "violet" },
        client: null,
        seconds: 600,
      },
      {
        kind: "project",
        project: { id: web.id, name: "Web", color: "green" },
        client: { id: acme.id, name: "Acme" },
        seconds: 600,
      },
      { kind: "project", project: null, client: null, seconds: 600 },
    ]);
  });

  it("los totales son la suma de los grupos, con «Sin proyecto» y el facturable", async () => {
    const other = await seedPerson({ accountName: "Otra" });
    const web = await seedProject({ workspaceId, name: "Web" });
    await seedClosed(ownerId, "2026-09-29T13:00:00Z", 1200, {
      projectId: web.id,
      billable: true,
    });
    await seedClosed(other, "2026-09-29T14:00:00Z", 600);
    await seedClosed(other, "2026-09-30T14:00:00Z", 30, { billable: true });

    for (const groupBy of REPORT_GROUP_BYS) {
      const state = await readyState(owner, { range: lastWeek, groupBy });
      expect([
        groupBy,
        state.totalSeconds,
        state.billableSeconds,
        state.groups.reduce((sum, group) => sum + group.seconds, 0),
      ]).toEqual([groupBy, 1830, 1230, 1830]);
    }
    expect(
      projectRows(await readyState(owner, { range: lastWeek, groupBy: "project" })),
    ).toEqual([
      ["Web", 1200],
      [projectLabels.noProject, 630],
    ]);
  });
});

describe("por cliente (D-R2b-5, RP-11, RP-12, RP-28, RP-29)", () => {
  let acmeId: string;
  let omegaId: string;
  let zetaId: string;

  beforeEach(async () => {
    const acme = await seedClient({ workspaceId, name: "Acme" });
    const omega = await seedClient({ workspaceId, name: "Omega" });
    const zeta = await seedClient({ workspaceId, name: "Zeta", archived: true });
    acmeId = acme.id;
    omegaId = omega.id;
    zetaId = zeta.id;
    const web = await seedProject({ workspaceId, name: "Web", clientId: acme.id });
    const app = await seedProject({ workspaceId, name: "App", clientId: acme.id });
    const big = await seedProject({ workspaceId, name: "Grande", clientId: omega.id });
    const old = await seedProject({
      workspaceId,
      name: "Viejo",
      clientId: zeta.id,
      archived: true,
    });
    const loose = await seedProject({ workspaceId, name: "Suelto" });
    const other = await seedPerson({ accountName: "Otra" });

    // Acme: dos proyectos, 600 + 900, de dos personas.
    await seedClosed(ownerId, "2026-09-29T13:00:00Z", 600, {
      projectId: web.id,
      billable: true,
    });
    await seedClosed(other, "2026-09-30T13:00:00Z", 900, { projectId: app.id });
    // Omega: la de más horas, aunque su nombre va después.
    await seedClosed(ownerId, "2026-09-30T14:00:00Z", 2000, { projectId: big.id });
    // Zeta, archivado, con su proyecto archivado: cuenta.
    await seedClosed(other, "2026-10-01T13:00:00Z", 1500, {
      projectId: old.id,
      billable: true,
    });
    // «Sin cliente»: un proyecto sin cliente y una entrada sin proyecto.
    await seedClosed(ownerId, "2026-10-01T14:00:00Z", 400, { projectId: loose.id });
    await seedClosed(other, "2026-10-02T13:00:00Z", 1100, { billable: true });
  });

  it("una fila por cliente con la suma de sus proyectos, el archivado incluido y «Sin cliente» con lo que no tiene", async () => {
    const state = await readyState(owner, { range: lastWeek, groupBy: "client" });

    expect(reportReadyState.parse(state)).toEqual(state);
    expect(state.groupBy).toBe("client");
    expect(state.groups).toEqual([
      { kind: "client", client: { id: omegaId, name: "Omega" }, seconds: 2000 },
      { kind: "client", client: { id: acmeId, name: "Acme" }, seconds: 1500 },
      { kind: "client", client: { id: zetaId, name: "Zeta" }, seconds: 1500 },
      { kind: "client", client: null, seconds: 1500 },
    ]);
  });

  it("los totales son la suma de los grupos e iguales a los de «Proyecto»", async () => {
    const byClient = await readyState(owner, { range: lastWeek, groupBy: "client" });
    const byProject = await readyState(owner, { range: lastWeek, groupBy: "project" });
    expect([
      byClient.totalSeconds,
      byClient.billableSeconds,
      byClient.groups.reduce((sum, group) => sum + group.seconds, 0),
    ]).toEqual([6500, 3200, 6500]);
    expect([byProject.totalSeconds, byProject.billableSeconds]).toEqual([
      byClient.totalSeconds,
      byClient.billableSeconds,
    ]);
  });

  it("con alcance propio, solo las horas de quien mira, plegadas igual", async () => {
    const memberId = await seedPerson({ accountName: "Marta" });
    const member = actorIn(workspaceId, memberId);
    const state = await readyState(member, { range: lastWeek, groupBy: "client" });
    expect([state.scope, state.groups, state.totalSeconds]).toEqual(["self", [], 0]);
    const own = await readyState(actorIn(workspaceId, ownerId, { role: "member" }), {
      range: lastWeek,
      groupBy: "client",
    });
    expect(clientRows(own)).toEqual([
      ["Omega", 2000],
      ["Acme", 600],
      [projectLabels.noClient, 400],
    ]);
  });
});

describe("«Este mes» en Madrid (D-R2b-2, criterio 8)", () => {
  /** El jueves 15/10/2026 a las 12:00 en Madrid. */
  const october = new Date("2026-10-15T10:00:00Z");
  const inMadrid = workspaceOf(madrid);

  it("el rango del atajo cuenta del 1 a las 00:30 al 31 a las 23:30, ya en UTC+1, y nada de los meses vecinos", async () => {
    // 01/10 00:30 en Madrid (UTC+2): adentro.
    await seedClosed(ownerId, "2026-09-30T22:30:00Z", 60);
    // 31/10 23:30 en Madrid, después del atraso del 25 (UTC+1): adentro.
    await seedClosed(ownerId, "2026-10-31T22:30:00Z", 120);
    // 30/09 23:30 en Madrid: afuera.
    await seedClosed(ownerId, "2026-09-30T21:30:00Z", 240);
    // 01/11 00:30 en Madrid: afuera.
    await seedClosed(ownerId, "2026-10-31T23:30:00Z", 480);

    const today = await readyState(owner, {}, { settings: inMadrid, now: october });
    const thisMonth = today.shortcuts.find((shortcut) => shortcut.id === "thisMonth");
    expect(thisMonth?.range).toEqual({ first: "2026-10-01", last: "2026-10-31" });

    for (const groupBy of ["person", "client"] as const) {
      const state = await readyState(
        owner,
        { range: thisMonth?.range ?? null, groupBy },
        { settings: inMadrid, now: october },
      );
      expect([groupBy, state.rangeLabel, state.totalSeconds]).toEqual([
        groupBy,
        "Este mes",
        180,
      ]);
    }
  });
});

describe("los atajos en el estado (D-R2b-2)", () => {
  it("son los nueve de hoy, en orden, y el rótulo del período es el del atajo", async () => {
    const state = await readyState(owner);
    expect(state.shortcuts.map((shortcut) => shortcut.label)).toEqual([
      "Hoy",
      "Ayer",
      "Esta semana",
      "Semana anterior",
      "Últimas dos semanas",
      "Este mes",
      "Mes pasado",
      "Este año",
      "Año pasado",
    ]);
    const lastMonth = state.shortcuts.find((shortcut) => shortcut.id === "lastMonth");
    const picked = await readyState(owner, { range: lastMonth?.range ?? null });
    expect([picked.range, picked.rangeLabel, picked.previous, picked.next]).toEqual([
      { first: "2026-09-01", last: "2026-09-30" },
      "Mes pasado",
      { first: "2026-08-01", last: "2026-08-31" },
      { first: "2026-10-01", last: "2026-10-31" },
    ]);
  });
});

describe("por fecha (D-R2b-6, RP-11, RP-22)", () => {
  it("una fila por día con horas, en orden cronológico, cortada en Buenos Aires y sin las de afuera", async () => {
    const other = await seedPerson({ accountName: "Otra" });
    // El martes 29/09: 600.
    await seedClosed(ownerId, "2026-09-29T13:00:00Z", 600);
    // El jueves 01/10: 1200, de dos personas.
    await seedClosed(ownerId, "2026-10-01T13:00:00Z", 900);
    await seedClosed(other, "2026-10-01T18:00:00Z", 300, { billable: true });
    // El viernes 02/10, con más horas que los anteriores: va después igual.
    await seedClosed(other, "2026-10-02T13:00:00Z", 3600);
    // El sábado 03/10 a las 23:59:59 en Buenos Aires: del sábado.
    await seedClosed(ownerId, "2026-10-04T02:59:59Z", 60);
    // El domingo 04/10 a las 00:00 en Buenos Aires: del domingo.
    await seedClosed(ownerId, "2026-10-04T03:00:00Z", 120);
    // El domingo 27/09 a las 23:00 en Buenos Aires, el día antes del rango: no cuenta.
    await seedClosed(ownerId, "2026-09-28T02:00:00Z", 7200);
    // El lunes 05/10 a las 00:00, el fin del rango: no cuenta.
    await seedClosed(ownerId, "2026-10-05T03:00:00Z", 3600);
    // El timer abierto del miércoles: no cuenta, y el miércoles no tiene fila.
    await seedTimeEntry({
      workspaceId,
      userId: other,
      startedAt: "2026-09-30T13:00:00Z",
    });

    const state = await readyState(owner, { range: lastWeek, groupBy: "date" });

    expect(reportReadyState.parse(state)).toEqual(state);
    expect(state.groupBy).toBe("date");
    expect(state.groups).toEqual([
      { kind: "date", dayKey: "2026-09-29", label: "mar, 29/09", seconds: 600 },
      { kind: "date", dayKey: "2026-10-01", label: "jue, 01/10", seconds: 1200 },
      { kind: "date", dayKey: "2026-10-02", label: "vie, 02/10", seconds: 3600 },
      { kind: "date", dayKey: "2026-10-03", label: "sáb, 03/10", seconds: 60 },
      { kind: "date", dayKey: "2026-10-04", label: "dom, 04/10", seconds: 120 },
    ]);
    const byPerson = await readyState(owner, { range: lastWeek, groupBy: "person" });
    expect([state.totalSeconds, state.billableSeconds]).toEqual([5580, 300]);
    expect([byPerson.totalSeconds, byPerson.billableSeconds]).toEqual([
      state.totalSeconds,
      state.billableSeconds,
    ]);
  });

  it("hoy y ayer se rotulan con su fecha, no con «Hoy» ni «Ayer»", async () => {
    // El miércoles 07/10 y el jueves 08/10, el día de `readNow`.
    await seedClosed(ownerId, "2026-10-07T13:00:00Z", 300);
    await seedClosed(ownerId, "2026-10-08T13:00:00Z", 600);
    const state = await readyState(owner, { range: thisWeek, groupBy: "date" });
    expect(dateRows(state)).toEqual([
      ["2026-10-07", "mié, 07/10", 300],
      ["2026-10-08", "jue, 08/10", 600],
    ]);
  });

  it("«Año pasado» con una entrada el primer día y otra el último da dos filas con el año", async () => {
    await seedClosed(ownerId, "2025-01-01T15:00:00Z", 600);
    await seedClosed(ownerId, "2025-12-31T15:00:00Z", 900);
    const today = await readyState(owner);
    const lastYear = today.shortcuts.find((shortcut) => shortcut.id === "lastYear");
    expect(lastYear?.range).toEqual({ first: "2025-01-01", last: "2025-12-31" });
    const state = await readyState(owner, {
      range: lastYear?.range ?? null,
      groupBy: "date",
    });
    expect([state.rangeLabel, dateRows(state), state.totalSeconds]).toEqual([
      "Año pasado",
      [
        ["2025-01-01", "mié, 01/01/2025", 600],
        ["2025-12-31", "mié, 31/12/2025", 900],
      ],
      1500,
    ]);
  });

  it("un período sin horas no tiene filas", async () => {
    const state = await readyState(owner, { range: lastWeek, groupBy: "date" });
    expect([state.groups, state.totalSeconds, state.billableSeconds]).toEqual([[], 0, 0]);
  });

  it("en Madrid, el día del atraso y el del adelanto de 2026 se cortan en la hora local", async () => {
    const inMadrid = workspaceOf(madrid);
    // Domingo 25/10 23:30 en Madrid, ya en UTC+1: del 25.
    await seedClosed(ownerId, "2026-10-25T22:30:00Z", 60);
    // Lunes 26/10 00:30 en Madrid: del 26.
    await seedClosed(ownerId, "2026-10-25T23:30:00Z", 120);
    // Domingo 29/03 23:30 en Madrid, ya en UTC+2: del 29.
    await seedClosed(ownerId, "2026-03-29T21:30:00Z", 240);
    // Lunes 30/03 00:30 en Madrid (CEST): del 30.
    await seedClosed(ownerId, "2026-03-29T22:30:00Z", 480);

    const october = await readyState(
      owner,
      { range: { first: "2026-10-24", last: "2026-10-26" }, groupBy: "date" },
      { settings: inMadrid },
    );
    expect(dateRows(october)).toEqual([
      ["2026-10-25", "dom, 25/10", 60],
      ["2026-10-26", "lun, 26/10", 120],
    ]);
    const march = await readyState(
      owner,
      { range: { first: "2026-03-28", last: "2026-03-30" }, groupBy: "date" },
      { settings: inMadrid },
    );
    expect(dateRows(march)).toEqual([
      ["2026-03-29", "dom, 29/03", 240],
      ["2026-03-30", "lun, 30/03", 480],
    ]);
  });

  it("en Pacific/Apia, el día que falta no tiene fila y lo del corte repetido es del 31", async () => {
    const apia = workspaceOf("Pacific/Apia");
    const range = { first: "2011-12-29", last: "2011-12-31" };
    // El 29/12/2011 a las 12:00 en Apia (UTC-10).
    await seedClosed(ownerId, "2011-12-29T22:00:00Z", 600);
    // Justo en el corte repetido: las 00:00 del 31 (UTC+14).
    await seedClosed(ownerId, "2011-12-30T10:00:00Z", 60);
    // El 31/12/2011 a las 12:00 en Apia.
    await seedClosed(ownerId, "2011-12-30T22:00:00Z", 300);

    const state = await readyState(owner, { range, groupBy: "date" }, { settings: apia });
    expect(dateRows(state)).toEqual([
      ["2011-12-29", "jue, 29/12/2011", 600],
      ["2011-12-31", "sáb, 31/12/2011", 360],
    ]);
    const byPerson = await readyState(owner, { range }, { settings: apia });
    expect([state.totalSeconds, byPerson.totalSeconds]).toEqual([960, 960]);
  });
});

describe("el período (D-R2a-4, RP-20)", () => {
  it("sin rango, la semana de hoy de quien mira, con «Esta semana» y las flechas a 7 días", async () => {
    const state = await readyState(owner);
    expect(state).toMatchObject({
      todayKey: "2026-10-08",
      range: thisWeek,
      currentWeek: thisWeek,
      rangeLabel: "Esta semana",
      previous: lastWeek,
      next: { first: "2026-10-12", last: "2026-10-18" },
      groupBy: "person",
      scope: "everyone",
    });
  });

  it("con rango, ese; «Semana anterior» y el rango de una semana lejana", async () => {
    const previous = await readyState(owner, { range: lastWeek });
    expect([previous.range, previous.rangeLabel, previous.currentWeek]).toEqual([
      lastWeek,
      "Semana anterior",
      thisWeek,
    ]);
    const far = await readyState(owner, {
      range: { first: "2026-09-14", last: "2026-09-20" },
    });
    expect([far.rangeLabel, far.previous, far.next]).toEqual([
      "14/09 – 20/09",
      { first: "2026-09-07", last: "2026-09-13" },
      { first: "2026-09-21", last: "2026-09-27" },
    ]);
  });

  it("un rango libre de 10 días se rotula con sus días y se mueve 10 días", async () => {
    const state = await readyState(owner, {
      range: { first: "2026-10-05", last: "2026-10-14" },
      groupBy: "project",
    });
    expect([state.rangeLabel, state.previous, state.next, state.groupBy]).toEqual([
      "05/10 – 14/10",
      { first: "2026-09-25", last: "2026-10-04" },
      { first: "2026-10-15", last: "2026-10-24" },
      "project",
    ]);
  });

  it("siete días que no arrancan en el primer día de quien mira son un rango libre", async () => {
    const state = await readyState(owner, {
      range: { first: "2026-09-30", last: "2026-10-06" },
    });
    expect(state.rangeLabel).toBe("30/09 – 06/10");
  });

  it("un día suelto se rotula sin guion y se mueve de a un día", async () => {
    const state = await readyState(owner, {
      range: { first: "2026-10-01", last: "2026-10-01" },
    });
    expect([state.rangeLabel, state.previous, state.next]).toEqual([
      "01/10",
      { first: "2026-09-30", last: "2026-09-30" },
      { first: "2026-10-02", last: "2026-10-02" },
    ]);
  });

  it("la flecha cuyo destino saldría de los años de cuatro cifras es null", async () => {
    const top = await readyState(owner, {
      range: { first: "9999-12-20", last: "9999-12-29" },
    });
    expect([top.rangeLabel, top.previous, top.next]).toEqual([
      "20/12/9999 – 29/12/9999",
      { first: "9999-12-10", last: "9999-12-19" },
      null,
    ]);
    const bottom = await readyState(owner, {
      range: { first: "0100-01-01", last: "0100-01-10" },
    });
    expect([bottom.previous, bottom.next]).toEqual([
      null,
      { first: "0100-01-11", last: "0100-01-20" },
    ]);
  });

  it("la flecha cuyo último día no tendría día siguiente también es null", async () => {
    // El destino terminaría el 9999-12-31: su día siguiente no tiene clave.
    const edge = await readyState(owner, {
      range: { first: "9999-12-18", last: "9999-12-24" },
    });
    expect(edge.next).toBeNull();
    const inside = await readyState(owner, {
      range: { first: "9999-12-17", last: "9999-12-23" },
    });
    expect(inside.next).toEqual({ first: "9999-12-24", last: "9999-12-30" });
  });
});

/** Las filas por tarea como `[tarea, proyecto, segundos]`, en orden; «Sin tarea» como `null`. */
function taskRows(state: ReportReadyState) {
  return state.groups.map((group) =>
    group.kind === "task"
      ? [group.task?.name ?? null, group.project?.name ?? null, group.seconds]
      : ["?", "?", group.seconds],
  );
}

/** Las filas por etiqueta como `[nombre, segundos]`, en orden; «Sin etiqueta» como `null`. */
function tagRows(state: ReportReadyState) {
  return state.groups.map((group) =>
    group.kind === "tag"
      ? [group.tag?.name ?? null, group.seconds]
      : ["?", group.seconds],
  );
}

/** El total y el facturable de la cabecera. */
function totalsOf(state: ReportReadyState) {
  return [state.totalSeconds, state.billableSeconds];
}

describe("por tarea (D-R3-4, RP-11, RP-28, RP-29; criterio 3 de R3)", () => {
  let p: { readonly id: string };
  let q: { readonly id: string };
  let t1Id: string;
  let t2Id: string;
  let t3Id: string;
  let analysisId: string;

  beforeEach(async () => {
    const c = await seedClient({ workspaceId, name: "C" });
    p = await seedProject({ workspaceId, name: "P", color: "green", clientId: c.id });
    q = await seedProject({ workspaceId, name: "Q", color: "red" });
    t1Id = (await seedTask({ workspaceId, projectId: p.id, name: "Diseño" })).id;
    t2Id = (
      await seedTask({ workspaceId, projectId: p.id, name: "Revisión", status: "done" })
    ).id;
    // Se llama igual que T1, en otro proyecto: dos filas.
    t3Id = (await seedTask({ workspaceId, projectId: q.id, name: "Diseño" })).id;
    analysisId = (await seedTask({ workspaceId, projectId: q.id, name: "Análisis" })).id;

    const other = await seedPerson({ accountName: "Otra" });
    await seedClosed(ownerId, "2026-09-29T13:00:00Z", 1200, {
      projectId: p.id,
      taskId: t1Id,
      billable: true,
    });
    await seedClosed(other, "2026-09-29T14:00:00Z", 600, {
      projectId: q.id,
      taskId: t3Id,
    });
    await seedClosed(ownerId, "2026-09-30T13:00:00Z", 600, {
      projectId: q.id,
      taskId: analysisId,
    });
    await seedClosed(other, "2026-09-30T14:00:00Z", 300, {
      projectId: p.id,
      taskId: t2Id,
    });
    // «Sin tarea»: una de P sin tarea y una sin proyecto.
    await seedClosed(ownerId, "2026-10-01T13:00:00Z", 200, {
      projectId: p.id,
      billable: true,
    });
    await seedClosed(other, "2026-10-01T14:00:00Z", 100);
  });

  it("una fila por tarea con su proyecto, la hecha cuenta, y «Sin tarea» junta lo de P sin tarea y lo sin proyecto, sin proyecto", async () => {
    const state = await readyState(owner, { range: lastWeek, groupBy: "task" });
    expect(reportReadyState.parse(state)).toEqual(state);
    expect(state.groups).toEqual([
      {
        kind: "task",
        task: { id: t1Id, name: "Diseño" },
        project: { id: p.id, name: "P", color: "green" },
        seconds: 1200,
      },
      {
        kind: "task",
        task: { id: analysisId, name: "Análisis" },
        project: { id: q.id, name: "Q", color: "red" },
        seconds: 600,
      },
      {
        kind: "task",
        task: { id: t3Id, name: "Diseño" },
        project: { id: q.id, name: "Q", color: "red" },
        seconds: 600,
      },
      {
        kind: "task",
        task: { id: t2Id, name: "Revisión" },
        project: { id: p.id, name: "P", color: "green" },
        seconds: 300,
      },
      { kind: "task", task: null, project: null, seconds: 300 },
    ]);
    const byPerson = await readyState(owner, { range: lastWeek, groupBy: "person" });
    expect(totalsOf(state)).toEqual([3000, 1400]);
    expect(totalsOf(state)).toEqual(totalsOf(byPerson));
  });

  it("borrada T2, su entrada pasa a «Sin tarea», que queda después de las de su misma duración", async () => {
    await db.delete(task).where(eq(task.id, t2Id));
    const state = await readyState(owner, { range: lastWeek, groupBy: "task" });
    expect(taskRows(state)).toEqual([
      ["Diseño", "P", 1200],
      ["Análisis", "Q", 600],
      ["Diseño", "Q", 600],
      [null, null, 600],
    ]);
    expect(totalsOf(state)).toEqual([3000, 1400]);
  });
});

describe("por etiqueta (D-R3-3, RP-18, RP-28, RP-29; criterio 4 de R3)", () => {
  let e1Id: string;
  let e2Id: string;
  let e3Id: string;

  beforeEach(async () => {
    e1Id = (await seedTag({ workspaceId, name: "Urgente" })).id;
    e2Id = (await seedTag({ workspaceId, name: "Cliente" })).id;
    e3Id = (await seedTag({ workspaceId, name: "Vieja", archived: true })).id;
    const other = await seedPerson({ accountName: "Otra" });
    // e1, con E1 y E2.
    await seedClosed(ownerId, "2026-09-29T13:00:00Z", 600, {
      billable: true,
      tagIds: [e1Id, e2Id],
    });
    // e2, con E1.
    await seedClosed(other, "2026-09-29T14:00:00Z", 300, { tagIds: [e1Id] });
    // e3, sin etiquetas.
    await seedClosed(other, "2026-09-30T14:00:00Z", 200);
    // e4, con E3 archivada.
    await seedClosed(ownerId, "2026-09-30T13:00:00Z", 200, {
      billable: true,
      tagIds: [e3Id],
    });
  });

  it("cada etiqueta suma todas sus entradas, la archivada cuenta, «Sin etiqueta» va después de una de igual duración y el total es el real", async () => {
    const state = await readyState(owner, { range: lastWeek, groupBy: "tag" });
    expect(reportReadyState.parse(state)).toEqual(state);
    expect(state.groups).toEqual([
      { kind: "tag", tag: { id: e1Id, name: "Urgente" }, seconds: 900 },
      { kind: "tag", tag: { id: e2Id, name: "Cliente" }, seconds: 600 },
      { kind: "tag", tag: { id: e3Id, name: "Vieja" }, seconds: 200 },
      { kind: "tag", tag: null, seconds: 200 },
    ]);
    // RP-18: las filas suman más que el total.
    expect(state.groups.reduce((sum, group) => sum + group.seconds, 0)).toBe(1900);
    const byPerson = await readyState(owner, { range: lastWeek, groupBy: "person" });
    expect(totalsOf(state)).toEqual([1300, 800]);
    expect(totalsOf(state)).toEqual(totalsOf(byPerson));
  });

  it("borrada E3, su entrada pasa a «Sin etiqueta»", async () => {
    await db.delete(tag).where(eq(tag.id, e3Id));
    const state = await readyState(owner, { range: lastWeek, groupBy: "tag" });
    expect(tagRows(state)).toEqual([
      ["Urgente", 900],
      ["Cliente", 600],
      [null, 400],
    ]);
    expect(totalsOf(state)).toEqual([1300, 800]);
  });
});

describe("una sola foto (ADR 0021, D-R3-3; criterio 5 de R3)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("por etiqueta, una transacción de solo lectura repeatable read, con las dos lecturas en su Executor", async () => {
    const transaction = vi.spyOn(db, "transaction");
    const byLevels = vi.spyOn(reportRepository, "totalsByLevels");
    const entryTotals = vi.spyOn(reportRepository, "entryTotals");
    await readyState(owner, { range: lastWeek, groupBy: "tag" });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0]?.[1]).toEqual({
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
    expect([byLevels.mock.calls.length, entryTotals.mock.calls.length]).toEqual([1, 1]);
    const executor = byLevels.mock.calls[0]?.[2];
    expect(executor).toBeDefined();
    expect(executor).not.toBe(db);
    expect(entryTotals.mock.calls[0]?.[2]).toBe(executor);
  });

  it("por persona, una lectura en la transacción y ninguna de entryTotals", async () => {
    const transaction = vi.spyOn(db, "transaction");
    const byLevels = vi.spyOn(reportRepository, "totalsByLevels");
    const entryTotals = vi.spyOn(reportRepository, "entryTotals");
    await readyState(owner, { range: lastWeek, groupBy: "person" });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(byLevels).toHaveBeenCalledTimes(1);
    const executor = byLevels.mock.calls[0]?.[2];
    expect(executor).toBeDefined();
    expect(executor).not.toBe(db);
    expect(entryTotals).not.toHaveBeenCalled();
  });
});

describe("la medida por tarea y por etiqueta (ADR 0021; criterio 6 de R3)", () => {
  it("cada entrada se trunca antes de sumar: T y el total son los de la planilla, E1 3 s, E2 1 s, «Sin etiqueta» 1 s", async () => {
    const memberId = await seedPerson({ accountName: "Marta" });
    const member = actorIn(workspaceId, memberId);
    const project = await seedProject({ workspaceId, name: "P" });
    const t = await seedTask({ workspaceId, projectId: project.id, name: "T" });
    const e1 = await seedTag({ workspaceId, name: "E1" });
    const e2 = await seedTag({ workspaceId, name: "E2" });
    const day = "2026-09-30";

    /** Una entrada en T con los instantes escritos por SQL, con microsegundos. */
    async function seedExact(
      startedAt: string,
      endedAt: string,
      billable: boolean,
      tagIds: readonly string[],
    ) {
      const [row] = await db
        .insert(timeEntry)
        .values({
          workspaceId,
          userId: memberId,
          projectId: project.id,
          taskId: t.id,
          startedAt: sql`${startedAt}::timestamptz`,
          endedAt: sql`${endedAt}::timestamptz`,
          billable,
        })
        .returning();
      for (const tagId of tagIds) {
        await db.insert(timeEntryTag).values({ workspaceId, timeEntryId: row.id, tagId });
      }
    }

    // Las dos de microsegundos: E1 en una, la otra sin etiquetas.
    await seedExact(`${day} 10:00:00.000900-03`, `${day} 10:00:01.000500-03`, true, [
      e1.id,
    ]);
    await seedExact(`${day} 11:00:00.000500-03`, `${day} 11:00:01.000400-03`, false, []);
    // Las dos de 1,5 s: E1 en las dos, E2 en una.
    await seedExact(`${day} 12:00:00-03`, `${day} 12:00:01.5-03`, true, [e1.id]);
    await seedExact(`${day} 13:00:00.75-03`, `${day} 13:00:02.25-03`, false, [
      e1.id,
      e2.id,
    ]);

    const timesheet = await getTimesheetState(member, settings, { day }, readNow);
    expect(timesheet.closedSeconds).toBe(4);

    const byTask = await readyState(member, { range: lastWeek, groupBy: "task" });
    expect(taskRows(byTask)).toEqual([["T", "P", timesheet.closedSeconds]]);
    expect(totalsOf(byTask)).toEqual([timesheet.closedSeconds, 2]);

    const byTag = await readyState(member, { range: lastWeek, groupBy: "tag" });
    expect(tagRows(byTag)).toEqual([
      ["E1", 3],
      ["E2", 1],
      [null, 1],
    ]);
    expect(totalsOf(byTag)).toEqual([timesheet.closedSeconds, 2]);
  });
});

/** El alcance y la lectura por fecha de un pedido real del owner: solo el service construye el alcance. */
async function realLevelRead() {
  const byLevels = vi.spyOn(reportRepository, "totalsByLevels");
  await readyState(owner, { range: lastWeek, groupBy: "date" });
  const call = byLevels.mock.calls[0];
  byLevels.mockRestore();
  if (call === undefined) {
    throw new Error("Se esperaba la lectura por niveles.");
  }
  const [scope, read] = call;
  if (read.buckets === null) {
    throw new Error("Se esperaba la lectura por fecha, con sus tramos.");
  }
  return { scope, span: read.span, buckets: read.buckets };
}

describe("las guardas de totalsByLevels (§4.3 de R3; criterio 7)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("cada lectura mal formada lanza RangeError sin consultar, con db y con el Executor de una transacción", async () => {
    const { scope, span, buckets } = await realLevelRead();
    const [first] = buckets.buckets;
    const shifted = (instant: Date) => new Date(instant.getTime() + 1000);
    const invalid = [
      { span, dimensions: [], buckets: null },
      { span, dimensions: ["person", "project", "client", "task"], buckets: null },
      { span, dimensions: ["person", "person"], buckets: null },
      { span, dimensions: ["project", "date"], buckets: null },
      { span, dimensions: ["project"], buckets },
      { span, dimensions: ["date"], buckets: { buckets: [], end: buckets.end } },
      {
        span,
        dimensions: ["date"],
        buckets: {
          buckets: [
            { ...first, start: shifted(first.start) },
            ...buckets.buckets.slice(1),
          ],
          end: buckets.end,
        },
      },
      { span, dimensions: ["date"], buckets: { ...buckets, end: shifted(buckets.end) } },
    ] as const;

    const select = vi.spyOn(db, "select");
    for (const read of invalid) {
      await expect(reportRepository.totalsByLevels(scope, read)).rejects.toThrow(
        RangeError,
      );
    }
    expect(select).not.toHaveBeenCalled();

    await db.transaction(async (tx) => {
      const txSelect = vi.spyOn(tx, "select");
      for (const read of invalid) {
        await expect(reportRepository.totalsByLevels(scope, read, tx)).rejects.toThrow(
          RangeError,
        );
      }
      expect(txSelect).not.toHaveBeenCalled();
    });
    expect(select).not.toHaveBeenCalled();
  });
});

describe("varios niveles en la lectura (D-R3-2, D-R3-3; criterio 8 de R3)", () => {
  let otherId: string;
  let acme: { readonly id: string };
  let omega: { readonly id: string };
  let web: { readonly id: string };
  let app: { readonly id: string };
  let zeta: { readonly id: string };
  let designId: string;
  let supportId: string;
  let eId: string;
  let fId: string;

  beforeEach(async () => {
    otherId = await seedPerson({ accountName: "Otra" });
    acme = await seedClient({ workspaceId, name: "Acme" });
    omega = await seedClient({ workspaceId, name: "Omega" });
    web = await seedProject({
      workspaceId,
      name: "Web",
      color: "green",
      clientId: acme.id,
    });
    app = await seedProject({
      workspaceId,
      name: "App",
      color: "violet",
      clientId: omega.id,
    });
    zeta = await seedProject({ workspaceId, name: "Zeta", color: "red" });
    designId = (await seedTask({ workspaceId, projectId: web.id, name: "Diseño" })).id;
    supportId = (await seedTask({ workspaceId, projectId: zeta.id, name: "Soporte" })).id;
    eId = (await seedTag({ workspaceId, name: "E" })).id;
    fId = (await seedTag({ workspaceId, name: "F" })).id;

    // La de dos etiquetas, el martes 29/09.
    await seedClosed(ownerId, "2026-09-29T13:00:00Z", 600, {
      projectId: web.id,
      taskId: designId,
      billable: true,
      tagIds: [eId, fId],
    });
    // El miércoles 30/09.
    await seedClosed(ownerId, "2026-09-30T13:00:00Z", 300, {
      projectId: app.id,
      tagIds: [eId],
    });
    // El martes 29/09, de un proyecto sin cliente.
    await seedClosed(otherId, "2026-09-29T14:00:00Z", 200, {
      projectId: zeta.id,
      taskId: supportId,
    });
    // El jueves 01/10, sin proyecto.
    await seedClosed(otherId, "2026-10-01T14:00:00Z", 100, { tagIds: [fId] });
  });

  /** Las filas de una lectura, sin orden: la lectura no lo pone. */
  function unordered(rows: readonly unknown[]) {
    return rows.map((row) => JSON.stringify(row)).sort();
  }

  function personGroup(userId: string, accountName: string) {
    return { kind: "person", userId, accountName, displayName: null, status: "active" };
  }

  it("[person, tag]: las filas de una persona suman más que la persona por la entrada de dos etiquetas", async () => {
    const { scope, span } = await realLevelRead();
    const rows = await reportRepository.totalsByLevels(scope, {
      span,
      dimensions: ["person", "tag"],
      buckets: null,
    });
    const ownerGroup = personGroup(ownerId, "Owner");
    const otherGroup = personGroup(otherId, "Otra");
    const e = { kind: "tag", tag: { id: eId, name: "E" } };
    const f = { kind: "tag", tag: { id: fId, name: "F" } };
    expect(unordered(rows)).toEqual(
      unordered([
        { groups: [ownerGroup, e], seconds: 900, billableSeconds: 600 },
        { groups: [ownerGroup, f], seconds: 600, billableSeconds: 600 },
        { groups: [otherGroup, f], seconds: 100, billableSeconds: 0 },
        {
          groups: [otherGroup, { kind: "tag", tag: null }],
          seconds: 200,
          billableSeconds: 0,
        },
      ]),
    );
    // La persona suma 900; sus filas por etiqueta, 1500.
    const byPerson = await readyState(owner, { range: lastWeek, groupBy: "person" });
    expect(personRows(byPerson)).toEqual([
      ["Owner", 900],
      ["Otra", 300],
    ]);
  });

  it("[tag, project]: las filas de cada etiqueta suman lo de la etiqueta", async () => {
    const { scope, span } = await realLevelRead();
    const rows = await reportRepository.totalsByLevels(scope, {
      span,
      dimensions: ["tag", "project"],
      buckets: null,
    });
    const e = { kind: "tag", tag: { id: eId, name: "E" } };
    const f = { kind: "tag", tag: { id: fId, name: "F" } };
    expect(unordered(rows)).toEqual(
      unordered([
        { groups: [e, webGroup()], seconds: 600, billableSeconds: 600 },
        { groups: [e, appGroup()], seconds: 300, billableSeconds: 0 },
        { groups: [f, webGroup()], seconds: 600, billableSeconds: 600 },
        {
          groups: [f, { kind: "project", project: null, client: null }],
          seconds: 100,
          billableSeconds: 0,
        },
        {
          groups: [{ kind: "tag", tag: null }, zetaGroup()],
          seconds: 200,
          billableSeconds: 0,
        },
      ]),
    );
    const byTag = await readyState(owner, { range: lastWeek, groupBy: "tag" });
    expect(tagRows(byTag)).toEqual([
      ["E", 900],
      ["F", 700],
      [null, 200],
    ]);
  });

  function webGroup() {
    return {
      kind: "project",
      project: { id: web.id, name: "Web", color: "green" },
      client: { id: acme.id, name: "Acme" },
    };
  }

  function appGroup() {
    return {
      kind: "project",
      project: { id: app.id, name: "App", color: "violet" },
      client: { id: omega.id, name: "Omega" },
    };
  }

  function zetaGroup() {
    return {
      kind: "project",
      project: { id: zeta.id, name: "Zeta", color: "red" },
      client: null,
    };
  }

  it("[client, project, task]: cada fila con lo que se muestra de cada nivel en su posición, y el camino «Sin cliente» → «Sin proyecto» → «Sin tarea»", async () => {
    const { scope, span } = await realLevelRead();
    const rows = await reportRepository.totalsByLevels(scope, {
      span,
      dimensions: ["client", "project", "task"],
      buckets: null,
    });
    const web = webGroup();
    const app = appGroup();
    const zeta = zetaGroup();
    expect(unordered(rows)).toEqual(
      unordered([
        {
          groups: [
            { kind: "client", client: web.client },
            web,
            {
              kind: "task",
              task: { id: designId, name: "Diseño" },
              project: web.project,
            },
          ],
          seconds: 600,
          billableSeconds: 600,
        },
        {
          groups: [
            { kind: "client", client: app.client },
            app,
            { kind: "task", task: null, project: null },
          ],
          seconds: 300,
          billableSeconds: 0,
        },
        {
          groups: [
            { kind: "client", client: null },
            zeta,
            {
              kind: "task",
              task: { id: supportId, name: "Soporte" },
              project: zeta.project,
            },
          ],
          seconds: 200,
          billableSeconds: 0,
        },
        {
          groups: [
            { kind: "client", client: null },
            { kind: "project", project: null, client: null },
            { kind: "task", task: null, project: null },
          ],
          seconds: 100,
          billableSeconds: 0,
        },
      ]),
    );
  });

  it("[project, date]: la entrada de dos etiquetas cuenta una vez, y los días son los de buckets", async () => {
    const { scope, span, buckets } = await realLevelRead();
    const rows = await reportRepository.totalsByLevels(scope, {
      span,
      dimensions: ["project", "date"],
      buckets,
    });
    expect(
      unordered(
        rows.map((row) => {
          const [project, date] = row.groups;
          return [
            project?.kind === "project" ? (project.project?.name ?? null) : "?",
            date?.kind === "date" ? buckets.buckets[date.bucket]?.firstDay : "?",
            row.seconds,
            row.billableSeconds,
          ];
        }),
      ),
    ).toEqual(
      unordered([
        ["Web", "2026-09-29", 600, 600],
        ["Zeta", "2026-09-29", 200, 0],
        ["App", "2026-09-30", 300, 0],
        [null, "2026-10-01", 100, 0],
      ]),
    );
  });
});

describe("el período fuera del tope (B1)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("un rango invertido y uno de 367 días lanzan RangeError sin llamar al repository ni abrir la transacción", async () => {
    const byLevels = vi.spyOn(reportRepository, "totalsByLevels");
    const entryTotals = vi.spyOn(reportRepository, "entryTotals");
    const transaction = vi.spyOn(db, "transaction");
    for (const range of [
      { first: "2026-10-11", last: "2026-10-05" },
      { first: "2025-01-01", last: "2026-01-02" },
    ]) {
      for (const groupBy of REPORT_GROUP_BYS) {
        await expect(
          getReportState(owner, settings, { range, groupBy }, readNow),
        ).rejects.toThrow(RangeError);
      }
    }
    expect([
      byLevels.mock.calls.length,
      entryTotals.mock.calls.length,
      transaction.mock.calls.length,
    ]).toEqual([0, 0, 0]);
  });

  it("un día y 366 días se leen, por persona y por fecha", async () => {
    const byLevels = vi.spyOn(reportRepository, "totalsByLevels");
    // El 2026-01-01 a las 12:00 en Buenos Aires: el último de los 366 días.
    await seedClosed(ownerId, "2026-01-01T15:00:00Z", 600);
    for (const groupBy of ["person", "date"] as const) {
      await readyState(owner, {
        range: { first: "2026-10-05", last: "2026-10-05" },
        groupBy,
      });
      const longest = await readyState(owner, {
        range: { first: "2025-01-01", last: "2026-01-01" },
        groupBy,
      });
      expect([groupBy, longest.range, longest.totalSeconds]).toEqual([
        groupBy,
        { first: "2025-01-01", last: "2026-01-01" },
        600,
      ]);
    }
    const reads = byLevels.mock.calls.map(([, read]) => read);
    expect(reads.map((read) => read.dimensions)).toEqual([
      ["person"],
      ["person"],
      ["date"],
      ["date"],
    ]);
    expect(reads[3]?.buckets?.buckets).toHaveLength(366);
  });
});
