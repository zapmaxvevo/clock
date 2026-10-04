/** El proyecto y la tarea de una entrada. Nulo es «sin proyecto» y «sin tarea». */
export type ProjectPair = {
  readonly projectId: string | null;
  readonly taskId: string | null;
};

/**
 * Los ids se comparan sin distinguir mayúsculas: la base los iguala. Lo usan
 * el servidor y el navegador, que tienen que coincidir en qué es «el mismo».
 */
export function sameId(left: string | null, right: string | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return left.toLowerCase() === right.toLowerCase();
}

/** Los dos pares tienen el mismo proyecto y la misma tarea. */
export function samePair(left: ProjectPair, right: ProjectPair): boolean {
  return sameId(left.projectId, right.projectId) && sameId(left.taskId, right.taskId);
}
