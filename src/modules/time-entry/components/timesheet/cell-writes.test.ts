import { describe, expect, it } from "vitest";

import {
  timeEntryMessages,
  type SetTimesheetCellInput,
} from "@/modules/time-entry/schema";

import {
  busyOf,
  cellKeyOf,
  cellWriter,
  cellWritesReducer,
  NO_CELL_WRITES,
  shownOf,
  type CellWriteRequest,
  type CellWritesEvent,
  type CellWritesState,
  type SetTimesheetCell,
} from "./cell-writes";

const web = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

function request(date: string, minutes: number): CellWriteRequest {
  return {
    input: { date, projectId: web, taskId: null, minutes },
    name: `Web, ${date}`,
  };
}

const tuesday = request("2026-09-29", 90);
const wednesday = request("2026-09-30", 60);
const tuesdayKey = cellKeyOf(tuesday.input);
const wednesdayKey = cellKeyOf(wednesday.input);

type Response = Awaited<ReturnType<SetTimesheetCell>>;

/**
 * La action como doble: cada pedido queda en vuelo hasta que el test lo
 * contesta, y el estado se arma con el reducer, como lo haría `useReducer`.
 */
function harness() {
  const calls: {
    input: SetTimesheetCellInput;
    resolve: (response: Response) => void;
    reject: (error: Error) => void;
  }[] = [];
  let state: CellWritesState = NO_CELL_WRITES;
  const send: SetTimesheetCell = (input) =>
    new Promise((resolve, reject) => calls.push({ input, resolve, reject }));
  const writer = cellWriter(send, (event: CellWritesEvent) => {
    state = cellWritesReducer(state, event);
  });
  return {
    calls,
    writer,
    state: () => state,
    snapshot: () => {
      state = cellWritesReducer(state, { type: "snapshot" });
    },
    retry: () => {
      const failure = state.failure;
      if (failure !== null) {
        writer.write(failure.request);
      }
    },
  };
}

/** Deja correr las continuaciones de las promesas contestadas. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const ok: Response = { ok: true, data: { entry: null } };
const rejected: Response = {
  ok: false,
  code: "validation",
  message: "Editá las entradas de esta celda desde el rastreador.",
};

describe("cellWriter y cellWritesReducer (§5.6)", () => {
  it("dos escrituras de celdas distintas están en vuelo a la vez, cada una con su valor", () => {
    const grid = harness();

    grid.writer.write(tuesday);
    grid.writer.write(wednesday);

    expect(grid.calls.map((call) => call.input)).toEqual([
      tuesday.input,
      wednesday.input,
    ]);
    expect(shownOf(grid.state())).toEqual(
      new Map([
        [tuesdayKey, 90],
        [wednesdayKey, 60],
      ]),
    );
    expect(busyOf(grid.state())).toEqual(new Set([tuesdayKey, wednesdayKey]));
  });

  it("un rechazo saca su registro aunque la otra siga en vuelo: la celda vuelve a la foto y deja de estar `busy`", async () => {
    const grid = harness();
    grid.writer.write(tuesday);
    grid.writer.write(wednesday);

    grid.calls[0].resolve(rejected);
    await flush();

    expect(shownOf(grid.state()).has(tuesdayKey)).toBe(false);
    expect(busyOf(grid.state())).toEqual(new Set([wednesdayKey]));
    expect(grid.state().failure).toEqual({
      request: tuesday,
      code: "validation",
      message: rejected.message,
    });
  });

  it("un éxito deja de estar `busy` y sigue mostrando sus minutos hasta otra foto", async () => {
    const grid = harness();
    grid.writer.write(tuesday);
    grid.writer.write(wednesday);

    grid.calls[0].resolve(ok);
    await flush();

    expect(shownOf(grid.state()).get(tuesdayKey)).toBe(90);
    expect(busyOf(grid.state())).toEqual(new Set([wednesdayKey]));

    grid.snapshot();

    expect(shownOf(grid.state()).has(tuesdayKey)).toBe(false);
    expect(shownOf(grid.state()).get(wednesdayKey)).toBe(60);
    expect(busyOf(grid.state())).toEqual(new Set([wednesdayKey]));
  });

  it("el rechazo o el éxito de un pedido no toca otro de la misma celda", async () => {
    const grid = harness();
    grid.writer.write(tuesday);
    grid.writer.write(request("2026-09-29", 120));

    grid.calls[0].resolve(rejected);
    await flush();

    expect(shownOf(grid.state()).get(tuesdayKey)).toBe(120);
    expect(busyOf(grid.state())).toEqual(new Set([tuesdayKey]));

    grid.calls[1].resolve(ok);
    await flush();

    expect(shownOf(grid.state()).get(tuesdayKey)).toBe(120);
    expect(busyOf(grid.state())).toEqual(new Set());
  });

  it("con dos de la misma celda, el éxito del primero no la saca de `busy` ni de lo que muestra", async () => {
    const grid = harness();
    grid.writer.write(tuesday);
    grid.writer.write(request("2026-09-29", 120));

    grid.calls[0].resolve(ok);
    await flush();
    grid.snapshot();

    expect(shownOf(grid.state()).get(tuesdayKey)).toBe(120);
    expect(busyOf(grid.state())).toEqual(new Set([tuesdayKey]));
  });

  it("un error de red es `unexpected` con el texto del módulo", async () => {
    const grid = harness();
    grid.writer.write(tuesday);

    grid.calls[0].reject(new Error("Failed to fetch"));
    await flush();

    expect(grid.state().failure).toEqual({
      request: tuesday,
      code: "unexpected",
      message: timeEntryMessages.unexpected,
    });
    expect(busyOf(grid.state())).toEqual(new Set());
  });

  it("Enter y la pérdida del foco con los mismos minutos mandan un solo pedido", () => {
    const grid = harness();

    grid.writer.write(tuesday);
    grid.writer.write(tuesday);

    expect(grid.calls).toHaveLength(1);
  });

  it("con otros minutos, la misma celda manda otro pedido", () => {
    const grid = harness();

    grid.writer.write(tuesday);
    grid.writer.write(request("2026-09-29", 120));
    grid.writer.write(request("2026-09-29", 90));

    expect(grid.calls.map((call) => call.input.minutes)).toEqual([90, 120, 90]);
  });

  it("asentado el pedido, los mismos minutos se pueden volver a mandar", async () => {
    const grid = harness();
    grid.writer.write(tuesday);
    grid.calls[0].resolve(ok);
    await flush();

    grid.writer.write(tuesday);

    expect(grid.calls).toHaveLength(2);
  });

  it("el pedido que se asienta solo libera la celda si es el último que la ocupó", async () => {
    const grid = harness();
    grid.writer.write(tuesday);
    grid.writer.write(request("2026-09-29", 120));

    grid.calls[0].resolve(ok);
    await flush();
    grid.writer.write(request("2026-09-29", 120));

    expect(grid.calls).toHaveLength(2);
  });

  it("una falla no se baja con la escritura de otra celda, y sí con la de la misma", async () => {
    const grid = harness();
    grid.writer.write(tuesday);
    grid.calls[0].resolve(rejected);
    await flush();

    grid.writer.write(wednesday);

    expect(grid.state().failure?.request).toEqual(tuesday);

    grid.writer.write(request("2026-09-29", 30));

    expect(grid.state().failure).toBeNull();
  });

  it("una falla reemplaza a la anterior", async () => {
    const grid = harness();
    grid.writer.write(tuesday);
    grid.writer.write(wednesday);

    grid.calls[0].resolve(rejected);
    await flush();
    grid.calls[1].resolve({ ok: false, code: "not_found", message: "Ese proyecto…" });
    await flush();

    expect(grid.state().failure?.request).toEqual(wednesday);
  });

  it("«Reintentar» reenvía el pedido de la falla, no el último que se mandó", async () => {
    const grid = harness();
    grid.writer.write(tuesday);
    grid.writer.write(wednesday);
    grid.calls[0].reject(new Error("Failed to fetch"));
    grid.calls[1].resolve(ok);
    await flush();

    grid.retry();

    expect(grid.calls.map((call) => call.input)).toEqual([
      tuesday.input,
      wednesday.input,
      tuesday.input,
    ]);
    expect(grid.state().failure).toBeNull();
    expect(busyOf(grid.state())).toEqual(new Set([tuesdayKey]));
  });

  it("bajar el aviso no toca lo que está en vuelo", async () => {
    const grid = harness();
    grid.writer.write(tuesday);
    grid.writer.write(wednesday);
    grid.calls[0].resolve(rejected);
    await flush();

    const state = cellWritesReducer(grid.state(), { type: "dismissed" });

    expect(state.failure).toBeNull();
    expect(busyOf(state)).toEqual(new Set([wednesdayKey]));
  });

  it("otra foto sin nada asentado devuelve el mismo estado", () => {
    const grid = harness();
    grid.writer.write(tuesday);
    const before = grid.state();

    grid.snapshot();

    expect(grid.state()).toBe(before);
  });
});

describe("cellKeyOf", () => {
  it("distingue el día, el proyecto y la tarea, sin distinguir mayúsculas en los ids", () => {
    const base = { date: "2026-09-29", projectId: web, taskId: null };

    expect(cellKeyOf(base)).toBe(cellKeyOf({ ...base, projectId: web.toUpperCase() }));
    expect(cellKeyOf(base)).not.toBe(cellKeyOf({ ...base, date: "2026-09-30" }));
    expect(cellKeyOf(base)).not.toBe(cellKeyOf({ ...base, projectId: null }));
    expect(cellKeyOf(base)).not.toBe(cellKeyOf({ ...base, taskId: web }));
  });
});
