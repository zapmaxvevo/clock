import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

import { db } from "@/server/db";
import { project, tag, task, timeEntry, user } from "@/server/db/schema";
import type { Actor, MembershipStatus, Role } from "@/server/permissions";
import { monthBuckets, weekBuckets, type TimeSettings } from "@/server/time";
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
import { projectRepository } from "@/modules/project/repository";
import { workspaceRepository } from "@/modules/workspace/repository";
import { getTimesheetState } from "@/modules/time-entry/service";

import {
  NO_REPORT_FILTERS,
  REPORT_GROUP_BYS,
  REPORT_MAX_FILTER_VALUES,
  reportReadyState,
  type ReportFilters,
  type ReportGroup,
  type ReportGroupBy,
  type ReportRange,
  type ReportReadyState,
} from "./schema";
import { reportLabels } from "./components/labels";
import { NO_ENTRY_FILTER, reportRepository, type ReportLevelRead } from "./repository";
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

/** Una persona con su nombre de cuenta y, si se pasa, el editado y el id. */
async function seedPerson(values: {
  readonly accountName: string;
  readonly displayName?: string;
  readonly role?: Role;
  readonly status?: MembershipStatus;
  readonly id?: string;
}): Promise<string> {
  const userId = await seedMember(
    workspaceId,
    values.role ?? "member",
    values.status,
    values.id,
  );
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
    {
      range: request.range ?? null,
      groupBy: request.groupBy ?? null,
      subgroups: request.subgroups ?? [],
      filters: request.filters ?? NO_REPORT_FILTERS,
    },
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

/**
 * Una entrada con los instantes escritos por SQL, con microsegundos. Se siembra
 * con `seedTimeEntry`, que lleva sus referencias y etiquetas, y los instantes
 * se reescriben después: un `Date` de JS no guarda microsegundos.
 */
async function seedExact(
  userId: string,
  startedAt: string,
  endedAt: string,
  billable: boolean,
  extra: {
    readonly projectId?: string;
    readonly taskId?: string;
    readonly tagIds?: readonly string[];
  } = {},
) {
  const row = await seedTimeEntry({
    workspaceId,
    userId,
    startedAt: new Date(0),
    endedAt: new Date(1000),
    billable,
    ...extra,
  });
  await db
    .update(timeEntry)
    .set({
      startedAt: sql`${startedAt}::timestamptz`,
      endedAt: sql`${endedAt}::timestamptz`,
    })
    .where(eq(timeEntry.id, row.id));
}

describe("la medida (ADR 0021, D-R2a-6)", () => {
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
    // Va después de «Sin tarea» por nombre: el empate con «Sin tarea» no se
    // cumple por orden alfabético.
    t2Id = (
      await seedTask({ workspaceId, projectId: p.id, name: "Validación", status: "done" })
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
        task: { id: t2Id, name: "Validación" },
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

    const inT = { projectId: project.id, taskId: t.id };

    // Las dos de microsegundos: E1 en una, la otra sin etiquetas.
    await seedExact(
      memberId,
      `${day} 10:00:00.000900-03`,
      `${day} 10:00:01.000500-03`,
      true,
      { ...inT, tagIds: [e1.id] },
    );
    await seedExact(
      memberId,
      `${day} 11:00:00.000500-03`,
      `${day} 11:00:01.000400-03`,
      false,
      inT,
    );
    // Las dos de 1,5 s: E1 en las dos, E2 en una.
    await seedExact(memberId, `${day} 12:00:00-03`, `${day} 12:00:01.5-03`, true, {
      ...inT,
      tagIds: [e1.id],
    });
    await seedExact(memberId, `${day} 13:00:00.75-03`, `${day} 13:00:02.25-03`, false, {
      ...inT,
      tagIds: [e1.id, e2.id],
    });

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
  if (read.buckets.date === undefined) {
    throw new Error("Se esperaba la lectura por fecha, con sus tramos.");
  }
  return { scope, span: read.span, buckets: read.buckets.date };
}

describe("las guardas de totalsByLevels (§4.3 de R3; criterios 7 y 20)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("cada lectura mal formada lanza RangeError sin consultar, con db y con el Executor de una transacción", async () => {
    const { scope, span, buckets } = await realLevelRead();
    const [first] = buckets.buckets;
    const shifted = (instant: Date) => new Date(instant.getTime() + 1000);
    const filter = NO_ENTRY_FILTER;
    const invalid = [
      { span, filter, dimensions: [], buckets: {} },
      {
        span,
        filter,
        dimensions: ["person", "project", "client", "task"],
        buckets: {},
      },
      { span, filter, dimensions: ["person", "person"], buckets: {} },
      { span, filter, dimensions: ["project", "date"], buckets: {} },
      { span, filter, dimensions: ["project"], buckets: { date: buckets } },
      {
        span,
        filter,
        dimensions: ["date"],
        buckets: { date: { buckets: [], end: buckets.end } },
      },
      {
        span,
        filter,
        dimensions: ["date"],
        buckets: {
          date: {
            buckets: [
              { ...first, start: shifted(first.start) },
              ...buckets.buckets.slice(1),
            ],
            end: buckets.end,
          },
        },
      },
      {
        span,
        filter,
        dimensions: ["date"],
        buckets: { date: { ...buckets, end: shifted(buckets.end) } },
      },
      // Criterio 20 de R3: el tope de filas es un entero positivo.
      { span, filter, dimensions: ["project"], buckets: {}, limit: 0 },
      { span, filter, dimensions: ["project"], buckets: {}, limit: -1 },
      { span, filter, dimensions: ["project"], buckets: {}, limit: 1.5 },
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

  /** Las filas de una lectura, en cualquier orden: la lectura no lo pone. */
  function expectRows(rows: readonly unknown[], expected: readonly unknown[]) {
    // Con el mismo largo y filas esperadas distintas entre sí, contenerlas
    // todas es ser una permutación de ellas.
    expect(rows).toHaveLength(expected.length);
    expect(rows).toEqual(expect.arrayContaining([...expected]));
  }

  function personGroup(userId: string, accountName: string) {
    return { kind: "person", userId, accountName, displayName: null, status: "active" };
  }

  it("[person, tag]: las filas de una persona suman más que la persona por la entrada de dos etiquetas", async () => {
    const { scope, span } = await realLevelRead();
    const rows = await reportRepository.totalsByLevels(scope, {
      span,
      filter: NO_ENTRY_FILTER,
      dimensions: ["person", "tag"],
      buckets: {},
    });
    const ownerGroup = personGroup(ownerId, "Owner");
    const otherGroup = personGroup(otherId, "Otra");
    const e = { kind: "tag", tag: { id: eId, name: "E" } };
    const f = { kind: "tag", tag: { id: fId, name: "F" } };
    expectRows(rows, [
      { groups: [ownerGroup, e], seconds: 900, billableSeconds: 600 },
      { groups: [ownerGroup, f], seconds: 600, billableSeconds: 600 },
      { groups: [otherGroup, f], seconds: 100, billableSeconds: 0 },
      {
        groups: [otherGroup, { kind: "tag", tag: null }],
        seconds: 200,
        billableSeconds: 0,
      },
    ]);
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
      filter: NO_ENTRY_FILTER,
      dimensions: ["tag", "project"],
      buckets: {},
    });
    const e = { kind: "tag", tag: { id: eId, name: "E" } };
    const f = { kind: "tag", tag: { id: fId, name: "F" } };
    expectRows(rows, [
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
    ]);
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
      filter: NO_ENTRY_FILTER,
      dimensions: ["client", "project", "task"],
      buckets: {},
    });
    const web = webGroup();
    const app = appGroup();
    const zeta = zetaGroup();
    expectRows(rows, [
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
    ]);
  });

  it("[project, date]: la entrada de dos etiquetas cuenta una vez, y los días son los de buckets", async () => {
    const { scope, span, buckets } = await realLevelRead();
    const rows = await reportRepository.totalsByLevels(scope, {
      span,
      filter: NO_ENTRY_FILTER,
      dimensions: ["project", "date"],
      buckets: { date: buckets },
    });
    expectRows(
      rows.map((row) => {
        const [project, date] = row.groups;
        return [
          project?.kind === "project" ? (project.project?.name ?? null) : "?",
          date?.kind === "date" ? buckets.buckets[date.bucket]?.firstDay : "?",
          row.seconds,
          row.billableSeconds,
        ];
      }),
      [
        ["Web", "2026-09-29", 600, 600],
        ["Zeta", "2026-09-29", 200, 0],
        ["App", "2026-09-30", 300, 0],
        [null, "2026-10-01", 100, 0],
      ],
    );
  });
});

/** Un árbol como `[rótulo, segundos]` en cada hoja y `[rótulo, segundos, hijos]` arriba, en orden. */
type Outline = readonly [string, number] | readonly [string, number, readonly Outline[]];

function outline(groups: readonly ReportGroup[]): Outline[] {
  return groups.map((group): Outline => {
    const label = labelOf(group);
    return group.children === undefined
      ? [label, group.seconds]
      : [label, group.seconds, outline(group.children)];
  });
}

/** El nombre de un grupo, «Sin …» por su rótulo, el día, o el rótulo de una semana o un mes con su «solo …». */
function labelOf(group: ReportGroup): string {
  switch (group.kind) {
    case "person":
      return group.name;
    case "project":
      return group.project?.name ?? projectLabels.noProject;
    case "client":
      return group.client?.name ?? projectLabels.noClient;
    case "task":
      return group.task?.name ?? reportLabels.noTask;
    case "tag":
      return group.tag?.name ?? reportLabels.noTag;
    case "date":
      return group.dayKey;
    case "week":
    case "month":
      return group.partial === null
        ? group.label
        : `${group.label} solo ${group.partial}`;
  }
}

describe("el árbol (D-R3-6, D-R3-7, RP-12, RP-13; criterio 17 de R3)", () => {
  let otherId: string;

  /**
   * Owner: Web el martes 29/09 con E y F (600, con la tarea Diseño), sin
   * proyecto el miércoles 30/09 (600) y App el martes (300). Otra: Web el
   * miércoles (200) y App el jueves 01/10 (900). Web es de Acme; App, sin
   * cliente.
   */
  beforeEach(async () => {
    otherId = await seedPerson({ accountName: "Otra" });
    const acme = await seedClient({ workspaceId, name: "Acme" });
    const web = await seedProject({ workspaceId, name: "Web", clientId: acme.id });
    const app = await seedProject({ workspaceId, name: "App" });
    const design = await seedTask({ workspaceId, projectId: web.id, name: "Diseño" });
    const e = await seedTag({ workspaceId, name: "E" });
    const f = await seedTag({ workspaceId, name: "F" });
    await seedClosed(ownerId, "2026-09-29T13:00:00Z", 600, {
      projectId: web.id,
      taskId: design.id,
      billable: true,
      tagIds: [e.id, f.id],
    });
    await seedClosed(ownerId, "2026-09-30T13:00:00Z", 600);
    await seedClosed(ownerId, "2026-09-29T14:00:00Z", 300, { projectId: app.id });
    await seedClosed(otherId, "2026-09-30T14:00:00Z", 200, { projectId: web.id });
    await seedClosed(otherId, "2026-10-01T14:00:00Z", 900, { projectId: app.id });
  });

  async function treeOf(groupBy: ReportGroup["kind"], subgroups: ReportGroup["kind"][]) {
    const state = await readyState(owner, { range: lastWeek, groupBy, subgroups });
    expect(reportReadyState.parse(state)).toEqual(state);
    return state;
  }

  it("persona → proyecto: cada persona con sus proyectos, que suman lo de la persona, por duración y «Sin proyecto» después de uno de igual duración", async () => {
    const state = await treeOf("person", ["project"]);
    expect(outline(state.groups)).toEqual([
      [
        "Owner",
        1500,
        [
          ["Web", 600],
          [projectLabels.noProject, 600],
          ["App", 300],
        ],
      ],
      [
        "Otra",
        1100,
        [
          ["App", 900],
          ["Web", 200],
        ],
      ],
    ]);
    expect([state.subgroups, state.levelsShown]).toEqual([["project"], 2]);
    expect([state.totalSeconds, state.billableSeconds]).toEqual([2600, 600]);
  });

  it("persona → proyecto → fecha: debajo del proyecto de cada persona, solo sus días", async () => {
    const state = await treeOf("person", ["project", "date"]);
    expect(outline(state.groups)).toEqual([
      [
        "Owner",
        1500,
        [
          ["Web", 600, [["2026-09-29", 600]]],
          [projectLabels.noProject, 600, [["2026-09-30", 600]]],
          ["App", 300, [["2026-09-29", 300]]],
        ],
      ],
      [
        "Otra",
        1100,
        [
          ["App", 900, [["2026-10-01", 900]]],
          ["Web", 200, [["2026-09-30", 200]]],
        ],
      ],
    ]);
    expect([state.subgroups, state.levelsShown, state.totalSeconds]).toEqual([
      ["project", "date"],
      3,
      2600,
    ]);
  });

  it("proyecto → fecha: los días de cada proyecto en orden cronológico, no por duración", async () => {
    const state = await treeOf("project", ["date"]);
    expect(outline(state.groups)).toEqual([
      [
        "App",
        1200,
        [
          ["2026-09-29", 300],
          ["2026-10-01", 900],
        ],
      ],
      [
        "Web",
        800,
        [
          ["2026-09-29", 600],
          ["2026-09-30", 200],
        ],
      ],
      [projectLabels.noProject, 600, [["2026-09-30", 600]]],
    ]);
  });

  it("cliente → proyecto → tarea: tres niveles, con el camino «Sin cliente» → «Sin proyecto» → «Sin tarea»", async () => {
    const state = await treeOf("client", ["project", "task"]);
    expect(outline(state.groups)).toEqual([
      [
        projectLabels.noClient,
        1800,
        [
          ["App", 1200, [[reportLabels.noTask, 1200]]],
          [projectLabels.noProject, 600, [[reportLabels.noTask, 600]]],
        ],
      ],
      [
        "Acme",
        800,
        [
          [
            "Web",
            800,
            [
              ["Diseño", 600],
              [reportLabels.noTask, 200],
            ],
          ],
        ],
      ],
    ]);
    expect([state.levelsShown, state.totalSeconds]).toEqual([3, 2600]);
  });

  it("persona → etiqueta: con la entrada de dos etiquetas los hijos suman más que la persona; sin ella, lo mismo", async () => {
    const state = await treeOf("person", ["tag"]);
    expect(outline(state.groups)).toEqual([
      [
        "Owner",
        1500,
        [
          [reportLabels.noTag, 900],
          ["E", 600],
          ["F", 600],
        ],
      ],
      ["Otra", 1100, [[reportLabels.noTag, 1100]]],
    ]);
    expect([state.totalSeconds, state.billableSeconds]).toEqual([2600, 600]);
  });

  it("etiqueta → proyecto: los hijos de cada etiqueta suman lo de la etiqueta, y el total es el real", async () => {
    const state = await treeOf("tag", ["project"]);
    expect(outline(state.groups)).toEqual([
      [
        reportLabels.noTag,
        2000,
        [
          ["App", 1200],
          [projectLabels.noProject, 600],
          ["Web", 200],
        ],
      ],
      ["E", 600, [["Web", 600]]],
      ["F", 600, [["Web", 600]]],
    ]);
    expect([state.totalSeconds, state.billableSeconds]).toEqual([2600, 600]);
  });

  it("un pedido sin subniveles no tiene children en ningún grupo y tiene levelsShown 1", async () => {
    for (const subgroups of [undefined, []]) {
      const state = await readyState(owner, {
        range: lastWeek,
        groupBy: "person",
        subgroups,
      });
      expect(outline(state.groups)).toEqual([
        ["Owner", 1500],
        ["Otra", 1100],
      ]);
      expect([state.subgroups, state.levelsShown]).toEqual([[], 1]);
    }
  });

  it("un período sin horas con tres niveles: sin grupos, levelsShown 3 y una sola lectura", async () => {
    const byLevels = vi.spyOn(reportRepository, "totalsByLevels");
    try {
      const state = await readyState(owner, {
        range: thisWeek,
        groupBy: "person",
        subgroups: ["project", "date"],
      });
      expect([state.groups, state.levelsShown, state.totalSeconds]).toEqual([[], 3, 0]);
      expect(byLevels).toHaveBeenCalledTimes(1);
    } finally {
      byLevels.mockRestore();
    }
  });
});

describe("el tope de filas (D-R3-6; criterio 18 de R3)", () => {
  /** Los 365 días de 2025: las entradas ocupan los primeros 300. */
  const year: ReportRange = { first: "2025-01-01", last: "2025-12-31" };

  let tenthId: string;

  /**
   * Una persona, una entrada por día en 300 días, cada una con las mismas
   * nueve etiquetas: por fecha → etiqueta son 300 + 2700 = 3000 filas.
   */
  beforeEach(async () => {
    const tagIds: string[] = [];
    for (let index = 1; index <= 9; index++) {
      tagIds.push((await seedTag({ workspaceId, name: `Tope ${index}` })).id);
    }
    tenthId = (await seedTag({ workspaceId, name: "Tope 10" })).id;
    // El mediodía de cada día en Buenos Aires.
    await db.execute(sql`
      insert into time_entry (workspace_id, user_id, started_at, ended_at, billable)
      select ${workspaceId}, ${ownerId},
             timestamptz '2025-01-01 15:00:00+00' + day * interval '1 day',
             timestamptz '2025-01-01 16:00:00+00' + day * interval '1 day',
             false
        from generate_series(0, 299) as day`);
    await db.execute(sql`
      insert into time_entry_tag (workspace_id, time_entry_id, tag_id)
      select time_entry.workspace_id, time_entry.id, tag.id
        from time_entry
        join tag on tag.workspace_id = time_entry.workspace_id
       where time_entry.workspace_id = ${workspaceId}
         and tag.id <> ${tenthId}`);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** La décima etiqueta en una de las entradas: el nivel 2 pasa a 2701 filas. */
  async function addTenthTag() {
    await db.execute(sql`
      insert into time_entry_tag (workspace_id, time_entry_id, tag_id)
      select workspace_id, id, ${tenthId}
        from time_entry
       where workspace_id = ${workspaceId}
       order by started_at
       limit 1`);
  }

  it("fecha → etiqueta con 3000 filas entra entero, cada día con sus nueve", async () => {
    const byLevels = vi.spyOn(reportRepository, "totalsByLevels");
    const state = await readyState(owner, {
      range: year,
      groupBy: "date",
      subgroups: ["tag"],
    });
    expect(reportReadyState.parse(state)).toEqual(state);
    expect([state.levelsShown, state.groups.length]).toEqual([2, 300]);
    expect(state.groups.every((day) => day.children?.length === 9)).toBe(true);
    expect(byLevels.mock.calls.map(([, read]) => read.limit)).toEqual([undefined, 2701]);
  });

  it("con 3001 filas el nivel 2 no entra: levelsShown 1, ningún children y los subniveles pedidos", async () => {
    await addTenthTag();
    const byLevels = vi.spyOn(reportRepository, "totalsByLevels");
    const state = await readyState(owner, {
      range: year,
      groupBy: "date",
      subgroups: ["tag"],
    });
    expect([state.levelsShown, state.subgroups, state.groups.length]).toEqual([
      1,
      ["tag"],
      300,
    ]);
    expect(state.groups.some((day) => day.children !== undefined)).toBe(false);
    expect(byLevels.mock.calls.map(([, read]) => read.limit)).toEqual([undefined, 2701]);
    expect(state.totalSeconds).toBe(300 * 3600);
  });

  it("fecha → etiqueta → persona con 3000 filas: el nivel 3 no se pide", async () => {
    const byLevels = vi.spyOn(reportRepository, "totalsByLevels");
    const state = await readyState(owner, {
      range: year,
      groupBy: "date",
      subgroups: ["tag", "person"],
    });
    expect(state.levelsShown).toBe(2);
    expect(byLevels).toHaveBeenCalledTimes(2);
    // Los 300 días con sus nueve etiquetas, y ninguna etiqueta con hijos.
    expect(state.groups).toHaveLength(300);
    for (const day of state.groups) {
      expect(day.children).toHaveLength(9);
      expect(day.children?.some((tag) => tag.children !== undefined)).toBe(false);
    }
  });

  it("fecha → etiqueta → persona con 3001 filas: levelsShown 1 y dos lecturas, sin la del nivel 3", async () => {
    await addTenthTag();
    const byLevels = vi.spyOn(reportRepository, "totalsByLevels");
    const state = await readyState(owner, {
      range: year,
      groupBy: "date",
      subgroups: ["tag", "person"],
    });
    expect([state.levelsShown, state.subgroups]).toEqual([1, ["tag", "person"]]);
    expect(byLevels.mock.calls.map(([, read]) => read.dimensions)).toEqual([
      ["date"],
      ["date", "tag"],
    ]);
  });

  it("con filtro, el tope cuenta lo filtrado: la décima etiqueta en una entrada de otro proyecto no corta (criterio 6 de R4)", async () => {
    const kept = await seedProject({ workspaceId, name: "Las 300" });
    const other = await seedProject({ workspaceId, name: "Otro" });
    await db
      .update(timeEntry)
      .set({ projectId: kept.id })
      .where(eq(timeEntry.workspaceId, workspaceId));
    // El primer día, de otro proyecto: sin filtro, el nivel 2 pasa a 2701 filas.
    await seedClosed(ownerId, "2025-01-01T17:00:00Z", 1800, {
      projectId: other.id,
      tagIds: [tenthId],
    });
    const request = { range: year, groupBy: "date", subgroups: ["tag"] } as const;
    expect((await readyState(owner, request)).levelsShown).toBe(1);

    const state = await readyState(owner, {
      ...request,
      filters: { ...NO_REPORT_FILTERS, projects: [kept.id] },
    });
    expect([state.levelsShown, state.groups.length]).toEqual([2, 300]);
    expect(state.groups.every((day) => day.children?.length === 9)).toBe(true);
    expect(state.totalSeconds).toBe(300 * 3600);
  });
});

describe("una sola foto con subniveles (ADR 0021; criterio 19 de R3)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("los tres niveles y el total por etiqueta, en el Executor de una transacción de solo lectura repeatable read", async () => {
    const e = await seedTag({ workspaceId, name: "E" });
    await seedClosed(ownerId, "2026-09-29T13:00:00Z", 600, { tagIds: [e.id] });
    const transaction = vi.spyOn(db, "transaction");
    const byLevels = vi.spyOn(reportRepository, "totalsByLevels");
    const entryTotals = vi.spyOn(reportRepository, "entryTotals");
    const state = await readyState(owner, {
      range: lastWeek,
      groupBy: "tag",
      subgroups: ["project", "date"],
    });
    expect(state.levelsShown).toBe(3);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0]?.[1]).toEqual({
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
    const executors = [
      ...byLevels.mock.calls.map((call) => call[2]),
      ...entryTotals.mock.calls.map((call) => call[2]),
    ];
    expect(executors).toHaveLength(4);
    expect(executors[0]).toBeDefined();
    expect(executors[0]).not.toBe(db);
    expect(executors.every((executor) => executor === executors[0])).toBe(true);
  });
});

describe("las invariantes de los subniveles (criterio 20 de R3)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("con subniveles, un período fuera del tope o niveles mal formados lanzan RangeError sin leer ni abrir la transacción", async () => {
    const byLevels = vi.spyOn(reportRepository, "totalsByLevels");
    const entryTotals = vi.spyOn(reportRepository, "entryTotals");
    const transaction = vi.spyOn(db, "transaction");
    const requests: ReportRequest[] = [
      {
        range: { first: "2026-10-11", last: "2026-10-05" },
        groupBy: "tag",
        subgroups: ["date"],
        filters: NO_REPORT_FILTERS,
      },
      {
        range: { first: "2025-01-01", last: "2026-01-02" },
        groupBy: "tag",
        subgroups: ["date"],
        filters: NO_REPORT_FILTERS,
      },
      {
        range: lastWeek,
        groupBy: "person",
        subgroups: ["project", "date", "tag"],
        filters: NO_REPORT_FILTERS,
      },
      {
        range: lastWeek,
        groupBy: "person",
        subgroups: ["date", "date"],
        filters: NO_REPORT_FILTERS,
      },
      {
        range: lastWeek,
        groupBy: "project",
        subgroups: ["project"],
        filters: NO_REPORT_FILTERS,
      },
      {
        range: lastWeek,
        groupBy: null,
        subgroups: ["person"],
        filters: NO_REPORT_FILTERS,
      },
    ];
    for (const request of requests) {
      await expect(getReportState(owner, settings, request, readNow)).rejects.toThrow(
        RangeError,
      );
    }
    expect([
      byLevels.mock.calls.length,
      entryTotals.mock.calls.length,
      transaction.mock.calls.length,
    ]).toEqual([0, 0, 0]);
  });
});

describe("el armado del árbol con una foto inconsistente (§4.4 de R3)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const projectId = "7a8b9c0d-1e2f-4a3b-9c4d-5e6f7a8b9c0d";
  const otherProjectId = "2f3e4d5c-6b7a-4980-a1b2-c3d4e5f60718";
  const p = {
    kind: "project",
    project: { id: projectId, name: "P", color: "green" },
    client: null,
  } as const;
  const noProject = { kind: "project", project: null, client: null } as const;
  const firstLevel = [
    { groups: [p], seconds: 60, billableSeconds: 0 },
    { groups: [noProject], seconds: 30, billableSeconds: 0 },
  ];

  /** Proyecto → fecha con las dos lecturas armadas a mano. */
  async function treeWith(
    secondLevel: Awaited<ReturnType<typeof reportRepository.totalsByLevels>>,
  ) {
    vi.spyOn(reportRepository, "totalsByLevels")
      .mockResolvedValueOnce(firstLevel)
      .mockResolvedValueOnce(secondLevel);
    return getReportState(
      owner,
      settings,
      {
        range: lastWeek,
        groupBy: "project",
        subgroups: ["date"],
        filters: NO_REPORT_FILTERS,
      },
      readNow,
    );
  }

  it("una fila sin su grupo de arriba lanza", async () => {
    await expect(
      treeWith([
        { groups: [p, { kind: "date", bucket: 0 }], seconds: 60, billableSeconds: 0 },
        {
          groups: [noProject, { kind: "date", bucket: 1 }],
          seconds: 30,
          billableSeconds: 0,
        },
        {
          groups: [
            { ...p, project: { ...p.project, id: otherProjectId } },
            { kind: "date", bucket: 2 },
          ],
          seconds: 10,
          billableSeconds: 0,
        },
      ]),
    ).rejects.toThrow("sin su grupo de arriba");
  });

  it("un grupo sin hijos en un nivel que se muestra lanza", async () => {
    await expect(
      treeWith([
        { groups: [p, { kind: "date", bucket: 0 }], seconds: 60, billableSeconds: 0 },
      ]),
    ).rejects.toThrow("sin hijos");
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
          getReportState(
            owner,
            settings,
            { range, groupBy, subgroups: [], filters: NO_REPORT_FILTERS },
            readNow,
          ),
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
    expect(reads[3]?.buckets.date?.buckets).toHaveLength(366);
  });
});

/**
 * El workspace de los filtros de R4: C1 con P1 y P4 (archivado), C2 con P2,
 * C3 archivado con P5, y P3 sin cliente y archivado. Entradas de dos personas
 * en la semana anterior, en todos los proyectos y sin proyecto; E y F en la
 * de P1 del owner, E en la sin proyecto de Otra.
 */
describe("los filtros de cliente y de proyecto (R4: RP-25, RP-26, RP-29, RP-34)", () => {
  let otherId: string;
  let c1: string;
  let c2: string;
  let c3: string;
  let p1: string;
  let p2: string;
  let p3: string;
  let p4: string;
  let p5: string;
  let e: string;
  let f: string;

  beforeEach(async () => {
    otherId = await seedPerson({ accountName: "Otra" });
    c1 = (await seedClient({ workspaceId, name: "Acme" })).id;
    c2 = (await seedClient({ workspaceId, name: "Bravo" })).id;
    c3 = (await seedClient({ workspaceId, name: "Cerrado", archived: true })).id;
    p1 = (await seedProject({ workspaceId, clientId: c1, name: "Alfa", color: "green" }))
      .id;
    p2 = (await seedProject({ workspaceId, clientId: c2, name: "Beta", color: "red" }))
      .id;
    p3 = (
      await seedProject({ workspaceId, name: "Gamma", color: "teal", archived: true })
    ).id;
    p4 = (
      await seedProject({
        workspaceId,
        clientId: c1,
        name: "Delta",
        color: "pink",
        archived: true,
      })
    ).id;
    p5 = (
      await seedProject({ workspaceId, clientId: c3, name: "Épsilon", color: "lime" })
    ).id;
    e = (await seedTag({ workspaceId, name: "E" })).id;
    f = (await seedTag({ workspaceId, name: "F" })).id;

    await seedClosed(ownerId, "2026-09-29T13:00:00Z", 600, {
      projectId: p1,
      billable: true,
      tagIds: [e, f],
    });
    await seedClosed(ownerId, "2026-09-29T14:00:00Z", 300, { projectId: p2 });
    await seedClosed(ownerId, "2026-09-29T15:00:00Z", 120, { projectId: p3 });
    await seedClosed(ownerId, "2026-09-29T16:00:00Z", 60);
    await seedClosed(ownerId, "2026-09-29T17:00:00Z", 40, { projectId: p4 });
    await seedClosed(otherId, "2026-09-30T13:00:00Z", 1000, {
      projectId: p1,
      billable: true,
    });
    await seedClosed(otherId, "2026-09-30T14:00:00Z", 200, { tagIds: [e] });
    await seedClosed(otherId, "2026-09-30T15:00:00Z", 7, { projectId: p5 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function filtered(
    groupBy: ReportGroupBy,
    filters: Partial<ReportFilters>,
    subgroups: readonly ReportGroupBy[] = [],
    actor: Actor = owner,
  ) {
    return readyState(actor, {
      range: lastWeek,
      groupBy,
      subgroups,
      filters: { ...NO_REPORT_FILTERS, ...filters },
    });
  }

  /** Lo que se lee de un grupo: su nombre, o «sin» para los «Sin …». */
  function keyOf(group: ReportGroup): string {
    switch (group.kind) {
      case "person":
        return group.name;
      case "project":
        return group.project?.name ?? "sin";
      case "client":
        return group.client?.name ?? "sin";
      case "task":
        return group.task?.name ?? "sin";
      case "tag":
        return group.tag?.name ?? "sin";
      case "date":
        return group.dayKey;
      case "week":
        return group.weekStart;
      case "month":
        return group.monthStart;
    }
  }

  /** Las filas del primer nivel como `[clave, segundos]`, en orden. */
  function rowsOf(state: ReportReadyState) {
    return state.groups.map((group) => [keyOf(group), group.seconds]);
  }

  /** Cada grupo del árbol como «camino: segundos», recorrido en orden. */
  function pathsOf(groups: readonly ReportGroup[], above = ""): string[] {
    return groups.flatMap((group) => {
      const path = above === "" ? keyOf(group) : `${above} / ${keyOf(group)}`;
      return [`${path}: ${group.seconds}`, ...pathsOf(group.children ?? [], path)];
    });
  }

  function totalsOf(state: ReportReadyState) {
    return [state.totalSeconds, state.billableSeconds];
  }

  describe("el filtro de proyecto (criterio 4)", () => {
    it("[P1]: por persona, cada una con lo suyo en P1; por proyecto, una fila; el total y el facturable de lo filtrado", async () => {
      const byPerson = await filtered("person", { projects: [p1] });
      expect(rowsOf(byPerson)).toEqual([
        ["Otra", 1000],
        ["Owner", 600],
      ]);
      expect(totalsOf(byPerson)).toEqual([1600, 1600]);
      const byProject = await filtered("project", { projects: [p1] });
      expect(rowsOf(byProject)).toEqual([["Alfa", 1600]]);
      expect(totalsOf(byProject)).toEqual([1600, 1600]);
    });

    it("«Sin proyecto»: por proyecto, solo esa fila; por cliente, solo «Sin cliente» con esas entradas", async () => {
      const byProject = await filtered("project", { withoutProject: true });
      expect(rowsOf(byProject)).toEqual([["sin", 260]]);
      const byClient = await filtered("client", { withoutProject: true });
      expect(rowsOf(byClient)).toEqual([["sin", 260]]);
      expect(totalsOf(byClient)).toEqual([260, 0]);
    });

    it("[P1] con «Sin proyecto»: las dos, sumadas en el total", async () => {
      const state = await filtered("project", { projects: [p1], withoutProject: true });
      expect(rowsOf(state)).toEqual([
        ["Alfa", 1600],
        ["sin", 260],
      ]);
      expect(totalsOf(state)).toEqual([1860, 1600]);
      expect(state.filters).toEqual({
        people: [],
        clients: [],
        projects: [p1],
        withoutProject: true,
      });
    });

    it("[P3], archivado y sin cliente, cuenta (RP-29)", async () => {
      const state = await filtered("project", { projects: [p3] });
      expect(rowsOf(state)).toEqual([["Gamma", 120]]);
      expect(state.filters.projects).toEqual([p3]);
    });

    it("por etiqueta con [P1], entryTotals da el total filtrado, menos que la suma de las etiquetas", async () => {
      const entryTotals = vi.spyOn(reportRepository, "entryTotals");
      const state = await filtered("tag", { projects: [p1] });
      expect(rowsOf(state)).toEqual([
        ["sin", 1000],
        ["E", 600],
        ["F", 600],
      ]);
      expect(totalsOf(state)).toEqual([1600, 1600]);
      expect(entryTotals.mock.calls.map(([, read]) => read.filter)).toEqual([
        { projectIds: [p1], withoutProject: false, clientIds: [] },
      ]);
    });
  });

  describe("el filtro de cliente (criterio 5)", () => {
    it("[C1]: P1 y el archivado de C1; ni lo sin proyecto ni P3", async () => {
      const state = await filtered("project", { clients: [c1] });
      expect(rowsOf(state)).toEqual([
        ["Alfa", 1600],
        ["Delta", 40],
      ]);
      expect(totalsOf(state)).toEqual([1640, 1600]);
    });

    it("un cliente archivado se filtra (RP-29)", async () => {
      const state = await filtered("project", { clients: [c3] });
      expect(rowsOf(state)).toEqual([["Épsilon", 7]]);
      expect(state.filters.clients).toEqual([c3]);
    });

    it("agrupando por cliente con [C1], una fila; y con tres niveles, solo lo de C1", async () => {
      const byClient = await filtered("client", { clients: [c1] });
      expect(rowsOf(byClient)).toEqual([["Acme", 1640]]);
      const tree = await filtered("client", { clients: [c1] }, ["project", "person"]);
      expect(tree.levelsShown).toBe(3);
      expect(pathsOf(tree.groups)).toEqual([
        "Acme: 1640",
        "Acme / Alfa: 1600",
        "Acme / Alfa / Otra: 1000",
        "Acme / Alfa / Owner: 600",
        "Acme / Delta: 40",
        "Acme / Delta / Owner: 40",
      ]);
    });

    it("[C1] con [P2] se cruzan con «y»: sin grupos, con los dos filtros y los totales en cero", async () => {
      const state = await filtered("project", { clients: [c1], projects: [p2] });
      expect(state.groups).toEqual([]);
      expect(state.filters).toEqual({
        people: [],
        clients: [c1],
        projects: [p2],
        withoutProject: false,
      });
      expect(totalsOf(state)).toEqual([0, 0]);
    });

    it("[C1] con «Sin proyecto» no deja nada: lo sin proyecto no tiene cliente", async () => {
      const state = await filtered("project", { clients: [c1], withoutProject: true });
      expect(state.groups).toEqual([]);
    });
  });

  describe("en todos los niveles (criterio 6)", () => {
    it("persona → proyecto con [P1, P2]: los hijos son solo esos y suman lo de su padre", async () => {
      const state = await filtered("person", { projects: [p1, p2] }, ["project"]);
      expect(pathsOf(state.groups)).toEqual([
        "Otra: 1000",
        "Otra / Alfa: 1000",
        "Owner: 900",
        "Owner / Alfa: 600",
        "Owner / Beta: 300",
      ]);
      expect(totalsOf(state)).toEqual([1900, 1600]);
    });

    it("etiqueta → proyecto con [P1]: los hijos de cada etiqueta son de P1 y el total es el filtrado", async () => {
      const state = await filtered("tag", { projects: [p1] }, ["project"]);
      expect(pathsOf(state.groups)).toEqual([
        "sin: 1000",
        "sin / Alfa: 1000",
        "E: 600",
        "E / Alfa: 600",
        "F: 600",
        "F / Alfa: 600",
      ]);
      expect(totalsOf(state)).toEqual([1600, 1600]);
    });

    it("cada lectura del árbol lleva el mismo filtro", async () => {
      const byLevels = vi.spyOn(reportRepository, "totalsByLevels");
      await filtered("person", { projects: [p1], clients: [c1] }, ["project", "date"]);
      expect(byLevels.mock.calls.map(([, read]) => read.filter)).toEqual(
        Array.from({ length: 3 }, () => ({
          projectIds: [p1],
          withoutProject: false,
          clientIds: [c1],
        })),
      );
    });
  });

  describe("lo que no existe se ignora (criterio 7, RP-34)", () => {
    it("un uuid que no existe, un proyecto y un cliente de otro workspace y uno borrado se ignoran; si son todos, el reporte es el de sin filtros", async () => {
      const other = await seedWorkspace();
      const foreignClient = await seedClient({ workspaceId: other.workspaceId });
      const foreignProject = await seedProject({
        workspaceId: other.workspaceId,
        clientId: foreignClient.id,
      });
      const deleted = await seedProject({ workspaceId, clientId: c1 });
      await db.delete(project).where(eq(project.id, deleted.id));
      const ignoredProjects = [randomUUID(), foreignProject.id, deleted.id];
      const ignoredClients = [randomUUID(), foreignClient.id];

      const unfiltered = await filtered("project", {});
      expect(unfiltered.groups.length).toBeGreaterThan(0);
      for (const filters of [
        { projects: ignoredProjects },
        { clients: ignoredClients },
        { projects: ignoredProjects, clients: ignoredClients },
      ]) {
        const state = await filtered("project", filters);
        expect(state.filters).toEqual(NO_REPORT_FILTERS);
        expect([rowsOf(state), totalsOf(state)]).toEqual([
          rowsOf(unfiltered),
          totalsOf(unfiltered),
        ]);
      }
    });

    it("junto a uno que existe, se aplica el que existe y filters solo lo lleva a él", async () => {
      const other = await seedWorkspace();
      const foreignClient = await seedClient({ workspaceId: other.workspaceId });
      const foreignProject = await seedProject({ workspaceId: other.workspaceId });
      const state = await filtered("project", {
        projects: [randomUUID(), p2, foreignProject.id],
        clients: [foreignClient.id, c2],
      });
      expect(rowsOf(state)).toEqual([["Beta", 300]]);
      expect(state.filters).toEqual({
        people: [],
        clients: [c2],
        projects: [p2],
        withoutProject: false,
      });
    });

    it("un privado que el member no ve se ignora para él: ve todo lo suyo, también lo de ese privado", async () => {
      const vault = await seedProject({ workspaceId, name: "Bóveda", isPublic: false });
      await seedClosed(otherId, "2026-10-01T13:00:00Z", 90, { projectId: vault.id });
      const member = actorIn(workspaceId, otherId, { role: "member" });
      const state = await filtered("project", { projects: [vault.id] }, [], member);
      expect(state.filters).toEqual(NO_REPORT_FILTERS);
      expect(rowsOf(state)).toEqual([
        ["Alfa", 1000],
        ["sin", 200],
        ["Bóveda", 90],
        ["Épsilon", 7],
      ]);
      // El admin sí lo tiene en el catálogo, y se le aplica.
      const admin = actorIn(
        workspaceId,
        await seedPerson({ accountName: "Admin", role: "admin" }),
        {
          role: "admin",
        },
      );
      const byAdmin = await filtered("project", { projects: [vault.id] }, [], admin);
      expect(rowsOf(byAdmin)).toEqual([["Bóveda", 90]]);
      expect(byAdmin.filters.projects).toEqual([vault.id]);
    });

    it("solo «Sin proyecto» con proyectos ignorados sigue filtrando por «Sin proyecto»", async () => {
      const state = await filtered("project", {
        projects: [randomUUID()],
        withoutProject: true,
      });
      expect(rowsOf(state)).toEqual([["sin", 260]]);
      expect(state.filters).toEqual({
        ...NO_REPORT_FILTERS,
        withoutProject: true,
      });
    });
  });

  describe("una sola foto y nada sin permiso (criterio 9)", () => {
    it("con filtros, los dos catálogos, los niveles y el total en el Executor de la transacción de solo lectura repeatable read", async () => {
      const transaction = vi.spyOn(db, "transaction");
      const listClients = vi.spyOn(projectRepository, "listClients");
      const listAllProjects = vi.spyOn(projectRepository, "listAllProjects");
      const byLevels = vi.spyOn(reportRepository, "totalsByLevels");
      const entryTotals = vi.spyOn(reportRepository, "entryTotals");
      await filtered("tag", { projects: [p1], clients: [c1] }, ["project"]);
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(transaction.mock.calls[0]?.[1]).toEqual({
        isolationLevel: "repeatable read",
        accessMode: "read only",
      });
      const executors = [
        ...listClients.mock.calls.map((call) => call[0]),
        ...listAllProjects.mock.calls.map((call) => call[0]),
        ...byLevels.mock.calls.map((call) => call[2]),
        ...entryTotals.mock.calls.map((call) => call[2]),
      ];
      expect(executors).toHaveLength(5);
      expect(executors[0]).toBeDefined();
      expect(executors[0]).not.toBe(db);
      expect(executors.every((executor) => executor === executors[0])).toBe(true);
    });

    it("sin filtros también lee los catálogos, en la misma transacción", async () => {
      const listClients = vi.spyOn(projectRepository, "listClients");
      const listAllProjects = vi.spyOn(projectRepository, "listAllProjects");
      const byLevels = vi.spyOn(reportRepository, "totalsByLevels");
      await filtered("person", {});
      expect([listClients.mock.calls.length, listAllProjects.mock.calls.length]).toEqual([
        1, 1,
      ]);
      expect(listClients.mock.calls[0]?.[0]).toBe(byLevels.mock.calls[0]?.[2]);
    });

    it("con una membresía inactive o invited, forbidden sin leer los catálogos ni abrir la transacción", async () => {
      const transaction = vi.spyOn(db, "transaction");
      const listClients = vi.spyOn(projectRepository, "listClients");
      const listAllProjects = vi.spyOn(projectRepository, "listAllProjects");
      const byLevels = vi.spyOn(reportRepository, "totalsByLevels");
      const entryTotals = vi.spyOn(reportRepository, "entryTotals");
      for (const status of ["inactive", "invited"] as const) {
        const actor = actorIn(workspaceId, otherId, { role: "member", status });
        for (const groupBy of ["person", "tag"] as const) {
          expect(
            await getReportState(
              actor,
              settings,
              {
                range: lastWeek,
                groupBy,
                subgroups: [],
                filters: {
                  people: [],
                  clients: [c1],
                  projects: [p1],
                  withoutProject: true,
                },
              },
              readNow,
            ),
          ).toEqual({ kind: "forbidden" });
        }
      }
      expect([
        transaction.mock.calls.length,
        listClients.mock.calls.length,
        listAllProjects.mock.calls.length,
        byLevels.mock.calls.length,
        entryTotals.mock.calls.length,
      ]).toEqual([0, 0, 0, 0, 0]);
    });
  });

  describe("las guardas (criterio 10)", () => {
    const tooMany = (count: number) => Array.from({ length: count }, () => randomUUID());

    it("totalsByLevels y entryTotals lanzan RangeError sin consultar con 51 proyectos, 50 y «Sin proyecto» o 51 clientes", async () => {
      const { scope, span } = await realLevelRead();
      const filters = [
        { projectIds: tooMany(51), withoutProject: false, clientIds: [] },
        { projectIds: tooMany(50), withoutProject: true, clientIds: [] },
        { projectIds: [], withoutProject: false, clientIds: tooMany(51) },
      ];
      const select = vi.spyOn(db, "select");
      for (const filter of filters) {
        await expect(
          reportRepository.totalsByLevels(scope, {
            span,
            filter,
            dimensions: ["project"],
            buckets: {},
          }),
        ).rejects.toThrow(RangeError);
        await expect(
          reportRepository.entryTotals(scope, { span, filter }),
        ).rejects.toThrow(RangeError);
      }
      expect(select).not.toHaveBeenCalled();
    });

    it("con el tope justo, 50 proyectos, 49 y «Sin proyecto» o 50 clientes, las dos leen", async () => {
      const { scope, span } = await realLevelRead();
      const filters = [
        { projectIds: [...tooMany(49), p1], withoutProject: false, clientIds: [] },
        { projectIds: [...tooMany(48), p1], withoutProject: true, clientIds: [] },
        { projectIds: [], withoutProject: false, clientIds: [...tooMany(49), c1] },
      ];
      for (const filter of filters) {
        const rows = await reportRepository.totalsByLevels(scope, {
          span,
          filter,
          dimensions: ["project"],
          buckets: {},
        });
        expect(rows.length).toBeGreaterThan(0);
        const totals = await reportRepository.entryTotals(scope, { span, filter });
        expect(totals.seconds).toBeGreaterThan(0);
      }
    });

    it("getReportState con un filtro repetido, de 51, o de 50 proyectos y «Sin proyecto», lanza RangeError sin abrir la transacción", async () => {
      const transaction = vi.spyOn(db, "transaction");
      const invalid: Partial<ReportFilters>[] = [
        { projects: [p1, p1] },
        { clients: [c1, c1] },
        { projects: tooMany(51) },
        { clients: tooMany(51) },
        { projects: tooMany(50), withoutProject: true },
      ];
      for (const filters of invalid) {
        await expect(filtered("project", filters)).rejects.toThrow(RangeError);
      }
      expect(transaction).not.toHaveBeenCalled();
      // El tope justo se lee: los que no existen se ignoran.
      for (const filters of [
        { projects: tooMany(50) },
        { projects: tooMany(49), withoutProject: true },
        { clients: tooMany(50) },
      ]) {
        expect((await filtered("project", filters)).filters).toEqual({
          ...NO_REPORT_FILTERS,
          withoutProject: filters.withoutProject ?? false,
        });
      }
    });

    it("el tope del esquema es el de las guardas", () => {
      expect(REPORT_MAX_FILTER_VALUES).toBe(50);
    });
  });

  describe("el estado (criterio 11)", () => {
    it("filterOptions son los del catálogo, en orden alfabético, con el color de la paleta y solo los campos del esquema", async () => {
      const state = await filtered("project", {});
      const acme = { id: c1, name: "Acme" };
      expect(state.filterOptions).toStrictEqual({
        people: [
          { id: otherId, name: "Otra", inactive: false },
          { id: ownerId, name: "Owner", inactive: false },
        ],
        clients: [
          { id: c1, name: "Acme", archived: false },
          { id: c2, name: "Bravo", archived: false },
          { id: c3, name: "Cerrado", archived: true },
        ],
        projects: [
          { id: p1, name: "Alfa", color: "green", client: acme, archived: false },
          {
            id: p2,
            name: "Beta",
            color: "red",
            client: { id: c2, name: "Bravo" },
            archived: false,
          },
          { id: p4, name: "Delta", color: "pink", client: acme, archived: true },
          {
            id: p5,
            name: "Épsilon",
            color: "lime",
            client: { id: c3, name: "Cerrado" },
            archived: false,
          },
          { id: p3, name: "Gamma", color: "teal", client: null, archived: true },
        ],
      });
      expect(reportReadyState.parse(state)).toEqual(state);
    });

    it("filters lleva los ids en el orden del catálogo, no en el de la URL", async () => {
      const state = await filtered("project", {
        projects: [p3, p2, p1],
        clients: [c3, c1],
      });
      expect(state.filters).toEqual({
        people: [],
        clients: [c1, c3],
        projects: [p1, p2, p3],
        withoutProject: false,
      });
    });

    it("sin filtros, filters es NO_REPORT_FILTERS", async () => {
      expect((await filtered("person", {})).filters).toEqual(NO_REPORT_FILTERS);
    });
  });
});

describe("el filtro de personas (R4b: RP-25, RP-34, RP-62, RP-64; D-R4-4)", () => {
  /** Un id como los de Better Auth: 32 alfanuméricos con mayúsculas (D-R4-2). */
  const inactiveUserId = "Q3vXk9LmP2aZr7TbW1cYn5HdF8sJe4Ug";
  const unknownId = "NoExiste0123456789abcdefABCDEF00";

  let adminId: string;
  let admin: Actor;
  let activeId: string;
  let inactiveId: string;
  let invitedId: string;
  let strangerId: string;
  let p1: string;
  let p2: string;
  let e: string;

  beforeEach(async () => {
    adminId = await seedPerson({ accountName: "Admin", role: "admin" });
    admin = actorIn(workspaceId, adminId, { role: "admin" });
    // La cuenta y el nombre editado caen en lugares distintos del orden.
    activeId = await seedPerson({ accountName: "Zoe", displayName: "Anita" });
    inactiveId = await seedPerson({
      accountName: "Inés",
      status: "inactive",
      id: inactiveUserId,
    });
    invitedId = await seedPerson({ accountName: "Iván", status: "invited" });
    p1 = (await seedProject({ workspaceId, name: "Alfa" })).id;
    p2 = (await seedProject({ workspaceId, name: "Beta" })).id;
    e = (await seedTag({ workspaceId, name: "E" })).id;

    await seedClosed(activeId, "2026-09-29T13:00:00Z", 600, {
      projectId: p1,
      tagIds: [e],
    });
    await seedClosed(activeId, "2026-09-29T14:00:00Z", 300, { projectId: p2 });
    await seedClosed(inactiveId, "2026-09-30T13:00:00Z", 1000, {
      projectId: p1,
      tagIds: [e],
    });
    // La aplicación no produce una invitada con horas: se siembra por base.
    await seedClosed(invitedId, "2026-09-30T14:00:00Z", 50, { projectId: p1 });
    await seedClosed(ownerId, "2026-10-01T13:00:00Z", 7, { projectId: p1 });
    await seedClosed(ownerId, "2026-10-01T14:00:00Z", 20);
    await seedClosed(adminId, "2026-10-01T15:00:00Z", 3, { projectId: p2 });

    const other = await seedWorkspace();
    strangerId = other.ownerId;
    await seedTimeEntry({
      workspaceId: other.workspaceId,
      userId: strangerId,
      startedAt: "2026-09-30T13:00:00Z",
      endedAt: "2026-09-30T15:00:00Z",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function filtered(
    groupBy: ReportGroupBy,
    filters: Partial<ReportFilters>,
    actor: Actor = admin,
  ) {
    return readyState(actor, {
      range: lastWeek,
      groupBy,
      filters: { ...NO_REPORT_FILTERS, ...filters },
    });
  }

  /** Las filas por persona como `[nombre, segundos, inactiva]`, en orden. */
  function peopleRows(state: ReportReadyState) {
    return state.groups.map((group) =>
      group.kind === "person"
        ? [group.name, group.seconds, group.inactive]
        : ["?", group.seconds, false],
    );
  }

  /** Las filas por etiqueta como `[nombre, segundos]`, en orden; «Sin etiqueta» como «sin». */
  function tagRows(state: ReportReadyState) {
    return state.groups.map((group) =>
      group.kind === "tag" ? [group.tag?.name ?? "sin", group.seconds] : ["?", 0],
    );
  }

  /** Todas las personas del workspace con horas en la semana, sin filtro; la invitada es una fila (RP-61). */
  const everyoneRows = [
    ["Inés", 1000, true],
    ["Anita", 900, false],
    ["Iván", 50, true],
    ["Owner", 27, false],
    ["Admin", 3, false],
  ];

  describe("se aplica con el alcance angostado (criterio 18)", () => {
    it("[activa, inactiva] por persona: las dos filas, la inactiva marcada; el total es el de las dos y la línea del alcance no cambia", async () => {
      const state = await filtered("person", { people: [inactiveId, activeId] });
      expect(peopleRows(state)).toEqual([
        ["Inés", 1000, true],
        ["Anita", 900, false],
      ]);
      expect(state.totalSeconds).toBe(1900);
      expect(state.scope).toBe("everyone");
      expect(state.filters).toEqual({
        ...NO_REPORT_FILTERS,
        people: [activeId, inactiveId],
      });
    });

    it("por proyecto, la suma de las dos", async () => {
      const state = await filtered("project", { people: [activeId, inactiveId] });
      expect(projectRows(state)).toEqual([
        ["Alfa", 1600],
        ["Beta", 300],
      ]);
    });

    it("por etiqueta, entryTotals da el total de las dos", async () => {
      const entryTotals = vi.spyOn(reportRepository, "entryTotals");
      const state = await filtered("tag", { people: [activeId, inactiveId] });
      expect(tagRows(state)).toEqual([
        ["E", 1600],
        ["sin", 300],
      ]);
      expect(entryTotals).toHaveBeenCalledTimes(1);
      expect(state.totalSeconds).toBe(1900);
    });

    it("con [P1] además, las dos dentro de P1", async () => {
      const state = await filtered("person", {
        people: [activeId, inactiveId],
        projects: [p1],
      });
      expect(peopleRows(state)).toEqual([
        ["Inés", 1000, true],
        ["Anita", 600, false],
      ]);
      expect(state.totalSeconds).toBe(1600);
    });

    it("el catálogo de personas, los niveles y el total leen con el mismo Executor, el de la transacción", async () => {
      const listPeople = vi.spyOn(workspaceRepository, "listPeople");
      const byLevels = vi.spyOn(reportRepository, "totalsByLevels");
      const entryTotals = vi.spyOn(reportRepository, "entryTotals");
      await readyState(admin, {
        range: lastWeek,
        groupBy: "tag",
        subgroups: ["person"],
        filters: { ...NO_REPORT_FILTERS, people: [activeId] },
      });
      const executors = [
        ...listPeople.mock.calls.map((call) => call[0]),
        ...byLevels.mock.calls.map((call) => call[2]),
        ...entryTotals.mock.calls.map((call) => call[2]),
      ];
      expect(executors).toHaveLength(4);
      expect(executors[0]).toBeDefined();
      expect(executors[0]).not.toBe(db);
      expect(executors.every((executor) => executor === executors[0])).toBe(true);
    });
  });

  describe("lo que no está en el catálogo se ignora (criterio 18, RP-34, RP-64)", () => {
    it("el id de la inactiva en minúsculas no es el suyo: solo se ignora él", async () => {
      const lowered = inactiveUserId.toLowerCase();
      const alone = await filtered("person", { people: [lowered] });
      expect(alone.filters).toEqual(NO_REPORT_FILTERS);
      expect(peopleRows(alone)).toEqual(everyoneRows);

      const withActive = await filtered("person", { people: [lowered, activeId] });
      expect(withActive.filters.people).toEqual([activeId]);
      expect(peopleRows(withActive)).toEqual([["Anita", 900, false]]);
    });

    it("la invitada, una persona de otro workspace y un id que no existe se ignoran; junto a una del catálogo, se aplica esa", async () => {
      for (const ignored of [invitedId, strangerId, unknownId]) {
        const state = await filtered("person", { people: [ignored, activeId] });
        expect(state.filters.people).toEqual([activeId]);
        expect(peopleRows(state)).toEqual([["Anita", 900, false]]);
      }
    });

    it("si se ignoran todos, todas las personas, sin filtro de personas", async () => {
      const state = await filtered("person", {
        people: [invitedId, strangerId, unknownId],
      });
      expect(state.filters).toEqual(NO_REPORT_FILTERS);
      expect(peopleRows(state)).toEqual(everyoneRows);
      expect(state.totalSeconds).toBe(1980);
    });
  });

  describe("las opciones (criterio 18, D-R4-9)", () => {
    it("filterOptions.people: activas e inactivas con displayNameOf, solo id, name e inactive, en el orden alfabético de ese nombre y no del de la cuenta", async () => {
      const state = await filtered("person", { people: [activeId] });
      expect(state.filterOptions.people).toStrictEqual([
        { id: adminId, name: "Admin", inactive: false },
        { id: activeId, name: "Anita", inactive: false },
        { id: inactiveId, name: "Inés", inactive: true },
        { id: ownerId, name: "Owner", inactive: false },
      ]);
      expect(reportReadyState.parse(state)).toEqual(state);
    });
  });

  describe("sin timeEntry.others.view no hay filtro de personas (criterio 20, D-R4-4)", () => {
    it("un member con personas ajenas y la propia ve lo propio: el alcance sigue en self y el catálogo no se lee", async () => {
      const listPeople = vi.spyOn(workspaceRepository, "listPeople");
      const byLevels = vi.spyOn(reportRepository, "totalsByLevels");
      const entryTotals = vi.spyOn(reportRepository, "entryTotals");
      const member = actorIn(workspaceId, activeId);
      for (const groupBy of ["person", "tag"] as const) {
        const state = await filtered(
          groupBy,
          { people: [inactiveId, activeId, ownerId], projects: [p1] },
          member,
        );
        expect(state.totalSeconds).toBe(600);
        expect(state.scope).toBe("self");
        expect(state.filters).toEqual({ ...NO_REPORT_FILTERS, projects: [p1] });
        expect(state.filterOptions.people).toBeNull();
      }
      const scopes = [
        ...byLevels.mock.calls.map((call) => call[0]),
        ...entryTotals.mock.calls.map((call) => call[0]),
      ];
      expect(scopes).toHaveLength(3);
      expect(scopes.every((scope) => scope.people.kind === "self")).toBe(true);
      expect(listPeople).not.toHaveBeenCalled();
    });
  });
});

/** Las filas de semana o de mes del primer nivel como `[primer día, rótulo, solo, segundos]`, en orden. */
function timeRows(state: ReportReadyState) {
  return state.groups.map((group) => {
    switch (group.kind) {
      case "week":
        return [group.weekStart, group.label, group.partial, group.seconds];
      case "month":
        return [group.monthStart, group.label, group.partial, group.seconds];
      default:
        return ["?", "?", "?", group.seconds];
    }
  });
}

/** El total y el facturable de un estado, para compararlos con los de «Persona». */
function totalsPair(state: ReportReadyState) {
  return [state.totalSeconds, state.billableSeconds];
}

describe("por semana (D-R10-2, D-R10-3, D-R10-5, RP-24; criterio 4 de R10)", () => {
  /** Del miércoles 30/09 al martes 13/10: la primera y la última semana, cortadas. */
  const range: ReportRange = { first: "2026-09-30", last: "2026-10-13" };

  beforeEach(async () => {
    // A las 10:00 de Buenos Aires.
    await seedClosed(ownerId, "2026-09-30T13:00:00Z", 3600, { billable: true });
    await seedClosed(ownerId, "2026-10-04T13:00:00Z", 1800);
    await seedClosed(ownerId, "2026-10-08T13:00:00Z", 900, { billable: true });
    // La última semana tiene más horas: el orden sigue siendo cronológico.
    await seedClosed(ownerId, "2026-10-12T13:00:00Z", 7200);
  });

  it("con lunes: la primera y la última con partial, la del medio sin, en orden cronológico", async () => {
    const state = await readyState(owner, { range, groupBy: "week" });
    expect(timeRows(state)).toEqual([
      ["2026-09-28", "28/09 – 04/10", "30/09 – 04/10", 5400],
      ["2026-10-05", "05/10 – 11/10", null, 900],
      ["2026-10-12", "12/10 – 18/10", "12/10 – 13/10", 7200],
    ]);
    expect(reportReadyState.parse(state)).toEqual(state);
  });

  it("las mismas entradas con domingo dan otras semanas", async () => {
    const state = await readyState(
      owner,
      { range, groupBy: "week" },
      { settings: workspaceOf(buenosAires, 0) },
    );
    expect(timeRows(state)).toEqual([
      ["2026-09-27", "27/09 – 03/10", "30/09 – 03/10", 3600],
      ["2026-10-04", "04/10 – 10/10", null, 2700],
      ["2026-10-11", "11/10 – 17/10", "11/10 – 13/10", 7200],
    ]);
  });

  it("el total y el facturable son los de «Persona»", async () => {
    const byWeek = await readyState(owner, { range, groupBy: "week" });
    const byPerson = await readyState(owner, { range, groupBy: "person" });
    expect(totalsPair(byWeek)).toEqual([13_500, 4500]);
    expect(totalsPair(byWeek)).toEqual(totalsPair(byPerson));
  });

  it("una semana de otro año lleva el año en el rótulo, sin «Esta semana» ni «Semana anterior»", async () => {
    await seedClosed(ownerId, "2025-12-30T13:00:00Z", 600);
    const lastYear = await readyState(owner, {
      range: { first: "2025-12-29", last: "2026-01-04" },
      groupBy: "week",
    });
    expect(timeRows(lastYear)).toEqual([
      ["2025-12-29", "29/12/2025 – 04/01/2026", null, 600],
    ]);
    const current = await readyState(owner, {
      range: { first: "2026-09-28", last: "2026-10-11" },
      groupBy: "week",
    });
    expect(timeRows(current)).toEqual([
      ["2026-09-28", "28/09 – 04/10", null, 5400],
      ["2026-10-05", "05/10 – 11/10", null, 900],
    ]);
  });
});

describe("la semana y el mes en la zona de quien mira (RP-22, ADR 0021; criterios 4 y 5 de R10)", () => {
  it("el domingo a las 23:30 de Buenos Aires es el lunes a las 04:30 de Madrid: semanas distintas", async () => {
    await seedClosed(ownerId, "2026-10-05T02:30:00Z", 600);
    const range = { first: "2026-09-28", last: "2026-10-11" };
    const fromBuenosAires = await readyState(owner, { range, groupBy: "week" });
    const fromMadrid = await readyState(
      owner,
      { range, groupBy: "week" },
      { settings: workspaceOf(madrid) },
    );
    expect(timeRows(fromBuenosAires)).toEqual([
      ["2026-09-28", "28/09 – 04/10", null, 600],
    ]);
    expect(timeRows(fromMadrid)).toEqual([["2026-10-05", "05/10 – 11/10", null, 600]]);
  });

  it("el 30/09 a las 23:30 de Buenos Aires es de septiembre allí y de octubre en Madrid", async () => {
    await seedClosed(ownerId, "2026-10-01T02:30:00Z", 600);
    const range = { first: "2026-09-15", last: "2026-10-14" };
    const fromBuenosAires = await readyState(owner, { range, groupBy: "month" });
    const fromMadrid = await readyState(
      owner,
      { range, groupBy: "month" },
      { settings: workspaceOf(madrid) },
    );
    expect(timeRows(fromBuenosAires)).toEqual([
      ["2026-09-01", "septiembre", "15/09 – 30/09", 600],
    ]);
    expect(timeRows(fromMadrid)).toEqual([
      ["2026-10-01", "octubre", "01/10 – 14/10", 600],
    ]);
  });
});

describe("por mes (D-R10-2, D-R10-3, D-R10-5; criterio 5 de R10)", () => {
  it("del 15/09 al 14/10: septiembre y octubre con lo que cuentan, en orden cronológico", async () => {
    await seedClosed(ownerId, "2026-09-15T13:00:00Z", 600, { billable: true });
    await seedClosed(ownerId, "2026-10-14T13:00:00Z", 1200);
    const range = { first: "2026-09-15", last: "2026-10-14" };
    const byMonth = await readyState(owner, { range, groupBy: "month" });
    expect(timeRows(byMonth)).toEqual([
      ["2026-09-01", "septiembre", "15/09 – 30/09", 600],
      ["2026-10-01", "octubre", "01/10 – 14/10", 1200],
    ]);
    expect(reportReadyState.parse(byMonth)).toEqual(byMonth);
    const byPerson = await readyState(owner, { range, groupBy: "person" });
    expect(totalsPair(byMonth)).toEqual([1800, 600]);
    expect(totalsPair(byMonth)).toEqual(totalsPair(byPerson));
  });

  it("un año entero da meses sin partial, con el año en el rótulo si no es el de hoy", async () => {
    await seedClosed(ownerId, "2025-01-01T03:00:00Z", 600);
    await seedClosed(ownerId, "2025-06-15T13:00:00Z", 1200);
    // El último instante del año en Buenos Aires.
    await seedClosed(ownerId, "2026-01-01T02:59:00Z", 1800);
    const byMonth = await readyState(owner, {
      range: { first: "2025-01-01", last: "2025-12-31" },
      groupBy: "month",
    });
    expect(timeRows(byMonth)).toEqual([
      ["2025-01-01", "enero de 2025", null, 600],
      ["2025-06-01", "junio de 2025", null, 1200],
      ["2025-12-01", "diciembre de 2025", null, 1800],
    ]);
  });
});

describe("los niveles de tiempo y los filtros (D-R10-3, D-R10-6, D-R10-11; criterio 6 de R10)", () => {
  /** Del lunes 21/09 al domingo 11/10, con lunes: la semana del 28/09 entera adentro. */
  const range: ReportRange = { first: "2026-09-21", last: "2026-10-11" };
  let p1: string;

  beforeEach(async () => {
    const ana = await seedPerson({ accountName: "Ana" });
    const bruno = await seedPerson({ accountName: "Bruno" });
    p1 = (await seedProject({ workspaceId, name: "P1" })).id;
    const p2 = (await seedProject({ workspaceId, name: "P2" })).id;
    // A las 09:00 y a las 10:00 de Buenos Aires.
    await seedClosed(ana, "2026-09-30T12:00:00Z", 3600, { projectId: p1 });
    await seedClosed(ana, "2026-10-01T12:00:00Z", 1800, { projectId: p1 });
    await seedClosed(bruno, "2026-09-30T13:00:00Z", 2700, { projectId: p2 });
  });

  function tree(levels: readonly ReportGroupBy[], filters: Partial<ReportFilters> = {}) {
    return readyState(owner, {
      range,
      groupBy: levels[0],
      subgroups: levels.slice(1),
      filters: { ...NO_REPORT_FILTERS, ...filters },
    });
  }

  it("[month, week]: la semana debajo de los dos meses, cada vez con su parte", async () => {
    const state = await tree(["month", "week"]);
    expect(outline(state.groups)).toEqual([
      [
        "septiembre solo 21/09 – 30/09",
        6300,
        [["28/09 – 04/10 solo 28/09 – 30/09", 6300]],
      ],
      ["octubre solo 01/10 – 11/10", 1800, [["28/09 – 04/10 solo 01/10 – 04/10", 1800]]],
    ]);
    expect(state.totalSeconds).toBe(8100);
    expect(reportReadyState.parse(state)).toEqual(state);
  });

  it("[month, person, week]: la semana dice «solo …» aunque su padre sea la persona", async () => {
    const state = await tree(["month", "person", "week"]);
    expect(outline(state.groups)).toEqual([
      [
        "septiembre solo 21/09 – 30/09",
        6300,
        [
          ["Ana", 3600, [["28/09 – 04/10 solo 28/09 – 30/09", 3600]]],
          ["Bruno", 2700, [["28/09 – 04/10 solo 28/09 – 30/09", 2700]]],
        ],
      ],
      [
        "octubre solo 01/10 – 11/10",
        1800,
        [["Ana", 1800, [["28/09 – 04/10 solo 01/10 – 04/10", 1800]]]],
      ],
    ]);
  });

  it("[week, month]: debajo de la semana entera, sus dos meses con su parte", async () => {
    const state = await tree(["week", "month"]);
    expect(outline(state.groups)).toEqual([
      [
        "28/09 – 04/10",
        8100,
        [
          ["septiembre solo 28/09 – 30/09", 6300],
          ["octubre solo 01/10 – 04/10", 1800],
        ],
      ],
    ]);
  });

  it("[week, date]: los días debajo de la semana", async () => {
    const state = await tree(["week", "date"]);
    expect(outline(state.groups)).toEqual([
      [
        "28/09 – 04/10",
        8100,
        [
          ["2026-09-30", 6300],
          ["2026-10-01", 1800],
        ],
      ],
    ]);
  });

  it("[date, week]: debajo de cada día, la semana dice «solo» ese día", async () => {
    const state = await tree(["date", "week"]);
    expect(outline(state.groups)).toEqual([
      ["2026-09-30", 6300, [["28/09 – 04/10 solo 30/09", 6300]]],
      ["2026-10-01", 1800, [["28/09 – 04/10 solo 01/10", 1800]]],
    ]);
  });

  it("[date, month]: debajo de cada día, el mes dice «solo» ese día", async () => {
    const state = await tree(["date", "month"]);
    expect(outline(state.groups)).toEqual([
      ["2026-09-30", 6300, [["septiembre solo 30/09", 6300]]],
      ["2026-10-01", 1800, [["octubre solo 01/10", 1800]]],
    ]);
  });

  it("[person, month]: cada persona con sus meses", async () => {
    const state = await tree(["person", "month"]);
    expect(outline(state.groups)).toEqual([
      [
        "Ana",
        5400,
        [
          ["septiembre solo 21/09 – 30/09", 3600],
          ["octubre solo 01/10 – 11/10", 1800],
        ],
      ],
      ["Bruno", 2700, [["septiembre solo 21/09 – 30/09", 2700]]],
    ]);
  });

  it("[month, week, date]: cada día debajo de su mes y de su semana", async () => {
    const state = await tree(["month", "week", "date"]);
    expect(outline(state.groups)).toEqual([
      [
        "septiembre solo 21/09 – 30/09",
        6300,
        [["28/09 – 04/10 solo 28/09 – 30/09", 6300, [["2026-09-30", 6300]]]],
      ],
      [
        "octubre solo 01/10 – 11/10",
        1800,
        [["28/09 – 04/10 solo 01/10 – 04/10", 1800, [["2026-10-01", 1800]]]],
      ],
    ]);
  });

  it("[month, week] con P1: solo lo de P1 en cada nivel y en el total (R4, §9)", async () => {
    const state = await tree(["month", "week"], { projects: [p1] });
    expect(outline(state.groups)).toEqual([
      [
        "septiembre solo 21/09 – 30/09",
        3600,
        [["28/09 – 04/10 solo 28/09 – 30/09", 3600]],
      ],
      ["octubre solo 01/10 – 11/10", 1800, [["28/09 – 04/10 solo 01/10 – 04/10", 1800]]],
    ]);
    expect(state.totalSeconds).toBe(5400);
  });
});

describe("las guardas de las dimensiones de tiempo (D-R10-4; criterio 7 de R10)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("cada lectura con los tramos mal puestos lanza RangeError sin consultar, con db y con el Executor de una transacción", async () => {
    const { scope, span, buckets } = await realLevelRead();
    const week = weekBuckets(lastWeek.first, lastWeek.last, 1, buenosAires);
    const month = monthBuckets(lastWeek.first, lastWeek.last, buenosAires);
    const shortMonth = monthBuckets(lastWeek.first, "2026-10-03", buenosAires);
    const filter = NO_ENTRY_FILTER;
    // Las válidas de cada forma, para que las inválidas fallen solo por lo suyo.
    for (const valid of [
      { span, filter, dimensions: ["week"], buckets: { week } },
      { span, filter, dimensions: ["month", "week"], buckets: { month, week } },
      {
        span,
        filter,
        dimensions: ["month", "week", "date"],
        buckets: { month, week, date: buckets },
      },
    ] satisfies ReportLevelRead[]) {
      await expect(reportRepository.totalsByLevels(scope, valid)).resolves.toEqual(
        expect.any(Array),
      );
    }
    const invalid = [
      { span, filter, dimensions: ["week"], buckets: {} },
      { span, filter, dimensions: ["week"], buckets: { month } },
      { span, filter, dimensions: ["project"], buckets: { week } },
      { span, filter, dimensions: ["date"], buckets: { date: buckets, week } },
      { span, filter, dimensions: ["month", "week"], buckets: { month } },
      { span, filter, dimensions: ["month", "week"], buckets: { week } },
      { span, filter, dimensions: ["month"], buckets: { month: shortMonth } },
      {
        span,
        filter,
        dimensions: ["month"],
        buckets: {
          month: {
            buckets: [{ ...month.buckets[0], start: new Date(span.from.getTime() - 1) }],
            end: month.end,
          },
        },
      },
      {
        span,
        filter,
        dimensions: ["week"],
        buckets: { week: { buckets: [], end: week.end } },
      },
      {
        span,
        filter,
        dimensions: ["month"],
        buckets: { month: { buckets: [], end: month.end } },
      },
    ] satisfies ReportLevelRead[];

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

describe("los tramos de cada lectura (D-R10-4; criterio 8 de R10)", () => {
  /** Del miércoles 30/09 al martes 13/10. */
  const range: ReportRange = { first: "2026-09-30", last: "2026-10-13" };

  beforeEach(async () => {
    await seedClosed(ownerId, "2026-10-01T13:00:00Z", 600);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Las claves de `buckets` de cada lectura por niveles, en el orden de las lecturas. */
  function bucketKeysOf(byLevels: MockInstance<typeof reportRepository.totalsByLevels>) {
    return byLevels.mock.calls.map(([, read]) => Object.keys(read.buckets).sort());
  }

  it("en Mes → Semana → Fecha, cada lectura lleva solo los tramos de sus dimensiones", async () => {
    const byLevels = vi.spyOn(reportRepository, "totalsByLevels");
    await readyState(owner, { range, groupBy: "month", subgroups: ["week", "date"] });
    expect(bucketKeysOf(byLevels)).toEqual([
      ["month"],
      ["month", "week"],
      ["date", "month", "week"],
    ]);
    const reads = byLevels.mock.calls.map(([, read]) => read);
    // Los mismos tramos en cada lectura: se arman una vez por pedido.
    expect(reads[1]?.buckets.month).toBe(reads[0]?.buckets.month);
    expect(reads[2]?.buckets.week).toBe(reads[1]?.buckets.week);
  });

  it("sin dimensiones de tiempo, {}", async () => {
    const byLevels = vi.spyOn(reportRepository, "totalsByLevels");
    await readyState(owner, { range, groupBy: "person", subgroups: ["project"] });
    expect(bucketKeysOf(byLevels)).toEqual([[], []]);
  });

  it("con domingo en settings.weekStart, el segundo tramo de buckets.week empieza un domingo", async () => {
    const byLevels = vi.spyOn(reportRepository, "totalsByLevels");
    await readyState(
      owner,
      { range, groupBy: "week" },
      { settings: workspaceOf(buenosAires, 0) },
    );
    const week = byLevels.mock.calls[0]?.[1].buckets.week;
    expect(week?.buckets.map((bucket) => bucket.firstDay)).toEqual([
      "2026-09-30",
      "2026-10-04",
      "2026-10-11",
    ]);
    expect(week?.buckets[1]?.start.toISOString()).toBe("2026-10-04T03:00:00.000Z");
  });
});
