import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Dialog } from "@/components/ui/dialog";
import { timeEntryMessages, type TimeEntryView } from "@/modules/time-entry/schema";

import { CellEntriesContent } from "./cell-entries-dialog";
import {
  NO_ENTRY_CHANGES,
  type EntryChangeFailure,
  type EntryChangesState,
} from "./entry-changes";

const cell = "2026-10-01|0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d|-";
const a = "7a8b9c0d-1e2f-4a3b-9c4d-6e7f8091a2b3";
const b = "8b9c0d1e-2f3a-4b4c-8d5e-7f8091a2b3c4";
const c = "9c0d1e2f-3a4b-4c5d-9e6f-8091a2b3c4d5";

function entry(
  id: string,
  description: string,
  start: string,
  end: string,
  overrides: Partial<TimeEntryView> = {},
): TimeEntryView {
  return {
    id,
    description,
    startedAt: "2026-10-01T13:00:00.000Z",
    endedAt: "2026-10-01T14:00:00.000Z",
    dayDate: "2026-10-01",
    weekStart: "2026-09-28",
    startLabel: start,
    endLabel: end,
    startClock: start,
    endClock: end,
    extraDays: 0,
    durationSeconds: 3_600,
    durationLabel: "1:00",
    editableTimes: true,
    project: { id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", name: "P", color: "teal" },
    task: null,
    billable: false,
    tags: [],
    ...overrides,
  };
}

const named = entry(a, "a", "10:00", "11:00");
const unnamed = entry(b, "", "12:00", "13:30", { durationLabel: "1:30" });
const overnight = entry(c, "", "23:00", "01:00", {
  extraDays: 1,
  durationLabel: "2:00",
  editableTimes: false,
});

const noop = () => undefined;

/** Lo de adentro de la lista sin el portal, dentro de su raíz, que da el contexto. */
function render(
  options: {
    readonly entries?: readonly TimeEntryView[];
    readonly changes?: EntryChangesState;
    readonly failure?: EntryChangeFailure | null;
  } = {},
): string {
  return renderToStaticMarkup(
    <Dialog open>
      <CellEntriesContent
        cellName="P, miércoles 01/10"
        entries={options.entries ?? [named, unnamed, overnight]}
        changes={options.changes ?? NO_ENTRY_CHANGES}
        failure={options.failure ?? null}
        titleRef={{ current: null }}
        listRef={{ current: null }}
        onEdit={noop}
        onDelete={noop}
        onRetry={noop}
      />
    </Dialog>,
  );
}

function textOf(markup: string): string {
  return markup.replace(/<[^>]*>/g, "");
}

/** Los ítems de la lista, cada uno con su marcado. */
function itemsOf(markup: string): string[] {
  return markup.match(/<li[^>]*>.*?<\/li>/g) ?? [];
}

function buttonNamed(markup: string, name: string): string {
  return markup.match(new RegExp(`<button[^>]*aria-label="${name}"[^>]*>`))?.[0] ?? "";
}

describe("CellEntriesContent: la lista de una celda con varias (TS-42)", () => {
  it("se titula «Detalle de {celda}» y su título recibe el foco (§5.6)", () => {
    expect(render()).toMatch(
      /<h2[^>]*tabindex="-1"[^>]*>Detalle de P, miércoles 01\/10<\/h2>/,
    );
  });

  it("cada entrada, en el orden de la foto, con su descripción o «Sin descripción», su horario y su duración", () => {
    const items = itemsOf(render()).map(textOf);

    expect(items).toHaveLength(3);
    expect(items[0]).toMatch(/^a10:00 – 11:001:00Editar/);
    expect(items[1]).toMatch(/^Sin descripción12:00 – 13:301:30Editar/);
  });

  it("la que no tiene descripción va en gris", () => {
    const [first, second] = itemsOf(render());

    expect(first).toMatch(/<p class="truncate">a<\/p>/);
    expect(second).toMatch(
      /<p class="truncate text-muted-foreground">Sin descripción<\/p>/,
    );
  });

  it("la que termina otro día lleva `+1` y lo dice para el lector de pantalla", () => {
    const third = itemsOf(render())[2];

    expect(third).toContain(
      '+1<span class="sr-only"> (termina un día después)</span></sup>',
    );
    expect(textOf(third)).toContain("2:00");
  });

  it("«Editar» y «Borrar» se nombran por la entrada y su horario: dos sin descripción no se confunden", () => {
    const markup = render();

    expect(buttonNamed(markup, "Editar «a», de 10:00 a 11:00")).not.toBe("");
    expect(buttonNamed(markup, "Borrar «a», de 10:00 a 11:00")).not.toBe("");
    expect(buttonNamed(markup, "Editar «Sin descripción», de 12:00 a 13:30")).not.toBe(
      "",
    );
    expect(buttonNamed(markup, "Editar «Sin descripción», de 23:00 a 01:00")).not.toBe(
      "",
    );
    expect(buttonNamed(markup, "Borrar «Sin descripción», de 23:00 a 01:00")).not.toBe(
      "",
    );
  });

  it("sin pedidos del detalle, los botones están activos", () => {
    expect(render()).not.toContain('aria-disabled="');
  });

  it("una entrada en vuelo y otra asentada que la foto no trae dejan inactivos sus dos botones (A1)", () => {
    const changes: EntryChangesState = {
      pending: [
        { id: 1, cell, entryId: a, status: "sending" },
        { id: 2, cell, entryId: b, status: "settled" },
      ],
      failure: null,
    };
    const [first, second, third] = itemsOf(render({ changes }));

    expect(first.match(/aria-disabled="true"/g)).toHaveLength(2);
    expect(second.match(/aria-disabled="true"/g)).toHaveLength(2);
    expect(third).not.toContain('aria-disabled="');
    expect(first).not.toMatch(/\sdisabled(=""|\s|>)/);
  });
});

describe("CellEntriesContent: la falla de la celda, arriba de los ítems (A14)", () => {
  const deleted: EntryChangeFailure = {
    request: {
      kind: "delete",
      cell,
      name: "«a», de 10:00 a 11:00",
      input: { id: a },
    },
    code: "unexpected",
    message: timeEntryMessages.unexpected,
  };

  it("con `unexpected`, el aviso nombra la operación y el pedido, con «Reintentar»", () => {
    const markup = render({ failure: deleted });

    expect(markup.indexOf('role="alert"')).toBeGreaterThan(-1);
    expect(markup.indexOf('role="alert"')).toBeLessThan(markup.indexOf("<ul"));
    expect(textOf(markup)).toContain("No se pudo borrar la entrada.");
    expect(textOf(markup)).toContain("«a», de 10:00 a 11:00");
    expect(textOf(markup)).toContain("Reintentar");
  });

  it("con otro código, sin «Reintentar»; un guardado se titula como en el editor", () => {
    const markup = render({
      failure: {
        request: {
          kind: "save",
          cell,
          name: "«b», de 12:00 a 13:00",
          input: { id: b, changes: { description: "b" } },
        },
        code: "not_found",
        message: "Esa entrada ya no existe.",
      },
    });

    expect(textOf(markup)).toContain("No se pudo guardar la entrada.");
    expect(textOf(markup)).toContain("Esa entrada ya no existe.");
    expect(textOf(markup)).not.toContain("Reintentar");
  });

  it("sin falla, no hay aviso", () => {
    expect(render()).not.toContain('role="alert"');
  });
});
