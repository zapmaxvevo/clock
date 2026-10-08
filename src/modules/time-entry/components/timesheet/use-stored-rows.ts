"use client";

import { useMemo, useSyncExternalStore } from "react";

import { storedRowsFrom, storedRowsValue, type StoredRows } from "./stored-rows";

/** El cambio hecho en esta pestaña; `storage` trae el de las otras. */
const STORED_ROWS_CHANGE_EVENT = "clock:planilla-filas";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(STORED_ROWS_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(STORED_ROWS_CHANGE_EVENT, onChange);
  };
}

/** Con el almacenamiento del sitio bloqueado, no hay nada guardado. */
function readRaw(storageKey: string): string | null {
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

/** El servidor no ve nada de esto (TS-95): la hidratación suma las filas guardadas. */
function readServerRaw(): string | null {
  return null;
}

/**
 * Aplica `update` a lo guardado y lo escribe. Sin `localStorage` —modo privado
 * sin cuota, un error al escribir— no pasa nada: las filas agregadas viven
 * solo en la página, sin aviso (§5.7).
 */
export function updateStoredRows(
  storageKey: string,
  update: (rows: StoredRows) => StoredRows,
): void {
  const rows = storedRowsFrom(readRaw(storageKey));
  const next = update(rows);
  if (next === rows) {
    return;
  }
  try {
    window.localStorage.setItem(storageKey, storedRowsValue(next));
  } catch {
    return;
  }
  window.dispatchEvent(new Event(STORED_ROWS_CHANGE_EVENT));
}

/** Las filas vacías que guarda el navegador, por workspace y persona (TS-19, D13-7). */
export function useStoredRows(storageKey: string): StoredRows {
  // La instantánea es el texto, que se compara por valor: un objeto nuevo en
  // cada lectura haría que React volviera a dibujar sin fin.
  const raw = useSyncExternalStore(subscribe, () => readRaw(storageKey), readServerRaw);
  return useMemo(() => storedRowsFrom(raw), [raw]);
}
