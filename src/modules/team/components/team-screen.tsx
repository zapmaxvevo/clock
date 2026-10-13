import { InactiveMembershipNotice } from "@/components/inactive-membership-notice";
import type { TeamActions, TeamView } from "@/modules/team/schema";

import { teamLabels } from "./labels";
import { TeamMembers } from "./team-members";
import { TEAM_HEADING_ID } from "./team-members-model";

type TeamScreenProps = {
  /** Sin `team.manage`, el service no leyó ninguna membresía (D-R8-2). */
  readonly view: TeamView;
  /** Las actions llegan por props desde `page.tsx`, el único que importa `actions.ts`. */
  readonly actions: TeamActions;
};

/**
 * `/equipo`: las membresías activas, con el botón que pasa una de `member` a
 * `admin` y de vuelta (D-R8-3). Una vista `ready` nunca está vacía: tiene, al
 * menos, la fila de quien mira.
 */
export function TeamScreen({ view, actions }: TeamScreenProps) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <h1 id={TEAM_HEADING_ID} className="text-xl font-semibold">
        {teamLabels.heading}
      </h1>
      {view.kind === "ready" ? (
        <>
          <p className="text-muted-foreground text-sm">{teamLabels.intro}</p>
          <TeamMembers members={view.members} changeRole={actions.changeRole} />
        </>
      ) : view.reason === "inactive" ? (
        <InactiveMembershipNotice body={teamLabels.forbiddenBody} />
      ) : (
        <p>{teamLabels.forbiddenRole}</p>
      )}
    </div>
  );
}
