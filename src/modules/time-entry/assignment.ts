import { sameId, type ProjectPair } from "@/lib/project-pair";

/**
 * El par que hay que validar, o `null` si el pedido no asigna nada nuevo:
 * «Sin proyecto» (TT-10), el mismo par que ya tiene (TT-104, PR-65, PR-71) o
 * el mismo proyecto sin la tarea, que no carga horas en ningún lado. Para un
 * alta, `current` es el par vacío y todo par con proyecto se valida.
 */
export function pairToCheck(
  current: ProjectPair,
  requested: ProjectPair,
): { readonly projectId: string; readonly taskId: string | null } | null {
  if (requested.projectId === null) {
    return null;
  }
  if (
    sameId(current.projectId, requested.projectId) &&
    (requested.taskId === null || sameId(current.taskId, requested.taskId))
  ) {
    return null;
  }
  return { projectId: requested.projectId, taskId: requested.taskId };
}

/**
 * Las etiquetas pedidas que la entrada todavía no tiene: las únicas que se
 * validan. Las que ya tiene se conservan aunque estén archivadas (PR-47,
 * PR-68), y quitar no asigna nada. Para un alta, `current` es vacío y se
 * validan todas.
 */
export function tagsToCheck(
  current: readonly string[],
  requested: readonly string[],
): string[] {
  return requested.filter((id) => !current.some((own) => sameId(own, id)));
}
