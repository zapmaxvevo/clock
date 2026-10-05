"use client";

import { useId, useOptimistic, useRef, useState } from "react";

import { ActionFeedback } from "@/components/action-feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { retryHandlerOf, useAction } from "@/hooks/use-action";
import { NAME_MAX, profileMessages, type ProfileActions } from "@/modules/profile/schema";

import { failureTitles, profileLabels } from "./labels";

type NameFieldProps = {
  readonly updateName: ProfileActions["updateName"];
  /** El nombre resuelto de la vista: el editado o el de Google. */
  readonly value: string;
  /** Sin permiso el nombre se ve y no se cambia (PF-46). */
  readonly canEdit: boolean;
};

/**
 * El nombre editable (PF-07, PF-32): guarda al salir o con Enter si el texto
 * recortado no es el guardado, y Esc descarta lo escrito sin pedido.
 *
 * Mientras se escribe, lo tecleado vive en `draft` y una revalidación ajena no
 * lo pisa. La respuesta del pedido propio sí: deja el guardado aunque el campo
 * tenga foco, el recortado si salió bien y el anterior si falló, al que vuelve
 * sola la vista optimista.
 *
 * Nunca usa `disabled`, por lo mismo que `PreferenceField`: sin permiso es
 * `readOnly` y el foco no se pierde.
 */
export function NameField({ updateName, value, canEdit }: NameFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [shown, show] = useOptimistic<string, string>(value, (_, next) => next);
  /** Lo tecleado desde el último guardado, o `null` si el campo sigue a la vista. */
  const [draft, setDraft] = useState<string | null>(null);
  const save = useAction(updateName, {
    unreachableMessage: profileMessages.unexpected,
    optimistic: (input) => show(input.name.trim()),
    onSuccess: () => setDraft(null),
    onFailure: () => setDraft(null),
  });

  function commit(): void {
    if (draft === null) {
      return;
    }
    setDraft(null);
    if (!canEdit || draft.trim() === shown) {
      return;
    }
    save.run({ name: draft });
  }

  const retry = retryHandlerOf(save);
  const onRetry =
    retry === undefined
      ? undefined
      : () => {
          // «Reintentar» se va con su aviso: el foco pasa antes al campo.
          inputRef.current?.focus();
          retry();
        };

  return (
    <div className="grid gap-2">
      <Label htmlFor={inputId}>{profileLabels.name}</Label>
      <Input
        ref={inputRef}
        id={inputId}
        type="text"
        value={draft ?? shown}
        readOnly={!canEdit}
        autoComplete="name"
        // PF-35: el campo corta en el mismo largo que valida el esquema.
        maxLength={NAME_MAX}
        className="h-9 w-full sm:w-80"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
            return;
          }
          if (event.key === "Escape" && draft !== null) {
            event.preventDefault();
            setDraft(null);
          }
        }}
      />
      {save.failure !== null && (
        <ActionFeedback
          title={failureTitles.name}
          message={save.failure.message}
          onRetry={onRetry}
        />
      )}
    </div>
  );
}
