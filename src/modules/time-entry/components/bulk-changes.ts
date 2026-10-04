import type { BulkEditChanges } from "@/modules/time-entry/schema";

/**
 * TT-63: el borrador del diálogo de edición masiva. Un campo vacío no cambia
 * (§5.2), así que cada uno arranca vacío. Las horas son canónicas, como en
 * `time-draft.ts`: el formato de la persona entra solo al interpretar lo
 * tecleado y al mostrar.
 */
export type BulkChangesDraft = {
  readonly description: string;
  /** Día canónico, o `null` sin cambios. */
  readonly date: string | null;
  /** Hora canónica "HH:mm", o "" sin cambios. */
  readonly start: string;
  readonly end: string;
};

export const emptyBulkChanges: BulkChangesDraft = {
  description: "",
  date: null,
  start: "",
  end: "",
};

/**
 * Solo los campos con algo; un texto vacío o de solo espacios no cambia. `null`
 * si no queda ninguno: «Guardar» no tiene nada que mandar.
 */
export function toChanges(draft: BulkChangesDraft): BulkEditChanges | null {
  const description = draft.description.trim();
  const changes: BulkEditChanges = {
    ...(description === "" ? {} : { description }),
    ...(draft.date === null ? {} : { date: draft.date }),
    ...(draft.start === "" ? {} : { start: draft.start }),
    ...(draft.end === "" ? {} : { end: draft.end }),
  };
  return Object.keys(changes).length === 0 ? null : changes;
}

/** TT-64: la palabra que confirma el borrado masivo. */
export const BULK_DELETE_WORD = "BORRAR";

/** Sin distinguir mayúsculas ni espacios en los extremos. */
export function confirmsDelete(text: string): boolean {
  return text.trim().toUpperCase() === BULK_DELETE_WORD;
}
