import {
  createClient,
  createProject,
  createTag,
  createTask,
  updateProject,
} from "@/modules/project/actions";
import { ProjectsScreen } from "@/modules/project/components/projects-screen";
import { projectsSearchParams } from "@/modules/project/schema";
import { getProjectList } from "@/modules/project/service";
import { requireSession } from "@/server/session";

export default async function ProjectsPage({ searchParams }: PageProps<"/proyectos">) {
  const session = await requireSession();
  // D-P1-6: cada parámetro inválido se ignora por separado (ADR 0008).
  const params = projectsSearchParams.safeParse(await searchParams);
  const filter = (params.success ? params.data.estado : undefined) ?? "activos";
  const search = (params.success ? params.data.buscar : undefined) ?? "";
  const list = await getProjectList(session.actor);

  return (
    <ProjectsScreen
      list={list}
      filter={filter}
      search={search}
      actions={{ createClient, createProject, createTask, createTag, updateProject }}
    />
  );
}
