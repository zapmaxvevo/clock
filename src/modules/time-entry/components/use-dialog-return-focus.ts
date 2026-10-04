"use client";

import { useRef, type RefObject } from "react";

type DialogReturnFocusOptions = {
  /** Adónde vuelve el foco al cancelar: el botón de la barra que abrió el diálogo. */
  readonly cancelFocus: RefObject<HTMLElement | null>;
  /**
   * Adónde va el foco cuando el diálogo se cierra por otra cosa —quien lo
   * abrió lo cerró— y al cancelar si el botón ya no está: la región de
   * acciones en masa, que sigue en pantalla.
   */
  readonly fallbackFocus: RefObject<HTMLElement | null>;
  /** Cancelar, Esc o un clic afuera. */
  readonly onCancel: () => void;
};

/**
 * El foco al cerrar un diálogo de las acciones en masa (TT-63, TT-64):
 * `onOpenChange` y `finalFocus` para el `Dialog` y su contenido.
 *
 * El foco lo mueve el diálogo y no Base UI, que pasa al primer control
 * tabulable de lo que se le devuelve: con la región, que no es tabulable,
 * caería en «Editar» de la barra. Va en una microtarea, como el de Base UI,
 * cuando lo de afuera del modal ya dejó de estar inerte.
 */
export function useDialogReturnFocus({
  cancelFocus,
  fallbackFocus,
  onCancel,
}: DialogReturnFocusOptions) {
  /** Cómo se cerró: cancelado vuelve a `cancelFocus`; si no, a `fallbackFocus`. */
  const cancelled = useRef(false);

  function onOpenChange(next: boolean): void {
    if (next) {
      return;
    }
    cancelled.current = true;
    onCancel();
  }

  function finalFocus(): false {
    const target = cancelled.current
      ? (cancelFocus.current ?? fallbackFocus.current)
      : fallbackFocus.current;
    cancelled.current = false;
    queueMicrotask(() => target?.focus());
    return false;
  }

  return { onOpenChange, finalFocus };
}
