import { billableFor, NEW_ENTRY_BILLABLE } from "@/lib/billable";
import { sameId, type ProjectPair } from "@/lib/project-pair";
import {
  NO_SELECTION,
  sameSelection,
  selectionIds,
} from "@/modules/project/components/picker-model";
import { sameTags, tagIdsOf } from "@/modules/project/components/tag-picker-model";
import type {
  ProjectSelection,
  TagRef,
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
  /** TT-12: el conjunto entero, en el orden en que se eligió. */
  readonly tags: readonly TagRef[];
};

/** Una entrada nueva: sin proyecto, no facturable y sin etiquetas (TT-14). */
export const NO_FIELDS: EntryFields = {
  selection: NO_SELECTION,
  billable: NEW_ENTRY_BILLABLE.billable,
  tags: [],
};

export function fieldsOf(entry: TimeEntryView): EntryFields {
  return { selection: selectionOf(entry), billable: entry.billable, tags: entry.tags };
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

/** Lo que viaja en un alta: el facturable siempre explícito, las etiquetas por id. */
export type FieldsInput = ProjectPair & {
  readonly billable: boolean;
  readonly tagIds: string[];
};

export function fieldsInput(fields: EntryFields): FieldsInput {
  return {
    ...selectionIds(fields.selection),
    billable: fields.billable,
    tagIds: tagIdsOf(fields.tags),
  };
}

/**
 * El facturable con que arranca una entrada nueva con `selection` (TT-14):
 * el por defecto de su proyecto en el catálogo; `false` sin proyecto o con
 * uno fuera del catálogo.
 */
function newEntryBillable(
  selection: ProjectSelection,
  catalog: TrackingCatalog,
): boolean {
  const source =
    selection.project === null ? null : catalogProject(catalog, selection.project.id);
  return billableFor(NEW_ENTRY_BILLABLE, source ?? null);
}

/**
 * TT-25: después de «Agregar», limpia cada campo que sigue igual a lo que se
 * mandó. Lo que se cambió mientras el alta viajaba se queda. Un facturable
 * igual al enviado vuelve al de una entrada nueva con la selección que queda,
 * así el proyecto elegido durante el alta conserva su por defecto.
 */
export function afterAdd(
  current: EntryFields,
  sent: EntryFields,
  catalog: TrackingCatalog,
): EntryFields {
  const selection = sameSelection(current.selection, sent.selection)
    ? NO_FIELDS.selection
    : current.selection;
  return {
    selection,
    billable:
      current.billable === sent.billable
        ? newEntryBillable(selection, catalog)
        : current.billable,
    tags: sameTags(current.tags, sent.tags) ? NO_FIELDS.tags : current.tags,
  };
}
