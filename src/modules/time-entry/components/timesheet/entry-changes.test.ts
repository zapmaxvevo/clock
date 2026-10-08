import { describe, expect, it } from "vitest";

import { timeEntryMessages } from "@/modules/time-entry/schema";

import {
  changingEntriesOf,
  changingOf,
  entryChanger,
  entryChangesReducer,
  NO_ENTRY_CHANGES,
  sendingEntriesOf,
  type EntryChangeActions,
  type EntryChangeRequest,
  type EntryChangesEvent,
  type EntryChangesState,
} from "./entry-changes";

const tuesday = "2026-09-29|0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d|-";
const wednesday = "2026-09-30|0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d|-";
const a = "7a8b9c0d-1e2f-4a3b-9c4d-6e7f8091a2b3";
const b = "8b9c0d1e-2f3a-4b4c-8d5e-7f8091a2b3c4";
const c = "9c0d1e2f-3a4b-4c5d-9e6f-8091a2b3c4d5";

function save(id: string, cell: string, description = "Diseño"): EntryChangeRequest {
  return {
    kind: "save",
    cell,
    name: `«${description}», de 09:00 a 10:30`,
    input: { id, changes: { description } },
  };
}

function remove(id: string, cell: string): EntryChangeRequest {
  return { kind: "delete", cell, name: "«a», de 10:00 a 11:00", input: { id } };
}

type Response = { ok: true } | { ok: false; code: "not_found" | "unexpected" };

/**
 * Las actions como doble: cada pedido queda en vuelo hasta que el test lo
 * contesta, y el estado se arma con el reducer, como lo haría `useReducer`.
 */
function harness() {
  const calls: {
    kind: EntryChangeRequest["kind"];
    id: string;
    resolve: (response: Response) => void;
    reject: (error: Error) => void;
  }[] = [];
  const settled: EntryChangeRequest[] = [];
  let state: EntryChangesState = NO_ENTRY_CHANGES;

  function pending(kind: EntryChangeRequest["kind"], id: string) {
    return new Promise<Response>((resolve, reject) =>
      calls.push({ kind, id, resolve, reject }),
    ).then((response) =>
      response.ok
        ? { ok: true as const, data: { id } }
        : { ok: false as const, code: response.code, message: `Falla: ${response.code}` },
    );
  }

  const actions: EntryChangeActions = {
    save: async (input) => {
      const result = await pending("save", input.id);
      return result.ok ? { ok: true, data: { entry: entryOf(input.id) } } : result;
    },
    remove: (input) => pending("delete", input.id),
  };
  const changer = entryChanger(actions, (event: EntryChangesEvent) => {
    state = entryChangesReducer(state, event);
  });
  function send(request: EntryChangeRequest): void {
    void changer.send(request).then((ok) => {
      if (ok) {
        settled.push(request);
      }
    });
  }
  return {
    calls,
    settled,
    changer: { send },
    state: () => state,
    snapshot: () => {
      state = entryChangesReducer(state, { type: "snapshot" });
    },
    retry: () => {
      const failure = state.failure;
      if (failure !== null) {
        send(failure.request);
      }
    },
  };
}

/** Lo que el doble de `updateEntry` responde: el test no lo mira. */
function entryOf(id: string) {
  return {
    id,
    description: "",
    startedAt: "2026-09-29T12:00:00.000Z",
    endedAt: "2026-09-29T13:30:00.000Z",
    dayDate: "2026-09-29",
    weekStart: "2026-09-28",
    startLabel: "09:00",
    endLabel: "10:30",
    startClock: "09:00",
    endClock: "10:30",
    extraDays: 0,
    durationSeconds: 5_400,
    durationLabel: "1:30",
    editableTimes: true,
    project: null,
    task: null,
    billable: false,
    tags: [],
  };
}

/** Deja correr las continuaciones de las promesas contestadas. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("entryChanger y entryChangesReducer (§5.4)", () => {
  it("un pedido en vuelo ocupa su celda y su entrada; solo ese cuenta para el editor", () => {
    const detail = harness();
    detail.changer.send(save(a, tuesday));

    expect(changingOf(detail.state())).toEqual(new Set([tuesday]));
    expect(changingEntriesOf(detail.state())).toEqual(new Set([a]));
    expect(sendingEntriesOf(detail.state())).toEqual(new Set([a]));
  });

  it("asentado, la celda y la entrada siguen ocupadas hasta la foto; el editor ya no espera (A1)", async () => {
    const detail = harness();
    detail.changer.send(save(a, tuesday));
    detail.changer.send(remove(b, wednesday));

    detail.calls[0].resolve({ ok: true });
    await flush();

    expect(changingOf(detail.state())).toEqual(new Set([tuesday, wednesday]));
    expect(changingEntriesOf(detail.state())).toEqual(new Set([a, b]));
    expect(sendingEntriesOf(detail.state())).toEqual(new Set([b]));
  });

  it("la foto saca los asentados y deja los que viajan", async () => {
    const detail = harness();
    detail.changer.send(save(a, tuesday));
    detail.changer.send(remove(b, wednesday));
    detail.calls[0].resolve({ ok: true });
    await flush();

    detail.snapshot();

    expect(changingOf(detail.state())).toEqual(new Set([wednesday]));
    expect(changingEntriesOf(detail.state())).toEqual(new Set([b]));
    expect(sendingEntriesOf(detail.state())).toEqual(new Set([b]));
  });

  it("otra foto sin nada asentado devuelve el mismo estado", () => {
    const detail = harness();
    detail.changer.send(save(a, tuesday));
    const before = detail.state();

    detail.snapshot();

    expect(detail.state()).toBe(before);
  });

  it("el envío dice si el pedido se asentó o falló", async () => {
    const detail = harness();
    detail.changer.send(save(a, tuesday));
    detail.changer.send(remove(b, tuesday));

    detail.calls[0].resolve({ ok: true });
    detail.calls[1].resolve({ ok: false, code: "not_found" });
    await flush();

    expect(detail.settled).toEqual([save(a, tuesday)]);
  });

  it("una falla saca su registro sin tocar otro de la misma celda, y deja el aviso con su pedido", async () => {
    const detail = harness();
    detail.changer.send(save(a, tuesday));
    detail.changer.send(remove(b, tuesday));

    detail.calls[0].resolve({ ok: false, code: "not_found" });
    await flush();

    expect(changingOf(detail.state())).toEqual(new Set([tuesday]));
    expect(changingEntriesOf(detail.state())).toEqual(new Set([b]));
    expect(detail.state().failure).toEqual({
      request: save(a, tuesday),
      code: "not_found",
      message: "Falla: not_found",
    });
  });

  it("un error de red es `unexpected` con el texto del módulo", async () => {
    const detail = harness();
    detail.changer.send(remove(a, tuesday));

    detail.calls[0].reject(new Error("Failed to fetch"));
    await flush();

    expect(detail.state().failure).toMatchObject({
      code: "unexpected",
      message: timeEntryMessages.unexpected,
    });
    expect(changingOf(detail.state())).toEqual(new Set());
  });

  it("una falla reemplaza a la anterior", async () => {
    const detail = harness();
    detail.changer.send(save(a, tuesday));
    detail.changer.send(save(b, wednesday));

    detail.calls[0].resolve({ ok: false, code: "unexpected" });
    await flush();
    detail.calls[1].resolve({ ok: false, code: "not_found" });
    await flush();

    expect(detail.state().failure?.request).toEqual(save(b, wednesday));
  });

  it("un pedido nuevo de la misma entrada baja su falla; uno de otra entrada, aun de la misma celda, no", async () => {
    const detail = harness();
    detail.changer.send(save(a, tuesday));
    detail.calls[0].resolve({ ok: false, code: "unexpected" });
    await flush();

    detail.changer.send(remove(b, tuesday));
    detail.changer.send(save(c, wednesday));

    expect(detail.state().failure?.request).toEqual(save(a, tuesday));

    detail.changer.send(remove(a, tuesday));

    expect(detail.state().failure).toBeNull();
  });

  it("«Reintentar» reenvía el pedido de la falla tal cual, no el último que se mandó", async () => {
    const detail = harness();
    detail.changer.send(save(a, tuesday, "Informe"));
    detail.changer.send(remove(b, wednesday));
    detail.calls[0].reject(new Error("Failed to fetch"));
    detail.calls[1].resolve({ ok: true });
    await flush();

    detail.retry();

    expect(detail.calls.map((call) => [call.kind, call.id])).toEqual([
      ["save", a],
      ["delete", b],
      ["save", a],
    ]);
    expect(detail.state().failure).toBeNull();
    expect(sendingEntriesOf(detail.state())).toEqual(new Set([a]));
    expect(detail.state().pending.at(-1)).toMatchObject({ cell: tuesday, entryId: a });
  });

  it("bajar el aviso no toca lo que viaja", async () => {
    const detail = harness();
    detail.changer.send(save(a, tuesday));
    detail.changer.send(save(b, wednesday));
    detail.calls[0].resolve({ ok: false, code: "unexpected" });
    await flush();

    const state = entryChangesReducer(detail.state(), { type: "dismissed" });

    expect(state.failure).toBeNull();
    expect(changingOf(state)).toEqual(new Set([wednesday]));
  });
});
