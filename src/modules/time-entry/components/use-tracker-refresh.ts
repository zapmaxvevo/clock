"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** P-11: cada cuánto se revalida la pantalla mientras está visible (TT-40). */
const REFRESH_INTERVAL_MS = 60_000;

/**
 * Mantiene la pantalla al día sin canal abierto: revalida al recuperar el foco
 * y cada 60 segundos mientras el documento está visible. Con la pestaña oculta
 * no pide nada; al volver, el evento de visibilidad la pone al día.
 */
export function useTrackerRefresh(): void {
  const router = useRouter();

  useEffect(() => {
    function refreshIfVisible(): void {
      if (document.visibilityState !== "visible") {
        return;
      }
      router.refresh();
    }

    const interval = window.setInterval(refreshIfVisible, REFRESH_INTERVAL_MS);
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [router]);
}
