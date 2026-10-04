"use client";

import {
  CalendarIcon,
  CopyIcon,
  EllipsisVerticalIcon,
  PlayIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useDisplayFormats } from "@/components/layout/display-formats";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ProjectPicker } from "@/modules/project/components/project-picker";
import type { ProjectSelection } from "@/modules/project/schema";
import type { TimeEntryView } from "@/modules/time-entry/schema";
import { clockLabel, formatDuration } from "@/server/time";

import { DeleteEntryDialog } from "./delete-entry-dialog";
import { DescriptionField } from "./description-field";
import { EntryTimesEditor } from "./entry-times-editor";
import {
  entryNameOf,
  entryProjectLabel,
  extraDaysText,
  selectEntryLabel,
  trackerLabels,
} from "./labels";
import { SelectionCheckbox } from "./selection-checkbox";
import { draftDuration, draftExtraDays, fromView, type TimeDraft } from "./time-draft";

type EntryRowProps = {
  readonly entry: TimeEntryView;
  /** Descripción a mostrar: la optimista mientras la escritura está en vuelo. */
  readonly description: string;
  /** El proyecto y la tarea a mostrar, también optimistas. */
  readonly project: ProjectSelection;
  /** TT-55: con la escritura en vuelo la fila queda atenuada. */
  readonly busy: boolean;
  /** Con la membresía desactivada la fila queda en solo lectura y sin casilla (TT-92). */
  readonly canTrack: boolean;
  /** TT-62: la fila está en la selección de la lista. */
  readonly selected: boolean;
  readonly onToggleSelected: () => void;
  /** Una operación en masa viaja: la casilla no cambia, y no pierde el foco. */
  readonly selectionLocked: boolean;
  /** TT-55: el trío confirmado, que la fila muestra mientras su escritura viaja. */
  readonly pendingTimes: TimeDraft | null;
  /** Día de hoy en la zona del workspace. */
  readonly todayKey: string;
  /** Piso del workspace, el primer día al que se puede mover la entrada. */
  readonly minDayKey: string;
  /**
   * Guardar y borrar los resuelve el grupo: mueven el total y, sobre todo,
   * sus avisos tienen que sobrevivir a que esta fila desaparezca.
   */
  readonly onSave: (description: string) => void;
  /** TT-54: el selector solo avisa si el par elegido no es el que la fila ya tiene. */
  readonly onChangeProject: (selection: ProjectSelection) => void;
  readonly onSaveTimes: (times: TimeDraft) => void;
  readonly onDelete: () => void;
  /** TT-57: continuar es de la lista, que también lo dispara con «c». */
  readonly onContinue: () => void;
  /** La continuación de esta entrada está en vuelo: el botón no acepta otra. */
  readonly continuing: boolean;
  /** Es la entrada que continúa «c» y los atajos están activos. */
  readonly continueShortcut: boolean;
  /** TT-58: la copia es del grupo, como el borrado. */
  readonly onDuplicate: () => void;
  /**
   * La fila llegó a este grupo desde otro día con el foco en ella: al montarse
   * lo toma su botón de horas, y avisa con `onTimesFocused`.
   */
  readonly focusTimesOnMount: boolean;
  readonly onTimesFocused: () => void;
};

/** El editor del horario abierto: cómo se abrió y desde qué trío. */
type TimesEditing = {
  /** Por las horas, con el foco en el inicio, o por el botón de fecha. */
  readonly how: "times" | "date";
  readonly initial: TimeDraft;
};

export function EntryRow({
  entry,
  description,
  project,
  busy,
  canTrack,
  selected,
  onToggleSelected,
  selectionLocked,
  pendingTimes,
  todayKey,
  minDayKey,
  onSave,
  onChangeProject,
  onSaveTimes,
  onDelete,
  onContinue,
  continuing,
  continueShortcut,
  onDuplicate,
  focusTimesOnMount,
  onTimesFocused,
}: EntryRowProps) {
  const { time } = useDisplayFormats();
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [draft, setDraft] = useState(description);
  const [timesEditing, setTimesEditing] = useState<TimesEditing | null>(null);
  const [timesDraft, setTimesDraft] = useState<TimeDraft | null>(null);

  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const descriptionRef = useRef<HTMLButtonElement>(null);
  const timesRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  /** Al cerrar el editor del horario con el foco adentro, vuelve a las horas. */
  const returnFocusToTimes = useRef(false);

  useEffect(() => {
    // Al cerrar la edición el input se va del árbol: el foco vuelve al botón
    // que lo reemplaza. La edición solo se cierra por una acción explícita,
    // así que enfocar nunca interrumpe a nadie.
    if (!editing && wasEditing.current) {
      descriptionRef.current?.focus();
    }
    wasEditing.current = editing;
  }, [editing]);

  useEffect(() => {
    // Si el editor se cerró con el foco afuera, la persona ya está en otro
    // control y no se la mueve.
    if (timesEditing === null && returnFocusToTimes.current) {
      returnFocusToTimes.current = false;
      timesRef.current?.focus();
    }
  }, [timesEditing]);

  useEffect(() => {
    // TT-56: la fila movida de día se vuelve a montar en su grupo nuevo, y el
    // foco que tenía en el viejo se habría ido con ella.
    if (focusTimesOnMount) {
      timesRef.current?.focus();
      onTimesFocused();
    }
  }, [focusTimesOnMount, onTimesFocused]);

  // Las filas del grupo son todas cerradas: el fin siempre está.
  const viewTimes = fromView({
    dayDate: entry.dayDate,
    startClock: entry.startClock,
    endClock: entry.endClock ?? entry.startClock,
  });
  /** Un trío que no es el de la vista: el borrador abierto o el que viaja. */
  const shownTimes = timesEditing !== null ? timesDraft : pendingTimes;
  const times = shownTimes ?? viewTimes;

  function startTimesEditing(how: TimesEditing["how"]): void {
    // Con una escritura en vuelo el editor arranca del trío confirmado, que es
    // lo que la fila está mostrando.
    const initial = pendingTimes ?? viewTimes;
    setTimesDraft(initial);
    setTimesEditing({ how, initial });
  }

  function closeTimesEditing(returnFocus: boolean): void {
    returnFocusToTimes.current = returnFocus;
    setTimesEditing(null);
    setTimesDraft(null);
  }

  function startEditing(): void {
    setDraft(description);
    setEditing(true);
  }

  function commit(next: string): void {
    setEditing(false);
    if (next === description) {
      return;
    }
    onSave(next);
  }

  const entryName = entryNameOf(description);
  // Una sola expresión en reposo, en edición y en vuelo: las horas canónicas
  // nunca se muestran sin pasar por el formato de la persona.
  const timesLabel = `${clockLabel(times.start, time)} – ${clockLabel(times.end, time)}`;
  // El superíndice y la duración de un trío que no es el de la vista salen de
  // sus horas de pared.
  const extraDays = shownTimes === null ? entry.extraDays : draftExtraDays(shownTimes);
  // La de la vista es la del servidor, que mide instantes: en un día con cambio
  // de horario no coincide con la resta de las horas (TT-97).
  const durationLabel =
    shownTimes === null ? entry.durationLabel : formatDuration(draftDuration(shownTimes));
  const timesText = `${timesLabel}${extraDays > 0 ? ` +${extraDays}${extraDaysText(extraDays)}` : ""}`;

  return (
    <li
      aria-busy={busy}
      data-entry-id={entry.id}
      className={cn("border-b last:border-b-0", busy && "opacity-60")}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
        {canTrack && (
          <SelectionCheckbox
            checked={selected}
            label={selectEntryLabel(entryName, timesLabel)}
            locked={selectionLocked}
            onToggle={onToggleSelected}
          />
        )}
        <div className="min-w-0 flex-1 basis-64">
          {editing ? (
            <DescriptionField
              value={draft}
              onValueChange={setDraft}
              onCommit={commit}
              onCancel={() => setEditing(false)}
              label="Descripción de la entrada"
              placeholder={trackerLabels.noDescription}
              autoFocus
            />
          ) : (
            <button
              type="button"
              ref={descriptionRef}
              disabled={!canTrack}
              onClick={startEditing}
              className={cn(
                "focus-visible:ring-ring w-full truncate rounded-md px-1 py-1 text-left text-sm focus-visible:ring-3 focus-visible:outline-none",
                canTrack && "hover:bg-muted",
                description === "" && "text-muted-foreground italic",
              )}
            >
              {entryName}
              <span className="sr-only"> — editar la descripción</span>
            </button>
          )}
        </div>

        {/* TT-49 y TT-92: con la membresía desactivada, el proyecto como texto. */}
        <ProjectPicker
          value={project}
          onChange={onChangeProject}
          variant="row"
          label={entryProjectLabel(entryName)}
          pending={busy}
          readOnly={!canTrack}
        />

        {timesEditing !== null && timesDraft !== null ? (
          <EntryTimesEditor
            initial={timesEditing.initial}
            draft={timesDraft}
            onDraftChange={setTimesDraft}
            todayKey={todayKey}
            minDayKey={minDayKey}
            openCalendar={timesEditing.how === "date"}
            onConfirm={onSaveTimes}
            onClose={closeTimesEditing}
          />
        ) : canTrack && entry.editableTimes ? (
          <span className="flex items-center gap-1">
            <button
              type="button"
              ref={timesRef}
              onClick={() => startTimesEditing("times")}
              // Nombre por `aria-label` y no por un texto oculto: así el texto
              // de la fila sigue siendo las horas pegadas a la duración.
              // Empieza con el texto visible (WCAG 2.5.3).
              aria-label={`${timesText} — editar el horario`}
              className="focus-visible:ring-ring hover:bg-muted text-muted-foreground rounded-md px-1 py-1 text-sm tabular-nums focus-visible:ring-3 focus-visible:outline-none"
            >
              {timesLabel}
              {extraDays > 0 && <sup className="ml-0.5">+{extraDays}</sup>}
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => startTimesEditing("date")}
              aria-label={`Cambiar la fecha de la entrada «${entryName}»`}
            >
              <CalendarIcon aria-hidden="true" />
            </Button>
          </span>
        ) : (
          <span className="flex items-center gap-1">
            <span className="text-muted-foreground px-1 text-sm tabular-nums">
              {timesLabel}
              {extraDays > 0 && (
                <sup className="ml-0.5">
                  +{extraDays}
                  <span className="sr-only">{extraDaysText(extraDays)}</span>
                </sup>
              )}
            </span>
            {/* El lugar del botón de fecha, para que las horas queden alineadas con las de las otras filas. */}
            {canTrack && <span aria-hidden="true" className="size-7" />}
          </span>
        )}

        <span className="w-16 text-right text-sm font-medium tabular-nums">
          {durationLabel}
        </span>

        {canTrack && (
          <>
            {/*
             * TT-57 y TT-110: también con horarios de solo lectura. Inactivo
             * con `aria-disabled` y no con `disabled`: el foco se queda en el
             * botón mientras su continuación viaja, y salir del editor de
             * horas con Tab cae acá aunque otra escritura de la fila esté en
             * vuelo, como en «Acciones».
             */}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Continuar «${entryName}»`}
              aria-disabled={continuing}
              aria-busy={continuing}
              aria-keyshortcuts={continueShortcut ? "C" : undefined}
              onClick={() => {
                if (!continuing) {
                  onContinue();
                }
              }}
            >
              <PlayIcon aria-hidden="true" />
            </Button>
            {/*
             * Con una escritura en vuelo el menú no abre, pero el disparador
             * no se deshabilita: salir del editor de horas con Tab cae acá en
             * el mismo render en que la escritura arranca, y un botón
             * deshabilitado dejaría el foco en `body`.
             */}
            <DropdownMenu
              open={menuOpen}
              onOpenChange={(next) => setMenuOpen(next && !busy)}
            >
              <DropdownMenuTrigger
                render={
                  <Button
                    ref={menuTriggerRef}
                    variant="ghost"
                    size="icon-sm"
                    aria-disabled={busy}
                  />
                }
                aria-label={`Acciones de la entrada «${entryName}»`}
              >
                <EllipsisVerticalIcon aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto min-w-40">
                <DropdownMenuItem disabled={busy} onClick={onDuplicate}>
                  <CopyIcon aria-hidden="true" />
                  Duplicar
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  // Un clic en «Acciones» con el calendario del editor abierto
                  // abre el menú antes de que el trío se confirme: el menú
                  // puede quedar abierto con la escritura ya en vuelo.
                  disabled={busy}
                  onClick={() => setConfirmingDelete(true)}
                >
                  <Trash2Icon aria-hidden="true" />
                  Borrar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DeleteEntryDialog
              name={entryName}
              startLabel={entry.startLabel}
              endLabel={entry.endLabel}
              open={confirmingDelete}
              onOpenChange={setConfirmingDelete}
              onConfirm={onDelete}
              finalFocus={menuTriggerRef}
            />
          </>
        )}

        {canTrack && !entry.editableTimes && (
          <p className="text-muted-foreground basis-full text-right text-xs">
            {trackerLabels.multiDayTimesReadOnly}
          </p>
        )}
      </div>
    </li>
  );
}
