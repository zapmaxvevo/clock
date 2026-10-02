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
