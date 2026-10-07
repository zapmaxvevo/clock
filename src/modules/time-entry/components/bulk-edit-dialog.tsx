"use client";

import {
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { useDisplayFormats } from "@/components/layout/display-formats";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { projectLabels } from "@/modules/project/components/labels";
import { ProjectPicker } from "@/modules/project/components/project-picker";
import { TagPicker } from "@/modules/project/components/tag-picker";
import { DESCRIPTION_MAX, type BulkEditChanges } from "@/modules/time-entry/schema";
import { clockLabel } from "@/server/time";

import {
  emptyBulkChanges,
  toChanges,
  withBulkClock,
  type BulkChangesDraft,
  type BulkTagMode,
} from "./bulk-changes";
import { calendarLabels } from "./calendar/labels";
import { ClockField } from "./clock-field";
import { DateField } from "./date-field";
import { bulkEditTitle, clockPlaceholder, trackerLabels } from "./labels";
import { useDialogReturnFocus } from "./use-dialog-return-focus";

type BulkEditDialogProps = {
  readonly count: number;
  readonly open: boolean;
  /** Día de hoy en la zona de la persona. */
  readonly todayKey: string;
  /** Piso del workspace. No hay techo: una entrada cerrada puede ir al futuro (P-10). */
  readonly minDayKey: string;
  /** La edición viaja: «Guardar» queda inactivo, sin `disabled`, y los campos siguen activos. */
  readonly pending: boolean;
  /** «Guardar», adonde «Reintentar» y «Quitar esas entradas» llevan el foco. */
  readonly saveRef: RefObject<HTMLButtonElement | null>;
  /** El aviso de error de la edición, arriba de los botones. */
  readonly feedback: ReactNode;
  /** Cancelar, Esc o un clic afuera. */
  readonly onCancel: () => void;
  /** Los campos con algo; no llama a ninguna action. */
  readonly onSave: (changes: BulkEditChanges) => void;
  /** «Editar» de la barra, adonde vuelve el foco al cancelar. */
  readonly cancelFocus: RefObject<HTMLElement | null>;
  /** La región de acciones en masa: el foco va ahí si el diálogo se cierra por otra cosa. */
  readonly fallbackFocus: RefObject<HTMLElement | null>;
};

/**
 * TT-63: lo que cambia en las entradas elegidas. Cada campo arranca vacío y
 * vacío no cambia. Lo cierra quien lo abrió: con éxito, o porque la selección
 * quedó vacía; con error queda abierto con el aviso.
 */
export function BulkEditDialog({
  count,
  open,
  todayKey,
  minDayKey,
  pending,
  saveRef,
  feedback,
  onCancel,
  onSave,
  cancelFocus,
  fallbackFocus,
}: BulkEditDialogProps) {
  const descriptionRef = useRef<HTMLInputElement>(null);
  const { onOpenChange, finalFocus } = useDialogReturnFocus({
    cancelFocus,
    fallbackFocus,
    onCancel,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent initialFocus={descriptionRef} finalFocus={finalFocus}>
        <BulkEditForm
          descriptionRef={descriptionRef}
          count={count}
          todayKey={todayKey}
          minDayKey={minDayKey}
          pending={pending}
          saveRef={saveRef}
          feedback={feedback}
          onSave={onSave}
        />
      </DialogContent>
    </Dialog>
  );
}

type BulkEditFormProps = Pick<
  BulkEditDialogProps,
  "count" | "todayKey" | "minDayKey" | "pending" | "saveRef" | "feedback" | "onSave"
> & {
  readonly descriptionRef: RefObject<HTMLInputElement | null>;
};

/** Vive con el diálogo abierto: cada apertura arranca con el borrador vacío. */
function BulkEditForm({
  descriptionRef,
  count,
  todayKey,
  minDayKey,
  pending,
  saveRef,
  feedback,
  onSave,
}: BulkEditFormProps) {
  const { time } = useDisplayFormats();
  const descriptionId = useId();
  const tagsClearedId = useId();
  const billableLabelId = useId();
  const billableHintId = useId();
  const projectRef = useRef<HTMLButtonElement>(null);
  const tagsRef = useRef<HTMLButtonElement>(null);
  const dateRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<BulkChangesDraft>(emptyBulkChanges);
  /**
   * Enter en una hora la confirma y guarda en el mismo evento, antes de que
   * el borrador nuevo llegue a un render: el guardado lee el de acá.
   */
  const draftRef = useRef(draft);
  /**
   * El texto de cada hora, confirmado o no. Una hora escrita y sin confirmar
   * cuenta para «Guardar»: al tomar el foco, el campo la confirma antes de
   * que el formulario se envíe.
   */
  const [clockTexts, setClockTexts] = useState({ start: "", end: "" });

  const clockText = (clock: string) => (clock === "" ? "" : clockLabel(clock, time));

  function change(next: BulkChangesDraft): void {
    draftRef.current = next;
    setDraft(next);
  }

  function commitClock(field: "start" | "end", text: string): string | null {
    const next = withBulkClock(draftRef.current, field, text, time);
    if (next === null) {
      return null;
    }
    change(next);
    return clockText(next[field]);
  }

  function changeClockText(field: "start" | "end", text: string): void {
    setClockTexts((current) => ({ ...current, [field]: text }));
  }

  function clearDate(): void {
    change({ ...draftRef.current, date: null });
    // «Quitar la fecha» se va con la fecha: el foco pasa al selector.
    dateRef.current?.querySelector("button")?.focus();
  }

  function keepProject(): void {
    change({ ...draftRef.current, selection: null });
    // Como «Quitar la fecha»: el botón se va y el foco pasa al selector.
    projectRef.current?.focus();
  }

  function keepTags(): void {
    change({ ...draftRef.current, tagMode: "add", tags: [] });
    tagsRef.current?.focus();
  }

  function save(): void {
    const changes = toChanges(draftRef.current);
    if (pending || changes === null) {
      return;
    }
    onSave(changes);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    save();
  }

  const typedClock = clockTexts.start.trim() !== "" || clockTexts.end.trim() !== "";
  const idle = pending || (toChanges(draft) === null && !typedClock);
  const tagsCleared = draft.tagMode === "replace" && draft.tags.length === 0;
  const tagsChanged = draft.tagMode === "replace" || draft.tags.length > 0;
  // «Sin proyecto» no tiene facturable por defecto: cada entrada conserva el suyo (D-2).
  const billableByProject =
    draft.selection !== null &&
    draft.selection.project !== null &&
    draft.billable === null;

  return (
    // Enter en la descripción envía el formulario y guarda.
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{bulkEditTitle(count)}</DialogTitle>
        <DialogDescription>{trackerLabels.bulkEditHint}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-3">
        <div className="grid gap-2">
          <Label htmlFor={descriptionId}>{trackerLabels.description}</Label>
          <Input
            ref={descriptionRef}
            id={descriptionId}
            type="text"
            value={draft.description}
            placeholder={trackerLabels.noChange}
            // TT-71: el campo corta en el mismo largo que valida el esquema.
            maxLength={DESCRIPTION_MAX}
            onChange={(event) =>
              change({ ...draftRef.current, description: event.target.value })
            }
          />
        </div>

        <div className="grid gap-2">
          {/* El nombre del selector ya es «Proyecto». */}
          <span aria-hidden="true" className="text-sm leading-none font-medium">
            {calendarLabels.project}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <ProjectPicker
              variant="row"
              label={calendarLabels.project}
              value={draft.selection}
              placeholder={trackerLabels.noChange}
              triggerRef={projectRef}
              onChange={(selection) => change({ ...draftRef.current, selection })}
            />
            {draft.selection !== null && (
              <Button type="button" variant="ghost" size="sm" onClick={keepProject}>
                {trackerLabels.keepProject}
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-2">
          {/* El nombre del selector ya empieza con «Etiquetas». */}
          <span aria-hidden="true" className="text-sm leading-none font-medium">
            {projectLabels.tags}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <TagPicker
              variant="bar"
              label={projectLabels.tags}
              value={draft.tags}
              triggerRef={tagsRef}
              onChange={(tags) => change({ ...draftRef.current, tags })}
            />
            {tagsChanged && (
              <Button type="button" variant="ghost" size="sm" onClick={keepTags}>
                {trackerLabels.keepTags}
              </Button>
            )}
          </div>
          <RadioGroup
            aria-label={trackerLabels.tagModeGroup}
            aria-describedby={tagsCleared ? tagsClearedId : undefined}
            value={draft.tagMode}
            onValueChange={(tagMode) => {
              if (isTagMode(tagMode)) {
                change({ ...draftRef.current, tagMode });
              }
            }}
            className="flex flex-wrap gap-x-4"
          >
            <RadioOption value="add" label={trackerLabels.tagModeAdd} />
            <RadioOption value="replace" label={trackerLabels.tagModeReplace} />
          </RadioGroup>
          {tagsCleared && (
            <p id={tagsClearedId} className="text-muted-foreground text-xs">
              {trackerLabels.tagsCleared}
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <span id={billableLabelId} className="text-sm leading-none font-medium">
            {trackerLabels.billable}
          </span>
          <RadioGroup
            aria-labelledby={billableLabelId}
            aria-describedby={billableByProject ? billableHintId : undefined}
            value={billableOption(draft.billable)}
            onValueChange={(option) =>
              change({ ...draftRef.current, billable: billableOfOption(option) })
            }
            className="flex flex-wrap gap-x-4"
          >
            <RadioOption value="none" label={trackerLabels.noChange} />
            <RadioOption value="yes" label={calendarLabels.billableYes} />
            <RadioOption value="no" label={calendarLabels.billableNo} />
          </RadioGroup>
          {billableByProject && (
            <p id={billableHintId} className="text-muted-foreground text-xs">
              {trackerLabels.billableByProject}
            </p>
          )}
        </div>

        <div className="grid gap-2">
          {/* El nombre del selector ya empieza con «Fecha». */}
          <span aria-hidden="true" className="text-sm leading-none font-medium">
            {trackerLabels.date}
          </span>
          <div ref={dateRef} className="flex flex-wrap items-center gap-2">
            <DateField
              value={draft.date}
              placeholder={trackerLabels.noChange}
              label={trackerLabels.date}
              onChange={(date) => change({ ...draftRef.current, date })}
              todayKey={todayKey}
              minDayKey={minDayKey}
            />
            {draft.date !== null && (
              <Button type="button" variant="ghost" size="sm" onClick={clearDate}>
                {trackerLabels.clearDate}
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="grid gap-2">
            <span aria-hidden="true" className="text-sm leading-none font-medium">
              {trackerLabels.startTime}
            </span>
            <ClockField
              value={clockText(draft.start)}
              onCommit={(text) => commitClock("start", text)}
              onTextChange={(text) => changeClockText("start", text)}
              onSubmit={save}
              label={trackerLabels.startTime}
              format={time}
              placeholder={clockPlaceholder(time)}
            />
          </div>
          <div className="grid gap-2">
            <span aria-hidden="true" className="text-sm leading-none font-medium">
              {trackerLabels.endTime}
            </span>
            <ClockField
              value={clockText(draft.end)}
              onCommit={(text) => commitClock("end", text)}
              onTextChange={(text) => changeClockText("end", text)}
              onSubmit={save}
              label={trackerLabels.endTime}
              format={time}
              placeholder={clockPlaceholder(time)}
            />
          </div>
        </div>
      </div>

      {feedback}

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>
          Cancelar
        </DialogClose>
        <Button ref={saveRef} type="submit" aria-disabled={idle}>
          Guardar
        </Button>
      </DialogFooter>
    </form>
  );
}

function isTagMode(value: unknown): value is BulkTagMode {
  return value === "add" || value === "replace";
}

/** El facturable del borrador como opción del grupo: `null` es «Sin cambios». */
function billableOption(billable: boolean | null): string {
  if (billable === null) {
    return "none";
  }
  return billable ? "yes" : "no";
}

function billableOfOption(option: unknown): boolean | null {
  if (option === "yes") {
    return true;
  }
  return option === "no" ? false : null;
}

/** Una opción de un grupo, nombrada por el texto que la acompaña. */
function RadioOption({
  value,
  label,
}: {
  readonly value: string;
  readonly label: string;
}) {
  return (
    <Label className="font-normal">
      <RadioGroupItem value={value} />
      {label}
    </Label>
  );
}
