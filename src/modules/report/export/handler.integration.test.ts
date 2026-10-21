import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { Workbook, type Worksheet } from "exceljs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { projectLabels } from "@/modules/project/components/labels";
import { db } from "@/server/db";
import { membership, user } from "@/server/db/schema";
import type { MembershipStatus, Role } from "@/server/permissions";
import {
  buenosAires,
  seedTimeEntry,
  seedUser,
  seedWorkspace,
  setDurationFormat,
  type SeededWorkspace,
} from "@/test/factories";
import { pdfPageTexts, type PdfPageText } from "@/test/pdf";
import { actorIn, workspaceOf } from "@/test/time-entry";

import {
  REPORT_EXPORT_MAX_BYTES,
  REPORT_EXPORT_MAX_ENTRIES,
  reportMessages,
  type ReportExportFormat,
} from "../schema";
import { reportRepository } from "../repository";
import { getReportExport } from "../service";
import { exportLabels } from "./labels";
import type * as pdfModule from "./pdf";
import type { ExportDocument } from "./types";

/**
 * La ruta de exportación con las tres puertas de Next y de Better Auth
 * reemplazadas, como en las actions: el resto corre de verdad
 * (`requireSession`, `reportRequestOf`, `can()`, el service, la base, el
 * documento y los escritores de CSV, de Excel y de PDF).
 */
const mocks = vi.hoisted(() => ({
  sessionUser: null as null | { id: string; email: string },
  redirects: [] as string[],
  /** Los bytes que se le suman al PDF escrito: la guarda del peso (D-R7-7). */
  pdfPadding: 0,
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

// El escritor de verdad; solo el caso de la guarda del peso le suma bytes.
vi.mock("./pdf", async (importOriginal) => {
  const original = await importOriginal<typeof pdfModule>();
  return {
    pdfBytesOf: async (document: ExportDocument) => {
      const bytes = await original.pdfBytesOf(document);
      const padded = new Uint8Array(bytes.byteLength + mocks.pdfPadding);
      padded.set(bytes);
      return padded;
    },
  };
});

const { exportBodyOf, exportFileNameOf, handleReportExport } = await import("./handler");

/** La semana del lunes 28/09/2026 con agrupar persona → proyecto. */
const weekQuery = "desde=2026-09-28&hasta=2026-10-04&agrupar=persona&subagrupar=proyecto";

const settings = workspaceOf(buenosAires);

/**
 * El reloj de los tests que comparan dos archivos: «Generado» sale de él. Solo
 * se falsea `Date`; la base usa sus propios temporizadores.
 */
const fakeNow = new Date("2026-10-01T15:00:00Z");

const FILE_NAME = /^reporte_[a-z-]+_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/;

let seeded: SeededWorkspace;

beforeEach(async () => {
  mocks.sessionUser = null;
  mocks.redirects.length = 0;
  mocks.pdfPadding = 0;
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

function exportAs(format: ReportExportFormat, query: string): Promise<Response> {
  return handleReportExport(
    new Request(`http://localhost:3000/reportes/exportar/${format}?${query}`),
    format,
  );
}

function exportOf(query: string): Promise<Response> {
  return exportAs("csv", query);
}

/** La hoja de un `.xlsx` descargado, leída con la biblioteca (D-R6-12: solo los tests leen). */
async function sheetOf(response: Response, name: string): Promise<Worksheet> {
  const workbook = new Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  const sheet = workbook.getWorksheet(name);
  if (sheet === undefined) {
    throw new Error(`Falta la hoja ${name}.`);
  }
  return sheet;
}

/** Los textos de todas las celdas de una hoja. */
function sheetTexts(sheet: Worksheet): string[] {
  const texts: string[] = [];
  sheet.eachRow((row) =>
    row.eachCell((cell) => {
      if (typeof cell.value === "string") {
        texts.push(cell.value);
      }
    }),
  );
  return texts;
}

/** El cuerpo como texto, con el BOM, que `TextDecoder` quitaría por omisión. */
async function textOf(response: Response): Promise<string> {
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(
    await response.arrayBuffer(),
  );
}

/** D-R7-10: el texto de cada página del PDF descargado. */
async function pdfTextsOf(response: Response): Promise<readonly PdfPageText[]> {
  return pdfPageTexts(new Uint8Array(await response.arrayBuffer()));
}

/** Todo el texto del PDF, página tras página. */
function allTextOf(pages: readonly PdfPageText[]): string {
  return pages.map(({ text }) => text).join(" ");
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
    vi.useFakeTimers({ toFake: ["Date"], now: fakeNow });
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
    // «Esta semana» sale del reloj: ningún `desde` repetido cae en ella, así
    // quedarse con el primero o el último da otro archivo.
    vi.useFakeTimers({ toFake: ["Date"], now: fakeNow });
    const memberId = await signInAs();
    await seedHour(memberId, "Entrada propia");

    const invalid = await exportOf(
      "desde=2026-13-01&hasta=2026-10-04&agrupar=cualquiera",
    );
    const empty = await exportOf("");
    const repeated = await exportOf(
      "desde=2026-09-21&desde=2026-09-14&hasta=2026-10-04&agrupar=proyecto",
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
        peopleWithoutTime: false,
      },
      { entries: true },
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

describe("las personas sin horas en el archivo (D-R9-10; criterio 15 de R9)", () => {
  /** El nombre de cuenta y el ingreso antes de la semana (D-R9-2). */
  async function prepare(userId: string, name: string) {
    await db.update(user).set({ name }).where(eq(user.id, userId));
    await db
      .update(membership)
      .set({ createdAt: new Date("2026-01-01T00:00:00Z") })
      .where(
        and(
          eq(membership.workspaceId, seeded.workspaceId),
          eq(membership.userId, userId),
        ),
      );
  }

  /** Una persona activa del workspace sembrado, sin horas. */
  async function seedIdle(name: string) {
    const userId = await seedUser();
    await db
      .insert(membership)
      .values({ workspaceId: seeded.workspaceId, userId, role: "member" });
    await prepare(userId, name);
    return userId;
  }

  /** La sección «Entradas» de un CSV, desde su título. */
  function entriesOf(text: string): string {
    const start = text.indexOf(`"${exportLabels.entries}"\r\n`);
    expect(start).toBeGreaterThan(0);
    return text.slice(start);
  }

  it("el CSV y el Excel de un admin con sin-horas=1: la fila de la cabecera, las filas sin horas en el resumen y las mismas entradas", async () => {
    const adminId = await signInAs("active", "admin");
    await prepare(adminId, "Admin");
    await prepare(seeded.ownerId, "Owner");
    await seedIdle("Beto");
    await seedHour(adminId, "Entrada del admin");

    const withOption = await textOf(await exportOf(`${weekQuery}&sin-horas=1`));
    const without = await textOf(await exportOf(weekQuery));

    expect(withOption).toContain(
      `"Agrupado por";"Persona / Proyecto"\r\n"Personas sin horas";"Sí"\r\n"Total"`,
    );
    expect(withOption).toContain(
      `"1";"Admin";"";"1:00";"1,00"\r\n"2";"Admin";"Sin proyecto";"1:00";"1,00"\r\n` +
        `"1";"Beto";"";"0:00";"0,00"\r\n"1";"Owner";"";"0:00";"0,00"\r\n\r\n`,
    );
    expect(entriesOf(withOption)).toBe(entriesOf(without));
    expect(without).not.toContain("Personas sin horas");
    expect(without).not.toContain('"Beto"');

    const xlsx = await exportAs("xlsx", `${weekQuery}&sin-horas=1`);
    const summary = await sheetOf(xlsx, exportLabels.summary);
    const rows: unknown[][] = [];
    summary.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
    expect(rows).toContainEqual([exportLabels.peopleWithoutTime, exportLabels.yes]);
    const levelOne = rows.filter(([level]) => level === 1).map(([, name]) => name);
    expect(levelOne).toEqual(["Admin", "Beto", "Owner"]);
  });

  it("un member con sin-horas=1&personas=<otra> baja el mismo archivo que sin esos parámetros", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: fakeNow });
    const otherId = await seedIdle("Otra Persona");
    const memberId = await signInAs();
    await prepare(memberId, "Member");
    await seedHour(memberId, "Entrada propia");

    const text = await textOf(
      await exportOf(`${weekQuery}&sin-horas=1&personas=${otherId}`),
    );

    expect(text).toBe(await textOf(await exportOf(weekQuery)));
    expect(text).not.toContain("Personas sin horas");
    expect(text).not.toContain("Otra Persona");
    expect(text).toContain('"Entrada propia"');
  });

  it("el PDF de un admin con sin-horas=1: «Personas sin horas Sí» después de «Agrupado por» y la fila sin horas (criterio 9 de R7)", async () => {
    const adminId = await signInAs("active", "admin");
    await prepare(adminId, "Admin");
    await prepare(seeded.ownerId, "Owner");
    await seedIdle("Beto");
    await seedHour(adminId, "Entrada del admin");

    const pages = await pdfTextsOf(await exportAs("pdf", `${weekQuery}&sin-horas=1`));

    expect(allTextOf(pages)).toContain(
      "Agrupado por Persona / Proyecto Personas sin horas Sí",
    );
    const rows = pages.flatMap((page) => page.rows);
    expect(rows).toContain("1 Beto 0:00 0,00");
    expect(rows).toContain("1 Owner 0:00 0,00");
    expect(rows).toContain("1 Admin 1:00 1,00");
  });

  it("el PDF de un member con sin-horas=1&personas=<otra> es el mismo que sin esos parámetros (criterio 9 de R7)", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: fakeNow });
    const otherId = await seedIdle("Otra Persona");
    const memberId = await signInAs();
    await prepare(memberId, "Member");
    await seedHour(memberId, "Entrada propia");

    const pages = await pdfTextsOf(
      await exportAs("pdf", `${weekQuery}&sin-horas=1&personas=${otherId}`),
    );

    expect(pages).toEqual(await pdfTextsOf(await exportAs("pdf", weekQuery)));
    expect(allTextOf(pages)).not.toContain("Personas sin horas");
    expect(allTextOf(pages)).not.toContain("Otra Persona");
    expect(pages.flatMap((page) => page.rows)).toContain("1 Member 1:00 1,00");
  });
});

describe("el formato de duración del workspace (D-WS2b-9, WS-17, WS-69; criterio 10 de WS2b)", () => {
  /** Dos entradas de 100 segundos el martes 29/09, a las 10:00 y a las 11:00 de Buenos Aires. */
  async function seedTwoShort(userId: string) {
    for (const [hour, description] of [
      ["13", "Corta de las 10"],
      ["14", "Corta de las 11"],
    ]) {
      await seedTimeEntry({
        workspaceId: seeded.workspaceId,
        userId,
        description,
        startedAt: `2026-09-29T${hour}:00:00Z`,
        endedAt: `2026-09-29T${hour}:01:40Z`,
      });
    }
  }

  it("el CSV en completo trae «Duración» en `hh:mm:ss` y las mismas horas que en compacto", async () => {
    const memberId = await signInAs();
    await seedTwoShort(memberId);
    vi.useFakeTimers({ toFake: ["Date"], now: fakeNow });

    const compact = await textOf(await exportOf(weekQuery));
    await setDurationFormat(seeded.workspaceId, "full");
    const full = await textOf(await exportOf(weekQuery));

    expect(compact).toContain('"Total";"0:03";"0,05"');
    expect(full).toContain('"Total";"00:03:20";"0,05"');
    expect(full).toContain('"Corta de las 10";"";"No";"00:01:40";"0,01"');
    // Lo único que cambia es «Duración»: las filas, su orden y «Horas» son los mismos.
    expect(full).toBe(
      compact
        .replaceAll('"0:03"', '"00:03:20"')
        .replaceAll('"0:01"', '"00:01:40"')
        .replaceAll('"0:00"', '"00:00:00"'),
    );
  });

  it("el Excel en completo guarda los segundos con `[hh]:mm:ss`", async () => {
    const memberId = await signInAs();
    await seedTwoShort(memberId);
    await setDurationFormat(seeded.workspaceId, "full");

    const sheet = await sheetOf(await exportAs("xlsx", weekQuery), exportLabels.entries);
    const durations: { value: unknown; numFmt: string }[] = [];
    sheet.eachRow((row) =>
      row.eachCell((cell) => {
        if (cell.numFmt === "[hh]:mm:ss") {
          durations.push({ value: cell.value, numFmt: cell.numFmt });
        }
      }),
    );

    // El total, el facturable y las dos entradas; la biblioteca devuelve un `Date`.
    expect(durations).toHaveLength(4);
    expect(durations.map(({ value }) => value instanceof Date)).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });
});

describe("la ruta en Excel (D-R6-12; criterio 17 de R6)", () => {
  it("200 con el Content-Type de .xlsx, el nombre .xlsx, no-store y un ZIP con la hoja Entradas", async () => {
    const memberId = await signInAs();
    await seedHour(memberId, "Entrada propia");

    const response = await exportAs("xlsx", weekQuery);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="reporte_persona-proyecto_2026-09-28_2026-10-04.xlsx"',
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = new Uint8Array(await response.clone().arrayBuffer());
    expect([...body.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(sheetTexts(await sheetOf(response, "Entradas"))).toContain("Entrada propia");
  });
});

describe("el tope de las entradas es el mismo en CSV y en Excel (B4 de R6a)", () => {
  /** `count` entradas del member con la misma descripción. */
  async function seedMany(userId: string, count: number, description: string) {
    await db.execute(sql`
      insert into time_entry (workspace_id, user_id, description, started_at, ended_at, billable)
      select ${seeded.workspaceId}, ${userId}, ${description},
             timestamptz '2026-09-29 13:00:00+00',
             timestamptz '2026-09-29 14:00:00+00',
             false
        from generate_series(1, ${count})`);
  }

  const note = exportLabels.entriesLimit(REPORT_EXPORT_MAX_ENTRIES);
  const heavy = "😀".repeat(3000);

  /**
   * 3000 emojis de descripción, 12 000 bytes: con 334 entradas la cota pasa
   * los 4 MB; con 300, no.
   */
  function seedHeavy(userId: string, count: number) {
    return seedMany(userId, count, heavy);
  }

  it("con la cota pasada, los dos salen sin entradas, aunque el Excel comprimido pese menos", async () => {
    const memberId = await signInAs();
    await seedHeavy(memberId, 334);

    const csv = await exportAs("csv", weekQuery);
    const xlsx = await exportAs("xlsx", weekQuery);

    const csvText = await textOf(csv);
    expect(csvText).toContain(note);
    expect(csvText).not.toContain(heavy);
    const xlsxBytes = (await xlsx.clone().arrayBuffer()).byteLength;
    expect(xlsxBytes).toBeLessThan(REPORT_EXPORT_MAX_BYTES);
    const texts = sheetTexts(await sheetOf(xlsx, "Entradas"));
    expect(texts).toContain(note);
    expect(texts).not.toContain(heavy);
  });

  it("con la cota debajo, los dos salen con todas las entradas", async () => {
    const memberId = await signInAs();
    await seedHeavy(memberId, 300);

    const csv = await exportAs("csv", weekQuery);
    const xlsx = await exportAs("xlsx", weekQuery);

    const csvText = await textOf(csv);
    expect(csvText).not.toContain(note);
    expect(csvText.split(heavy)).toHaveLength(301);
    const texts = sheetTexts(await sheetOf(xlsx, "Entradas"));
    expect(texts).not.toContain(note);
    expect(texts.filter((text) => text === heavy)).toHaveLength(300);
  });

  it("con la cota debajo y el CSV escrito arriba de 4 MB, los dos salen sin entradas", async () => {
    // 3000 comillas: la cota cuenta 3000 bytes por entrada y el CSV, 6000,
    // porque las duplica. Con 1000 entradas, unos 3,1 MB contra unos 6,1 MB.
    const quotes = '"'.repeat(3000);
    const memberId = await signInAs();
    await seedMany(memberId, 1000, quotes);
    const entryList = vi.spyOn(reportRepository, "entryList");

    const csv = await exportAs("csv", weekQuery);
    const xlsx = await exportAs("xlsx", weekQuery);

    // La cota previa dejó listar las entradas en los dos pedidos.
    expect(entryList).toHaveBeenCalledTimes(2);
    const csvText = await textOf(csv);
    expect(csvText).toContain(note);
    expect(csvText).not.toContain(quotes);
    const texts = sheetTexts(await sheetOf(xlsx, "Entradas"));
    expect(texts).toContain(note);
    expect(texts).not.toContain(quotes);
  });
});

describe("la ruta en PDF (D-R7-2, D-R7-3, D-R7-7; criterio 9 de R7)", () => {
  it("200 con application/pdf, attachment con el nombre .pdf, no-store exacto y el resumen sin leer las entradas", async () => {
    const memberId = await signInAs();
    await db.update(user).set({ name: "Persona Miembro" }).where(eq(user.id, memberId));
    await seedHour(memberId, "Entrada propia");
    const entryList = vi.spyOn(reportRepository, "entryList");
    const entryListSize = vi.spyOn(reportRepository, "entryListSize");
    const limit = vi.spyOn(reportRepository, "limitStatementTime");

    const response = await exportAs("pdf", weekQuery);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="reporte_persona-proyecto_2026-09-28_2026-10-04.pdf"',
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = new Uint8Array(await response.clone().arrayBuffer());
    expect(new TextDecoder("latin1").decode(body.slice(0, 5))).toBe("%PDF-");
    expect(entryList).not.toHaveBeenCalled();
    expect(entryListSize).not.toHaveBeenCalled();
    expect(limit).toHaveBeenCalledTimes(1);
    const pages = await pdfTextsOf(response);
    const text = allTextOf(pages);
    expect(text).toContain("Solo las horas de Persona de prueba");
    expect(text).toContain("Página 1 de 1");
    expect(text).not.toContain("Entrada propia");
    expect(text).not.toContain(exportLabels.entries);
    expect(pages.flatMap((page) => page.rows)).toEqual([
      "1 Persona Miembro 1:00 1,00",
      `2 Persona Miembro ${projectLabels.noProject} 1:00 1,00`,
    ]);
  });

  it("un member con personas=<otra> no recibe el nombre de la otra persona", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: fakeNow });
    const otherId = await seedUser();
    await db.update(user).set({ name: "Otra Persona" }).where(eq(user.id, otherId));
    await db
      .insert(membership)
      .values({ workspaceId: seeded.workspaceId, userId: otherId, role: "member" });
    await seedHour(otherId, "Entrada ajena");
    const memberId = await signInAs();
    await seedHour(memberId, "Entrada propia");

    const pages = await pdfTextsOf(
      await exportAs("pdf", `${weekQuery}&personas=${otherId}`),
    );

    expect(pages.some(({ text }) => text.includes("Otra Persona"))).toBe(false);
    expect(pages).toEqual(await pdfTextsOf(await exportAs("pdf", weekQuery)));
  });

  it("con la membresía inactiva, 403 con no-store; si totalsByLevels rechaza, 500 con no-store", async () => {
    await signInAs("inactive");
    const forbidden = await exportAs("pdf", weekQuery);
    expect(forbidden.status).toBe(403);
    expect(forbidden.headers.get("Cache-Control")).toBe("no-store");
    expect(forbidden.headers.get("Content-Disposition")).toBeNull();

    await signInAs();
    const failure = new Error("la base no responde");
    vi.spyOn(reportRepository, "totalsByLevels").mockRejectedValue(failure);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failed = await exportAs("pdf", weekQuery);
    expect(failed.status).toBe(500);
    expect(failed.headers.get("Cache-Control")).toBe("no-store");
    expect(failed.headers.get("Content-Disposition")).toBeNull();
    expect(await failed.text()).toBe(reportMessages.exportFailed);
    expect(consoleError).toHaveBeenCalledWith(failure);
  });

  it("sin entradas, un PDF que pasa maxBytes es un RangeError; por la ruta, 500", async () => {
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
        peopleWithoutTime: false,
      },
      { entries: false },
      new Date("2026-10-08T15:00:00Z"),
    );
    if (state.kind !== "ready") {
      throw new Error(`Se esperaba la exportación y llegó ${state.kind}.`);
    }
    const input = { ...state, exporter: "Persona de prueba" };

    const body = await exportBodyOf(input, settings, "pdf", REPORT_EXPORT_MAX_BYTES);
    await expect(
      exportBodyOf(input, settings, "pdf", body.byteLength - 1),
    ).rejects.toBeInstanceOf(RangeError);
    expect((await exportBodyOf(input, settings, "pdf", body.byteLength)).byteLength).toBe(
      body.byteLength,
    );

    mocks.pdfPadding = REPORT_EXPORT_MAX_BYTES;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await exportAs("pdf", weekQuery);
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(consoleError.mock.calls[0]?.[0]).toBeInstanceOf(RangeError);
  });

  it("CSV y Excel siguen pidiendo las entradas", async () => {
    const memberId = await signInAs();
    await seedHour(memberId, "Entrada propia");
    const entryListSize = vi.spyOn(reportRepository, "entryListSize");
    const entryList = vi.spyOn(reportRepository, "entryList");

    await exportAs("csv", weekQuery);
    await exportAs("xlsx", weekQuery);

    expect(entryListSize).toHaveBeenCalledTimes(2);
    expect(entryList).toHaveBeenCalledTimes(2);
  });
});
