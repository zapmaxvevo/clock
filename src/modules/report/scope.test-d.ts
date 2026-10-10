/**
 * D-R2a-1, D-R2a-12: lo que no compila sin el alcance. Lo revisa
 * `npm run typecheck`; vitest no lo corre. Cada directiva falla si el
 * compilador deja de dar el error.
 */
import {
  NO_ENTRY_FILTER,
  reportRepository,
  type ReportBucketRead,
  type ReportBuckets,
  type ReportEntryRead,
  type ReportLevelRead,
  type ReportSpan,
} from "./repository";
import type * as service from "./service";
import type { ReportScope } from "./service";

const span: ReportSpan = { from: new Date(0), to: new Date(0) };
const entries: ReportEntryRead = { span, filter: NO_ENTRY_FILTER };
const read: ReportLevelRead = { ...entries, dimensions: ["person"], buckets: {} };
const bucketRead: ReportBucketRead = {
  ...entries,
  granularity: "date",
  buckets: { buckets: [], end: new Date(0) },
};

// @ts-expect-error: D-R10-4, los tramos son solo de las dimensiones de tiempo.
export const personBuckets: ReportBuckets = { person: { buckets: [], end: new Date(0) } };

// @ts-expect-error: un literal con workspaceId y people no es un ReportScope; solo scopeOf y narrowedTo lo construyen.
export const forged: ReportScope = { workspaceId: "w", people: { kind: "everyone" } };

// @ts-expect-error: un literal con personas elegidas tampoco lo es; solo narrowedTo angosta el alcance (D-R4-4).
export const forgedChosen: ReportScope = {
  workspaceId: "w",
  people: { kind: "chosen", userIds: ["u"] },
};

export async function readsWithoutScope() {
  // @ts-expect-error: totalsByLevels exige el alcance como primer parámetro.
  await reportRepository.totalsByLevels(read);
  // @ts-expect-error: el alcance de totalsByLevels no admite undefined.
  await reportRepository.totalsByLevels(undefined, read);
  // @ts-expect-error: el alcance de totalsByLevels no admite null.
  await reportRepository.totalsByLevels(null, read);
  // @ts-expect-error: totalsByBucket exige el alcance como primer parámetro.
  await reportRepository.totalsByBucket(bucketRead);
  // @ts-expect-error: el alcance de totalsByBucket no admite undefined.
  await reportRepository.totalsByBucket(undefined, bucketRead);
  // @ts-expect-error: el alcance de totalsByBucket no admite null.
  await reportRepository.totalsByBucket(null, bucketRead);
  // @ts-expect-error: entryTotals exige el alcance como primer parámetro.
  await reportRepository.entryTotals(entries);
  // @ts-expect-error: el alcance de entryTotals no admite undefined.
  await reportRepository.entryTotals(undefined, entries);
  // @ts-expect-error: el alcance de entryTotals no admite null.
  await reportRepository.entryTotals(null, entries);
}

// @ts-expect-error: la clase del alcance no se exporta.
export type ExportedScope = service.Scope;
