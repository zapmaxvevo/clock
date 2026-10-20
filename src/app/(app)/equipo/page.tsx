import {
  changeRole,
  changeStatus,
  releaseEmail,
  setAccountLink,
} from "@/modules/team/actions";
import { timeSettingsOf } from "@/modules/profile/service";
import { TeamScreen } from "@/modules/team/components/team-screen";
import { teamSearchParams } from "@/modules/team/schema";
import { getTeamView } from "@/modules/team/service";
import { inviteMembers, revokeInvitation } from "@/modules/workspace/actions";
import { getInvitationsView } from "@/modules/workspace/service";
import { requireSession } from "@/server/session";

export default async function TeamPage({ searchParams }: PageProps<"/equipo">) {
  const session = await requireSession();
  // EQ-100: un `estado` inválido o repetido se ignora, como en la planilla.
  const search = teamSearchParams.safeParse(await searchParams);
  const filter = (search.success ? search.data.estado : undefined) ?? "activas";
  const view = await getTeamView(session.actor);
  // Sin la vista de `team`, las invitaciones no se leen (§5.1).
  const invitations =
    view.kind === "ready" ? await getInvitationsView(session.actor) : null;

  return (
    <TeamScreen
      view={view}
      invitations={invitations}
      filter={filter}
      settings={timeSettingsOf(session)}
      actions={{
        changeRole,
        changeStatus,
        setAccountLink,
        releaseEmail,
        inviteMembers,
        revokeInvitation,
      }}
    />
  );
}
