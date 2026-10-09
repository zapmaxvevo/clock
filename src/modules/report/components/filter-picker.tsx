"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { paletteColor } from "@/modules/project/palette";
import {
  REPORT_WITHOUT_PROJECT,
  type ReportFilters,
  type ReportGrouping,
  type ReportRange,
} from "@/modules/report/schema";

import {
  applyFilter,
  chosenKeys,
  filterSummary,
  hasNoMatches,
  visibleOptions,
  type FilterKind,
  type FilterOption,
} from "./filter-model";
import { filterNames, filterSearch, reportLabels } from "./labels";

type FilterPickerProps = {
  readonly range: ReportRange;
  /** La agrupación y los subniveles que conserva «Aplicar». */
  readonly grouping: ReportGrouping;
  /** Los filtros efectivos: lo elegido de este y lo que conserva de los otros. */
  readonly filters: ReportFilters;
  readonly kind: FilterKind;
  readonly options: readonly FilterOption[];
};

/**
 * D-R4-8: el botón de un filtro, que dice lo elegido, y su panel en un
 * popover. Cada vez que abre, parte de lo elegido en la pantalla y de la
 * búsqueda vacía; Esc o un clic afuera cierran sin aplicar. «Aplicar» cierra y
 * navega, y el foco vuelve al botón. Recibe solo el rango, la agrupación, los
 * filtros, su `kind` y sus opciones (D-R4-9).
 */
export function FilterPicker({
  range,
  grouping,
  filters,
  kind,
  options,
}: FilterPickerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<readonly string[]>(() =>
    chosenKeys(filters, kind),
  );
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean): void {
    if (next) {
      setChosen(chosenKeys(filters, kind));
      setQuery("");
      setError(null);
    }
    setOpen(next);
  }

  function handleToggle(key: string, checked: boolean): void {
    setChosen((current) =>
      checked ? [...current, key] : current.filter((other) => other !== key),
    );
    setError(null);
  }

  function handleApply(): void {
    const effect = applyFilter({ range, grouping, filters }, kind, chosen, options);
    setOpen(effect.open);
    setError(effect.error);
    if (effect.href !== null) {
      router.push(effect.href);
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={<Button variant="outline" size="sm" className="max-w-full" />}
      >
        {/* Un nombre largo se recorta a la vista; el nombre accesible sigue entero. */}
        <span className="truncate">
          {reportLabels.filterChoice(
            filterNames[kind],
            filterSummary(kind, chosenKeys(filters, kind), options),
          )}
        </span>
      </PopoverTrigger>
      <PopoverContent
        aria-label={filterNames[kind]}
        // Con un catálogo largo la lista se desplaza y «Aplicar» queda a la vista.
        className="max-h-(--available-height) w-80 max-w-(--available-width) p-0"
        align="start"
      >
        <FilterPanel
          kind={kind}
          options={options}
          chosen={chosen}
          query={query}
          error={error}
          onQueryChange={setQuery}
          onToggle={handleToggle}
          onApply={handleApply}
        />
      </PopoverContent>
    </Popover>
  );
}

type FilterPanelProps = {
  readonly kind: FilterKind;
  readonly options: readonly FilterOption[];
  /** Las claves tildadas: lo que la búsqueda esconde sigue elegido. */
  readonly chosen: readonly string[];
  readonly query: string;
  /** El mensaje de la última vez que se apretó «Aplicar». */
  readonly error: string | null;
  readonly onQueryChange: (query: string) => void;
  readonly onToggle: (key: string, checked: boolean) => void;
  readonly onApply: () => void;
};

/**
 * Lo que hay dentro del popover: el buscador, que recibe el foco al abrir por
 * ser lo primero que se alcanza con el tabulador, las vigentes en un grupo
 * nombrado por el filtro, las archivadas en el suyo (D-R4-8), la región de
 * alerta y «Aplicar».
 */
export function FilterPanel({
  kind,
  options,
  chosen,
  query,
  error,
  onQueryChange,
  onToggle,
  onApply,
}: FilterPanelProps) {
  const retiredHeadingId = useId();
  const { current, retired } = visibleOptions(options, query);
  const chosenSet = new Set(chosen);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="border-b p-2">
        <Input
          type="search"
          aria-label={filterSearch[kind]}
          placeholder={filterSearch[kind]}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>
      <div className="flex max-h-72 min-h-0 flex-col gap-3 overflow-y-auto p-2">
        {current.length > 0 && (
          <div role="group" aria-label={filterNames[kind]} className="flex flex-col">
            {current.map((option) => (
              <OptionItem
                key={option.key}
                option={option}
                checked={chosenSet.has(option.key)}
                onToggle={onToggle}
              />
            ))}
          </div>
        )}
        {retired.length > 0 && (
          <div role="group" aria-labelledby={retiredHeadingId} className="flex flex-col">
            <p
              id={retiredHeadingId}
              className="text-muted-foreground px-1.5 pb-1 text-xs font-medium"
            >
              {reportLabels.archivedOptions}
            </p>
            {retired.map((option) => (
              <OptionItem
                key={option.key}
                option={option}
                checked={chosenSet.has(option.key)}
                onToggle={onToggle}
              />
            ))}
          </div>
        )}
        {hasNoMatches(options, query) && (
          <p className="text-muted-foreground px-1.5 py-2">
            {reportLabels.filterNoMatches}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2 border-t p-2">
        {/* Siempre montada, así el lector anuncia el mensaje cuando aparece. */}
        <p role="alert" className="text-destructive text-sm empty:hidden">
          {error}
        </p>
        <Button type="button" size="sm" className="self-end" onClick={onApply}>
          {reportLabels.apply}
        </Button>
      </div>
    </div>
  );
}

/**
 * Una casilla con su rótulo. El nombre accesible es el de la opción; el
 * cliente de un proyecto, en gris como en su fila, es su descripción.
 */
function OptionItem({
  option,
  checked,
  onToggle,
}: {
  readonly option: FilterOption;
  readonly checked: boolean;
  readonly onToggle: (key: string, checked: boolean) => void;
}) {
  const id = useId();
  const detailId = useId();
  const withoutProject = option.key === REPORT_WITHOUT_PROJECT;

  return (
    <div className="hover:bg-muted flex items-center gap-2 rounded-md px-1.5 py-1">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(next) => onToggle(option.key, next)}
        aria-describedby={option.detail === null ? undefined : detailId}
      />
      <Label htmlFor={id} className="min-w-0 flex-1 gap-1.5 font-normal">
        {option.color !== null && (
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: paletteColor(option.color).value }}
          />
        )}
        <span className={cn("truncate", withoutProject && "text-muted-foreground")}>
          {option.name}
        </span>
        {option.detail !== null && (
          // Fuera del nombre: lo anuncia `aria-describedby`.
          <span
            id={detailId}
            aria-hidden="true"
            className="text-muted-foreground truncate"
          >
            {option.detail}
          </span>
        )}
      </Label>
    </div>
  );
}
