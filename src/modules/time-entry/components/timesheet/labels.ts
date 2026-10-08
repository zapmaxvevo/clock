import { calendarLabels } from "../calendar/labels";
import { trackerLabels } from "../labels";
import type { EntryChangeFailure } from "./entry-changes";

/**
 * Textos de la planilla de horarios. Los que ya dice otra pantalla —«Total»,
 * «Sin proyecto», «Cancelar», «Borrar», los títulos de los avisos de una
 * entrada— se importan de donde están.
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
  /** TS-40: el menú de una celda con una entrada abre su editor (TS-41). */
  editEntry: "Editar",
  /** TS-40 y TS-79: el menú de una celda con varias abre su lista (TS-42). */
  showDetail: "Ver detalle",
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

/** TS-40: el menú de tres puntos de una celda, nombrado por ella. */
export function cellActionsLabel(cell: string): string {
  return `Acciones de la celda ${cell}`;
}

/** TS-42: el título de la lista de una celda con varias entradas. */
export function cellDetailTitle(cell: string): string {
  return `Detalle de ${cell}`;
}

/** TS-42: el horario distingue dos entradas con la misma descripción. */
export function editEntryLabel(entry: string, span: string): string {
  return `Editar «${entry}», ${span}`;
}

export function deleteEntryLabel(entry: string, span: string): string {
  return `Borrar «${entry}», ${span}`;
}

/** Cómo nombra un aviso del detalle a su entrada: «Diseño», de 09:00 a 10:30. */
export function entryChangeName(entry: string, span: string): string {
  return `«${entry}», ${span}`;
}

/** El título del aviso de un pedido del detalle: nombra la operación que falló (§5.5). */
export function entryChangeFailureTitle(failure: EntryChangeFailure): string {
  return failure.request.kind === "save"
    ? calendarLabels.entryNotSaved
    : trackerLabels.entryNotDeleted;
}
