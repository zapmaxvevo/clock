import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { DomainError, RejectedError } from "./errors";
import { failureOf } from "./failure";
import { ForbiddenError } from "./permissions";

const messages = { forbidden: "Sin permiso.", unexpected: "Falló." } as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("failureOf (D-MCP-9)", () => {
  it("un error de dominio sale con su código y su texto", () => {
    expect(failureOf(new DomainError("not_found", "Ya no existe."), messages)).toEqual({
      code: "not_found",
      message: "Ya no existe.",
    });
  });

  it("un rechazo en masa sale con sus filas", () => {
    const rejections = [{ id: "e1", code: "forbidden", message: "No." }] as const;

    expect(failureOf(new RejectedError("Nada cambió.", rejections), messages)).toEqual({
      code: "rejected",
      message: "Nada cambió.",
      rejections,
    });
  });

  it("uno de permiso sale con el texto del módulo", () => {
    expect(failureOf(new ForbiddenError("mcp.connect"), messages)).toEqual({
      code: "forbidden",
      message: "Sin permiso.",
    });
  });

  it("uno de Zod sale con su primer mensaje", () => {
    const parsed = z.object({ a: z.string().min(2, "Corto.") }).safeParse({ a: "x" });

    expect(failureOf(parsed.error, messages)).toEqual({
      code: "validation",
      message: "Corto.",
    });
  });

  it("cualquier otro sale como unexpected y se registra", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("socket");

    expect(failureOf(error, messages)).toEqual({ code: "unexpected", message: "Falló." });
    expect(logged).toHaveBeenCalledWith(error);
  });
});
