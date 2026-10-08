/**
 * Un pedido de la planilla que todavía no está en la foto del servidor:
 * `sending` en vuelo o en cola detrás de otra action, `settled` ya aplicado.
 */
export type PendingRecord = {
  readonly id: number;
  readonly status: "sending" | "settled";
};

export type PendingRequestsState<Pending extends PendingRecord, Failure> = {
  /** En el orden en que se mandaron. */
  readonly pending: readonly Pending[];
  readonly failure: Failure | null;
};

export type PendingRequestsEvent<Request, Failure> =
  | { readonly type: "sent"; readonly id: number; readonly request: Request }
  | { readonly type: "settled"; readonly id: number }
  | { readonly type: "failed"; readonly id: number; readonly failure: Failure }
  /** Llegó otra foto: ya trae todo lo asentado antes de ella (§5.6). */
  | { readonly type: "snapshot" }
  | { readonly type: "dismissed" };

export type PendingRequestsRules<Request, Pending> = {
  /** El registro de un pedido que sale, en `sending`. */
  readonly recordOf: (id: number, request: Request) => Pending;
  /**
   * Los dos pedidos son sobre lo mismo: uno nuevo reemplaza lo que contaba el
   * aviso de la falla del otro; uno sobre otra cosa no lo baja.
   */
  readonly sameSubject: (sent: Request, failed: Request) => boolean;
};

/**
 * El reducer de los pedidos de la planilla que se llevan fuera de toda
 * transición (§5.6, D13b-3): las escrituras de la grilla, «Quitar fila» y los
 * pedidos del detalle. Una falla saca su registro y reemplaza a la anterior;
 * la foto saca los asentados.
 */
export function pendingRequestsReducer<
  Request,
  Pending extends PendingRecord,
  Failure extends { readonly request: Request },
>(rules: PendingRequestsRules<Request, Pending>) {
  return (
    state: PendingRequestsState<Pending, Failure>,
    event: PendingRequestsEvent<Request, Failure>,
  ): PendingRequestsState<Pending, Failure> => {
    switch (event.type) {
      case "sent": {
        const failure =
          state.failure !== null &&
          rules.sameSubject(event.request, state.failure.request)
            ? null
            : state.failure;
        return {
          pending: [...state.pending, rules.recordOf(event.id, event.request)],
          failure,
        };
      }
      case "settled":
        return {
          ...state,
          pending: state.pending.map((pending) =>
            pending.id === event.id ? { ...pending, status: "settled" } : pending,
          ),
        };
      case "failed":
        return {
          pending: state.pending.filter((pending) => pending.id !== event.id),
          failure: event.failure,
        };
      case "snapshot": {
        const sending = state.pending.filter((pending) => pending.status === "sending");
        return sending.length === state.pending.length
          ? state
          : { ...state, pending: sending };
      }
      case "dismissed":
        return state.failure === null ? state : { ...state, failure: null };
    }
  };
}
