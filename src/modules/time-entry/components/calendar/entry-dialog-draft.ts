import {
  NO_SELECTION,
  sameSelection,
  selectionIds,
} from "@/modules/project/components/picker-model";
import type { ProjectSelection } from "@/modules/project/schema";
import type {
  CreateManualEntryInput,
  TimeEntryView,
  UpdateEntryChanges,
} from "@/modules/time-entry/schema";

import { selectionOf } from "../entry-selection";
import { sameDraft, type TimeDraft } from "../time-draft";

/**
 * El borrador del diálogo de una entrada, en sus tres modos, y lo que cada
 * uno manda (ADR 0013). El diálogo solo guarda el resultado de estas
 * funciones. El slice 11 suma acá sus grupos.
 */
export type EntryDialogDraft = {
  readonly description: string;
  readonly selection: ProjectSelection;
  /** En el timer, solo `date` y `start` cuentan. */
  readonly times: TimeDraft;
};

/** El borrador de una entrada que se abre, con las horas canónicas de la vista. */
export function draftOfEntry(entry: TimeEntryView): EntryDialogDraft {
  return {
    description: entry.description,
    selection: selectionOf(entry),
    times: {
      date: entry.dayDate,
      start: entry.startClock,
      end: entry.endClock ?? entry.startClock,
    },
  };
}

/** El borrador de un alta: sin descripción ni proyecto, con el trío propuesto (CAL-43, CAL-74). */
export function draftOfNew(times: TimeDraft): EntryDialogDraft {
  return { description: "", selection: NO_SELECTION, times };
}

/** La descripción si su recorte difiere, y el par si es otro: lo común a los dos modos. */
function sharedChanges(
  entry: TimeEntryView,
  draft: EntryDialogDraft,
): UpdateEntryChanges {
  const description = draft.description.trim();
  return {
    ...(description === entry.description ? {} : { description }),
    ...(sameSelection(draft.selection, selectionOf(entry))
      ? {}
      : { project: selectionIds(draft.selection) }),
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
  const view =
    entry.endClock === null
      ? null
      : { date: entry.dayDate, start: entry.startClock, end: entry.endClock };
  const timesChanged =
    entry.editableTimes && view !== null && !sameDraft(draft.times, view);
  return orNull({
    ...sharedChanges(entry, draft),
    ...(timesChanged ? { times: draft.times } : {}),
  });
}

/** Los grupos del timer que cambiaron: la descripción, el par y el inicio (CAL-40). */
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

/** El alta del diálogo: `createManualEntry` con el trío y el par (CAL-45). */
export function createInputOf(draft: EntryDialogDraft): CreateManualEntryInput {
  return {
    description: draft.description,
    ...draft.times,
    ...selectionIds(draft.selection),
  };
}
