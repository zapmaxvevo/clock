"use client";

import { useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { retryHandlerOf, useAction } from "@/hooks/use-action";
import { useNewId } from "@/hooks/use-new-id";
import { projectMessages, type ProjectActions } from "@/modules/project/schema";

import { FormDialog } from "./form-dialog";
import { projectLabels, tagCreatedLabel } from "./labels";
import { useProjectNotices } from "./project-notices";

/** ADR 0007: la clave fija del alta de etiqueta; también nombra su aviso. */
const NEW_ID_KEY = "tag";

type NewTagDialogProps = {
  readonly createTag: ProjectActions["createTag"];
};

/**
 * PR-42 … PR-44 y PR-112: el único lugar desde donde se crea una etiqueta en
 * la fase 1 (D-1; TT-13 la saca del selector).
 */
export function NewTagDialog({ createTag }: NewTagDialogProps) {
  const nameId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const { report } = useProjectNotices();

  const create = useAction(createTag, {
    unreachableMessage: projectMessages.unexpected,
    onFailure: (failure) =>
      report({
        key: NEW_ID_KEY,
        title: projectLabels.tagNotCreated,
        message: failure.message,
      }),
    onSuccess: (data) => {
      setAnnouncement(tagCreatedLabel(data.tag.name));
      setName("");
      setOpen(false);
    },
  });
  const newId = useNewId(create.failure);

  function handleOpenChange(next: boolean): void {
    // Cerrar baja el aviso, y con él el id pendiente: el próximo alta es otro.
    create.clear();
    setName("");
    setOpen(next);
  }

  function handleSave(): void {
    create.run({ id: newId(NEW_ID_KEY), name });
  }

  return (
    <>
      <FormDialog
        noticeKey={NEW_ID_KEY}
        title={projectLabels.newTag}
        triggerVariant="outline"
        open={open}
        onOpenChange={handleOpenChange}
        pending={create.pending}
        failure={create.failure}
        failureTitle={projectLabels.tagNotCreated}
        onRetry={retryHandlerOf(create)}
        onSave={handleSave}
      >
        <div className="grid gap-2">
          <Label htmlFor={nameId}>{projectLabels.name}</Label>
          <Input
            id={nameId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
          />
        </div>
      </FormDialog>
      {/*
        La lista ya muestra la etiqueta nueva; el anuncio la confirma fuera del
        diálogo, para que sobreviva a su cierre, como el de «Nuevo cliente».
      */}
      <p
        role="status"
        className="text-muted-foreground order-last basis-full text-right text-sm"
      >
        {announcement}
      </p>
    </>
  );
}
