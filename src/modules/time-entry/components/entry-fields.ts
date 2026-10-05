import { billableFor, NEW_ENTRY_BILLABLE } from "@/lib/billable";
import { sameId, samePair, type ProjectPair } from "@/lib/project-pair";
import { NO_SELECTION, selectionIds } from "@/modules/project/components/picker-model";
import type {
  ProjectSelection,
  TrackingCatalog,
  TrackingProjectView,
} from "@/modules/project/schema";
import type { TimeEntryView } from "@/modules/time-entry/schema";

import { selectionOf } from "./entry-selection";

/**
 * Lo que la barra y el diálogo eligen de una entrada además de la descripción
 * y las horas. Es la única transición de esos campos en el navegador, y la
 * única que llama a `billableFor` de este lado.
 */
export type EntryFields = {
  readonly selection: ProjectSelection;
  /** TT-14, TT-15. */
  readonly billable: boolean;
};

/** Una entrada nueva: sin proyecto y no facturable (TT-14). */
export const NO_FIELDS: EntryFields = {
  selection: NO_SELECTION,
  billable: NEW_ENTRY_BILLABLE.billable,
};

export function fieldsOf(entry: TimeEntryView): EntryFields {
  return { selection: selectionOf(entry), billable: entry.billable };
}

function catalogProject(
  catalog: TrackingCatalog,
  projectId: string,
): TrackingProjectView | undefined {
  return catalog.groups
    .flatMap((group) => group.projects)
    .find((project) => sameId(project.id, projectId));
}

/**
 * Elegir proyecto aplica `billableFor` con el `billableByDefault` del
 * catálogo: la misma regla que el servidor, con el mismo resultado mientras
 * el catálogo esté al día. Una selección fuera del catálogo —el proyecto
 * archivado de una entrada— conserva el facturable del borrador: no se puede
 * elegir como nueva, y el borrador del diálogo no siempre es el de la fila.
 */
export function withSelection<Fields extends EntryFields>(
  fields: Fields,
  selection: ProjectSelection,
  catalog: TrackingCatalog,
): Fields {
  const source =
    selection.project === null ? null : catalogProject(catalog, selection.project.id);
  const current = {
    projectId: fields.selection.project?.id ?? null,
    billable: fields.billable,
  };
  return {
    ...fields,
    selection,
    billable: source === undefined ? fields.billable : billableFor(current, source),
  };
}

/** Lo que viaja en un alta: el facturable siempre explícito. */
export type FieldsInput = ProjectPair & { readonly billable: boolean };

export function fieldsInput(fields: EntryFields): FieldsInput {
  return { ...selectionIds(fields.selection), billable: fields.billable };
}

/**
 * TT-25: después de «Agregar», limpia cada campo que sigue igual a lo que se
 * mandó. Lo que se cambió mientras el alta viajaba se queda.
 */
export function afterAdd(current: EntryFields, sent: EntryFields): EntryFields {
  return {
    selection: samePair(selectionIds(current.selection), selectionIds(sent.selection))
      ? NO_FIELDS.selection
      : current.selection,
    billable: current.billable === sent.billable ? NO_FIELDS.billable : current.billable,
  };
}
