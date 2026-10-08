/**
 * Textos de la planilla de horarios. «Total», «Sin proyecto», «Semana
 * anterior», «Semana siguiente» y «Cancelar» se importan de donde ya están.
 */
export const timesheetLabels = {
  /** TS-04: el título visible, que también nombra la tabla (TS-100). */
  heading: "Planilla de horarios",
  loading: "Cargando la planilla",
  /** La lectura falló: nunca una grilla vacía, que se confundiría con TS-87. */
  loadFailed: "No se pudo cargar la planilla.",
  projectsColumn: "Proyectos",
  /** El encabezado de la columna de «Quitar fila», solo para lectores. */
  actionsColumn: "Acciones",
  /** TS-09: el atajo a la semana en curso. */
  thisWeek: "Esta semana",
  /** TS-87. */
  empty: "No hay horas cargadas esta semana",
  /** TS-16. */
  addRow: "Añadir nueva fila",
  selectProject: "Seleccionar proyecto",
  newRowProject: "Proyecto de la fila nueva",
  removeNewRow: "Quitar la fila nueva",
  removeRowConfirm: "Quitar fila",
  /** TS-91. */
  cellNotSaved: "No se pudo guardar la celda.",
  /** TS-92. */
  rowNotRemoved: "No se pudo quitar la fila.",
} as const;

/** TS-52: la X de una fila con par, nombrada por la fila. */
export function removeRowLabel(row: string): string {
  return `Quitar fila ${row}`;
}

/** TT-61: el título del diálogo de quitar una fila con entradas. */
export function removeRowTitle(row: string): string {
  return `¿Quitar la fila «${row}»?`;
}

/** TS-53: cuántas entradas se borran y cuánto suman. */
export function removeRowBody(count: number, total: string): string {
  return count === 1
    ? `Se va a borrar 1 entrada de ${total}. No se puede deshacer.`
    : `Se van a borrar ${count} entradas que suman ${total}. No se puede deshacer.`;
}

/** TS-100: «Rediseño: Maquetado, miércoles 01/10». */
export function cellLabel(row: string, day: string): string {
  return `${row}, ${day}`;
}
