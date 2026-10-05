import { samePair, type ProjectPair } from "@/lib/project-pair";
import { NO_SELECTION, selectionIds } from "@/modules/project/components/picker-model";
import type { ProjectSelection } from "@/modules/project/schema";
import type { TimeEntryView } from "@/modules/time-entry/schema";

import { selectionOf } from "./entry-selection";

/**
 * Lo que la barra y el diálogo eligen de una entrada además de la descripción
 * y las horas. Es la única transición de esos campos en el navegador.
 */
export type EntryFields = {
  readonly selection: ProjectSelection;
};

/** Una entrada nueva: sin proyecto. */
export const NO_FIELDS: EntryFields = { selection: NO_SELECTION };

export function fieldsOf(entry: TimeEntryView): EntryFields {
  return { selection: selectionOf(entry) };
}

/** Elegir proyecto y tarea. */
export function withSelection<Fields extends EntryFields>(
  fields: Fields,
  selection: ProjectSelection,
): Fields {
  return { ...fields, selection };
}

/** Lo que viaja en un alta. */
export type FieldsInput = ProjectPair;

export function fieldsInput(fields: EntryFields): FieldsInput {
  return selectionIds(fields.selection);
}

/**
 * TT-25: después de «Agregar», limpia cada campo que sigue igual a lo que se
 * mandó. Lo que se cambió mientras el alta viajaba se queda.
 */
export function afterAdd(current: EntryFields, sent: EntryFields): EntryFields {
  return {
    selection: samePair(fieldsInput(current), fieldsInput(sent))
      ? NO_SELECTION
      : current.selection,
  };
}
