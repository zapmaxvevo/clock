import { describe, expect, it } from "vitest";

import { consentLabels, grantsLabels } from "./labels";

/** Cada texto de las dos pantallas, con las funciones llamadas con un nombre neutro. */
function textsOf(labels: Record<string, unknown>): string[] {
  return Object.values(labels).map((value) =>
    typeof value === "function"
      ? String((value as (...args: string[]) => string)("X", "Y"))
      : String(value),
  );
}

describe("labels del MCP", () => {
  it("§5: ningún texto nombra a un asistente ni a un proveedor", () => {
    const texts = [...textsOf(consentLabels), ...textsOf(grantsLabels)].join("\n");

    expect(texts).not.toMatch(/claude|anthropic|chatgpt|openai|codex/i);
  });
});
