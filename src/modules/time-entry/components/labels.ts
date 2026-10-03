/**
 * Textos de la pantalla que aparecen en más de un componente. Los mensajes de
 * error de las actions no viven acá: salen de `timeEntryMessages`, en el
 * esquema del módulo.
 */
export const trackerLabels = {
  /** TT-50 y TT-94: una entrada sin descripción. */
  noDescription: "Sin descripción",
  /** TT-50 y TT-93: el slice todavía no tiene proyecto. */
  noProject: "Sin proyecto",
  /** TT-90: el aviso nombra el campo que no se guardó. */
  descriptionNotSaved: "No se pudo guardar la descripción.",
  entryNotDeleted: "No se pudo borrar la entrada.",
  /** TT-51: lo que el superíndice `+1` le dice a un lector de pantalla. */
  endsNextDay: " (termina un día después)",
} as const;

/** TT-03: marcador del campo de descripción. */
export const DESCRIPTION_PLACEHOLDER = "¿En qué estás trabajando?";
