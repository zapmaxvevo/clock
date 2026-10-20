"use client";

import { useRef } from "react";

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

import { grantsLabels } from "./labels";

/** El `<h2>` de la sección, adonde va el foco cuando la fila se va (§5.3). */
export const GRANTS_HEADING_ID = "asistentes-conectados";

/** «Desconectar» de una fila, adonde vuelve el foco si se cancela la confirmación. */
export function revokeGrantButtonId(clientId: string): string {
  return `desconectar-${clientId}`;
}

type RevokeGrantDialogProps = {
  /** El asistente que se confirma; se conserva mientras el diálogo se cierra. */
  readonly grant: { readonly clientId: string; readonly name: string } | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => void;
};

/**
 * D-MCP-5: desconectar se confirma, con la forma de la de revocar una
 * invitación. Confirmar saca la fila, así que el foco va al encabezado de la
 * sección; cancelar lo devuelve a «Desconectar» de la fila (§5.3).
 */
export function RevokeGrantDialog({
  grant,
  open,
  onOpenChange,
  onConfirm,
}: RevokeGrantDialogProps) {
  /** Si el cierre en curso es el de «Desconectar». */
  const confirmed = useRef(false);

  function returnFocusTarget(): HTMLElement | null {
    const heading = document.getElementById(GRANTS_HEADING_ID);
    const wasConfirmed = confirmed.current;
    confirmed.current = false;
    if (wasConfirmed || grant === null) {
      return heading;
    }
    return document.getElementById(revokeGrantButtonId(grant.clientId)) ?? heading;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent finalFocus={returnFocusTarget}>
        <RevokeGrantConfirmation
          name={grant?.name ?? ""}
          onConfirm={() => {
            confirmed.current = true;
            onOpenChange(false);
            onConfirm();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

/** El cuerpo de la confirmación, aparte para dibujarlo sin el portal del diálogo. */
export function RevokeGrantConfirmation({
  name,
  onConfirm,
}: {
  readonly name: string;
  readonly onConfirm: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{grantsLabels.revokeTitle(name)}</DialogTitle>
        <DialogDescription>{grantsLabels.revokeBody}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>
          {grantsLabels.cancel}
        </DialogClose>
        <Button variant="destructive" onClick={onConfirm}>
          {grantsLabels.revokeConfirm}
        </Button>
      </DialogFooter>
    </>
  );
}
