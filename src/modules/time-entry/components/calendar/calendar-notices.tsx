"use client";

import Link from "next/link";
import type { RefObject } from "react";

import { ActionFeedback } from "@/components/action-feedback";
import { retryHandlerOf, type ActionHandle } from "@/hooks/use-action";
import type { CalendarState, TimeEntryView } from "@/modules/time-entry/schema";

import { trackerLabels } from "../labels";
import { calendarHref } from "./calendar-href";
import type { DialogSubject, EntryDialogFailure } from "./entry-dialog";
import { calendarLabels } from "./labels";

/** Las fallas de «Guardar» que cierran el diálogo: no hay nada que corregir en él. */
export const CLOSING_CODES: readonly string[] = ["not_found", "already_stopped"];

/** El aviso del diálogo, con la falla del pedido del modo abierto (§5.4). */
export function dialogFailureOf(
  subject: DialogSubject | null,
  save: ActionHandle<never>,
  create: ActionHandle<never>,
): EntryDialogFailure | null {
  if (subject?.kind === "add") {
    if (create.failure === null) {
      return null;
    }
    // TT-109: el alta no tiene id del cliente; no se sabe si quedó escrita.
    return create.failure.code === "unexpected"
      ? {
          title: trackerLabels.addLostTitle,
          message: calendarLabels.addLostMessage,
          retryable: false,
        }
      : {
          title: trackerLabels.entryNotAdded,
          message: create.failure.message,
          retryable: false,
        };
  }
  if (save.failure === null || CLOSING_CODES.includes(save.failure.code)) {
    return null;
  }
  return {
    title: calendarLabels.entryNotSaved,
    message: save.failure.message,
    retryable: save.failure.code === "unexpected",
  };
}

type CalendarNoticesProps = {
  readonly save: ActionHandle<never>;
  readonly stop: ActionHandle<never>;
  readonly duplicate: ActionHandle<never>;
  readonly remove: ActionHandle<never>;
  readonly outside: TimeEntryView | null;
  readonly outsideLabel: (entry: TimeEntryView) => string;
  readonly mode: CalendarState["mode"];
  readonly regionRef: RefObject<HTMLElement | null>;
  readonly clearNotices: () => void;
};

/**
 * Los avisos que sobreviven al diálogo, en la región de la pantalla (§5.4).
 * «Reintentar» se va con su aviso: el foco pasa antes a la región.
 */
export function CalendarNotices({
  save,
  stop,
  duplicate,
  remove,
  outside,
  outsideLabel,
  mode,
  regionRef,
  clearNotices,
}: CalendarNoticesProps) {
  function retryOf(handle: ActionHandle<never>): (() => void) | undefined {
    const retry = retryHandlerOf(handle);
    return retry === undefined
      ? undefined
      : () => {
          regionRef.current?.focus();
          clearNotices();
          retry();
        };
  }

  const savedFailure =
    save.failure !== null && CLOSING_CODES.includes(save.failure.code)
      ? save.failure
      : null;
  const notices = [
    savedFailure !== null && (
      <ActionFeedback
        key="save"
        title={calendarLabels.entryNotSaved}
        message={savedFailure.message}
      />
    ),
    stop.failure !== null && (
      <ActionFeedback
        key="stop"
        title={trackerLabels.timerNotStopped}
        message={stop.failure.message}
        onRetry={retryOf(stop)}
      />
    ),
    duplicate.failure !== null && (
      <ActionFeedback
        key="duplicate"
        title={trackerLabels.entryNotDuplicated}
        message={duplicate.failure.message}
        onRetry={retryOf(duplicate)}
      />
    ),
    remove.failure !== null && (
      <ActionFeedback
        key="remove"
        title={trackerLabels.entryNotDeleted}
        message={remove.failure.message}
        onRetry={retryOf(remove)}
      />
    ),
    outside !== null && (
      <ActionFeedback
        key="outside"
        tone="info"
        title={
          mode === "day"
            ? calendarLabels.outsideDay(outsideLabel(outside))
            : calendarLabels.outsideWeek(outsideLabel(outside))
        }
      >
        <Link
          href={
            mode === "day"
              ? calendarHref("day", outside.dayDate)
              : calendarHref("week", outside.weekStart)
          }
          className="underline underline-offset-4"
        >
          {mode === "day" ? calendarLabels.goToDay : calendarLabels.goToWeek}
        </Link>
      </ActionFeedback>
    ),
  ].filter(Boolean);

  return notices.length === 0 ? null : (
    <div className="flex flex-col gap-2">{notices}</div>
  );
}
