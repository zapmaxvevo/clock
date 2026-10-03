"use client";

import { useRef, type RefObject } from "react";

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

import { trackerLabels } from "./labels";

type DiscardTimerDialogProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => void;
  /**
   * TT-65: con un guardado de la descripción en vuelo no se confirma. Si el
   * descarte llegara antes, el guardado respondería que la entrada ya no
   * existe sobre un timer que la persona acaba de descartar.
   */
  readonly confirmDisabled: boolean;
  /** Adónde vuelve el foco al cancelar o cerrar: el disparador del menú. */
  readonly finalFocus: RefObject<HTMLElement | null>;
  /**
   * Adónde va el foco al confirmar, porque el disparador se va con el timer,
   * y al cancelar si el disparador ya no está: otra pestaña detuvo el timer
   * con el diálogo abierto.
   */
  readonly fallbackFocus: RefObject<HTMLElement | null>;
};

/** TT-65: el descarte borra la entrada y no se deshace (P-06), así que se confirma. */
export function DiscardTimerDialog({
  open,
  onOpenChange,
  onConfirm,
  confirmDisabled,
  finalFocus,
  fallbackFocus,
}: DiscardTimerDialogProps) {
  const confirmed = useRef(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        finalFocus={() => {
          const afterConfirm = confirmed.current;
          confirmed.current = false;
          return afterConfirm
            ? fallbackFocus.current
            : (finalFocus.current ?? fallbackFocus.current);
        }}
      >
        <DialogHeader>
          <DialogTitle>{trackerLabels.discardTitle}</DialogTitle>
          <DialogDescription>{trackerLabels.discardDescription}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
          <Button
            variant="destructive"
            disabled={confirmDisabled}
            onClick={() => {
              confirmed.current = true;
              onOpenChange(false);
              onConfirm();
            }}
          >
            Descartar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
