"use client";

import { useId, useRef, useState, type FormEvent, type RefObject } from "react";

import { ActionFeedback } from "@/components/action-feedback";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProjectPicker } from "@/modules/project/components/project-picker";
import {
  DESCRIPTION_MAX,
  type CreateManualEntryInput,
  type TimeEntryView,
  type UpdateEntryChanges,
} from "@/modules/time-entry/schema";
import { clockLabel, formatDuration } from "@/server/time";

import { ClockField } from "../clock-field";
import { DateField } from "../date-field";
import { ElapsedCounter } from "../elapsed-counter";
import { entryNameOf, entryProjectLabel, extraDaysText, trackerLabels } from "../labels";
import {
  commitChange,
  draftDuration,
  draftExtraDays,
  sameDraft,
  withDate,
  withDuration,
  withEnd,
  withStart,
  type ManualField,
  type TimeDraft,
  type TimeDraftChange,
} from "../time-draft";
import { useDialogReturnFocus } from "../use-dialog-return-focus";
import {
  changesOf,
  createInputOf,
  draftOfEntry,
  draftOfNew,
  runningChangesOf,
  type EntryDialogDraft,
} from "./entry-dialog-draft";
import { EditorActions } from "./entry-dialog-actions";
import { EntryDialogBody, MultiDayTimes } from "./entry-dialog-body";
import { calendarLabels } from "./labels";

/** Lo que muestra el diálogo: una entrada que se abrió o un alta (§5.5). */
export type DialogSubject =
  | { readonly kind: "entry"; readonly entry: TimeEntryView }
  | {
      readonly kind: "add";
      readonly draft: TimeDraft;
      readonly opener: "button" | "slot";
    };

/** La falla del último pedido del diálogo, que el dueño le pasa (§5.3). */
export type EntryDialogFailure = {
  readonly title: string;
  readonly message: string;
  /** «Reintentar»: solo con `unexpected` de «Guardar» (TT-89), nunca en el alta (TT-109). */
  readonly retryable: boolean;
};

type EntryDialogProps = {
  readonly open: boolean;
  /** `null` antes del primer diálogo; no se limpia al cerrar. */
  readonly subject: DialogSubject | null;
  /** Sin permiso de carga, la entrada se abre en solo lectura (CAL-05, TT-92). */
  readonly canTrack: boolean;
  readonly serverNow: string;
  /** Día de hoy en la zona de la persona: «Hoy» y «Ayer», y el techo del inicio del timer. */
  readonly todayKey: string;
  /** Piso del workspace, el primer día que se puede elegir. */
  readonly minDayKey: string;
  /** El pedido del diálogo viaja: «Guardar» y «Agregar» quedan inactivos. */
  readonly pending: boolean;
  readonly failure: EntryDialogFailure | null;
  /** «Cancelar», «Cerrar», Esc o un clic afuera, y «Guardar» sin cambios. */
  readonly onCancel: () => void;
  readonly onSave: (changes: UpdateEntryChanges) => void;
  readonly onAdd: (input: CreateManualEntryInput) => void;
  readonly onStop: () => void;
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
  /** Adónde vuelve el foco al cancelar: el bloque, «Agregar entrada» o ninguno. */
  readonly cancelFocus: RefObject<HTMLElement | null>;
  /** La región de la pantalla: el foco va ahí si el dueño cierra o `cancelFocus` no está. */
  readonly regionRef: RefObject<HTMLElement | null>;
};

/** Cada apertura arranca su borrador: la clave cambia con lo que se abre. */
function subjectKey(subject: DialogSubject): string {
  return subject.kind === "entry"
    ? `entry:${subject.entry.id}`
    : `add:${subject.draft.date}:${subject.draft.start}`;
}

/**
 * CAL-65 a CAL-70: el diálogo de una entrada, para editarla, para el timer
 * que corre y para un alta; en solo lectura sin permiso de carga. No llama a
 * ninguna action: avisa lo que la persona eligió, y `CalendarView` es el dueño
 * de los pedidos y de sus avisos.
 */
export function EntryDialog({
  open,
  subject,
  canTrack,
  serverNow,
  todayKey,
  minDayKey,
  pending,
  failure,
  onCancel,
  onSave,
  onAdd,
  onStop,
  onDuplicate,
  onDelete,
  cancelFocus,
  regionRef,
}: EntryDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const { onOpenChange, finalFocus } = useDialogReturnFocus({
    cancelFocus,
    fallbackFocus: regionRef,
    onCancel,
  });
  const readOnly = subject?.kind === "entry" && !canTrack;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        // Los campos del horario, en una línea.
        className="sm:max-w-lg"
        initialFocus={readOnly ? closeRef : descriptionRef}
        finalFocus={finalFocus}
      >
        {subject !== null && (
          <EntryDialogContent
            subject={subject}
            canTrack={canTrack}
            serverNow={serverNow}
            todayKey={todayKey}
            minDayKey={minDayKey}
            pending={pending}
            failure={failure}
            closeRef={closeRef}
            descriptionRef={descriptionRef}
            // Sin cambios, «Guardar» cierra como «Cancelar»: el foco vuelve al bloque.
            onUnchanged={() => onOpenChange(false)}
            onSave={onSave}
            onAdd={onAdd}
            onStop={onStop}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type EntryDialogContentProps = Omit<EntryEditorProps, "subject"> & {
  readonly subject: DialogSubject;
  readonly canTrack: boolean;
  readonly closeRef: RefObject<HTMLButtonElement | null>;
};

/**
 * Lo de adentro del diálogo, sin el portal, para que el test lo dibuje: el
 * modo de solo lectura sin permiso de carga, y si no, el editor.
 */
export function EntryDialogContent({
  subject,
  canTrack,
  closeRef,
  ...editor
}: EntryDialogContentProps) {
  if (subject.kind === "entry" && !canTrack) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>
            {subject.entry.endClock === null
              ? calendarLabels.runningTitle
              : calendarLabels.entryTitle}
          </DialogTitle>
        </DialogHeader>
        <EntryDialogBody
          entry={subject.entry}
          serverNow={editor.serverNow}
          todayKey={editor.todayKey}
        />
        <DialogFooter>
          <DialogClose render={<Button ref={closeRef} variant="outline" />}>
            {calendarLabels.close}
          </DialogClose>
        </DialogFooter>
      </>
    );
  }
  return <EntryEditor key={subjectKey(subject)} subject={subject} {...editor} />;
}

type EntryEditorProps = Pick<
  EntryDialogProps,
  | "serverNow"
  | "todayKey"
  | "minDayKey"
  | "pending"
  | "failure"
  | "onSave"
  | "onAdd"
  | "onStop"
  | "onDuplicate"
  | "onDelete"
> & {
  readonly subject: DialogSubject;
  readonly descriptionRef: RefObject<HTMLInputElement | null>;
  readonly onUnchanged: () => void;
};

/**
 * Los tres modos de edición (§5.3). El borrador vive en una `ref` que cada
 * cambio actualiza y que los manejadores leen: Enter en una hora la confirma y
 * guarda en el mismo evento, antes de que el borrador nuevo llegue a un render.
 */
function EntryEditor({
  subject,
  serverNow,
  todayKey,
  minDayKey,
  pending,
  failure,
  descriptionRef,
  onUnchanged,
  onSave,
  onAdd,
  onStop,
  onDuplicate,
  onDelete,
}: EntryEditorProps) {
  const { time } = useDisplayFormats();
  const descriptionId = useId();
  const submitRef = useRef<HTMLButtonElement>(null);
  const entry = subject.kind === "entry" ? subject.entry : null;
  const running = entry !== null && entry.endClock === null;

  const [draft, setDraft] = useState<EntryDialogDraft>(() =>
    subject.kind === "entry" ? draftOfEntry(subject.entry) : draftOfNew(subject.draft),
  );
  const draftRef = useRef(draft);
  /** El texto de «Hora de inicio» del timer, confirmado o no: una hora tecleada es un cambio. */
  const [startText, setStartText] = useState<string | null>(null);

  function change(next: EntryDialogDraft): void {
    draftRef.current = next;
    setDraft(next);
  }

  function changeTimes(times: TimeDraft): void {
    change({ ...draftRef.current, times });
  }

  function commitTimes(
    transition: (times: TimeDraft) => TimeDraftChange<ManualField>,
    shown: (times: TimeDraft) => string,
  ): string | null {
    return commitChange(transition(draftRef.current.times), changeTimes, shown);
  }

  const changesOfDraft = (current: EntryDialogDraft): UpdateEntryChanges | null =>
    entry === null
      ? null
      : running
        ? runningChangesOf(entry, current)
        : changesOf(entry, current);

  /** «Guardar», Enter en la descripción y Enter en una hora. */
  function save(): void {
    if (pending || entry === null) {
      return;
    }
    const changes = changesOfDraft(draftRef.current);
    if (changes === null) {
      onUnchanged();
      return;
    }
    onSave(changes);
  }

  /** «Agregar», Enter en la descripción y Enter en una hora. */
  function add(): void {
    if (pending || draftDuration(draftRef.current.times) === 0) {
      return;
    }
    onAdd(createInputOf(draftRef.current));
  }

  const submit = subject.kind === "add" ? add : save;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    submit();
  }

  /** «Reintentar» se va con su aviso: el foco pasa antes a «Guardar» (TT-89). */
  function retry(): void {
    submitRef.current?.focus();
    save();
  }

  const name = entryNameOf(entry?.description ?? draft.description);
  const tooShort = subject.kind === "add" && draftDuration(draft.times) === 0;
  const typedStart =
    startText !== null && startText !== clockLabel(draft.times.start, time);
  const stopBlocked = running && (changesOfDraft(draft) !== null || typedStart);
  const title =
    subject.kind === "add"
      ? calendarLabels.addEntry
      : running
        ? calendarLabels.runningTitle
        : calendarLabels.editTitle;

  return (
    // Enter en la descripción envía el formulario.
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>

      <div className="grid gap-3">
        <div className="grid gap-2">
          <Label htmlFor={descriptionId}>{trackerLabels.description}</Label>
          <Input
            ref={descriptionRef}
            id={descriptionId}
            type="text"
            value={draft.description}
            // TT-71: el campo corta en el mismo largo que valida el esquema.
            maxLength={DESCRIPTION_MAX}
            onChange={(event) =>
              change({ ...draftRef.current, description: event.target.value })
            }
          />
        </div>

        <div className="grid gap-2">
          <span aria-hidden="true" className="text-sm leading-none font-medium">
            {calendarLabels.project}
          </span>
          <ProjectPicker
            variant="row"
            value={draft.selection}
            label={entryProjectLabel(name)}
            onChange={(selection) => change({ ...draftRef.current, selection })}
          />
        </div>

        {running ? (
          <RunningStartFields
            times={draft.times}
            todayKey={todayKey}
            minDayKey={minDayKey}
            serverNow={serverNow}
            startedAt={entry.startedAt}
            onDate={(date) => changeTimes(withDate(draftRef.current.times, date))}
            onCommitStart={(text) =>
              commitTimes(
                (times) => withStart(times, text, time),
                (times) => clockLabel(times.start, time),
              )
            }
            onStartText={setStartText}
            onSubmit={save}
          />
        ) : entry !== null && !entry.editableTimes ? (
          <MultiDayTimes entry={entry} todayKey={todayKey} />
        ) : (
          <TimesFields
            times={draft.times}
            durationLabel={
              entry !== null && sameDraft(draft.times, draftOfEntry(entry).times)
                ? entry.durationLabel
                : null
            }
            todayKey={todayKey}
            minDayKey={minDayKey}
            onDate={(date) => changeTimes(withDate(draftRef.current.times, date))}
            onCommit={commitTimes}
            onSubmit={submit}
          />
        )}
      </div>

      {failure !== null && (
        <ActionFeedback
          title={failure.title}
          message={failure.message}
          onRetry={failure.retryable ? retry : undefined}
        />
      )}

      <EditorActions
        mode={subject.kind === "add" ? "add" : running ? "running" : "edit"}
        name={name}
        pending={pending}
        tooShort={tooShort}
        stopBlocked={stopBlocked}
        submitRef={submitRef}
        onStop={onStop}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
      />
    </form>
  );
}

type TimesFieldsProps = {
  readonly times: TimeDraft;
  /** La duración del servidor mientras el trío no cambió (TT-97); si no, la de reloj. */
  readonly durationLabel: string | null;
  readonly todayKey: string;
  readonly minDayKey: string;
  readonly onDate: (date: string) => void;
  readonly onCommit: (
    transition: (times: TimeDraft) => TimeDraftChange<ManualField>,
    shown: (times: TimeDraft) => string,
  ) => string | null;
  readonly onSubmit: () => void;
};

/** TT-18 a TT-21: fecha, inicio, fin y duración, los campos del modo manual. */
function TimesFields({
  times,
  durationLabel,
  todayKey,
  minDayKey,
  onDate,
  onCommit,
  onSubmit,
}: TimesFieldsProps) {
  const { time } = useDisplayFormats();
  const extraDays = draftExtraDays(times);

  return (
    <div className="grid gap-2">
      <span aria-hidden="true" className="text-sm leading-none font-medium">
        {trackerLabels.date}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <DateField
          value={times.date}
          label={trackerLabels.date}
          onChange={onDate}
          todayKey={todayKey}
          minDayKey={minDayKey}
        />
        <ClockField
          value={clockLabel(times.start, time)}
          onCommit={(text) =>
            onCommit(
              (current) => withStart(current, text, time),
              (next) => clockLabel(next.start, time),
            )
          }
          onSubmit={onSubmit}
          label={trackerLabels.startTime}
          format={time}
        />
        <span aria-hidden="true" className="text-muted-foreground">
          –
        </span>
        <span className="flex items-start">
          <ClockField
            value={clockLabel(times.end, time)}
            onCommit={(text) =>
              onCommit(
                (current) => withEnd(current, text, time),
                (next) => clockLabel(next.end, time),
              )
            }
            onSubmit={onSubmit}
            label={trackerLabels.endTime}
            format={time}
          />
          {extraDays > 0 && (
            <sup className="text-muted-foreground ml-0.5 text-xs">
              +{extraDays}
              <span className="sr-only">{extraDaysText(extraDays)}</span>
            </sup>
          )}
        </span>
        <ClockField
          value={durationLabel ?? formatDuration(draftDuration(times))}
          onCommit={(text) =>
            onCommit(
              (current) => withDuration(current, text),
              (next) => formatDuration(draftDuration(next)),
            )
          }
          onSubmit={onSubmit}
          label={calendarLabels.duration}
        />
      </div>
    </div>
  );
}

type RunningStartFieldsProps = {
  readonly times: TimeDraft;
  readonly todayKey: string;
  readonly minDayKey: string;
  readonly serverNow: string;
  readonly startedAt: string;
  readonly onDate: (date: string) => void;
  readonly onCommitStart: (text: string) => string | null;
  readonly onStartText: (text: string) => void;
  readonly onSubmit: () => void;
};

/** CAL-40: el inicio del timer, día y hora, y el fin en curso con el transcurrido. */
function RunningStartFields({
  times,
  todayKey,
  minDayKey,
  serverNow,
  startedAt,
  onDate,
  onCommitStart,
  onStartText,
  onSubmit,
}: RunningStartFieldsProps) {
  const { time } = useDisplayFormats();

  return (
    <div className="grid gap-2">
      <span aria-hidden="true" className="text-sm leading-none font-medium">
        {trackerLabels.startTime}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <DateField
          value={times.date}
          label={trackerLabels.date}
          onChange={onDate}
          todayKey={todayKey}
          minDayKey={minDayKey}
          // TT-29: el inicio del timer no va al futuro.
          maxDayKey={todayKey}
        />
        <ClockField
          value={clockLabel(times.start, time)}
          onCommit={onCommitStart}
          onTextChange={onStartText}
          onSubmit={onSubmit}
          label={trackerLabels.startTime}
          format={time}
        />
      </div>
      <p className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{calendarLabels.runningEnd}</span>
        <ElapsedCounter startedAt={startedAt} serverNow={serverNow} />
      </p>
    </div>
  );
}
