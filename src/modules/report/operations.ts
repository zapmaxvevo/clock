import { assertCan } from "@/server/permissions";
import { timeSettingsOf, type ProfileContext } from "@/modules/profile/service";

import * as service from "./service";
import { workspaceResource } from "./service";
import {
  hoursSummaryInput,
  type HoursSummaryInput,
  type PeopleCatalog,
  type ReportReadyState,
} from "./schema";

/**
 * D-MCPE-1: la validación, el permiso y el service de las lecturas del reporte
 * que usa el asistente. Una regla nueva de la operación va acá.
 */

/** RP-22: los días se cortan en la zona de quien pide, la de `get_context`. */
export async function summarizeHours(
  context: ProfileContext,
  input: HoursSummaryInput,
): Promise<ReportReadyState> {
  const values = hoursSummaryInput.parse(input);
  assertCan(context.actor, "report.view", workspaceResource(context.actor));
  return service.getHoursSummary(context.actor, timeSettingsOf(context), values);
}

export async function listPeople(context: ProfileContext): Promise<PeopleCatalog> {
  assertCan(context.actor, "report.view", workspaceResource(context.actor));
  return service.getPeopleCatalog(context.actor);
}
