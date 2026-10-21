"use client";

import { useState } from "react";

import { retryHandlerOf, useAction } from "@/hooks/use-action";
import { useNewId } from "@/hooks/use-new-id";
import {
  projectMessages,
  type ClientView,
  type ProjectActions,
} from "@/modules/project/schema";

import { CreateDialog } from "./create-dialog";
import { projectLabels } from "./labels";
import { emptyProjectDraft, ProjectFields } from "./project-fields";
import { useProjectNotices } from "./project-notices";

/** ADR 0007: la clave fija del alta de proyecto; también nombra su aviso. */
const NEW_ID_KEY = "project";

const emptyDraft = emptyProjectDraft();

type NewProjectDialogProps = {
  readonly createProject: ProjectActions["createProject"];
  /** Clientes activos, en orden alfabético. */
  readonly clients: readonly ClientView[];
};

/**
 * PR-12 … PR-17, PR-21 y PR-30: el único lugar desde donde se crea un
 * proyecto (PR-04). Sin cliente es válido, también sin ningún cliente (PR-14,
 * PR-86).
 */
export function NewProjectDialog({ createProject, clients }: NewProjectDialogProps) {
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
      <ProjectFields draft={draft} onChange={setDraft} clients={clients} mode="create" />
    </CreateDialog>
  );
}
