import { describe, expect, it } from "vitest";
import type { z } from "zod";

import { DATE_FORMATS, TIME_FORMATS } from "@/server/time";

import { profileMessages, updatePreferenceInput } from "./schema";

function messageOf(result: z.ZodSafeParseResult<unknown>): string | undefined {
  return result.success ? undefined : result.error.issues.at(0)?.message;
}

describe("updatePreferenceInput: la zona (PF-11, PF-35)", () => {
  it("acepta una zona de la lista y la deja tal como llegó", () => {
    const result = updatePreferenceInput.safeParse({
      key: "timezone",
      value: "Asia/Tokyo",
    });
    expect(result.success && result.data).toEqual({
      key: "timezone",
      value: "Asia/Tokyo",
    });
  });

  it("acepta el valor de omisión aunque la lista no lo nombre literalmente, sin normalizarlo", () => {
    const value = "America/Argentina/Buenos_Aires";
    const result = updatePreferenceInput.safeParse({ key: "timezone", value });
    expect(result.success && result.data.value).toBe(value);
  });

  it.each([
    ["una zona inventada", "Marte/Olympus_Mons"],
    ["una zona que el entorno convierte pero no lista", "Etc/GMT+3"],
    ["el texto vacío", ""],
    ["un número", 42],
    ["un nulo", null],
    ["la ausencia", undefined],
  ])("rechaza %s con «Esa zona horaria no existe.»", (_label, value) => {
    expect(messageOf(updatePreferenceInput.safeParse({ key: "timezone", value }))).toBe(
      profileMessages.timeZoneUnknown,
    );
  });
});

describe("updatePreferenceInput: los formatos (PF-12, PF-13)", () => {
  it("acepta cada formato de hora y de fecha", () => {
    for (const value of TIME_FORMATS) {
      expect(updatePreferenceInput.safeParse({ key: "timeFormat", value }).success).toBe(
        true,
      );
    }
    for (const value of DATE_FORMATS) {
      expect(updatePreferenceInput.safeParse({ key: "dateFormat", value }).success).toBe(
        true,
      );
    }
  });

  it.each([
    ["timeFormat", "25h"],
    ["timeFormat", "12H"],
    ["timeFormat", 24],
    ["dateFormat", "d/M/y"],
    ["dateFormat", "dd/MM/yyyy "],
    ["dateFormat", null],
  ])("rechaza %s = %j con «Ese formato no está disponible.»", (key, value) => {
    expect(messageOf(updatePreferenceInput.safeParse({ key, value }))).toBe(
      profileMessages.formatUnavailable,
    );
  });

  it("no cruza los valores entre claves", () => {
    expect(
      messageOf(
        updatePreferenceInput.safeParse({ key: "timeFormat", value: "dd/MM/yyyy" }),
      ),
    ).toBe(profileMessages.formatUnavailable);
    expect(
      messageOf(updatePreferenceInput.safeParse({ key: "dateFormat", value: "24h" })),
    ).toBe(profileMessages.formatUnavailable);
  });
});

describe("updatePreferenceInput: la clave", () => {
  it.each([
    ["una clave desconocida", { key: "displayName", value: "Ana" }],
    ["sin clave", { value: "24h" }],
    ["una clave que no es texto", { key: 1, value: "24h" }],
    ["un pedido que no es un objeto", "timezone"],
  ])("rechaza %s con «Ese formato no está disponible.»", (_label, input) => {
    expect(messageOf(updatePreferenceInput.safeParse(input))).toBe(
      profileMessages.formatUnavailable,
    );
  });
});
