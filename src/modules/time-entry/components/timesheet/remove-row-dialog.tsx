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

import { useDialogReturnFocus } from "../use-dialog-return-focus";
import { removeRowBody, removeRowTitle, timesheetLabels } from "./labels";

/** La fila que se va a quitar, como estaba al abrir el diálogo. */
export type RowToRemove = {
  readonly name: string;
  readonly count: number;
  /** El total exacto de la fila, ya con el formato de un total. */
  readonly total: string;
};

type RemoveRowDialogProps = {
  readonly row: RowToRemove | null;
  readonly open: boolean;
  /** Cancelar, Esc o un clic afuera: el foco vuelve a la X de la fila (TT-61). */
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  /** La X de la fila. */
  readonly cancelFocus: RefObject<HTMLElement | null>;
  /** «Añadir nueva fila»: la X se va con la fila (§5.8). */
  readonly fallbackFocus: RefObject<HTMLElement | null>;
};

/**
 * TS-52, TS-53 y TT-61: quitar una fila con entradas las borra y no se
 * deshace, así que se confirma con cuántas son y cuánto suman.
 */
export function RemoveRowDialog({
  row,
  open,
  onCancel,
  onConfirm,
  cancelFocus,
  fallbackFocus,
}: RemoveRowDialogProps) {
  const { onOpenChange, finalFocus } = useDialogReturnFocus({
    cancelFocus,
    fallbackFocus,
    onCancel,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent finalFocus={finalFocus}>
        {row !== null && (
          <>
            <DialogHeader>
              <DialogTitle>{removeRowTitle(row.name)}</DialogTitle>
              <DialogDescription>{removeRowBody(row.count, row.total)}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
              <Button variant="destructive" onClick={onConfirm}>
                {timesheetLabels.removeRowConfirm}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
