import { sameSelection, selectionIds } from "@/modules/project/components/picker-model";
import { sameTags, tagIdsOf } from "@/modules/project/components/tag-picker-model";
import type {
  CreateManualEntryInput,
  TimeEntryView,
  UpdateEntryChanges,
} from "@/modules/time-entry/schema";

import { fieldsInput, fieldsOf, NO_FIELDS, type EntryFields } from "../entry-fields";
import { selectionOf } from "../entry-selection";
import { fromView, sameDraft, type TimeDraft } from "../time-draft";
import { isClosedEntry } from "./calendar-layout";

/**
 * El borrador del diálogo de una entrada, en sus tres modos, y lo que cada
 * uno manda (ADR 0013). El diálogo solo guarda el resultado de estas
 * funciones. Los campos elegidos (`EntryFields`) cambian con las mismas
 * transiciones que la barra.
 */
export type EntryDialogDraft = EntryFields & {
  readonly description: string;
  /** En el timer, solo `date` y `start` cuentan. */
  readonly times: TimeDraft;
};

/** El borrador de una entrada que se abre, con las horas canónicas de la vista. */
export function draftOfEntry(entry: TimeEntryView): EntryDialogDraft {
  return {
    ...fieldsOf(entry),
    description: entry.description,
    // En el timer, el fin del borrador no cuenta: se deja en el inicio.
    times: isClosedEntry(entry)
      ? fromView(entry)
      : { date: entry.dayDate, start: entry.startClock, end: entry.startClock },
  };
}

/**
 * El borrador de un alta: sin descripción, proyecto ni etiquetas y no
 * facturable, con el trío propuesto (CAL-43, CAL-74).
 */
export function draftOfNew(times: TimeDraft): EntryDialogDraft {
  return { ...NO_FIELDS, description: "", times };
}

/**
 * La descripción si su recorte difiere, el par si es otro, el facturable y
 * las etiquetas si son otras: lo común a los dos modos. El facturable viaja
 * siempre que viaja el par, así el servidor no aplica el por defecto encima
 * de lo que quedó a la vista.
 */
function sharedChanges(
  entry: TimeEntryView,
  draft: EntryDialogDraft,
): UpdateEntryChanges {
  const description = draft.description.trim();
  const projectChanged = !sameSelection(draft.selection, selectionOf(entry));
  return {
    ...(description === entry.description ? {} : { description }),
    ...(projectChanged ? { project: selectionIds(draft.selection) } : {}),
    ...(projectChanged || draft.billable !== entry.billable
      ? { billable: draft.billable }
      : {}),
    ...(sameTags(draft.tags, entry.tags) ? {} : { tags: tagIdsOf(draft.tags) }),
  };
}

function orNull(changes: UpdateEntryChanges): UpdateEntryChanges | null {
  return Object.keys(changes).length === 0 ? null : changes;
}

/**
 * Los grupos de una entrada cerrada que cambiaron respecto de la vista;
 * `null` si ninguno (§5.3). El trío solo con `editableTimes` (TT-110).
 */
export function changesOf(
  entry: TimeEntryView,
  draft: EntryDialogDraft,
): UpdateEntryChanges | null {
  const timesChanged =
    entry.editableTimes &&
    isClosedEntry(entry) &&
    !sameDraft(draft.times, fromView(entry));
  return orNull({
    ...sharedChanges(entry, draft),
    ...(timesChanged ? { times: draft.times } : {}),
  });
}

/** Los grupos del timer que cambiaron: los comunes y el inicio (CAL-40). */
export function runningChangesOf(
  entry: TimeEntryView,
  draft: EntryDialogDraft,
): UpdateEntryChanges | null {
  const { date, start } = draft.times;
  const startChanged = date !== entry.dayDate || start !== entry.startClock;
  return orNull({
    ...sharedChanges(entry, draft),
    ...(startChanged ? { runningStart: { date, start } } : {}),
  });
}

/**
 * El alta del diálogo: `createManualEntry` con el trío, el par, y el
 * facturable y las etiquetas explícitos (CAL-45).
 */
export function createInputOf(draft: EntryDialogDraft): CreateManualEntryInput {
  return {
    description: draft.description,
    ...draft.times,
    ...fieldsInput(draft),
  };
}
