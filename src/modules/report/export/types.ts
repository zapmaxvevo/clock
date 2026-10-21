import type { ReportChart } from "@/modules/report/schema";
import type { DurationFormat } from "@/server/time";

/** D-R6-6: qué es cada celda; cómo se escribe lo decide cada formato. */
export type ExportCell =
  | { readonly kind: "text"; readonly text: string }
  /** El número de nivel del resumen. */
  | { readonly kind: "integer"; readonly value: number }
  /** Una clave de día, «2026-10-01». */
  | { readonly kind: "day"; readonly dayKey: string }
  /** Una hora de reloj de 24 h, «09:30». */
  | { readonly kind: "clock"; readonly clock: string }
  /** Una duración en segundos enteros: «Duración», en el formato del documento. */
  | { readonly kind: "duration"; readonly seconds: number }
  /** La misma duración, como horas de sus minutos truncados: «Horas». */
  | { readonly kind: "hours"; readonly minutes: number }
  | { readonly kind: "empty" };

export type ExportRow = readonly ExportCell[];

/** Una tabla con título: «Resumen» o «Entradas». En CSV, una sección; en Excel, una hoja. */
export type ExportSection = {
  readonly title: string;
  readonly rows: readonly ExportRow[];
};

export type ExportDocument = {
  /** D-R6-8, una fila por dato. */
  readonly header: readonly ExportRow[];
  /** D-R7-12: el de la pantalla; `null` sin filas (D-R5-6). CSV y Excel no lo escriben. */
  readonly chart: ReportChart | null;
  /** El resumen y, si se leyeron, las entradas, en ese orden (D-R7-3). */
  readonly sections: readonly ExportSection[];
  /** El del workspace (ADR 0029): cómo escribe cada formato la celda `duration`. */
  readonly durationFormat: DurationFormat;
};

/** D-R6-6, D-R6-13, D-R7-3: cómo se sirve y se escribe un formato. */
export type ExportWriter = {
  readonly contentType: string;
  /** D-R7-2: si el formato lleva las entradas una por una. */
  readonly entries: boolean;
  readonly write: (document: ExportDocument) => Promise<Uint8Array<ArrayBuffer>>;
};
