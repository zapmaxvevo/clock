"use client";

import { EllipsisVerticalIcon, Trash2Icon } from "lucide-react";
import { useEffect, useOptimistic, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { updateDescription } from "@/modules/time-entry/actions";
import type { TimeEntryView } from "@/modules/time-entry/schema";

import { DeleteEntryDialog } from "./delete-entry-dialog";
import { DescriptionField } from "./description-field";
import { trackerLabels } from "./labels";
import { TrackerFeedback } from "./tracker-feedback";
import { retryHandlerOf, useEntryAction } from "./use-entry-action";

type EntryRowProps = {
  readonly entry: TimeEntryView;
  /** Con la membresía desactivada la fila queda en solo lectura (TT-92). */
  readonly canTrack: boolean;
  /** El borrado lo resuelve el grupo, que también tiene que mover el total. */
  readonly onDelete: () => void;
};

export function EntryRow({ entry, canTrack, onDelete }: EntryRowProps) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [draft, setDraft] = useState(entry.description);
  const [description, showDescription] = useOptimistic(
    entry.description,
    (_current, next: string) => next,
  );

  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const descriptionRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

  const save = useEntryAction(updateDescription, {
    optimistic: (input) => showDescription(input.description),
  });

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
    save.run({ id: entry.id, description: next });
  }

  const entryName = description === "" ? trackerLabels.noDescription : description;

  return (
    <li
      aria-busy={save.pending}
      className={cn("border-b last:border-b-0", save.pending && "opacity-60")}
    >
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
                    disabled={save.pending}
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

      {save.failure !== null && (
        <div className="px-3 pb-2">
          <TrackerFeedback
            title={trackerLabels.descriptionNotSaved}
            message={save.failure.message}
            retryDisabled={save.pending}
            onRetry={retryHandlerOf(save)}
          />
        </div>
      )}
    </li>
  );
}
