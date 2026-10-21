import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { WorkspaceSettingsActions } from "@/modules/workspace/schema";
import type { DurationFormat } from "@/server/time";
import { textOf } from "@/test/markup";

import { DurationFormatField } from "./duration-format-field";
import { DURATION_FORMAT_ORDER, durationFormatText } from "./labels";

/** Doble escrito a mano: el marcado inicial no llama a la action. */
const save: WorkspaceSettingsActions["updateWorkspaceSetting"] = () =>
  Promise.resolve({ ok: false, code: "unexpected", message: "doble" });

function render(value: DurationFormat): string {
  return renderToStaticMarkup(<DurationFormatField value={value} save={save} />);
}

/** El disparador del selector, con su apertura y su contenido. */
function triggersOf(markup: string): string[] {
  return markup.match(/<button[^>]*role="combobox"[^>]*>.*?<\/button>/g) ?? [];
}

describe("DurationFormatField (D-WS2b-6, WS-15)", () => {
  it.each<[DurationFormat, string]>([
    ["full", "Completo (hh:mm:ss)"],
    ["compact", "Compacto (h:mm)"],
  ])("con el %s, el disparador dice «%s», nombrado por su rótulo", (value, shown) => {
    const markup = render(value);
    const id = markup.match(
      /<label[^>]*for="([^"]+)"[^>]*>Formato de duración<\/label>/,
    )?.[1];
    const triggers = triggersOf(markup);

    expect(id).toBeDefined();
    expect(triggers).toHaveLength(1);
    expect(triggers[0]).toContain(`id="${id ?? ""}"`);
    expect(textOf(triggers[0] ?? "")).toBe(shown);
  });

  it.each<DurationFormat>(["full", "compact"])(
    "con el %s, sin aviso y sin control inactivo: quien lo ve puede cambiarlo",
    (value) => {
      const markup = render(value);

      expect(markup).not.toContain('role="alert"');
      expect(textOf(markup)).not.toContain("No se pudo cambiar el formato de duración.");
      expect(markup).not.toMatch(/\s(aria-)?disabled(=|\s|>)/);
    },
  );

  it("WS-15, PF-31: el completo primero, y los nombres del perfil son los del selector", () => {
    expect(DURATION_FORMAT_ORDER).toEqual(["full", "compact"]);
    expect(DURATION_FORMAT_ORDER.map(durationFormatText)).toEqual([
      "Completo (hh:mm:ss)",
      "Compacto (h:mm)",
    ]);
  });
});
