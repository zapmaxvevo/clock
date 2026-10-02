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
import type { TimeEntryView } from "@/modules/time-entry/schema";

import { trackerLabels } from "./labels";

type DeleteEntryDialogProps = {
  readonly entry: TimeEntryView;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => void;
  /** Adónde vuelve el foco al cancelar o cerrar: el disparador del menú. */
  readonly finalFocus: RefObject<HTMLElement | null>;
};

/** TT-60 y TT-61: el borrado es físico, así que se confirma y no se deshace. */
export function DeleteEntryDialog({
  entry,
  open,
  onOpenChange,
  onConfirm,
  finalFocus,
}: DeleteEntryDialogProps) {
  const name = entry.description === "" ? trackerLabels.noDescription : entry.description;
  const span =
    entry.endLabel === null
      ? `desde las ${entry.startLabel}`
      : `de ${entry.startLabel} a ${entry.endLabel}`;

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
