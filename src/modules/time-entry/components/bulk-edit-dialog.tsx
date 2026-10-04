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
import { DESCRIPTION_MAX, type BulkEditChanges } from "@/modules/time-entry/schema";
import { clockLabel, parseClockInput } from "@/server/time";

import { emptyBulkChanges, toChanges, type BulkChangesDraft } from "./bulk-changes";
import { ClockField } from "./clock-field";
import { DateField } from "./date-field";
import { bulkEditTitle, clockPlaceholder, trackerLabels } from "./labels";

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
  readonly regionFocus: RefObject<HTMLElement | null>;
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
  regionFocus,
}: BulkEditDialogProps) {
  /** Cómo se cerró: cancelado vuelve a «Editar»; si no, a la región. */
  const cancelled = useRef(false);
  const descriptionRef = useRef<HTMLInputElement>(null);

  function changeOpen(next: boolean): void {
    if (next) {
      return;
    }
    cancelled.current = true;
    onCancel();
  }

  function finalFocus(): HTMLElement | null {
    const target = cancelled.current
      ? (cancelFocus.current ?? regionFocus.current)
      : regionFocus.current;
    cancelled.current = false;
    return target;
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
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
  const dateRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<BulkChangesDraft>(emptyBulkChanges);
  /**
   * Enter en una hora la confirma y guarda en el mismo evento, antes de que
   * el borrador nuevo llegue a un render: el guardado lee el de acá.
   */
  const draftRef = useRef(draft);

  function change(next: BulkChangesDraft): void {
    draftRef.current = next;
    setDraft(next);
  }

  /** Vaciada, la hora vuelve a «sin cambios»; si no, se interpreta con el formato de la persona. */
  function commitClock(field: "start" | "end", text: string): string | null {
    if (text.trim() === "") {
      change({ ...draftRef.current, [field]: "" });
      return "";
    }
    const clock = parseClockInput(text, time);
    if (clock === null) {
      return null;
    }
    change({ ...draftRef.current, [field]: clock });
    return clockLabel(clock, time);
  }

  function clearDate(): void {
    change({ ...draftRef.current, date: null });
    // «Quitar la fecha» se va con la fecha: el foco pasa al selector.
    dateRef.current?.querySelector("button")?.focus();
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

  const clockText = (clock: string) => (clock === "" ? "" : clockLabel(clock, time));

  return (
    // Enter en la descripción envía el formulario y guarda.
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{bulkEditTitle(count)}</DialogTitle>
        <DialogDescription>{trackerLabels.bulkEditHint}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-3">
        <div className="grid gap-2">
          <Label htmlFor={descriptionId}>{trackerLabels.bulkDescription}</Label>
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
          {/* El nombre del selector ya empieza con «Fecha». */}
          <span aria-hidden="true" className="text-sm leading-none font-medium">
            {trackerLabels.bulkDate}
          </span>
          <div ref={dateRef} className="flex flex-wrap items-center gap-2">
            <DateField
              value={draft.date}
              placeholder={trackerLabels.noChange}
              label={trackerLabels.bulkDate}
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
        <Button
          ref={saveRef}
          type="submit"
          aria-disabled={pending || toChanges(draft) === null}
        >
          Guardar
        </Button>
      </DialogFooter>
    </form>
  );
}
