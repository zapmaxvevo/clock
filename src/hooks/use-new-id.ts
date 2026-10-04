"use client";

import { useRef } from "react";

import type { ActionFailure } from "./use-action";

/**
 * ADR 0007: el id de un alta, elegido por el cliente. Con el aviso de falla
 * por red a la vista, el pedido anterior con la misma clave pudo haberse
 * aplicado, y repetirlo con su id no crea otra fila. Cualquier otro pedido
 * lleva un id nuevo. El id se pide en el manejador, antes de `run`, que baja
 * el aviso: el que se ve es el que dice si hay un pedido pendiente.
 *
 * La clave es fija por formulario de alta, como la de «Iniciar».
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
