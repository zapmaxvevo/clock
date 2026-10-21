import type {
  ProjectActions,
  ProjectFilter,
  ProjectListView,
  TagRef,
} from "@/modules/project/schema";

import { projectLabels } from "./labels";
import { NewClientDialog } from "./new-client-dialog";
import { NewProjectDialog } from "./new-project-dialog";
import { NewTagDialog } from "./new-tag-dialog";
import { ProjectList } from "./project-list";
import { ProjectNoticeRegion, ProjectNoticesProvider } from "./project-notices";

type ProjectsScreenProps = {
  /** Ya filtrada con `can()` y ordenada por el service (PR-61, PR-31). */
  readonly list: ProjectListView;
  /** El `estado` y el `buscar` de la URL, ya validados (D-P1-6). */
  readonly filter: ProjectFilter;
  readonly search: string;
  /** Las actions llegan por props desde `page.tsx`, el único que importa `actions.ts`. */
  readonly actions: ProjectActions;
};

/**
 * `/proyectos`: la tabla de los proyectos visibles, activos y archivados
 * (D-P1-1, D-P1-6), las etiquetas activas, y un solo lugar para crear cada
 * entidad (PR-04, D-1). Los diálogos de cliente, de proyecto y de etiqueta
 * viven en la cabecera, una vez cada uno; los de cada proyecto, en su fila.
 */
export function ProjectsScreen({ list, filter, search, actions }: ProjectsScreenProps) {
  return (
    <ProjectNoticesProvider>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="text-xl font-semibold">{projectLabels.title}</h1>
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
            {list.canCreateClient && (
              <NewClientDialog createClient={actions.createClient} />
            )}
            {list.canCreateProject && (
              <NewProjectDialog
                createProject={actions.createProject}
                clients={list.clients}
              />
            )}
            {list.canCreateTag && <NewTagDialog createTag={actions.createTag} />}
          </div>
        </div>

        <ProjectNoticeRegion />

        <ProjectList
          projects={list.projects}
          clients={list.clients}
          filter={filter}
          search={search}
          actions={{
            updateProject: actions.updateProject,
            createTask: actions.createTask,
          }}
        />

        <TagList tags={list.tags} />
      </div>
    </ProjectNoticesProvider>
  );
}

/**
 * PR-112 y H-13: las etiquetas activas, ya en orden alfabético. Sin acciones
 * por etiqueta: editarlas y archivarlas es de la fase 2.
 */
function TagList({ tags }: { readonly tags: readonly TagRef[] }) {
  const headingId = "tags-heading";

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="text-muted-foreground text-sm font-medium">
        {projectLabels.tags}
      </h2>
      {tags.length === 0 ? (
        // PR-88: el botón de crear es el «Nueva etiqueta» de la cabecera.
        <p className="rounded-lg border border-dashed px-4 py-3 text-sm">
          {projectLabels.tagsEmpty}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {tags.map((tag) => (
            <li key={tag.id} className="px-4 py-2">
              {tag.name}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Lo que se ve mientras el catálogo carga en el servidor. */
export function ProjectsSkeleton() {
  return (
    <div role="status" className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <span className="sr-only">{projectLabels.loading}</span>
      <div className="bg-muted/60 h-8 w-40 animate-pulse rounded-lg" />
      <div className="bg-muted/40 h-32 animate-pulse rounded-lg" />
      <div className="bg-muted/40 h-32 animate-pulse rounded-lg" />
    </div>
  );
}
