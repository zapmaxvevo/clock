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
  /** TT-108: una entrada guardada en un día que la lista no dibuja. */
  outsideWindowTitle: "La entrada se guardó, pero todavía no se ve en la lista.",
  outsideWindowMessage: (dayLabel: string): string =>
    `Quedó en el día ${dayLabel}, anterior al tramo que la lista muestra.`,
  /** TT-51: lo que el superíndice `+1` le dice a un lector de pantalla. */
  endsNextDay: " (termina un día después)",
} as const;

/** TT-03: marcador del campo de descripción. */
export const DESCRIPTION_PLACEHOLDER = "¿En qué estás trabajando?";
