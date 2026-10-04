import { paletteColor } from "@/modules/project/palette";
import type {
  ProjectActions,
  ProjectCatalog,
  ProjectGroupView,
  ProjectView,
} from "@/modules/project/schema";

import { colorDotLabel, projectLabels, tasksLabel } from "./labels";
import { NewClientDialog } from "./new-client-dialog";
import { NewProjectDialog } from "./new-project-dialog";
import { NewTaskDialog } from "./new-task-dialog";

type ProjectsScreenProps = {
  /** Ya filtrado con `can()` y ordenado por el service (PR-61, PR-31). */
  readonly catalog: ProjectCatalog;
  /** Las actions llegan por props desde `page.tsx`, el único que importa `actions.ts`. */
  readonly actions: ProjectActions;
};

/**
 * `/proyectos`: los proyectos visibles agrupados por cliente, y un solo lugar
 * para crear cada entidad (PR-04). Los diálogos de cliente y de proyecto
 * viven en la cabecera, una vez cada uno.
 */
export function ProjectsScreen({ catalog, actions }: ProjectsScreenProps) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-xl font-semibold">{projectLabels.title}</h1>
        <div className="flex flex-wrap items-center gap-3">
          {catalog.canCreateClient && (
            <NewClientDialog createClient={actions.createClient} />
          )}
          {catalog.canCreateProject && (
            <NewProjectDialog
              createProject={actions.createProject}
              clients={catalog.clients}
            />
          )}
        </div>
      </div>

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
    </div>
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

/** Lo que se ve mientras el catálogo carga en el servidor. */
export function ProjectsSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label={projectLabels.loading}
      role="status"
      className="mx-auto flex w-full max-w-4xl flex-col gap-6"
    >
      <div className="bg-muted/60 h-8 w-40 animate-pulse rounded-lg" />
      <div className="bg-muted/40 h-32 animate-pulse rounded-lg" />
      <div className="bg-muted/40 h-32 animate-pulse rounded-lg" />
    </div>
  );
}
