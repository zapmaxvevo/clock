"use client";

import { useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { retryHandlerOf, useAction } from "@/hooks/use-action";
import { useNewId } from "@/hooks/use-new-id";
import type { PaletteKey } from "@/modules/project/palette";
import {
  projectMessages,
  type ClientView,
  type ProjectActions,
} from "@/modules/project/schema";

import { ColorField } from "./color-field";
import { CreateDialog } from "./create-dialog";
import { projectLabels } from "./labels";
import { useProjectNotices } from "./project-notices";

/** ADR 0007: la clave fija del alta de proyecto; también nombra su aviso. */
const NEW_ID_KEY = "project";

type ProjectDraft = {
  readonly name: string;
  readonly clientId: string | null;
  readonly color: PaletteKey | null;
  readonly note: string;
};

const emptyDraft: ProjectDraft = { name: "", clientId: null, color: null, note: "" };

type NewProjectDialogProps = {
  readonly createProject: ProjectActions["createProject"];
  /** Clientes activos, en orden alfabético. */
  readonly clients: readonly ClientView[];
};

/**
 * PR-12 … PR-17 y PR-30: el único lugar desde donde se crea un proyecto
 * (PR-04). Sin cliente es válido, también sin ningún cliente (PR-14, PR-86).
 */
export function NewProjectDialog({ createProject, clients }: NewProjectDialogProps) {
  const nameId = useId();
  const clientId = useId();
  const noteId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const { report } = useProjectNotices();

  const create = useAction(createProject, {
    unreachableMessage: projectMessages.unexpected,
    onFailure: (failure) =>
      report({
        key: NEW_ID_KEY,
        title: projectLabels.projectNotCreated,
        message: failure.message,
      }),
    onSuccess: () => {
      setDraft(emptyDraft);
      setOpen(false);
    },
  });
  const newId = useNewId(create.failure);

  const clientItems = [
    { value: null, label: projectLabels.noClient },
    ...clients.map((client) => ({ value: client.id, label: client.name })),
  ];

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
    <CreateDialog
      noticeKey={NEW_ID_KEY}
      title={projectLabels.newProject}
      open={open}
      onOpenChange={handleOpenChange}
      pending={create.pending}
      failure={create.failure}
      failureTitle={projectLabels.projectNotCreated}
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
        <Label htmlFor={clientId}>{projectLabels.client}</Label>
        <Select
          items={clientItems}
          value={draft.clientId}
          onValueChange={(next) => setDraft({ ...draft, clientId: next })}
        >
          <SelectTrigger id={clientId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {clientItems.map((item) => (
              <SelectItem key={item.value ?? ""} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ColorField
        value={draft.color}
        onValueChange={(color) => setDraft({ ...draft, color })}
      />
      <div className="grid gap-2">
        <Label htmlFor={noteId}>{projectLabels.note}</Label>
        <Textarea
          id={noteId}
          className="max-h-40"
          value={draft.note}
          onChange={(event) => setDraft({ ...draft, note: event.target.value })}
        />
      </div>
    </CreateDialog>
  );
}
