import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { DomainError, RejectedError } from "@/server/errors";
import { ForbiddenError } from "@/server/permissions";
import { reportMessages, type ReportReadyState } from "@/modules/report/schema";
import { ReportError } from "@/modules/report/service";
import type { TimeEntryView } from "@/modules/time-entry/schema";

import {
  listPeopleToolOutput,
  mcpMessages,
  summarizeHoursToolOutput,
  toolEntry,
} from "./schema";
import {
  peopleListOf,
  reportToolMessages,
  runTool,
  summaryGroupOf,
  summaryOf,
  toolEntryOf,
  updateChangesOf,
} from "./tools";

// Las herramientas llaman a la base por estos módulos; acá solo se prueba la forma.
vi.mock("@/modules/time-entry/operations", () => ({}));
vi.mock("@/modules/report/operations", () => ({}));
// `ReportError` es del service del reporte, que importa el cliente de la base.
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/modules/project/service", () => ({}));
vi.mock("@/modules/profile/service", () => ({}));

afterEach(() => {
  vi.restoreAllMocks();
});

const messages = { forbidden: "Sin permiso.", unexpected: "Falló." } as const;

const closed: TimeEntryView = {
  id: "8c4f2a9e-3b1d-4c6e-9f0a-1b2c3d4e5f60",
  description: "Revisión",
  startedAt: "2026-10-19T12:00:00.000Z",
  endedAt: "2026-10-20T03:30:59.000Z",
  dayDate: "2026-10-19",
  weekStart: "2026-10-19",
  startLabel: "09:00",
  endLabel: "00:30",
  startClock: "09:00",
  endClock: "00:30",
  extraDays: 1,
  durationSeconds: 15 * 3600 + 30 * 60 + 59,
  durationLabel: "15:30",
  editableTimes: true,
  project: { id: "1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d", name: "Clock", color: "blue" },
  task: { id: "2c3d4e5f-6071-4b8c-9d0e-1f2a3b4c5d6e", name: "Backend" },
  billable: true,
  tags: [{ id: "3d4e5f60-7182-4c9d-8e1f-2a3b4c5d6e7f", name: "Interno" }],
};

describe("toolEntryOf", () => {
  it("una cerrada: horas de pared, los días del cruce y los minutos enteros", () => {
    const entry = toolEntryOf(closed);

    expect(entry).toEqual({
      id: closed.id,
      description: "Revisión",
      date: "2026-10-19",
      start: "09:00",
      end: "00:30",
      extraDays: 1,
      startedAt: closed.startedAt,
      endedAt: closed.endedAt,
      durationMinutes: 15 * 60 + 30,
      running: false,
      project: { id: closed.project?.id, name: "Clock" },
      task: closed.task,
      billable: true,
      tags: closed.tags,
    });
    expect(toolEntry.safeParse(entry).success).toBe(true);
  });

  it("la que corre: sin fin, sin duración y running", () => {
    const entry = toolEntryOf({
      ...closed,
      endedAt: null,
      endLabel: null,
      endClock: null,
      extraDays: 0,
      durationSeconds: null,
      durationLabel: null,
      project: null,
      task: null,
      tags: [],
    });

    expect(entry).toMatchObject({
      end: null,
      endedAt: null,
      durationMinutes: null,
      running: true,
      project: null,
      task: null,
    });
    expect(toolEntry.safeParse(entry).success).toBe(true);
  });
});

describe("updateChangesOf", () => {
  const id = closed.id;

  it("solo los grupos presentes, y tagIds como tags", () => {
    expect(
      updateChangesOf({
        id,
        times: { date: "2026-10-19", start: "09:00", end: "10:00" },
        tagIds: [],
      }),
    ).toEqual({ times: { date: "2026-10-19", start: "09:00", end: "10:00" }, tags: [] });
  });

  it("los seis grupos", () => {
    const project = { projectId: null, taskId: null };
    const runningStart = { date: "2026-10-19", start: "08:00" };

    expect(
      updateChangesOf({
        id,
        description: "",
        project,
        runningStart,
        billable: false,
        tagIds: [closed.tags[0].id],
      }),
    ).toEqual({
      description: "",
      project,
      runningStart,
      billable: false,
      tags: [closed.tags[0].id],
    });
  });

  it("sin ningún campo, vacío: la operación responde bulkNoChanges", () => {
    expect(updateChangesOf({ id })).toEqual({});
  });
});

describe("runTool (D-MCP-9)", () => {
  it("con éxito, el texto de content es el JSON de structuredContent", async () => {
    const result = await runTool(
      () => Promise.resolve(closed),
      (view) => ({ entry: toolEntryOf(view) }),
      messages,
    );

    expect(result.isError).toBeUndefined();
    expect(result.content).toEqual([
      { type: "text", text: JSON.stringify(result.structuredContent) },
    ]);
    expect(result.structuredContent).toEqual({ entry: toolEntryOf(closed) });
  });

  it("un error de dominio es un resultado isError con su código y su texto", async () => {
    const result = await runTool(
      () => Promise.reject(new DomainError("not_found", "Esa entrada ya no existe.")),
      () => ({}),
      messages,
    );

    expect(result).toEqual({
      isError: true,
      content: [{ type: "text", text: "Esa entrada ya no existe." }],
      structuredContent: { code: "not_found", message: "Esa entrada ya no existe." },
    });
  });

  it("un rechazo en masa lleva sus filas", async () => {
    const rejections = [{ id: "e1", code: "forbidden", message: "No." }];
    const result = await runTool(
      () => Promise.reject(new RejectedError("Nada cambió.", rejections)),
      () => ({}),
      messages,
    );

    expect(result.structuredContent).toEqual({
      code: "rejected",
      message: "Nada cambió.",
      rejections,
    });
  });

  it("uno de permiso, de Zod o inesperado, con los textos del módulo", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const zodError = z.string().safeParse(1).error;

    const forbidden = await runTool(
      () => Promise.reject(new ForbiddenError("timeEntry.own.create")),
      () => ({}),
      messages,
    );
    const invalid = await runTool(
      () => Promise.reject(zodError),
      () => ({}),
      messages,
    );
    const unexpected = await runTool(
      () => Promise.reject(new Error("socket")),
      () => ({}),
      messages,
    );

    expect(forbidden.structuredContent).toEqual({
      code: "forbidden",
      message: "Sin permiso.",
    });
    expect(invalid.structuredContent).toMatchObject({ code: "validation" });
    expect(unexpected.structuredContent).toEqual({
      code: "unexpected",
      message: "Falló.",
    });
    expect([forbidden.isError, invalid.isError, unexpected.isError]).toEqual([
      true,
      true,
      true,
    ]);
  });
});

const PROJECT = {
  id: "1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d",
  name: "Clock",
  color: "blue",
} as const;
const CLIENT = { id: "4e5f6071-8293-4dae-8f1a-2b3c4d5e6f70", name: "Acme" };
const TASK = { id: "2c3d4e5f-6071-4b8c-9d0e-1f2a3b4c5d6e", name: "Backend" };
const TAG = { id: "3d4e5f60-7182-4c9d-8e1f-2a3b4c5d6e7f", name: "Interno" };
const DESCRIPTION = {
  id: "0123456789abcdef0123456789abcdef",
  text: "Revisión",
  truncated: true,
};

describe("summaryGroupOf (D-MCPE-5)", () => {
  it.each([
    [
      { kind: "person", userId: "AbC123", name: "Ana", inactive: true, seconds: 119 },
      { kind: "person", key: "AbC123", name: "Ana", minutes: 1, inactive: true },
    ],
    [
      { kind: "project", project: PROJECT, client: CLIENT, seconds: 3600 },
      { kind: "project", key: PROJECT.id, name: "Clock", minutes: 60, client: "Acme" },
    ],
    [
      { kind: "project", project: null, client: null, seconds: 59 },
      { kind: "project", key: null, name: null, minutes: 0, client: null },
    ],
    [
      { kind: "client", client: CLIENT, seconds: 60 },
      { kind: "client", key: CLIENT.id, name: "Acme", minutes: 1 },
    ],
    [
      { kind: "client", client: null, seconds: 60 },
      { kind: "client", key: null, name: null, minutes: 1 },
    ],
    [
      { kind: "task", task: TASK, project: PROJECT, seconds: 60 },
      { kind: "task", key: TASK.id, name: "Backend", minutes: 1, project: "Clock" },
    ],
    [
      { kind: "task", task: null, project: null, seconds: 60 },
      { kind: "task", key: null, name: null, minutes: 1, project: null },
    ],
    [
      { kind: "tag", tag: TAG, seconds: 60 },
      { kind: "tag", key: TAG.id, name: "Interno", minutes: 1 },
    ],
    [
      { kind: "tag", tag: null, seconds: 60 },
      { kind: "tag", key: null, name: null, minutes: 1 },
    ],
    [
      { kind: "date", dayKey: "2026-09-29", label: "mar, 29/09", seconds: 60 },
      { kind: "date", key: "2026-09-29", name: "2026-09-29", minutes: 1 },
    ],
    [
      {
        kind: "week",
        weekStart: "2026-09-28",
        label: "28/09 – 04/10",
        partial: "01/10 – 04/10",
        seconds: 60,
      },
      { kind: "week", key: "2026-09-28", name: "2026-09-28", minutes: 1 },
    ],
    [
      {
        kind: "month",
        monthStart: "2026-09-01",
        label: "septiembre",
        partial: null,
        seconds: 60,
      },
      { kind: "month", key: "2026-09-01", name: "2026-09-01", minutes: 1 },
    ],
    [
      { kind: "description", description: DESCRIPTION, seconds: 60 },
      {
        kind: "description",
        key: DESCRIPTION.id,
        name: "Revisión",
        minutes: 1,
        truncated: true,
      },
    ],
    [
      { kind: "description", description: null, seconds: 60 },
      { kind: "description", key: null, name: null, minutes: 1, truncated: false },
    ],
  ] satisfies [ReportReadyState["groups"][number], unknown][])(
    "%o",
    (group, expected) => {
      expect(summaryGroupOf(group)).toEqual(expected);
    },
  );

  it("los tres niveles anidados, cada uno con sus minutos", () => {
    expect(
      summaryGroupOf({
        kind: "person",
        userId: "AbC123",
        name: "Ana",
        inactive: false,
        seconds: 7200,
        children: [
          {
            kind: "date",
            dayKey: "2026-09-29",
            label: "mar, 29/09",
            seconds: 7199,
            children: [{ kind: "description", description: DESCRIPTION, seconds: 7199 }],
          },
        ],
      }),
    ).toEqual({
      kind: "person",
      key: "AbC123",
      name: "Ana",
      minutes: 120,
      inactive: false,
      children: [
        {
          kind: "date",
          key: "2026-09-29",
          name: "2026-09-29",
          minutes: 119,
          children: [
            {
              kind: "description",
              key: DESCRIPTION.id,
              name: "Revisión",
              minutes: 119,
              truncated: true,
            },
          ],
        },
      ],
    });
  });
});

/** Un resumido del service con lo que `summaryOf` lee y lo que tiene que dejar afuera. */
const report: ReportReadyState = {
  kind: "ready",
  todayKey: "2026-10-08",
  range: { first: "2026-09-28", last: "2026-10-04" },
  rangeLabel: "Semana anterior",
  previous: null,
  next: null,
  currentWeek: { first: "2026-10-05", last: "2026-10-11" },
  shortcuts: [],
  groupBy: "person",
  subgroups: ["project"],
  peopleWithoutTime: false,
  levelsShown: 1,
  scope: "self",
  timeZone: "America/Argentina/Buenos_Aires",
  totalSeconds: 119,
  billableSeconds: 59,
  groups: [
    { kind: "person", userId: "AbC123", name: "Ana", inactive: false, seconds: 119 },
  ],
  filters: { people: [], clients: [], projects: [], withoutProject: false },
  filterOptions: { people: null, clients: [], projects: [] },
  chart: null,
};

describe("summaryOf (D-MCPE-5)", () => {
  it("minutos enteros hacia abajo, el período, el alcance y los niveles", () => {
    const summary = summaryOf(report);

    expect(summary).toEqual({
      timezone: "America/Argentina/Buenos_Aires",
      from: "2026-09-28",
      to: "2026-10-04",
      scope: "self",
      groupBy: "person",
      subgroups: ["project"],
      levelsShown: 1,
      totalMinutes: 1,
      billableMinutes: 0,
      groups: [
        { kind: "person", key: "AbC123", name: "Ana", minutes: 1, inactive: false },
      ],
    });
    expect(summarizeHoursToolOutput.parse(summary)).toEqual(summary);
  });

  it("en runTool, el texto de content es el JSON de structuredContent, en las dos herramientas", async () => {
    const summarized = await runTool(
      () => Promise.resolve(report),
      summaryOf,
      reportToolMessages,
    );
    const people = await runTool(
      () =>
        Promise.resolve({
          scope: "everyone" as const,
          people: [
            {
              id: "AbC123",
              name: "Ana",
              email: "ana@empresa.com",
              inactive: false,
              self: true,
            },
          ],
        }),
      peopleListOf,
      reportToolMessages,
    );

    for (const result of [summarized, people]) {
      expect(result.content).toEqual([
        { type: "text", text: JSON.stringify(result.structuredContent) },
      ]);
    }
    expect(listPeopleToolOutput.parse(people.structuredContent)).toEqual(
      people.structuredContent,
    );
  });
});

describe("reportToolMessages (D-MCPE-4)", () => {
  it("un ForbiddenError, solo de report.view, sale con viewForbidden; el ReportError de horas ajenas, con othersForbidden", async () => {
    const view = await runTool(
      () => Promise.reject(new ForbiddenError("report.view")),
      () => ({}),
      reportToolMessages,
    );
    const others = await runTool(
      () => Promise.reject(new ReportError("forbidden", reportMessages.othersForbidden)),
      () => ({}),
      reportToolMessages,
    );
    const timeout = await runTool(
      () => Promise.reject(new ReportError("timeout", reportMessages.summaryTooSlow)),
      () => ({}),
      reportToolMessages,
    );

    expect(view.structuredContent).toEqual({
      code: "forbidden",
      message: reportMessages.viewForbidden,
    });
    expect(others.structuredContent).toEqual({
      code: "forbidden",
      message: reportMessages.othersForbidden,
    });
    expect(timeout.structuredContent).toEqual({
      code: "timeout",
      message: reportMessages.summaryTooSlow,
    });
    expect(reportToolMessages.unexpected).toBe(mcpMessages.unexpected);
  });
});
