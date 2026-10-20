"use client";

import { useId, useOptimistic, useRef, useState } from "react";

import { ActionFeedback } from "@/components/action-feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { retryHandlerOf, useAction } from "@/hooks/use-action";
import type { ActionResult } from "@/server/action";

type NameFieldProps = {
  /** La action del módulo: recibe y devuelve el nombre recortado. */
  readonly save: (input: {
    readonly name: string;
  }) => Promise<ActionResult<{ readonly name: string }, string>>;
  /** El nombre guardado, de la vista. */
  readonly value: string;
  readonly label: string;
  /** El largo del esquema del módulo: el campo corta en el mismo. */
  readonly maxLength: number;
  readonly autoComplete: string;
  /** TT-90: el título del aviso nombra lo que no se cambió. */
  readonly failureTitle: string;
  /** El `unexpected` del módulo, para cuando la action no llega a responder. */
  readonly unreachableMessage: string;
  /** Sin permiso se ve y no se cambia, con `readOnly` (PF-46). Por omisión, falso. */
  readonly readOnly?: boolean;
};

/**
 * Un nombre editable, el de una persona (PF-07, PF-32) o el del workspace
 * (WS-04): guarda al salir o con Enter si el texto recortado no es el
 * guardado, y Esc descarta lo escrito sin pedido.
 *
 * Mientras se escribe, lo tecleado vive en `draft` y ninguna revalidación lo
 * pisa. Guardar vacía el borrador, así que el campo pasa a la vista: la
 * respuesta deja el guardado aunque el campo tenga foco, el recortado si salió
 * bien y el anterior si falló, al que vuelve sola la vista optimista. Lo que
 * se teclee con el pedido en vuelo es un borrador nuevo y sobrevive.
 *
 * Nunca usa `disabled`, por lo mismo que `PreferenceField`: sin permiso es
 * `readOnly` y el foco no se pierde.
 */
export function NameField({
  save,
  value,
  label,
  maxLength,
  autoComplete,
  failureTitle,
  unreachableMessage,
  readOnly = false,
}: NameFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [shown, show] = useOptimistic<string, string>(value, (_, next) => next);
  /** Lo tecleado desde el último guardado, o `null` si el campo sigue a la vista. */
  const [draft, setDraft] = useState<string | null>(null);
  const saving = useAction(save, {
    unreachableMessage,
    optimistic: (input) => show(input.name.trim()),
  });

  function commit(): void {
    if (draft === null) {
      return;
    }
    setDraft(null);
    if (readOnly || draft.trim() === shown) {
      return;
    }
    saving.run({ name: draft });
  }

  const retry = retryHandlerOf(saving);
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
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        ref={inputRef}
        id={inputId}
        type="text"
        value={draft ?? shown}
        readOnly={readOnly}
        autoComplete={autoComplete}
        // PF-35, WS-54: el campo corta en el mismo largo que valida el esquema.
        maxLength={maxLength}
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
      {saving.failure !== null && (
        <ActionFeedback
          title={failureTitle}
          message={saving.failure.message}
          onRetry={onRetry}
        />
      )}
    </div>
  );
}
