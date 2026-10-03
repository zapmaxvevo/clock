"use client";

import { useRef, useState, useTransition } from "react";

import {
  timeEntryMessages,
  type ActionResult,
  type TimeEntryErrorCode,
} from "@/modules/time-entry/schema";

export type EntryActionFailure = {
  readonly code: TimeEntryErrorCode;
  readonly message: string;
};

type Options<Input, Data> = {
  /**
   * Se aplica dentro de la transición, así la vista optimista vive hasta que
   * el servidor responde y revalida. Si la action falla, React la descarta y
   * la pantalla vuelve sola al estado anterior.
   */
  readonly optimistic?: (input: Input) => void;
  /** Corre dentro de la transición, con lo que se mandó y lo que contestó. */
  readonly onSuccess?: (data: Data, input: Input) => void;
  readonly onFailure?: (failure: EntryActionFailure) => void;
};

export type EntryActionHandle<Input> = {
  readonly pending: boolean;
  /** Mensaje y código del resultado tipado de la action. */
  readonly failure: EntryActionFailure | null;
  readonly run: (input: Input) => void;
  /** Reintento de TT-89. Solo tiene sentido con un error de red o inesperado. */
  readonly retry: () => void;
  /** Baja el aviso cuando el estado que describía ya no es el de la pantalla. */
  readonly clear: () => void;
};

/**
 * Envuelve una server action del módulo: una transición con vista optimista,
 * el mensaje del resultado tipado cuando falla y el reintento de TT-89.
 */
export function useEntryAction<Input, Data>(
  action: (input: Input) => Promise<ActionResult<Data>>,
  options: Options<Input, Data> = {},
): EntryActionHandle<Input> {
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<EntryActionFailure | null>(null);
  const lastInput = useRef<Input | null>(null);

  function fail(next: EntryActionFailure): void {
    setFailure(next);
    options.onFailure?.(next);
  }

  function run(input: Input): void {
    lastInput.current = input;
    setFailure(null);
    startTransition(async () => {
      options.optimistic?.(input);
      // Lo que se actualiza después del `await` va en su propia transición:
      // así entra en el mismo commit que descarta la vista optimista, y el
      // aviso de error no se ve junto a los valores que ya no valen.
      try {
        const result = await action(input);
        if (!result.ok) {
          const failure = { code: result.code, message: result.message };
          startTransition(() => fail(failure));
          return;
        }
        startTransition(() => options.onSuccess?.(result.data, input));
      } catch {
        // La action no llegó a responder: red caída o servidor inalcanzable.
        startTransition(() =>
          fail({ code: "unexpected", message: timeEntryMessages.unexpected }),
        );
      }
    });
  }

  function retry(): void {
    const input = lastInput.current;
    if (input === null) {
      return;
    }
    run(input);
  }

  function clear(): void {
    setFailure(null);
  }

  return { pending, failure, run, retry, clear };
}

/**
 * «Reintentar» solo se ofrece cuando repetir la operación puede cambiar el
 * desenlace: un error de red o inesperado (TT-89). Un `not_found` o un
 * `already_stopped` ya describen el estado real y no se reintentan.
 */
export function retryHandlerOf<Input>(
  handle: EntryActionHandle<Input>,
): (() => void) | undefined {
  return handle.failure?.code === "unexpected" ? handle.retry : undefined;
}
