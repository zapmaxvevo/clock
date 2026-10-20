import { describe, expect, it } from "vitest";

import { DESCRIPTION_MAX, TAGS_MAX } from "@/modules/time-entry/schema";

import {
  createEntryToolInput,
  decideConsentInput,
  listEntriesToolInput,
  revokeGrantInput,
  startTimerToolInput,
  stopTimerToolInput,
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
