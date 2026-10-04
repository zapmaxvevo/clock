"use client";

import { useId, useRef, useState, type FormEvent, type RefObject } from "react";

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

import { confirmsDelete } from "./bulk-changes";
import { bulkDeleteTitle, trackerLabels } from "./labels";
import { useDialogReturnFocus } from "./use-dialog-return-focus";

type BulkDeleteDialogProps = {
  readonly count: number;
  readonly open: boolean;
  /** Cancelar, Esc o un clic afuera: el foco vuelve a `cancelFocus`, o a la región si ya no está. */
  readonly onCancel: () => void;
  /** La palabra vale. Quien lo abrió lo cierra en el acto, y el foco va a `fallbackFocus`. */
  readonly onConfirm: () => void;
  /** «Borrar» de la barra. */
  readonly cancelFocus: RefObject<HTMLElement | null>;
  /** La región de acciones en masa, que sigue en pantalla mientras el borrado viaja. */
  readonly fallbackFocus: RefObject<HTMLElement | null>;
};

/**
 * TT-64: el borrado masivo es físico y no se deshace, así que se confirma
 * escribiendo la palabra. No llama a ninguna action.
 */
export function BulkDeleteDialog({
  count,
  open,
  onCancel,
  onConfirm,
  cancelFocus,
  fallbackFocus,
}: BulkDeleteDialogProps) {
  const fieldRef = useRef<HTMLInputElement>(null);
  const { onOpenChange, finalFocus } = useDialogReturnFocus({
    cancelFocus,
    fallbackFocus,
    onCancel,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent initialFocus={fieldRef} finalFocus={finalFocus}>
        <BulkDeleteForm fieldRef={fieldRef} count={count} onConfirm={onConfirm} />
      </DialogContent>
    </Dialog>
  );
}

type BulkDeleteFormProps = {
  readonly fieldRef: RefObject<HTMLInputElement | null>;
  readonly count: number;
  readonly onConfirm: () => void;
};

/** Vive con el diálogo abierto: cada apertura arranca con el campo vacío. */
function BulkDeleteForm({ fieldRef, count, onConfirm }: BulkDeleteFormProps) {
  const fieldId = useId();
  const [text, setText] = useState("");
  const valid = confirmsDelete(text);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (valid) {
      onConfirm();
    }
  }

  return (
    // Enter en el campo envía el formulario: confirma si la palabra vale.
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{bulkDeleteTitle(count)}</DialogTitle>
        <DialogDescription>{trackerLabels.bulkDeleteWarning}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor={fieldId}>{trackerLabels.bulkDeleteConfirm}</Label>
        <Input
          ref={fieldRef}
          id={fieldId}
          type="text"
          value={text}
          autoComplete="off"
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>
          Cancelar
        </DialogClose>
        {/* Inactivo con `aria-disabled`: el foco no se pierde mientras se escribe. */}
        <Button type="submit" variant="destructive" aria-disabled={!valid}>
          {trackerLabels.delete}
        </Button>
      </DialogFooter>
    </form>
  );
}
