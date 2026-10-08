"use client";

import { useRef, type RefObject } from "react";

type DialogReturnFocusOptions = {
  /** Adónde vuelve el foco al cancelar: el control que abrió el diálogo. */
  readonly cancelFocus: RefObject<HTMLElement | null>;
  /**
   * Adónde va el foco cuando el diálogo se cierra por otra cosa —quien lo
   * abrió lo cerró— y al cancelar si el control ya no está: algo que sigue en
   * pantalla, como la región de acciones en masa.
   */
  readonly fallbackFocus: RefObject<HTMLElement | null>;
  /** Cancelar, Esc o un clic afuera. */
  readonly onCancel: () => void;
};

/**
 * El foco al cerrar un diálogo según cómo se cerró —las acciones en masa
 * (TT-63, TT-64), el de una entrada del calendario, «Quitar fila» y la lista
 * del detalle de la planilla—: `onOpenChange` y `finalFocus` para el `Dialog`
 * y su contenido.
 *
 * El foco lo mueve el diálogo y no Base UI, que pasa al primer control
 * tabulable de lo que se le devuelve: con una región, que no es tabulable,
 * caería en su primer control. Va en una microtarea, como el de Base UI,
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
