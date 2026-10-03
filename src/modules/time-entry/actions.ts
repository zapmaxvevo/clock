"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertCan, ForbiddenError } from "@/server/permissions";
import { requireSession, type SessionContext } from "@/server/session";

import * as service from "./service";
import { ownTimeEntryResource, TimeEntryError, trackerWorkspaceOf } from "./service";
import {
  continueEntryInput,
  createManualEntryInput,
  deleteEntryInput,
  discardTimerInput,
  duplicateEntryInput,
  startTimerInput,
  stopTimerInput,
  timeEntryMessages,
  updateDescriptionInput,
  updateEntryTimesInput,
  updateRunningStartInput,
  type ActionResult,
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
  type UpdateDescriptionInput,
  type UpdateDescriptionResult,
  type UpdateEntryTimesInput,
  type UpdateEntryTimesResult,
  type UpdateRunningStartInput,
  type UpdateRunningStartResult,
} from "./schema";

function failure<T>(error: unknown): ActionResult<T> {
  if (error instanceof TimeEntryError) {
    return { ok: false, code: error.code, message: error.message };
  }
  if (error instanceof ForbiddenError) {
    return { ok: false, code: "forbidden", message: timeEntryMessages.forbidden };
  }
  if (error instanceof z.ZodError) {
    const issue = error.issues.at(0);
    return {
      ok: false,
      code: "validation",
      message: issue?.message ?? timeEntryMessages.unexpected,
    };
  }
  console.error(error);
  return { ok: false, code: "unexpected", message: timeEntryMessages.unexpected };
}

/**
 * Recorrido común: sesión, trabajo del módulo y resultado tipado. La
 * revalidación corre también cuando hay error de dominio, para que una pestaña
 * desactualizada se resincronice con el estado real.
 */
async function handle<T>(
  work: (session: SessionContext) => Promise<T>,
): Promise<ActionResult<T>> {
  const session = await requireSession();
  try {
    return { ok: true, data: await work(session) };
  } catch (error) {
    return failure(error);
  } finally {
    revalidatePath("/");
  }
}

export async function startTimer(
  input: StartTimerInput,
): Promise<ActionResult<StartTimerResult>> {
  return handle(async (session) => {
    const values = startTimerInput.parse(input);
    assertCan(session.actor, "timeEntry.own.create", ownTimeEntryResource(session.actor));
    return service.startTimer(session.actor, trackerWorkspaceOf(session), values);
  });
}

export async function stopTimer(
  input: StopTimerInput,
): Promise<ActionResult<StopTimerResult>> {
  return handle(async (session) => {
    const values = stopTimerInput.parse(input);
    assertCan(session.actor, "timeEntry.own.update", ownTimeEntryResource(session.actor));
    return service.stopTimer(session.actor, trackerWorkspaceOf(session), values);
  });
}

export async function updateDescription(
  input: UpdateDescriptionInput,
): Promise<ActionResult<UpdateDescriptionResult>> {
  return handle(async (session) => {
    const values = updateDescriptionInput.parse(input);
    assertCan(session.actor, "timeEntry.own.update", ownTimeEntryResource(session.actor));
    return service.updateDescription(session.actor, trackerWorkspaceOf(session), values);
  });
}

export async function deleteEntry(
  input: DeleteEntryInput,
): Promise<ActionResult<DeleteEntryResult>> {
  return handle(async (session) => {
    const values = deleteEntryInput.parse(input);
    assertCan(session.actor, "timeEntry.own.delete", ownTimeEntryResource(session.actor));
    return service.deleteEntry(session.actor, values);
  });
}

export async function createManualEntry(
  input: CreateManualEntryInput,
): Promise<ActionResult<CreateManualEntryResult>> {
  return handle(async (session) => {
    const values = createManualEntryInput.parse(input);
    assertCan(session.actor, "timeEntry.own.create", ownTimeEntryResource(session.actor));
    // El service necesita la fecha de creación del workspace para el piso, y
    // la sesión ya la tiene: no hay consulta nueva.
    return service.createManualEntry(session.actor, trackerWorkspaceOf(session), values);
  });
}

export async function updateEntryTimes(
  input: UpdateEntryTimesInput,
): Promise<ActionResult<UpdateEntryTimesResult>> {
  return handle(async (session) => {
    const values = updateEntryTimesInput.parse(input);
    assertCan(session.actor, "timeEntry.own.update", ownTimeEntryResource(session.actor));
    return service.updateEntryTimes(session.actor, trackerWorkspaceOf(session), values);
  });
}

export async function updateRunningStart(
  input: UpdateRunningStartInput,
): Promise<ActionResult<UpdateRunningStartResult>> {
  return handle(async (session) => {
    const values = updateRunningStartInput.parse(input);
    assertCan(session.actor, "timeEntry.own.update", ownTimeEntryResource(session.actor));
    return service.updateRunningStart(session.actor, trackerWorkspaceOf(session), values);
  });
}

export async function continueEntry(
  input: ContinueEntryInput,
): Promise<ActionResult<ContinueEntryResult>> {
  return handle(async (session) => {
    const values = continueEntryInput.parse(input);
    assertCan(session.actor, "timeEntry.own.create", ownTimeEntryResource(session.actor));
    return service.continueEntry(session.actor, trackerWorkspaceOf(session), values);
  });
}

export async function duplicateEntry(
  input: DuplicateEntryInput,
): Promise<ActionResult<DuplicateEntryResult>> {
  return handle(async (session) => {
    const values = duplicateEntryInput.parse(input);
    assertCan(session.actor, "timeEntry.own.create", ownTimeEntryResource(session.actor));
    return service.duplicateEntry(session.actor, trackerWorkspaceOf(session), values);
  });
}

export async function discardTimer(
  input: DiscardTimerInput,
): Promise<ActionResult<DiscardTimerResult>> {
  return handle(async (session) => {
    const values = discardTimerInput.parse(input);
    assertCan(session.actor, "timeEntry.own.delete", ownTimeEntryResource(session.actor));
    return service.discardTimer(session.actor, values);
  });
}
