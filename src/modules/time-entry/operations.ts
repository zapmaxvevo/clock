import { assertCan } from "@/server/permissions";
import type { ProfileContext } from "@/modules/profile/service";

import * as service from "./service";
import { ownTimeEntryResource, trackerWorkspaceOf } from "./service";
import {
  createManualEntryInput,
  deleteEntryInput,
  entriesPeriodInput,
  startTimerInput,
  stopTimerInput,
  updateEntryInput,
  type CreateManualEntryInput,
  type CreateManualEntryResult,
  type DeleteEntryInput,
  type DeleteEntryResult,
  type EntriesOfPeriod,
  type EntriesPeriodInput,
  type StartTimerInput,
  type StartTimerResult,
  type StopTimerInput,
  type StopTimerResult,
  type TimeEntryView,
  type UpdateEntryInput,
  type UpdateEntryResult,
} from "./schema";

/**
 * D-MCP-8: la validación, el permiso y el service de cada operación que comparten
 * la action y la herramienta del MCP. Una regla nueva de la operación va acá.
 */

export async function startTimer(
  context: ProfileContext,
  input: StartTimerInput,
): Promise<StartTimerResult> {
  const values = startTimerInput.parse(input);
  assertCan(context.actor, "timeEntry.own.create", ownTimeEntryResource(context.actor));
  return service.startTimer(context.actor, trackerWorkspaceOf(context), values);
}

export async function stopTimer(
  context: ProfileContext,
  input: StopTimerInput,
): Promise<StopTimerResult> {
  const values = stopTimerInput.parse(input);
  assertCan(context.actor, "timeEntry.own.update", ownTimeEntryResource(context.actor));
  return service.stopTimer(context.actor, trackerWorkspaceOf(context), values);
}

export async function createManualEntry(
  context: ProfileContext,
  input: CreateManualEntryInput,
): Promise<CreateManualEntryResult> {
  const values = createManualEntryInput.parse(input);
  assertCan(context.actor, "timeEntry.own.create", ownTimeEntryResource(context.actor));
  return service.createManualEntry(context.actor, trackerWorkspaceOf(context), values);
}

/** El «Guardar» del diálogo de una entrada: los grupos tocados, todo o nada (ADR 0013). */
export async function updateEntry(
  context: ProfileContext,
  input: UpdateEntryInput,
): Promise<UpdateEntryResult> {
  const values = updateEntryInput.parse(input);
  assertCan(context.actor, "timeEntry.own.update", ownTimeEntryResource(context.actor));
  return service.updateEntry(context.actor, trackerWorkspaceOf(context), values);
}

export async function deleteEntry(
  context: ProfileContext,
  input: DeleteEntryInput,
): Promise<DeleteEntryResult> {
  const values = deleteEntryInput.parse(input);
  assertCan(context.actor, "timeEntry.own.delete", ownTimeEntryResource(context.actor));
  return service.deleteEntry(context.actor, values);
}

/** Lee solo lo propio: no consulta más que la sesión o el token, como el rastreador. */
export async function listEntriesOfPeriod(
  context: ProfileContext,
  input: EntriesPeriodInput,
): Promise<EntriesOfPeriod> {
  const values = entriesPeriodInput.parse(input);
  return service.listEntriesOfPeriod(context.actor, trackerWorkspaceOf(context), values);
}

export async function getRunningEntry(
  context: ProfileContext,
): Promise<TimeEntryView | null> {
  return service.getRunningEntry(context.actor, trackerWorkspaceOf(context));
}
