import { revokeGrant } from "@/modules/mcp/actions";
import { AssistantGrants } from "@/modules/mcp/components/assistant-grants";
import { getGrantsView } from "@/modules/mcp/service";
import { updateName, updatePreference } from "@/modules/profile/actions";
import { ProfileScreen } from "@/modules/profile/components/profile-screen";
import { getProfileView } from "@/modules/profile/service";
import { requireSession } from "@/server/session";

export default async function ProfilePage() {
  const session = await requireSession();
  const grants = await getGrantsView(session);

  return (
    <div className="flex flex-col gap-8">
      <ProfileScreen
        view={getProfileView(session, session.user)}
        actions={{ updatePreference, updateName }}
      />
      {grants.kind === "ready" && (
        <AssistantGrants view={grants} revokeGrant={revokeGrant} />
      )}
    </div>
  );
}
