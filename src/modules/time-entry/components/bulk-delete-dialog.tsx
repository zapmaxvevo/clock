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

type BulkDeleteDialogProps = {
  readonly count: number;
  readonly open: boolean;
  /** Cancelar, Esc o un clic afuera: el foco vuelve a `cancelFocus`, o a la región si ya no está. */
  readonly onCancel: () => void;
  /** La palabra vale. Quien lo abrió lo cierra en el acto, y el foco va a `confirmFocus`. */
  readonly onConfirm: () => void;
  /** «Borrar» de la barra. */
  readonly cancelFocus: RefObject<HTMLElement | null>;
  /** La región de acciones en masa, que sigue en pantalla mientras el borrado viaja. */
  readonly confirmFocus: RefObject<HTMLElement | null>;
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
  confirmFocus,
}: BulkDeleteDialogProps) {
  /** Cómo se cerró: cancelado vuelve a «Borrar»; confirmado, a la región. */
  const cancelled = useRef(false);
  const fieldRef = useRef<HTMLInputElement>(null);

  function changeOpen(next: boolean): void {
    if (next) {
      return;
    }
    cancelled.current = true;
    onCancel();
  }

  /**
   * El foco lo mueve el diálogo y no Base UI, que pasa al primer control
   * tabulable de lo que se le devuelve: con la región, que no es tabulable,
   * caería en «Editar» de la barra. Va en una microtarea, como el de Base UI,
   * cuando lo de afuera del modal ya dejó de estar inerte. Si la barra se fue
   * con el diálogo abierto, a la región.
   */
  function finalFocus(): false {
    const target = cancelled.current
      ? (cancelFocus.current ?? confirmFocus.current)
      : confirmFocus.current;
    cancelled.current = false;
    queueMicrotask(() => target?.focus());
    return false;
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
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
          {trackerLabels.bulkDelete}
        </Button>
      </DialogFooter>
    </form>
  );
}
