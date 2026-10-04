"use client";

import { PlusIcon } from "lucide-react";
import { useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { retryHandlerOf, useAction } from "@/hooks/use-action";
import { useNewId } from "@/hooks/use-new-id";
import { projectMessages, type ProjectActions } from "@/modules/project/schema";

import { CreateDialog } from "./create-dialog";
import { newTaskLabel, projectLabels } from "./labels";
import { useProjectNotices } from "./project-notices";

/** ADR 0007: la clave fija del alta de tarea; cada proyecto tiene su diálogo. */
const NEW_ID_KEY = "task";

type NewTaskDialogProps = {
  readonly createTask: ProjectActions["createTask"];
  readonly projectId: string;
  readonly projectName: string;
};

/** PR-35 y PR-36: la tarea se crea dentro de su proyecto, que viene fijo. */
export function NewTaskDialog({
  createTask,
  projectId,
  projectName,
}: NewTaskDialogProps) {
  const nameId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const { report } = useProjectNotices();
  // Hay un diálogo de tarea por proyecto: el aviso se nombra con el proyecto.
  const noticeKey = `task:${projectId}`;

  const create = useAction(createTask, {
    unreachableMessage: projectMessages.unexpected,
    onFailure: (failure) =>
      report({
        key: noticeKey,
        title: projectLabels.taskNotCreated,
        message: failure.message,
      }),
    onSuccess: () => {
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
    create.run({ id: newId(NEW_ID_KEY), projectId, name });
  }

  return (
    <CreateDialog
      noticeKey={noticeKey}
      title={projectLabels.newTask}
      triggerName={newTaskLabel(projectName)}
      triggerIcon={<PlusIcon aria-hidden="true" />}
      triggerVariant="ghost"
      description={projectName}
      open={open}
      onOpenChange={handleOpenChange}
      pending={create.pending}
      failure={create.failure}
      failureTitle={projectLabels.taskNotCreated}
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
    </CreateDialog>
  );
}
