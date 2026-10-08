"use client";

import { FolderIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode, type Ref } from "react";

import { preventTypeahead } from "@/components/combobox-typeahead";
import { buttonVariants } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { InputGroupAddon } from "@/components/ui/input-group";
import type { ProjectPair } from "@/lib/project-pair";
import { cn } from "@/lib/utils";
import { paletteColor } from "@/modules/project/palette";
import type { ProjectRef, ProjectSelection } from "@/modules/project/schema";

import { projectLabels, projectTaskLabel } from "./labels";
import {
  pickerView,
  sameSelection,
  type PickerEmpty,
  type PickerGroup,
  type PickerOption,
} from "./picker-model";
import { useTrackingCatalog } from "./tracking-catalog";

type PickerCommonProps = {
  readonly onChange: (selection: ProjectSelection) => void;
  /** Sin selección, la barra dice «Proyecto» (TT-06) y la fila «Sin proyecto» (TT-50). */
  readonly variant: "bar" | "row";
  /** El nombre accesible del disparador, armado por quien lo usa. */
  readonly label: string;
  /** Con el cambio en vuelo el disparador queda inactivo y no abre. */
  readonly pending?: boolean;
  /** TT-92: el proyecto como texto, sin disparador. */
  readonly readOnly?: boolean;
  readonly triggerRef?: Ref<HTMLButtonElement>;
  readonly onOpenChange?: (open: boolean) => void;
  /** TS-18: los pares que ya tienen fila en la planilla no se ofrecen. */
  readonly excluded?: readonly ProjectPair[];
};

type ProjectPickerProps = PickerCommonProps &
  (
    | { readonly value: ProjectSelection; readonly placeholder?: never }
    | {
        /** `null`: nada elegido; el disparador muestra `placeholder` y ninguna opción queda marcada. */
        readonly value: ProjectSelection | null;
        readonly placeholder: string;
      }
  );

/** Lo que nombra una opción y lo que muestra el disparador con selección. */
function selectionLabel({ project, task }: ProjectSelection): string {
  if (project === null) {
    return projectLabels.noProject;
  }
  return task === null ? project.name : projectTaskLabel(project.name, task.name);
}

/** El punto es decorativo: el nombre ya dice cuál es el proyecto. */
function ProjectDot({ project }: { readonly project: ProjectRef }) {
  return (
    <span
      aria-hidden="true"
      data-slot="project-dot"
      className="size-2 shrink-0 rounded-full"
      style={{ backgroundColor: paletteColor(project.color).value }}
    />
  );
}

/** Sin proyecto elegido: el ícono y un texto en gris. */
function EmptyText({ text }: { readonly text: string }) {
  return (
    <>
      <FolderIcon aria-hidden="true" className="text-muted-foreground" />
      <span className="text-muted-foreground">{text}</span>
    </>
  );
}

/** El punto y el nombre, o «Proyecto: Tarea». */
function SelectionText({ selection }: { readonly selection: ProjectSelection }) {
  if (selection.project === null) {
    return <span className="text-muted-foreground">{projectLabels.noProject}</span>;
  }
  return (
    <>
      <ProjectDot project={selection.project} />
      <span className="truncate">{selectionLabel(selection)}</span>
    </>
  );
}

/**
 * El selector de proyecto y tarea (TT-06 … TT-11): un disparador con rol
 * `combobox` que abre un diálogo con el buscador y la lista. No guarda la
 * selección: la recibe y avisa el cambio. Filtra solo `picker-model.ts`.
 */
export function ProjectPicker({
  value,
  placeholder = "",
  onChange,
  variant,
  label,
  pending = false,
  readOnly = false,
  triggerRef,
  onOpenChange,
  excluded,
}: ProjectPickerProps) {
  const catalog = useTrackingCatalog();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  if (readOnly) {
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-sm">
        {value === null ? (
          <span className="text-muted-foreground">{placeholder}</span>
        ) : (
          <SelectionText selection={value} />
        )}
      </span>
    );
  }

  const view = pickerView(catalog, search, excluded);
  // «Sin proyecto» va en un grupo propio solo para la primitiva, que pide que
  // todos los ítems estén agrupados; se dibuja sin grupo.
  const items: readonly PickerGroup[] =
    view.none === null
      ? view.groups
      : [{ key: "none", client: null, items: [view.none] }, ...view.groups];
  const current: PickerOption | null =
    value === null ? null : { key: "current", selection: value };

  function changeOpen(next: boolean): void {
    if (next && pending) {
      return;
    }
    setOpen(next);
    onOpenChange?.(next);
  }

  function choose(option: PickerOption | null): void {
    if (option === null || (value !== null && sameSelection(option.selection, value))) {
      return;
    }
    onChange(option.selection);
  }

  return (
    <Combobox<PickerOption>
      items={items}
      filter={null}
      value={current}
      onValueChange={choose}
      isItemEqualToValue={(item, selected) =>
        sameSelection(item.selection, selected.selection)
      }
      itemToStringLabel={(option) => selectionLabel(option.selection)}
      inputValue={search}
      onInputValueChange={setSearch}
      open={open}
      onOpenChange={changeOpen}
    >
      <ComboboxTrigger
        ref={triggerRef}
        aria-label={label}
        aria-disabled={pending || undefined}
        // Sin el typeahead un proyecto no cambia sin abrir el selector. Los
        // atajos del rastreador escuchan en el documento y no se ven afectados.
        onKeyDown={preventTypeahead}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "max-w-64 min-w-0 justify-start font-normal aria-disabled:opacity-60",
        )}
      >
        {value === null ? (
          <EmptyText text={placeholder} />
        ) : value.project === null && variant === "bar" ? (
          <EmptyText text={projectLabels.pickerEmpty} />
        ) : (
          <SelectionText selection={value} />
        )}
      </ComboboxTrigger>
      <ComboboxContent className="w-80">
        <ComboboxInput
          showTrigger={false}
          aria-label={projectLabels.pickerSearch}
          placeholder={projectLabels.pickerSearch}
        >
          <InputGroupAddon>
            <SearchIcon aria-hidden="true" />
          </InputGroupAddon>
        </ComboboxInput>
        <StatusRegion>
          {view.empty !== null && <EmptyMessage empty={view.empty} />}
        </StatusRegion>
        {/*
          Sin `Combobox.Empty` montado, con la lista vacía la primitiva deja
          pasar `Escape` y cierra también el diálogo del calendario. Los vacíos
          no van adentro: el de TT-87 se ve con «Sin proyecto» en la lista, y
          `Combobox.Empty` solo dibuja con la lista vacía.
        */}
        <ComboboxEmpty hidden />
        <ComboboxList>
          {view.none !== null && (
            <ComboboxItem value={view.none} className="text-muted-foreground">
              {projectLabels.noProject}
            </ComboboxItem>
          )}
          {view.groups.map((group) => (
            <ComboboxGroup key={group.key}>
              <ComboboxLabel>
                {group.client?.name ?? projectLabels.noClient}
              </ComboboxLabel>
              {group.items.map((option) => (
                <PickerItem key={option.key} option={option} />
              ))}
            </ComboboxGroup>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

/** Un proyecto con su punto, o una tarea con sangría debajo de su proyecto. */
function PickerItem({ option }: { readonly option: PickerOption }) {
  const { project, task } = option.selection;
  if (project === null) {
    return null;
  }
  if (task === null) {
    return (
      <ComboboxItem value={option} disabled={option.inactive === true}>
        <ProjectDot project={project} />
        <span className="truncate">{project.name}</span>
      </ComboboxItem>
    );
  }
  // El nombre accesible es «Proyecto: Tarea»; a la vista, la sangría dice de
  // qué proyecto es.
  return (
    <ComboboxItem
      value={option}
      aria-label={projectTaskLabel(project.name, task.name)}
      className="pl-6"
    >
      <span className="truncate">{task.name}</span>
    </ComboboxItem>
  );
}

/**
 * El vacío del selector. Un lector de pantalla anuncia los cambios de una
 * región `status`, no el texto con el que nace, y la región nace al abrir el
 * popup: se monta vacía y el texto entra un cuadro después, cuando la región
 * ya está en el árbol de accesibilidad, así el vacío de TT-87 se anuncia al
 * abrir. Después sigue montada y anuncia cada cambio de la búsqueda.
 */
function StatusRegion({ children }: { readonly children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div role="status" className="text-muted-foreground px-2 text-center text-sm">
      {mounted && children}
    </div>
  );
}

function EmptyMessage({ empty }: { readonly empty: PickerEmpty }) {
  if (empty.kind === "noMatches") {
    return <p className="py-2">{projectLabels.pickerNoMatches}</p>;
  }
  if (empty.kind === "allUsed") {
    return <p className="py-2">{projectLabels.pickerAllUsed}</p>;
  }
  return (
    <div className="flex flex-col items-center gap-1 py-2">
      <p>{projectLabels.pickerNoProjects}</p>
      {empty.canCreateProject && (
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
