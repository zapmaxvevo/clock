import { z } from "zod";

import {
  addDaysToKey,
  daysBetweenKeys,
  parseDayKey,
  type DayKeyRange,
} from "@/server/time";
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

export type ReportRange = DayKeyRange;

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
  "week",
  "month",
  "description",
] as const;
export type ReportGroupBy = (typeof REPORT_GROUP_BYS)[number];

/** ADR 0021: las dimensiones que se cortan en tramos de tiempo, en la zona de quien mira. */
export const REPORT_TIME_GROUP_BYS = [
  "date",
  "week",
  "month",
] as const satisfies readonly ReportGroupBy[];
export type ReportTimeGroupBy = (typeof REPORT_TIME_GROUP_BYS)[number];

/** RP-15, ADR 0021, D-R5-4: hasta 31 días, una barra por día. */
export const REPORT_CHART_DAILY_MAX_DAYS = 31;

/** D-R5-4: hasta 26 semanas, una por semana; más, una por mes. */
export const REPORT_CHART_WEEKLY_MAX_DAYS = 182;

/**
 * Las barras del peor caso: 31 por día. Por semana son hasta 27 —el primer y
 * el último tramo pueden ser parciales— y por mes hasta 13, con 366 días.
 */
export const REPORT_CHART_MAX_BARS = REPORT_CHART_DAILY_MAX_DAYS;

/** D-R2a-3: el primer nivel sin un `agrupar` válido. */
export const DEFAULT_GROUP_BY = "person" satisfies ReportGroupBy;

/** El valor de `agrupar` en la URL de cada agrupación: con este mapa se lee y se escribe. */
export const REPORT_GROUP_PARAMS = {
  person: "persona",
  project: "proyecto",
  client: "cliente",
  task: "tarea",
  tag: "etiqueta",
  date: "fecha",
  week: "semana",
  month: "mes",
  description: "descripcion",
} as const satisfies Record<ReportGroupBy, string>;

/** La agrupación que escribe `value` en la URL, o `undefined`. Distingue mayúsculas. */
function groupByOfParam(value: unknown): ReportGroupBy | undefined {
  return REPORT_GROUP_BYS.find((groupBy) => REPORT_GROUP_PARAMS[groupBy] === value);
}

/** `?agrupar=persona|proyecto|cliente|tarea|etiqueta|fecha|semana|mes|descripcion` con `safeParse`, aparte del rango; cualquier otro valor se descarta. */
export const reportGroupParams = z
  .object({ agrupar: z.string() })
  .transform(({ agrupar }) => groupByOfParam(agrupar))
  .pipe(z.enum(REPORT_GROUP_BYS));

/**
 * RP-12, D-R3-6, D-R10-10: cuántas filas pueden sumar los niveles de un árbol.
 * Acota lo que se lee de todos los niveles, también el primero, que entra
 * entero o no se muestra. El mismo de R6 y R7.
 */
export const REPORT_MAX_ROWS = 3000;

/** D-R10-9: cuántos caracteres de una descripción viajan, en puntos de código como `left()`. */
export const REPORT_DESCRIPTION_SHOWN = 100;

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
    first: groupByOfParam(agrupar) ?? DEFAULT_GROUP_BY,
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

/** D-R4-2: cuántos valores lleva como mucho cada filtro de la URL; `sin-proyecto` cuenta. */
export const REPORT_MAX_FILTER_VALUES = 50;

/** RP-26: el valor de `proyectos` que elige las entradas sin proyecto. */
export const REPORT_WITHOUT_PROJECT = "sin-proyecto";

/** Los filtros de un reporte, ya validados. Una lista vacía no filtra (D-R4-3). */
export type ReportFilters = {
  /** Ids de `user`, tal cual; solo con `timeEntry.others.view` (D-R4-4). */
  readonly people: readonly string[];
  readonly clients: readonly string[];
  readonly projects: readonly string[];
  /** RP-26: «Sin proyecto», con los proyectos o sola. Cuenta uno en el tope de los proyectos. */
  readonly withoutProject: boolean;
};

export const NO_REPORT_FILTERS: ReportFilters = {
  people: [],
  clients: [],
  projects: [],
  withoutProject: false,
};

/** Cuántos valores lleva el filtro de proyecto: «Sin proyecto» cuenta uno (D-R4-2). */
export function projectFilterCount(
  projects: readonly string[],
  withoutProject: boolean,
): number {
  return projects.length + (withoutProject ? 1 : 0);
}

/** Algún filtro elige algo: lo que separa el segundo vacío del primero (D-R4-7). */
export function hasReportFilters(filters: ReportFilters): boolean {
  return (
    filters.people.length > 0 ||
    filters.clients.length > 0 ||
    filters.projects.length > 0 ||
    filters.withoutProject
  );
}

/**
 * Un id de la URL tal como lo devuelve Postgres. `z.uuid()` acepta mayúsculas,
 * y un id así no coincidiría con el del catálogo: se ignoraría en silencio en
 * lugar de descartar el parámetro (D-R4-2).
 */
const LOWERCASE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * El id de una persona: el de Better Auth, 32 alfanuméricos con mayúsculas y
 * minúsculas, o un uuid de los que siembran los tests. Distingue mayúsculas: un
 * id de Better Auth no se puede pasar a minúsculas (D-R4-2).
 */
const PERSON_ID = /^[A-Za-z0-9-]{1,64}$/;

/** Los valores de una lista de la URL: de uno al tope, sin repetir, cada uno con `value`. */
function filterValues<Value extends z.ZodType<string>>(value: Value) {
  return z
    .array(value)
    .min(1)
    .max(REPORT_MAX_FILTER_VALUES)
    .refine((values) => new Set(values).size === values.length);
}

/**
 * `?clientes=<uuid>,<uuid>` con `safeParse` (D-R4-2). Cualquier valor mal
 * formado descarta el parámetro entero: un valor vacío, una coma de más, un
 * repetido, más del tope o el parámetro repetido.
 */
export const reportClientParams = z
  .object({ clientes: z.string() })
  .transform(({ clientes }) => clientes.split(","))
  .pipe(filterValues(z.string().regex(LOWERCASE_UUID)))
  .transform((ids): readonly string[] => ids);

/** `?proyectos=<uuid>,sin-proyecto` con `safeParse`; hasta 50 valores con `sin-proyecto`. */
export const reportProjectParams = z
  .object({ proyectos: z.string() })
  .transform(({ proyectos }) => proyectos.split(","))
  .pipe(
    filterValues(
      z.union([z.string().regex(LOWERCASE_UUID), z.literal(REPORT_WITHOUT_PROJECT)]),
    ),
  )
  .transform((values): Pick<ReportFilters, "projects" | "withoutProject"> => ({
    projects: values.filter((value) => value !== REPORT_WITHOUT_PROJECT),
    withoutProject: values.includes(REPORT_WITHOUT_PROJECT),
  }));

/** `?personas=<id>,<id>` con `safeParse` (D-R4-2); distingue mayúsculas. */
export const reportPeopleParams = z
  .object({ personas: z.string() })
  .transform(({ personas }) => personas.split(","))
  .pipe(filterValues(z.string().regex(PERSON_ID)))
  .transform((ids): readonly string[] => ids);

/**
 * Los filtros de la URL, cada parámetro validado por su lado con su `safeParse`:
 * uno que no vale queda vacío y no arrastra a los otros (RP-32). No decide
 * quién puede usar cada uno: eso es del service (D-R4-4).
 */
export function reportFiltersOf(
  params: Readonly<Record<string, unknown>>,
): ReportFilters {
  const people = reportPeopleParams.safeParse(params);
  const clients = reportClientParams.safeParse(params);
  const projects = reportProjectParams.safeParse(params);
  return {
    people: people.success ? people.data : [],
    clients: clients.success ? clients.data : [],
    projects: projects.success ? projects.data.projects : [],
    withoutProject: projects.success && projects.data.withoutProject,
  };
}

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

const reportClientOption = z.object({
  id: z.uuid(),
  name: z.string(),
  /** RP-29: se filtra igual; la pantalla lo pone aparte. */
  archived: z.boolean(),
});

const reportPersonOption = z.object({
  id: z.string(),
  /** `displayNameOf`: el editado o el de la cuenta. */
  name: z.string(),
  /** RP-62, P-08: aparte y tachada. */
  inactive: z.boolean(),
});

const reportProjectOption = z.object({
  id: z.uuid(),
  name: z.string(),
  color: z.enum(PALETTE_KEYS),
  /** En gris, como en su fila; `null` sin cliente. */
  client: reportNamedRef.nullable(),
  archived: z.boolean(),
});

/**
 * D-R4-5: lo de la URL que está en las opciones, en su orden, con sus ids. Las
 * listas son de solo lectura, como las de `ReportFilters`, para que el estado
 * las reciba sin copiarlas.
 */
const reportFiltersView = z
  .object({
    people: z.array(z.string()).max(REPORT_MAX_FILTER_VALUES).readonly(),
    clients: z.array(z.uuid()).max(REPORT_MAX_FILTER_VALUES).readonly(),
    projects: z.array(z.uuid()).readonly(),
    withoutProject: z.boolean(),
  })
  .refine(
    ({ projects, withoutProject }) =>
      projectFilterCount(projects, withoutProject) <= REPORT_MAX_FILTER_VALUES,
  );

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

const reportWeekGroup = withChildren({
  kind: z.literal("week"),
  /** El primer día de la semana entera, con el primer día de quien mira (RP-24); puede caer antes del período. */
  weekStart: z.string(),
  /** La semana entera, «28/09 – 04/10», con año si algún extremo no es del año de hoy (D-R10-3). */
  label: z.string(),
  /**
   * Los días que cuenta si no es la semana entera —la cortan el período o un
   * grupo de tiempo de su camino—: «01/10 – 04/10». `null` si la cuenta entera.
   */
  partial: z.string().nullable(),
  seconds: z.number().int().min(0),
});

const reportMonthGroup = withChildren({
  kind: z.literal("month"),
  /** El primer día del mes: «2026-10-01». */
  monthStart: z.string(),
  /** «octubre», o «octubre de 2025» si no es del año de hoy (D-R10-3). */
  label: z.string(),
  /** Como en la semana. */
  partial: z.string().nullable(),
  seconds: z.number().int().min(0),
});

const reportDescriptionGroup = withChildren({
  kind: z.literal("description"),
  /** `null` es «Sin descripción»: la cadena vacía (RP-28, D-R10-8). */
  description: z
    .object({
      /** Los 32 primeros hexadecimales del SHA-256 del texto entero: la clave del grupo (D-R10-9). */
      id: z.string().regex(/^[0-9a-f]{32}$/),
      /** De 1 a `REPORT_DESCRIPTION_SHOWN` puntos de código, tal como se guardaron. */
      text: z
        .string()
        .min(1)
        // En puntos de código, como `left()`: `.max()` cuenta unidades UTF-16.
        .refine((text) => Array.from(text).length <= REPORT_DESCRIPTION_SHOWN),
      /** El texto entero es más largo: la pantalla agrega «…». */
      truncated: z.boolean(),
    })
    .nullable(),
  seconds: z.number().int().min(0),
});

const reportGroup = z.discriminatedUnion("kind", [
  reportPersonGroup,
  reportProjectGroup,
  reportClientGroup,
  reportTaskGroup,
  reportTagGroup,
  reportDateGroup,
  reportWeekGroup,
  reportMonthGroup,
  reportDescriptionGroup,
]);

const reportChartBar = z.object({
  /** El primer día que cuenta la barra, en la zona de quien mira: su clave. */
  firstDay: z.string(),
  /**
   * El de la fila de la tabla para el mismo tramo, con la regla del año:
   * «jue, 01/10», «28/09 – 04/10», «octubre» (D-R5-5).
   */
  label: z.string().min(1),
  /** Como en la tabla: los días que cuenta una semana o un mes cortado por el período; `null` por día. */
  partial: z.string().nullable(),
  /** La marca del eje, sin año: «01/10», «oct» (D-R5-5). */
  tick: z.string().min(1),
  seconds: z.number().int().min(0),
});

const reportChart = z.object({
  /** D-R5-4: sale del largo del período, no de la agrupación. */
  granularity: z.enum(REPORT_TIME_GROUP_BYS),
  /** Una por tramo, en orden, también las en cero (D-R5-5). */
  bars: z.array(reportChartBar).min(1).max(REPORT_CHART_MAX_BARS),
});

export const reportReadyState = z
  .object({
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
    /**
     * Los niveles leídos que entran en el tope: menos que los pedidos si no
     * (D-R3-6); 0 si no entra ni el primero (D-R10-10).
     */
    levelsShown: z.number().int().min(0).max(3),
    /** Lo que dice la línea del alcance (D-R2a-2). */
    scope: z.enum(["everyone", "self"]),
    /** La zona con que se cortaron los días, tal como está en el perfil (D-R2a-5). */
    timeZone: z.string(),
    /**
     * Exactos y reales: la suma de los grupos (D-R2a-7) o, por etiqueta y sin
     * el primer nivel, la de las entradas, que no pasa por la unión con las
     * etiquetas (D-R3-3, D-R10-10).
     */
    totalSeconds: z.number().int().min(0),
    billableSeconds: z.number().int().min(0),
    /** El primer nivel, en el orden de D-R2a-3, con los de abajo en `children`. */
    groups: z.array(reportGroup),
    filters: reportFiltersView,
    /** D-R4-9: lo que ofrece cada filtro, de su dueño (ADR 0010), en el orden de `compareNames`. */
    filterOptions: z.object({
      /** `null` sin `timeEntry.others.view`: el filtro no existe (D-R4-4). */
      people: z.array(reportPersonOption).nullable(),
      clients: z.array(reportClientOption),
      projects: z.array(reportProjectOption),
    }),
    /** D-R5-6: `null` sin entradas del alcance y los filtros en el período (RP-33). */
    chart: reportChart.nullable(),
  })
  // D-R10-10: sin el primer nivel no hay grupos; con él, puede no haber (RP-33).
  .refine(({ levelsShown, groups }) => levelsShown > 0 || groups.length === 0)
  // D-R5-2, RP-18: cada entrada cerrada del período cae en exactamente una barra.
  .refine(
    ({ chart, totalSeconds }) =>
      chart === null ||
      chart.bars.reduce((sum, bar) => sum + bar.seconds, 0) === totalSeconds,
  );

export type ReportReadyState = z.infer<typeof reportReadyState>;
export type ReportGroup = z.infer<typeof reportGroup>;
export type ReportPersonGroup = z.infer<typeof reportPersonGroup>;
export type ReportProjectGroup = z.infer<typeof reportProjectGroup>;
export type ReportClientGroup = z.infer<typeof reportClientGroup>;
export type ReportTaskGroup = z.infer<typeof reportTaskGroup>;
export type ReportTagGroup = z.infer<typeof reportTagGroup>;
export type ReportDateGroup = z.infer<typeof reportDateGroup>;
export type ReportWeekGroup = z.infer<typeof reportWeekGroup>;
export type ReportMonthGroup = z.infer<typeof reportMonthGroup>;
export type ReportDescriptionGroup = z.infer<typeof reportDescriptionGroup>;
export type ReportChart = z.infer<typeof reportChart>;
export type ReportChartBar = z.infer<typeof reportChartBar>;
export type ReportShortcut = z.infer<typeof reportShortcut>;

export type ReportState =
  | ReportReadyState
  /** RP-07: sin `report.view`. No se leyó nada. */
  | { readonly kind: "forbidden" };
