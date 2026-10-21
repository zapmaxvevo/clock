"use client";

import { PencilIcon } from "lucide-react";
import { useState } from "react";

import { retryHandlerOf, useAction } from "@/hooks/use-action";
import { changedProjectFields } from "@/modules/project/changes";
import {
  projectMessages,
  type ClientView,
  type ProjectActions,
  type ProjectSettings,
} from "@/modules/project/schema";

import { CreateDialog } from "./create-dialog";
import { editProjectLabel, projectLabels } from "./labels";
import { ProjectFields, type ProjectDraft } from "./project-fields";
import { useProjectNotices } from "./project-notices";

function draftOf(settings: ProjectSettings): ProjectDraft {
  return {
    name: settings.name,
    clientId: settings.clientId,
    color: settings.color,
    note: settings.note,
    billableByDefault: settings.billableByDefault,
  };
}

type EditProjectDialogProps = {
  readonly updateProject: ProjectActions["updateProject"];
  /** Lo guardado, de la fila de este render (D-P1-6). */
  readonly settings: ProjectSettings;
  /** Los activos, en orden alfabético. */
  readonly clients: readonly ClientView[];
  /** El cliente del proyecto si está archivado: lo conserva (PR-98). */
  readonly archivedClient: ClientView | null;
  /** Con el éxito, el proyecto como quedó. */
  readonly onSaved: (project: ProjectSettings) => void;
};

/**
 * D-P1-8: la edición de un proyecto desde su fila (PR-12, PR-15, PR-21,
 * PR-30). «Guardar» manda solo lo que cambió (D-P1-3), y sin cambios cierra
 * sin mandar.
 */
export function EditProjectDialog({
  updateProject,
  settings,
  clients,
  archivedClient,
  onSaved,
}: EditProjectDialogProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => draftOf(settings));
  const { report } = useProjectNotices();
  // Hay un diálogo de edición por proyecto: el aviso se nombra con el proyecto.
  const noticeKey = `edit:${settings.id}`;

  const update = useAction(updateProject, {
    unreachableMessage: projectMessages.unexpected,
    onFailure: (failure) =>
      report({
        key: noticeKey,
        title: projectLabels.projectNotSaved,
        message: failure.message,
      }),
    onSuccess: (data) => {
      setOpen(false);
      onSaved(data.project);
    },
  });

  function handleOpenChange(next: boolean): void {
    update.clear();
    // Abrir arma el borrador con la fila de ahora: lo que otra persona cambió
    // y ya llegó con una revalidación se ve.
    if (next) {
      setDraft(draftOf(settings));
    }
    setOpen(next);
  }

  function handleSave(): void {
    // El servidor recorta el nombre y la nota: lo que solo difiere en
    // espacios no es un cambio.
    const changes = changedProjectFields(settings, {
      id: settings.id,
      name: draft.name.trim(),
      clientId: draft.clientId,
      color: draft.color ?? undefined,
      note: draft.note.trim(),
      billableByDefault: draft.billableByDefault,
    });
    if (Object.keys(changes).length === 0) {
      handleOpenChange(false);
      return;
    }
    update.run({ id: settings.id, ...changes });
  }

  return (
    <CreateDialog
      noticeKey={noticeKey}
      title={projectLabels.editProject}
      triggerLabel={projectLabels.edit}
      triggerName={editProjectLabel(settings.name)}
      triggerIcon={<PencilIcon aria-hidden="true" />}
      triggerVariant="ghost"
      description={settings.name}
      open={open}
      onOpenChange={handleOpenChange}
      pending={update.pending}
      failure={update.failure}
      failureTitle={projectLabels.projectNotSaved}
      onRetry={retryHandlerOf(update)}
      onSave={handleSave}
    >
      <ProjectFields
        draft={draft}
        onChange={setDraft}
        clients={clients}
        mode="update"
        archivedClient={archivedClient}
      />
    </CreateDialog>
  );
}
