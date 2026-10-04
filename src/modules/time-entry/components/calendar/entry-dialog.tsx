"use client";

import { useRef, type ReactNode, type RefObject } from "react";

import { useDisplayFormats } from "@/components/layout/display-formats";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ProjectPicker } from "@/modules/project/components/project-picker";
import type { TimeEntryView } from "@/modules/time-entry/schema";
import { dayKeyLabel } from "@/server/time";

import { ElapsedCounter } from "../elapsed-counter";
import { selectionOf } from "../entry-selection";
import { entryNameOf, entryProjectLabel, extraDaysText, trackerLabels } from "../labels";
import { useDialogReturnFocus } from "../use-dialog-return-focus";
import { calendarLabels } from "./labels";

type EntryDialogProps = {
  readonly open: boolean;
  /** La entrada como estaba al abrir; `null` antes del primer diálogo. */
  readonly entry: TimeEntryView | null;
  readonly serverNow: string;
  /** Día de hoy en la zona de la persona: «Hoy» y «Ayer» en la fecha. */
  readonly todayKey: string;
  /** «Cerrar», Esc o un clic afuera. */
  readonly onClose: () => void;
  /** El botón del bloque que lo abrió, adonde vuelve el foco. */
  readonly openerRef: RefObject<HTMLElement | null>;
  /** La región de la pantalla: el foco va ahí si el bloque ya no está. */
  readonly regionRef: RefObject<HTMLElement | null>;
};

/**
 * CAL-65, CAL-66: el diálogo de una entrada, en solo lectura. No llama a
 * ninguna action; el 8c le suma la edición.
 */
export function EntryDialog({
  open,
  entry,
  serverNow,
  todayKey,
  onClose,
  openerRef,
  regionRef,
}: EntryDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const { onOpenChange, finalFocus } = useDialogReturnFocus({
    cancelFocus: openerRef,
    fallbackFocus: regionRef,
    onCancel: onClose,
  });
  const running = entry?.endClock === null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        initialFocus={closeRef}
        finalFocus={finalFocus}
      >
        <DialogHeader>
          <DialogTitle>
            {running ? calendarLabels.runningTitle : calendarLabels.entryTitle}
          </DialogTitle>
        </DialogHeader>
        {entry !== null && (
          <EntryDialogBody entry={entry} serverNow={serverNow} todayKey={todayKey} />
        )}
        <DialogFooter>
          <DialogClose render={<Button ref={closeRef} variant="outline" />}>
            {calendarLabels.close}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type EntryDialogBodyProps = {
  readonly entry: TimeEntryView;
  readonly serverNow: string;
  readonly todayKey: string;
};

/** Los campos de la entrada como texto, en una lista de definiciones. */
export function EntryDialogBody({ entry, serverNow, todayKey }: EntryDialogBodyProps) {
  const { date } = useDisplayFormats();
  const name = entryNameOf(entry.description);

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
      <Field label={trackerLabels.description}>
        <span
          className={cn(
            "whitespace-pre-wrap",
            entry.description === "" && "text-muted-foreground",
          )}
        >
          {name}
        </span>
      </Field>
      <Field label={calendarLabels.project}>
        <ProjectPicker
          readOnly
          variant="row"
          value={selectionOf(entry)}
          label={entryProjectLabel(name)}
          // Obligatoria también en solo lectura; acá no hay cambio que avisar.
          onChange={() => undefined}
        />
      </Field>
      <Field label={trackerLabels.date}>
        {dayKeyLabel(entry.dayDate, todayKey, date)}
      </Field>
      <Field label={trackerLabels.startTime}>
        <span className="tabular-nums">{entry.startLabel}</span>
      </Field>
      {entry.endClock === null ? (
        <>
          <dt className="text-muted-foreground">{calendarLabels.runningEnd}</dt>
          <dd>
            <ElapsedCounter startedAt={entry.startedAt} serverNow={serverNow} />
          </dd>
        </>
      ) : (
        <>
          <Field label={trackerLabels.endTime}>
            <span className="tabular-nums">
              {entry.endLabel}
              {entry.extraDays > 0 && (
                <sup className="ml-0.5">
                  +{entry.extraDays}
                  <span className="sr-only">{extraDaysText(entry.extraDays)}</span>
                </sup>
              )}
            </span>
          </Field>
          <Field label={calendarLabels.duration}>
            <span className="tabular-nums">{entry.durationLabel}</span>
          </Field>
        </>
      )}
    </dl>
  );
}

function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}
