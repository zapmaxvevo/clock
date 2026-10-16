import { changeRole } from "@/modules/team/actions";
import { TeamScreen } from "@/modules/team/components/team-screen";
import { getTeamView } from "@/modules/team/service";
import { inviteMembers, revokeInvitation } from "@/modules/workspace/actions";
import { getInvitationsView } from "@/modules/workspace/service";
import { requireSession } from "@/server/session";

export default async function TeamPage() {
  const session = await requireSession();
  const view = await getTeamView(session.actor);
  // Sin la vista de `team`, las invitaciones no se leen (§5.1).
  const invitations =
    view.kind === "ready" ? await getInvitationsView(session.actor) : null;

  return (
    <TeamScreen
      view={view}
      invitations={invitations}
      actions={{ changeRole, inviteMembers, revokeInvitation }}
    />
  );
}
