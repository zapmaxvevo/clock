"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

import { reachFloor, weekToReach } from "./entry-week";

/**
 * P-15: aplica `weekToReach` y, si da una semana, reemplaza la URL por una
 * con ese `desde` (ADR 0008). La revalidación de la action y esta navegación
 * dibujan la ventana extendida, con la entrada en su día. Sin desplazamiento:
 * a la entrada se llega bajando, como en Clockify.
 *
 * Compara contra el `reachFrom` del último render y no contra el del render
 * en que arrancó la mutación, y recuerda la semana pedida hasta que llega en
 * los props: así dos mutaciones en vuelo nunca achican la ventana.
 */
export function useReachWeek(reachFrom: string): (weekStarts: readonly string[]) => void {
  const router = useRouter();
  const latestReachFrom = useRef(reachFrom);
  /** La semana pedida con `router.replace` que todavía no llegó en los props. */
  const requested = useRef<string | null>(null);

  useEffect(() => {
    latestReachFrom.current = reachFrom;
    if (
      requested.current !== null &&
      reachFloor(reachFrom, requested.current) === reachFrom
    ) {
      requested.current = null;
    }
  }, [reachFrom]);

  return useCallback(
    (weekStarts) => {
      const floor = reachFloor(latestReachFrom.current, requested.current);
      const week = weekToReach(floor, weekStarts);
      if (week !== null) {
        requested.current = week;
        router.replace(`/?desde=${week}`, { scroll: false });
      }
    },
    [router],
  );
}
