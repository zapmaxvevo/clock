import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { DomainError, RejectedError } from "@/server/errors";
import { ForbiddenError } from "@/server/permissions";
import type { TimeEntryView } from "@/modules/time-entry/schema";

import { toolEntry } from "./schema";
import { runTool, toolEntryOf, updateChangesOf } from "./tools";

// Las herramientas llaman a la base por estos módulos; acá solo se prueba la forma.
vi.mock("@/modules/time-entry/operations", () => ({}));
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
