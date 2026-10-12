import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
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
import { membership, project, tag, task, timeEntry, user } from "@/server/db/schema";
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
import { descriptionIdOf } from "@/test/report";
import { actorIn, workspaceOf } from "@/test/time-entry";

import { projectLabels } from "@/modules/project/components/labels";
import { trackerLabels } from "@/modules/time-entry/components/labels";
import { projectRepository } from "@/modules/project/repository";
import { workspaceRepository } from "@/modules/workspace/repository";
import { getTimesheetState } from "@/modules/time-entry/service";

import {
  NO_REPORT_FILTERS,
  REPORT_EXPORT_MAX_BYTES,
  REPORT_EXPORT_MAX_ENTRIES,
  REPORT_GROUP_BYS,
  REPORT_MAX_FILTER_VALUES,
  REPORT_MAX_ROWS,
  reportEntryRow,
  reportReadyState,
  type ReportEntryRow,
  type ReportExportEntries,
  type ReportFilters,
  type ReportGroup,
  type ReportGroupBy,
  type ReportRange,
  type ReportReadyState,
} from "./schema";
import { reportLabels } from "./components/labels";
import { csvBytesOf } from "./export/csv";
import { entriesMinBytes } from "./export/entry-size";
import { exportDocumentOf } from "./export/document";
import { NO_ENTRY_FILTER, reportRepository, type ReportLevelRead } from "./repository";
import { getReportExport, getReportState, type ReportRequest } from "./service";

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
    readonly description?: string;
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
      peopleWithoutTime: request.peopleWithoutTime ?? false,
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
    case "description":
      return group.description?.text ?? trackerLabels.noDescription;
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
    expect(byLevels.mock.calls.map(([, read]) => read.limit)).toEqual([3001, 2701]);
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
    expect(byLevels.mock.calls.map(([, read]) => read.limit)).toEqual([3001, 2701]);
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
        peopleWithoutTime: false,
      },
      {
        range: { first: "2025-01-01", last: "2026-01-02" },
        groupBy: "tag",
        subgroups: ["date"],
        filters: NO_REPORT_FILTERS,
        peopleWithoutTime: false,
      },
      {
        range: lastWeek,
        groupBy: "person",
        subgroups: ["project", "date", "tag"],
        filters: NO_REPORT_FILTERS,
        peopleWithoutTime: false,
      },
      {
        range: lastWeek,
        groupBy: "person",
        subgroups: ["date", "date"],
        filters: NO_REPORT_FILTERS,
        peopleWithoutTime: false,
      },
      {
        range: lastWeek,
        groupBy: "project",
        subgroups: ["project"],
        filters: NO_REPORT_FILTERS,
        peopleWithoutTime: false,
      },
      {
        range: lastWeek,
        groupBy: null,
        subgroups: ["person"],
        filters: NO_REPORT_FILTERS,
        peopleWithoutTime: false,
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
        peopleWithoutTime: false,
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
            {
              range,
              groupBy,
              subgroups: [],
              filters: NO_REPORT_FILTERS,
              peopleWithoutTime: false,
            },
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
      case "description":
        return group.description?.text ?? "sin";
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
                peopleWithoutTime: false,
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

/** Las filas por descripción como `[texto o null, recortada, segundos]`, en orden. */
function descriptionRows(state: ReportReadyState) {
  return state.groups.map((group) =>
    group.kind === "description"
      ? [
          group.description?.text ?? null,
          group.description?.truncated ?? null,
          group.seconds,
        ]
      : ["?", "?", group.seconds],
  );
}

/** Los `id` del primer nivel por descripción, en orden; `null` es «Sin descripción». */
function descriptionIds(state: ReportReadyState) {
  return state.groups.map((group) =>
    group.kind === "description" ? (group.description?.id ?? null) : "?",
  );
}

describe("por descripción (D-R10-8, D-R10-9, RP-11, RP-28; criterio 15 de R10)", () => {
  let otherId: string;
  let p1: string;
  let p2: string;

  beforeEach(async () => {
    otherId = await seedPerson({ accountName: "Otra" });
    p1 = (await seedProject({ workspaceId, name: "P1" })).id;
    p2 = (await seedProject({ workspaceId, name: "P2" })).id;
  });

  /** Una entrada del owner el martes 29/09 a las 10:00 de Buenos Aires. */
  function seedDescribed(description: string, seconds: number) {
    return seedClosed(ownerId, "2026-09-29T13:00:00Z", seconds, { description });
  }

  it("agrupa por el texto exacto: las mayúsculas, los espacios internos, NFD y un espacio final separan", async () => {
    await seedClosed(ownerId, "2026-09-29T13:00:00Z", 3600, {
      projectId: p1,
      description: "Reunión",
    });
    await seedClosed(otherId, "2026-09-30T13:00:00Z", 1800, {
      projectId: p2,
      description: "Reunión",
    });
    await seedDescribed("reunión", 3000);
    await seedDescribed("Reunión semanal", 2400);
    await seedDescribed("Reunión  semanal", 2100);
    // Sembradas con SQL: la aplicación guarda NFC y recorta los bordes.
    await seedDescribed("Reunión".normalize("NFD"), 1500);
    await seedDescribed("Reunión ", 1200);
    const state = await readyState(owner, { range: lastWeek, groupBy: "description" });
    expect(descriptionRows(state)).toEqual([
      ["Reunión", false, 5400],
      ["reunión", false, 3000],
      ["Reunión semanal", false, 2400],
      ["Reunión  semanal", false, 2100],
      ["Reunión".normalize("NFD"), false, 1500],
      ["Reunión ", false, 1200],
    ]);
    expect(descriptionIds(state)).toEqual(
      [
        "Reunión",
        "reunión",
        "Reunión semanal",
        "Reunión  semanal",
        "Reunión".normalize("NFD"),
        "Reunión ",
      ].map(descriptionIdOf),
    );
    expect(reportReadyState.parse(state)).toEqual(state);
  });

  it("la cadena vacía es «Sin descripción», después de las de su misma duración; el empate va por el texto", async () => {
    await seedDescribed("", 600);
    await seedDescribed("Bravo", 600);
    await seedDescribed("Alfa", 600);
    await seedDescribed("Charlie", 900);
    const state = await readyState(owner, { range: lastWeek, groupBy: "description" });
    expect(descriptionRows(state)).toEqual([
      ["Charlie", false, 900],
      ["Alfa", false, 600],
      ["Bravo", false, 600],
      [null, null, 600],
    ]);
    expect(state.groups.at(-1)).toEqual({
      kind: "description",
      description: null,
      seconds: 600,
    });
  });

  it("de una de 3000 caracteres viajan los 100 primeros; dos de 150 con los mismos 100 primeros son dos grupos", async () => {
    const long = `Ticket largo ${"detalle ".repeat(400)}`.slice(0, 3000);
    const shared = "x".repeat(100);
    await seedDescribed(long, 900);
    await seedDescribed(`${shared}${"a".repeat(50)}`, 600);
    await seedDescribed(`${shared}${"b".repeat(50)}`, 300);
    const state = await readyState(owner, { range: lastWeek, groupBy: "description" });
    expect(long).toHaveLength(3000);
    expect(descriptionRows(state)).toEqual([
      [long.slice(0, 100), true, 900],
      [shared, true, 600],
      [shared, true, 300],
    ]);
    expect(descriptionIds(state)).toEqual(
      [long, `${shared}${"a".repeat(50)}`, `${shared}${"b".repeat(50)}`].map(
        descriptionIdOf,
      ),
    );
  });

  it("cuenta en puntos de código: 100 emojis viajan enteros y sin recortar; de 101, los 100 primeros", async () => {
    const hundred = "😀".repeat(100);
    await seedDescribed(hundred, 900);
    await seedDescribed(`${hundred}🎉`, 600);
    const state = await readyState(owner, { range: lastWeek, groupBy: "description" });
    expect(descriptionRows(state)).toEqual([
      [hundred, false, 900],
      [hundred, true, 600],
    ]);
    expect(descriptionIds(state)).toEqual([hundred, `${hundred}🎉`].map(descriptionIdOf));
    expect(reportReadyState.parse(state)).toEqual(state);
  });

  it("el id es el SHA-256 del texto en UTF-8, también con barras invertidas", async () => {
    const texts = ["C:\\temp\\nuevo", "\\x41", "año ñandú"];
    for (const [index, text] of texts.entries()) {
      await seedDescribed(text, 900 - index * 100);
    }
    const state = await readyState(owner, { range: lastWeek, groupBy: "description" });
    expect(descriptionRows(state).map(([text]) => text)).toEqual(texts);
    expect(descriptionIds(state)).toEqual(texts.map(descriptionIdOf));
  });

  it("el total y el facturable son los de «Persona»", async () => {
    await seedClosed(ownerId, "2026-09-29T13:00:00Z", 3600, {
      projectId: p1,
      billable: true,
      description: "Reunión",
    });
    await seedClosed(otherId, "2026-09-30T13:00:00Z", 1800, {
      projectId: p2,
      description: "Reunión",
    });
    await seedDescribed("", 600);
    const byDescription = await readyState(owner, {
      range: lastWeek,
      groupBy: "description",
    });
    const byPerson = await readyState(owner, { range: lastWeek, groupBy: "person" });
    expect(totalsPair(byDescription)).toEqual([6000, 3600]);
    expect(totalsPair(byDescription)).toEqual(totalsPair(byPerson));
  });
});

describe("la descripción en los niveles y con filtros (D-R10-6, D-R10-11; criterio 16 de R10)", () => {
  let p1: string;

  /**
   * «Reunión» del owner en P1 el martes 29/09 y de Otra en P2 el miércoles
   * 30/09; «Informe» del owner en P1 el miércoles; Otra, sin descripción, en P1
   * el jueves 01/10. «Informe» lleva dos etiquetas: una unión con ellas lo
   * contaría dos veces.
   */
  beforeEach(async () => {
    const otherId = await seedPerson({ accountName: "Otra" });
    p1 = (await seedProject({ workspaceId, name: "P1" })).id;
    const p2 = (await seedProject({ workspaceId, name: "P2" })).id;
    const tagIds = [
      (await seedTag({ workspaceId, name: "E" })).id,
      (await seedTag({ workspaceId, name: "F" })).id,
    ];
    for (const [userId, startedAt, seconds, projectId, description, tags] of [
      [ownerId, "2026-09-29T13:00:00Z", 3600, p1, "Reunión", []],
      [otherId, "2026-09-30T13:00:00Z", 1800, p2, "Reunión", []],
      [ownerId, "2026-09-30T14:00:00Z", 1200, p1, "Informe", tagIds],
      [otherId, "2026-10-01T13:00:00Z", 600, p1, "", []],
    ] as const) {
      await seedClosed(userId, startedAt, seconds, {
        projectId,
        description,
        tagIds: tags,
      });
    }
  });

  it("descripción → proyecto: debajo de «Reunión», P1 y P2 con lo suyo", async () => {
    const state = await readyState(owner, {
      range: lastWeek,
      groupBy: "description",
      subgroups: ["project"],
    });
    expect(outline(state.groups)).toEqual([
      [
        "Reunión",
        5400,
        [
          ["P1", 3600],
          ["P2", 1800],
        ],
      ],
      ["Informe", 1200, [["P1", 1200]]],
      [trackerLabels.noDescription, 600, [["P1", 600]]],
    ]);
    expect(reportReadyState.parse(state)).toEqual(state);
  });

  it("persona → descripción: cada persona con sus textos", async () => {
    const state = await readyState(owner, {
      range: lastWeek,
      groupBy: "person",
      subgroups: ["description"],
    });
    expect(outline(state.groups)).toEqual([
      [
        "Owner",
        4800,
        [
          ["Reunión", 3600],
          ["Informe", 1200],
        ],
      ],
      [
        "Otra",
        2400,
        [
          ["Reunión", 1800],
          [trackerLabels.noDescription, 600],
        ],
      ],
    ]);
  });

  it("proyecto → descripción → fecha: cada fecha cuelga del camino entero", async () => {
    const state = await readyState(owner, {
      range: lastWeek,
      groupBy: "project",
      subgroups: ["description", "date"],
    });
    expect(outline(state.groups)).toEqual([
      [
        "P1",
        5400,
        [
          ["Reunión", 3600, [["2026-09-29", 3600]]],
          ["Informe", 1200, [["2026-09-30", 1200]]],
          [trackerLabels.noDescription, 600, [["2026-10-01", 600]]],
        ],
      ],
      ["P2", 1800, [["Reunión", 1800, [["2026-09-30", 1800]]]]],
    ]);
  });

  it("descripción → proyecto con [P1]: los hijos solo de P1 y el total filtrado", async () => {
    const state = await readyState(owner, {
      range: lastWeek,
      groupBy: "description",
      subgroups: ["project"],
      filters: { ...NO_REPORT_FILTERS, projects: [p1] },
    });
    expect(outline(state.groups)).toEqual([
      ["Reunión", 3600, [["P1", 3600]]],
      ["Informe", 1200, [["P1", 1200]]],
      [trackerLabels.noDescription, 600, [["P1", 600]]],
    ]);
    expect(state.totalSeconds).toBe(5400);
  });
});

/**
 * El primer nivel por descripción que no entra (D-R10-10): una persona con 3001
 * entradas de un minuto, cada una con su descripción, la mitad facturables, el
 * martes 29/09 a las 09:00 de Buenos Aires.
 */
async function seedUncappedDescriptions() {
  await db.execute(sql`
    insert into time_entry (workspace_id, user_id, description, started_at, ended_at, billable)
    select ${workspaceId}, ${ownerId}, 'Entrada ' || n,
           timestamptz '2026-09-29 12:00:00+00',
           timestamptz '2026-09-29 12:01:00+00',
           n % 2 = 0
      from generate_series(1, 3001) as n`);
}

describe("el tope del primer nivel (D-R10-10; criterio 17 de R10)", () => {
  beforeEach(async () => {
    await seedUncappedDescriptions();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Borra una de las 3001: el primer nivel por descripción pasa a 3000 filas. */
  async function deleteOne() {
    await db.execute(sql`
      delete from time_entry
       where workspace_id = ${workspaceId} and description = 'Entrada 3001'`);
  }

  it("por descripción con 3002: levelsShown 0, sin grupos y el total de entryTotals, en la misma transacción", async () => {
    // Una hora con otro texto: ninguna suma de las 3001 filas leídas da el total.
    await seedClosed(ownerId, "2026-09-29T14:00:00Z", 3600, { description: "Informe" });
    const byLevels = vi.spyOn(reportRepository, "totalsByLevels");
    const entryTotals = vi.spyOn(reportRepository, "entryTotals");
    const state = await readyState(owner, { range: lastWeek, groupBy: "description" });
    expect(reportReadyState.parse(state)).toEqual(state);
    expect([state.levelsShown, state.groups]).toEqual([0, []]);
    expect(totalsPair(state)).toEqual([3001 * 60 + 3600, 1500 * 60]);
    expect(byLevels.mock.calls.map(([, read]) => read.limit)).toEqual([3001]);
    expect(entryTotals).toHaveBeenCalledTimes(1);
    const executor = byLevels.mock.calls[0]?.[2];
    expect(executor).toBeDefined();
    expect(executor).not.toBe(db);
    expect(entryTotals.mock.calls[0]?.[2]).toBe(executor);
  });

  it("descripción → proyecto con 3001: una sola lectura por niveles, levelsShown 0 y sin grupos", async () => {
    const byLevels = vi.spyOn(reportRepository, "totalsByLevels");
    const state = await readyState(owner, {
      range: lastWeek,
      groupBy: "description",
      subgroups: ["project"],
    });
    expect(byLevels.mock.calls.map(([, read]) => [read.dimensions, read.limit])).toEqual([
      [["description"], 3001],
    ]);
    expect([state.levelsShown, state.subgroups, state.groups]).toEqual([
      0,
      ["project"],
      [],
    ]);
    expect(state.totalSeconds).toBe(3001 * 60);
  });

  it("con 3000 entra entero: levelsShown 1, 3000 grupos y sin entryTotals", async () => {
    await deleteOne();
    const byLevels = vi.spyOn(reportRepository, "totalsByLevels");
    const entryTotals = vi.spyOn(reportRepository, "entryTotals");
    const state = await readyState(owner, { range: lastWeek, groupBy: "description" });
    expect([state.levelsShown, state.groups.length]).toEqual([1, 3000]);
    expect(state.totalSeconds).toBe(3000 * 60);
    expect(byLevels.mock.calls.map(([, read]) => read.limit)).toEqual([3001]);
    expect(entryTotals).not.toHaveBeenCalled();
  });

  it("descripción → proyecto con 3000: el nivel 2 no se pide y levelsShown es 1", async () => {
    await deleteOne();
    const byLevels = vi.spyOn(reportRepository, "totalsByLevels");
    const state = await readyState(owner, {
      range: lastWeek,
      groupBy: "description",
      subgroups: ["project"],
    });
    expect(byLevels.mock.calls.map(([, read]) => read.dimensions)).toEqual([
      ["description"],
    ]);
    expect([state.levelsShown, state.groups.length]).toEqual([1, 3000]);
    expect(state.groups.some((group) => group.children !== undefined)).toBe(false);
  });

  it("por persona sobre los mismos datos: una fila, con limit 3001 en el nivel 1", async () => {
    const byLevels = vi.spyOn(reportRepository, "totalsByLevels");
    const state = await readyState(owner, { range: lastWeek, groupBy: "person" });
    expect(personRows(state)).toEqual([["Owner", 3001 * 60]]);
    expect(byLevels.mock.calls.map(([, read]) => read.limit)).toEqual([3001]);
  });
});

/** Las barras del gráfico como `[primer día, segundos]`, en orden; `null` sin gráfico. */
function barsOf(state: ReportReadyState) {
  return state.chart === null
    ? null
    : state.chart.bars.map((bar) => [bar.firstDay, bar.seconds]);
}

/** El gráfico de un estado; lanza si no lo tiene. */
function chartOf(state: ReportReadyState) {
  if (state.chart === null) {
    throw new Error("Se esperaba el gráfico.");
  }
  return state.chart;
}

/** Cada día de `days` como `[día, segundos]`: los de `hours`, o 0. */
function dayBars(
  days: readonly string[],
  hours: Readonly<Record<string, number>>,
): [string, number][] {
  return days.map((day) => [day, hours[day] ?? 0]);
}

/** Los siete días de `lastWeek`. */
const lastWeekDays = [
  "2026-09-28",
  "2026-09-29",
  "2026-09-30",
  "2026-10-01",
  "2026-10-02",
  "2026-10-03",
  "2026-10-04",
];

describe("qué suma el gráfico (D-R5-2, D-R5-6, RP-18, RP-33; criterio 4 de R5)", () => {
  it("una persona con horas el martes y el jueves: siete barras en orden, las otras cinco en 0, que suman el total", async () => {
    const memberId = await seedPerson({ accountName: "Marta" });
    // A las 10:00 de Buenos Aires.
    await seedClosed(memberId, "2026-09-29T13:00:00Z", 600);
    await seedClosed(memberId, "2026-10-01T13:00:00Z", 900);
    await seedClosed(ownerId, "2026-09-30T13:00:00Z", 60);
    const state = await readyState(actorIn(workspaceId, memberId), { range: lastWeek });
    expect(state.chart?.granularity).toBe("date");
    expect(barsOf(state)).toEqual(
      dayBars(lastWeekDays, { "2026-09-29": 600, "2026-10-01": 900 }),
    );
    expect(state.totalSeconds).toBe(1500);
    expect(reportReadyState.parse(state)).toEqual(state);
  });

  it("por etiqueta, la entrada de dos etiquetas cuenta una vez: las barras suman el total y las filas más", async () => {
    const e = await seedTag({ workspaceId, name: "E" });
    const f = await seedTag({ workspaceId, name: "F" });
    await seedClosed(ownerId, "2026-09-29T13:00:00Z", 600, { tagIds: [e.id, f.id] });
    await seedClosed(ownerId, "2026-10-01T13:00:00Z", 300);
    const state = await readyState(owner, { range: lastWeek, groupBy: "tag" });
    expect(state.groups.reduce((sum, group) => sum + group.seconds, 0)).toBe(1500);
    expect(state.totalSeconds).toBe(900);
    expect(barsOf(state)).toEqual(
      dayBars(lastWeekDays, { "2026-09-29": 600, "2026-10-01": 300 }),
    );
    expect(reportReadyState.parse(state)).toEqual(state);
  });

  it("con el primer nivel que no entra hay gráfico, y suma el total (D-R10-10)", async () => {
    await seedUncappedDescriptions();
    const state = await readyState(owner, { range: lastWeek, groupBy: "description" });
    expect([state.levelsShown, state.groups]).toEqual([0, []]);
    expect(barsOf(state)).toEqual(dayBars(lastWeekDays, { "2026-09-29": 3001 * 60 }));
    expect(state.totalSeconds).toBe(3001 * 60);
    expect(reportReadyState.parse(state)).toEqual(state);
  });

  describe("con los filtros y las personas", () => {
    let p1: string;
    let otherId: string;

    beforeEach(async () => {
      otherId = await seedPerson({ accountName: "Beto" });
      p1 = (await seedProject({ workspaceId, name: "P1" })).id;
      const p2 = (await seedProject({ workspaceId, name: "P2" })).id;
      await seedClosed(ownerId, "2026-09-29T13:00:00Z", 600, { projectId: p1 });
      await seedClosed(ownerId, "2026-09-30T13:00:00Z", 300, { projectId: p2 });
      await seedClosed(ownerId, "2026-10-01T13:00:00Z", 120);
      await seedClosed(otherId, "2026-10-02T13:00:00Z", 45, { projectId: p1 });
    });

    function filtered(filters: Partial<ReportFilters>) {
      return readyState(owner, {
        range: lastWeek,
        filters: { ...NO_REPORT_FILTERS, ...filters },
      });
    }

    it("con un proyecto, solo lo suyo; con «Sin proyecto», solo lo sin proyecto", async () => {
      expect(barsOf(await filtered({ projects: [p1] }))).toEqual(
        dayBars(lastWeekDays, { "2026-09-29": 600, "2026-10-02": 45 }),
      );
      expect(barsOf(await filtered({ withoutProject: true }))).toEqual(
        dayBars(lastWeekDays, { "2026-10-01": 120 }),
      );
    });

    it("un proyecto que no existe se ignora: el gráfico es el de sin filtro (D-R4-5)", async () => {
      const unfiltered = await filtered({});
      expect(barsOf(unfiltered)).toEqual(
        dayBars(lastWeekDays, {
          "2026-09-29": 600,
          "2026-09-30": 300,
          "2026-10-01": 120,
          "2026-10-02": 45,
        }),
      );
      const ignored = await filtered({ projects: [randomUUID()] });
      expect(ignored.chart).toEqual(unfiltered.chart);
    });

    it("un owner con personas=[B] ve en las barras solo lo de B (D-R4-4)", async () => {
      const state = await filtered({ people: [otherId] });
      expect(barsOf(state)).toEqual(dayBars(lastWeekDays, { "2026-10-02": 45 }));
      expect(reportReadyState.parse(state)).toEqual(state);
    });

    it("un filtro que no deja nada no tiene gráfico", async () => {
      const client = await seedClient({ workspaceId, name: "Vacío" });
      const state = await filtered({ clients: [client.id] });
      expect([state.filters.clients, state.chart]).toEqual([[client.id], null]);
    });
  });

  it("sin entradas en el período no hay gráfico; con una de 0,4 s, todas las barras en 0", async () => {
    expect((await readyState(owner, { range: lastWeek })).chart).toBeNull();
    await seedClosed(ownerId, "2026-09-30T13:00:00Z", 0.4);
    const state = await readyState(owner, { range: lastWeek });
    expect(state.totalSeconds).toBe(0);
    expect(barsOf(state)).toEqual(dayBars(lastWeekDays, {}));
    expect(reportReadyState.parse(state)).toEqual(state);
  });
});

describe("la granularidad en el estado (D-R5-4; criterio 5 de R5)", () => {
  beforeEach(async () => {
    // A las 10:00 de Buenos Aires; la última, hoy a las 09:00.
    await seedClosed(ownerId, "2025-06-10T13:00:00Z", 600);
    await seedClosed(ownerId, "2026-07-15T13:00:00Z", 600);
    await seedClosed(ownerId, "2026-09-15T13:00:00Z", 600);
    await seedClosed(ownerId, "2026-10-08T12:00:00Z", 600);
  });

  /** La granularidad y la cantidad de barras del gráfico de `range`. */
  async function shapeOf(range: ReportRange) {
    const chart = chartOf(await readyState(owner, { range }));
    return [chart.granularity, chart.bars.length];
  }

  it("31 días por día, 32 por semana, 183 por mes, un año y un día en 13 meses y «Hoy» en una barra", async () => {
    expect(await shapeOf({ first: "2026-09-01", last: "2026-10-01" })).toEqual([
      "date",
      31,
    ]);
    expect(await shapeOf({ first: "2026-09-01", last: "2026-10-02" })).toEqual([
      "week",
      5,
    ]);
    expect(await shapeOf({ first: "2026-04-01", last: "2026-09-30" })).toEqual([
      "month",
      6,
    ]);
    expect(await shapeOf({ first: "2025-01-15", last: "2026-01-15" })).toEqual([
      "month",
      13,
    ]);
    const today = await readyState(owner, {
      range: { first: "2026-10-08", last: "2026-10-08" },
    });
    expect(barsOf(today)).toEqual([["2026-10-08", 600]]);
  });

  it("el mismo período por persona, por semana y por Mes → Semana → Fecha da el mismo gráfico", async () => {
    const range = { first: "2026-09-01", last: "2026-10-02" };
    const byPerson = await readyState(owner, { range });
    expect(barsOf(byPerson)).toEqual([
      ["2026-09-01", 0],
      ["2026-09-07", 0],
      ["2026-09-14", 600],
      ["2026-09-21", 0],
      ["2026-09-28", 0],
    ]);
    const byWeek = await readyState(owner, { range, groupBy: "week" });
    const nested = await readyState(owner, {
      range,
      groupBy: "month",
      subgroups: ["week", "date"],
    });
    expect(byWeek.chart).toEqual(byPerson.chart);
    expect(nested.chart).toEqual(byPerson.chart);
  });
});

describe("los cortes, la zona y la semana del gráfico (RP-22, RP-24, ADR 0021; criterio 6 de R5)", () => {
  it("el 30/09 a las 23:30 de Buenos Aires es del 30/09 allí y del 01/10 en Madrid", async () => {
    await seedClosed(ownerId, "2026-10-01T02:30:00Z", 600);
    const inBuenosAires = await readyState(owner, { range: lastWeek });
    expect(barsOf(inBuenosAires)).toEqual(dayBars(lastWeekDays, { "2026-09-30": 600 }));
    const inMadrid = await readyState(
      owner,
      { range: lastWeek },
      { settings: workspaceOf(madrid) },
    );
    expect(barsOf(inMadrid)).toEqual(dayBars(lastWeekDays, { "2026-10-01": 600 }));
  });

  it("en Madrid, el domingo 25/10 de 25 horas lleva las entradas de las 00:30 y de las 23:30", async () => {
    // 00:30 del 25/10, todavía en UTC+2.
    await seedClosed(ownerId, "2026-10-24T22:30:00Z", 60);
    // 23:30 del 25/10, ya en UTC+1: 24 horas después del corte del 25 ya es el 26.
    await seedClosed(ownerId, "2026-10-25T22:30:00Z", 120);
    const state = await readyState(
      owner,
      { range: { first: "2026-10-22", last: "2026-10-28" } },
      { settings: workspaceOf(madrid) },
    );
    expect(barsOf(state)).toEqual(
      dayBars(
        [
          "2026-10-22",
          "2026-10-23",
          "2026-10-24",
          "2026-10-25",
          "2026-10-26",
          "2026-10-27",
          "2026-10-28",
        ],
        { "2026-10-25": 180 },
      ),
    );
  });

  it("por semana, del 30/09 al 15/11: la segunda barra empieza el 05/10 con lunes y el 04/10 con domingo", async () => {
    await seedClosed(ownerId, "2026-10-08T13:00:00Z", 600);
    const range = { first: "2026-09-30", last: "2026-11-15" };
    /** Las dos primeras barras como `[primer día, rótulo, partial]`. */
    function firstTwo(state: ReportReadyState) {
      return chartOf(state)
        .bars.slice(0, 2)
        .map((bar) => [bar.firstDay, bar.label, bar.partial]);
    }
    expect(firstTwo(await readyState(owner, { range }))).toEqual([
      ["2026-09-30", "28/09 – 04/10", "30/09 – 04/10"],
      ["2026-10-05", "05/10 – 11/10", null],
    ]);
    expect(
      firstTwo(
        await readyState(owner, { range }, { settings: workspaceOf(buenosAires, 0) }),
      ),
    ).toEqual([
      ["2026-09-30", "27/09 – 03/10", "30/09 – 03/10"],
      ["2026-10-04", "04/10 – 10/10", null],
    ]);
  });

  it("por semana, las barras con horas tienen el rótulo, el partial y los segundos de las filas de [week]", async () => {
    await seedClosed(ownerId, "2026-09-30T13:00:00Z", 3600);
    await seedClosed(ownerId, "2026-10-08T13:00:00Z", 900);
    await seedClosed(ownerId, "2026-11-10T13:00:00Z", 1800);
    const state = await readyState(owner, {
      range: { first: "2026-09-30", last: "2026-11-10" },
      groupBy: "week",
    });
    const withHours = chartOf(state)
      .bars.filter((bar) => bar.seconds > 0)
      .map((bar) => [bar.label, bar.partial, bar.seconds]);
    expect(withHours).toEqual([
      ["28/09 – 04/10", "30/09 – 04/10", 3600],
      ["05/10 – 11/10", null, 900],
      ["09/11 – 15/11", "09/11 – 10/11", 1800],
    ]);
    expect(withHours).toEqual(
      state.groups.map((group) =>
        group.kind === "week" ? [group.label, group.partial, group.seconds] : ["?"],
      ),
    );
  });

  it("en Pacific/Apia, el 30/12/2011 tiene su barra en 0 y la entrada del 31/12 está en la del 31/12", async () => {
    // El 31/12/2011 a las 12:00 en Apia (UTC+14).
    await seedClosed(ownerId, "2011-12-30T22:00:00Z", 300);
    const state = await readyState(
      owner,
      { range: { first: "2011-12-23", last: "2012-01-12" } },
      { settings: workspaceOf("Pacific/Apia") },
    );
    const chart = chartOf(state);
    expect([chart.granularity, chart.bars.length]).toEqual(["date", 21]);
    expect(
      chart.bars
        .filter((bar) => bar.firstDay === "2011-12-30" || bar.firstDay === "2011-12-31")
        .map((bar) => [bar.firstDay, bar.label, bar.seconds]),
    ).toEqual([
      ["2011-12-30", "vie, 30/12/2011", 0],
      ["2011-12-31", "sáb, 31/12/2011", 300],
    ]);
  });
});

describe("los rótulos y las marcas del gráfico (D-R5-5; criterio 7 de R5)", () => {
  /** Las barras como `[primer día, rótulo, partial, marca]`. */
  function labelsOf(state: ReportReadyState) {
    return chartOf(state).bars.map((bar) => [
      bar.firstDay,
      bar.label,
      bar.partial,
      bar.tick,
    ]);
  }

  it("por día: el rótulo de la fecha sin «Hoy» ni «Ayer», sin partial y la marca sin año", async () => {
    await seedClosed(ownerId, "2026-09-30T13:00:00Z", 600);
    const range = { first: "2026-09-30", last: "2026-10-08" };
    expect(labelsOf(await readyState(owner, { range }))).toEqual([
      ["2026-09-30", "mié, 30/09", null, "30/09"],
      ["2026-10-01", "jue, 01/10", null, "01/10"],
      ["2026-10-02", "vie, 02/10", null, "02/10"],
      ["2026-10-03", "sáb, 03/10", null, "03/10"],
      ["2026-10-04", "dom, 04/10", null, "04/10"],
      ["2026-10-05", "lun, 05/10", null, "05/10"],
      ["2026-10-06", "mar, 06/10", null, "06/10"],
      ["2026-10-07", "mié, 07/10", null, "07/10"],
      ["2026-10-08", "jue, 08/10", null, "08/10"],
    ]);
    const nextYear = await readyState(
      owner,
      { range },
      { now: new Date("2027-01-10T15:00:00Z") },
    );
    expect(labelsOf(nextYear)[0]).toEqual([
      "2026-09-30",
      "mié, 30/09/2026",
      null,
      "30/09",
    ]);
    const isoDates = await readyState(
      owner,
      { range },
      {
        settings: { ...settings, formats: { time: "24h", date: "yyyy-MM-dd" } },
      },
    );
    expect(chartOf(isoDates).bars[0]?.tick).toBe("09-30");
  });

  it("por semana con lunes, del 30/09 al 10/11: la primera y la última con partial y la marca del primer día que cuentan", async () => {
    await seedClosed(ownerId, "2026-09-30T13:00:00Z", 600);
    const state = await readyState(owner, {
      range: { first: "2026-09-30", last: "2026-11-10" },
    });
    expect(chartOf(state).granularity).toBe("week");
    expect(labelsOf(state)).toEqual([
      ["2026-09-30", "28/09 – 04/10", "30/09 – 04/10", "30/09"],
      ["2026-10-05", "05/10 – 11/10", null, "05/10"],
      ["2026-10-12", "12/10 – 18/10", null, "12/10"],
      ["2026-10-19", "19/10 – 25/10", null, "19/10"],
      ["2026-10-26", "26/10 – 01/11", null, "26/10"],
      ["2026-11-02", "02/11 – 08/11", null, "02/11"],
      ["2026-11-09", "09/11 – 15/11", "09/11 – 10/11", "09/11"],
    ]);
  });

  it("por mes, del 15/09/2025 al 31/03/2026: el año en el rótulo si no es el de hoy y la marca abreviada", async () => {
    await seedClosed(ownerId, "2025-10-10T13:00:00Z", 600);
    const state = await readyState(owner, {
      range: { first: "2025-09-15", last: "2026-03-31" },
    });
    expect(chartOf(state).granularity).toBe("month");
    expect(labelsOf(state)).toEqual([
      ["2025-09-15", "septiembre de 2025", "15/09/2025 – 30/09/2025", "sep"],
      ["2025-10-01", "octubre de 2025", null, "oct"],
      ["2025-11-01", "noviembre de 2025", null, "nov"],
      ["2025-12-01", "diciembre de 2025", null, "dic"],
      ["2026-01-01", "enero", null, "ene"],
      ["2026-02-01", "febrero", null, "feb"],
      ["2026-03-01", "marzo", null, "mar"],
    ]);
  });
});

describe("la misma foto del gráfico (ADR 0021, D-R5-2, D-R5-3; criterio 8 de R5)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Los espías de la transacción y de las tres lecturas del reporte. */
  function spies() {
    return {
      transaction: vi.spyOn(db, "transaction"),
      byLevels: vi.spyOn(reportRepository, "totalsByLevels"),
      byBucket: vi.spyOn(reportRepository, "totalsByBucket"),
      entryTotals: vi.spyOn(reportRepository, "entryTotals"),
    };
  }

  /** Que cada lectura usó el mismo `Executor`, el de la única transacción `repeatable read`, `read only`. */
  function expectOneSnapshot(spied: ReturnType<typeof spies>) {
    expect(spied.transaction).toHaveBeenCalledTimes(1);
    expect(spied.transaction.mock.calls[0]?.[1]).toEqual({
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
    const executors = [
      ...spied.byLevels.mock.calls.map((call) => call[2]),
      ...spied.entryTotals.mock.calls.map((call) => call[2]),
      ...spied.byBucket.mock.calls.map((call) => call[2]),
    ];
    expect(executors[0]).toBeDefined();
    expect(executors[0]).not.toBe(db);
    expect(executors.every((executor) => executor === executors[0])).toBe(true);
  }

  it("una lectura con la granularidad, los tramos del span, el filtro efectivo y el alcance angostado de los niveles", async () => {
    const otherId = await seedPerson({ accountName: "Beto" });
    const p1 = (await seedProject({ workspaceId, name: "P1" })).id;
    await seedClosed(otherId, "2026-09-29T13:00:00Z", 600, { projectId: p1 });
    const spied = spies();
    const state = await readyState(owner, {
      range: lastWeek,
      filters: { ...NO_REPORT_FILTERS, people: [otherId], projects: [randomUUID(), p1] },
    });
    expect(barsOf(state)).toEqual(dayBars(lastWeekDays, { "2026-09-29": 600 }));
    expectOneSnapshot(spied);
    expect(spied.byBucket).toHaveBeenCalledTimes(1);
    expect(spied.byLevels).toHaveBeenCalledTimes(1);
    const [bucketScope, bucketRead] = spied.byBucket.mock.calls[0] ?? [];
    const [levelScope, levelRead] = spied.byLevels.mock.calls[0] ?? [];
    expect(bucketScope).toBe(levelScope);
    expect(bucketScope?.people).toEqual({ kind: "chosen", userIds: [otherId] });
    expect(bucketRead?.granularity).toBe("date");
    expect(bucketRead?.span).toEqual(levelRead?.span);
    expect(bucketRead?.buckets.buckets[0]?.start).toEqual(bucketRead?.span.from);
    expect(bucketRead?.buckets.end).toEqual(bucketRead?.span.to);
    expect(bucketRead?.buckets.buckets.map((bucket) => bucket.firstDay)).toEqual(
      lastWeekDays,
    );
    expect(bucketRead?.filter).toEqual({
      projectIds: [p1],
      withoutProject: false,
      clientIds: [],
    });
    expect(bucketRead?.filter).toEqual(levelRead?.filter);
  });

  it("con la etiqueta primero, una lectura más además de los niveles y el total", async () => {
    await seedClosed(ownerId, "2026-09-29T13:00:00Z", 600);
    const spied = spies();
    await readyState(owner, { range: lastWeek, groupBy: "tag" });
    expect([
      spied.byLevels.mock.calls.length,
      spied.entryTotals.mock.calls.length,
      spied.byBucket.mock.calls.length,
    ]).toEqual([1, 1, 1]);
    expectOneSnapshot(spied);
  });

  it("con el primer nivel cortado, una lectura más además del nivel 1 y del total", async () => {
    await seedUncappedDescriptions();
    const spied = spies();
    await readyState(owner, { range: lastWeek, groupBy: "description" });
    expect([
      spied.byLevels.mock.calls.length,
      spied.entryTotals.mock.calls.length,
      spied.byBucket.mock.calls.length,
    ]).toEqual([1, 1, 1]);
    expectOneSnapshot(spied);
  });

  it("con el primer nivel de la misma dimensión que el gráfico, también lo lee aparte", async () => {
    await seedClosed(ownerId, "2026-09-29T13:00:00Z", 600);
    const byDate = spies();
    await readyState(owner, { range: lastWeek, groupBy: "date" });
    expect(byDate.byLevels.mock.calls.map(([, read]) => read.dimensions)).toEqual([
      ["date"],
    ]);
    expect(byDate.byBucket.mock.calls.map(([, read]) => read.granularity)).toEqual([
      "date",
    ]);
    expectOneSnapshot(byDate);
    vi.restoreAllMocks();

    const byWeek = spies();
    await readyState(owner, {
      range: { first: "2026-09-30", last: "2026-11-15" },
      groupBy: "week",
    });
    expect(byWeek.byLevels.mock.calls.map(([, read]) => read.dimensions)).toEqual([
      ["week"],
    ]);
    expect(byWeek.byBucket.mock.calls.map(([, read]) => read.granularity)).toEqual([
      "week",
    ]);
    expectOneSnapshot(byWeek);
  });
});

describe("las guardas de totalsByBucket (D-R5-3; criterio 9 de R5)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("con tramos vacíos, que no cubren el span o un filtro de más lanza RangeError sin consultar, con db y con el Executor de una transacción", async () => {
    const { scope, span, buckets } = await realLevelRead();
    const [first] = buckets.buckets;
    if (first === undefined) {
      throw new Error("Se esperaban los tramos de la semana.");
    }
    const shifted = (instant: Date) => new Date(instant.getTime() + 1000);
    const filter = NO_ENTRY_FILTER;
    await expect(
      reportRepository.totalsByBucket(scope, {
        span,
        filter,
        granularity: "date",
        buckets,
      }),
    ).resolves.toEqual(expect.any(Array));
    const invalid = [
      { span, filter, granularity: "date", buckets: { buckets: [], end: buckets.end } },
      {
        span,
        filter,
        granularity: "date",
        buckets: {
          buckets: [
            { ...first, start: shifted(first.start) },
            ...buckets.buckets.slice(1),
          ],
          end: buckets.end,
        },
      },
      {
        span,
        filter,
        granularity: "date",
        buckets: { ...buckets, end: shifted(buckets.end) },
      },
      {
        span,
        filter,
        granularity: "month",
        buckets: monthBuckets(lastWeek.first, "2026-10-03", buenosAires),
      },
      {
        span,
        filter: {
          ...filter,
          projectIds: Array.from({ length: REPORT_MAX_FILTER_VALUES + 1 }, () =>
            randomUUID(),
          ),
        },
        granularity: "date",
        buckets,
      },
    ] as const;

    const select = vi.spyOn(db, "select");
    for (const read of invalid) {
      await expect(reportRepository.totalsByBucket(scope, read)).rejects.toThrow(
        RangeError,
      );
    }
    expect(select).not.toHaveBeenCalled();

    await db.transaction(async (tx) => {
      const txSelect = vi.spyOn(tx, "select");
      for (const read of invalid) {
        await expect(reportRepository.totalsByBucket(scope, read, tx)).rejects.toThrow(
          RangeError,
        );
      }
      expect(txSelect).not.toHaveBeenCalled();
    });
    expect(select).not.toHaveBeenCalled();
  });
});

/** El pedido entero, con lo que falte en su valor por omisión. */
function fullRequest(request: Partial<ReportRequest>): ReportRequest {
  return {
    range: request.range ?? null,
    groupBy: request.groupBy ?? null,
    subgroups: request.subgroups ?? [],
    filters: request.filters ?? NO_REPORT_FILTERS,
    peopleWithoutTime: request.peopleWithoutTime ?? false,
  };
}

/** La exportación lista de un pedido; lanza si no llega `ready`. */
async function readyExport(
  actor: Actor,
  request: Partial<ReportRequest> = {},
  options: { readonly settings?: TimeSettings; readonly now?: Date } = {},
) {
  const state = await getReportExport(
    actor,
    options.settings ?? settings,
    fullRequest(request),
    options.now ?? readNow,
  );
  if (state.kind !== "ready") {
    throw new Error(`Se esperaba la exportación y llegó ${state.kind}.`);
  }
  return state;
}

/** Las filas listadas; lanza con `tooMany`. */
function listedRows(entries: ReportExportEntries): readonly ReportEntryRow[] {
  if (entries.kind !== "listed") {
    throw new Error(`Se esperaban las entradas y llegó ${entries.kind}.`);
  }
  return entries.rows.map((row) => reportEntryRow.parse(row));
}

function secondsSum(rows: readonly { readonly seconds: number }[]): number {
  return rows.reduce((sum, row) => sum + row.seconds, 0);
}

/** `count` entradas de un minuto del owner, el martes 29/09 a las 09:00 de Buenos Aires. */
async function seedMinutes(count: number) {
  await db.execute(sql`
    insert into time_entry (workspace_id, user_id, started_at, ended_at, billable)
    select ${workspaceId}, ${ownerId},
           timestamptz '2026-09-29 12:00:00+00',
           timestamptz '2026-09-29 12:01:00+00',
           false
      from generate_series(1, ${count}) as n`);
}

describe("la lectura de las entradas (D-R6-3; criterio 4 de R6)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** La lectura de la semana anterior del owner, sin filtros, con un tope que no corta. */
  async function ownerListRead() {
    const { scope, span } = await realLevelRead();
    return { scope, read: { span, filter: NO_ENTRY_FILTER, limit: 100 } };
  }

  it("una fila por entrada con todo: el proyecto y su cliente, la tarea, las dos etiquetas y la descripción entera", async () => {
    const acme = await seedClient({ workspaceId, name: "ACME" });
    const web = await seedProject({ workspaceId, name: "Web", clientId: acme.id });
    const design = await seedTask({ workspaceId, projectId: web.id, name: "Diseño" });
    const beta = await seedTag({ workspaceId, name: "Beta" });
    const alfa = await seedTag({ workspaceId, name: "alfa" });
    const description = "x".repeat(2999) + "ñ";
    const entry = await seedClosed(ownerId, "2026-09-29T13:00:00Z", 5400, {
      projectId: web.id,
      taskId: design.id,
      billable: true,
      tagIds: [beta.id, alfa.id],
      description,
    });
    const { scope, read } = await ownerListRead();

    const rows = await reportRepository.entryList(scope, read);

    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect({ ...row, tags: undefined }).toEqual({
      id: entry.id,
      startedAt: new Date("2026-09-29T13:00:00Z"),
      endedAt: new Date("2026-09-29T14:30:00Z"),
      seconds: 5400,
      userId: ownerId,
      accountName: "Owner",
      displayName: null,
      status: "active",
      projectName: "Web",
      clientName: "ACME",
      taskName: "Diseño",
      description,
      billable: true,
      tags: undefined,
    });
    expect(row?.description).toHaveLength(3000);
    expect(
      [...(row?.tags ?? [])].sort((left, right) => left.id.localeCompare(right.id)),
    ).toEqual(
      [
        { id: beta.id, name: "Beta" },
        { id: alfa.id, name: "alfa" },
      ].sort((left, right) => left.id.localeCompare(right.id)),
    );
  });

  it("sin proyecto, proyecto, cliente y tarea nulos; con un proyecto sin cliente, el cliente nulo", async () => {
    const loose = await seedProject({ workspaceId, name: "Suelto" });
    const without = await seedClosed(ownerId, "2026-09-29T13:00:00Z", 60);
    const clientless = await seedClosed(ownerId, "2026-09-29T14:00:00Z", 120, {
      projectId: loose.id,
    });
    const { scope, read } = await ownerListRead();

    const rows = await reportRepository.entryList(scope, read);
    const byId = new Map(rows.map((row) => [row.id, row]));

    expect(rows).toHaveLength(2);
    const withoutRow = byId.get(without.id);
    expect([
      withoutRow?.projectName,
      withoutRow?.clientName,
      withoutRow?.taskName,
    ]).toEqual([null, null, null]);
    expect(withoutRow?.tags).toEqual([]);
    expect(withoutRow?.description).toBe("");
    const clientlessRow = byId.get(clientless.id);
    expect([
      clientlessRow?.projectName,
      clientlessRow?.clientName,
      clientlessRow?.taskName,
    ]).toEqual(["Suelto", null, null]);
  });

  it("el timer en curso no viene; la que empieza un milisegundo antes del fin sí y la que empieza en el fin no", async () => {
    const { scope, read } = await ownerListRead();
    await seedTimeEntry({
      workspaceId,
      userId: ownerId,
      startedAt: "2026-09-29T13:00:00Z",
    });
    const lastMillisecond = await seedTimeEntry({
      workspaceId,
      userId: ownerId,
      startedAt: new Date(read.span.to.getTime() - 1),
      endedAt: new Date(read.span.to.getTime() + 60_000),
    });
    await seedTimeEntry({
      workspaceId,
      userId: ownerId,
      startedAt: read.span.to,
      endedAt: new Date(read.span.to.getTime() + 60_000),
    });

    const rows = await reportRepository.entryList(scope, read);

    expect(rows.map((row) => row.id)).toEqual([lastMillisecond.id]);
  });

  it("la suma de seconds es la de entryTotals, con microsegundos, sin filtros, con un proyecto, con «Sin proyecto» y con un cliente", async () => {
    const acme = await seedClient({ workspaceId, name: "ACME" });
    const web = await seedProject({ workspaceId, name: "Web", clientId: acme.id });
    const loose = await seedProject({ workspaceId, name: "Suelto" });
    const day = "2026-09-30";
    await seedExact(
      ownerId,
      `${day} 10:00:00.000900-03`,
      `${day} 10:00:01.000500-03`,
      true,
      {
        projectId: web.id,
      },
    );
    await seedExact(
      ownerId,
      `${day} 11:00:00.000500-03`,
      `${day} 11:00:01.000400-03`,
      false,
    );
    await seedExact(ownerId, `${day} 12:00:00-03`, `${day} 12:00:01.5-03`, true, {
      projectId: loose.id,
    });
    await seedExact(ownerId, `${day} 13:00:00.75-03`, `${day} 13:00:02.25-03`, false, {
      projectId: web.id,
    });
    const { scope, read } = await ownerListRead();
    const filters = [
      NO_ENTRY_FILTER,
      { ...NO_ENTRY_FILTER, projectIds: [web.id] },
      { ...NO_ENTRY_FILTER, withoutProject: true },
      { ...NO_ENTRY_FILTER, clientIds: [acme.id] },
    ];

    const sums = [];
    for (const filter of filters) {
      const rows = await reportRepository.entryList(scope, { ...read, filter });
      const totals = await reportRepository.entryTotals(scope, {
        span: read.span,
        filter,
      });
      sums.push([rows.length, secondsSum(rows), totals.seconds]);
    }

    expect(sums).toEqual([
      [4, 4, 4],
      [2, 2, 2],
      [1, 1, 1],
      [2, 2, 2],
    ]);
  });

  it("con tres entradas y limit 2, dos filas", async () => {
    await seedClosed(ownerId, "2026-09-29T13:00:00Z", 60);
    await seedClosed(ownerId, "2026-09-29T14:00:00Z", 60);
    await seedClosed(ownerId, "2026-09-29T15:00:00Z", 60);
    const { scope, read } = await ownerListRead();

    const rows = await reportRepository.entryList(scope, { ...read, limit: 2 });

    expect(rows).toHaveLength(2);
  });

  it("lanza RangeError sin consultar con 51 proyectos en el filtro y con limit 0, -1 y 1,5", async () => {
    const { scope, read } = await ownerListRead();
    const invalid = [
      {
        ...read,
        filter: {
          ...NO_ENTRY_FILTER,
          projectIds: Array.from({ length: REPORT_MAX_FILTER_VALUES + 1 }, () =>
            randomUUID(),
          ),
        },
      },
      { ...read, limit: 0 },
      { ...read, limit: -1 },
      { ...read, limit: 1.5 },
    ];

    const select = vi.spyOn(db, "select");
    for (const listRead of invalid) {
      await expect(reportRepository.entryList(scope, listRead)).rejects.toThrow(
        RangeError,
      );
    }
    expect(select).not.toHaveBeenCalled();
  });
});

describe("la exportación (D-R6-2, D-R6-3; criterio 5 de R6)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("report es el de getReportState con tres niveles, filtros y personas", async () => {
    const otherId = await seedPerson({ accountName: "Beto" });
    const acme = await seedClient({ workspaceId, name: "ACME" });
    const web = await seedProject({ workspaceId, name: "Web", clientId: acme.id });
    const label = await seedTag({ workspaceId, name: "Etiqueta" });
    await seedClosed(otherId, "2026-09-29T13:00:00Z", 600, {
      projectId: web.id,
      tagIds: [label.id],
    });
    await seedClosed(ownerId, "2026-09-30T13:00:00Z", 900, { projectId: web.id });
    await seedClosed(otherId, "2026-10-01T13:00:00Z", 300);
    const request: Partial<ReportRequest> = {
      range: lastWeek,
      groupBy: "project",
      subgroups: ["person", "tag"],
      filters: {
        ...NO_REPORT_FILTERS,
        people: [otherId],
        projects: [web.id],
        clients: [acme.id],
      },
    };

    const exported = await readyExport(owner, request);

    expect(exported.report).toEqual(await readyState(owner, request));
    expect(listedRows(exported.entries).map((row) => row.seconds)).toEqual([600]);
  });

  it("con el primer nivel cortado, report es el de getReportState y las entradas se listan igual", async () => {
    await seedUncappedDescriptions();
    const request: Partial<ReportRequest> = { range: lastWeek, groupBy: "description" };

    const exported = await readyExport(owner, request);

    expect(exported.report).toEqual(await readyState(owner, request));
    expect(exported.report.levelsShown).toBe(0);
    const rows = listedRows(exported.entries);
    expect(rows).toHaveLength(3001);
    expect(secondsSum(rows)).toBe(exported.report.totalSeconds);
  });

  it("en orden de inicio y, con el mismo inicio, de id; la suma es totalSeconds, también por etiqueta", async () => {
    const ids = [randomUUID(), randomUUID(), randomUUID()].sort();
    const alfa = await seedTag({ workspaceId, name: "alfa" });
    const beta = await seedTag({ workspaceId, name: "Beta" });
    await seedClosed(ownerId, "2026-09-30T13:00:00Z", 60);
    const sameStart = new Date("2026-09-29T13:00:00Z");
    for (const id of [ids[2], ids[0], ids[1]]) {
      await seedTimeEntry({
        id,
        workspaceId,
        userId: ownerId,
        startedAt: sameStart,
        endedAt: new Date(sameStart.getTime() + 120_000),
        tagIds: id === ids[0] ? [alfa.id, beta.id] : [],
      });
    }
    await seedClosed(ownerId, "2026-09-28T13:00:00Z", 30);

    const byPerson = await readyExport(owner, { range: lastWeek });
    const byTag = await readyExport(owner, { range: lastWeek, groupBy: "tag" });

    const rows = listedRows(byPerson.entries);
    expect(rows.map((row) => [row.startDay, row.startClock, row.seconds])).toEqual([
      ["2026-09-28", "10:00", 30],
      ["2026-09-29", "10:00", 120],
      ["2026-09-29", "10:00", 120],
      ["2026-09-29", "10:00", 120],
      ["2026-09-30", "10:00", 60],
    ]);
    expect(rows.slice(1, 4).map((row) => row.id)).toEqual(ids);
    expect(secondsSum(rows)).toBe(byPerson.report.totalSeconds);
    expect(secondsSum(listedRows(byTag.entries))).toBe(byTag.report.totalSeconds);
    expect(byTag.report.totalSeconds).toBe(30 + 3 * 120 + 60);
  });

  it("el día y la hora en la zona de quien mira: Buenos Aires y Madrid, y el fin al día siguiente", async () => {
    // 23:30 del 30/09 en Buenos Aires, 04:30 del 01/10 en Madrid; dura una hora.
    await seedClosed(ownerId, "2026-10-01T02:30:00Z", 3600);

    const fromBuenosAires = listedRows(
      (await readyExport(owner, { range: lastWeek })).entries,
    );
    const fromMadrid = listedRows(
      (await readyExport(owner, { range: lastWeek }, { settings: workspaceOf(madrid) }))
        .entries,
    );

    const timesOf = (row: ReportEntryRow | undefined) => [
      row?.startDay,
      row?.startClock,
      row?.endDay,
      row?.endClock,
    ];
    expect(fromBuenosAires.map(timesOf)).toEqual([
      ["2026-09-30", "23:30", "2026-10-01", "00:30"],
    ]);
    expect(fromMadrid.map(timesOf)).toEqual([
      ["2026-10-01", "04:30", "2026-10-01", "05:30"],
    ]);
  });

  it("la persona con su nombre editado e inactive con la membresía inactiva; las etiquetas por nombre", async () => {
    const inactiveId = await seedPerson({
      accountName: "Inés Cuenta",
      displayName: "Inés",
      status: "inactive",
    });
    // Ids fijos y la unión sembrada con «Beta» antes que «alfa»: sin ordenar,
    // `json_agg` las da «Beta, alfa» por la clave de `time_entry_tag` y por el
    // orden de inserción, como un orden por código.
    const betaId = "00000000-0000-4000-8000-00000000000b";
    const alfaId = "00000000-0000-4000-8000-00000000000c";
    await db.insert(tag).values([
      { id: alfaId, workspaceId, name: "alfa" },
      { id: betaId, workspaceId, name: "Beta" },
    ]);
    await seedClosed(inactiveId, "2026-09-29T13:00:00Z", 600, {
      tagIds: [betaId, alfaId],
    });
    await seedClosed(ownerId, "2026-09-30T13:00:00Z", 600);

    const rows = listedRows((await readyExport(owner, { range: lastWeek })).entries);

    expect(rows.map((row) => [row.person, row.tags])).toEqual([
      [{ name: "Inés", inactive: true }, ["alfa", "Beta"]],
      [{ name: "Owner", inactive: false }, []],
    ]);
  });

  it("con REPORT_EXPORT_MAX_ENTRIES entradas, listed con todas; con una más, tooMany sin listarlas, y report igual en los dos", async () => {
    await seedMinutes(REPORT_EXPORT_MAX_ENTRIES);
    const atLimit = await readyExport(owner, { range: lastWeek });
    expect(listedRows(atLimit.entries)).toHaveLength(REPORT_EXPORT_MAX_ENTRIES);
    expect(atLimit.report).toEqual(await readyState(owner, { range: lastWeek }));
    expect(atLimit.report.totalSeconds).toBe(REPORT_EXPORT_MAX_ENTRIES * 60);

    await seedMinutes(1);
    const entryList = vi.spyOn(reportRepository, "entryList");
    const overLimit = await readyExport(owner, { range: lastWeek });
    expect(overLimit.entries).toEqual({ kind: "tooMany" });
    // S1: la lectura de agregados ya lo dijo.
    expect(entryList).not.toHaveBeenCalled();
    expect(overLimit.report).toEqual(await readyState(owner, { range: lastWeek }));
    expect(overLimit.report.totalSeconds).toBe((REPORT_EXPORT_MAX_ENTRIES + 1) * 60);
  });

  it("la misma foto: una llamada a entryList en el Executor de la transacción, con MAX + 1, el filtro efectivo y el alcance angostado", async () => {
    const otherId = await seedPerson({ accountName: "Beto" });
    const web = (await seedProject({ workspaceId, name: "Web" })).id;
    await seedClosed(otherId, "2026-09-29T13:00:00Z", 600, { projectId: web });
    await seedClosed(ownerId, "2026-09-29T14:00:00Z", 900, { projectId: web });
    const transaction = vi.spyOn(db, "transaction");
    const byLevels = vi.spyOn(reportRepository, "totalsByLevels");
    const entryTotals = vi.spyOn(reportRepository, "entryTotals");
    const byBucket = vi.spyOn(reportRepository, "totalsByBucket");
    const entryList = vi.spyOn(reportRepository, "entryList");
    const entryListSize = vi.spyOn(reportRepository, "entryListSize");

    const exported = await readyExport(owner, {
      range: lastWeek,
      groupBy: "tag",
      filters: { ...NO_REPORT_FILTERS, people: [otherId], projects: [randomUUID(), web] },
    });

    expect(listedRows(exported.entries).map((row) => row.seconds)).toEqual([600]);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0]?.[1]).toEqual({
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
    expect(entryList).toHaveBeenCalledTimes(1);
    const [listScope, listRead, listExecutor] = entryList.mock.calls[0] ?? [];
    const [levelScope, levelRead, levelExecutor] = byLevels.mock.calls[0] ?? [];
    expect(listExecutor).toBeDefined();
    expect(listExecutor).not.toBe(db);
    expect(entryListSize).toHaveBeenCalledTimes(1);
    const [sizeScope, sizeRead, sizeExecutor] = entryListSize.mock.calls[0] ?? [];
    expect([
      levelExecutor,
      entryTotals.mock.calls[0]?.[2],
      byBucket.mock.calls[0]?.[2],
      sizeExecutor,
    ]).toEqual([listExecutor, listExecutor, listExecutor, listExecutor]);
    expect(sizeScope).toBe(levelScope);
    expect(sizeRead).toEqual({ span: levelRead?.span, filter: levelRead?.filter });
    expect(listScope).toBe(levelScope);
    expect(listScope?.people).toEqual({ kind: "chosen", userIds: [otherId] });
    expect(listRead).toEqual({
      span: levelRead?.span,
      filter: { projectIds: [web], withoutProject: false, clientIds: [] },
      limit: REPORT_EXPORT_MAX_ENTRIES + 1,
    });
  });

  it("getReportState no llama a entryList ni a entryListSize", async () => {
    await seedClosed(ownerId, "2026-09-29T13:00:00Z", 600);
    const entryList = vi.spyOn(reportRepository, "entryList");
    const entryListSize = vi.spyOn(reportRepository, "entryListSize");
    for (const groupBy of REPORT_GROUP_BYS) {
      await readyState(owner, { range: lastWeek, groupBy });
    }
    expect(entryList).not.toHaveBeenCalled();
    expect(entryListSize).not.toHaveBeenCalled();
  });

  it("sin report.view, forbidden y ninguna lectura; con él, generatedAt es now", async () => {
    const inactiveId = await seedPerson({ accountName: "Inés", status: "inactive" });
    const transaction = vi.spyOn(db, "transaction");
    const entryList = vi.spyOn(reportRepository, "entryList");

    const denied = await getReportExport(
      actorIn(workspaceId, inactiveId, { status: "inactive" }),
      settings,
      fullRequest({ range: lastWeek }),
      readNow,
    );

    expect(denied).toEqual({ kind: "forbidden" });
    expect(transaction).not.toHaveBeenCalled();
    expect(entryList).not.toHaveBeenCalled();
    expect((await readyExport(owner, { range: lastWeek })).generatedAt).toEqual(readNow);
  });
});

describe("la cota de las entradas antes de listarlas (S1 y S2 de las revisiones de R6a)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** 100 emojis de 4 bytes: el nombre más largo que admite la base, 400 bytes. */
  const longName = "😀".repeat(100);

  /**
   * Entradas del owner («Owner», 5 bytes) cuya cota de bytes es
   * `REPORT_EXPORT_MAX_BYTES - 1 + padding`. Todas van en un proyecto, su
   * cliente y una tarea de 400 bytes cada uno, con las etiquetas «alfa» y
   * «beta» (4 + 4 y un «, » de 2): 80 fijos + 5 + 1200 + 10 = 1295 por línea.
   * Son 300 con 3000 emojis de descripción (12 000 bytes; 13 295 por línea) y
   * una con 2551 emojis y `padding` letras (10 204 + `padding`). Sin
   * cualquiera de los sumandos, la cota baja al menos 301 bytes.
   */
  async function seedNearByteLimit(padding: number) {
    const acme = await seedClient({ workspaceId, name: longName });
    const web = await seedProject({ workspaceId, name: longName, clientId: acme.id });
    const design = await seedTask({ workspaceId, projectId: web.id, name: longName });
    await seedTag({ workspaceId, name: "alfa" });
    await seedTag({ workspaceId, name: "beta" });
    await db.execute(sql`
      insert into time_entry (workspace_id, user_id, description, started_at, ended_at, project_id, task_id, billable)
      select ${workspaceId}, ${ownerId}, repeat('😀', 3000),
             timestamptz '2026-09-29 12:00:00+00',
             timestamptz '2026-09-29 12:01:00+00',
             ${web.id}, ${design.id}, false
        from generate_series(1, 300)`);
    await seedClosed(ownerId, "2026-09-29T13:00:00Z", 600, {
      projectId: web.id,
      taskId: design.id,
      description: "😀".repeat(2551) + "x".repeat(padding),
    });
    await db.execute(sql`
      insert into time_entry_tag (workspace_id, time_entry_id, tag_id)
      select time_entry.workspace_id, time_entry.id, tag.id
        from time_entry
        join tag on tag.workspace_id = time_entry.workspace_id
       where time_entry.workspace_id = ${workspaceId}
         and time_entry.user_id = ${ownerId}`);
  }

  it("la cuenta del fixture llega al tope con una letra", () => {
    expect(
      300 * (80 + 5 + 3 * 400 + 10 + 12_000) + 80 + 5 + 3 * 400 + 10 + 2551 * 4,
    ).toBe(REPORT_EXPORT_MAX_BYTES - 1);
  });

  it("con nombres largos de proyecto, cliente y tarea y la cota pasada por uno, tooMany sin llamar a entryList", async () => {
    await seedNearByteLimit(2);
    const entryList = vi.spyOn(reportRepository, "entryList");

    const exported = await readyExport(owner, { range: lastWeek });

    expect(exported.entries).toEqual({ kind: "tooMany" });
    expect(entryList).not.toHaveBeenCalled();
    expect(exported.report).toEqual(await readyState(owner, { range: lastWeek }));
  });

  it("con la cota justo en el tope, listed", async () => {
    await seedNearByteLimit(1);

    const exported = await readyExport(owner, { range: lastWeek });

    const rows = listedRows(exported.entries);
    expect(rows).toHaveLength(301);
    expect(rows.at(-1)?.tags).toEqual(["alfa", "beta"]);
  });

  it("lo ajeno no cuenta en la cota de un member", async () => {
    const memberId = await seedPerson({ accountName: "Marta" });
    await seedNearByteLimit(2);
    await seedClosed(memberId, "2026-09-29T15:00:00Z", 600, { description: "Propia" });

    const exported = await readyExport(actorIn(workspaceId, memberId), {
      range: lastWeek,
    });

    expect(listedRows(exported.entries).map((row) => row.description)).toEqual([
      "Propia",
    ]);
  });

  /** La cota de la única entrada del período y los bytes de su línea en el CSV escrito. */
  async function boundAndLine() {
    const { scope, span } = await realLevelRead();
    const size = await reportRepository.entryListSize(scope, {
      span,
      filter: NO_ENTRY_FILTER,
    });
    const exported = await readyExport(owner, { range: lastWeek });
    const csv = new TextDecoder("utf-8", { ignoreBOM: true }).decode(
      csvBytesOf(exportDocumentOf({ ...exported, exporter: "Owner" }, settings)),
    );
    const lines = csv.split("\r\n");
    const line =
      lines[lines.findIndex((text) => text.startsWith('"Fecha de inicio"')) + 1];
    return {
      entries: size.entries,
      bound: entriesMinBytes(size),
      lineBytes: new TextEncoder().encode(`${line ?? ""}\r\n`).byteLength,
    };
  }

  it("la cota de una entrada sin textos es exactamente su línea del CSV", async () => {
    await seedClosed(ownerId, "2026-09-29T13:00:00Z", 30);

    expect(await boundAndLine()).toEqual({ entries: 1, bound: 85, lineBytes: 85 });
  });

  it("la cota de una entrada completa no pasa su línea del CSV", async () => {
    const inactiveId = await seedPerson({
      accountName: "Inés Cuenta",
      displayName: "Inés",
      status: "inactive",
    });
    const acme = await seedClient({ workspaceId, name: "ACME" });
    const web = await seedProject({ workspaceId, name: "Web", clientId: acme.id });
    const design = await seedTask({ workspaceId, projectId: web.id, name: "Diseño" });
    const alfa = await seedTag({ workspaceId, name: "alfa" });
    const enie = await seedTag({ workspaceId, name: "año" });
    await seedClosed(inactiveId, "2026-09-29T13:00:00Z", 7200, {
      projectId: web.id,
      taskId: design.id,
      billable: true,
      tagIds: [alfa.id, enie.id],
      description: '=suma "uno"',
    });

    const { entries, bound, lineBytes } = await boundAndLine();

    // 80 + «Inés» 5 + «Web» 3 + «ACME» 4 + «Diseño» 7 + 11 + «alfa» 4 + «año» 4 + 2.
    expect([entries, bound]).toEqual([1, 120]);
    expect(lineBytes).toBeGreaterThanOrEqual(bound);
  });

  it("entryListSize cuenta las entradas de entryList, los bytes de sus textos y sus etiquetas, con los filtros", async () => {
    const web = await seedProject({ workspaceId, name: "Web" });
    const alfa = await seedTag({ workspaceId, name: "alfa" });
    const enie = await seedTag({ workspaceId, name: "año" });
    await seedClosed(ownerId, "2026-09-29T13:00:00Z", 60, {
      projectId: web.id,
      description: "Reunión",
      tagIds: [alfa.id, enie.id],
    });
    await seedClosed(ownerId, "2026-09-29T14:00:00Z", 60, { description: "abc" });
    await seedClosed(ownerId, "2026-09-29T15:00:00Z", 60, { tagIds: [alfa.id] });
    // Fuera del período y el timer en curso: no cuentan.
    await seedClosed(ownerId, "2026-10-06T13:00:00Z", 60, { description: "afuera" });
    await seedTimeEntry({
      workspaceId,
      userId: ownerId,
      description: "en curso",
      startedAt: "2026-09-29T16:00:00Z",
    });
    const { scope, span } = await realLevelRead();

    const sizes = [];
    for (const filter of [
      NO_ENTRY_FILTER,
      { ...NO_ENTRY_FILTER, projectIds: [web.id] },
      { ...NO_ENTRY_FILTER, withoutProject: true },
    ]) {
      const size = await reportRepository.entryListSize(scope, { span, filter });
      const rows = await reportRepository.entryList(scope, { span, filter, limit: 100 });
      sizes.push([rows.length, size]);
    }

    // «Owner» 5 por entrada; «Reunión» 8, «Web» 3, «alfa» 4, «año» 4; «abc» 3; «alfa» 4.
    expect(sizes).toEqual([
      [3, { entries: 3, textBytes: 15 + 19 + 3 + 4, tagLinks: 3, taggedEntries: 2 }],
      [1, { entries: 1, textBytes: 5 + 19, tagLinks: 2, taggedEntries: 1 }],
      [2, { entries: 2, textBytes: 10 + 3 + 4, tagLinks: 1, taggedEntries: 1 }],
    ]);
  });

  it("entryListSize lanza RangeError sin consultar con 51 proyectos en el filtro", async () => {
    const { scope, span } = await realLevelRead();
    const select = vi.spyOn(db, "select");

    await expect(
      reportRepository.entryListSize(scope, {
        span,
        filter: {
          ...NO_ENTRY_FILTER,
          projectIds: Array.from({ length: REPORT_MAX_FILTER_VALUES + 1 }, () =>
            randomUUID(),
          ),
        },
      }),
    ).rejects.toThrow(RangeError);
    expect(select).not.toHaveBeenCalled();
  });
});

describe("el tope de duración de la exportación (S3 de las revisiones de R6a)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function statementTimeoutIn(executor: Pick<typeof db, "execute">) {
    const result = await executor.execute(
      sql`select current_setting('statement_timeout') as value`,
    );
    return (result.rows[0] as { value: string }).value;
  }

  it("rige dentro de la transacción de la exportación y no queda en las conexiones del pool", async () => {
    await seedClosed(ownerId, "2026-09-29T13:00:00Z", 600);
    const listEntries = reportRepository.entryList;
    const inside: string[] = [];
    vi.spyOn(reportRepository, "entryList").mockImplementation(
      async (scope, read, tx) => {
        inside.push(await statementTimeoutIn(tx ?? db));
        return listEntries(scope, read, tx);
      },
    );

    await readyExport(owner, { range: lastWeek });

    expect(inside).toEqual(["8s"]);
    // Todas las conexiones libres del pool a la vez, también la de la exportación.
    const outside = await Promise.all(
      Array.from({ length: 10 }, () => db.transaction((tx) => statementTimeoutIn(tx))),
    );
    expect(new Set(outside)).toEqual(new Set(["0"]));
  });

  it("getReportState no lo pone", async () => {
    await seedClosed(ownerId, "2026-09-29T13:00:00Z", 600);
    const limit = vi.spyOn(reportRepository, "limitStatementTime");

    await readyState(owner, { range: lastWeek });

    expect(limit).not.toHaveBeenCalled();
  });
});

/** D-R9-2: un ingreso anterior a todos los períodos de los tests. */
const joinedBefore = new Date("2026-01-01T00:00:00Z");

/** El fin de `lastWeek` en Buenos Aires: el `span.to` de D-R9-2. */
const lastWeekEnd = new Date("2026-10-05T03:00:00Z");

/** D-R9-2: la fecha de ingreso de una persona, `membership.created_at`. */
async function setJoinedAt(userId: string, instant: Date, inWorkspace = workspaceId) {
  await db
    .update(membership)
    .set({ createdAt: instant })
    .where(and(eq(membership.workspaceId, inWorkspace), eq(membership.userId, userId)));
}

/** Una persona del workspace del test con el ingreso antes de todos los períodos. */
async function seedJoined(values: Parameters<typeof seedPerson>[0]): Promise<string> {
  const userId = await seedPerson(values);
  await setJoinedAt(userId, joinedBefore);
  return userId;
}

/** Las filas del primer nivel como `[nombre, segundos, inactiva, con hijos]`, en orden. */
function withoutTimeRows(state: ReportReadyState) {
  return state.groups.map((group) => [
    group.kind === "person" ? group.name : "?",
    group.seconds,
    group.kind === "person" && group.inactive,
    group.children !== undefined,
  ]);
}

describe("las personas sin horas (R9: RP-47; D-R9-2 a D-R9-7; criterios 5 a 10 y 12 de R9)", () => {
  let admin: Actor;
  let adminId: string;
  let bId: string;
  let cId: string;
  let iId: string;
  let nId: string;
  let kId: string;
  let p1: string;
  let p2: string;

  /**
   * El owner O (7200 s en P1) y A1, la admin que mira (3600 s en P2), activos
   * con horas; B, activa sin horas; C, inactiva sin horas; I, invitada sin
   * horas; N, activa, creada en `span.to`; K, activa, creada 1 ms antes; X,
   * activa sin horas, de otro workspace.
   */
  beforeEach(async () => {
    await setJoinedAt(ownerId, joinedBefore);
    adminId = await seedJoined({ accountName: "Ana", role: "admin" });
    admin = actorIn(workspaceId, adminId, { role: "admin" });
    bId = await seedJoined({ accountName: "Beatriz" });
    cId = await seedJoined({ accountName: "Carla", status: "inactive" });
    iId = await seedJoined({ accountName: "Iván", status: "invited" });
    nId = await seedPerson({ accountName: "Nora" });
    await setJoinedAt(nId, lastWeekEnd);
    kId = await seedPerson({ accountName: "Kevin" });
    await setJoinedAt(kId, new Date(lastWeekEnd.getTime() - 1));
    const other = await seedWorkspace();
    await setJoinedAt(other.ownerId, joinedBefore, other.workspaceId);
    const xId = await seedMember(other.workspaceId, "member");
    await renameAccount(xId, "Xavier");
    await setJoinedAt(xId, joinedBefore, other.workspaceId);

    p1 = (await seedProject({ workspaceId, name: "P1" })).id;
    p2 = (await seedProject({ workspaceId, name: "P2" })).id;
    await seedClosed(ownerId, "2026-09-29T13:00:00Z", 7200, { projectId: p1 });
    await seedClosed(adminId, "2026-09-30T13:00:00Z", 3600, { projectId: p2 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function withOption(request: Partial<ReportRequest> = {}) {
    return readyState(admin, { range: lastWeek, peopleWithoutTime: true, ...request });
  }

  it("por persona: O y A1 por duración, después B y K por nombre; ni C, ni I, ni N, ni X (criterio 5)", async () => {
    const state = await withOption();
    expect(reportReadyState.parse(state)).toEqual(state);
    expect(state.peopleWithoutTime).toBe(true);
    expect(state.groups).toStrictEqual([
      { kind: "person", userId: ownerId, name: "Owner", inactive: false, seconds: 7200 },
      { kind: "person", userId: adminId, name: "Ana", inactive: false, seconds: 3600 },
      { kind: "person", userId: bId, name: "Beatriz", inactive: false, seconds: 0 },
      { kind: "person", userId: kId, name: "Kevin", inactive: false, seconds: 0 },
    ]);

    const without = await readyState(admin, { range: lastWeek });
    expect(without.peopleWithoutTime).toBe(false);
    expect(without.groups).toStrictEqual(state.groups.slice(0, 2));
    for (const field of [
      "totalSeconds",
      "billableSeconds",
      "chart",
      "filterOptions",
      "filters",
      "levelsShown",
      "scope",
    ] as const) {
      expect([field, state[field]]).toEqual([field, without[field]]);
    }
  });

  it("una con entradas de menos de un segundo va antes que las sin horas; dos sin horas con el mismo nombre, por id (criterio 6)", async () => {
    const zetaId = await seedJoined({ accountName: "Zeta" });
    await seedClosed(zetaId, "2026-10-01T13:00:00Z", 0.4);
    await seedJoined({ accountName: "Beta" });
    // El id mayor primero: el orden no es el de la siembra.
    const laterId = await seedJoined({ accountName: "Igual", id: "igual-z-0000" });
    const earlierId = await seedJoined({ accountName: "Igual", id: "igual-a-0000" });

    const state = await withOption();

    expect(withoutTimeRows(state)).toEqual([
      ["Owner", 7200, false, false],
      ["Ana", 3600, false, false],
      ["Zeta", 0, false, false],
      ["Beatriz", 0, false, false],
      ["Beta", 0, false, false],
      ["Igual", 0, false, false],
      ["Igual", 0, false, false],
      ["Kevin", 0, false, false],
    ]);
    const ids = state.groups.map((group) =>
      group.kind === "person" ? group.userId : "",
    );
    expect(ids.slice(5, 7)).toEqual([earlierId, laterId]);
  });

  it("con el filtro de personas, las elegidas, también inactivas, y la regla de ingreso (criterio 7)", async () => {
    const chosen = (people: readonly string[]) =>
      withOption({ filters: { ...NO_REPORT_FILTERS, people } });

    expect(withoutTimeRows(await chosen([adminId, bId, cId]))).toEqual([
      ["Ana", 3600, false, false],
      ["Beatriz", 0, false, false],
      ["Carla", 0, true, false],
    ]);

    const onlyC = await chosen([cId]);
    expect(onlyC.groups).toStrictEqual([
      { kind: "person", userId: cId, name: "Carla", inactive: true, seconds: 0 },
    ]);
    expect([onlyC.levelsShown, onlyC.totalSeconds, onlyC.chart]).toEqual([1, 0, null]);

    const onlyN = await chosen([nId]);
    expect([onlyN.groups, onlyN.filters.people, onlyN.peopleWithoutTime]).toEqual([
      [],
      [nId],
      true,
    ]);

    const invited = await chosen([iId]);
    expect(invited.filters.people).toEqual([]);
    expect(invited.groups).toStrictEqual((await withOption()).groups);
  });

  it("con un proyecto elegido, quien cargó solo en otro aparece sin horas (criterio 8)", async () => {
    const state = await withOption({ filters: { ...NO_REPORT_FILTERS, projects: [p1] } });
    expect(withoutTimeRows(state)).toEqual([
      ["Owner", 7200, false, false],
      ["Ana", 0, false, false],
      ["Beatriz", 0, false, false],
      ["Kevin", 0, false, false],
    ]);
    expect(state.groups[1]).toStrictEqual({
      kind: "person",
      userId: adminId,
      name: "Ana",
      inactive: false,
      seconds: 0,
    });
    expect(state.totalSeconds).toBe(7200);
  });

  it("en el árbol, las sin horas son filas del primer nivel sin hijos (criterio 9)", async () => {
    const twoLevels = await withOption({ subgroups: ["project"] });
    expect(reportReadyState.parse(twoLevels)).toEqual(twoLevels);
    expect(withoutTimeRows(twoLevels)).toEqual([
      ["Owner", 7200, false, true],
      ["Ana", 3600, false, true],
      ["Beatriz", 0, false, false],
      ["Kevin", 0, false, false],
    ]);
    expect(twoLevels.levelsShown).toBe(2);
    expect(twoLevels.groups.slice(2).every((group) => !("children" in group))).toBe(true);

    const threeLevels = await withOption({ subgroups: ["project", "date"] });
    expect(withoutTimeRows(threeLevels)).toEqual(withoutTimeRows(twoLevels));
    expect(threeLevels.levelsShown).toBe(3);
  });

  it("un período sin horas: las candidatas, sin hijos, sin gráfico y en cero (criterio 9)", async () => {
    const state = await withOption({ range: thisWeek, subgroups: ["project"] });
    expect(reportReadyState.parse(state)).toEqual(state);
    // N entró al terminar la semana anterior: en esta ya estaba.
    expect(withoutTimeRows(state)).toEqual([
      ["Ana", 0, false, false],
      ["Beatriz", 0, false, false],
      ["Kevin", 0, false, false],
      ["Nora", 0, false, false],
      ["Owner", 0, false, false],
    ]);
    expect([
      state.levelsShown,
      state.chart,
      state.totalSeconds,
      state.billableSeconds,
    ]).toEqual([2, null, 0, 0]);
  });

  it("por proyecto, o con la persona debajo, no aplica; sin agrupar, sí (criterio 10)", async () => {
    for (const request of [
      { groupBy: "project" },
      { groupBy: "project", subgroups: ["person"] },
    ] as const) {
      const state = await withOption(request);
      const without = await readyState(admin, { range: lastWeek, ...request });
      expect(state.peopleWithoutTime).toBe(false);
      expect(state.groups).toStrictEqual(without.groups);
    }
    const byProject = await withOption({ groupBy: "project", subgroups: ["person"] });
    expect(
      byProject.groups.map((group) =>
        group.children?.map((child) => (child.kind === "person" ? child.name : "?")),
      ),
    ).toEqual([["Owner"], ["Ana"]]);

    const byDefault = await withOption({ groupBy: null });
    expect([byDefault.groupBy, byDefault.peopleWithoutTime]).toEqual(["person", true]);
    expect(withoutTimeRows(byDefault)).toEqual(withoutTimeRows(await withOption()));
  });

  it("una sola foto: el catálogo una vez, con el Executor de los niveles, y las mismas lecturas de niveles (criterio 12)", async () => {
    const request = {
      subgroups: ["project"],
      filters: { ...NO_REPORT_FILTERS, projects: [p1] },
    } as const;
    const listPeople = vi.spyOn(workspaceRepository, "listPeople");
    const byLevels = vi.spyOn(reportRepository, "totalsByLevels");
    await readyState(admin, { range: lastWeek, ...request });
    // El límite del nivel 2 cambia: las sin horas cuentan en el tope (D-R9-8).
    const readsOf = () =>
      byLevels.mock.calls.map(([, { span, filter, dimensions }]) => ({
        span,
        filter,
        dimensions,
      }));
    const levelReads = readsOf();
    expect(levelReads).toHaveLength(2);
    listPeople.mockClear();
    byLevels.mockClear();

    await withOption(request);

    expect(listPeople).toHaveBeenCalledTimes(1);
    expect(readsOf()).toEqual(levelReads);
    const executor = byLevels.mock.calls[0]?.[2];
    expect(executor).toBeDefined();
    expect(executor).not.toBe(db);
    expect(listPeople.mock.calls[0]?.[0]).toBe(executor);
  });
});

describe("el tope con las personas sin horas (D-R9-8; criterio 11 de R9)", () => {
  /** Las descripciones de A1: con A1, el owner y B sin horas son 3000 filas. */
  const descriptions = REPORT_MAX_ROWS - 3;

  let admin: Actor;

  beforeEach(async () => {
    await setJoinedAt(ownerId, joinedBefore);
    const adminId = await seedJoined({ accountName: "Ana", role: "admin" });
    admin = actorIn(workspaceId, adminId, { role: "admin" });
    await seedJoined({ accountName: "Beatriz" });
    await db.execute(sql`
      insert into time_entry (workspace_id, user_id, description, started_at, ended_at, billable)
      select ${workspaceId}, ${adminId}, 'Entrada ' || n,
             timestamptz '2026-09-29 12:00:00+00',
             timestamptz '2026-09-29 12:01:00+00',
             false
        from generate_series(1, ${descriptions}) as n`);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function byDescription(peopleWithoutTime: boolean) {
    return readyState(admin, {
      range: lastWeek,
      subgroups: ["description"],
      peopleWithoutTime,
    });
  }

  it("con 3000 filas contando las sin horas, entra entero y el nivel 2 se pide con lo que dejan", async () => {
    const byLevels = vi.spyOn(reportRepository, "totalsByLevels");
    const state = await byDescription(true);
    expect(state.levelsShown).toBe(2);
    expect(withoutTimeRows(state)).toEqual([
      ["Ana", descriptions * 60, false, true],
      ["Beatriz", 0, false, false],
      ["Owner", 0, false, false],
    ]);
    expect(state.groups[0]?.children).toHaveLength(descriptions);
    expect(byLevels.mock.calls.map(([, read]) => read.limit)).toEqual([
      REPORT_MAX_ROWS + 1,
      REPORT_MAX_ROWS - 3 + 1,
    ]);
  });

  it("con una sin horas más, el nivel 2 no entra; sin la opción, sí", async () => {
    await seedJoined({ accountName: "Darío" });
    const state = await byDescription(true);
    expect(state.levelsShown).toBe(1);
    expect(withoutTimeRows(state)).toEqual([
      ["Ana", descriptions * 60, false, false],
      ["Beatriz", 0, false, false],
      ["Darío", 0, false, false],
      ["Owner", 0, false, false],
    ]);
    expect((await byDescription(false)).levelsShown).toBe(2);
  });

  it("con 3001 activas sin horas más, el primer nivel no entra: levelsShown 0, sin grupos y el total de entryTotals", async () => {
    const prefix = randomUUID();
    await db.execute(sql`
      with created as (
        insert into "user" (id, name, email, email_verified)
        select ${prefix} || '-' || n, 'Tope ' || n, ${prefix} || '-' || n || '@empresa.com', true
          from generate_series(1, 3001) as n
        returning id)
      insert into membership (workspace_id, user_id, role, status, created_at)
      select ${workspaceId}, id, 'member', 'active', timestamptz '2026-01-01 00:00:00+00'
        from created`);
    const entryTotals = vi.spyOn(reportRepository, "entryTotals");

    const state = await readyState(admin, { range: lastWeek, peopleWithoutTime: true });

    expect(reportReadyState.parse(state)).toEqual(state);
    expect([state.levelsShown, state.groups, state.peopleWithoutTime]).toEqual([
      0,
      [],
      true,
    ]);
    expect(state.totalSeconds).toBe(descriptions * 60);
    expect(entryTotals).toHaveBeenCalledTimes(1);
  });
});
