"use client";

import { FolderIcon, PlusIcon, SearchIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";

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
  ComboboxSeparator,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { InputGroupAddon } from "@/components/ui/input-group";
import type { ProjectPair } from "@/lib/project-pair";
import { cn } from "@/lib/utils";
import { paletteColor } from "@/modules/project/palette";
import type { ProjectRef, ProjectSelection } from "@/modules/project/schema";

import { projectLabels, projectTaskLabel } from "./labels";
import { NewProjectFromPicker } from "./new-project-from-picker";
import {
  catalogEntryOf,
  NO_CREATION,
  pickerView,
  remainingCreation,
  sameSelection,
  type PickerEmpty,
  type PickerItem,
  type PickerOption,
  type PickerView,
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

/** Lo que la primitiva recibe: todos los ítems van agrupados. */
type ItemGroup = { readonly key: string; readonly items: readonly PickerItem[] };

/** El mismo valor, o los dos sin valor (la edición masiva sin cambios). */
function sameValue(a: ProjectSelection | null, b: ProjectSelection | null): boolean {
  return a === null || b === null ? a === b : sameSelection(a, b);
}

/** Asigna el disparador a la referencia que pasa quien usa el selector. */
function assignRef<T>(ref: Ref<T> | undefined, node: T | null): void {
  if (typeof ref === "function") {
    ref(node);
  } else if (ref !== null && ref !== undefined) {
    ref.current = node;
  }
}

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
  const [creation, setCreation] = useState(NO_CREATION);
  /** La selección que el catálogo ya trae; el efecto la entrega una sola vez. */
  const [delivery, setDelivery] = useState<ProjectSelection | null>(null);
  const delivered = useRef<ProjectSelection | null>(null);
  const [seenValue, setSeenValue] = useState(value);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const setTrigger = useCallback(
    (node: HTMLButtonElement | null) => {
      trigger.current = node;
      assignRef(triggerRef, node);
    },
    [triggerRef],
  );

  const valueChanged = !sameValue(seenValue, value);
  if (valueChanged) {
    setSeenValue(value);
  }
  const remaining = remainingCreation(creation, { readOnly, valueChanged });
  if (remaining !== creation) {
    setCreation(remaining);
  }

  // D-P1-11: quien recibe `onChange` busca el proyecto en el catálogo (el
  // facturable por defecto, el par de la planilla). Se entrega cuando el
  // catálogo, que llega con la revalidación del alta, ya lo trae.
  const { created } = remaining;
  if (created !== null) {
    const entry = catalogEntryOf(catalog, { projectId: created.id, taskId: null });
    if (entry !== null) {
      const { id, name, color } = entry.project;
      setCreation({ ...remaining, created: null });
      setDelivery({ project: { id, name, color }, task: null });
    }
  }

  useEffect(() => {
    if (delivery === null || delivered.current === delivery) {
      return;
    }
    delivered.current = delivery;
    onChange(delivery);
  }, [delivery, onChange]);

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

  function changeOpen(next: boolean): void {
    if (next && pending) {
      return;
    }
    if (next) {
      setCreation((current) => ({ ...current, created: null }));
    }
    setOpen(next);
    onOpenChange?.(next);
  }

  function choose(option: PickerItem | null): void {
    if (option === null) {
      return;
    }
    // TT-09: no es una selección; abre el alta con la búsqueda.
    if (option.kind === "create") {
      changeOpen(false);
      setCreation((current) => ({ ...current, creating: option.name }));
      return;
    }
    if (value !== null && sameSelection(option.selection, value)) {
      return;
    }
    onChange(option.selection);
  }

  return (
    <>
      <Combobox<PickerItem>
        {...pickerComboboxProps(view, value)}
        filter={null}
        onValueChange={choose}
        inputValue={search}
        onInputValueChange={setSearch}
        open={open}
        onOpenChange={changeOpen}
      >
        <ComboboxTrigger
          ref={setTrigger}
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
            {view.empty !== null && <PickerEmptyMessage empty={view.empty} />}
          </StatusRegion>
          {/*
            Sin `Combobox.Empty` montado, con la lista vacía la primitiva deja
            pasar `Escape` y cierra también el diálogo del calendario. Los
            vacíos no van adentro: el de TT-87 se ve con «Sin proyecto» en la
            lista, y `Combobox.Empty` solo dibuja con la lista vacía.
          */}
          <ComboboxEmpty hidden />
          <PickerOptions view={view} />
        </ComboboxContent>
      </Combobox>
      {creation.creating !== null && (
        <NewProjectFromPicker
          name={creation.creating}
          finalFocus={() => trigger.current}
          onCreated={(project) =>
            setCreation((current) => ({ ...current, created: project }))
          }
          onClosed={() => setCreation((current) => ({ ...current, creating: null }))}
        />
      )}
    </>
  );
}

/**
 * Lo que la primitiva recibe de la vista y del valor. «Sin proyecto» y «Crear
 * proyecto» van en grupos propios solo para ella, que pide que todos los
 * ítems estén agrupados; se dibujan sin grupo. «Crear proyecto» no es una
 * selección: nunca compara igual al valor (D-P1-10).
 */
export function pickerComboboxProps(view: PickerView, value: ProjectSelection | null) {
  const items: readonly ItemGroup[] = [
    ...(view.none === null ? [] : [{ key: "none", items: [view.none] }]),
    ...view.groups,
    ...(view.create === null ? [] : [{ key: "create", items: [view.create] }]),
  ];
  const current: PickerItem | null =
    value === null ? null : { kind: "selection", key: "current", selection: value };
  return {
    items,
    value: current,
    isItemEqualToValue: (item: PickerItem, selected: PickerItem) =>
      item.kind === "selection" &&
      selected.kind === "selection" &&
      sameSelection(item.selection, selected.selection),
    itemToStringLabel: (option: PickerItem) =>
      option.kind === "create"
        ? projectLabels.pickerCreateProject
        : selectionLabel(option.selection),
  };
}

/** La lista: «Sin proyecto», los proyectos por cliente y, al final, «Crear proyecto». */
export function PickerOptions({ view }: { readonly view: PickerView }) {
  return (
    <ComboboxList>
      {view.none !== null && (
        <ComboboxItem value={view.none} className="text-muted-foreground">
          {projectLabels.noProject}
        </ComboboxItem>
      )}
      {view.groups.map((group) => (
        <ComboboxGroup key={group.key}>
          <ComboboxLabel>{group.client?.name ?? projectLabels.noClient}</ComboboxLabel>
          {group.items.map((option) => (
            <SelectionItem key={option.key} option={option} />
          ))}
        </ComboboxGroup>
      ))}
      {view.create !== null && (
        <>
          <ComboboxSeparator />
          <ComboboxItem value={view.create}>
            <PlusIcon aria-hidden="true" />
            {projectLabels.pickerCreateProject}
          </ComboboxItem>
        </>
      )}
    </ComboboxList>
  );
}

/** Un proyecto con su punto, o una tarea con sangría debajo de su proyecto. */
function SelectionItem({ option }: { readonly option: PickerOption }) {
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

export function PickerEmptyMessage({ empty }: { readonly empty: PickerEmpty }) {
  if (empty.kind === "noMatches") {
    return <p className="py-2">{projectLabels.pickerNoMatches}</p>;
  }
  if (empty.kind === "allUsed") {
    return <p className="py-2">{projectLabels.pickerAllUsed}</p>;
  }
  // TT-87, TS-88: «Crear proyecto» va en la lista, debajo de «Sin proyecto».
  return <p className="py-2">{projectLabels.pickerNoProjects}</p>;
}
