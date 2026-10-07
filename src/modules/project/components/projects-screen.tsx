import { paletteColor } from "@/modules/project/palette";
import type {
  ProjectActions,
  ProjectCatalog,
  ProjectGroupView,
  ProjectView,
  TagRef,
} from "@/modules/project/schema";

import { colorDotLabel, projectLabels, tasksLabel } from "./labels";
import { NewClientDialog } from "./new-client-dialog";
import { NewProjectDialog } from "./new-project-dialog";
import { NewTagDialog } from "./new-tag-dialog";
import { NewTaskDialog } from "./new-task-dialog";
import { ProjectNoticeRegion, ProjectNoticesProvider } from "./project-notices";

type ProjectsScreenProps = {
  /** Ya filtrado con `can()` y ordenado por el service (PR-61, PR-31). */
  readonly catalog: ProjectCatalog;
  /** Las actions llegan por props desde `page.tsx`, el único que importa `actions.ts`. */
  readonly actions: ProjectActions;
};

/**
 * `/proyectos`: los proyectos visibles agrupados por cliente, las etiquetas
 * activas, y un solo lugar para crear cada entidad (PR-04, D-1). Los diálogos
 * de cliente, de proyecto y de etiqueta viven en la cabecera, una vez cada
 * uno.
 */
export function ProjectsScreen({ catalog, actions }: ProjectsScreenProps) {
  return (
    <ProjectNoticesProvider>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="text-xl font-semibold">{projectLabels.title}</h1>
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
            {catalog.canCreateClient && (
              <NewClientDialog createClient={actions.createClient} />
            )}
            {catalog.canCreateProject && (
              <NewProjectDialog
                createProject={actions.createProject}
                clients={catalog.clients}
              />
            )}
            {catalog.canCreateTag && <NewTagDialog createTag={actions.createTag} />}
          </div>
        </div>

        <ProjectNoticeRegion />

        {catalog.groups.length === 0 ? (
          // PR-85: el botón de crear es el «Nuevo proyecto» de la cabecera.
          <div className="rounded-lg border border-dashed px-6 py-12 text-center">
            <p className="font-medium">{projectLabels.empty}</p>
          </div>
        ) : (
          catalog.groups.map((group) => (
            <ProjectGroup key={group.client?.id ?? ""} group={group} actions={actions} />
          ))
        )}

        <TagList tags={catalog.tags} />
      </div>
    </ProjectNoticesProvider>
  );
}

type ProjectGroupProps = {
  readonly group: ProjectGroupView;
  readonly actions: ProjectActions;
};

function ProjectGroup({ group, actions }: ProjectGroupProps) {
  const headingId = `group-${group.client?.id ?? "none"}`;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="text-muted-foreground text-sm font-medium">
        {group.client?.name ?? projectLabels.noClient}
      </h2>
      <ul className="divide-y rounded-lg border">
        {group.projects.map((project) => (
          <ProjectItem key={project.id} project={project} actions={actions} />
        ))}
      </ul>
    </section>
  );
}

type ProjectItemProps = {
  readonly project: ProjectView;
  readonly actions: ProjectActions;
};

function ProjectItem({ project, actions }: ProjectItemProps) {
  const color = paletteColor(project.color);

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center gap-2">
        <span
          role="img"
          aria-label={colorDotLabel(color.label)}
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: color.value }}
        />
        <h3 className="min-w-0 flex-1 truncate font-medium">{project.name}</h3>
        {project.canCreateTask && (
          <NewTaskDialog
            createTask={actions.createTask}
            projectId={project.id}
            projectName={project.name}
          />
        )}
      </div>
      {project.tasks.length > 0 && (
        <ul
          aria-label={tasksLabel(project.name)}
          className="text-muted-foreground flex flex-col gap-1 pl-4 text-sm"
        >
          {project.tasks.map((task) => (
            <li key={task.id}>{task.name}</li>
          ))}
        </ul>
      )}
    </li>
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
