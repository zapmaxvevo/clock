import { changeRole } from "@/modules/team/actions";
import { TeamScreen } from "@/modules/team/components/team-screen";
import { getTeamView } from "@/modules/team/service";
import { requireSession } from "@/server/session";

export default async function TeamPage() {
  const session = await requireSession();

  return <TeamScreen view={await getTeamView(session.actor)} actions={{ changeRole }} />;
}
