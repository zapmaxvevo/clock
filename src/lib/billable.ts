import { sameId } from "./project-pair";

/** Lo que una entrada tiene hoy: su proyecto y su facturable. */
export type BillableState = {
  readonly projectId: string | null;
  readonly billable: boolean;
};

/** El proyecto que se asigna, con su facturable por defecto (PR-21). */
export type BillableSource = {
  readonly id: string;
  readonly billableByDefault: boolean;
};

/** Una entrada nueva: sin proyecto y no facturable (TT-14). */
export const NEW_ENTRY_BILLABLE: BillableState = { projectId: null, billable: false };

/**
 * TT-14, PR-21, D-2: el facturable de una entrada después de asignarle
 * `next`. Un proyecto distinto del que tiene impone su valor por defecto; el
 * mismo proyecto —con otra tarea o sin ella— y «Sin proyecto» (`null`) lo
 * conservan. Lo usan el servidor y el navegador, que tienen que dar lo mismo.
 */
export function billableFor(
  current: BillableState,
  next: BillableSource | null,
): boolean {
  if (next === null || sameId(current.projectId, next.id)) {
    return current.billable;
  }
  return next.billableByDefault;
}
