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
  /** RP-11: un nivel, por persona, proyecto, cliente, tarea, etiqueta o fecha (D-R3-8). */
  groupBy: "Agrupar por",
  byPerson: "Persona",
  byProject: "Proyecto",
  byClient: "Cliente",
  byTask: "Tarea",
  byTag: "Etiqueta",
  byDate: "Fecha",
  /**
   * RP-28: las entradas de un proyecto sin tarea y las sin proyecto; las sin
   * ninguna etiqueta. Son grupos del reporte, no de `projectLabels`, y «Sin
   * etiqueta» va en singular, distinto del «Sin etiquetas» de una entrada.
   */
  noTask: "Sin tarea",
  noTag: "Sin etiqueta",
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
} as const;
