import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/server/db";
import { membership } from "@/server/db/schema";
import type * as Permissions from "@/server/permissions";
import type { Actor, MembershipStatus, Role } from "@/server/permissions";
import {
  buenosAires,
  seedClient,
  seedMember,
  seedProject,
  seedTag,
  seedTask,
  seedTimeEntry,
  seedWorkspace,
} from "@/test/factories";
import { actorIn, workspaceOf } from "@/test/time-entry";

import { reportRepository } from "./repository";
import {
  NO_REPORT_FILTERS,
  REPORT_GROUP_BYS,
  reportGroupParams,
  reportRangeParams,
  reportSubgroupParams,
  type ReportGroup,
  type ReportGroupBy,
  type ReportState,
} from "./schema";
import { getReportState, type ReportRequest } from "./service";

/**
 * El alcance del reporte (D-R2a-2), escrito contra las firmas públicas y sin
 * mirar `scopeOf`. `can` es el real, envuelto: una acción anotada en `denied`
 * se le niega a esa persona además de lo que niegue el real. Sin anotaciones,
 * decide el real; así se prueba que el alcance sale de `can()` y no de comparar
 * roles en el service (criterio 4, R9 de las correcciones). R2b suma las
 * agrupaciones por cliente y por fecha con el mismo fixture (criterio 11 de R2b),
 * y R3 las de tarea y etiqueta, con la tarea y las etiquetas en el fixture
 * (criterio 9 de R3), y los subniveles (criterio 21 de R3).
 */
const permissionOverrides = vi.hoisted(() => ({
  denied: [] as { readonly userId: string; readonly action: string }[],
}));

vi.mock("@/server/permissions", async (importOriginal) => {
  const real = await importOriginal<typeof Permissions>();
  return {
    ...real,
    can: (
      actor: Permissions.Actor,
      action: Permissions.Action,
      resource: Permissions.Resource,
    ) =>
      !permissionOverrides.denied.some(
        (denial) => denial.userId === actor.userId && denial.action === action,
      ) && real.can(actor, action, resource),
  };
});

/** La semana del lunes 28/09/2026, con los dos extremos: el período que se pide. */
const week = { first: "2026-09-28", last: "2026-10-04" } as const;

/** El martes de `week` en Buenos Aires: el día de todas las entradas sembradas. */
const entryDay = "2026-09-29";

/** El jueves siguiente a `week`, a las 12:00 en Buenos Aires: el período pedido no es «Esta semana». */
const now = new Date("2026-10-08T15:00:00Z");

const settings = workspaceOf(buenosAires);

const roles: readonly Role[] = [
  "owner",
  "admin",
  "project_manager",
  "team_manager",
  "member",
];
const notActive: readonly MembershipStatus[] = ["inactive", "invited"];

/** Las agrupaciones que se recorren en cada caso de alcance. */
const groupBys: readonly ReportGroupBy[] = REPORT_GROUP_BYS;

/** Dónde está una entrada: su proyecto, el cliente del proyecto, su tarea y sus etiquetas. */
type Place = {
  readonly projectId: string | null;
  readonly clientId: string | null;
  readonly taskId: string | null;
  /** En el orden en que el reporte las lista con la misma duración: por nombre. */
  readonly tagIds: readonly string[];
};

const noProject: Place = { projectId: null, clientId: null, taskId: null, tagIds: [] };

/**
 * Workspace A: owner, admin, `project_manager` responsable de P, `team_manager`,
 * un member que también es miembro de B y un member inactivo. P es del cliente
 * de A y tiene la tarea T. Cada uno tiene una sola entrada el martes 29/09, con
 * una duración que no se repite: en P y facturable, o sin proyecto y no
 * facturable. Las de owner, `project_manager` e inactivo van en T; la del member
 * lleva las etiquetas E y F, la del inactivo E y la del admin F.
 */
type WorkspaceA = {
  readonly workspaceId: string;
  readonly clientId: string;
  readonly projectId: string;
  readonly taskId: string;
  readonly tagEId: string;
  readonly tagFId: string;
  readonly ownerId: string;
  readonly adminId: string;
  readonly managerId: string;
  readonly teamManagerId: string;
  readonly memberId: string;
  readonly inactiveId: string;
  readonly places: {
    readonly owner: Place;
    readonly admin: Place;
    readonly manager: Place;
    readonly teamManager: Place;
    readonly member: Place;
    readonly inactive: Place;
  };
};

/**
 * Workspace B: su owner, sin proyecto, y el member de A en el proyecto de B,
 * que es del cliente de B, con la etiqueta G de B.
 */
type WorkspaceB = {
  readonly workspaceId: string;
  readonly ownerId: string;
  readonly places: { readonly owner: Place; readonly member: Place };
};

let a: WorkspaceA;
let b: WorkspaceB;

/** Una entrada sembrada: lo que el reporte tiene que sumar de ella. */
type SeededEntry = {
  readonly workspaceId: string;
  readonly userId: string;
  readonly minutes: number;
  readonly place: Place;
};

/** Las entradas de `beforeEach`, de A y de B. */
let seeded: SeededEntry[];

/** Cómo nombra un camino a cada id del fixture, para que un fallo se lea. */
let names: Map<string, string>;

/**
 * Una entrada cerrada de `minutes` minutos el martes 29/09, que empieza a las
 * `hour` UTC, en `place`: facturable si tiene proyecto.
 */
async function closedEntry(values: {
  readonly workspaceId: string;
  readonly userId: string;
  readonly hour: number;
  readonly minutes: number;
  readonly place: Place;
}) {
  const startedAt = new Date(Date.UTC(2026, 8, 29, values.hour));
  seeded.push(values);
  await seedTimeEntry({
    workspaceId: values.workspaceId,
    userId: values.userId,
    startedAt,
    endedAt: new Date(startedAt.getTime() + values.minutes * 60_000),
    projectId: values.place.projectId,
    taskId: values.place.taskId,
    billable: values.place.projectId !== null,
    tagIds: values.place.tagIds,
  });
}

beforeEach(async () => {
  permissionOverrides.denied.length = 0;
  seeded = [];

  const seededA = await seedWorkspace(buenosAires);
  const adminId = await seedMember(seededA.workspaceId, "admin");
  const managerId = await seedMember(seededA.workspaceId, "project_manager");
  const teamManagerId = await seedMember(seededA.workspaceId, "team_manager");
  const memberId = await seedMember(seededA.workspaceId, "member");
  const inactiveId = await seedMember(seededA.workspaceId, "member", "inactive");
  const clientA = await seedClient({ workspaceId: seededA.workspaceId });
  // RP-05: ser responsable de P no da las horas ajenas en P.
  const projectA = await seedProject({
    workspaceId: seededA.workspaceId,
    clientId: clientA.id,
    members: [
      { userId: managerId, isManager: true },
      { userId: memberId },
      { userId: inactiveId },
    ],
  });
  const taskA = await seedTask({
    workspaceId: seededA.workspaceId,
    projectId: projectA.id,
    name: "T",
  });
  const tagE = await seedTag({ workspaceId: seededA.workspaceId, name: "E" });
  const tagF = await seedTag({ workspaceId: seededA.workspaceId, name: "F" });
  const inP = { projectId: projectA.id, clientId: clientA.id, taskId: null, tagIds: [] };
  const inT = { ...inP, taskId: taskA.id };
  a = {
    workspaceId: seededA.workspaceId,
    clientId: clientA.id,
    projectId: projectA.id,
    taskId: taskA.id,
    tagEId: tagE.id,
    tagFId: tagF.id,
    ownerId: seededA.ownerId,
    adminId,
    managerId,
    teamManagerId,
    memberId,
    inactiveId,
    places: {
      owner: inT,
      admin: { ...noProject, tagIds: [tagF.id] },
      manager: inT,
      teamManager: noProject,
      member: { ...inP, tagIds: [tagE.id, tagF.id] },
      inactive: { ...inT, tagIds: [tagE.id] },
    },
  };

  const seededB = await seedWorkspace(buenosAires);
  await db
    .insert(membership)
    .values({ workspaceId: seededB.workspaceId, userId: memberId, role: "member" });
  const clientB = await seedClient({ workspaceId: seededB.workspaceId });
  const projectB = await seedProject({
    workspaceId: seededB.workspaceId,
    clientId: clientB.id,
  });
  const tagG = await seedTag({ workspaceId: seededB.workspaceId, name: "G" });
  names = new Map([
    [seededA.ownerId, "owner"],
    [adminId, "admin"],
    [managerId, "project_manager"],
    [teamManagerId, "team_manager"],
    [memberId, "member"],
    [inactiveId, "inactivo"],
    [seededB.ownerId, "owner de B"],
    [clientA.id, "cliente de A"],
    [projectA.id, "P"],
    [taskA.id, "T"],
    [tagE.id, "E"],
    [tagF.id, "F"],
    [clientB.id, "cliente de B"],
    [projectB.id, "proyecto de B"],
    [tagG.id, "G"],
  ]);
  b = {
    workspaceId: seededB.workspaceId,
    ownerId: seededB.ownerId,
    places: {
      owner: noProject,
      member: {
        projectId: projectB.id,
        clientId: clientB.id,
        taskId: null,
        tagIds: [tagG.id],
      },
    },
  };

  const inA = { workspaceId: a.workspaceId };
  await closedEntry({
    ...inA,
    userId: a.ownerId,
    hour: 10,
    minutes: 10,
    place: a.places.owner,
  });
  await closedEntry({
    ...inA,
    userId: a.adminId,
    hour: 11,
    minutes: 20,
    place: a.places.admin,
  });
  await closedEntry({
    ...inA,
    userId: a.managerId,
    hour: 12,
    minutes: 30,
    place: a.places.manager,
  });
  await closedEntry({
    ...inA,
    userId: a.teamManagerId,
    hour: 13,
    minutes: 40,
    place: a.places.teamManager,
  });
  await closedEntry({
    ...inA,
    userId: a.memberId,
    hour: 14,
    minutes: 50,
    place: a.places.member,
  });
  await closedEntry({
    ...inA,
    userId: a.inactiveId,
    hour: 15,
    minutes: 60,
    place: a.places.inactive,
  });
  const inB = { workspaceId: b.workspaceId };
  await closedEntry({
    ...inB,
    userId: a.memberId,
    hour: 17,
    minutes: 70,
    place: b.places.member,
  });
  await closedEntry({
    ...inB,
    userId: b.ownerId,
    hour: 18,
    minutes: 80,
    place: b.places.owner,
  });
});

function request(groupBy: ReportRequest["groupBy"]): ReportRequest {
  return { range: week, groupBy, subgroups: [], filters: NO_REPORT_FILTERS };
}

async function reportOf(actor: Actor, groupBy: ReportRequest["groupBy"]) {
  return getReportState(actor, settings, request(groupBy), now);
}

/**
 * Lo que decide el alcance, sin los campos del período: qué alcance dice la
 * pantalla, los totales y cada fila por su id y sus segundos.
 */
function summaryOf(state: ReportState) {
  if (state.kind !== "ready") {
    return state;
  }
  return {
    scope: state.scope,
    groupBy: state.groupBy,
    totalSeconds: state.totalSeconds,
    billableSeconds: state.billableSeconds,
    groups: state.groups.map((group) => {
      switch (group.kind) {
        case "person":
          return {
            userId: group.userId,
            inactive: group.inactive,
            seconds: group.seconds,
          };
        case "project":
          return { projectId: group.project?.id ?? null, seconds: group.seconds };
        case "client":
          return { clientId: group.client?.id ?? null, seconds: group.seconds };
        case "task":
          return { taskId: group.task?.id ?? null, seconds: group.seconds };
        case "tag":
          return { tagId: group.tag?.id ?? null, seconds: group.seconds };
        case "date":
          return { dayKey: group.dayKey, seconds: group.seconds };
      }
    }),
  };
}

/**
 * Las filas que deja `summaryOf` de las horas de una persona en un solo lugar:
 * una, salvo por etiqueta, donde suma en cada una de las suyas (RP-18).
 */
function rowsOf(
  groupBy: ReportGroupBy,
  values: {
    readonly userId: string;
    readonly inactive?: boolean;
    readonly place: Place;
    readonly seconds: number;
  },
) {
  const { seconds } = values;
  switch (groupBy) {
    case "person":
      return [{ userId: values.userId, inactive: values.inactive ?? false, seconds }];
    case "project":
      return [{ projectId: values.place.projectId, seconds }];
    case "client":
      return [{ clientId: values.place.clientId, seconds }];
    case "task":
      return [{ taskId: values.place.taskId, seconds }];
    case "tag":
      return values.place.tagIds.length === 0
        ? [{ tagId: null, seconds }]
        : values.place.tagIds.map((tagId) => ({ tagId, seconds }));
    case "date":
      return [{ dayKey: entryDay, seconds }];
  }
}

/**
 * Lo que ve una persona con su propia entrada de `minutes` minutos en `place`:
 * el total es el de la entrada también por etiqueta, aunque las filas sumen más.
 */
function ownSummary(
  groupBy: ReportGroupBy,
  values: {
    readonly userId: string;
    readonly minutes: number;
    readonly place: Place;
  },
) {
  const seconds = values.minutes * 60;
  return {
    scope: "self",
    groupBy,
    totalSeconds: seconds,
    billableSeconds: values.place.projectId === null ? 0 : seconds,
    groups: rowsOf(groupBy, { ...values, seconds }),
  };
}

/** Todo A, de la duración mayor a la menor: nada de B. Por etiqueta, el total real. */
function everyoneInA(groupBy: ReportGroupBy) {
  return {
    scope: "everyone",
    groupBy,
    totalSeconds: 210 * 60,
    billableSeconds: 150 * 60,
    groups: everyoneInAGroups(groupBy),
  };
}

/**
 * P junta las horas de owner, `project_manager`, member e inactivo; el resto,
 * sin proyecto. T, las de owner, `project_manager` e inactivo. E, las de member
 * e inactivo; F, las de member y admin. Por fecha, las seis en el mismo día.
 */
function everyoneInAGroups(groupBy: ReportGroupBy) {
  switch (groupBy) {
    case "person":
      return [
        { userId: a.inactiveId, inactive: true, seconds: 60 * 60 },
        { userId: a.memberId, inactive: false, seconds: 50 * 60 },
        { userId: a.teamManagerId, inactive: false, seconds: 40 * 60 },
        { userId: a.managerId, inactive: false, seconds: 30 * 60 },
        { userId: a.adminId, inactive: false, seconds: 20 * 60 },
        { userId: a.ownerId, inactive: false, seconds: 10 * 60 },
      ];
    case "project":
      return [
        { projectId: a.projectId, seconds: 150 * 60 },
        { projectId: null, seconds: 60 * 60 },
      ];
    case "client":
      return [
        { clientId: a.clientId, seconds: 150 * 60 },
        { clientId: null, seconds: 60 * 60 },
      ];
    case "task":
      return [
        { taskId: null, seconds: 110 * 60 },
        { taskId: a.taskId, seconds: 100 * 60 },
      ];
    case "tag":
      return [
        { tagId: a.tagEId, seconds: 110 * 60 },
        { tagId: null, seconds: 80 * 60 },
        { tagId: a.tagFId, seconds: 70 * 60 },
      ];
    case "date":
      return [{ dayKey: entryDay, seconds: 210 * 60 }];
  }
}

/** Las tres personas de A que ven solo lo propio, con su única entrada. */
function selfOnlyInA() {
  return [
    {
      role: "project_manager",
      userId: a.managerId,
      minutes: 30,
      place: a.places.manager,
    },
    {
      role: "team_manager",
      userId: a.teamManagerId,
      minutes: 40,
      place: a.places.teamManager,
    },
    { role: "member", userId: a.memberId, minutes: 50, place: a.places.member },
  ] as const;
}

/** Los dos árboles del criterio 21: tres niveles, uno con la etiqueta arriba. */
const trees: readonly (readonly ReportGroupBy[])[] = [
  ["person", "project", "date"],
  ["tag", "task", "person"],
];

/** El pedido de la semana con `levels[0]` arriba y el resto como subniveles. */
function treeRequest(levels: readonly ReportGroupBy[]): ReportRequest {
  return {
    range: week,
    groupBy: levels[0],
    subgroups: levels.slice(1),
    filters: NO_REPORT_FILTERS,
  };
}

async function treeOf(actor: Actor, levels: readonly ReportGroupBy[]) {
  return getReportState(actor, settings, treeRequest(levels), now);
}

function nameOf(id: string | null): string {
  return id === null ? "sin" : (names.get(id) ?? id);
}

/** Cómo aparece un grupo en un camino: su dimensión y su nombre, o «sin». */
function keyOfGroup(group: ReportGroup): string {
  switch (group.kind) {
    case "person":
      return `persona ${nameOf(group.userId)}`;
    case "project":
      return `proyecto ${nameOf(group.project?.id ?? null)}`;
    case "client":
      return `cliente ${nameOf(group.client?.id ?? null)}`;
    case "task":
      return `tarea ${nameOf(group.task?.id ?? null)}`;
    case "tag":
      return `etiqueta ${nameOf(group.tag?.id ?? null)}`;
    case "date":
      return `fecha ${group.dayKey}`;
  }
}

/** Los grupos de una entrada en un nivel: uno, salvo por etiqueta (RP-18). */
function keysOfEntry(entry: SeededEntry, level: ReportGroupBy): readonly string[] {
  const { place } = entry;
  switch (level) {
    case "person":
      return [`persona ${nameOf(entry.userId)}`];
    case "project":
      return [`proyecto ${nameOf(place.projectId)}`];
    case "client":
      return [`cliente ${nameOf(place.clientId)}`];
    case "task":
      return [`tarea ${nameOf(place.taskId)}`];
    case "tag":
      return place.tagIds.length === 0
        ? ["etiqueta sin"]
        : place.tagIds.map((tagId) => `etiqueta ${nameOf(tagId)}`);
    case "date":
      return [`fecha ${entryDay}`];
  }
}

/** Cada grupo del árbol como su camino desde el primer nivel y sus segundos. */
function pathsOf(groups: readonly ReportGroup[], above: string): string[] {
  return groups.flatMap((group) => {
    const path = above === "" ? keyOfGroup(group) : `${above} / ${keyOfGroup(group)}`;
    return [`${path}: ${group.seconds}`, ...pathsOf(group.children ?? [], path)];
  });
}

/**
 * Lo que decide el alcance de un árbol: los niveles, los totales y cada grupo
 * de cada nivel como un camino con sus segundos, sin orden (el orden es del
 * criterio 17).
 */
function treeSummaryOf(state: ReportState) {
  if (state.kind !== "ready") {
    return state;
  }
  return {
    scope: state.scope,
    groupBy: state.groupBy,
    subgroups: state.subgroups,
    levelsShown: state.levelsShown,
    totalSeconds: state.totalSeconds,
    billableSeconds: state.billableSeconds,
    paths: pathsOf(state.groups, "").sort(),
  };
}

/**
 * El árbol que dan `entries` con `levels`: cada entrada suma una vez en cada
 * camino suyo, y una con dos etiquetas, en el de cada una; el total es el de
 * las entradas.
 */
function expectedTree(
  scope: "everyone" | "self",
  levels: readonly ReportGroupBy[],
  entries: readonly SeededEntry[],
) {
  const seconds = new Map<string, number>();
  for (const entry of entries) {
    let paths = [""];
    for (const level of levels) {
      paths = paths.flatMap((above) =>
        keysOfEntry(entry, level).map((key) =>
          above === "" ? key : `${above} / ${key}`,
        ),
      );
      for (const path of paths) {
        seconds.set(path, (seconds.get(path) ?? 0) + entry.minutes * 60);
      }
    }
  }
  const secondsOf = (counted: readonly SeededEntry[]) =>
    counted.reduce((sum, entry) => sum + entry.minutes * 60, 0);
  return {
    scope,
    groupBy: levels[0],
    subgroups: levels.slice(1),
    levelsShown: levels.length,
    totalSeconds: secondsOf(entries),
    billableSeconds: secondsOf(entries.filter((entry) => entry.place.projectId !== null)),
    paths: [...seconds].map(([path, total]) => `${path}: ${total}`).sort(),
  };
}

function entriesIn(workspaceId: string, userId?: string): SeededEntry[] {
  return seeded.filter(
    (entry) =>
      entry.workspaceId === workspaceId &&
      (userId === undefined || entry.userId === userId),
  );
}

/**
 * Sin `report.view`, `forbidden` sin leer ni abrir la transacción, con un nivel
 * y con subniveles (criterios 9 y 21 de R3).
 */
async function expectForbiddenWithoutReading(actor: Actor) {
  const byLevels = vi.spyOn(reportRepository, "totalsByLevels");
  const entryTotals = vi.spyOn(reportRepository, "entryTotals");
  const transaction = vi.spyOn(db, "transaction");
  try {
    const requests = [
      ...[null, ...groupBys].map(request),
      ...trees.map((levels) => treeRequest(levels)),
    ];
    for (const forbidden of requests) {
      expect(await getReportState(actor, settings, forbidden, now)).toEqual({
        kind: "forbidden",
      });
    }
    expect(byLevels).not.toHaveBeenCalled();
    expect(entryTotals).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  } finally {
    byLevels.mockRestore();
    entryTotals.mockRestore();
    transaction.mockRestore();
  }
}

describe("el alcance por rol (criterio 4, D-R2a-2; criterio 11 de R2b; criterio 9 de R3)", () => {
  for (const role of ["owner", "admin"] as const) {
    it(`${role} de A ve a todas las personas de A, la inactiva con sus horas, y nada de B`, async () => {
      const actor = actorIn(a.workspaceId, role === "owner" ? a.ownerId : a.adminId, {
        role,
      });
      for (const groupBy of groupBys) {
        expect(summaryOf(await reportOf(actor, groupBy))).toEqual(everyoneInA(groupBy));
      }
    });
  }

  it("project_manager, responsable del proyecto donde los demás cargan, ve solo lo propio (RP-05)", async () => {
    const actor = actorIn(a.workspaceId, a.managerId, { role: "project_manager" });
    for (const groupBy of groupBys) {
      expect(summaryOf(await reportOf(actor, groupBy))).toEqual(
        ownSummary(groupBy, {
          userId: a.managerId,
          minutes: 30,
          place: a.places.manager,
        }),
      );
    }
  });

  it("team_manager ve solo lo propio (RP-06)", async () => {
    const actor = actorIn(a.workspaceId, a.teamManagerId, { role: "team_manager" });
    for (const groupBy of groupBys) {
      expect(summaryOf(await reportOf(actor, groupBy))).toEqual(
        ownSummary(groupBy, {
          userId: a.teamManagerId,
          minutes: 40,
          place: a.places.teamManager,
        }),
      );
    }
  });

  it("member ve solo lo propio, y en A no ve sus horas de B (RP-01)", async () => {
    const actor = actorIn(a.workspaceId, a.memberId);
    for (const groupBy of groupBys) {
      expect(summaryOf(await reportOf(actor, groupBy))).toEqual(
        ownSummary(groupBy, { userId: a.memberId, minutes: 50, place: a.places.member }),
      );
    }
    // Sin agrupación, por persona: la misma fila.
    expect(summaryOf(await reportOf(actor, null))).toEqual(
      ownSummary("person", { userId: a.memberId, minutes: 50, place: a.places.member }),
    );
  });

  it("la misma persona, en B, ve solo lo suyo de B", async () => {
    const actor = actorIn(b.workspaceId, a.memberId);
    for (const groupBy of groupBys) {
      expect(summaryOf(await reportOf(actor, groupBy))).toEqual(
        ownSummary(groupBy, { userId: a.memberId, minutes: 70, place: b.places.member }),
      );
    }
  });

  it("el owner de B ve todo B y nada de A", async () => {
    const actor = actorIn(b.workspaceId, b.ownerId, { role: "owner" });
    for (const groupBy of groupBys) {
      expect(summaryOf(await reportOf(actor, groupBy))).toEqual({
        scope: "everyone",
        groupBy,
        totalSeconds: 150 * 60,
        billableSeconds: 70 * 60,
        // Por fecha, las dos entradas de B son del mismo día; por tarea, las dos sin tarea.
        groups:
          groupBy === "date"
            ? [{ dayKey: entryDay, seconds: 150 * 60 }]
            : groupBy === "task"
              ? [{ taskId: null, seconds: 150 * 60 }]
              : [
                  ...rowsOf(groupBy, {
                    userId: b.ownerId,
                    place: b.places.owner,
                    seconds: 80 * 60,
                  }),
                  ...rowsOf(groupBy, {
                    userId: a.memberId,
                    place: b.places.member,
                    seconds: 70 * 60,
                  }),
                ],
      });
    }
  });

  it("el owner de A, member de B sin horas en B, no ve en B las suyas de A", async () => {
    await db
      .insert(membership)
      .values({ workspaceId: b.workspaceId, userId: a.ownerId, role: "member" });
    const actor = actorIn(b.workspaceId, a.ownerId);
    for (const groupBy of groupBys) {
      expect(summaryOf(await reportOf(actor, groupBy))).toEqual({
        scope: "self",
        groupBy,
        totalSeconds: 0,
        billableSeconds: 0,
        groups: [],
      });
    }
  });
});

describe("la decisión es de can() (criterio 4, R9)", () => {
  it("un owner activo al que can() le niega timeEntry.others.view ve solo lo propio", async () => {
    permissionOverrides.denied.push({
      userId: a.ownerId,
      action: "timeEntry.others.view",
    });
    const actor = actorIn(a.workspaceId, a.ownerId, { role: "owner" });
    for (const groupBy of groupBys) {
      expect(summaryOf(await reportOf(actor, groupBy))).toEqual(
        ownSummary(groupBy, { userId: a.ownerId, minutes: 10, place: a.places.owner }),
      );
    }
  });

  it("report.view sigue en el can real: el mismo owner, inactivo, no lee nada", async () => {
    permissionOverrides.denied.push({
      userId: a.ownerId,
      action: "timeEntry.others.view",
    });
    await expectForbiddenWithoutReading(
      actorIn(a.workspaceId, a.ownerId, { role: "owner", status: "inactive" }),
    );
  });

  it("un owner activo al que can() le niega report.view no lee nada", async () => {
    permissionOverrides.denied.push({ userId: a.ownerId, action: "report.view" });
    await expectForbiddenWithoutReading(
      actorIn(a.workspaceId, a.ownerId, { role: "owner" }),
    );
  });
});

describe("el enlace ajeno (criterio 5, RP-32; criterio 11 de R2b; criterio 9 de R3)", () => {
  /** El valor de `agrupar` que escribe la URL y la agrupación que tiene que salir. */
  const linkedGroupBys = [
    ["proyecto", "project"],
    ["cliente", "client"],
    ["tarea", "task"],
    ["etiqueta", "tag"],
    ["fecha", "date"],
  ] as const;

  /** Lo que la página recibe de un enlace de un admin, con claves armadas a mano. */
  function searchParamsOf(agrupar: string) {
    return {
      desde: week.first,
      hasta: week.last,
      agrupar,
      personas: ["ajena-1", "ajena-2"],
      persona: "ajena-1",
      userId: "ajena-1",
      alcance: "everyone",
    };
  }

  function requestFromUrl(agrupar: string): ReportRequest {
    const searchParams = searchParamsOf(agrupar);
    const range = reportRangeParams.safeParse(searchParams);
    const groupBy = reportGroupParams.safeParse(searchParams);
    if (!range.success || !groupBy.success) {
      throw new Error("El enlace del admin no pasó los esquemas.");
    }
    return {
      range: range.data,
      groupBy: groupBy.data,
      subgroups: [],
      filters: NO_REPORT_FILTERS,
    };
  }

  it("los esquemas no dejan pasar ninguna clave que nombre personas", () => {
    for (const [agrupar, groupBy] of linkedGroupBys) {
      expect(requestFromUrl(agrupar)).toStrictEqual({
        range: week,
        groupBy,
        subgroups: [],
        filters: NO_REPORT_FILTERS,
      });
    }
  });

  for (const [agrupar, groupBy] of linkedGroupBys) {
    it(`con agrupar=${agrupar}, el pedido del admin da a cada uno su propia fila y su total`, async () => {
      const fromUrl = requestFromUrl(agrupar);
      const admin = actorIn(a.workspaceId, a.adminId, { role: "admin" });
      expect(summaryOf(await getReportState(admin, settings, fromUrl, now))).toEqual(
        everyoneInA(groupBy),
      );
      for (const { role, userId, minutes, place } of selfOnlyInA()) {
        const actor = actorIn(a.workspaceId, userId, { role });
        expect(summaryOf(await getReportState(actor, settings, fromUrl, now))).toEqual(
          ownSummary(groupBy, { userId, minutes, place }),
        );
      }
    });
  }
});

describe("membresía no activa (criterio 11, RP-07; criterio 9 de R3)", () => {
  for (const status of notActive) {
    it(`${status}: ningún rol lee, el owner tampoco`, async () => {
      for (const role of roles) {
        let userId: string;
        if (role === "owner") {
          await db
            .update(membership)
            .set({ status })
            .where(
              and(
                eq(membership.workspaceId, a.workspaceId),
                eq(membership.userId, a.ownerId),
              ),
            );
          userId = a.ownerId;
        } else {
          userId = await seedMember(a.workspaceId, role, status);
        }
        await expectForbiddenWithoutReading(
          actorIn(a.workspaceId, userId, { role, status }),
        );
      }
    });
  }

  it("la persona inactiva con horas en A no lee las suyas", async () => {
    await expectForbiddenWithoutReading(
      actorIn(a.workspaceId, a.inactiveId, { status: "inactive" }),
    );
  });
});

describe("el alcance en cada nivel (criterio 21 de R3)", () => {
  for (const role of ["owner", "admin"] as const) {
    it(`${role} de A ve todo A en cada nivel, también al inactivo, y nada de B`, async () => {
      const actor = actorIn(a.workspaceId, role === "owner" ? a.ownerId : a.adminId, {
        role,
      });
      for (const levels of trees) {
        expect(treeSummaryOf(await treeOf(actor, levels))).toEqual(
          expectedTree("everyone", levels, entriesIn(a.workspaceId)),
        );
      }
    });
  }

  it("project_manager, team_manager y member ven solo lo propio en cada nivel", async () => {
    for (const { role, userId } of selfOnlyInA()) {
      const actor = actorIn(a.workspaceId, userId, { role });
      for (const levels of trees) {
        expect(treeSummaryOf(await treeOf(actor, levels))).toEqual(
          expectedTree("self", levels, entriesIn(a.workspaceId, userId)),
        );
      }
    }
  });

  it("la misma persona, en B, ve solo lo suyo de B", async () => {
    const actor = actorIn(b.workspaceId, a.memberId);
    for (const levels of trees) {
      expect(treeSummaryOf(await treeOf(actor, levels))).toEqual(
        expectedTree("self", levels, entriesIn(b.workspaceId, a.memberId)),
      );
    }
  });

  it("el owner de B ve todo B y nada de A", async () => {
    const actor = actorIn(b.workspaceId, b.ownerId, { role: "owner" });
    for (const levels of trees) {
      expect(treeSummaryOf(await treeOf(actor, levels))).toEqual(
        expectedTree("everyone", levels, entriesIn(b.workspaceId)),
      );
    }
  });

  it("el owner de A, member de B sin horas en B, no ve en B las suyas de A", async () => {
    await db
      .insert(membership)
      .values({ workspaceId: b.workspaceId, userId: a.ownerId, role: "member" });
    const actor = actorIn(b.workspaceId, a.ownerId);
    for (const levels of trees) {
      expect(treeSummaryOf(await treeOf(actor, levels))).toEqual(
        expectedTree("self", levels, []),
      );
    }
  });

  it("un owner activo al que can() le niega timeEntry.others.view ve solo lo propio en cada nivel", async () => {
    permissionOverrides.denied.push({
      userId: a.ownerId,
      action: "timeEntry.others.view",
    });
    const actor = actorIn(a.workspaceId, a.ownerId, { role: "owner" });
    for (const levels of trees) {
      expect(treeSummaryOf(await treeOf(actor, levels))).toEqual(
        expectedTree("self", levels, entriesIn(a.workspaceId, a.ownerId)),
      );
    }
  });

  describe("el enlace ajeno con subniveles (RP-32)", () => {
    /** Los valores de `agrupar` y `subagrupar` de cada árbol, como los escribe la URL. */
    const linkedTrees = [
      ["persona", "proyecto,fecha", ["person", "project", "date"]],
      ["etiqueta", "tarea,persona", ["tag", "task", "person"]],
      // La URL armada a mano del paso 11 de §7.
      ["etiqueta", "persona,fecha", ["tag", "person", "date"]],
    ] as const;

    /** Lo que la página recibe de un enlace de un admin, con claves armadas a mano. */
    function requestFromUrl(agrupar: string, subagrupar: string): ReportRequest {
      const searchParams = {
        desde: week.first,
        hasta: week.last,
        agrupar,
        subagrupar,
        personas: ["ajena-1", "ajena-2"],
        persona: "ajena-1",
        userId: "ajena-1",
        alcance: "everyone",
      };
      const range = reportRangeParams.safeParse(searchParams);
      const groupBy = reportGroupParams.safeParse(searchParams);
      const subgroups = reportSubgroupParams.safeParse(searchParams);
      if (!range.success || !groupBy.success || !subgroups.success) {
        throw new Error("El enlace del admin no pasó los esquemas.");
      }
      return {
        range: range.data,
        groupBy: groupBy.data,
        subgroups: subgroups.data,
        filters: NO_REPORT_FILTERS,
      };
    }

    it("los esquemas no dejan pasar ninguna clave que nombre personas", () => {
      for (const [agrupar, subagrupar, levels] of linkedTrees) {
        expect(requestFromUrl(agrupar, subagrupar)).toStrictEqual(treeRequest(levels));
      }
    });

    for (const [agrupar, subagrupar, levels] of linkedTrees) {
      it(`con agrupar=${agrupar}&subagrupar=${subagrupar}, el pedido del admin da a cada uno solo lo suyo en cada nivel`, async () => {
        const fromUrl = requestFromUrl(agrupar, subagrupar);
        const admin = actorIn(a.workspaceId, a.adminId, { role: "admin" });
        expect(
          treeSummaryOf(await getReportState(admin, settings, fromUrl, now)),
        ).toEqual(expectedTree("everyone", levels, entriesIn(a.workspaceId)));
        for (const { role, userId } of selfOnlyInA()) {
          const actor = actorIn(a.workspaceId, userId, { role });
          expect(
            treeSummaryOf(await getReportState(actor, settings, fromUrl, now)),
          ).toEqual(expectedTree("self", levels, entriesIn(a.workspaceId, userId)));
        }
      });
    }
  });
});
