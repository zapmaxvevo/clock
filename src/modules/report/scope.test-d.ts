/**
 * D-R2a-1, D-R2a-12: lo que no compila sin el alcance. Lo revisa
 * `npm run typecheck`; vitest no lo corre. Cada directiva falla si el
 * compilador deja de dar el error.
 */
import { reportRepository, type ReportSpan } from "./repository";
import type * as service from "./service";
import type { ReportScope } from "./service";

const span: ReportSpan = { from: new Date(0), to: new Date(0) };

// @ts-expect-error: un literal con workspaceId y people no es un ReportScope; solo scopeOf lo construye.
export const forged: ReportScope = { workspaceId: "w", people: { kind: "everyone" } };

export async function readsWithoutScope() {
  // @ts-expect-error: totalsByPerson exige el alcance como primer parámetro.
  await reportRepository.totalsByPerson(span);
  // @ts-expect-error: totalsByProject exige el alcance como primer parámetro.
  await reportRepository.totalsByProject(span);
}

// @ts-expect-error: la clase del alcance no se exporta.
export type ExportedScope = service.Scope;
