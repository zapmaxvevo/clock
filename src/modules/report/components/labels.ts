/**
 * Textos del reporte resumido. «Sin proyecto» es `projectLabels.noProject`; los
 * mensajes del rango salen de `reportMessages`, en el esquema del módulo.
 */
export const reportLabels = {
  /** El título visible, que también nombra la tabla. */
  heading: "Reporte resumido",
  loading: "Cargando el reporte",
  /** RP-35: la lectura falló; nunca una tabla vacía, que se confundiría con RP-33. */
  loadFailed: "No se pudo cargar el reporte.",
  /** RP-07: el mismo título que el aviso de membresía desactivada del resto de la aplicación. */
  forbiddenTitle: "Tu acceso al workspace está desactivado.",
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
  /** RP-11: un nivel, por persona o por proyecto. */
  groupBy: "Agrupar por",
  byPerson: "Persona",
  byProject: "Proyecto",
  duration: "Duración",
  /** RP-18. */
  total: "Total",
  billable: "Facturable",
  /** D-R2a-2: la pantalla dice siempre el alcance. */
  scopeSelf: "Ves solo tus horas.",
  scopeEveryone: "Ves las horas de todas las personas del workspace.",
  /** RP-22, D-R2a-5: la zona tal como está en el perfil, sin desplazamiento. */
  zone: (timeZone: string) => `Los días se cortan en tu zona horaria: ${timeZone}.`,
  /** RP-31. */
  inactivePerson: "(inactiva)",
  /** RP-33. */
  empty: "No hay horas en este período",
} as const;
