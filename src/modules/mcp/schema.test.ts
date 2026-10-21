import { describe, expect, it } from "vitest";

import { DESCRIPTION_MAX, TAGS_MAX } from "@/modules/time-entry/schema";

import {
  createEntryToolInput,
  decideConsentInput,
  listEntriesToolInput,
  listPeopleToolOutput,
  revokeGrantInput,
  startTimerToolInput,
  stopTimerToolInput,
  summarizeHoursToolInput,
  summarizeHoursToolOutput,
  updateEntryToolInput,
} from "./schema";

const ID = "8c4f2a9e-3b1d-4c6e-9f0a-1b2c3d4e5f60";

describe("las entradas de las herramientas fijan la forma (§4.10)", () => {
  it("create_entry: el id es opcional y, si viene, un UUID v4", () => {
    const base = { date: "2026-10-19", start: "09:00", end: "10:00" };

    expect(createEntryToolInput.safeParse(base).success).toBe(true);
    expect(createEntryToolInput.safeParse({ ...base, id: ID }).success).toBe(true);
    expect(
      createEntryToolInput.safeParse({
        ...base,
        id: "00000000-0000-1000-8000-000000000000",
      }).success,
    ).toBe(false);
  });

  it("create_entry: la descripción y las etiquetas con los topes de siempre", () => {
    const base = { date: "2026-10-19", start: "09:00", end: "10:00" };

    expect(
      createEntryToolInput.safeParse({
        ...base,
        description: "x".repeat(DESCRIPTION_MAX + 1),
      }).success,
    ).toBe(false);
    expect(
      createEntryToolInput.safeParse({ ...base, tagIds: Array(TAGS_MAX + 1).fill(ID) })
        .success,
    ).toBe(false);
    expect(createEntryToolInput.safeParse({ ...base, projectId: null }).success).toBe(
      true,
    );
  });

  it("los textos finos los aplica el módulo: el día y la hora son texto acá", () => {
    expect(
      createEntryToolInput.safeParse({ date: "2026-02-30", start: "25:00", end: "x" })
        .success,
    ).toBe(true);
    expect(listEntriesToolInput.safeParse({ from: "a", to: "b" }).success).toBe(true);
  });

  it("update_entry: el id y los grupos opcionales", () => {
    expect(updateEntryToolInput.safeParse({ id: ID }).success).toBe(true);
    expect(
      updateEntryToolInput.safeParse({
        id: ID,
        project: { projectId: ID, taskId: null },
        times: { date: "2026-10-19", start: "09:00", end: "10:00" },
      }).success,
    ).toBe(true);
    expect(
      updateEntryToolInput.safeParse({ id: ID, project: { projectId: ID } }).success,
    ).toBe(false);
  });

  it("start_timer y stop_timer: todo opcional", () => {
    expect(startTimerToolInput.safeParse({}).success).toBe(true);
    expect(stopTimerToolInput.safeParse({}).success).toBe(true);
    expect(stopTimerToolInput.safeParse({ id: "no" }).success).toBe(false);
  });
});

describe("las entradas de las actions", () => {
  it("revokeGrant pide un clientId de hasta 255", () => {
    expect(revokeGrantInput.safeParse({ clientId: "abc" }).success).toBe(true);
    expect(revokeGrantInput.safeParse({ clientId: "" }).success).toBe(false);
    expect(revokeGrantInput.safeParse({ clientId: "x".repeat(256) }).success).toBe(false);
  });

  it("decideConsent pide la consulta, de hasta 8192, y la decisión", () => {
    expect(
      decideConsentInput.safeParse({ oauthQuery: "a=b", accept: true }).success,
    ).toBe(true);
    expect(decideConsentInput.safeParse({ oauthQuery: "", accept: true }).success).toBe(
      false,
    );
    expect(
      decideConsentInput.safeParse({ oauthQuery: "x".repeat(8193), accept: false })
        .success,
    ).toBe(false);
  });
});

describe("summarize_hours y list_people (D-MCPE-1, D-MCPE-5)", () => {
  const range = { from: "2026-09-28", to: "2026-10-04" };

  it("summarize_hours: from y to obligatorios, el resto opcional", () => {
    expect(summarizeHoursToolInput.safeParse(range).success).toBe(true);
    expect(summarizeHoursToolInput.safeParse({ from: range.from }).success).toBe(false);
    expect(
      summarizeHoursToolInput.safeParse({
        ...range,
        groupBy: "person",
        subgroups: ["date", "description"],
        userIds: ["AbC123"],
        projectIds: [ID],
        withoutProject: true,
        clientIds: [ID],
        includePeopleWithoutTime: true,
      }).success,
    ).toBe(true);
  });

  it("summarize_hours: niveles conocidos, hasta dos subniveles y listas de 1 a 50", () => {
    for (const input of [
      { groupBy: "persona" },
      { subgroups: ["date", "tag", "task"] },
      { userIds: [] },
      { userIds: Array(51).fill("a") },
      { projectIds: ["no-es-uuid"] },
      { clientIds: [] },
    ]) {
      expect(summarizeHoursToolInput.safeParse({ ...range, ...input }).success).toBe(
        false,
      );
    }
  });

  it("la salida del resumido: las tres formas, con los campos propios de cada clase", () => {
    const output = {
      timezone: "America/Argentina/Buenos_Aires",
      ...range,
      scope: "everyone",
      groupBy: "person",
      subgroups: ["project", "description"],
      levelsShown: 3,
      totalMinutes: 90,
      billableMinutes: 30,
      groups: [
        {
          kind: "person",
          key: "AbC123",
          name: "Ana",
          minutes: 90,
          inactive: false,
          children: [
            {
              kind: "project",
              key: null,
              name: null,
              minutes: 90,
              client: null,
              children: [
                {
                  kind: "description",
                  key: null,
                  name: null,
                  minutes: 90,
                  truncated: false,
                },
              ],
            },
          ],
        },
        { kind: "task", key: ID, name: "Backend", minutes: 0, project: "Clock" },
      ],
    };

    expect(summarizeHoursToolOutput.parse(output)).toEqual(output);
    expect(
      summarizeHoursToolOutput.safeParse({ ...output, scope: "todos" }).success,
    ).toBe(false);
    expect(
      summarizeHoursToolOutput.safeParse({
        ...output,
        groups: [{ kind: "date", key: "2026-09-29", name: "2026-09-29", minutes: 1.5 }],
      }).success,
    ).toBe(false);
  });

  it("la salida de list_people", () => {
    const output = {
      scope: "self",
      people: [{ id: "AbC123", name: "Ana", email: null, inactive: false, self: true }],
    };

    expect(listPeopleToolOutput.parse(output)).toEqual(output);
    expect(
      listPeopleToolOutput.safeParse({
        ...output,
        people: [{ id: "AbC123", name: "Ana", inactive: false, self: true }],
      }).success,
    ).toBe(false);
  });
});
