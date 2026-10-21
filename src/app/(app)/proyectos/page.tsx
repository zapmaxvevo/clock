import {
  createClient,
  createProject,
  createTag,
  createTask,
  updateProject,
} from "@/modules/project/actions";
import { ProjectsScreen } from "@/modules/project/components/projects-screen";
import { getProjectCatalog } from "@/modules/project/service";
import { requireSession } from "@/server/session";

export default async function ProjectsPage() {
  const session = await requireSession();
  const catalog = await getProjectCatalog(session.actor);

  return (
    <ProjectsScreen
      catalog={catalog}
      actions={{ createClient, createProject, createTask, createTag, updateProject }}
    />
  );
}
