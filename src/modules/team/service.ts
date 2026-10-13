import { DomainError } from "@/server/action";
import { can, type Actor } from "@/server/permissions";

import type { ChangeRoleInput, ChangeRoleResult, TeamErrorCode, TeamView } from "./schema";

/** Error de dominio del módulo. La action lo traduce a un resultado tipado. */
export class TeamError extends DomainError<TeamErrorCode> {
  constructor(code: TeamErrorCode, message: string) {
    super(code, message);
    this.name = "TeamError";
  }
}

/** `can(actor, "team.manage", workspace)`: la entrada de la navegación, la vista y la puerta de la mutación. */
export function canManageTeam(actor: Actor): boolean {
  return can(actor, "team.manage", { kind: "workspace", workspaceId: actor.workspaceId });
}

/** D-R8-2, D-R8-3. Sin `team.manage`, no lee. */
export async function getTeamView(_actor: Actor): Promise<TeamView> {
  throw new Error("R8: getTeamView sin implementar.");
}

/** D-R8-4 a D-R8-9. */
export async function changeRole(
  _actor: Actor,
  _input: ChangeRoleInput,
): Promise<ChangeRoleResult> {
  throw new Error("R8: changeRole sin implementar.");
}
