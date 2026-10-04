"use client";

import type { RefObject } from "react";

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

import { entrySpanText } from "./labels";

type DeleteEntryDialogProps = {
  /** Cómo nombrar la entrada: el mismo texto que muestra la fila. */
  readonly name: string;
  readonly startLabel: string;
  readonly endLabel: string | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => void;
  /** Adónde vuelve el foco al cancelar o cerrar: el disparador del menú. */
  readonly finalFocus: RefObject<HTMLElement | null>;
};

/** TT-60 y TT-61: el borrado es físico, así que se confirma y no se deshace. */
export function DeleteEntryDialog({
  name,
  startLabel,
  endLabel,
  open,
  onOpenChange,
  onConfirm,
  finalFocus,
}: DeleteEntryDialogProps) {
  const span = entrySpanText(startLabel, endLabel);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent finalFocus={finalFocus}>
        <DialogHeader>
          <DialogTitle>¿Borrar esta entrada?</DialogTitle>
          <DialogDescription>
            Se va a borrar «{name}», {span}. No se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
          <Button
            variant="destructive"
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            Borrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
