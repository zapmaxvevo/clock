"use client";

import { useState } from "react";

import { retryHandlerOf, useAction } from "@/hooks/use-action";
import { useNewId } from "@/hooks/use-new-id";
import { projectMessages, type ProjectRef } from "@/modules/project/schema";

import { CreateDialogFrame } from "./create-dialog";
import { projectLabels } from "./labels";
import { emptyProjectDraft, ProjectFields } from "./project-fields";
import { useCreateProjectAction, useTrackingCatalog } from "./tracking-catalog";

/** ADR 0007: la clave fija del alta desde el selector. */
const NEW_ID_KEY = "project";

type NewProjectFromPickerProps = {
  /** La búsqueda recortada del selector, con la que arranca el nombre. */
  readonly name: string;
  /** El disparador del selector, adonde vuelve el foco al cerrarse. */
  readonly finalFocus: () => HTMLElement | null;
  /** Con el éxito, el proyecto creado; el selector lo elige cuando el catálogo lo trae. */
  readonly onCreated: (project: ProjectRef) => void;
  /** Terminó de cerrarse: quien lo montó lo desmonta. */
  readonly onClosed: () => void;
};

/**
 * TT-09, D-P1-10: «Nuevo proyecto» desde el selector, montado cuando se pide
 * y abierto desde el primer render. Sin `ProjectNoticesProvider`: el aviso
 * vive en el diálogo. Dentro del diálogo del calendario o de la edición
 * masiva queda anidado, y `Escape` cierra solo este.
 */
export function NewProjectFromPicker({
  name,
  finalFocus,
  onCreated,
  onClosed,
}: NewProjectFromPickerProps) {
  const { clients } = useTrackingCatalog();
  const createProject = useCreateProjectAction();
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState(() => emptyProjectDraft(name));

  const create = useAction(createProject, {
    unreachableMessage: projectMessages.unexpected,
    onSuccess: (data) => {
      onCreated(data.project);
      setOpen(false);
    },
  });
  const newId = useNewId(create.failure);

  function handleSave(): void {
    create.run({ id: newId(NEW_ID_KEY), ...draft });
  }

  return (
    <CreateDialogFrame
      title={projectLabels.newProject}
      open={open}
      onOpenChange={setOpen}
      finalFocus={finalFocus}
      onClosed={onClosed}
      pending={create.pending}
      failure={create.failure}
      failureTitle={projectLabels.projectNotCreated}
      onRetry={retryHandlerOf(create)}
      onSave={handleSave}
    >
      <ProjectFields draft={draft} onChange={setDraft} clients={clients} mode="create" />
    </CreateDialogFrame>
  );
}
