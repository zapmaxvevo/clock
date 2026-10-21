"use client";

import { useId } from "react";

import { Checkbox } from "@/components/ui/checkbox";
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
import type { PaletteKey } from "@/modules/project/palette";
import type { ClientView } from "@/modules/project/schema";

import { ColorField } from "./color-field";
import { archivedClientLabel, projectLabels } from "./labels";

/** Lo escrito en el formulario de un proyecto, en el alta y en la edición. */
export type ProjectDraft = {
  readonly name: string;
  readonly clientId: string | null;
  /** `null` solo en el alta: el servidor asigna uno (PR-15). */
  readonly color: PaletteKey | null;
  readonly note: string;
  /** PR-21: con qué facturable arrancan las entradas nuevas con este proyecto. */
  readonly billableByDefault: boolean;
};

/** El alta arranca vacía, o con el nombre que trae la búsqueda del selector (TT-09). */
export function emptyProjectDraft(name = ""): ProjectDraft {
  return { name, clientId: null, color: null, note: "", billableByDefault: false };
}

type ProjectFieldsProps = {
  readonly draft: ProjectDraft;
  readonly onChange: (draft: ProjectDraft) => void;
  /** Los activos, en orden alfabético. */
  readonly clients: readonly ClientView[];
  readonly mode: "create" | "update";
  /** D-P1-9: el cliente archivado que el proyecto conserva, solo en la edición. */
  readonly archivedClient?: ClientView | null;
};

/**
 * D-P1-9: los campos de un proyecto, los mismos en el alta de `/proyectos`, en
 * la del selector (TT-09) y en la edición. Sin cliente es válido, también sin
 * ningún cliente (PR-14, PR-86).
 */
export function ProjectFields({
  draft,
  onChange,
  clients,
  mode,
  archivedClient = null,
}: ProjectFieldsProps) {
  const nameId = useId();
  const clientId = useId();
  const noteId = useId();
  const billableId = useId();
  const billableHintId = useId();

  const clientItems = [
    { value: null, label: projectLabels.noClient },
    ...clients.map((client) => ({ value: client.id, label: client.name })),
    ...(mode === "update" && archivedClient !== null
      ? [{ value: archivedClient.id, label: archivedClientLabel(archivedClient.name) }]
      : []),
  ];

  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor={nameId}>{projectLabels.name}</Label>
        <Input
          id={nameId}
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          autoComplete="off"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={clientId}>{projectLabels.client}</Label>
        <Select
          items={clientItems}
          value={draft.clientId}
          onValueChange={(next) => onChange({ ...draft, clientId: next })}
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
        onValueChange={(color) => onChange({ ...draft, color })}
        hint={mode === "create" ? projectLabels.colorHint : undefined}
      />
      <div className="grid gap-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id={billableId}
            checked={draft.billableByDefault}
            onCheckedChange={(checked) =>
              onChange({ ...draft, billableByDefault: checked })
            }
            aria-describedby={billableHintId}
          />
          <Label htmlFor={billableId}>{projectLabels.billableByDefault}</Label>
        </div>
        <p id={billableHintId} className="text-muted-foreground text-xs">
          {projectLabels.billableByDefaultHint}
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={noteId}>{projectLabels.note}</Label>
        <Textarea
          id={noteId}
          className="max-h-40"
          value={draft.note}
          onChange={(event) => onChange({ ...draft, note: event.target.value })}
        />
      </div>
    </>
  );
}
