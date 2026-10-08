"use client";

import { CopyIcon, EllipsisVerticalIcon, Trash2Icon } from "lucide-react";
import { useId, useRef, type RefObject } from "react";

import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { timeEntryMessages } from "@/modules/time-entry/schema";

import { entryActionsLabel, trackerLabels } from "../labels";
import { calendarLabels } from "./labels";

type EditorActionsProps = {
  readonly mode: "edit" | "running" | "add";
  readonly name: string;
  readonly pending: boolean;
  /** «Agregar» con duración cero (TT-73). */
  readonly tooShort: boolean;
  /** «Detener» con cambios sin guardar (§1, decisión 4). */
  readonly stopBlocked: boolean;
  readonly submitRef: RefObject<HTMLButtonElement | null>;
  readonly onStop?: () => void;
  /** Sin él, el menú no ofrece «Duplicar» (13b, D13b-7). */
  readonly onDuplicate?: () => void;
  readonly onDelete: () => void;
};

/**
 * Los botones de abajo y el texto que explica el inactivo. Inactivo es
 * `aria-disabled` y no actuar, nunca `disabled`: un control con foco que pasa
 * a `disabled` lo pierde a `body`.
 */
export function EditorActions({
  mode,
  name,
  pending,
  tooShort,
  stopBlocked,
  submitRef,
  onStop,
  onDuplicate,
  onDelete,
}: EditorActionsProps) {
  const hintId = useId();
  const hint =
    mode === "add" && tooShort
      ? timeEntryMessages.tooShort
      : mode === "running" && stopBlocked
        ? calendarLabels.saveBeforeStop
        : null;

  return (
    <>
      {hint !== null && (
        <p id={hintId} className="text-muted-foreground text-sm">
          {hint}
        </p>
      )}
      <DialogFooter className="sm:justify-between">
        <div className="flex gap-2">
          {mode === "edit" && (
            <EntryMenu name={name} onDuplicate={onDuplicate} onDelete={onDelete} />
          )}
          {mode === "running" && (
            <Button
              type="button"
              variant="outline"
              aria-disabled={stopBlocked}
              aria-describedby={stopBlocked ? hintId : undefined}
              onClick={() => {
                if (!stopBlocked) {
                  onStop?.();
                }
              }}
            >
              {calendarLabels.stop}
            </Button>
          )}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          {/* F1: con el alta en vuelo no cierra; el diálogo ignora el pedido. */}
          <DialogClose
            render={<Button type="button" variant="outline" />}
            aria-disabled={mode === "add" && pending}
          >
            Cancelar
          </DialogClose>
          <Button
            ref={submitRef}
            type="submit"
            aria-disabled={pending || (mode === "add" && tooShort)}
            aria-describedby={mode === "add" && tooShort ? hintId : undefined}
          >
            {mode === "add" ? calendarLabels.add : calendarLabels.save}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

/** CAL-68: «Duplicar» y «Borrar» de una entrada cerrada; sin `onDuplicate`, solo «Borrar». */
function EntryMenu({
  name,
  onDuplicate,
  onDelete,
}: {
  readonly name: string;
  readonly onDuplicate?: () => void;
  readonly onDelete: () => void;
}) {
  /**
   * Elegir una acción cierra el diálogo, y el dueño lleva el foco. Sin esto el
   * menú, que se desmonta con el diálogo, lo devolvería al último elemento
   * enfocado antes, el bloque que abrió el diálogo, y pisaría el del dueño.
   */
  const chosen = useRef(false);

  function choose(action: () => void): void {
    chosen.current = true;
    action();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type="button" variant="ghost" size="icon" />}
        aria-label={entryActionsLabel(name)}
      >
        <EllipsisVerticalIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-auto min-w-40"
        finalFocus={() => !chosen.current}
      >
        {onDuplicate !== undefined && (
          <DropdownMenuItem onClick={() => choose(onDuplicate)}>
            <CopyIcon aria-hidden="true" />
            {trackerLabels.duplicate}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem variant="destructive" onClick={() => choose(onDelete)}>
          <Trash2Icon aria-hidden="true" />
          {trackerLabels.delete}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
