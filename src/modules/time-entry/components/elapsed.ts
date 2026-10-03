/**
 * Única cuenta que hace el cliente. El contador no mide con el reloj absoluto
 * de la máquina: arranca del instante que informó el servidor y le suma lo que
 * pasó desde que montó el componente, así un reloj adelantado o atrasado no
 * mueve el transcurrido ni deja un salto al detener (TT-32).
 */
export type ElapsedInput = {
  /** Inicio de la entrada, ISO UTC. */
  readonly startedAt: string;
  /** Instante del servidor al dibujar la pantalla, ISO UTC. */
  readonly serverNow: string;
  /** Milisegundos que pasaron en el cliente desde el montaje del contador. */
  readonly sinceMountMs: number;
};

export function elapsedSeconds({
  startedAt,
  serverNow,
  sinceMountMs,
}: ElapsedInput): number {
  const elapsedMs = Date.parse(serverNow) - Date.parse(startedAt) + sinceMountMs;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return 0;
  }
  return Math.floor(elapsedMs / 1000);
}

/**
 * Una medición del cliente contra un `serverNow`. Lo medido es la diferencia
 * entre dos lecturas del mismo reloj, así que el desfase de la máquina se
 * cancela; lo que hay que decidir es cuándo lo medido sigue valiendo, y eso
 * depende solo del ancla, no del `startedAt`: corregir el inicio del timer no
 * tira lo que el contador lleva contado.
 */
export type Measurement = {
  /** `serverNow` contra el que se mide. */
  readonly anchor: string;
  /** `Date.now()` del cliente cuando empezó a medirse contra ese ancla. */
  readonly fromMs: number;
};

/**
 * Con el mismo ancla devuelve la medición anterior; con otro, empieza una.
 * Así un intervalo que se reinicia con el mismo `serverNow` —una parada que
 * falla y vuelve a mostrar el timer corriendo— sigue midiendo desde el
 * montaje original y el contador no retrocede.
 */
export function measurementFor(
  previous: Measurement | null,
  serverNow: string,
  nowMs: number,
): Measurement {
  if (previous !== null && previous.anchor === serverNow) {
    return previous;
  }
  return { anchor: serverNow, fromMs: nowMs };
}

/** Transcurrido actual: lo medido vale mientras el ancla sea el `serverNow` vigente. */
export function currentElapsedSeconds(
  measurement: Measurement,
  current: {
    readonly startedAt: string;
    readonly serverNow: string;
    readonly nowMs: number;
  },
): number {
  const sinceMountMs =
    measurement.anchor === current.serverNow
      ? Math.max(0, current.nowMs - measurement.fromMs)
      : 0;
  return elapsedSeconds({
    startedAt: current.startedAt,
    serverNow: current.serverNow,
    sinceMountMs,
  });
}
