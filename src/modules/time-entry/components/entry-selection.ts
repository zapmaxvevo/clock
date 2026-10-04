import type { ProjectSelection } from "@/modules/project/schema";
import type { TimeEntryView } from "@/modules/time-entry/schema";

/**
 * El par de una entrada como lo recibe el selector. Vive aparte de
 * `entry-project.ts`, que importa la action, para que lo use también lo que
 * solo muestra, como el diálogo de solo lectura del calendario.
 */
export function selectionOf(entry: TimeEntryView): ProjectSelection {
  return { project: entry.project, task: entry.task };
}
