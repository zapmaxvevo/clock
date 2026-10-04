import { selectionIds } from "@/modules/project/components/picker-model";
import type { ProjectSelection } from "@/modules/project/schema";
import { updateEntryProject } from "@/modules/time-entry/actions";
import type { TimeEntryView } from "@/modules/time-entry/schema";

/**
 * El cambio de proyecto de una entrada, de la barra o de una fila, con la
 * selección entera para la vista optimista.
 */
export type EntryProjectChange = {
  readonly id: string;
  readonly selection: ProjectSelection;
};

/** A la action viajan solo los ids; la selección queda para la vista optimista. */
export function saveEntryProject({ id, selection }: EntryProjectChange) {
  return updateEntryProject({ id, ...selectionIds(selection) });
}

/** El par de una entrada como lo recibe el selector. */
export function selectionOf(entry: TimeEntryView): ProjectSelection {
  return { project: entry.project, task: entry.task };
}
