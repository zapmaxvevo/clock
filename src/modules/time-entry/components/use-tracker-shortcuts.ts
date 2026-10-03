"use client";

import { useEffect, useEffectEvent, useSyncExternalStore } from "react";

import {
  SHORTCUTS_CHANGE_EVENT,
  SHORTCUTS_STORAGE_KEY,
  shortcutOf,
  shortcutsEnabledFrom,
  storedShortcutsValue,
  type TrackerShortcut,
} from "./tracker-shortcuts";

/**
 * `storage` trae el cambio hecho en otra pestaña; el evento propio, el de esta.
 * Cada componente se suscribe por su cuenta y el evento los mantiene de
 * acuerdo, así que no hace falta un valor guardado a nivel de módulo.
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(SHORTCUTS_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SHORTCUTS_CHANGE_EVENT, onChange);
  };
}

/** Con el almacenamiento del sitio bloqueado, vale la preferencia de omisión. */
function readEnabled(): boolean {
  try {
    return shortcutsEnabledFrom(window.localStorage.getItem(SHORTCUTS_STORAGE_KEY));
  } catch {
    return true;
  }
}

/**
 * El servidor no conoce la preferencia: el HTML llega con los atajos activos
 * y la hidratación los apaga si corresponde.
 */
function readServerEnabled(): boolean {
  return true;
}

function writeEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(SHORTCUTS_STORAGE_KEY, storedShortcutsValue(enabled));
  } catch {
    // Si no se pudo guardar, la lectura sigue dando lo que había: no hay
    // cambio que anunciar.
    return;
  }
  window.dispatchEvent(new Event(SHORTCUTS_CHANGE_EVENT));
}

/** TT-26 y WCAG 2.1.4: el interruptor de los atajos de una tecla, por navegador. */
export function useShortcutsEnabled(): readonly [boolean, (enabled: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, readEnabled, readServerEnabled);
  return [enabled, writeEnabled] as const;
}

/**
 * El manejador de cada atajo, o `undefined` cuando su control no está o está
 * inactivo: así el atajo hace exactamente lo que haría el control, y nada si
 * no se puede usar.
 */
export type ShortcutHandlers = Partial<Record<TrackerShortcut, (() => void) | undefined>>;

/**
 * Atiende los atajos de `handlers` mientras el interruptor los deja activos.
 * Devuelve si lo están, para los `aria-keyshortcuts` de los controles.
 */
export function useTrackerShortcuts(handlers: ShortcutHandlers): boolean {
  const [enabled] = useShortcutsEnabled();

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (!enabled) {
      return;
    }
    const shortcut = shortcutOf(event);
    const handler = shortcut === null ? undefined : handlers[shortcut];
    if (handler === undefined) {
      return;
    }
    event.preventDefault();
    handler();
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => handleKeyDown(event);
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);

  return enabled;
}
