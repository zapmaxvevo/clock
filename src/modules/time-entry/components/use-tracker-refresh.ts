"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { nextRefreshGate, type RefreshEvent, type RefreshGate } from "./refresh-gate";

/** P-11: cada cuánto se revalida la pantalla mientras está visible (TT-40). */
const REFRESH_INTERVAL_MS = 60_000;

/**
 * Mantiene la pantalla al día sin canal abierto: revalida al recuperar el foco
 * y cada 60 segundos mientras el documento está visible. Con la pestaña oculta
 * no pide nada; al volver, el evento de visibilidad la pone al día.
 *
 * Con `paused`, los disparos se juntan en uno que sale al soltarlo (CAL-89):
 * el calendario no revalida en medio de un gesto. Sin argumento, nunca pausa.
 */
export function useTrackerRefresh(paused = false): void {
  const router = useRouter();
  const gate = useRef<RefreshGate>({ paused: false, pending: false });

  useEffect(() => {
    function pass(event: RefreshEvent): void {
      const next = nextRefreshGate(gate.current, event);
      gate.current = next.gate;
      if (next.refresh) {
        router.refresh();
      }
    }

    function refreshIfVisible(): void {
      // Antes de la compuerta: un disparo con la pestaña oculta no queda pendiente.
      if (document.visibilityState !== "visible") {
        return;
      }
      pass("trigger");
    }

    pass(paused ? "pause" : "resume");
    const interval = window.setInterval(refreshIfVisible, REFRESH_INTERVAL_MS);
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [router, paused]);
}
