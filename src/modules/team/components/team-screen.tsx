import { InactiveMembershipNotice } from "@/components/inactive-membership-notice";
import type { TeamActions, TeamFilter, TeamView } from "@/modules/team/schema";
import type { InvitationActions, InvitationsView } from "@/modules/workspace/schema";
import type { TimeSettings } from "@/server/time";

import { teamLabels } from "./labels";
import { TeamMembers } from "./team-members";
import { rowNotesOf, TEAM_HEADING_ID } from "./team-members-model";

type TeamScreenProps = {
  /** Sin `team.manage`, el service no leyó ninguna membresía (D-R8-2). */
  readonly view: TeamView;
  /**
   * La vista de `workspace`, que la página pide solo con la de `team` lista;
   * `null` si no la pidió. Sin `member.invite`, `forbidden`: la tabla sigue,
   * sin invitadas ni «Invitar».
   */
  readonly invitations: InvitationsView | null;
  /** El filtro de `?estado=`, ya parseado por la página (D-E2-8). */
  readonly filter: TeamFilter;
  /** La zona y los formatos de quien mira, de `timeSettingsOf`: las fechas de las notas (§5.2 de E2b). */
  readonly settings: TimeSettings;
  /**
   * Las actions de `team` y de `workspace` llegan por props desde `page.tsx`,
   * el único que importa los `actions.ts` (D-E1a-1).
   */
  readonly actions: TeamActions & InvitationActions;
};

/**
 * `/equipo`: las membresías activas e inactivas, con el botón que pasa una de
 * `member` a `admin` y de vuelta (D-R8-3) y el menú que la desactiva o la
 * reactiva (E2), pide o cancela la vinculación de su cuenta de Google y libera
 * su correo (E2b), y las invitaciones pendientes, con «Invitar» y «Revocar
 * invitación» (E1a), según el filtro de estado. Una vista `ready` nunca está
 * vacía: tiene, al menos, la fila de quien mira.
 */
export function TeamScreen({
  view,
  invitations,
  filter,
  settings,
  actions,
}: TeamScreenProps) {
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
          filter={filter}
          linkTtlDays={view.linkTtlDays}
          // ADR 0012: la zona es del servidor; este componente lo es.
          notes={rowNotesOf(view.members, settings)}
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
