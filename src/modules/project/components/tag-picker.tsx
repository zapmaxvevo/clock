"use client";

import type { Combobox as ComboboxPrimitive } from "@base-ui/react";
import { CheckIcon, SearchIcon, TagIcon } from "lucide-react";
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
import { sortedByName } from "@/lib/text";
import { cn } from "@/lib/utils";
import type { TagRef } from "@/modules/project/schema";

import { projectLabels, withTagNames } from "./labels";
import { sameTags, tagPickerView, type TagPickerEmpty } from "./tag-picker-model";
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
  const names = sortedByName(value).map((tag) => tag.name);

  if (readOnly) {
    return names.length === 0 ? null : (
      <span className="flex min-w-0 items-center gap-1.5 text-sm">
        <TagIcon aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
        {/* El ícono no le dice al lector de pantalla qué son los nombres. */}
        <span className="truncate">
          <span className="sr-only">{`${projectLabels.tags}: `}</span>
          {names.join(", ")}
        </span>
      </span>
    );
  }

  const view = tagPickerView(catalog, value, search);

  function changeOpen(next: boolean): void {
    if (next) {
      if (!pending) {
        setDraft(value);
        setSearch("");
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

  /**
   * Solo lo que se escribe cambia la búsqueda: al marcar una opción con la
   * búsqueda escrita, la primitiva la vacía, y así se perdería el filtro con
   * el que se busca la siguiente. Ese vaciado se cancela, no solo se ignora:
   * así la primitiva no deja pendiente el resaltado que lo acompaña, y la
   * vuelve a vaciar al cerrar. Vaciarla al abrir queda de respaldo.
   */
  function changeSearch(
    next: string,
    details: ComboboxPrimitive.Root.ChangeEventDetails,
  ): void {
    if (details.reason === "input-clear" && details.isItemPress === true) {
      details.cancel();
      return;
    }
    setSearch(next);
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
      onInputValueChange={changeSearch}
      // Enter con lo escrito marca la primera opción, sin pasar por las flechas.
      autoHighlight
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
          // Un tope menor que el del proyecto: los nombres se recortan con
          // elipsis y la fila no se parte (H-1); el nombre accesible los dice.
          "max-w-40 min-w-0 justify-start font-normal aria-disabled:opacity-60",
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
        {/*
          Visible aunque esté vacía: una región en vivo que aparece junto con su
          texto no se anuncia. Sin relleno propio, para no ocupar lugar sobre
          la lista; el relleno lo pone el mensaje.
        */}
        <ComboboxEmpty className="flex py-0">
          {view.empty !== null && <EmptyMessage empty={view.empty} />}
        </ComboboxEmpty>
        <ComboboxList>
          {view.options.map((option) => (
            <ComboboxItem
              key={option.tag.id}
              value={option.tag}
              className={cn(
                // La casilla reemplaza a la marca de la derecha de la primitiva,
                // que se monta solo con la opción marcada y es su último hijo.
                "group/tag-option pr-1.5 [&>[aria-hidden=true]:last-child]:hidden",
                option.archived && "text-muted-foreground",
              )}
            >
              <OptionCheckbox />
              <span className="truncate">{option.label}</span>
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

/**
 * TT-12: las opciones son casillas de selección múltiple. Es solo lo que se ve:
 * la marca la dice `aria-selected`, que la primitiva pone en la opción.
 */
function OptionCheckbox() {
  return (
    <span
      aria-hidden="true"
      data-slot="tag-option-checkbox"
      className="border-input group-data-[selected]/tag-option:border-primary group-data-[selected]/tag-option:bg-primary flex size-4 shrink-0 items-center justify-center rounded-[4px] border"
    >
      <CheckIcon className="group-data-[selected]/tag-option:stroke-primary-foreground hidden size-3.5 group-data-[selected]/tag-option:block" />
    </span>
  );
}

function EmptyMessage({ empty }: { readonly empty: TagPickerEmpty }) {
  if (empty.kind === "noMatches") {
    return <p className="py-2">{projectLabels.tagPickerNoMatches}</p>;
  }
  return (
    <div className="flex flex-col items-center gap-1 py-2">
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
