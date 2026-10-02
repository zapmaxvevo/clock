"use client";

import { EllipsisVerticalIcon, Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { TimeEntryView } from "@/modules/time-entry/schema";

import { DeleteEntryDialog } from "./delete-entry-dialog";
import { DescriptionField } from "./description-field";
import { trackerLabels } from "./labels";

type EntryRowProps = {
  readonly entry: TimeEntryView;
  /** Descripción a mostrar: la optimista mientras la escritura está en vuelo. */
  readonly description: string;
  /** TT-55: con la escritura en vuelo la fila queda atenuada. */
  readonly busy: boolean;
  /** Con la membresía desactivada la fila queda en solo lectura (TT-92). */
  readonly canTrack: boolean;
  /**
   * Guardar y borrar los resuelve el grupo: mueven el total y, sobre todo,
   * sus avisos tienen que sobrevivir a que esta fila desaparezca.
   */
  readonly onSave: (description: string) => void;
  readonly onDelete: () => void;
};

export function EntryRow({
  entry,
  description,
  busy,
  canTrack,
  onSave,
  onDelete,
}: EntryRowProps) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [draft, setDraft] = useState(description);

  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const descriptionRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

  useEffect(() => {
    // Al cerrar la edición el input se va del árbol: el foco vuelve al botón
    // que lo reemplaza. La edición solo se cierra por una acción explícita,
    // así que enfocar nunca interrumpe a nadie.
    if (!editing && wasEditing.current) {
      descriptionRef.current?.focus();
    }
    wasEditing.current = editing;
  }, [editing]);

  function startEditing(): void {
    setDraft(description);
    setEditing(true);
  }

  function commit(next: string): void {
    setEditing(false);
    if (next === description) {
      return;
    }
    onSave(next);
  }

  const entryName = description === "" ? trackerLabels.noDescription : description;

  return (
    <li aria-busy={busy} className={cn("border-b last:border-b-0", busy && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
        <div className="min-w-0 flex-1 basis-64">
          {editing ? (
            <DescriptionField
              value={draft}
              onValueChange={setDraft}
              onCommit={commit}
              onCancel={() => setEditing(false)}
              label="Descripción de la entrada"
              placeholder={trackerLabels.noDescription}
              autoFocus
            />
          ) : (
            <button
              type="button"
              ref={descriptionRef}
              disabled={!canTrack}
              onClick={startEditing}
              className={cn(
                "focus-visible:ring-ring w-full truncate rounded-md px-1 py-1 text-left text-sm focus-visible:ring-3 focus-visible:outline-none",
                canTrack && "hover:bg-muted",
                description === "" && "text-muted-foreground italic",
              )}
            >
              {entryName}
              <span className="sr-only"> — editar la descripción</span>
            </button>
          )}
        </div>

        <span className="text-muted-foreground text-sm">{trackerLabels.noProject}</span>

        <span className="text-muted-foreground text-sm tabular-nums">
          {entry.startLabel} – {entry.endLabel}
          {entry.extraDays > 0 && (
            <sup className="ml-0.5">
              +{entry.extraDays}
              <span className="sr-only">
                {entry.extraDays === 1
                  ? " (termina un día después)"
                  : ` (termina ${entry.extraDays} días después)`}
              </span>
            </sup>
          )}
        </span>

        <span className="w-16 text-right text-sm font-medium tabular-nums">
          {entry.durationLabel}
        </span>

        {canTrack && (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    ref={menuTriggerRef}
                    variant="ghost"
                    size="icon-sm"
                    disabled={busy}
                  />
                }
                aria-label={`Acciones de la entrada «${entryName}»`}
              >
                <EllipsisVerticalIcon aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto min-w-40">
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setConfirmingDelete(true)}
                >
                  <Trash2Icon aria-hidden="true" />
                  Borrar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DeleteEntryDialog
              entry={entry}
              open={confirmingDelete}
              onOpenChange={setConfirmingDelete}
              onConfirm={onDelete}
              finalFocus={menuTriggerRef}
            />
          </>
        )}
      </div>
    </li>
  );
}
