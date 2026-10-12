/** D-R6-6: qué es cada celda; cómo se escribe lo decide cada formato. */
export type ExportCell =
  | { readonly kind: "text"; readonly text: string }
  /** El número de nivel del resumen. */
  | { readonly kind: "integer"; readonly value: number }
  /** Una clave de día, «2026-10-01». */
  | { readonly kind: "day"; readonly dayKey: string }
  /** Una hora de reloj de 24 h, «09:30». */
  | { readonly kind: "clock"; readonly clock: string }
  /** Una duración en minutos enteros, ya truncada: «Duración». */
  | { readonly kind: "duration"; readonly minutes: number }
  /** La misma duración, como horas: «Horas». */
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
  /** El resumen y las entradas, en ese orden. */
  readonly sections: readonly ExportSection[];
};

/** D-R6-6, D-R6-13: cómo se sirve y se escribe un formato (§4.8). */
export type ExportWriter = {
  readonly contentType: string;
  readonly write: (document: ExportDocument) => Promise<Uint8Array<ArrayBuffer>>;
};
