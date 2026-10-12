import { timeSettingsOf } from "@/modules/profile/service";
import { reportRequestOf, searchParamsRecord } from "@/modules/report/request";
import {
  REPORT_EXPORT_MAX_BYTES,
  REPORT_GROUP_PARAMS,
  reportLevelsOf,
  reportMessages,
  type ReportExportFormat,
  type ReportReadyState,
} from "@/modules/report/schema";
import { getReportExport } from "@/modules/report/service";
import { requireSession } from "@/server/session";
import type { TimeSettings } from "@/server/time";

import { csvBytesOf } from "./csv";
import { exportDocumentOf, type ReportExportInput } from "./document";
import type { ExportDocument, ExportWriter } from "./types";

/** D-R6-6, D-R6-13: cómo se escribe y se sirve cada formato. R7 suma pdf. */
const EXPORT_WRITERS = {
  csv: {
    contentType: "text/csv; charset=utf-8",
    write: async (document: ExportDocument) => csvBytesOf(document),
  },
  xlsx: {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    // D-R6-12: con `import()`, ni la página ni el CSV cargan `exceljs`.
    write: async (document: ExportDocument) =>
      (await import("./xlsx")).xlsxBytesOf(document),
  },
} as const satisfies Record<ReportExportFormat, ExportWriter>;

/** D-R6-5: el archivo tiene horas y nombres de otras personas; ninguna caché lo guarda. */
const NO_STORE = "no-store";

/** D-R6-5: el 403 y el 500, en texto, sin archivo. */
function textResponse(status: 403 | 500, message: string): Response {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": NO_STORE,
    },
  });
}

/**
 * D-R6-5: `reporte_<niveles>_<desde>_<hasta>.<formato>`, solo ASCII. Los
 * niveles son los valores de `agrupar` y las fechas, claves ya validadas: no
 * entra ningún texto que alguien escriba.
 */
export function exportFileNameOf(
  report: ReportReadyState,
  format: ReportExportFormat,
): string {
  const levels = reportLevelsOf(report)
    .map((groupBy) => REPORT_GROUP_PARAMS[groupBy])
    .join("-");
  return `reporte_${levels}_${report.range.first}_${report.range.last}.${format}`;
}

/**
 * B4: el documento que se escribe. Las entradas entran si el documento
 * entero, escrito como CSV, no pasa `maxBytes`, sea cual sea el formato
 * pedido: CSV y Excel deciden lo mismo. Si no, van en «no entran».
 */
function fittingDocumentOf(
  input: ReportExportInput,
  settings: TimeSettings,
  maxBytes: number,
): ExportDocument {
  const document = exportDocumentOf(input, settings);
  if (csvBytesOf(document).byteLength <= maxBytes) {
    return document;
  }
  return exportDocumentOf({ ...input, entries: { kind: "tooMany" } }, settings);
}

/**
 * D-R6-3, B4: el archivo del documento que entra (`fittingDocumentOf`). Si el
 * archivo escrito igual pasa `maxBytes`, lo escribe otra vez con las entradas
 * en «no entran», como respaldo.
 */
export async function exportBodyOf(
  input: ReportExportInput,
  settings: TimeSettings,
  format: ReportExportFormat,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const { write } = EXPORT_WRITERS[format];
  const body = await write(fittingDocumentOf(input, settings, maxBytes));
  if (body.byteLength <= maxBytes) {
    return body;
  }
  return write(exportDocumentOf({ ...input, entries: { kind: "tooMany" } }, settings));
}

/**
 * D-R6-4, D-R6-5: la descarga de un reporte. La sesión va fuera del `try`:
 * `redirect` lanza y Next responde 307 (redirect.md:51).
 */
export async function handleReportExport(
  request: Request,
  format: ReportExportFormat,
): Promise<Response> {
  const session = await requireSession();
  try {
    const settings = timeSettingsOf(session);
    const reportRequest = reportRequestOf(
      searchParamsRecord(new URL(request.url).searchParams),
    );
    const state = await getReportExport(session.actor, settings, reportRequest);
    if (state.kind === "forbidden") {
      return textResponse(403, reportMessages.exportForbidden);
    }
    const body = await exportBodyOf(
      { ...state, exporter: session.user.name },
      settings,
      format,
      REPORT_EXPORT_MAX_BYTES,
    );
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": EXPORT_WRITERS[format].contentType,
        "Content-Disposition": `attachment; filename="${exportFileNameOf(state.report, format)}"`,
        "Cache-Control": NO_STORE,
      },
    });
  } catch (error) {
    console.error(error);
    return textResponse(500, reportMessages.exportFailed);
  }
}
