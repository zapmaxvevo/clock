"use client";

import { useEffect, type RefObject } from "react";

import type { CalendarState, UpdateEntryTimesInput } from "@/modules/time-entry/schema";

import type { GesturePreview } from "./use-calendar-gesture";

/**
 * Nadie llevó el foco a otro lado: no hay foco, está en `body` o en la
 * región, o adentro del bloque de la entrada. Solo ahí un foco pendiente
 * puede tomarlo sin sacárselo a la persona.
 */
export function focusIsFree(
  active: Element | null,
  region: HTMLElement | null,
  entryId: string | null,
): boolean {
  return (
    active === null ||
    active === document.body ||
    active === region ||
    (entryId !== null && active.closest(`[data-entry-block="${entryId}"]`) !== null)
  );
}

type PendingBlockFocus = {
  readonly regionRef: RefObject<HTMLElement | null>;
  /** La entrada cuyo botón toma el foco cuando se dibuja. */
  readonly focusEntryId: string | null;
  /** Avisa que el pendiente se usó o se descartó. */
  readonly onEntryFocused: () => void;
  /** Lo que cambia el dibujo: un bloque que cambió de columna se vuelve a buscar. */
  readonly state: CalendarState;
  readonly movingTimes: UpdateEntryTimesInput | null;
  readonly preview: GesturePreview | null;
};

/**
 * §5.5 y §5.7: el bloque de la entrada editada, creada, detenida, copiada o
 * movida toma el foco cuando se dibuja —en este render o después de la
 * revalidación—, si el foco quedó libre. El diálogo que se cierra lo deja en
 * la región después de su animación, así que también se espera a que llegue.
 */
export function usePendingBlockFocus({
  regionRef,
  focusEntryId,
  onEntryFocused,
  state,
  movingTimes,
  preview,
}: PendingBlockFocus): void {
  useEffect(() => {
    const region = regionRef.current;
    if (focusEntryId === null || region === null) {
      return;
    }
    const scope: HTMLElement = region;
    /**
     * Apretar adentro de la región es hacer otra cosa: el pendiente se
     * descarta. Va antes del foco que el mismo clic le da a la región, que si
     * no llevaría al bloque y desplazaría la grilla bajo el puntero.
     */
    let abandoned = false;
    function abandon(): void {
      abandoned = true;
      onEntryFocused();
    }
    function focusBlock(): void {
      if (abandoned || !focusIsFree(document.activeElement, scope, focusEntryId)) {
        return;
      }
      const button = scope.querySelector<HTMLButtonElement>(
        `button[data-entry-block="${focusEntryId}"]`,
      );
      if (button === null) {
        return;
      }
      // Con el foco ya en el botón no queda nada pendiente: un foco posterior
      // en la región no lo vuelve a llevar ahí.
      if (document.activeElement !== button) {
        button.focus();
      }
      onEntryFocused();
    }
    focusBlock();
    scope.addEventListener("focus", focusBlock);
    scope.addEventListener("pointerdown", abandon, true);
    return () => {
      scope.removeEventListener("focus", focusBlock);
      scope.removeEventListener("pointerdown", abandon, true);
    };
  }, [focusEntryId, onEntryFocused, regionRef, state, movingTimes, preview]);
}
