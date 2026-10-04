"use server";

import { handle, type ActionResult } from "@/server/action";
import { assertCan } from "@/server/permissions";

import * as service from "./service";
import { ownTimeEntryResource, trackerWorkspaceOf } from "./service";
import {
  bulkDeleteEntriesInput,
  bulkEditEntriesInput,
  continueEntryInput,
  createManualEntryInput,
  deleteEntryInput,
  discardTimerInput,
  duplicateEntryInput,
  startTimerInput,
  stopTimerInput,
  timeEntryMessages,
  updateDescriptionInput,
  updateEntryInput,
  updateEntryProjectInput,
  updateEntryTimesInput,
  updateRunningStartInput,
  type BulkDeleteEntriesInput,
  type BulkDeleteEntriesResult,
  type BulkEditEntriesInput,
  type BulkEditEntriesResult,
  type ContinueEntryInput,
  type ContinueEntryResult,
  type CreateManualEntryInput,
  type CreateManualEntryResult,
  type DeleteEntryInput,
  type DeleteEntryResult,
  type DiscardTimerInput,
  type DiscardTimerResult,
  type DuplicateEntryInput,
  type DuplicateEntryResult,
  type StartTimerInput,
  type StartTimerResult,
  type StopTimerInput,
  type StopTimerResult,
  type TimeEntryErrorCode,
  type UpdateDescriptionInput,
  type UpdateDescriptionResult,
  type UpdateEntryInput,
  type UpdateEntryProjectInput,
  type UpdateEntryProjectResult,
  type UpdateEntryResult,
  type UpdateEntryTimesInput,
  type UpdateEntryTimesResult,
  type UpdateRunningStartInput,
  type UpdateRunningStartResult,
} from "./schema";

/**
 * Las dos pantallas que muestran entradas: `revalidatePath` actualiza solo la
 * que se está viendo, y el calendario usa varias de estas actions.
 */
const options = {
  paths: ["/", "/calendario"],
  messages: {
    forbidden: timeEntryMessages.forbidden,
    unexpected: timeEntryMessages.unexpected,
  },
} as const;

/** El resultado de una action del módulo, con sus códigos propios. */
type Result<T> = Promise<ActionResult<T, TimeEntryErrorCode>>;

export async function startTimer(input: StartTimerInput): Result<StartTimerResult> {
  return handle(async (session) => {
    const values = startTimerInput.parse(input);
    assertCan(session.actor, "timeEntry.own.create", ownTimeEntryResource(session.actor));
    return service.startTimer(session.actor, trackerWorkspaceOf(session), values);
  }, options);
}

export async function stopTimer(input: StopTimerInput): Result<StopTimerResult> {
  return handle(async (session) => {
    const values = stopTimerInput.parse(input);
    assertCan(session.actor, "timeEntry.own.update", ownTimeEntryResource(session.actor));
    return service.stopTimer(session.actor, trackerWorkspaceOf(session), values);
  }, options);
}

export async function updateDescription(
  input: UpdateDescriptionInput,
): Result<UpdateDescriptionResult> {
  return handle(async (session) => {
    const values = updateDescriptionInput.parse(input);
    assertCan(session.actor, "timeEntry.own.update", ownTimeEntryResource(session.actor));
    return service.updateDescription(session.actor, trackerWorkspaceOf(session), values);
  }, options);
}

export async function updateEntryProject(
  input: UpdateEntryProjectInput,
): Result<UpdateEntryProjectResult> {
  return handle(async (session) => {
    const values = updateEntryProjectInput.parse(input);
    assertCan(session.actor, "timeEntry.own.update", ownTimeEntryResource(session.actor));
    return service.updateEntryProject(session.actor, trackerWorkspaceOf(session), values);
  }, options);
}

export async function deleteEntry(input: DeleteEntryInput): Result<DeleteEntryResult> {
  return handle(async (session) => {
    const values = deleteEntryInput.parse(input);
    assertCan(session.actor, "timeEntry.own.delete", ownTimeEntryResource(session.actor));
    return service.deleteEntry(session.actor, values);
  }, options);
}

export async function createManualEntry(
  input: CreateManualEntryInput,
): Result<CreateManualEntryResult> {
  return handle(async (session) => {
    const values = createManualEntryInput.parse(input);
    assertCan(session.actor, "timeEntry.own.create", ownTimeEntryResource(session.actor));
    // El service necesita la fecha de creación del workspace para el piso, y
    // la sesión ya la tiene: no hay consulta nueva.
    return service.createManualEntry(session.actor, trackerWorkspaceOf(session), values);
  }, options);
}

export async function updateEntryTimes(
  input: UpdateEntryTimesInput,
): Result<UpdateEntryTimesResult> {
  return handle(async (session) => {
    const values = updateEntryTimesInput.parse(input);
    assertCan(session.actor, "timeEntry.own.update", ownTimeEntryResource(session.actor));
    return service.updateEntryTimes(session.actor, trackerWorkspaceOf(session), values);
  }, options);
}

export async function updateRunningStart(
  input: UpdateRunningStartInput,
): Result<UpdateRunningStartResult> {
  return handle(async (session) => {
    const values = updateRunningStartInput.parse(input);
    assertCan(session.actor, "timeEntry.own.update", ownTimeEntryResource(session.actor));
    return service.updateRunningStart(session.actor, trackerWorkspaceOf(session), values);
  }, options);
}

/** El «Guardar» del diálogo de una entrada: los grupos tocados, todo o nada (ADR 0013). */
export async function updateEntry(input: UpdateEntryInput): Result<UpdateEntryResult> {
  return handle(async (session) => {
    const values = updateEntryInput.parse(input);
    assertCan(session.actor, "timeEntry.own.update", ownTimeEntryResource(session.actor));
    return service.updateEntry(session.actor, trackerWorkspaceOf(session), values);
  }, options);
}

export async function continueEntry(
  input: ContinueEntryInput,
): Result<ContinueEntryResult> {
  return handle(async (session) => {
    const values = continueEntryInput.parse(input);
    assertCan(session.actor, "timeEntry.own.create", ownTimeEntryResource(session.actor));
    return service.continueEntry(session.actor, trackerWorkspaceOf(session), values);
  }, options);
}

export async function duplicateEntry(
  input: DuplicateEntryInput,
): Result<DuplicateEntryResult> {
  return handle(async (session) => {
    const values = duplicateEntryInput.parse(input);
    assertCan(session.actor, "timeEntry.own.create", ownTimeEntryResource(session.actor));
    return service.duplicateEntry(session.actor, trackerWorkspaceOf(session), values);
  }, options);
}

export async function discardTimer(input: DiscardTimerInput): Result<DiscardTimerResult> {
  return handle(async (session) => {
    const values = discardTimerInput.parse(input);
    assertCan(session.actor, "timeEntry.own.delete", ownTimeEntryResource(session.actor));
    return service.discardTimer(session.actor, values);
  }, options);
}

export async function bulkEditEntries(
  input: BulkEditEntriesInput,
): Result<BulkEditEntriesResult> {
  return handle(async (session) => {
    const values = bulkEditEntriesInput.parse(input);
    assertCan(session.actor, "timeEntry.own.update", ownTimeEntryResource(session.actor));
    return service.bulkEditEntries(session.actor, trackerWorkspaceOf(session), values);
  }, options);
}

export async function bulkDeleteEntries(
  input: BulkDeleteEntriesInput,
): Result<BulkDeleteEntriesResult> {
  return handle(async (session) => {
    const values = bulkDeleteEntriesInput.parse(input);
    assertCan(session.actor, "timeEntry.own.delete", ownTimeEntryResource(session.actor));
    return service.bulkDeleteEntries(session.actor, values);
  }, options);
}
