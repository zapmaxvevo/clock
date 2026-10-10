import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/server/db";
import { client, membership, project } from "@/server/db/schema";
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
import { descriptionIdOf } from "@/test/report";
import { actorIn, workspaceOf } from "@/test/time-entry";

import { projectRepository } from "@/modules/project/repository";
import { workspaceRepository } from "@/modules/workspace/repository";

import { reportRepository } from "./repository";
import {
  NO_REPORT_FILTERS,
  REPORT_GROUP_BYS,
  reportFiltersOf,
  reportGroupParams,
  reportRangeParams,
  reportSubgroupParams,
  type ReportFilters,
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
 * (criterio 9 de R3), y los subniveles (criterio 21 de R3). R10 suma la semana
 * y el mes, sueltos y en los árboles Mes → Semana → Persona y Persona → Semana →
 * Mes (criterio 9 de R10), y la descripción, suelta y en Descripción → Persona →
 * Proyecto, con una descripción propia en cada entrada (criterio 18 de R10).
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

/** El mes de `entryDay`: el primero de los dos que corta `week`. */
const entryMonth = "2026-09-01";

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

/** Las agrupaciones que se recorren en cada caso de alcance: todas. */
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
 * lleva las etiquetas E y F, la del inactivo E y la del admin F. Cada una lleva
 * una descripción que solo es de su persona; la del inactivo, ninguna.
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
  readonly descriptions: {
    readonly owner: string;
    readonly admin: string;
    readonly manager: string;
    readonly teamManager: string;
    readonly member: string;
    readonly inactive: string;
  };
};

/**
 * Workspace B: su owner, sin proyecto, y el member de A en el proyecto de B,
 * que es del cliente de B, con la etiqueta G de B. El member lleva en B una
 * descripción distinta de la suya en A.
 */
type WorkspaceB = {
  readonly workspaceId: string;
  readonly ownerId: string;
  readonly places: { readonly owner: Place; readonly member: Place };
  readonly descriptions: { readonly owner: string; readonly member: string };
};

let a: WorkspaceA;
let b: WorkspaceB;

/** Una entrada sembrada: lo que el reporte tiene que sumar de ella. */
type SeededEntry = {
  readonly workspaceId: string;
  readonly userId: string;
  readonly minutes: number;
  readonly place: Place;
  /** Tal como se guarda: la cadena vacía es «Sin descripción». */
  readonly description: string;
};

/** Las entradas de `beforeEach`, de A y de B. */
let seeded: SeededEntry[];

/** Cómo nombra un camino a cada id del fixture, para que un fallo se lea. */
let names: Map<string, string>;

/**
 * Una entrada cerrada de `minutes` minutos el martes 29/09, que empieza a las
 * `hour` UTC, en `place` y con `description`: facturable si tiene proyecto.
 */
async function closedEntry(values: {
  readonly workspaceId: string;
  readonly userId: string;
  readonly hour: number;
  readonly minutes: number;
  readonly place: Place;
  readonly description: string;
}) {
  const startedAt = new Date(Date.UTC(2026, 8, 29, values.hour));
  seeded.push(values);
  await seedTimeEntry({
    workspaceId: values.workspaceId,
    userId: values.userId,
    description: values.description,
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
    descriptions: {
      owner: "Planificación del owner de A",
      admin: "Revisión del admin de A",
      manager: "Seguimiento del project_manager de A",
      teamManager: "Coordinación del team_manager de A",
      member: "Tareas del member en A",
      inactive: "",
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
    descriptions: {
      owner: "Cierre del owner de B",
      member: "Tareas del member en B",
    },
  };

  const inA = { workspaceId: a.workspaceId };
  await closedEntry({
    ...inA,
    userId: a.ownerId,
    hour: 10,
    minutes: 10,
    place: a.places.owner,
    description: a.descriptions.owner,
  });
  await closedEntry({
    ...inA,
    userId: a.adminId,
    hour: 11,
    minutes: 20,
    place: a.places.admin,
    description: a.descriptions.admin,
  });
  await closedEntry({
    ...inA,
    userId: a.managerId,
    hour: 12,
    minutes: 30,
    place: a.places.manager,
    description: a.descriptions.manager,
  });
  await closedEntry({
    ...inA,
    userId: a.teamManagerId,
    hour: 13,
    minutes: 40,
    place: a.places.teamManager,
    description: a.descriptions.teamManager,
  });
  await closedEntry({
    ...inA,
    userId: a.memberId,
    hour: 14,
    minutes: 50,
    place: a.places.member,
    description: a.descriptions.member,
  });
  await closedEntry({
    ...inA,
    userId: a.inactiveId,
    hour: 15,
    minutes: 60,
    place: a.places.inactive,
    description: a.descriptions.inactive,
  });
  const inB = { workspaceId: b.workspaceId };
  await closedEntry({
    ...inB,
    userId: a.memberId,
    hour: 17,
    minutes: 70,
    place: b.places.member,
    description: b.descriptions.member,
  });
  await closedEntry({
    ...inB,
    userId: b.ownerId,
    hour: 18,
    minutes: 80,
    place: b.places.owner,
    description: b.descriptions.owner,
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
        case "week":
          return { weekStart: group.weekStart, seconds: group.seconds };
        case "month":
          return { monthStart: group.monthStart, seconds: group.seconds };
        case "description":
          return { description: group.description, seconds: group.seconds };
      }
    }),
  };
}

/**
 * El grupo de descripción que tiene que dar `text` (D-R10-9): `null` si es la
 * cadena vacía; si no, los 32 primeros hexadecimales del SHA-256 del texto en
 * UTF-8 y el texto entero, que en este fixture no pasa de 100 caracteres.
 */
function descriptionOf(text: string) {
  if (text === "") {
    return null;
  }
  return { id: descriptionIdOf(text), text, truncated: false };
}

/**
 * Las filas que deja `summaryOf` de las horas de una persona en un solo lugar
 * y con una sola descripción: una, salvo por etiqueta, donde suma en cada una
 * de las suyas (RP-18).
 */
function rowsOf(
  groupBy: ReportGroupBy,
  values: {
    readonly userId: string;
    readonly inactive?: boolean;
    readonly place: Place;
    readonly description: string;
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
    case "week":
      return [{ weekStart: week.first, seconds }];
    case "month":
      return [{ monthStart: entryMonth, seconds }];
    case "description":
      return [{ description: descriptionOf(values.description), seconds }];
  }
}

/**
 * Lo que ve una persona con su propia entrada de `minutes` minutos en `place` y
 * con `description`: el total es el de la entrada también por etiqueta, aunque
 * las filas sumen más.
 */
function ownSummary(
  groupBy: ReportGroupBy,
  values: {
    readonly userId: string;
    readonly minutes: number;
    readonly place: Place;
    readonly description: string;
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
 * e inactivo; F, las de member y admin. Por fecha, las seis en el mismo día. Por
 * descripción, una fila por persona: la del inactivo es «Sin descripción».
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
    case "week":
      return [{ weekStart: week.first, seconds: 210 * 60 }];
    case "month":
      return [{ monthStart: entryMonth, seconds: 210 * 60 }];
    case "description":
      return [
        { description: descriptionOf(a.descriptions.inactive), seconds: 60 * 60 },
        { description: descriptionOf(a.descriptions.member), seconds: 50 * 60 },
        { description: descriptionOf(a.descriptions.teamManager), seconds: 40 * 60 },
        { description: descriptionOf(a.descriptions.manager), seconds: 30 * 60 },
        { description: descriptionOf(a.descriptions.admin), seconds: 20 * 60 },
        { description: descriptionOf(a.descriptions.owner), seconds: 10 * 60 },
      ];
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
      description: a.descriptions.manager,
    },
    {
      role: "team_manager",
      userId: a.teamManagerId,
      minutes: 40,
      place: a.places.teamManager,
      description: a.descriptions.teamManager,
    },
    {
      role: "member",
      userId: a.memberId,
      minutes: 50,
      place: a.places.member,
      description: a.descriptions.member,
    },
  ] as const;
}

/**
 * Los árboles del criterio 21 de R3, de tres niveles y uno con la etiqueta
 * arriba, los del criterio 9 de R10, con el tiempo arriba y en el medio, y el
 * del criterio 18 de R10, con la descripción arriba.
 */
const trees: readonly (readonly ReportGroupBy[])[] = [
  ["person", "project", "date"],
  ["tag", "task", "person"],
  ["month", "week", "person"],
  ["person", "week", "month"],
  ["description", "person", "project"],
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
    case "week":
      return `semana ${group.weekStart}`;
    case "month":
      return `mes ${group.monthStart}`;
    case "description":
      return `descripcion ${group.description?.text ?? "sin"}`;
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
    case "week":
      return [`semana ${week.first}`];
    case "month":
      return [`mes ${entryMonth}`];
    case "description":
      return [`descripcion ${entry.description === "" ? "sin" : entry.description}`];
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
 * y con subniveles (criterios 9 y 21 de R3), y sin leer los catálogos de los
 * filtros, el de personas incluido, con `filters` o sin ellos (criterios 12 y
 * 19 de R4).
 */
async function expectForbiddenWithoutReading(
  actor: Actor,
  filters: ReportFilters = NO_REPORT_FILTERS,
) {
  const byLevels = vi.spyOn(reportRepository, "totalsByLevels");
  const entryTotals = vi.spyOn(reportRepository, "entryTotals");
  const clients = vi.spyOn(projectRepository, "listClients");
  const projects = vi.spyOn(projectRepository, "listAllProjects");
  const listPeople = vi.spyOn(workspaceRepository, "listPeople");
  const transaction = vi.spyOn(db, "transaction");
  try {
    const requests = [
      ...[null, ...groupBys].map(request),
      ...trees.map((levels) => treeRequest(levels)),
    ];
    for (const forbidden of requests) {
      expect(
        await getReportState(actor, settings, { ...forbidden, filters }, now),
      ).toEqual({ kind: "forbidden" });
    }
    expect(byLevels).not.toHaveBeenCalled();
    expect(entryTotals).not.toHaveBeenCalled();
    expect(clients).not.toHaveBeenCalled();
    expect(projects).not.toHaveBeenCalled();
    expect(listPeople).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  } finally {
    byLevels.mockRestore();
    entryTotals.mockRestore();
    clients.mockRestore();
    projects.mockRestore();
    listPeople.mockRestore();
    transaction.mockRestore();
  }
}

describe("el alcance por rol (criterio 4, D-R2a-2; criterio 11 de R2b; criterio 9 de R3; criterios 9 y 18 de R10)", () => {
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
          description: a.descriptions.manager,
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
          description: a.descriptions.teamManager,
        }),
      );
    }
  });

  it("member ve solo lo propio, y en A no ve sus horas de B (RP-01)", async () => {
    const actor = actorIn(a.workspaceId, a.memberId);
    for (const groupBy of groupBys) {
      expect(summaryOf(await reportOf(actor, groupBy))).toEqual(
        ownSummary(groupBy, {
          userId: a.memberId,
          minutes: 50,
          place: a.places.member,
          description: a.descriptions.member,
        }),
      );
    }
    // Sin agrupación, por persona: la misma fila.
    expect(summaryOf(await reportOf(actor, null))).toEqual(
      ownSummary("person", {
        userId: a.memberId,
        minutes: 50,
        place: a.places.member,
        description: a.descriptions.member,
      }),
    );
  });

  it("la misma persona, en B, ve solo lo suyo de B", async () => {
    const actor = actorIn(b.workspaceId, a.memberId);
    for (const groupBy of groupBys) {
      expect(summaryOf(await reportOf(actor, groupBy))).toEqual(
        ownSummary(groupBy, {
          userId: a.memberId,
          minutes: 70,
          place: b.places.member,
          description: b.descriptions.member,
        }),
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
        // Por fecha, semana y mes, las dos entradas de B caen en el mismo tramo;
        // por tarea, las dos van sin tarea: una fila con las dos.
        groups:
          groupBy === "date" || groupBy === "week" || groupBy === "month"
            ? rowsOf(groupBy, {
                userId: b.ownerId,
                place: noProject,
                description: b.descriptions.owner,
                seconds: 150 * 60,
              })
            : groupBy === "task"
              ? [{ taskId: null, seconds: 150 * 60 }]
              : [
                  ...rowsOf(groupBy, {
                    userId: b.ownerId,
                    place: b.places.owner,
                    description: b.descriptions.owner,
                    seconds: 80 * 60,
                  }),
                  ...rowsOf(groupBy, {
                    userId: a.memberId,
                    place: b.places.member,
                    description: b.descriptions.member,
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
        ownSummary(groupBy, {
          userId: a.ownerId,
          minutes: 10,
          place: a.places.owner,
          description: a.descriptions.owner,
        }),
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

  it("un owner activo al que can() le niega report.view no lee nada, tampoco con personas", async () => {
    permissionOverrides.denied.push({ userId: a.ownerId, action: "report.view" });
    const owner = actorIn(a.workspaceId, a.ownerId, { role: "owner" });
    await expectForbiddenWithoutReading(owner);
    await expectForbiddenWithoutReading(owner, {
      ...NO_REPORT_FILTERS,
      people: [a.memberId],
    });
  });
});

describe("el enlace ajeno (criterio 5, RP-32; criterio 11 de R2b; criterio 9 de R3; criterios 9 y 18 de R10)", () => {
  /** El valor de `agrupar` que escribe la URL y la agrupación que tiene que salir. */
  const linkedGroupBys = [
    ["proyecto", "project"],
    ["cliente", "client"],
    ["tarea", "task"],
    ["etiqueta", "tag"],
    ["fecha", "date"],
    ["semana", "week"],
    ["mes", "month"],
    ["descripcion", "description"],
  ] as const;

  /**
   * Lo que la página recibe de un enlace de un admin, con claves armadas a mano:
   * `personas` repetido, que el esquema descarta entero (RP-32).
   */
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
      filters: reportFiltersOf(searchParams),
    };
  }

  // `personas` bien formado es un filtro desde R4: está en el criterio 19 de R4.
  it("los esquemas no dejan pasar persona, userId, alcance ni personas repetido", () => {
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
      for (const { role, userId, minutes, place, description } of selfOnlyInA()) {
        const actor = actorIn(a.workspaceId, userId, { role });
        expect(summaryOf(await getReportState(actor, settings, fromUrl, now))).toEqual(
          ownSummary(groupBy, { userId, minutes, place, description }),
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

describe("el alcance en cada nivel (criterio 21 de R3; criterios 9 y 18 de R10)", () => {
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
      ["mes", "semana,persona", ["month", "week", "person"]],
      ["persona", "semana,mes", ["person", "week", "month"]],
      ["descripcion", "persona,proyecto", ["description", "person", "project"]],
    ] as const;

    /**
     * Lo que la página recibe de un enlace de un admin, con claves armadas a
     * mano: `personas` repetido, que el esquema descarta entero (RP-32).
     */
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
        filters: reportFiltersOf(searchParams),
      };
    }

    it("los esquemas no dejan pasar persona, userId, alcance ni personas repetido", () => {
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

describe("el texto de las entradas que no se ven no viaja (criterio 18 de R10)", () => {
  /** Las descripciones de `entries`, sin la cadena vacía y sin repetir. */
  function textsOf(entries: readonly SeededEntry[]): string[] {
    return [
      ...new Set(entries.map((entry) => entry.description).filter((text) => text !== "")),
    ];
  }

  /**
   * Cada agrupación sola y cada árbol, sin filtros y con todas las personas de A
   * y la de B elegidas, como en un enlace que arma un admin (D-R4-4).
   */
  function requests(): ReportRequest[] {
    const everybody: ReportFilters = {
      ...NO_REPORT_FILTERS,
      people: [
        a.ownerId,
        a.adminId,
        a.managerId,
        a.teamManagerId,
        a.memberId,
        a.inactiveId,
        b.ownerId,
      ],
    };
    return [...groupBys.map((groupBy) => [groupBy]), ...trees].flatMap((levels) => [
      treeRequest(levels),
      { ...treeRequest(levels), filters: everybody },
    ]);
  }

  /**
   * El estado entero, tal como viaja, no contiene ningún texto sembrado fuera de
   * `seen`; por descripción, contiene todos los de `seen`.
   */
  async function expectOnlyTextsOf(actor: Actor, seen: readonly SeededEntry[]) {
    const shown = textsOf(seen);
    const hidden = textsOf(seeded).filter((text) => !shown.includes(text));
    expect(hidden).not.toEqual([]);
    for (const requested of requests()) {
      const state = await getReportState(actor, settings, requested, now);
      const context = `${nameOf(actor.userId)}, ${[requested.groupBy, ...requested.subgroups].join(" → ")}, ${requested.filters.people.length} personas`;
      expect(state.kind, context).toBe("ready");
      const payload = JSON.stringify(state);
      for (const text of hidden) {
        expect(payload, context).not.toContain(text);
      }
      if (requested.groupBy === "description") {
        for (const text of shown) {
          expect(payload, context).toContain(text);
        }
      }
    }
  }

  it("project_manager, team_manager y member no reciben el texto de ninguna entrada ajena, con ninguna agrupación ni con personas", async () => {
    for (const { role, userId } of selfOnlyInA()) {
      await expectOnlyTextsOf(
        actorIn(a.workspaceId, userId, { role }),
        entriesIn(a.workspaceId, userId),
      );
    }
  });

  it("un owner al que can() le niega timeEntry.others.view recibe solo sus textos", async () => {
    permissionOverrides.denied.push({
      userId: a.ownerId,
      action: "timeEntry.others.view",
    });
    await expectOnlyTextsOf(
      actorIn(a.workspaceId, a.ownerId, { role: "owner" }),
      entriesIn(a.workspaceId, a.ownerId),
    );
  });

  it("la persona miembro de A y de B, en B, no recibe sus textos de A ni los del owner de B", async () => {
    await expectOnlyTextsOf(
      actorIn(b.workspaceId, a.memberId),
      entriesIn(b.workspaceId, a.memberId),
    );
  });

  it("owner y admin de A reciben los textos de A y ninguno de B", async () => {
    for (const role of ["owner", "admin"] as const) {
      await expectOnlyTextsOf(
        actorIn(a.workspaceId, role === "owner" ? a.ownerId : a.adminId, { role }),
        entriesIn(a.workspaceId),
      );
    }
  });

  it("el owner de B no recibe ningún texto de A", async () => {
    await expectOnlyTextsOf(
      actorIn(b.workspaceId, b.ownerId, { role: "owner" }),
      entriesIn(b.workspaceId),
    );
  });
});

/** Cada agrupación sola y dos árboles de dos niveles con el alcance abajo. */
const shapes: readonly (readonly ReportGroupBy[])[] = [
  ...groupBys.map((groupBy) => [groupBy]),
  ["project", "person"],
  ["tag", "project"],
];

function filtered(
  levels: readonly ReportGroupBy[],
  filters: ReportFilters,
): ReportRequest {
  return { ...treeRequest(levels), filters };
}

/** Lo que decide el alcance de un árbol, más los filtros que el estado dice aplicados. */
function filteredSummaryOf(state: ReportState) {
  if (state.kind !== "ready") {
    return state;
  }
  return { ...treeSummaryOf(state), filters: state.filters };
}

/**
 * D-R4-3: dentro de un filtro, o; entre filtros, y. «Sin proyecto» solo en el
 * de proyecto; el de cliente deja afuera lo que no tiene proyecto. Las personas
 * elegidas son las del alcance angostado (D-R4-4).
 */
function passes(entry: SeededEntry, filters: ReportFilters): boolean {
  const { place } = entry;
  const byPerson = filters.people.length === 0 || filters.people.includes(entry.userId);
  const byProject =
    (filters.projects.length === 0 && !filters.withoutProject) ||
    (place.projectId === null
      ? filters.withoutProject
      : filters.projects.includes(place.projectId));
  const byClient =
    filters.clients.length === 0 ||
    (place.clientId !== null && filters.clients.includes(place.clientId));
  return byPerson && byProject && byClient;
}

/** El árbol de `entries` que pasan `applied`, con `applied` como los filtros del estado. */
function expectedFiltered(
  scope: "everyone" | "self",
  levels: readonly ReportGroupBy[],
  entries: readonly SeededEntry[],
  applied: ReportFilters,
) {
  return {
    ...expectedTree(
      scope,
      levels,
      entries.filter((entry) => passes(entry, applied)),
    ),
    filters: applied,
  };
}

describe("los filtros de cliente y de proyecto dentro del alcance (criterio 12 de R4)", () => {
  /**
   * El fixture suma, en A, el cliente C2 con su proyecto Q, donde cargan el
   * owner (con la etiqueta E) y el member; en B, otro cliente con su proyecto QB,
   * donde carga el owner de B. P y el cliente de A pasan a llamarse «P» y «C1»:
   * así el orden de los catálogos, el de `compareNames`, es fijo.
   */
  let clientA2Id: string;
  let projectQId: string;
  /** El cliente y el proyecto de B donde carga el member de A. */
  let clientBId: string;
  let projectBId: string;
  let clientB2Id: string;
  let projectQBId: string;

  beforeEach(async () => {
    await db.update(client).set({ name: "C1" }).where(eq(client.id, a.clientId));
    await db.update(project).set({ name: "P" }).where(eq(project.id, a.projectId));
    const clientA2 = await seedClient({ workspaceId: a.workspaceId, name: "C2" });
    const projectQ = await seedProject({
      workspaceId: a.workspaceId,
      clientId: clientA2.id,
      name: "Q",
    });
    const clientB2 = await seedClient({ workspaceId: b.workspaceId, name: "C3" });
    const projectQB = await seedProject({
      workspaceId: b.workspaceId,
      clientId: clientB2.id,
      name: "QB",
    });
    const { clientId, projectId } = b.places.member;
    if (clientId === null || projectId === null) {
      throw new Error("El member de A carga en B en un proyecto con cliente.");
    }
    clientBId = clientId;
    projectBId = projectId;
    clientA2Id = clientA2.id;
    projectQId = projectQ.id;
    clientB2Id = clientB2.id;
    projectQBId = projectQB.id;
    names.set(clientA2.id, "C2");
    names.set(projectQ.id, "Q");
    names.set(clientB2.id, "C3");
    names.set(projectQB.id, "QB");

    const inQ = { projectId: projectQ.id, clientId: clientA2.id, taskId: null };
    await closedEntry({
      workspaceId: a.workspaceId,
      userId: a.ownerId,
      hour: 19,
      minutes: 25,
      place: { ...inQ, tagIds: [a.tagEId] },
      description: a.descriptions.owner,
    });
    await closedEntry({
      workspaceId: a.workspaceId,
      userId: a.memberId,
      hour: 20,
      minutes: 35,
      place: { ...inQ, tagIds: [] },
      description: a.descriptions.member,
    });
    await closedEntry({
      workspaceId: b.workspaceId,
      userId: b.ownerId,
      hour: 21,
      minutes: 45,
      place: {
        projectId: projectQB.id,
        clientId: clientB2.id,
        taskId: null,
        tagIds: [],
      },
      description: b.descriptions.owner,
    });
  });

  /**
   * Los pedidos con ids de A, todos en su catálogo: lo pedido es lo aplicado.
   * Cubren o dentro de un filtro, y entre filtros, «Sin proyecto» con un
   * proyecto y un cliente con «Sin proyecto» elegido.
   */
  function filtersInA(): readonly ReportFilters[] {
    return [
      { people: [], clients: [], projects: [a.projectId], withoutProject: false },
      { people: [], clients: [clientA2Id], projects: [], withoutProject: false },
      { people: [], clients: [], projects: [projectQId], withoutProject: true },
      {
        people: [],
        clients: [a.clientId],
        projects: [a.projectId, projectQId],
        withoutProject: true,
      },
    ];
  }

  function everyoneIn(workspaceId: string) {
    return actorIn(workspaceId, workspaceId === a.workspaceId ? a.ownerId : b.ownerId, {
      role: "owner",
    });
  }

  /** Owner y admin de A, que ven a todos. */
  function everyoneInAActors() {
    return [
      everyoneIn(a.workspaceId),
      actorIn(a.workspaceId, a.adminId, { role: "admin" }),
    ];
  }

  /** Cada pedido de `cases` en cada forma, contra lo que tiene que ver `actor`. */
  async function expectFilteredView(
    actor: Actor,
    scope: "everyone" | "self",
    entries: readonly SeededEntry[],
    cases: readonly {
      readonly requested: ReportFilters;
      readonly applied: ReportFilters;
    }[],
  ) {
    for (const { requested, applied } of cases) {
      for (const levels of shapes) {
        const state = await getReportState(
          actor,
          settings,
          filtered(levels, requested),
          now,
        );
        expect(
          filteredSummaryOf(state),
          `${nameOf(actor.userId)}, ${levels.join(" → ")}, ${JSON.stringify(requested)}`,
        ).toEqual(expectedFiltered(scope, levels, entries, applied));
      }
    }
  }

  const asApplied = (filters: ReportFilters) => ({
    requested: filters,
    applied: filters,
  });

  it("owner y admin de A ven lo de todos en A filtrado, en cada nivel y en el total", async () => {
    for (const actor of everyoneInAActors()) {
      await expectFilteredView(
        actor,
        "everyone",
        entriesIn(a.workspaceId),
        filtersInA().map(asApplied),
      );
    }
  });

  it("project_manager, team_manager y member ven solo lo propio filtrado, en cada nivel y en el total", async () => {
    for (const { role, userId } of selfOnlyInA()) {
      await expectFilteredView(
        actorIn(a.workspaceId, userId, { role }),
        "self",
        entriesIn(a.workspaceId, userId),
        filtersInA().map(asApplied),
      );
    }
  });

  it("un owner al que can() le niega timeEntry.others.view ve solo lo propio filtrado", async () => {
    permissionOverrides.denied.push({
      userId: a.ownerId,
      action: "timeEntry.others.view",
    });
    await expectFilteredView(
      everyoneIn(a.workspaceId),
      "self",
      entriesIn(a.workspaceId, a.ownerId),
      filtersInA().map(asApplied),
    );
  });

  it("un filtro que solo elige horas ajenas no le muestra nada a quien ve lo propio", async () => {
    // Q tiene horas del owner y del member; el project_manager no cargó en Q.
    const onlyQ: ReportFilters = {
      people: [],
      clients: [],
      projects: [projectQId],
      withoutProject: false,
    };
    await expectFilteredView(
      actorIn(a.workspaceId, a.managerId, { role: "project_manager" }),
      "self",
      [],
      [asApplied(onlyQ)],
    );
  });

  describe("desde la URL, con reportFiltersOf", () => {
    /** Los valores de `agrupar` y `subagrupar` de cada árbol, como los escribe la URL. */
    const linkedTrees = [
      ["proyecto", "persona", ["project", "person"]],
      ["etiqueta", "proyecto", ["tag", "project"]],
      ["persona", "", ["person"]],
    ] as const;

    /** Cada lista ordenada por unidades de código y `sin-proyecto` al final, como la escribe la aplicación. */
    function searchParamsOf(agrupar: string, subagrupar: string) {
      return {
        desde: week.first,
        hasta: week.last,
        agrupar,
        ...(subagrupar === "" ? {} : { subagrupar }),
        clientes: a.clientId,
        proyectos: [...[a.projectId, projectQId].sort(), "sin-proyecto"].join(","),
      };
    }

    function requestFromUrl(agrupar: string, subagrupar: string): ReportRequest {
      const searchParams = searchParamsOf(agrupar, subagrupar);
      const range = reportRangeParams.safeParse(searchParams);
      const groupBy = reportGroupParams.safeParse(searchParams);
      const subgroups =
        subagrupar === ""
          ? { success: true as const, data: [] }
          : reportSubgroupParams.safeParse(searchParams);
      if (!range.success || !groupBy.success || !subgroups.success) {
        throw new Error("El enlace del admin no pasó los esquemas.");
      }
      return {
        range: range.data,
        groupBy: groupBy.data,
        subgroups: subgroups.data,
        filters: reportFiltersOf(searchParams),
      };
    }

    /** C1 con P, Q y «Sin proyecto», en el orden del catálogo: solo lo de P. */
    function appliedFromUrl(): ReportFilters {
      return {
        people: [],
        clients: [a.clientId],
        projects: [a.projectId, projectQId],
        withoutProject: true,
      };
    }

    it("los filtros del enlace pasan los esquemas tal como están en la URL", () => {
      for (const [agrupar, subagrupar] of linkedTrees) {
        expect(requestFromUrl(agrupar, subagrupar).filters).toStrictEqual({
          people: [],
          clients: [a.clientId],
          projects: [a.projectId, projectQId].sort(),
          withoutProject: true,
        });
      }
    });

    it("el pedido que arma un admin da al admin lo de todos filtrado y a cada uno solo lo propio filtrado", async () => {
      for (const [agrupar, subagrupar, levels] of linkedTrees) {
        const fromUrl = requestFromUrl(agrupar, subagrupar);
        const admin = actorIn(a.workspaceId, a.adminId, { role: "admin" });
        expect(
          filteredSummaryOf(await getReportState(admin, settings, fromUrl, now)),
        ).toEqual(
          expectedFiltered(
            "everyone",
            levels,
            entriesIn(a.workspaceId),
            appliedFromUrl(),
          ),
        );
        for (const { role, userId } of selfOnlyInA()) {
          const actor = actorIn(a.workspaceId, userId, { role });
          expect(
            filteredSummaryOf(await getReportState(actor, settings, fromUrl, now)),
            `${role}, agrupar=${agrupar}&subagrupar=${subagrupar}`,
          ).toEqual(
            expectedFiltered(
              "self",
              levels,
              entriesIn(a.workspaceId, userId),
              appliedFromUrl(),
            ),
          );
        }
      }
    });
  });

  describe("los ids de otro workspace (RP-34)", () => {
    /** Todos los ids de B: los dos clientes y los dos proyectos. */
    function idsOfB(): ReportFilters {
      return {
        people: [],
        clients: [clientBId, clientB2Id],
        projects: [projectBId, projectQBId],
        withoutProject: false,
      };
    }

    function idsOfA(withoutProject: boolean): ReportFilters {
      return {
        people: [],
        clients: [a.clientId, clientA2Id],
        projects: [a.projectId, projectQId],
        withoutProject,
      };
    }

    it("en A, los ids de B se ignoran: sin filtros, cada uno ve lo que ve sin ellos", async () => {
      const ignored = { requested: idsOfB(), applied: NO_REPORT_FILTERS };
      for (const actor of everyoneInAActors()) {
        await expectFilteredView(actor, "everyone", entriesIn(a.workspaceId), [ignored]);
      }
      for (const { role, userId } of selfOnlyInA()) {
        await expectFilteredView(
          actorIn(a.workspaceId, userId, { role }),
          "self",
          entriesIn(a.workspaceId, userId),
          [ignored],
        );
      }
    });

    it("en A, junto a ids de A, los de B se ignoran y los de A se aplican", async () => {
      const mixed = {
        requested: {
          people: [],
          clients: [clientBId, a.clientId, clientB2Id],
          projects: [projectQBId, a.projectId],
          withoutProject: false,
        },
        applied: {
          people: [],
          clients: [a.clientId],
          projects: [a.projectId],
          withoutProject: false,
        },
      };
      for (const actor of everyoneInAActors()) {
        await expectFilteredView(actor, "everyone", entriesIn(a.workspaceId), [mixed]);
      }
      await expectFilteredView(
        actorIn(a.workspaceId, a.memberId),
        "self",
        entriesIn(a.workspaceId, a.memberId),
        [mixed],
      );
    });

    it("el owner de B con ids de A no ve nada de A: los ids se ignoran y ve todo B", async () => {
      await expectFilteredView(
        everyoneIn(b.workspaceId),
        "everyone",
        entriesIn(b.workspaceId),
        [
          { requested: idsOfA(false), applied: NO_REPORT_FILTERS },
          // «Sin proyecto» no es un id: queda y elige lo de B sin proyecto.
          {
            requested: idsOfA(true),
            applied: { people: [], clients: [], projects: [], withoutProject: true },
          },
          {
            requested: {
              people: [],
              clients: [],
              projects: [a.projectId, projectQBId],
              withoutProject: false,
            },
            applied: {
              people: [],
              clients: [],
              projects: [projectQBId],
              withoutProject: false,
            },
          },
          {
            requested: {
              people: [],
              clients: [a.clientId, clientB2Id],
              projects: [],
              withoutProject: false,
            },
            applied: {
              people: [],
              clients: [clientB2Id],
              projects: [],
              withoutProject: false,
            },
          },
        ],
      );
    });

    it("la persona miembro de A y de B, en B, con ids de A ve solo lo suyo de B", async () => {
      await expectFilteredView(
        actorIn(b.workspaceId, a.memberId),
        "self",
        entriesIn(b.workspaceId, a.memberId),
        [
          { requested: idsOfA(false), applied: NO_REPORT_FILTERS },
          {
            requested: {
              people: [],
              clients: [],
              projects: [a.projectId, projectQId, projectBId],
              withoutProject: false,
            },
            applied: {
              people: [],
              clients: [],
              projects: [projectBId],
              withoutProject: false,
            },
          },
        ],
      );
    });
  });

  describe("membresía no activa con filtros (criterio 9 de R4)", () => {
    for (const status of notActive) {
      it(`${status}: ni el owner ni un member leen, ni los catálogos`, async () => {
        await db
          .update(membership)
          .set({ status })
          .where(
            and(
              eq(membership.workspaceId, a.workspaceId),
              eq(membership.userId, a.ownerId),
            ),
          );
        const memberId = await seedMember(a.workspaceId, "member", status);
        const withPeople: ReportFilters = {
          ...NO_REPORT_FILTERS,
          people: [a.memberId, a.adminId],
          projects: [a.projectId],
        };
        for (const filters of [...filtersInA(), withPeople]) {
          await expectForbiddenWithoutReading(
            actorIn(a.workspaceId, a.ownerId, { role: "owner", status }),
            filters,
          );
          await expectForbiddenWithoutReading(
            actorIn(a.workspaceId, memberId, { status }),
            filters,
          );
        }
      });
    }
  });
});

describe("el filtro de personas dentro del alcance (criterio 19 de R4; criterios 9 y 18 de R10)", () => {
  /**
   * El fixture suma, en A, una persona con un id como los de Better Auth, de 32
   * alfanuméricos con mayúsculas, que carga en P con E y F, y una invitada que
   * carga sin proyecto. La aplicación no produce una invitada con horas: se
   * siembra por base (§0).
   */
  const betterAuthId = "Kq7RbX2mN9pLs4TvW8yZc3HdF6gJ1aE5";
  const unknownId = "NoExiste0123456789abcdefABCDEF00";
  let invitedId: string;

  beforeEach(async () => {
    await seedMember(a.workspaceId, "member", "active", betterAuthId);
    invitedId = await seedMember(a.workspaceId, "member", "invited");
    names.set(betterAuthId, "Better Auth");
    names.set(invitedId, "invitada");
    await closedEntry({
      workspaceId: a.workspaceId,
      userId: betterAuthId,
      hour: 19,
      minutes: 15,
      place: a.places.member,
      description: "Soporte de la persona de Better Auth",
    });
    await closedEntry({
      workspaceId: a.workspaceId,
      userId: invitedId,
      hour: 20,
      minutes: 25,
      place: noProject,
      description: "Pendientes de la invitada",
    });
  });

  /** Las mismas letras con las mayúsculas cambiadas: no es el mismo id (D-R4-2). */
  function swapCase(id: string): string {
    return [...id]
      .map((char) =>
        char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase(),
      )
      .join("");
  }

  function people(...ids: readonly string[]): ReportFilters {
    return { ...NO_REPORT_FILTERS, people: ids };
  }

  /** Las personas que ofrece el filtro en A: activas e inactivas, sin la invitada. */
  function catalogOfA(): readonly string[] {
    return [
      a.ownerId,
      a.adminId,
      a.managerId,
      a.teamManagerId,
      a.memberId,
      a.inactiveId,
      betterAuthId,
    ];
  }

  /** En B: su owner y el member de A. */
  function catalogOfB(): readonly string[] {
    return [b.ownerId, a.memberId];
  }

  /**
   * Lo que decide el alcance de un árbol, con los filtros aplicados y los ids de
   * las personas que ofrece el filtro, o `null` sin filtro de personas. Las
   * listas de personas van ordenadas: el orden del catálogo es del criterio 18.
   */
  function peopleSummaryOf(state: ReportState) {
    if (state.kind !== "ready") {
      return state;
    }
    return {
      ...treeSummaryOf(state),
      filters: { ...state.filters, people: [...state.filters.people].sort() },
      offered: state.filterOptions.people?.map((person) => person.id).sort() ?? null,
    };
  }

  type Seen = {
    readonly scope: "everyone" | "self";
    readonly entries: readonly SeededEntry[];
    /** Las personas que ofrece el filtro, o `null` si no lo hay. */
    readonly offered: readonly string[] | null;
  };

  function expectedView(
    seen: Seen,
    levels: readonly ReportGroupBy[],
    applied: ReportFilters,
  ) {
    const filtered = expectedFiltered(seen.scope, levels, seen.entries, applied);
    return {
      ...filtered,
      filters: { ...applied, people: [...applied.people].sort() },
      offered: seen.offered === null ? null : [...seen.offered].sort(),
    };
  }

  /** Cada pedido de `cases` en cada forma, contra lo que tiene que ver `actor`. */
  async function expectPeopleView(
    actor: Actor,
    seen: Seen,
    cases: readonly {
      readonly requested: ReportFilters;
      readonly applied: ReportFilters;
    }[],
  ) {
    for (const { requested, applied } of cases) {
      for (const levels of shapes) {
        const state = await getReportState(
          actor,
          settings,
          filtered(levels, requested),
          now,
        );
        expect(
          peopleSummaryOf(state),
          `${nameOf(actor.userId)}, ${levels.join(" → ")}, ${JSON.stringify(requested)}`,
        ).toEqual(expectedView(seen, levels, applied));
      }
    }
  }

  /** Lo propio, sin filtro de personas y sin leer el catálogo de personas. */
  async function expectOwnWithoutPeople(
    actor: Actor,
    cases: readonly {
      readonly requested: ReportFilters;
      readonly applied: ReportFilters;
    }[],
  ) {
    const listPeople = vi.spyOn(workspaceRepository, "listPeople");
    try {
      await expectPeopleView(
        actor,
        {
          scope: "self",
          entries: entriesIn(actor.workspaceId, actor.userId),
          offered: null,
        },
        cases,
      );
      expect(listPeople).not.toHaveBeenCalled();
    } finally {
      listPeople.mockRestore();
    }
  }

  const ignored = (requested: ReportFilters) => ({
    requested,
    applied: NO_REPORT_FILTERS,
  });

  /** Lo que un actor sin `timeEntry.others.view` puede pedir: todo se descarta salvo el proyecto. */
  function casesWithoutPeople(userId: string) {
    return [
      ignored(people(a.ownerId, a.adminId, a.inactiveId, betterAuthId)),
      ignored(people(userId)),
      ignored(people(...new Set([userId, a.ownerId, a.memberId, betterAuthId]))),
      ignored(people(b.ownerId)),
      ignored(people(invitedId)),
      ignored(people(swapCase(userId), swapCase(betterAuthId))),
      ignored(people(unknownId)),
      {
        requested: {
          ...people(...new Set([a.adminId, userId])),
          projects: [a.projectId],
        },
        applied: { ...NO_REPORT_FILTERS, projects: [a.projectId] },
      },
    ];
  }

  it("project_manager, team_manager y member con personas ven lo propio y no reciben el catálogo de personas", async () => {
    for (const { role, userId } of selfOnlyInA()) {
      await expectOwnWithoutPeople(
        actorIn(a.workspaceId, userId, { role }),
        casesWithoutPeople(userId),
      );
    }
  });

  it("un owner al que can() le niega timeEntry.others.view, con personas, ve lo propio sin el catálogo", async () => {
    permissionOverrides.denied.push({
      userId: a.ownerId,
      action: "timeEntry.others.view",
    });
    await expectOwnWithoutPeople(
      actorIn(a.workspaceId, a.ownerId, { role: "owner" }),
      casesWithoutPeople(a.ownerId),
    );
  });

  it("la persona miembro de A y de B, en B, con personas ve solo lo suyo de B", async () => {
    await expectOwnWithoutPeople(actorIn(b.workspaceId, a.memberId), [
      ignored(people(b.ownerId)),
      ignored(people(a.memberId, b.ownerId)),
      ignored(people(a.ownerId, betterAuthId)),
    ]);
  });

  /** Owner y admin de A, que ven a todos. */
  function everyoneInAActors() {
    return [
      actorIn(a.workspaceId, a.ownerId, { role: "owner" }),
      actorIn(a.workspaceId, a.adminId, { role: "admin" }),
    ];
  }

  function everyoneSeenInA(): Seen {
    return {
      scope: "everyone",
      entries: entriesIn(a.workspaceId),
      offered: catalogOfA(),
    };
  }

  it("owner y admin de A con [member] ven solo lo del member en A, en cada nivel y en el total", async () => {
    for (const actor of everyoneInAActors()) {
      await expectPeopleView(actor, everyoneSeenInA(), [
        {
          requested: people(a.memberId),
          applied: people(a.memberId),
        },
      ]);
    }
  });

  it("owner y admin de A eligen inactivas, el id de Better Auth tal cual y personas con un proyecto", async () => {
    const applies = (filters: ReportFilters) => ({
      requested: filters,
      applied: filters,
    });
    for (const actor of everyoneInAActors()) {
      await expectPeopleView(actor, everyoneSeenInA(), [
        applies(people(a.memberId, a.inactiveId)),
        applies(people(betterAuthId)),
        applies(people(a.adminId, a.teamManagerId)),
        applies({ ...people(a.memberId, a.adminId), projects: [a.projectId] }),
      ]);
    }
  });

  it("owner y admin de A: la invitada, otro workspace, otras mayúsculas y lo que no existe se ignoran", async () => {
    for (const actor of everyoneInAActors()) {
      await expectPeopleView(actor, everyoneSeenInA(), [
        ignored(people(invitedId)),
        ignored(people(b.ownerId)),
        ignored(people(swapCase(betterAuthId))),
        ignored(people(swapCase(a.memberId))),
        ignored(people(unknownId)),
        ignored(
          people(
            invitedId,
            b.ownerId,
            swapCase(betterAuthId),
            swapCase(a.memberId),
            unknownId,
          ),
        ),
        {
          requested: people(
            b.ownerId,
            swapCase(betterAuthId),
            invitedId,
            a.memberId,
            unknownId,
          ),
          applied: people(a.memberId),
        },
      ]);
    }
  });

  it("la persona miembro de A y de B, elegida por el admin de A, trae solo lo de A; elegida por el owner de B, solo lo de B", async () => {
    await expectPeopleView(
      actorIn(a.workspaceId, a.adminId, { role: "admin" }),
      everyoneSeenInA(),
      [{ requested: people(a.memberId), applied: people(a.memberId) }],
    );
    await expectPeopleView(
      actorIn(b.workspaceId, b.ownerId, { role: "owner" }),
      { scope: "everyone", entries: entriesIn(b.workspaceId), offered: catalogOfB() },
      [{ requested: people(a.memberId), applied: people(a.memberId) }],
    );
  });

  it("el owner de B con ids de A no ve nada de A: los ids se ignoran y ve todo B", async () => {
    await expectPeopleView(
      actorIn(b.workspaceId, b.ownerId, { role: "owner" }),
      { scope: "everyone", entries: entriesIn(b.workspaceId), offered: catalogOfB() },
      [
        ignored(people(a.ownerId, a.adminId, a.inactiveId, betterAuthId, invitedId)),
        ignored(people(a.managerId)),
        {
          requested: people(a.ownerId, a.memberId, betterAuthId),
          applied: people(a.memberId),
        },
      ],
    );
  });

  describe("desde la URL, con reportFiltersOf", () => {
    /** Los valores de `agrupar` y `subagrupar` de cada árbol, como los escribe la URL. */
    const linkedTrees = [
      ["persona", "", ["person"]],
      ["proyecto", "persona", ["project", "person"]],
      ["etiqueta", "proyecto", ["tag", "project"]],
      // Los pedidos de los criterios 9 y 18 de R10.
      ["mes", "semana,persona", ["month", "week", "person"]],
      ["descripcion", "", ["description"]],
      ["descripcion", "persona,proyecto", ["description", "person", "project"]],
    ] as const;

    /** La lista ordenada por unidades de código, como la escribe la aplicación. */
    function requested(): readonly string[] {
      return [a.memberId, betterAuthId, swapCase(a.adminId), invitedId, b.ownerId].sort();
    }

    function requestFromUrl(agrupar: string, subagrupar: string): ReportRequest {
      const searchParams = {
        desde: week.first,
        hasta: week.last,
        agrupar,
        ...(subagrupar === "" ? {} : { subagrupar }),
        personas: requested().join(","),
      };
      const range = reportRangeParams.safeParse(searchParams);
      const groupBy = reportGroupParams.safeParse(searchParams);
      const subgroups =
        subagrupar === ""
          ? { success: true as const, data: [] }
          : reportSubgroupParams.safeParse(searchParams);
      if (!range.success || !groupBy.success || !subgroups.success) {
        throw new Error("El enlace del admin no pasó los esquemas.");
      }
      return {
        range: range.data,
        groupBy: groupBy.data,
        subgroups: subgroups.data,
        filters: reportFiltersOf(searchParams),
      };
    }

    it("personas pasa los esquemas tal como está en la URL, con las mayúsculas", () => {
      for (const [agrupar, subagrupar] of linkedTrees) {
        expect(requestFromUrl(agrupar, subagrupar).filters).toStrictEqual(
          people(...requested()),
        );
      }
    });

    it("el pedido que arma un admin de A da a owner y admin las elegidas de A, a los demás lo propio y al owner de B lo suyo", async () => {
      for (const [agrupar, subagrupar, levels] of linkedTrees) {
        const fromUrl = requestFromUrl(agrupar, subagrupar);
        const context = `agrupar=${agrupar}&subagrupar=${subagrupar}`;
        for (const actor of everyoneInAActors()) {
          expect(
            peopleSummaryOf(await getReportState(actor, settings, fromUrl, now)),
            `${nameOf(actor.userId)}, ${context}`,
          ).toEqual(
            expectedView(everyoneSeenInA(), levels, people(a.memberId, betterAuthId)),
          );
        }
        for (const { role, userId } of selfOnlyInA()) {
          const actor = actorIn(a.workspaceId, userId, { role });
          expect(
            peopleSummaryOf(await getReportState(actor, settings, fromUrl, now)),
            `${role}, ${context}`,
          ).toEqual(
            expectedView(
              { scope: "self", entries: entriesIn(a.workspaceId, userId), offered: null },
              levels,
              NO_REPORT_FILTERS,
            ),
          );
        }
        // En B, el owner de B es del catálogo y el member de A también.
        expect(
          peopleSummaryOf(
            await getReportState(
              actorIn(b.workspaceId, b.ownerId, { role: "owner" }),
              settings,
              fromUrl,
              now,
            ),
          ),
          `owner de B, ${context}`,
        ).toEqual(
          expectedView(
            {
              scope: "everyone",
              entries: entriesIn(b.workspaceId),
              offered: catalogOfB(),
            },
            levels,
            people(a.memberId, b.ownerId),
          ),
        );
      }
    });
  });
});
