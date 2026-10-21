"use client";

import { useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { retryHandlerOf, useAction } from "@/hooks/use-action";
import { useNewId } from "@/hooks/use-new-id";
import { projectMessages, type ProjectActions } from "@/modules/project/schema";

import { FormDialog } from "./form-dialog";
import { clientCreatedLabel, projectLabels } from "./labels";
import { useProjectNotices } from "./project-notices";

/** ADR 0007: la clave fija del alta de cliente; también nombra su aviso. */
const NEW_ID_KEY = "client";

const emptyDraft = { name: "", address: "", note: "" };

type NewClientDialogProps = {
  readonly createClient: ProjectActions["createClient"];
};

/** PR-01 … PR-03: el único lugar desde donde se crea un cliente (PR-04). */
export function NewClientDialog({ createClient }: NewClientDialogProps) {
  const nameId = useId();
  const addressId = useId();
  const noteId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [announcement, setAnnouncement] = useState("");
  const { report } = useProjectNotices();

  const create = useAction(createClient, {
    unreachableMessage: projectMessages.unexpected,
    onFailure: (failure) =>
      report({
        key: NEW_ID_KEY,
        title: projectLabels.clientNotCreated,
        message: failure.message,
      }),
    onSuccess: (data) => {
      setAnnouncement(clientCreatedLabel(data.client.name));
      setDraft(emptyDraft);
      setOpen(false);
    },
  });
  const newId = useNewId(create.failure);

  function handleOpenChange(next: boolean): void {
    // Cerrar baja el aviso, y con él el id pendiente: el próximo alta es otro.
    create.clear();
    setDraft(emptyDraft);
    setOpen(next);
  }

  function handleSave(): void {
    create.run({ id: newId(NEW_ID_KEY), ...draft });
  }

  return (
    <>
      <FormDialog
        noticeKey={NEW_ID_KEY}
        title={projectLabels.newClient}
        triggerVariant="outline"
        open={open}
        onOpenChange={handleOpenChange}
        pending={create.pending}
        failure={create.failure}
        failureTitle={projectLabels.clientNotCreated}
        onRetry={retryHandlerOf(create)}
        onSave={handleSave}
      >
        <div className="grid gap-2">
          <Label htmlFor={nameId}>{projectLabels.name}</Label>
          <Input
            id={nameId}
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            autoComplete="off"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={addressId}>{projectLabels.address}</Label>
          <Textarea
            id={addressId}
            className="max-h-40"
            value={draft.address}
            onChange={(event) => setDraft({ ...draft, address: event.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={noteId}>{projectLabels.note}</Label>
          <Textarea
            id={noteId}
            className="max-h-40"
            value={draft.note}
            onChange={(event) => setDraft({ ...draft, note: event.target.value })}
          />
        </div>
      </FormDialog>
      {/*
        PR-62: un cliente sin proyectos no aparece en la lista; el alta se
        confirma acá, fuera del diálogo, para que sobreviva a su cierre. Va en
        su propia línea, después de los botones de la cabecera.
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
