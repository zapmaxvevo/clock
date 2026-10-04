import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DisplayFormatsProvider } from "@/components/layout/display-formats";
import { Dialog } from "@/components/ui/dialog";
import { TrackingCatalogProvider } from "@/modules/project/components/tracking-catalog";
import type { TrackingCatalog } from "@/modules/project/schema";
import type { TimeEntryView } from "@/modules/time-entry/schema";
import type { DisplayFormats } from "@/server/time";

import {
  EditorActions,
  EntryDialogBody,
  EntryDialogContent,
  type DialogSubject,
} from "./entry-dialog";

const catalog: TrackingCatalog = {
  canCreateProject: true,
  groups: [
    {
      client: null,
      projects: [
        {
          id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
          name: "Web",
          color: "teal",
          tasks: [{ id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", name: "Diseño" }],
        },
      ],
    },
  ],
};
const serverNow = "2026-10-04T15:00:00.000Z";

const closed: TimeEntryView = {
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
  durationLabel: "1:30",
  editableTimes: true,
  project: { id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", name: "Web", color: "teal" },
  task: { id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", name: "Diseño" },
};

const overnight: TimeEntryView = {
  ...closed,
  description: "",
  startedAt: "2026-10-02T01:00:00.000Z",
  endedAt: "2026-10-04T05:00:00.000Z",
  dayDate: "2026-10-01",
  startLabel: "22:00",
  endLabel: "02:00",
  startClock: "22:00",
  endClock: "02:00",
  extraDays: 2,
  durationSeconds: 187_200,
  durationLabel: "52:00",
  editableTimes: false,
  project: null,
  task: null,
};

const running: TimeEntryView = {
  ...closed,
  startedAt: "2026-10-04T13:00:00.000Z",
  endedAt: null,
  dayDate: "2026-10-04",
  startLabel: "10:00",
  startClock: "10:00",
  endClock: null,
  endLabel: null,
  durationSeconds: null,
  durationLabel: null,
  editableTimes: false,
};

function render(
  entry: TimeEntryView,
  formats: DisplayFormats = { time: "24h", date: "dd/MM/yyyy" },
): string {
  return renderToStaticMarkup(
    <DisplayFormatsProvider formats={formats}>
      <TrackingCatalogProvider catalog={catalog}>
        <EntryDialogBody entry={entry} serverNow={serverNow} todayKey="2026-10-04" />
      </TrackingCatalogProvider>
    </DisplayFormatsProvider>,
  );
}

/** Los pares término y definición, como texto. */
function fieldsOf(markup: string): readonly (readonly [string, string])[] {
  const text = (html: string) => html.replace(/<[^>]*>/g, "");
  return [...markup.matchAll(/<dt[^>]*>(.*?)<\/dt><dd[^>]*>(.*?)<\/dd>/g)].map(
    (match) => [text(match[1]), text(match[2])] as const,
  );
}

/** Ningún control: ni botones, ni campos, ni el disparador del selector. */
function expectNoControls(markup: string): void {
  expect(markup).not.toMatch(/<(button|input|textarea|select)\b/);
  expect(markup).not.toContain('role="combobox"');
  expect(markup).not.toContain("tabindex");
}

describe("EntryDialogBody (CAL-65, CAL-66)", () => {
  it("una cerrada muestra sus campos como texto", () => {
    const markup = render(closed);
    expect(fieldsOf(markup)).toEqual([
      ["Descripción", "Informe"],
      ["Proyecto", "Web: Diseño"],
      ["Fecha", "vie, 02/10"],
      ["Hora de inicio", "09:00"],
      ["Hora de fin", "10:30"],
      ["Duración", "1:30"],
    ]);
    expectNoControls(markup);
  });

  it("las horas son los rótulos de la vista: con 12 h, en ese formato", () => {
    const fields = fieldsOf(
      render(
        { ...closed, startLabel: "9:00 AM", endLabel: "10:30 AM" },
        { time: "12h", date: "dd/MM/yyyy" },
      ),
    );
    expect(fields).toContainEqual(["Hora de inicio", "9:00 AM"]);
    expect(fields).toContainEqual(["Hora de fin", "10:30 AM"]);
  });

  it("la de más de un día lleva el superíndice y lo dice para el lector de pantalla", () => {
    const markup = render(overnight);
    expect(fieldsOf(markup)).toEqual([
      ["Descripción", "Sin descripción"],
      ["Proyecto", "Sin proyecto"],
      ["Fecha", "jue, 01/10"],
      ["Hora de inicio", "22:00"],
      ["Hora de fin", "02:00+2 (termina 2 días después)"],
      ["Duración", "52:00"],
    ]);
    expect(markup).toContain('<span class="sr-only"> (termina 2 días después)</span>');
    expectNoControls(markup);
  });

  it("el timer dice que el fin está en curso, con el transcurrido y sin duración", () => {
    const markup = render(running);
    const fields = fieldsOf(markup);
    expect(fields.map(([term]) => term)).toEqual([
      "Descripción",
      "Proyecto",
      "Fecha",
      "Hora de inicio",
      "Fin: en curso",
    ]);
    expect(fields).toContainEqual(["Fecha", "Hoy"]);
    expect(markup).toContain('role="timer"');
    expect(fields.at(-1)?.[1]).toBe("2:00:00");
    expectNoControls(markup);
  });
});

const noop = () => undefined;

/** El contenido del diálogo sin el portal, dentro de su raíz, que da el contexto. */
function renderContent(
  subject: DialogSubject,
  canTrack = true,
  formats: DisplayFormats = { time: "24h", date: "dd/MM/yyyy" },
): string {
  return renderToStaticMarkup(
    <DisplayFormatsProvider formats={formats}>
      <TrackingCatalogProvider catalog={catalog}>
        <Dialog open>
          <EntryDialogContent
            subject={subject}
            canTrack={canTrack}
            serverNow={serverNow}
            todayKey="2026-10-04"
            minDayKey="2026-01-01"
            pending={false}
            failure={null}
            closeRef={{ current: null }}
            descriptionRef={{ current: null }}
            onUnchanged={noop}
            onSave={noop}
            onAdd={noop}
            onStop={noop}
            onDuplicate={noop}
            onDelete={noop}
          />
        </Dialog>
      </TrackingCatalogProvider>
    </DisplayFormatsProvider>,
  );
}

/** Un control por su nombre accesible: su etiqueta de apertura. */
function controlNamed(markup: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    markup.match(new RegExp(`<(input|button)[^>]*aria-label="${escaped}"[^>]*>`))?.[0] ??
    null
  );
}

function textOf(markup: string): string {
  return markup.replace(/<[^>]*>/g, "");
}

describe("EntryDialogContent: los modos según el permiso y el sujeto (CAL-05, CAL-65)", () => {
  it("sin permiso de carga, la entrada se abre en solo lectura (TT-92)", () => {
    const markup = renderContent({ kind: "entry", entry: closed }, false);
    expect(textOf(markup)).toContain("Entrada");
    expect(fieldsOf(markup).map(([term]) => term)).toContain("Hora de fin");
    expect(markup).not.toMatch(/<(input|textarea|select)\b/);
    expect(markup).not.toContain('role="combobox"');
    expect(textOf(markup)).toContain("Cerrar");
    expect(textOf(markup)).not.toContain("Guardar");
  });

  it("con permiso de carga, una cerrada se edita: título, campos y menú", () => {
    const markup = renderContent({ kind: "entry", entry: closed });
    expect(textOf(markup)).toContain("Editar entrada");
    expect(markup).toMatch(/<input[^>]*value="Informe"/);
    expect(controlNamed(markup, "Hora de inicio")).toContain('value="09:00"');
    expect(controlNamed(markup, "Hora de fin")).toContain('value="10:30"');
    expect(controlNamed(markup, "Duración")).toContain('value="1:30"');
    expect(controlNamed(markup, "Acciones de la entrada «Informe»")).not.toBeNull();
    expect(textOf(markup)).toContain("Guardar");
    expect(textOf(markup)).not.toContain("Detener");
  });

  it("mientras el trío no cambió, la duración es la del servidor, que mide instantes (TT-97)", () => {
    const withSeconds = {
      ...closed,
      startedAt: "2026-10-02T12:00:40.000Z",
      durationSeconds: 5_360,
      durationLabel: "1:29",
    };
    const markup = renderContent({ kind: "entry", entry: withSeconds });
    expect(controlNamed(markup, "Duración")).toContain('value="1:29"');
  });

  it("con 12 h elegidas, las horas del editor van en ese formato (PF-13)", () => {
    const markup = renderContent({ kind: "entry", entry: closed }, true, {
      time: "12h",
      date: "dd/MM/yyyy",
    });
    expect(controlNamed(markup, "Hora de inicio")).toContain('value="9:00 AM"');
    expect(controlNamed(markup, "Hora de fin")).toContain('value="10:30 AM"');
  });

  it("de más de un día, el horario es texto con su aviso; la descripción se edita (CAL-58)", () => {
    const markup = renderContent({ kind: "entry", entry: overnight });
    expect(markup).toMatch(/<input[^>]*value=""/);
    expect(controlNamed(markup, "Hora de inicio")).toBeNull();
    expect(controlNamed(markup, "Hora de fin")).toBeNull();
    expect(controlNamed(markup, "Duración")).toBeNull();
    expect(fieldsOf(markup)).toContainEqual([
      "Hora de fin",
      "02:00+2 (termina 2 días después)",
    ]);
    expect(textOf(markup)).toContain(
      "Esta entrada dura más de un día; sus horarios no se pueden editar acá.",
    );
    expect(markup).toContain('role="combobox"');
  });

  it("el timer edita el inicio, muestra el fin en curso y no tiene menú (CAL-40)", () => {
    const markup = renderContent({ kind: "entry", entry: running });
    expect(textOf(markup)).toContain("Timer en curso");
    expect(controlNamed(markup, "Hora de inicio")).toContain('value="10:00"');
    expect(controlNamed(markup, "Hora de fin")).toBeNull();
    expect(textOf(markup)).toContain("Fin: en curso");
    expect(markup).toContain('role="timer"');
    expect(textOf(markup)).toContain("Detener");
    expect(markup).not.toContain("Acciones de la entrada");
  });

  it("el alta lleva el trío propuesto y «Agregar», sin menú (CAL-43)", () => {
    const markup = renderContent({
      kind: "add",
      draft: { date: "2026-09-30", start: "10:00", end: "11:00" },
      opener: "slot",
    });
    expect(textOf(markup)).toContain("Agregar entrada");
    expect(controlNamed(markup, "Hora de inicio")).toContain('value="10:00"');
    expect(controlNamed(markup, "Hora de fin")).toContain('value="11:00"');
    expect(controlNamed(markup, "Duración")).toContain('value="1:00"');
    expect(textOf(markup)).toContain("Agregar");
    expect(markup).not.toContain("Acciones de la entrada");
  });

  it("un alta de duración cero deja «Agregar» inactivo con el motivo asociado (TT-73)", () => {
    const markup = renderContent({
      kind: "add",
      draft: { date: "2026-09-30", start: "10:00", end: "10:00" },
      opener: "button",
    });
    const add = markup.match(/<button[^>]*type="submit"[^>]*>/)?.[0] ?? "";
    expect(add).toContain('aria-disabled="true"');
    const hint = add.match(/aria-describedby="([^"]*)"/)?.[1];
    expect(markup).toContain(
      `id="${hint}" class="text-muted-foreground text-sm">La entrada tiene que durar al menos un minuto.`,
    );
  });
});

describe("EditorActions: «Detener» con cambios sin guardar (P-06)", () => {
  function renderActions(stopBlocked: boolean): string {
    return renderToStaticMarkup(
      <Dialog open>
        <EditorActions
          mode="running"
          name="Informe"
          pending={false}
          tooShort={false}
          stopBlocked={stopBlocked}
          submitRef={{ current: null }}
          onStop={noop}
          onDuplicate={noop}
          onDelete={noop}
        />
      </Dialog>,
    );
  }

  function stopButton(markup: string): string {
    return markup.match(/<button[^>]*>Detener<\/button>/)?.[0] ?? "";
  }

  it("con cambios queda inactivo, sin `disabled`, con el texto asociado y a la vista", () => {
    const markup = renderActions(true);
    const stop = stopButton(markup);
    expect(stop).toContain('aria-disabled="true"');
    expect(stop).not.toMatch(/\sdisabled=/);
    const hint = stop.match(/aria-describedby="([^"]*)"/)?.[1];
    expect(markup).toContain(
      `id="${hint}" class="text-muted-foreground text-sm">Guardá los cambios antes de detener el timer.`,
    );
  });

  it("sin cambios está activo y no muestra el texto", () => {
    const markup = renderActions(false);
    expect(stopButton(markup)).toContain('aria-disabled="false"');
    expect(stopButton(markup)).not.toContain("aria-describedby");
    expect(markup).not.toContain("Guardá los cambios");
  });
});
