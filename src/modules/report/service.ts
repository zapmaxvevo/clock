import { type Actor } from "@/server/permissions";
import { type TimeSettings } from "@/server/time";

import { type ReportGroupBy, type ReportRange, type ReportState } from "./schema";

type ScopePeople =
  /** `timeEntry.others.view`: todas las personas del workspace, activas e inactivas (RP-02, RP-61). */
  | { readonly kind: "everyone" }
  /** Sin el permiso: solo quien mira (RP-01, P-01). */
  | { readonly kind: "self"; readonly userId: string };

/**
 * El alcance de las lecturas del reporte (ADR 0020, D-R2a-1). No se exporta:
 * el miembro privado la hace nominal, así que un literal con las mismas
 * propiedades no la cumple y solo este archivo la construye.
 */
class Scope {
  private readonly nominal = "report-scope";

  constructor(
    readonly workspaceId: string,
    readonly people: ScopePeople,
  ) {}
}

/** El alcance de las lecturas (D-R2a-1). Solo `scopeOf` lo construye. */
export type ReportScope = Scope;

export type ReportRequest = {
  /** El rango de la URL ya validado, o `null`: «Esta semana». */
  readonly range: ReportRange | null;
  /** La agrupación de la URL ya validada, o `null`: por persona. */
  readonly groupBy: ReportGroupBy | null;
};

/**
 * RP-10: el resumido de quien mira, armado en el servidor con su zona y su
 * primer día de la semana. `now` existe para que los tests fijen el día.
 */
export async function getReportState(
  actor: Actor,
  settings: TimeSettings,
  request: ReportRequest,
  now: Date = new Date(),
): Promise<ReportState> {
  throw new Error(
    `getReportState todavía no está implementado (${actor.workspaceId}, ${settings.timezone}, ${request.groupBy}, ${now.toISOString()}).`,
  );
}
