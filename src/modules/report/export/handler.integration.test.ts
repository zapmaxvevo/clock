import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/server/db";
import { membership } from "@/server/db/schema";
import type { MembershipStatus, Role } from "@/server/permissions";
import {
  buenosAires,
  seedTimeEntry,
  seedUser,
  seedWorkspace,
  type SeededWorkspace,
} from "@/test/factories";
import { actorIn, workspaceOf } from "@/test/time-entry";

import { REPORT_EXPORT_MAX_ENTRIES, reportMessages } from "../schema";
import { reportRepository } from "../repository";
import { getReportExport } from "../service";
import { exportLabels } from "./labels";

/**
 * La ruta de exportación con las tres puertas de Next y de Better Auth
 * reemplazadas, como en las actions: el resto corre de verdad
 * (`requireSession`, `reportRequestOf`, `can()`, el service, la base, el
 * documento y el CSV).
 */
const mocks = vi.hoisted(() => ({
  sessionUser: null as null | { id: string; email: string },
  redirects: [] as string[],
}));

class RedirectError extends Error {
  constructor(readonly to: string) {
    super(`redirect ${to}`);
  }
}

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    mocks.redirects.push(path);
    throw new RedirectError(path);
  },
}));

vi.mock("@/server/auth", () => ({
  auth: {
    api: {
      getSession: async () =>
        mocks.sessionUser === null
          ? null
          : {
              user: {
                id: mocks.sessionUser.id,
                email: mocks.sessionUser.email,
                name: "Persona de prueba",
                image: null,
              },
            },
    },
  },
}));

const { exportBodyOf, exportFileNameOf, handleReportExport } = await import("./handler");

/** La semana del lunes 28/09/2026 con agrupar persona → proyecto. */
const weekQuery = "desde=2026-09-28&hasta=2026-10-04&agrupar=persona&subagrupar=proyecto";

const settings = workspaceOf(buenosAires);

const FILE_NAME = /^reporte_[a-z-]+_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/;

let seeded: SeededWorkspace;

beforeEach(async () => {
  mocks.sessionUser = null;
  mocks.redirects.length = 0;
  seeded = await seedWorkspace(buenosAires);
});

afterEach(() => {
  mocks.sessionUser = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Una sesión en el workspace sembrado, con la membresía ya creada en ese estado y rol. */
async function signInAs(status: MembershipStatus = "active", role: Role = "member") {
  const email = `${randomUUID()}@empresa.com`;
  const id = await seedUser(email);
  await db
    .insert(membership)
    .values({ workspaceId: seeded.workspaceId, userId: id, role, status });
  mocks.sessionUser = { id, email };
  return id;
}

/** Una entrada de una hora el martes 29/09 a las 10:00 de Buenos Aires. */
function seedHour(userId: string, description: string) {
  return seedTimeEntry({
    workspaceId: seeded.workspaceId,
    userId,
    description,
    startedAt: "2026-09-29T13:00:00Z",
    endedAt: "2026-09-29T14:00:00Z",
  });
}

function exportOf(query: string): Promise<Response> {
  return handleReportExport(
    new Request(`http://localhost:3000/reportes/exportar/csv?${query}`),
    "csv",
  );
}

/** El cuerpo como texto, con el BOM, que `TextDecoder` quitaría por omisión. */
async function textOf(response: Response): Promise<string> {
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(
    await response.arrayBuffer(),
  );
}

function fileNameOf(response: Response): string | undefined {
  return /filename="([^"]*)"/.exec(
    response.headers.get("Content-Disposition") ?? "",
  )?.[1];
}

describe("la ruta de exportación (D-R6-4, D-R6-5; criterio 10 de R6)", () => {
  it("200 con el CSV, attachment con el nombre, no-store exacto y las filas de la persona", async () => {
    const memberId = await signInAs();
    await seedHour(memberId, "Entrada propia");

    const response = await exportOf(weekQuery);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="reporte_persona-proyecto_2026-09-28_2026-10-04.csv"',
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = new Uint8Array(await response.clone().arrayBuffer());
    expect([...body.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = await textOf(response);
    expect(text).toContain('"Entrada propia"');
    expect(text).toContain('"Persona de prueba"');
  });

  it("el nombre con un nivel y con descripción; todo nombre es ASCII con la forma de D-R6-5", async () => {
    await signInAs();

    const names = [];
    for (const query of [
      "desde=2026-09-28&hasta=2026-10-04",
      "desde=2026-09-28&hasta=2026-10-04&agrupar=descripcion",
      "desde=2026-09-28&hasta=2026-10-04&agrupar=fecha&subagrupar=etiqueta,descripcion",
      weekQuery,
    ]) {
      names.push(fileNameOf(await exportOf(query)));
    }

    expect(names).toEqual([
      "reporte_persona_2026-09-28_2026-10-04.csv",
      "reporte_descripcion_2026-09-28_2026-10-04.csv",
      "reporte_fecha-etiqueta-descripcion_2026-09-28_2026-10-04.csv",
      "reporte_persona-proyecto_2026-09-28_2026-10-04.csv",
    ]);
    expect(names.every((name) => name !== undefined && FILE_NAME.test(name))).toBe(true);
  });

  it("sin sesión, la promesa rechaza con el redirect a /login y no se lee nada", async () => {
    const transaction = vi.spyOn(db, "transaction");
    const entryList = vi.spyOn(reportRepository, "entryList");

    await expect(exportOf(weekQuery)).rejects.toBeInstanceOf(RedirectError);

    expect(mocks.redirects).toEqual(["/login"]);
    expect(transaction).not.toHaveBeenCalled();
    expect(entryList).not.toHaveBeenCalled();
  });

  it("con la membresía inactiva, 403 con el texto, no-store y sin Content-Disposition", async () => {
    await signInAs("inactive");
    const entryList = vi.spyOn(reportRepository, "entryList");

    const response = await exportOf(weekQuery);

    expect(response.status).toBe(403);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Disposition")).toBeNull();
    expect(await response.text()).toBe(reportMessages.exportForbidden);
    expect(entryList).not.toHaveBeenCalled();
  });

  it("un member con personas=<otra> recibe solo lo propio", async () => {
    const otherId = await seedUser();
    await db
      .insert(membership)
      .values({ workspaceId: seeded.workspaceId, userId: otherId, role: "member" });
    await seedHour(otherId, "Entrada ajena");
    const memberId = await signInAs();
    await seedHour(memberId, "Entrada propia");

    const response = await exportOf(`${weekQuery}&personas=${otherId}`);

    expect(response.status).toBe(200);
    const text = await textOf(response);
    expect(text).toContain('"Entrada propia"');
    expect(text).not.toContain("Entrada ajena");
    expect(text).toBe(await textOf(await exportOf(weekQuery)));
  });

  it("con desde inválido y agrupar=cualquiera, y con desde repetido, el archivo del pedido de reportRequestOf", async () => {
    // Solo `Date`: «Generado» y «Esta semana» salen del reloj; la base usa sus propios temporizadores.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-01T15:00:00Z") });
    const memberId = await signInAs();
    await seedHour(memberId, "Entrada propia");

    const invalid = await exportOf(
      "desde=2026-13-01&hasta=2026-10-04&agrupar=cualquiera",
    );
    const empty = await exportOf("");
    const repeated = await exportOf(
      "desde=2026-09-28&desde=2026-09-21&hasta=2026-10-04&agrupar=proyecto",
    );
    const withoutRange = await exportOf("agrupar=proyecto");

    expect(fileNameOf(invalid)).toBe("reporte_persona_2026-09-28_2026-10-04.csv");
    expect(await textOf(invalid)).toBe(await textOf(empty));
    expect(fileNameOf(repeated)).toBe("reporte_proyecto_2026-09-28_2026-10-04.csv");
    const repeatedText = await textOf(repeated);
    expect(repeatedText).toBe(await textOf(withoutRange));
    expect(repeatedText).toContain('"Entrada propia"');
  });

  it("si entryList rechaza, 500 con el texto, no-store y console.error", async () => {
    await signInAs();
    const failure = new Error("la base no responde");
    vi.spyOn(reportRepository, "entryList").mockRejectedValue(failure);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await exportOf(weekQuery);

    expect(response.status).toBe(500);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Disposition")).toBeNull();
    expect(await response.text()).toBe(reportMessages.exportFailed);
    expect(consoleError).toHaveBeenCalledWith(failure);
  });
});

describe("exportBodyOf y exportFileNameOf (D-R6-3, D-R6-5; criterio 10 de R6)", () => {
  it("con maxBytes menor que el archivo, la nota de las entradas y ninguna fila; con uno mayor, las filas", async () => {
    const memberId = await signInAs();
    await seedHour(memberId, "Entrada propia");
    const state = await getReportExport(
      actorIn(seeded.workspaceId, memberId),
      settings,
      {
        range: { first: "2026-09-28", last: "2026-10-04" },
        groupBy: null,
        subgroups: [],
        filters: { people: [], clients: [], projects: [], withoutProject: false },
      },
      new Date("2026-10-08T15:00:00Z"),
    );
    if (state.kind !== "ready") {
      throw new Error(`Se esperaba la exportación y llegó ${state.kind}.`);
    }
    const input = { ...state, exporter: "Persona de prueba" };
    const decode = (bytes: Uint8Array) =>
      new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
    const note = exportLabels.entriesLimit(REPORT_EXPORT_MAX_ENTRIES);

    const full = decode(await exportBodyOf(input, settings, "csv", 4_000_000));
    const fullBytes = new TextEncoder().encode(full).byteLength;
    const light = decode(await exportBodyOf(input, settings, "csv", fullBytes - 1));
    const exact = decode(await exportBodyOf(input, settings, "csv", fullBytes));

    expect(full).toContain('"Entrada propia"');
    expect(full).not.toContain(note);
    expect(light).toContain(note);
    expect(light).not.toContain("Entrada propia");
    expect(exact).toBe(full);
    expect(exportFileNameOf(state.report, "csv")).toBe(
      "reporte_persona_2026-09-28_2026-10-04.csv",
    );
  });
});
