import type {
  ReportExportFormat,
  ReportGroupBy,
  ReportTimeGroupBy,
} from "@/modules/report/schema";

import type { FilterKind } from "./filter-model";

/**
 * Textos del reporte resumido. «Sin proyecto» y «Sin cliente» son
 * `projectLabels.noProject` y `projectLabels.noClient`; los rótulos de los
 * atajos llegan en el estado y los mensajes del rango salen de
 * `reportMessages`, en el esquema del módulo.
 */
export const reportLabels = {
  /** El título visible, que también nombra la tabla. */
  heading: "Reporte resumido",
  loading: "Cargando el reporte",
  /** RP-35: la lectura falló; nunca una tabla vacía, que se confundiría con RP-33. */
  loadFailed: "No se pudo cargar el reporte.",
  /** RP-07: el cuerpo del aviso de membresía desactivada, propio del reporte. */
  forbiddenBody: "No podés ver reportes.",
  /** RP-20: las flechas mueven el período entero. */
  previousPeriod: "Período anterior",
  nextPeriod: "Período siguiente",
  thisWeek: "Esta semana",
  /** RP-20: el botón del período, nombrado por lo que muestra. */
  pickRange: (period: string) => `Elegir período: ${period}`,
  previousMonth: "Mes anterior",
  nextMonth: "Mes siguiente",
  apply: "Aplicar",
  /** RP-20: la lista de períodos con nombre, dentro del selector (D-R2b-2). */
  shortcuts: "Atajos",
  /**
   * RP-11: un nivel, por persona, proyecto, cliente, tarea, etiqueta, fecha,
   * semana, mes o descripción (D-R3-8, D-R10-5).
   */
  groupBy: "Agrupar por",
  byPerson: "Persona",
  byProject: "Proyecto",
  byClient: "Cliente",
  byTask: "Tarea",
  byTag: "Etiqueta",
  byDate: "Fecha",
  byWeek: "Semana",
  byMonth: "Mes",
  byDescription: "Descripción",
  /**
   * RP-47, D-R9-11: el enlace al lado de «Agrupar por», con la persona en el
   * primer nivel; dice lo que hace con la opción como está.
   */
  showPeopleWithoutTime: "Mostrar personas sin horas",
  hidePeopleWithoutTime: "Ocultar personas sin horas",
  /** D-R10-3: los días que cuenta una semana o un mes cortado, en gris después del rótulo. */
  partialDays: (days: string) => `solo ${days}`,
  /**
   * RP-28: las entradas de un proyecto sin tarea y las sin proyecto; las sin
   * ninguna etiqueta. Son grupos del reporte, no de `projectLabels`, y «Sin
   * etiqueta» va en singular, distinto del «Sin etiquetas» de una entrada.
   */
  noTask: "Sin tarea",
  noTag: "Sin etiqueta",
  /** RP-12: hasta dos niveles debajo del primero, sin repetir (D-R3-8). */
  subgroupBy: "Subagrupar por",
  secondLevel: "Segundo nivel",
  thirdLevel: "Tercer nivel",
  /** El botón de un nivel dice lo que tiene elegido, y ese es su nombre. */
  levelChoice: (level: string, chosen: string) => `${level}: ${chosen}`,
  noLevel: "Ninguno",
  /** D-R3-6: un nivel que no entra en el tope no se muestra, ni los de abajo. */
  rowLimit: (maxRows: number) =>
    `El reporte pasa de ${maxRows} filas con todos sus niveles: se muestran solo los de arriba. Acortá el período o quitá un nivel.`,
  /** D-R10-10: el primer nivel tampoco entra, y la tabla lo dice en lugar de las filas. */
  firstLevelLimit: (maxRows: number) =>
    `El primer nivel pasa de ${maxRows} filas y no se muestra. Acortá el período, filtrá o agrupá por otra cosa.`,
  duration: "Duración",
  /** RP-18. */
  total: "Total",
  billable: "Facturable",
  /** D-R2a-2: la pantalla dice siempre el alcance. */
  scopeSelf: "Ves solo tus horas.",
  scopeEveryone: "Ves las horas de todas las personas del workspace.",
  /** RP-22, D-R2a-5: la zona tal como está en el perfil, sin desplazamiento. */
  zone: (timeZone: string) => `Los días se cortan en tu zona horaria: ${timeZone}.`,
  /** RP-18, D-R3-3: debajo de la zona, cuando la etiqueta es uno de los niveles. */
  tagOverlap:
    "Una entrada con varias etiquetas suma en cada una: las filas por etiqueta pueden sumar más que el total.",
  /** RP-31. */
  inactivePerson: "(inactiva)",
  /** RP-33. */
  empty: "No hay horas en este período",
  /** RP-33, D-R4-7: con algún filtro y ningún grupo. */
  emptyFiltered: "Ninguna entrada coincide con los filtros",
  /** D-R4-7: el mismo período, la misma agrupación y ningún filtro. */
  clearFilters: "Quitar filtros",
  /** D-R5-9: el nombre de una columna del gráfico y lo que dice la línea del valor. */
  chartBar: (label: string, duration: string) => `${label}: ${duration}`,
  /** D-R5-9: el equivalente en tabla, debajo de las columnas. */
  chartData: "Ver los datos del gráfico",
  /** RP-25, D-R4-8: el tercer grupo de la barra. */
  filterBy: "Filtrar por",
  /** El botón de un filtro dice lo elegido, y ese es su nombre. */
  filterChoice: (filter: string, summary: string) => `${filter}: ${summary}`,
  filterNoMatches: "Nada coincide con la búsqueda.",
  /** D-R4-2: con «Sin proyecto» contado. */
  filterTooMany: (maxValues: number) => `Elegí hasta ${maxValues}.`,
  /** D-R6-10: el último grupo de la barra, solo con horas. */
  exportBy: "Exportar",
} as const;

/** D-R6-10: el texto visible de cada descarga, que es su nombre. */
export const exportFormatLabels = {
  csv: "CSV",
  xlsx: "Excel",
} as const satisfies Record<ReportExportFormat, string>;

/** El nombre de cada filtro: su botón y el grupo de sus opciones vigentes. */
export const filterNames = {
  people: "Personas",
  clients: "Clientes",
  projects: "Proyectos",
} as const satisfies Record<FilterKind, string>;

/** Lo que dice el botón de un filtro sin nada elegido. */
export const filterAll = {
  people: "todas",
  clients: "todos",
  projects: "todos",
} as const satisfies Record<FilterKind, string>;

/**
 * El grupo de aparte de cada filtro (D-R4-8): los archivados de clientes y
 * proyectos (RP-29) y las inactivas de personas (RP-62, P-08).
 */
export const filterRetired = {
  people: "Inactivas",
  clients: "Archivados",
  projects: "Archivados",
} as const satisfies Record<FilterKind, string>;

/** El nombre accesible y el texto de ayuda del buscador de cada filtro. */
export const filterSearch = {
  people: "Buscar personas",
  clients: "Buscar clientes",
  projects: "Buscar proyectos",
} as const satisfies Record<FilterKind, string>;

/** El rótulo de cada dimensión: el enlace de «Agrupar por», el subnivel y el encabezado. */
export const groupByLabels = {
  person: reportLabels.byPerson,
  project: reportLabels.byProject,
  client: reportLabels.byClient,
  task: reportLabels.byTask,
  tag: reportLabels.byTag,
  date: reportLabels.byDate,
  week: reportLabels.byWeek,
  month: reportLabels.byMonth,
  description: reportLabels.byDescription,
} as const satisfies Record<ReportGroupBy, string>;

/** D-R5-9: la leyenda del gráfico, su único nombre, según la granularidad del período. */
export const chartCaptions = {
  date: "Horas por día",
  week: "Horas por semana",
  month: "Horas por mes",
} as const satisfies Record<ReportTimeGroupBy, string>;
