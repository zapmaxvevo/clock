import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { timeEntry, user } from "@/server/db/schema";
import type { Actor, MembershipStatus, Role } from "@/server/permissions";
import { type TimeSettings } from "@/server/time";
import {
  buenosAires,
  seedClient,
  seedMember,
  seedPreferences,
  seedProject,
  seedTask,
  seedTimeEntry,
  seedWorkspace,
} from "@/test/factories";
import { actorIn, workspaceOf } from "@/test/time-entry";

import { projectLabels } from "@/modules/project/components/labels";
import { getTimesheetState } from "@/modules/time-entry/service";

import { reportReadyState, type ReportRange, type ReportReadyState } from "./schema";
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
    await seedExact(memberId, `${day} 13:00:00.25-03`, `${day} 13:00:01.75-03`, false);
    // Lo de otra persona no entra en el reporte propio ni en su fila.
    await seedClosed(ownerId, "2026-09-30T15:00:00Z", 3600, { billable: true });

    const timesheet = await getTimesheetState(member, settings, { day }, readNow);
    const own = await readyState(member, { range: lastWeek });
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

    for (const groupBy of ["person", "project"] as const) {
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
