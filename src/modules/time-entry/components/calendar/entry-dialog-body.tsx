"use client";

import type { ReactNode } from "react";

import { useDisplayFormats } from "@/components/layout/display-formats";
import { cn } from "@/lib/utils";
import { ProjectPicker } from "@/modules/project/components/project-picker";
import type { TimeEntryView } from "@/modules/time-entry/schema";
import { dayKeyLabel } from "@/server/time";

import { ElapsedCounter } from "../elapsed-counter";
import { selectionOf } from "../entry-selection";
import { entryNameOf, entryProjectLabel, extraDaysText, trackerLabels } from "../labels";
import { calendarLabels } from "./labels";

/**
 * Lo que el diálogo de una entrada muestra como texto: la entrada entera en
 * solo lectura (CAL-05, TT-92) y el horario de una de más de un día (CAL-58).
 */

/** CAL-58, TT-110: el horario de una entrada de más de un día, como texto. */
export function MultiDayTimes({
  entry,
  todayKey,
}: {
  readonly entry: TimeEntryView;
  readonly todayKey: string;
}) {
  const { date } = useDisplayFormats();

  return (
    <div className="grid gap-2">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        <Field label={trackerLabels.date}>
          {dayKeyLabel(entry.dayDate, todayKey, date)}
        </Field>
        <Field label={trackerLabels.startTime}>
          <span className="tabular-nums">{entry.startLabel}</span>
        </Field>
        <Field label={trackerLabels.endTime}>
          <EndLabel entry={entry} />
        </Field>
        <Field label={calendarLabels.duration}>
          <span className="tabular-nums">{entry.durationLabel}</span>
        </Field>
      </dl>
      <p className="text-muted-foreground text-sm">
        {trackerLabels.multiDayTimesReadOnly}
      </p>
    </div>
  );
}

type EntryDialogBodyProps = {
  readonly entry: TimeEntryView;
  readonly serverNow: string;
  readonly todayKey: string;
};

/** Los campos de la entrada como texto, en una lista de definiciones (CAL-05, TT-92). */
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
            <EndLabel entry={entry} />
          </Field>
          <Field label={calendarLabels.duration}>
            <span className="tabular-nums">{entry.durationLabel}</span>
          </Field>
        </>
      )}
    </dl>
  );
}

/** El fin con su superíndice `+N`, que el lector de pantalla lee como texto (TT-51). */
function EndLabel({ entry }: { readonly entry: TimeEntryView }) {
  return (
    <span className="tabular-nums">
      {entry.endLabel}
      {entry.extraDays > 0 && (
        <sup className="ml-0.5">
          +{entry.extraDays}
          <span className="sr-only">{extraDaysText(entry.extraDays)}</span>
        </sup>
      )}
    </span>
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
