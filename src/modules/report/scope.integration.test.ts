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
  seedTimeEntry,
  seedWorkspace,
} from "@/test/factories";
import { actorIn, workspaceOf } from "@/test/time-entry";

import { reportRepository } from "./repository";
import {
  reportGroupParams,
  reportRangeParams,
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
 * agrupaciones por cliente y por fecha con el mismo fixture (criterio 11 de R2b).
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
const groupBys: readonly ReportGroupBy[] = ["person", "project", "client", "date"];

/**
 * Workspace A: owner, admin, `project_manager` responsable de P, `team_manager`,
 * un member que también es miembro de B y un member inactivo. P es del cliente
 * de A. Cada uno tiene una sola entrada el martes 29/09, con una duración que
 * no se repite: en P y facturable, o sin proyecto y no facturable.
 */
type WorkspaceA = {
  readonly workspaceId: string;
  readonly clientId: string;
  readonly projectId: string;
  readonly ownerId: string;
  readonly adminId: string;
  readonly managerId: string;
  readonly teamManagerId: string;
  readonly memberId: string;
  readonly inactiveId: string;
};

/**
 * Workspace B: su owner, sin proyecto, y el member de A en el proyecto de B,
 * que es del cliente de B.
 */
type WorkspaceB = {
  readonly workspaceId: string;
  readonly clientId: string;
  readonly projectId: string;
  readonly ownerId: string;
};

let a: WorkspaceA;
let b: WorkspaceB;

/** Una entrada cerrada de `minutes` minutos el martes 29/09, que empieza a las `hour` UTC. */
async function closedEntry(values: {
  readonly workspaceId: string;
  readonly userId: string;
  readonly hour: number;
  readonly minutes: number;
  readonly projectId: string | null;
}) {
  const startedAt = new Date(Date.UTC(2026, 8, 29, values.hour));
  await seedTimeEntry({
    workspaceId: values.workspaceId,
    userId: values.userId,
    startedAt,
    endedAt: new Date(startedAt.getTime() + values.minutes * 60_000),
    projectId: values.projectId,
    billable: values.projectId !== null,
  });
}

beforeEach(async () => {
  permissionOverrides.denied.length = 0;

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
  a = {
    workspaceId: seededA.workspaceId,
    clientId: clientA.id,
    projectId: projectA.id,
    ownerId: seededA.ownerId,
    adminId,
    managerId,
    teamManagerId,
    memberId,
    inactiveId,
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
  b = {
    workspaceId: seededB.workspaceId,
    clientId: clientB.id,
    projectId: projectB.id,
    ownerId: seededB.ownerId,
  };

  const inA = { workspaceId: a.workspaceId };
  await closedEntry({
    ...inA,
    userId: a.ownerId,
    hour: 10,
    minutes: 10,
    projectId: a.projectId,
  });
  await closedEntry({
    ...inA,
    userId: a.adminId,
    hour: 11,
    minutes: 20,
    projectId: null,
  });
  await closedEntry({
    ...inA,
    userId: a.managerId,
    hour: 12,
    minutes: 30,
    projectId: a.projectId,
  });
  await closedEntry({
    ...inA,
    userId: a.teamManagerId,
    hour: 13,
    minutes: 40,
    projectId: null,
  });
  await closedEntry({
    ...inA,
    userId: a.memberId,
    hour: 14,
    minutes: 50,
    projectId: a.projectId,
  });
  await closedEntry({
    ...inA,
    userId: a.inactiveId,
    hour: 15,
    minutes: 60,
    projectId: a.projectId,
  });
  const inB = { workspaceId: b.workspaceId };
  await closedEntry({
    ...inB,
    userId: a.memberId,
    hour: 17,
    minutes: 70,
    projectId: b.projectId,
  });
  await closedEntry({
    ...inB,
    userId: b.ownerId,
    hour: 18,
    minutes: 80,
    projectId: null,
  });
});

function request(groupBy: ReportRequest["groupBy"]): ReportRequest {
  return { range: week, groupBy };
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
        case "date":
          return { dayKey: group.dayKey, seconds: group.seconds };
      }
    }),
  };
}

/** Dónde está una entrada: su proyecto y el cliente del proyecto, o ninguno. */
type Place = { readonly projectId: string | null; readonly clientId: string | null };

const noProject: Place = { projectId: null, clientId: null };

function inProjectOf(workspace: WorkspaceA | WorkspaceB): Place {
  return { projectId: workspace.projectId, clientId: workspace.clientId };
}

/** La fila que deja `summaryOf` de las horas de una persona en un solo lugar. */
function rowOf(
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
      return { userId: values.userId, inactive: values.inactive ?? false, seconds };
    case "project":
      return { projectId: values.place.projectId, seconds };
    case "client":
      return { clientId: values.place.clientId, seconds };
    case "date":
      return { dayKey: entryDay, seconds };
  }
}

/** Lo que ve una persona con su propia fila de `minutes` minutos en `place`. */
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
    groups: [rowOf(groupBy, { ...values, seconds })],
  };
}

/** Todo A, de la duración mayor a la menor: nada de B. */
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
 * sin proyecto. Por fecha, las seis en el mismo día.
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
      place: inProjectOf(a),
    },
    { role: "team_manager", userId: a.teamManagerId, minutes: 40, place: noProject },
    { role: "member", userId: a.memberId, minutes: 50, place: inProjectOf(a) },
  ] as const;
}

async function expectForbiddenWithoutReading(actor: Actor) {
  const byPerson = vi.spyOn(reportRepository, "totalsByPerson");
  const byProject = vi.spyOn(reportRepository, "totalsByProject");
  const byBucket = vi.spyOn(reportRepository, "totalsByBucket");
  try {
    for (const groupBy of [null, ...groupBys]) {
      expect(await reportOf(actor, groupBy)).toEqual({ kind: "forbidden" });
    }
    expect(byPerson).not.toHaveBeenCalled();
    expect(byProject).not.toHaveBeenCalled();
    expect(byBucket).not.toHaveBeenCalled();
  } finally {
    byPerson.mockRestore();
    byProject.mockRestore();
    byBucket.mockRestore();
  }
}

describe("el alcance por rol (criterio 4, D-R2a-2; criterio 11 de R2b)", () => {
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
        ownSummary(groupBy, { userId: a.managerId, minutes: 30, place: inProjectOf(a) }),
      );
    }
  });

  it("team_manager ve solo lo propio (RP-06)", async () => {
    const actor = actorIn(a.workspaceId, a.teamManagerId, { role: "team_manager" });
    for (const groupBy of groupBys) {
      expect(summaryOf(await reportOf(actor, groupBy))).toEqual(
        ownSummary(groupBy, { userId: a.teamManagerId, minutes: 40, place: noProject }),
      );
    }
  });

  it("member ve solo lo propio, y en A no ve sus horas de B (RP-01)", async () => {
    const actor = actorIn(a.workspaceId, a.memberId);
    for (const groupBy of groupBys) {
      expect(summaryOf(await reportOf(actor, groupBy))).toEqual(
        ownSummary(groupBy, { userId: a.memberId, minutes: 50, place: inProjectOf(a) }),
      );
    }
    // Sin agrupación, por persona: la misma fila.
    expect(summaryOf(await reportOf(actor, null))).toEqual(
      ownSummary("person", { userId: a.memberId, minutes: 50, place: inProjectOf(a) }),
    );
  });

  it("la misma persona, en B, ve solo lo suyo de B", async () => {
    const actor = actorIn(b.workspaceId, a.memberId);
    for (const groupBy of groupBys) {
      expect(summaryOf(await reportOf(actor, groupBy))).toEqual(
        ownSummary(groupBy, { userId: a.memberId, minutes: 70, place: inProjectOf(b) }),
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
        // Por fecha, las dos entradas de B son del mismo día.
        groups:
          groupBy === "date"
            ? [{ dayKey: entryDay, seconds: 150 * 60 }]
            : [
                rowOf(groupBy, {
                  userId: b.ownerId,
                  place: noProject,
                  seconds: 80 * 60,
                }),
                rowOf(groupBy, {
                  userId: a.memberId,
                  place: inProjectOf(b),
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
        ownSummary(groupBy, { userId: a.ownerId, minutes: 10, place: inProjectOf(a) }),
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

describe("el enlace ajeno (criterio 5, RP-32; criterio 11 de R2b)", () => {
  /** El valor de `agrupar` que escribe la URL y la agrupación que tiene que salir. */
  const linkedGroupBys = [
    ["proyecto", "project"],
    ["cliente", "client"],
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
    return { range: range.data, groupBy: groupBy.data };
  }

  it("los esquemas no dejan pasar ninguna clave que nombre personas", () => {
    for (const [agrupar, groupBy] of linkedGroupBys) {
      expect(requestFromUrl(agrupar)).toStrictEqual({ range: week, groupBy });
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

describe("membresía no activa (criterio 11, RP-07)", () => {
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
