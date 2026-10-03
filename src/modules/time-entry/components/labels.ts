/**
 * Textos de la pantalla del rastreador que dicen algo del dominio: los que
 * comparten varios componentes y los que nombran una regla de paridad. Los
 * mensajes de error de las actions no viven acá: salen de `timeEntryMessages`,
 * en el esquema del módulo.
 */
export const trackerLabels = {
  /** Los campos de hora de la barra manual, de la fila y del inicio del timer. */
  startTime: "Hora de inicio",
  endTime: "Hora de fin",
  /** TT-50 y TT-94: una entrada sin descripción. */
  noDescription: "Sin descripción",
  /** TT-50 y TT-93: el slice todavía no tiene proyecto. */
  noProject: "Sin proyecto",
  /** TT-90: el aviso nombra el campo que no se guardó. */
  descriptionNotSaved: "No se pudo guardar la descripción.",
  entryNotDeleted: "No se pudo borrar la entrada.",
  /** TT-90: el trío viaja entero, así que el aviso nombra la operación. */
  entryTimesNotSaved: "No se pudo guardar el horario de la entrada.",
  runningStartNotSaved: "No se pudo guardar el inicio del timer.",
  /** TT-110: el trío no puede expresar una entrada de más de un día. */
  multiDayTimesReadOnly:
    "Esta entrada dura más de un día; sus horarios no se pueden editar acá.",
  /** TT-28: el botón superpuesto al contador. */
  editRunningStart: "Editar la hora de inicio",
  /** TT-52: el enlace que suma la próxima semana con entradas. */
  loadMore: "Cargar más",
  /** TT-52: lo que anuncia el enlace mientras su navegación viaja. */
  loadingMore: "Cargando…",
  /** TT-47: el rótulo del total de la franja de una semana. */
  weekTotal: "Total",
  /** TT-51: lo que el superíndice `+1` le dice a un lector de pantalla. */
  endsNextDay: " (termina un día después)",
  /** TT-57, TT-58 y TT-65: el aviso nombra la operación que falló. */
  entryNotContinued: "No se pudo continuar la entrada.",
  entryNotDuplicated: "No se pudo duplicar la entrada.",
  timerNotDiscarded: "No se pudo descartar el timer.",
  /** TT-65: la confirmación del descarte. */
  discardTitle: "¿Descartar el timer?",
  discardDescription: "Se borra el tiempo que lleva corriendo y no se puede deshacer.",
  /** TT-26: el diálogo que lista los atajos y los apaga (WCAG 2.1.4). */
  shortcutsTitle: "Atajos de teclado",
  shortcutsToggle: "Usar atajos de una tecla",
  shortcutsHint:
    "No funcionan mientras escribís en un campo ni con un menú o un diálogo abierto.",
} as const;

/** TT-03: marcador del campo de descripción. */
export const DESCRIPTION_PLACEHOLDER = "¿En qué estás trabajando?";
