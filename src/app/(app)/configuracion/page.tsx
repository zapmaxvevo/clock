import { updateWorkspaceName, updateWorkspaceSetting } from "@/modules/workspace/actions";
import { WorkspaceSettingsScreen } from "@/modules/workspace/components/workspace-settings-screen";
import { getWorkspaceSettingsView } from "@/modules/workspace/service";
import { requireSession } from "@/server/session";

export default async function WorkspaceSettingsPage() {
  const session = await requireSession();

  return (
    <WorkspaceSettingsScreen
      view={await getWorkspaceSettingsView(session)}
      actions={{ updateWorkspaceName, updateWorkspaceSetting }}
    />
  );
}
