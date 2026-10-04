"use client";

import { useRef, useState, useTransition } from "react";

import type { ActionResult } from "@/server/action";

export type ActionFailure<Code extends string = string> = {
  readonly code: Code;
  readonly message: string;
};

type Options<Input, Data, Code extends string> = {
  /**
   * El texto de `unexpected` del módulo, para cuando la action no llega a
   * responder: red caída o servidor inalcanzable.
   */
  readonly unreachableMessage: string;
  /**
   * Se aplica dentro de la transición, así la vista optimista vive hasta que
   * el servidor responde y revalida. Si la action falla, React la descarta y
   * la pantalla vuelve sola al estado anterior.
   */
  readonly optimistic?: (input: Input) => void;
  /** Corre dentro de la transición, con lo que se mandó y lo que contestó. */
  readonly onSuccess?: (data: Data, input: Input) => void;
  readonly onFailure?: (failure: ActionFailure<Code | "unexpected">) => void;
};

export type ActionHandle<Input, Code extends string = string> = {
  readonly pending: boolean;
  /** Mensaje y código del resultado tipado de la action. */
  readonly failure: ActionFailure<Code> | null;
  readonly run: (input: Input) => void;
  /** Reintento de TT-89: reenvía el último pedido entero, con el mismo id. */
  readonly retry: () => void;
  /** Baja el aviso cuando el estado que describía ya no es el de la pantalla. */
  readonly clear: () => void;
};

/**
 * Envuelve una server action: una transición con vista optimista, el mensaje
 * del resultado tipado cuando falla y el reintento de TT-89.
 */
export function useAction<Input, Data, Code extends string>(
  action: (input: Input) => Promise<ActionResult<Data, Code>>,
  options: Options<Input, Data, Code>,
): ActionHandle<Input, Code | "unexpected"> {
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<ActionFailure<Code | "unexpected"> | null>(null);
  const lastInput = useRef<Input | null>(null);

  function fail(next: ActionFailure<Code | "unexpected">): void {
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
        startTransition(() =>
          fail({ code: "unexpected", message: options.unreachableMessage }),
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
 * `validation` ya describen el estado real y no se reintentan.
 */
export function retryHandlerOf<Input>(
  handle: ActionHandle<Input>,
): (() => void) | undefined {
  return handle.failure?.code === "unexpected" ? handle.retry : undefined;
}
