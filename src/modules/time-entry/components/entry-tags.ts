import { tagIdsOf } from "@/modules/project/components/tag-picker-model";
import type { TagRef } from "@/modules/project/schema";
import { updateEntry } from "@/modules/time-entry/actions";

/**
 * El cambio de etiquetas de una entrada, de la barra o de una fila (TT-12,
 * TT-27, TT-54), con las etiquetas enteras para la vista optimista.
 */
export type EntryTagsChange = {
  readonly id: string;
  readonly tags: readonly TagRef[];
};

/** Viaja por `updateEntry` con un solo grupo: el pedido fija el conjunto entero. */
export function saveEntryTags({ id, tags }: EntryTagsChange) {
  return updateEntry({ id, changes: { tags: tagIdsOf(tags) } });
}
