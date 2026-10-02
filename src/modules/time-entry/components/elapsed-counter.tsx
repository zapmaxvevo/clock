"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { formatElapsed } from "@/server/time";

import { elapsedSeconds } from "./elapsed";

/**
 * Segundos transcurridos de una entrada abierta, redibujados una vez por
 * segundo y sin pedirle nada al servidor (TT-31). El valor se deriva de
 * `serverNow`, así la recarga ya dibuja el contador en su valor y no pasa por
 * cero (TT-38); lo único que mide el cliente es cuánto pasó desde que empezó a
 * contar, que es lo que lo deja a salvo del desfase de reloj (TT-32).
 */
export function useElapsedSeconds(startedAt: string | null, serverNow: string): number {
  const baseline = `${serverNow}|${startedAt ?? ""}`;
  const [measured, setMeasured] = useState({ baseline, sinceMountMs: 0 });

  useEffect(() => {
    if (startedAt === null) {
      return;
    }
    const measuringFromMs = Date.now();
    const interval = window.setInterval(() => {
      setMeasured({ baseline, sinceMountMs: Date.now() - measuringFromMs });
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [baseline, startedAt]);

  if (startedAt === null) {
    return 0;
  }
  // Con una referencia nueva del servidor lo medido ya no sirve: se cuenta
  // desde cero hasta el primer tic.
  const sinceMountMs = measured.baseline === baseline ? measured.sinceMountMs : 0;
  return elapsedSeconds({ startedAt, serverNow, sinceMountMs });
}

type ElapsedCounterProps = {
  /** null con el timer parado: el contador muestra 0:00:00 (TT-17). */
  readonly startedAt: string | null;
  readonly serverNow: string;
  readonly className?: string;
};

export function ElapsedCounter({ startedAt, serverNow, className }: ElapsedCounterProps) {
  const seconds = useElapsedSeconds(startedAt, serverNow);

  return (
    <span
      role="timer"
      aria-label="Tiempo transcurrido"
      className={cn("font-mono text-lg tabular-nums", className)}
    >
      {formatElapsed(seconds)}
    </span>
  );
}
