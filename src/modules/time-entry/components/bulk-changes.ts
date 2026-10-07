import { selectionIds } from "@/modules/project/components/picker-model";
import { tagIdsOf } from "@/modules/project/components/tag-picker-model";
import type { ProjectSelection, TagRef } from "@/modules/project/schema";
import type { BulkEditChanges } from "@/modules/time-entry/schema";
import { parseClockInput, type TimeFormat } from "@/server/time";

/** TT-63: «add» suma a las etiquetas de cada entrada; «replace» deja las elegidas. */
export type BulkTagMode = "add" | "replace";

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
  /** `null` sin cambios; `NO_SELECTION` es «Sin proyecto». */
  readonly selection: ProjectSelection | null;
  readonly tagMode: BulkTagMode;
  readonly tags: readonly TagRef[];
  /** `null` sin cambios. */
  readonly billable: boolean | null;
};

export const emptyBulkChanges: BulkChangesDraft = {
  description: "",
  date: null,
  start: "",
  end: "",
  selection: null,
  tagMode: "add",
  tags: [],
  billable: null,
};

/**
 * Si el borrador cambia las etiquetas. «Agregar» sin etiquetas no cambia nada;
 * «Reemplazar» cambia también sin ninguna: deja las entradas sin etiquetas
 * (D12-3).
 */
export function changesTags({ tagMode, tags }: BulkChangesDraft): boolean {
  return tagMode === "replace" || tags.length > 0;
}

function tagsChange(draft: BulkChangesDraft): Pick<BulkEditChanges, "tags"> {
  if (!changesTags(draft)) {
    return {};
  }
  return { tags: { mode: draft.tagMode, ids: tagIdsOf(draft.tags) } };
}

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
    ...(draft.selection === null ? {} : { project: selectionIds(draft.selection) }),
    ...tagsChange(draft),
    ...(draft.billable === null ? {} : { billable: draft.billable }),
  };
  return Object.keys(changes).length === 0 ? null : changes;
}

/**
 * Lo tecleado en una hora del borrador. Vaciada vuelve a «sin cambios»; si no,
 * se interpreta con el formato de la persona. `null` si no se puede
 * interpretar: el borrador queda como estaba.
 */
export function withBulkClock(
  draft: BulkChangesDraft,
  field: "start" | "end",
  text: string,
  format: TimeFormat,
): BulkChangesDraft | null {
  if (text.trim() === "") {
    return { ...draft, [field]: "" };
  }
  const clock = parseClockInput(text, format);
  return clock === null ? null : { ...draft, [field]: clock };
}

/** TT-64: la palabra que confirma el borrado masivo. */
export const BULK_DELETE_WORD = "BORRAR";

/** Sin distinguir mayúsculas ni espacios en los extremos. */
export function confirmsDelete(text: string): boolean {
  return text.trim().toUpperCase() === BULK_DELETE_WORD;
}
