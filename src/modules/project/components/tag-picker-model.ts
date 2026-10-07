import { sameId } from "@/lib/project-pair";
import { sameTagIds } from "@/lib/tag-ids";
import { normalizeSearch, sortedByName } from "@/lib/text";
import type { TagRef, TrackingCatalog } from "@/modules/project/schema";

import { archivedTagLabel } from "./labels";

/**
 * Una opción del selector de etiquetas. `archived` es una etiqueta que la
 * entrada ya tiene y que no está en el catálogo (H-5, PR-47).
 */
export type TagOption = {
  readonly tag: TagRef;
  readonly archived: boolean;
  /** Lo que se ve y nombra la opción: el nombre, o «{nombre} (archivada)». */
  readonly label: string;
};

/** TT-88 y H-2: los dos vacíos se distinguen. */
export type TagPickerEmpty =
  | { readonly kind: "noTags"; readonly canCreateTag: boolean }
  | { readonly kind: "noMatches" };

export type TagPickerView = {
  readonly options: readonly TagOption[];
  readonly empty: TagPickerEmpty | null;
};

function inCatalog(catalog: readonly TagRef[], tag: TagRef): boolean {
  return catalog.some((candidate) => sameId(candidate.id, tag.id));
}

function optionOf(tag: TagRef, archived: boolean): TagOption {
  return { tag, archived, label: archived ? archivedTagLabel(tag.name) : tag.name };
}

/**
 * Lo que dibuja el selector: las activas del catálogo más las de `value` que
 * no están en él, en orden alfabético, filtradas por la búsqueda sin
 * distinguir mayúsculas ni acentos (H-2). Es el único que filtra y ordena: la
 * primitiva recibe esta salida tal cual. Una de `value` fuera del catálogo se
 * ofrece mientras `value` la tenga, así que desmarcada y cerrado el selector
 * deja de ofrecerse.
 */
export function tagPickerView(
  catalog: Pick<TrackingCatalog, "tags" | "canCreateTag">,
  value: readonly TagRef[],
  search: string,
): TagPickerView {
  const archived = new Set(value.filter((tag) => !inCatalog(catalog.tags, tag)));
  const all = sortedByName([...catalog.tags, ...archived]).map((tag) =>
    optionOf(tag, archived.has(tag)),
  );
  if (all.length === 0) {
    return {
      options: [],
      empty: { kind: "noTags", canCreateTag: catalog.canCreateTag },
    };
  }
  const query = normalizeSearch(search);
  const options = all.filter((option) =>
    normalizeSearch(option.tag.name).includes(query),
  );
  return { options, empty: options.length === 0 ? { kind: "noMatches" } : null };
}

/** Los ids que viajan a la action: las etiquetas sin sus nombres. */
export function tagIdsOf(tags: readonly TagRef[]): string[] {
  return tags.map((tag) => tag.id);
}

/** Las mismas etiquetas, sin importar orden ni mayúsculas, como en la base. */
export function sameTags(left: readonly TagRef[], right: readonly TagRef[]): boolean {
  return sameTagIds(tagIdsOf(left), tagIdsOf(right));
}
