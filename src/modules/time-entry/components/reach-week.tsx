"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import { reachArrived, reachFloor, weekToReach } from "./entry-week";

type ReachWeek = (weekStarts: readonly string[]) => void;

const ReachWeekContext = createContext<ReachWeek | null>(null);

function hrefOf(week: string): string {
  return `/?desde=${week}`;
}

type ReachWeekProviderProps = {
  /** El piso de la ventana sin el timer activo, contra el que compara P-15. */
  readonly reachFrom: string;
  readonly children: ReactNode;
};

/**
 * P-15: el único dueño de la semana pedida en la pantalla. La barra y la
 * lista aplican la regla a través de él, así que una mutación de una ve lo
 * que ya pidió la otra.
 *
 * Una mutación compara contra el `reachFrom` del último render —no contra el
 * del render en que arrancó— y contra la semana ya pedida que todavía no
 * llegó: con dos mutaciones en vuelo, la respuesta de la segunda no
 * reemplaza un `desde` pedido por uno posterior. El `router.replace` va en
 * una transición; si termina sin que la semana llegue —la navegación se
 * descartó, por ejemplo por la revalidación de otra action—, se vuelve a
 * pedir.
 */
export function ReachWeekProvider({ reachFrom, children }: ReachWeekProviderProps) {
  const router = useRouter();
  const desde = useSearchParams().get("desde");
  const [navigating, startTransition] = useTransition();
  /** La semana pedida con `router.replace` que todavía no llegó. */
  const [requested, setRequested] = useState<string | null>(null);
  /**
   * Lo mismo, para el `onSuccess` de una mutación, que corre con el render en
   * que arrancó: lo lee de acá y no de su clausura.
   */
  const latest = useRef({ reachFrom, requested });

  useEffect(() => {
    latest.current = { reachFrom, requested };
  }, [reachFrom, requested]);

  if (requested !== null && reachArrived(requested, reachFrom, desde)) {
    setRequested(null);
  }

  useEffect(() => {
    if (requested === null || navigating || reachArrived(requested, reachFrom, desde)) {
      return;
    }
    startTransition(() => router.replace(hrefOf(requested), { scroll: false }));
  }, [requested, navigating, reachFrom, desde, router]);

  const reachWeek = useCallback<ReachWeek>(
    (weekStarts) => {
      const floor = reachFloor(latest.current.reachFrom, latest.current.requested);
      const week = weekToReach(floor, weekStarts);
      if (week === null) {
        return;
      }
      latest.current = { ...latest.current, requested: week };
      setRequested(week);
      startTransition(() => router.replace(hrefOf(week), { scroll: false }));
    },
    [router, startTransition, setRequested],
  );

  return <ReachWeekContext value={reachWeek}>{children}</ReachWeekContext>;
}

/**
 * Aplica la regla de P-15 a las semanas de las entradas que devolvió una
 * mutación y, si alguna queda antes de la ventana, la extiende hasta ella. Sin
 * desplazamiento: a la entrada se llega bajando, como en Clockify.
 */
export function useReachWeek(): ReachWeek {
  const reachWeek = useContext(ReachWeekContext);
  if (reachWeek === null) {
    throw new Error("useReachWeek necesita un ReachWeekProvider.");
  }
  return reachWeek;
}
