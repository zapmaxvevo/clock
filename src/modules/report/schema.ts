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

/** Los dos períodos tienen los mismos extremos. */
export function sameRange(left: ReportRange, right: ReportRange): boolean {
  return left.first === right.first && left.last === right.last;
}

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

export const REPORT_GROUP_BYS = [
  "person",
  "project",
  "client",
  "task",
  "tag",
  "date",
] as const;
export type ReportGroupBy = (typeof REPORT_GROUP_BYS)[number];

/** El valor de `agrupar` en la URL de cada agrupación: con este mapa se lee y se escribe. */
export const REPORT_GROUP_PARAMS = {
  person: "persona",
  project: "proyecto",
  client: "cliente",
  task: "tarea",
  tag: "etiqueta",
  date: "fecha",
} as const satisfies Record<ReportGroupBy, string>;

/** La agrupación que escribe `value` en la URL, o `undefined`. Distingue mayúsculas. */
function groupByOfParam(value: unknown): ReportGroupBy | undefined {
  return REPORT_GROUP_BYS.find((groupBy) => REPORT_GROUP_PARAMS[groupBy] === value);
}

/** `?agrupar=persona|proyecto|cliente|tarea|etiqueta|fecha` con `safeParse`, aparte del rango; cualquier otro valor se descarta. */
export const reportGroupParams = z
  .object({ agrupar: z.string() })
  .transform(({ agrupar }) => groupByOfParam(agrupar))
  .pipe(z.enum(REPORT_GROUP_BYS));

/**
 * RP-12, D-R3-6: cuántas filas pueden sumar los niveles de un árbol. Acota lo
 * que se lee de los niveles 2 y 3, no el primero. El mismo de R6 y R7.
 */
export const REPORT_MAX_ROWS = 3000;

/** Los niveles de un reporte: el primero y, debajo, hasta dos más, sin repetir (RP-12). */
export type ReportGrouping = {
  readonly groupBy: ReportGroupBy;
  readonly subgroups: readonly ReportGroupBy[];
};

/**
 * `?subagrupar=fecha,etiqueta` con `safeParse` (D-R3-5): uno o dos valores
 * distintos entre sí y del primer nivel efectivo, que lee de `agrupar` sin
 * validarlo ni devolverlo (`persona` si no es válido o falta). Cualquier otra
 * cosa se descarta entera: un valor vacío o desconocido, tres valores o el
 * parámetro repetido.
 */
export const reportSubgroupParams = z
  .object({ agrupar: z.unknown().optional(), subagrupar: z.string() })
  .transform(({ agrupar, subagrupar }) => ({
    first: groupByOfParam(agrupar) ?? "person",
    subgroups: subagrupar.split(",").map(groupByOfParam),
  }))
  .pipe(
    z
      .object({
        first: z.enum(REPORT_GROUP_BYS),
        subgroups: z.array(z.enum(REPORT_GROUP_BYS)).min(1).max(2),
      })
      .refine(
        ({ first, subgroups }) =>
          new Set([first, ...subgroups]).size === 1 + subgroups.length,
      ),
  )
  .transform(({ subgroups }): readonly ReportGroupBy[] => subgroups);

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

/** Lo que un grupo muestra de un cliente, una tarea o una etiqueta. */
const reportNamedRef = z.object({ id: z.uuid(), name: z.string() });

/** Lo que un grupo muestra de un proyecto: el nombre y el punto de su color. */
const reportProjectRef = z.object({
  id: z.uuid(),
  name: z.string(),
  color: z.enum(PALETTE_KEYS),
});

/**
 * Un grupo con su nivel de abajo. El getter difiere la referencia a
 * `reportGroup`, que se declara después (D-R3-7).
 */
function withChildren<Shape extends z.ZodRawShape>(shape: Shape) {
  return z.object({
    ...shape,
    /**
     * D-R3-7: el nivel de abajo, ordenado. Está si se leyó y entró en el tope,
     * y entonces tiene al menos un grupo; falta en el último que se muestra.
     */
    get children() {
      return z.array(reportGroup).min(1).optional();
    },
  });
}

const reportPersonGroup = withChildren({
  kind: z.literal("person"),
  userId: z.string(),
  /** `displayNameOf`: el editado o el de la cuenta. */
  name: z.string(),
  /** RP-31, RP-61: sus horas cuentan y la fila lo dice. */
  inactive: z.boolean(),
  seconds: z.number().int().min(0),
});

const reportProjectGroup = withChildren({
  kind: z.literal("project"),
  /** `null` es «Sin proyecto» (RP-28). Archivado o no (RP-29). */
  project: reportProjectRef.nullable(),
  /** En gris; `null` sin cliente o sin proyecto. */
  client: reportNamedRef.nullable(),
  seconds: z.number().int().min(0),
});

const reportClientGroup = withChildren({
  kind: z.literal("client"),
  /**
   * `null` es «Sin cliente»: las entradas sin proyecto y las de proyectos sin
   * cliente (RP-28). Archivado o no (RP-29).
   */
  client: reportNamedRef.nullable(),
  seconds: z.number().int().min(0),
});

const reportTaskGroup = withChildren({
  kind: z.literal("task"),
  /**
   * `null` es «Sin tarea»: las entradas de un proyecto sin tarea y las sin
   * proyecto (RP-28). Hecha o no (RP-29).
   */
  task: reportNamedRef.nullable(),
  /** El proyecto de la tarea, en gris; `null` con «Sin tarea». */
  project: reportProjectRef.nullable(),
  seconds: z.number().int().min(0),
});

const reportTagGroup = withChildren({
  kind: z.literal("tag"),
  /** `null` es «Sin etiqueta»: las entradas sin ninguna (RP-28). Archivada o no. */
  tag: reportNamedRef.nullable(),
  /** Una entrada con varias etiquetas suma en cada una (RP-18, D-R3-3). */
  seconds: z.number().int().min(0),
});

const reportDateGroup = withChildren({
  kind: z.literal("date"),
  /** El día civil en la zona de quien mira (RP-22). */
  dayKey: z.string(),
  /** `weekdayLabel`: «jue, 01/10», con año si no es el de hoy (D-R2b-6). */
  label: z.string(),
  seconds: z.number().int().min(0),
});

const reportGroup = z.discriminatedUnion("kind", [
  reportPersonGroup,
  reportProjectGroup,
  reportClientGroup,
  reportTaskGroup,
  reportTagGroup,
  reportDateGroup,
]);

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
  /** Los niveles pedidos debajo del primero, de `subagrupar` (D-R3-5). */
  subgroups: z.array(z.enum(REPORT_GROUP_BYS)).max(2),
  /** Los niveles leídos que entran en el tope: menos que los pedidos si no (D-R3-6). */
  levelsShown: z.number().int().min(1).max(3),
  /** Lo que dice la línea del alcance (D-R2a-2). */
  scope: z.enum(["everyone", "self"]),
  /** La zona con que se cortaron los días, tal como está en el perfil (D-R2a-5). */
  timeZone: z.string(),
  /**
   * Exactos y reales: la suma de los grupos (D-R2a-7) o, por etiqueta, la de
   * las entradas, que no pasa por la unión con las etiquetas (D-R3-3).
   */
  totalSeconds: z.number().int().min(0),
  billableSeconds: z.number().int().min(0),
  /** El primer nivel, en el orden de D-R2a-3, con los de abajo en `children`. */
  groups: z.array(reportGroup),
});

export type ReportReadyState = z.infer<typeof reportReadyState>;
export type ReportGroup = z.infer<typeof reportGroup>;
export type ReportPersonGroup = z.infer<typeof reportPersonGroup>;
export type ReportProjectGroup = z.infer<typeof reportProjectGroup>;
export type ReportClientGroup = z.infer<typeof reportClientGroup>;
export type ReportTaskGroup = z.infer<typeof reportTaskGroup>;
export type ReportTagGroup = z.infer<typeof reportTagGroup>;
export type ReportDateGroup = z.infer<typeof reportDateGroup>;
export type ReportShortcut = z.infer<typeof reportShortcut>;

export type ReportState =
  | ReportReadyState
  /** RP-07: sin `report.view`. No se leyó nada. */
  | { readonly kind: "forbidden" };
