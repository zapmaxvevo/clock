import { afterEach, describe, expect, it, vi } from "vitest";

import { createOnce, type ConflictOutcome } from "./create-once";
import { CHECK_VIOLATION, UNIQUE_VIOLATION } from "./db/constraint-error";
import { ForbiddenError } from "./permissions";
import type * as Permissions from "./permissions";

/**
 * `createOnce` no consulta permisos: lo hace quien la llama. Si alguna rama
 * llamara a `can` o a `assertCan`, el llamado queda anotado y el test falla.
 */
const permissionCalls = vi.hoisted(() => [] as string[]);

vi.mock("@/server/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof Permissions>()),
  can: () => {
    permissionCalls.push("can");
    throw new Error("createOnce consultó can()");
  },
  assertCan: () => {
    permissionCalls.push("assertCan");
    throw new Error("createOnce consultó assertCan()");
  },
}));

afterEach(() => {
  expect(permissionCalls).toEqual([]);
  permissionCalls.length = 0;
});

const id = "0b5e8d5e-3c2f-4b7a-9f1a-2c3d4e5f6a7b";
const idConstraint = "thing_pkey";

type Row = { readonly id: string; readonly origin: string };
type Result = { readonly from: string; readonly id: string };

/**
 * El error del driver tal como lo deja drizzle: envuelto, con el original en
 * `cause`. Sin `constraint`, el driver no nombró la restricción.
 */
function databaseError(code: string, constraint?: string): Error {
  const original = Object.assign(new Error(`violación ${code}`), {
    code,
    ...(constraint === undefined ? {} : { constraint }),
  });
  return new Error("Failed query", { cause: original });
}

/**
 * Dobles escritos a mano: cada uno consume su guion en orden y cuenta sus
 * llamadas. Un guion agotado es un llamado que el test no esperaba.
 */
function scripted<T>(name: string, steps: readonly (() => T)[]) {
  const calls: unknown[][] = [];
  const fn = (...args: unknown[]): T => {
    calls.push(args);
    const step = steps[calls.length - 1];
    if (step === undefined) {
      throw new Error(`${name}: llamado ${calls.length} sin guion`);
    }
    return step();
  };
  return { fn, calls };
}

function harness(script: {
  readonly findOwn: readonly (Row | undefined)[];
  readonly attempt: readonly (() => Promise<Result>)[];
  readonly hook?: readonly (() => Promise<ConflictOutcome<Result>>)[];
}) {
  const findOwn = scripted(
    "findOwn",
    script.findOwn.map((row) => () => Promise.resolve(row)),
  );
  const attempt = scripted("attempt", script.attempt);
  const hook = script.hook === undefined ? undefined : scripted("hook", script.hook);
  const run = () =>
    createOnce<Row, Result>({
      id,
      findOwn: findOwn.fn,
      attempt: attempt.fn,
      replayed: (row) => ({ from: `replayed:${row.origin}`, id: row.id }),
      idConstraint,
      action: "timeEntry.own.create",
      onOtherConflict: hook?.fn,
    });
  const counts = () => ({
    findOwn: findOwn.calls.length,
    attempt: attempt.calls.length,
    hook: hook?.calls.length ?? 0,
  });
  return { run, counts, findOwn };
}

const ownRow: Row = { id, origin: "propia" };
const created: Result = { from: "attempt", id };
const winner: Result = { from: "ganador", id: "c6a7e8d9-1b2c-4d3e-8f4a-5b6c7d8e9f0a" };
const succeed = () => Promise.resolve(created);
const fail = (error: unknown) => () => Promise.reject(error);
const resolved = () =>
  Promise.resolve<ConflictOutcome<Result>>({ kind: "resolved", result: winner });
const retry = () => Promise.resolve<ConflictOutcome<Result>>({ kind: "retry" });

describe("createOnce, paso 1: la fila propia antes de escribir", () => {
  it("responde la fila propia sin llamar a attempt", async () => {
    const { run, counts, findOwn } = harness({ findOwn: [ownRow], attempt: [] });

    await expect(run()).resolves.toEqual({ from: "replayed:propia", id });
    expect(counts()).toEqual({ findOwn: 1, attempt: 0, hook: 0 });
    expect(findOwn.calls).toEqual([[id]]);
  });

  it("sin fila propia, responde lo que da attempt", async () => {
    const { run, counts } = harness({ findOwn: [undefined], attempt: [succeed] });

    await expect(run()).resolves.toBe(created);
    expect(counts()).toEqual({ findOwn: 1, attempt: 1, hook: 0 });
  });
});

describe("createOnce, un error que no es 23505", () => {
  it.each([
    ["un check", databaseError(CHECK_VIOLATION, "thing_check")],
    ["un error sin código", new Error("conexión perdida")],
  ])("%s sale tal cual, sin releer ni llamar al gancho", async (_, error) => {
    const { run, counts } = harness({
      findOwn: [undefined],
      attempt: [fail(error)],
      hook: [],
    });

    await expect(run()).rejects.toBe(error);
    expect(counts()).toEqual({ findOwn: 1, attempt: 1, hook: 0 });
  });
});

describe("createOnce, un 23505 con fila propia", () => {
  it.each([
    ["de la clave primaria", idConstraint],
    ["de otra restricción", "thing_other_unq"],
  ])("%s responde la fila propia sin llamar al gancho", async (_, constraint) => {
    const { run, counts } = harness({
      findOwn: [undefined, ownRow],
      attempt: [fail(databaseError(UNIQUE_VIOLATION, constraint))],
      hook: [],
    });

    await expect(run()).resolves.toEqual({ from: "replayed:propia", id });
    expect(counts()).toEqual({ findOwn: 2, attempt: 1, hook: 0 });
  });
});

describe("createOnce, un 23505 de la clave primaria sin fila propia", () => {
  it("sale como ForbiddenError de la acción, sin otra vuelta ni gancho", async () => {
    const { run, counts } = harness({
      findOwn: [undefined, undefined],
      attempt: [fail(databaseError(UNIQUE_VIOLATION, idConstraint))],
      hook: [],
    });

    const error = await run().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error).toMatchObject({
      code: "forbidden",
      message: new ForbiddenError("timeEntry.own.create").message,
    });
    expect(counts()).toEqual({ findOwn: 2, attempt: 1, hook: 0 });
  });
});

describe("createOnce, un 23505 de otra restricción sin fila propia", () => {
  const conflict = databaseError(UNIQUE_VIOLATION, "thing_other_unq");

  it("sin gancho, sale tal cual", async () => {
    const { run, counts } = harness({
      findOwn: [undefined, undefined],
      attempt: [fail(conflict)],
    });

    await expect(run()).rejects.toBe(conflict);
    expect(counts()).toEqual({ findOwn: 2, attempt: 1, hook: 0 });
  });

  it("con gancho resuelto, responde su resultado sin otra vuelta", async () => {
    const { run, counts } = harness({
      findOwn: [undefined, undefined],
      attempt: [fail(conflict)],
      hook: [resolved],
    });

    await expect(run()).resolves.toBe(winner);
    expect(counts()).toEqual({ findOwn: 2, attempt: 1, hook: 1 });
  });

  it("el gancho recibe el error de la base", async () => {
    const received: unknown[] = [];
    await createOnce<Row, Result>({
      id,
      findOwn: () => Promise.resolve(undefined),
      attempt: fail(conflict),
      replayed: () => created,
      idConstraint,
      action: "timeEntry.own.create",
      onOtherConflict: (error) => {
        received.push(error);
        return resolved();
      },
    });

    expect(received).toEqual([conflict]);
  });

  it("el gancho que vuelve a lanzar deja salir ese error", async () => {
    const own = new Error("del gancho");
    const { run, counts } = harness({
      findOwn: [undefined, undefined],
      attempt: [fail(conflict)],
      hook: [() => Promise.reject(own)],
    });

    await expect(run()).rejects.toBe(own);
    expect(counts()).toEqual({ findOwn: 2, attempt: 1, hook: 1 });
  });

  it("retry da la segunda vuelta, que empieza otra vez por la fila propia", async () => {
    const { run, counts } = harness({
      findOwn: [undefined, undefined, undefined],
      attempt: [fail(conflict), succeed],
      hook: [retry],
    });

    await expect(run()).resolves.toBe(created);
    expect(counts()).toEqual({ findOwn: 3, attempt: 2, hook: 1 });
  });

  it("en la segunda vuelta, la fila propia del paso 1 se responde sin escribir", async () => {
    const { run, counts } = harness({
      findOwn: [undefined, undefined, ownRow],
      attempt: [fail(conflict)],
      hook: [retry],
    });

    await expect(run()).resolves.toEqual({ from: "replayed:propia", id });
    expect(counts()).toEqual({ findOwn: 3, attempt: 1, hook: 1 });
  });

  it("retry en la segunda vuelta sale con el último error", async () => {
    const second = databaseError(UNIQUE_VIOLATION, "thing_other_unq");
    const { run, counts } = harness({
      findOwn: [undefined, undefined, undefined, undefined],
      attempt: [fail(conflict), fail(second)],
      hook: [retry, retry],
    });

    await expect(run()).rejects.toBe(second);
    expect(counts()).toEqual({ findOwn: 4, attempt: 2, hook: 2 });
  });
});

describe("createOnce, un 23505 sin nombre de restricción", () => {
  const unnamed = databaseError(UNIQUE_VIOLATION);

  it("relee y responde la fila propia", async () => {
    const { run, counts } = harness({
      findOwn: [undefined, ownRow],
      attempt: [fail(unnamed)],
      hook: [],
    });

    await expect(run()).resolves.toEqual({ from: "replayed:propia", id });
    expect(counts()).toEqual({ findOwn: 2, attempt: 1, hook: 0 });
  });

  it("sin fila propia ni gancho, sale tal cual y no como ForbiddenError", async () => {
    const { run, counts } = harness({
      findOwn: [undefined, undefined],
      attempt: [fail(unnamed)],
    });

    await expect(run()).rejects.toBe(unnamed);
    expect(counts()).toEqual({ findOwn: 2, attempt: 1, hook: 0 });
  });

  it("sin fila propia, va al gancho como otro choque", async () => {
    const { run, counts } = harness({
      findOwn: [undefined, undefined],
      attempt: [fail(unnamed)],
      hook: [resolved],
    });

    await expect(run()).resolves.toBe(winner);
    expect(counts()).toEqual({ findOwn: 2, attempt: 1, hook: 1 });
  });
});
