"use client";

import { SearchIcon, TagIcon } from "lucide-react";
import Link from "next/link";
import { useState, type Ref } from "react";

import { preventTypeahead } from "@/components/combobox-typeahead";
import { buttonVariants } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { InputGroupAddon } from "@/components/ui/input-group";
import { sameId } from "@/lib/project-pair";
import { cn } from "@/lib/utils";
import type { TagRef } from "@/modules/project/schema";

import { projectLabels, withTagNames } from "./labels";
import {
  sameTags,
  sortedTags,
  tagPickerView,
  type TagPickerEmpty,
} from "./tag-picker-model";
import { useTrackingCatalog } from "./tracking-catalog";

type TagPickerProps = {
  readonly value: readonly TagRef[];
  /** D-5: una sola vez, al cerrar, con el conjunto entero y solo si cambió. */
  readonly onChange: (tags: readonly TagRef[]) => void;
  /** Sin etiquetas, la barra dice «Etiquetas» y la fila muestra solo el ícono (H-6). */
  readonly variant: "bar" | "row";
  /** El nombre accesible del disparador, armado por quien lo usa. */
  readonly label: string;
  /** Con el cambio en vuelo el disparador queda inactivo y no abre. */
  readonly pending?: boolean;
  /** TT-92: los nombres como texto, sin disparador. */
  readonly readOnly?: boolean;
  readonly triggerRef?: Ref<HTMLButtonElement>;
  readonly onOpenChange?: (open: boolean) => void;
};

/**
 * D-5: lo que avisa el selector al cerrarse. El conjunto entero si difiere
 * del que tenía al abrir, sin importar orden ni mayúsculas; `null` si es el
 * mismo, así cerrar sin cambios no manda nada.
 */
export function closingChange(
  value: readonly TagRef[],
  draft: readonly TagRef[],
): readonly TagRef[] | null {
  return sameTags(draft, value) ? null : draft;
}

/**
 * El selector de etiquetas (TT-12): un disparador con rol `combobox` que abre
 * un diálogo con el buscador y la lista, de selección múltiple. Mientras está
 * abierto guarda su propio borrador; cada opción alterna su marca sin cerrar,
 * y al cerrar —`Escape`, clic afuera o `Tab`— avisa el conjunto una sola vez
 * si cambió. Filtra y ordena solo `tag-picker-model.ts`.
 */
export function TagPicker({
  value,
  onChange,
  variant,
  label,
  pending = false,
  readOnly = false,
  triggerRef,
  onOpenChange,
}: TagPickerProps) {
  const catalog = useTrackingCatalog();
  // `null` con el selector cerrado: lo que se ve es `value`.
  const [draft, setDraft] = useState<readonly TagRef[] | null>(null);
  const [search, setSearch] = useState("");
  // TT-12: en orden alfabético, no en el de los clics del borrador que llega.
  const names = sortedTags(value).map((tag) => tag.name);

  if (readOnly) {
    return names.length === 0 ? null : (
      <span className="flex min-w-0 items-center gap-1.5 text-sm">
        <TagIcon aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
        <span className="truncate">{names.join(", ")}</span>
      </span>
    );
  }

  const view = tagPickerView(catalog, value, search);

  function changeOpen(next: boolean): void {
    if (next) {
      if (!pending) {
        setDraft(value);
        onOpenChange?.(true);
      }
      return;
    }
    if (draft === null) {
      return;
    }
    setDraft(null);
    onOpenChange?.(false);
    const change = closingChange(value, draft);
    if (change !== null) {
      onChange(change);
    }
  }

  return (
    <Combobox<TagRef, true>
      multiple
      items={view.options.map((option) => option.tag)}
      filter={null}
      value={[...(draft ?? value)]}
      onValueChange={setDraft}
      isItemEqualToValue={(item, selected) => sameId(item.id, selected.id)}
      itemToStringLabel={(tag) => tag.name}
      inputValue={search}
      onInputValueChange={setSearch}
      open={draft !== null}
      onOpenChange={changeOpen}
    >
      <ComboboxTrigger
        ref={triggerRef}
        // WCAG 2.5.3: el nombre empieza por lo que se ve y suma los nombres.
        aria-label={withTagNames(label, names)}
        aria-disabled={pending || undefined}
        // Sin el typeahead una etiqueta no cambia sin abrir el selector.
        onKeyDown={preventTypeahead}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "max-w-64 min-w-0 justify-start font-normal aria-disabled:opacity-60",
        )}
      >
        {names.length === 0 ? (
          <>
            <TagIcon aria-hidden="true" className="text-muted-foreground" />
            {variant === "bar" && (
              <span className="text-muted-foreground">{projectLabels.tags}</span>
            )}
          </>
        ) : (
          <>
            <TagIcon aria-hidden="true" className="text-primary" />
            <span className="truncate">{names.join(", ")}</span>
          </>
        )}
      </ComboboxTrigger>
      <ComboboxContent className="w-72">
        <ComboboxInput
          showTrigger={false}
          aria-label={projectLabels.tagPickerSearch}
          placeholder={projectLabels.tagPickerSearch}
        >
          <InputGroupAddon>
            <SearchIcon aria-hidden="true" />
          </InputGroupAddon>
        </ComboboxInput>
        {/*
          El vacío va en `Combobox.Empty` y no en una región propia: sin él, con
          la lista vacía la primitiva deja pasar `Escape` y cierra también el
          diálogo del calendario que contiene al selector.
        */}
        <ComboboxEmpty>
          {view.empty !== null && <EmptyMessage empty={view.empty} />}
        </ComboboxEmpty>
        <ComboboxList>
          {view.options.map((option) => (
            <ComboboxItem
              key={option.tag.id}
              value={option.tag}
              className={option.archived ? "text-muted-foreground" : undefined}
            >
              <span className="truncate">{option.label}</span>
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

function EmptyMessage({ empty }: { readonly empty: TagPickerEmpty }) {
  if (empty.kind === "noMatches") {
    return <p>{projectLabels.tagPickerNoMatches}</p>;
  }
  return (
    <div className="flex flex-col items-center gap-1">
      <p>{projectLabels.tagPickerNoTags}</p>
      {empty.canCreateTag && (
        <Link
          href="/proyectos"
          className={buttonVariants({ variant: "link", size: "sm" })}
        >
          {projectLabels.pickerGoToProjects}
        </Link>
      )}
    </div>
  );
}
