"use client";

import { useEffect, useState } from "react";

import { formatElapsed } from "@/server/time";

import {
  currentElapsedSeconds,
  elapsedSeconds,
  measurementFor,
  type Measurement,
} from "./elapsed";

/**
 * Segundos transcurridos de una entrada abierta, redibujados una vez por
 * segundo y sin pedirle nada al servidor (TT-31). El valor se deriva de
 * `serverNow`, así la recarga ya dibuja el contador en su valor y no pasa por
 * cero (TT-38); lo único que mide el cliente es cuánto pasó desde que empezó a
 * contar, que es lo que lo deja a salvo del desfase de reloj (TT-32).
 *
 * Cuándo empieza una medición y qué parte de lo medido vale lo deciden
 * `measurementFor` y `currentElapsedSeconds`, con el `serverNow` como única
 * referencia: un inicio corregido con el mismo `serverNow` no tira lo medido.
 */
export function useElapsedSeconds(startedAt: string | null, serverNow: string): number {
  const [measured, setMeasured] = useState<{
    readonly measurement: Measurement;
    readonly nowMs: number;
  } | null>(null);
  const running = startedAt !== null;

  useEffect(() => {
    if (!running) {
      return;
    }
    const measuringFromMs = Date.now();
    const interval = window.setInterval(() => {
      setMeasured((previous) => ({
        measurement: measurementFor(
          previous?.measurement ?? null,
          serverNow,
          measuringFromMs,
        ),
        nowMs: Date.now(),
      }));
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [serverNow, running]);

  if (startedAt === null) {
    return 0;
  }
  // Hasta el primer tic no hay nada medido: se cuenta desde el serverNow.
  if (measured === null) {
    return elapsedSeconds({ startedAt, serverNow, sinceMountMs: 0 });
  }
  return currentElapsedSeconds(measured.measurement, {
    startedAt,
    serverNow,
    nowMs: measured.nowMs,
  });
}

type ElapsedCounterProps = {
  /** null con el timer parado: el contador muestra 0:00:00 (TT-17). */
  readonly startedAt: string | null;
  readonly serverNow: string;
};

export function ElapsedCounter({ startedAt, serverNow }: ElapsedCounterProps) {
  const seconds = useElapsedSeconds(startedAt, serverNow);

  return (
    <span
      role="timer"
      aria-label="Tiempo transcurrido"
      className="font-mono text-lg tabular-nums"
    >
      {formatElapsed(seconds)}
    </span>
  );
}
