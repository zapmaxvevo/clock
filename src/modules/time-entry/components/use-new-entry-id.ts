"use client";

import { useRef } from "react";

import type { EntryActionFailure } from "./use-entry-action";

/**
 * ADR 0007: el id de un alta, elegido por el cliente. Con el aviso de falla
 * por red a la vista, el pedido anterior con la misma clave pudo haberse
 * aplicado, y repetirlo con su id no crea otra fila. Cualquier otro pedido
 * lleva un id nuevo. El id se pide en el manejador del clic o del atajo, antes
 * de bajar los avisos: el que se ve es el que dice si hay un pedido pendiente.
 *
 * La clave es la entrada de la que parte el alta —continuar y duplicar— o una
 * fija para la que no parte de ninguna, como «Iniciar».
 */
export function useNewEntryId(
  failure: EntryActionFailure | null,
): (key: string) => string {
  const last = useRef<{ readonly key: string; readonly id: string } | null>(null);
  return (key) => {
    const pending =
      failure?.code === "unexpected" && last.current?.key === key
        ? last.current.id
        : null;
    const id = pending ?? crypto.randomUUID();
    last.current = { key, id };
    return id;
  };
}
