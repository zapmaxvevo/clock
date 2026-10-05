import { updateEntry } from "@/modules/time-entry/actions";

/** El cambio de facturable de una entrada, de la barra o de una fila (TT-14, TT-27, TT-54). */
export type EntryBillableChange = {
  readonly id: string;
  readonly billable: boolean;
};

/** Viaja por `updateEntry` con un solo grupo: el pedido fija el valor entero. */
export function saveEntryBillable({ id, billable }: EntryBillableChange) {
  return updateEntry({ id, changes: { billable } });
}
