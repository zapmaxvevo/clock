import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DisplayFormatsProvider } from "@/components/layout/display-formats";
import { TrackingCatalogProvider } from "@/modules/project/components/tracking-catalog";
import type { ProjectSelection, TagRef, TrackingCatalog } from "@/modules/project/schema";
import type { TimeEntryView } from "@/modules/time-entry/schema";
import type { DisplayFormats } from "@/server/time";

import { EntryRow } from "./entry-row";

const catalog: TrackingCatalog = {
  canCreateProject: false,
  canCreateTag: false,
  groups: [],
  tags: [],
};
const none: ProjectSelection = { project: null, task: null };

const entry: TimeEntryView = {
  id: "8d0f7a52-4c1e-4b8e-9a43-2f6a1c3e5b70",
  description: "Informe",
  startedAt: "2026-10-02T12:00:00.000Z",
  endedAt: "2026-10-02T13:30:00.000Z",
  dayDate: "2026-10-02",
  weekStart: "2026-09-28",
  startLabel: "09:00",
  endLabel: "10:30",
  startClock: "09:00",
  endClock: "10:30",
  extraDays: 0,
  durationSeconds: 5_400,
  durationLabel: "1:30:00",
  editableTimes: true,
  project: null,
  task: null,
  billable: false,
  tags: [],
};

const review: TagRef = { id: "4d5e6f7a-8b9c-4d0e-9f1a-3b4c5d6e7f80", name: "Revisión" };
const urgent: TagRef = { id: "5e6f7a8b-9c0d-4e1f-8a2b-4c5d6e7f8091", name: "Urgente" };

type Options = {
  readonly canTrack?: boolean;
  readonly selected?: boolean;
  readonly selectionLocked?: boolean;
  readonly formats?: DisplayFormats;
  readonly description?: string;
  readonly billable?: boolean;
  readonly tags?: readonly TagRef[];
  readonly busy?: boolean;
};

function render(options: Options = {}): string {
  return renderToStaticMarkup(
    <DisplayFormatsProvider
      formats={
        options.formats ?? { time: "24h", date: "dd/MM/yyyy", duration: "compact" }
      }
    >
      <TrackingCatalogProvider catalog={catalog}>
        <EntryRow
          entry={entry}
          description={options.description ?? entry.description}
          project={none}
          billable={options.billable ?? false}
          tags={options.tags ?? []}
          busy={options.busy ?? false}
          canTrack={options.canTrack ?? true}
          selected={options.selected ?? false}
          onToggleSelected={() => undefined}
          selectionLocked={options.selectionLocked ?? false}
          pendingTimes={null}
          todayKey="2026-10-04"
          minDayKey="2026-01-01"
          onSave={() => undefined}
          onChangeProject={() => undefined}
          onChangeBillable={() => undefined}
          onChangeTags={() => undefined}
          onSaveTimes={() => undefined}
          onDelete={() => undefined}
          onContinue={() => undefined}
          continuing={false}
          continueShortcut={false}
          onDuplicate={() => undefined}
          focusTimesOnMount={false}
          onTimesFocused={() => undefined}
        />
      </TrackingCatalogProvider>
    </DisplayFormatsProvider>,
  );
}

/** El elemento con rol `checkbox`, con sus atributos. */
function checkboxOf(markup: string): string | null {
  return markup.match(/<[a-z]+[^>]*role="checkbox"[^>]*>/)?.[0] ?? null;
}

/** El control de facturable de la fila, con sus atributos. */
function billableOf(markup: string): string | null {
  return (
    markup.match(/<button[^>]*aria-label="Entrada «[^"]*» facturable"[^>]*>/)?.[0] ?? null
  );
}

/** El disparador del selector de etiquetas de la fila, con su contenido. */
function tagsOf(markup: string): string | null {
  return (
    markup.match(
      /<button[^>]*role="combobox"[^>]*aria-label="Etiquetas de la entrada[^>]*>.*?<\/button>/,
    )?.[0] ?? null
  );
}

/** El texto visible, sin etiquetas. */
function textOf(markup: string): string {
  return markup.replace(/<[^>]*>/g, "");
}

describe("EntryRow", () => {
  it("con permiso, la casilla de la fila la nombra con su descripción y sus horas", () => {
    const checkbox = checkboxOf(render());

    expect(checkbox).toContain('aria-label="Seleccionar «Informe», 09:00 – 10:30"');
    expect(checkbox).toContain('aria-checked="false"');
  });

  it("la casilla es lo primero de la fila", () => {
    const markup = render();

    expect(markup.search(/role="checkbox"/)).toBeLessThan(markup.search(/<button/));
  });

  it("las horas del nombre siguen el formato de la persona", () => {
    const checkbox = checkboxOf(
      render({ formats: { time: "12h", date: "dd/MM/yyyy", duration: "compact" } }),
    );

    expect(checkbox).toContain('aria-label="Seleccionar «Informe», 9:00 AM – 10:30 AM"');
  });

  it("una entrada sin descripción se nombra «Sin descripción»", () => {
    expect(checkboxOf(render({ description: "" }))).toContain(
      'aria-label="Seleccionar «Sin descripción», 09:00 – 10:30"',
    );
  });

  it("elegida, la casilla está marcada", () => {
    expect(checkboxOf(render({ selected: true }))).toContain('aria-checked="true"');
  });

  it("con una operación en masa en vuelo, inactiva sin `disabled`", () => {
    const checkbox = checkboxOf(render({ selectionLocked: true })) ?? "";

    expect(checkbox).toContain('aria-disabled="true"');
    expect(checkbox).not.toMatch(/\sdisabled(=|\s|>)/);
  });

  it("con la membresía desactivada no hay casilla (TT-92)", () => {
    expect(checkboxOf(render({ canTrack: false }))).toBeNull();
  });
});

describe("EntryRow, el facturable (TT-14, TT-49, TT-92)", () => {
  it("es un botón de alternancia nombrado por la entrada", () => {
    const toggle = billableOf(render());

    expect(toggle).toContain('aria-label="Entrada «Informe» facturable"');
    expect(toggle).toContain('aria-pressed="false"');
  });

  it("sin descripción, se nombra «Sin descripción», como el selector de proyecto (TT-50)", () => {
    const markup = render({ description: "" });

    expect(billableOf(markup)).toContain(
      'aria-label="Entrada «Sin descripción» facturable"',
    );
    expect(markup).toContain('aria-label="Proyecto de la entrada «Sin descripción»"');
  });

  it("muestra el facturable que recibe, también el optimista", () => {
    expect(billableOf(render({ billable: true }))).toContain('aria-pressed="true"');
  });

  it("va después del selector de proyecto", () => {
    const markup = render();

    expect(markup.search(/aria-label="Proyecto de la entrada/)).toBeLessThan(
      markup.search(/aria-label="Entrada «Informe» facturable"/),
    );
  });

  it("con una escritura de la fila en vuelo, inactivo sin `disabled`", () => {
    const toggle = billableOf(render({ busy: true })) ?? "";

    expect(toggle).toContain('aria-disabled="true"');
    expect(toggle).not.toMatch(/\sdisabled(=|\s|>)/);
  });

  it("en solo lectura, facturable: el ícono con su nombre y sin control", () => {
    const markup = render({ canTrack: false, billable: true });

    expect(billableOf(markup)).toBeNull();
    expect(markup).toContain('role="img" aria-label="Facturable"');
  });

  it("en solo lectura, no facturable: nada (H-6)", () => {
    const markup = render({ canTrack: false, billable: false });

    expect(billableOf(markup)).toBeNull();
    expect(markup).not.toContain("Facturable");
  });
});

describe("EntryRow, las etiquetas (TT-12, TT-49, TT-50, TT-92)", () => {
  it("es un combobox nombrado por la entrada, con las etiquetas que recibe, también las optimistas", () => {
    const trigger = tagsOf(render({ tags: [review, urgent] })) ?? "";

    expect(trigger).toContain(
      'aria-label="Etiquetas de la entrada «Informe»: Revisión, Urgente"',
    );
    expect(textOf(trigger)).toBe("Revisión, Urgente");
  });

  it("sin etiquetas, el ícono en gris y sin texto (TT-50, H-6)", () => {
    const trigger = tagsOf(render()) ?? "";

    expect(trigger).toContain('aria-label="Etiquetas de la entrada «Informe»"');
    expect(trigger).toContain('class="lucide lucide-tag text-muted-foreground"');
    expect(textOf(trigger)).toBe("");
  });

  it("va entre el selector de proyecto y el facturable (TT-49)", () => {
    const markup = render();
    const tags = markup.search(/aria-label="Etiquetas de la entrada/);

    expect(markup.search(/aria-label="Proyecto de la entrada/)).toBeLessThan(tags);
    expect(tags).toBeLessThan(markup.search(/aria-label="Entrada «Informe» facturable"/));
  });

  it("con una escritura de la fila en vuelo, inactivo sin `disabled`", () => {
    const trigger = tagsOf(render({ busy: true })) ?? "";

    expect(trigger).toContain('aria-disabled="true"');
    expect(trigger).not.toMatch(/\sdisabled(=|\s|>)/);
  });

  it("en solo lectura, los nombres como texto, sin combobox", () => {
    const markup = render({ canTrack: false, tags: [review, urgent] });

    expect(tagsOf(markup)).toBeNull();
    expect(markup).toContain(">Revisión, Urgente</span>");
  });

  it("en solo lectura y sin etiquetas, nada (H-6)", () => {
    const withTags = render({ canTrack: false, tags: [review] });
    const without = render({ canTrack: false });

    expect(without).not.toContain("Etiquetas");
    expect(without).not.toContain("lucide-tag");
    expect(withTags).toContain("lucide-tag");
  });
});
