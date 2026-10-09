import { z } from "zod";

import { addDaysToKey, daysBetweenKeys, parseDayKey } from "@/server/time";
import { PALETTE_KEYS } from "@/modules/project/palette";

/** RP-21, ADR 0021: el período más largo, en días, con los dos extremos. */
export const REPORT_MAX_DAYS = 366;

export const reportMessages = {
  /** RP-34. Con el calendario de rango la interfaz no lo produce (D-R2a-4). */
  endBeforeStart: "La fecha de fin no puede ser anterior a la de inicio.",
  /** RP-34, ADR 0021. */
  rangeTooLong: `Elegí un período de hasta ${REPORT_MAX_DAYS} días.`,
  invalidDate: "Fecha inválida.",
} as const;

export type ReportRange = { readonly first: string; readonly last: string };

/** El primer problema del período, en el orden de `reportRangeInput`, o `null`. */
function rangeProblem({ first, last }: ReportRange): string | null {
  if (parseDayKey(first) === null || parseDayKey(last) === null) {
    return reportMessages.invalidDate;
  }
  // La lectura llega hasta el inicio del día siguiente al último.
  if (parseDayKey(addDaysToKey(last, 1)) === null) {
    return reportMessages.invalidDate;
  }
  const days = daysBetweenKeys(first, last);
  if (days < 0) {
    return reportMessages.endBeforeStart;
  }
  if (days + 1 > REPORT_MAX_DAYS) {
    return reportMessages.rangeTooLong;
  }
  return null;
}

/**
 * El período con los dos extremos incluidos. Una sola validación para la URL y
 * para el selector (D-R2a-4), en este orden: las claves existen, el día
 * siguiente al último tiene clave, el fin no es anterior al inicio, el largo.
 * El largo se cuenta con `daysBetweenKeys`, no comparando claves de años
 * distintos.
 */
export const reportRangeInput = z
  .object({ first: z.string(), last: z.string() })
  .superRefine((range, context) => {
    const problem = rangeProblem(range);
    if (problem !== null) {
      context.addIssue({ code: "custom", message: problem });
    }
  });

/** `?desde=…&hasta=…` con `safeParse`: un rango inválido o repetido se descarta entero (RP-32). */
export const reportRangeParams = z
  .object({ desde: z.string(), hasta: z.string() })
  .transform(({ desde, hasta }) => ({ first: desde, last: hasta }))
  .pipe(reportRangeInput);

export const REPORT_GROUP_BYS = ["person", "project", "client"] as const;
export type ReportGroupBy = (typeof REPORT_GROUP_BYS)[number];

/** El valor de `agrupar` en la URL de cada agrupación: con este mapa se lee y se escribe. */
export const REPORT_GROUP_PARAMS = {
  person: "persona",
  project: "proyecto",
  client: "cliente",
} as const satisfies Record<ReportGroupBy, string>;

/** `?agrupar=persona|proyecto|cliente` con `safeParse`, aparte del rango; cualquier otro valor se descarta. */
export const reportGroupParams = z
  .object({ agrupar: z.string() })
  .transform(({ agrupar }) =>
    REPORT_GROUP_BYS.find((groupBy) => REPORT_GROUP_PARAMS[groupBy] === agrupar),
  )
  .pipe(z.enum(REPORT_GROUP_BYS));

const reportRangeView = z.object({ first: z.string(), last: z.string() });

/** RP-20: los atajos, en el orden de la lista (D-R2b-2). */
export const REPORT_SHORTCUTS = [
  "today",
  "yesterday",
  "thisWeek",
  "lastWeek",
  "lastTwoWeeks",
  "thisMonth",
  "lastMonth",
  "thisYear",
  "lastYear",
] as const;
export type ReportShortcutId = (typeof REPORT_SHORTCUTS)[number];

const reportShortcut = z.object({
  id: z.enum(REPORT_SHORTCUTS),
  /** «Hoy», «Mes pasado»: lo que dice el enlace y, si es el período, el botón. */
  label: z.string(),
  range: reportRangeView,
});

const reportPersonGroup = z.object({
  kind: z.literal("person"),
  userId: z.string(),
  /** `displayNameOf`: el editado o el de la cuenta. */
  name: z.string(),
  /** RP-31, RP-61: sus horas cuentan y la fila lo dice. */
  inactive: z.boolean(),
  seconds: z.number().int().min(0),
});

const reportProjectGroup = z.object({
  kind: z.literal("project"),
  /** `null` es «Sin proyecto» (RP-28). Archivado o no (RP-29). */
  project: z
    .object({ id: z.uuid(), name: z.string(), color: z.enum(PALETTE_KEYS) })
    .nullable(),
  /** En gris; `null` sin cliente o sin proyecto. */
  client: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  seconds: z.number().int().min(0),
});

const reportClientGroup = z.object({
  kind: z.literal("client"),
  /**
   * `null` es «Sin cliente»: las entradas sin proyecto y las de proyectos sin
   * cliente (RP-28). Archivado o no (RP-29).
   */
  client: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  seconds: z.number().int().min(0),
});

export const reportReadyState = z.object({
  kind: z.literal("ready"),
  todayKey: z.string(),
  range: reportRangeView,
  /** El del atajo, «Mes pasado», o el de R2a: «Semana anterior», «05/10 – 18/10» (D-R2b-2). */
  rangeLabel: z.string(),
  /** `null` si el destino no pasa `reportRangeInput`. */
  previous: reportRangeView.nullable(),
  next: reportRangeView.nullable(),
  /** El destino del enlace «Esta semana». */
  currentWeek: reportRangeView,
  /** Los atajos de hoy, sin los que no pasan `reportRangeInput` (D-R2b-2). */
  shortcuts: z.array(reportShortcut),
  groupBy: z.enum(REPORT_GROUP_BYS),
  /** Lo que dice la línea del alcance (D-R2a-2). */
  scope: z.enum(["everyone", "self"]),
  /** La zona con que se cortaron los días, tal como está en el perfil (D-R2a-5). */
  timeZone: z.string(),
  /** Exactos: la suma de los grupos (D-R2a-7). */
  totalSeconds: z.number().int().min(0),
  billableSeconds: z.number().int().min(0),
  /** En el orden de D-R2a-3. */
  groups: z.array(
    z.discriminatedUnion("kind", [
      reportPersonGroup,
      reportProjectGroup,
      reportClientGroup,
    ]),
  ),
});

export type ReportReadyState = z.infer<typeof reportReadyState>;
export type ReportGroup = ReportReadyState["groups"][number];
export type ReportPersonGroup = z.infer<typeof reportPersonGroup>;
export type ReportProjectGroup = z.infer<typeof reportProjectGroup>;
export type ReportClientGroup = z.infer<typeof reportClientGroup>;
export type ReportShortcut = z.infer<typeof reportShortcut>;

export type ReportState =
  | ReportReadyState
  /** RP-07: sin `report.view`. No se leyó nada. */
  | { readonly kind: "forbidden" };
