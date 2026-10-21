"use client";

import { SearchIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useEffectEvent,
  useId,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";

import { Badge } from "@/components/ui/badge";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sameId } from "@/lib/project-pair";
import { paletteColor } from "@/modules/project/palette";
import {
  NAME_MAX,
  PROJECT_FILTERS,
  type ClientView,
  type ProjectActions,
  type ProjectFilter,
  type ProjectListItem,
  type ProjectSettings,
} from "@/modules/project/schema";

import { EditProjectDialog } from "./edit-project-dialog";
import {
  colorDotLabel,
  projectFilterNames,
  projectLabels,
  projectSavedLabel,
  tasksLabel,
} from "./labels";
import { NewTaskDialog } from "./new-task-dialog";
import {
  projectListRows,
  projectsHref,
  searchOf,
  type ProjectListEmpty,
} from "./project-list-model";

/** Las opciones del filtro, en el orden de `PROJECT_FILTERS`. */
const filterItems = PROJECT_FILTERS.map((filter) => ({
  value: filter,
  label: projectFilterNames[filter],
}));

type ProjectListProps = {
  /** Activos y archivados, ya filtrados con `project.view` y ordenados (D-P1-6). */
  readonly projects: readonly ProjectListItem[];
  /** Los activos, para la edición. */
  readonly clients: readonly ClientView[];
  /** El `estado` y el `buscar` de la URL, ya validados por la página. */
  readonly filter: ProjectFilter;
  readonly search: string;
  readonly actions: Pick<ProjectActions, "updateProject" | "createTask">;
};

/**
 * PR-31, D-P1-6: la tabla de `/proyectos` con el buscador y el filtro de
 * estado, que viven en la URL (PR-95). Los dos filtran en el navegador: la
 * lista entera ya llegó para dibujarse.
 */
export function ProjectList({
  projects,
  clients,
  filter,
  search,
  actions,
}: ProjectListProps) {
  const searchId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [shownFilter, chooseFilter, navigating] = useFilterNavigation(filter);
  const [query, writeQuery] = useUrlSearch(search, shownFilter, navigating);
  const [announcement, setAnnouncement] = useState("");
  /** El proyecto recién editado, hasta saber si su fila sigue a la vista. */
  const saved = useRef<ProjectSettings | null>(null);
  const { rows, empty } = projectListRows(projects, shownFilter, query);

  // D-P1-8: si la fila editada deja de coincidir con la búsqueda, el diálogo
  // se va con ella y el foco pasa al buscador. Se decide cuando la lista ya
  // trae el proyecto como quedó; antes, la fila vieja todavía coincide.
  useEffect(() => {
    const project = saved.current;
    if (project === null) {
      return;
    }
    const current = projects.find((candidate) => sameId(candidate.id, project.id));
    if (current !== undefined && !reflects(current, project)) {
      return;
    }
    saved.current = null;
    if (!rows.some((row) => sameId(row.id, project.id))) {
      searchRef.current?.focus();
    }
  });

  function handleSaved(project: ProjectSettings): void {
    saved.current = project;
    setAnnouncement(projectSavedLabel(project.name));
  }

  return (
    <div className="flex flex-col gap-3">
      {/* D-P1-8: la fila ya muestra lo nuevo; esto confirma la edición. */}
      <p role="status" className="text-muted-foreground text-sm empty:hidden">
        {announcement}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <InputGroup className="max-w-72">
          <InputGroupAddon>
            <SearchIcon aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            ref={searchRef}
            id={searchId}
            type="search"
            aria-label={projectLabels.searchProjects}
            placeholder={projectLabels.searchProjects}
            maxLength={NAME_MAX}
            value={query}
            onChange={(event) => writeQuery(event.target.value)}
            autoComplete="off"
          />
        </InputGroup>
        <StatusFilter
          filter={shownFilter}
          onChoose={(next) => chooseFilter(next, query)}
        />
      </div>
      {/* Anuncia el vacío que deja la búsqueda o el filtro (PR-89). */}
      <div role="status">{empty === null ? null : <EmptyList empty={empty} />}</div>
      {rows.length > 0 && (
        <ProjectTable
          rows={rows}
          showArchived={shownFilter === "todos"}
          clients={clients}
          actions={actions}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

/** La lista ya trae el nombre y el cliente con que quedó la edición. */
function reflects(project: ProjectListItem, settings: ProjectSettings): boolean {
  return (
    project.name === settings.name &&
    sameId(project.client?.id ?? null, settings.clientId)
  );
}

/**
 * PR-95: el filtro navega con `router.push`, así cada uno es una entrada del
 * historial (D-P1-6). Mientras la página llega, ya se ve lo elegido; el
 * tercer valor dice si la navegación sigue en vuelo.
 */
function useFilterNavigation(
  filter: ProjectFilter,
): readonly [ProjectFilter, (next: ProjectFilter, search: string) => void, boolean] {
  const router = useRouter();
  const [shown, show] = useOptimistic<ProjectFilter, ProjectFilter>(
    filter,
    (_, next) => next,
  );
  const [navigating, startTransition] = useTransition();

  function choose(next: ProjectFilter, search: string): void {
    if (next === shown) {
      return;
    }
    startTransition(() => {
      show(next);
      router.push(projectsHref({ filter: next, search }));
    });
  }

  return [shown, choose, navigating];
}

/** El valor de `buscar` que deja una búsqueda: vacía, sin el parámetro. */
function echoOf(search: string): string | null {
  return search === "" ? null : search;
}

/**
 * PR-95, D-P1-6: lo escrito reemplaza `buscar` con `history.replaceState`, sin
 * pedido al servidor ni una entrada de historial por tecla. El campo sigue a
 * la URL cuando `buscar` cambia por otro camino, como al volver atrás.
 *
 * Next sincroniza `useSearchParams` en una transición, así que la URL de una
 * tecla puede llegar después de la tecla siguiente. Los valores escritos que
 * todavía no llegaron son ecos propios y no se copian al campo.
 *
 * Con la navegación del filtro en vuelo, un `replaceState` la cancelaría: lo
 * escrito queda en el campo y pasa a la URL cuando la navegación se asienta.
 */
function useUrlSearch(
  initial: string,
  filter: ProjectFilter,
  navigating: boolean,
): readonly [string, (next: string) => void] {
  const params = useSearchParams();
  const fromUrl = params.get("buscar");
  const [query, setQuery] = useState(initial);
  const [seen, setSeen] = useState(fromUrl);
  const [echoes, setEchoes] = useState<readonly (string | null)[]>([]);

  if (fromUrl !== seen) {
    setSeen(fromUrl);
    const echo = echoes.indexOf(fromUrl);
    if (echo === -1) {
      setEchoes([]);
      setQuery(searchOf(params));
    } else {
      setEchoes(echoes.slice(echo + 1));
    }
  }

  // Lo escrito mientras viajaba la navegación todavía no está en la URL.
  const unwritten = (fromUrl ?? "") !== query;
  const [wasNavigating, setWasNavigating] = useState(navigating);
  if (navigating !== wasNavigating) {
    setWasNavigating(navigating);
    // Al asentarse, lo que el efecto escribe es un eco propio.
    if (!navigating && unwritten) {
      setEchoes([...echoes, echoOf(query)]);
    }
  }

  function replaceUrl(next: string): void {
    window.history.replaceState(null, "", projectsHref({ filter, search: next }));
  }

  const writeUnwritten = useEffectEvent(() => {
    if (unwritten) {
      replaceUrl(query);
    }
  });

  // Al asentarse la navegación; al escribir sin navegación, lo hace `write`.
  useEffect(() => {
    if (!navigating) {
      writeUnwritten();
    }
  }, [navigating]);

  function write(next: string): void {
    setQuery(next);
    if (navigating) {
      return;
    }
    setEchoes((pending) => [...pending, echoOf(next)]);
    replaceUrl(next);
  }

  return [query, write];
}

type StatusFilterProps = {
  readonly filter: ProjectFilter;
  readonly onChoose: (next: ProjectFilter) => void;
};

/** PR-31: «Activos», «Archivados» y «Todos», como el filtro de `/equipo`. */
function StatusFilter({ filter, onChoose }: StatusFilterProps) {
  const controlId = useId();

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={controlId}>{projectLabels.statusFilter}</Label>
      <Select
        items={filterItems}
        value={filter}
        onValueChange={(next) => {
          const chosen = PROJECT_FILTERS.find((candidate) => candidate === next);
          if (chosen !== undefined) {
            onChoose(chosen);
          }
        }}
      >
        <SelectTrigger id={controlId} size="sm" className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {filterItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** PR-85, PR-89, TT-07: cada vacío con su texto. */
function EmptyList({ empty }: { readonly empty: ProjectListEmpty }) {
  return (
    <div className="rounded-lg border border-dashed px-6 py-12 text-center">
      <p className="font-medium">{emptyText[empty]}</p>
      {empty === "noActive" && (
        <p className="text-muted-foreground mt-1 text-sm">{projectLabels.noActiveHint}</p>
      )}
    </div>
  );
}

const emptyText = {
  // PR-85: el botón de crear es el «Nuevo proyecto» de la cabecera.
  none: projectLabels.empty,
  noActive: projectLabels.noActive,
  noArchived: projectLabels.noArchived,
  noMatches: projectLabels.pickerNoMatches,
} as const satisfies { readonly [E in ProjectListEmpty]: string };

type ProjectTableProps = {
  readonly rows: readonly ProjectListItem[];
  /** Con «Todos», un archivado lleva su marca al lado del nombre. */
  readonly showArchived: boolean;
  readonly clients: readonly ClientView[];
  readonly actions: Pick<ProjectActions, "updateProject" | "createTask">;
  readonly onSaved: (project: ProjectSettings) => void;
};

/** PR-31, D-P1-7: una fila por proyecto; en pantallas angostas, se desplaza. */
function ProjectTable({
  rows,
  showArchived,
  clients,
  actions,
  onSaved,
}: ProjectTableProps) {
  const { columns } = projectLabels;

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <caption className="sr-only">{projectLabels.title}</caption>
        <thead className="text-muted-foreground text-left">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium">
              {columns.name}
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              {columns.client}
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              {columns.access}
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              {columns.tasks}
            </th>
            <th scope="col" className="px-4 py-2">
              <span className="sr-only">{columns.actions}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              showArchived={showArchived}
              clients={clients}
              actions={actions}
              onSaved={onSaved}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

type ProjectRowProps = Omit<ProjectTableProps, "rows"> & {
  readonly project: ProjectListItem;
};

function ProjectRow({
  project,
  showArchived,
  clients,
  actions,
  onSaved,
}: ProjectRowProps) {
  const color = paletteColor(project.color);
  const { client, settings } = project;

  return (
    <tr className="border-t align-top">
      <th scope="row" className="px-4 py-3 text-left font-medium">
        <span className="flex items-center gap-2">
          <span
            role="img"
            aria-label={colorDotLabel(color.label)}
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: color.value }}
          />
          <span>{project.name}</span>
          {showArchived && project.archived && (
            <Badge variant="outline">{projectLabels.archived}</Badge>
          )}
        </span>
      </th>
      <td className="px-4 py-3">{client?.name ?? projectLabels.noClient}</td>
      <td className="px-4 py-3">
        {project.isPublic ? projectLabels.public : projectLabels.private}
      </td>
      <td className="px-4 py-3">
        {project.tasks.length > 0 && (
          <ul aria-label={tasksLabel(project.name)} className="flex flex-col gap-1">
            {project.tasks.map((task) => (
              <li key={task.id}>{task.name}</li>
            ))}
          </ul>
        )}
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center justify-end gap-1">
          {project.canUpdate && settings !== null && (
            <EditProjectDialog
              updateProject={actions.updateProject}
              settings={settings}
              clients={clients}
              archivedClient={client?.archived === true ? client : null}
              onSaved={onSaved}
            />
          )}
          {project.canCreateTask && (
            <NewTaskDialog
              createTask={actions.createTask}
              projectId={project.id}
              projectName={project.name}
            />
          )}
        </div>
      </td>
    </tr>
  );
}
