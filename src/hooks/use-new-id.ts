"use client";

import { useRef } from "react";

import type { ActionFailure } from "./use-action";

/**
 * ADR 0007: el id de un alta, elegido por el cliente. `failure` es el último
 * desenlace vigente del alta: con una falla por red, el pedido anterior con la
 * misma clave pudo haberse aplicado, y repetirlo con su id no crea otra fila.
 * Cualquier otro pedido lleva un id nuevo. El id se pide en el manejador,
 * antes de `run`, que lo limpia.
 *
 * El desenlace vigente suele ser el aviso a la vista (`handle.failure`), y
 * entonces el id se renueva cuando el aviso baja. Quien necesita que el id
 * sobreviva al aviso pasa el desenlace que guarda aparte, como el alta del
 * calendario, que lo conserva al cerrar el diálogo.
 *
 * La clave es la entrada de la que parte el alta (continuar y duplicar) o una
 * fija para la que no parte de ninguna, como «Iniciar».
 */
export function useNewId(failure: ActionFailure | null): (key: string) => string {
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
