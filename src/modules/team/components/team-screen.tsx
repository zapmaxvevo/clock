import { InactiveMembershipNotice } from "@/components/inactive-membership-notice";
import type { TeamActions, TeamView } from "@/modules/team/schema";
import type { InvitationActions, InvitationsView } from "@/modules/workspace/schema";

import { teamLabels } from "./labels";
import { TeamMembers } from "./team-members";
import { TEAM_HEADING_ID } from "./team-members-model";

type TeamScreenProps = {
  /** Sin `team.manage`, el service no leyó ninguna membresía (D-R8-2). */
  readonly view: TeamView;
  /**
   * La vista de `workspace`, que la página pide solo con la de `team` lista;
   * `null` si no la pidió. Sin `member.invite`, `forbidden`: la tabla sigue,
   * sin invitadas ni «Invitar».
   */
  readonly invitations: InvitationsView | null;
  /**
   * Las actions de `team` y de `workspace` llegan por props desde `page.tsx`,
   * el único que importa los `actions.ts` (D-E1a-1).
   */
  readonly actions: TeamActions & InvitationActions;
};

/**
 * `/equipo`: las membresías activas, con el botón que pasa una de `member` a
 * `admin` y de vuelta (D-R8-3), y las invitaciones pendientes, con «Invitar» y
 * «Revocar invitación» (E1a). Una vista `ready` nunca está vacía: tiene, al
 * menos, la fila de quien mira.
 */
export function TeamScreen({ view, invitations, actions }: TeamScreenProps) {
  // Con `tabIndex={-1}`: recibe el foco cuando una revocación saca la fila (§5.4).
  const heading = (
    <h1
      id={TEAM_HEADING_ID}
      tabIndex={-1}
      className="focus-visible:ring-ring/50 text-xl font-semibold outline-none focus-visible:ring-3"
    >
      {teamLabels.heading}
    </h1>
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      {view.kind === "ready" ? (
        <TeamMembers
          heading={heading}
          members={view.members}
          invitations={invitations?.kind === "ready" ? invitations : null}
          actions={actions}
        />
      ) : (
        <>
          {heading}
          {view.reason === "inactive" ? (
            <InactiveMembershipNotice body={teamLabels.forbiddenBody} />
          ) : (
            <p>{teamLabels.forbiddenRole}</p>
          )}
        </>
      )}
    </div>
  );
}
