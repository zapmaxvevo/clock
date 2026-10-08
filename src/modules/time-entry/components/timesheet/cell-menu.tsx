"use client";

import { EllipsisVerticalIcon, PencilIcon, ListIcon, Trash2Icon } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { trackerLabels } from "../labels";
import { cellActionsLabel, timesheetLabels } from "./labels";
import type { GridCell } from "./timesheet-model";

/** Lo que se elige en el menú de una celda (D13b-6). */
export type CellMenuChoice = "edit" | "delete" | "detail";

type CellMenuProps = {
  readonly cell: GridCell;
  /** El disparador va con la elección: adonde vuelve el foco al cancelar el diálogo. */
  readonly onChoose: (choice: CellMenuChoice, trigger: HTMLElement) => void;
};

/**
 * TS-40: el menú de tres puntos de una celda con entradas en la foto. Con una
 * entrada, «Editar» y «Borrar»; con varias, «Ver detalle» (P-14). Mientras la
 * celda tiene algo que la foto no trae no abre, pero el disparador no se
 * deshabilita: un botón deshabilitado con el foco lo perdería a `body`.
 */
export function CellMenu({ cell, onChoose }: CellMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  /**
   * Elegir una opción abre un diálogo, que toma el foco: el menú no se lo
   * devuelve al disparador al cerrarse (como `EntryMenu`).
   */
  const chosen = useRef(false);

  function choose(choice: CellMenuChoice): void {
    const trigger = triggerRef.current;
    if (trigger === null) {
      return;
    }
    chosen.current = true;
    onChoose(choice, trigger);
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        if (next) {
          chosen.current = false;
        }
        setOpen(next && !cell.pending);
      }}
    >
      <DropdownMenuTrigger
        render={
          <Button
            ref={triggerRef}
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-1/2 right-0.5 -translate-y-1/2"
            aria-disabled={cell.pending || undefined}
          />
        }
        aria-label={cellActionsLabel(cell.name)}
      >
        <EllipsisVerticalIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-auto min-w-40"
        finalFocus={() => !chosen.current}
      >
        {cell.entries.length === 1 ? (
          <>
            <DropdownMenuItem disabled={cell.pending} onClick={() => choose("edit")}>
              <PencilIcon aria-hidden="true" />
              {timesheetLabels.editEntry}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={cell.pending}
              onClick={() => choose("delete")}
            >
              <Trash2Icon aria-hidden="true" />
              {trackerLabels.delete}
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem disabled={cell.pending} onClick={() => choose("detail")}>
            <ListIcon aria-hidden="true" />
            {timesheetLabels.showDetail}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
