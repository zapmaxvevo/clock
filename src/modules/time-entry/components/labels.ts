import type { TimeFormat } from "@/server/time";

import { BULK_DELETE_WORD } from "./bulk-changes";

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
  /** TT-90: el aviso nombra el campo que no se guardó. */
  descriptionNotSaved: "No se pudo guardar la descripción.",
  projectNotSaved: "No se pudo cambiar el proyecto.",
  billableNotSaved: "No se pudo cambiar el facturable.",
  tagsNotSaved: "No se pudieron cambiar las etiquetas.",
  entryNotDeleted: "No se pudo borrar la entrada.",
  /** TT-90: el trío viaja entero, así que el aviso nombra la operación. */
  entryTimesNotSaved: "No se pudo guardar el horario de la entrada.",
  runningStartNotSaved: "No se pudo guardar el inicio del timer.",
  /** TT-110: el trío no puede expresar una entrada de más de un día. */
  multiDayTimesReadOnly:
    "Esta entrada dura más de un día; sus horarios no se pueden editar acá.",
  /**
   * TT-14: el control de la barra y del diálogo del calendario, el ícono de
   * solo lectura, el campo del diálogo de solo lectura y la línea del detalle
   * del bloque (CAL-23, CAL-45, CAL-66).
   */
  billable: "Facturable",
  /** TT-28: el botón superpuesto al contador. */
  editRunningStart: "Editar la hora de inicio",
  /** Los botones de los calendarios de mes, el de la fecha y el del rango. */
  previousMonth: "Mes anterior",
  nextMonth: "Mes siguiente",
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
  timerNotStopped: "No se pudo detener el timer.",
  entryNotAdded: "No se pudo agregar la entrada.",
  /** TT-109: el alta no tiene id del cliente, así que no se sabe si quedó escrita. */
  addLostTitle: "No sabemos si la entrada se guardó.",
  /** TT-65: la confirmación del descarte. */
  discardTitle: "¿Descartar el timer?",
  discardDescription: "Se borra el tiempo que lleva corriendo y no se puede deshacer.",
  /** TT-26: el diálogo que lista los atajos y los apaga (WCAG 2.1.4). */
  shortcutsTitle: "Atajos de teclado",
  shortcutsToggle: "Usar atajos de una tecla",
  shortcutsHint:
    "No funcionan mientras escribís en un campo ni con un menú o un diálogo abierto.",
  /** TT-62 a TT-64: la región de la barra, siempre montada. */
  bulkRegion: "Acciones en masa",
  bulkEdit: "Editar",
  /** TT-60 y TT-64: la barra en masa y los menús de la fila y del diálogo del calendario. */
  delete: "Borrar",
  /** TT-58: el menú de la fila y el del diálogo del calendario. */
  duplicate: "Duplicar",
  clearSelection: "Quitar selección",
  /** Los campos del diálogo de edición masiva (TT-63) y del de una entrada del calendario. */
  description: "Descripción",
  date: "Fecha",
  bulkEditHint: "Lo que dejes vacío no cambia.",
  noChange: "Sin cambios",
  clearDate: "Quitar la fecha",
  /** TT-64: el borrado masivo se confirma escribiendo la palabra. */
  bulkDeleteWarning: "No se puede deshacer.",
  bulkDeleteConfirm: `Escribí ${BULK_DELETE_WORD} para confirmar`,
  deleting: "Borrando…",
  /** TT-90: el aviso nombra la operación en masa que falló. */
  entriesNotEdited: "No se pudieron editar las entradas.",
  entriesNotDeleted: "No se pudieron borrar las entradas.",
  /** ADR 0011: saca de la selección las entradas que frenaron el pedido. */
  dropRejected: "Quitar esas entradas de la selección",
} as const;

/** TT-03: marcador del campo de descripción. */
export const DESCRIPTION_PLACEHOLDER = "¿En qué estás trabajando?";

/** TT-50 y TT-94: cómo nombra la pantalla una entrada, también la que no tiene descripción. */
export function entryNameOf(description: string): string {
  return description === "" ? trackerLabels.noDescription : description;
}

/** El nombre accesible del selector de la fila, como el de su menú de acciones. */
export function entryProjectLabel(entryName: string): string {
  return `Proyecto de la entrada «${entryName}»`;
}

/** TT-14: el nombre accesible del control de facturable de la fila. */
export function entryBillableLabel(entryName: string): string {
  return `Entrada «${entryName}» facturable`;
}

/** TT-12: el nombre accesible del selector de etiquetas de la fila. */
export function entryTagsLabel(entryName: string): string {
  return `Etiquetas de la entrada «${entryName}»`;
}

/** Lo que el superíndice `+1` le dice a un lector de pantalla. */
export function extraDaysText(extraDays: number): string {
  return extraDays === 1
    ? trackerLabels.endsNextDay
    : ` (termina ${extraDays} días después)`;
}

/** El horario de una entrada en una frase: «de 09:00 a 10:30», o «desde las 09:00» si corre. */
export function entrySpanText(startLabel: string, endLabel: string | null): string {
  return endLabel === null ? `desde las ${startLabel}` : `de ${startLabel} a ${endLabel}`;
}

/** El menú de acciones de una entrada, en la fila y en el diálogo del calendario. */
export function entryActionsLabel(entryName: string): string {
  return `Acciones de la entrada «${entryName}»`;
}

/** Una cantidad de entradas con el verbo o el sustantivo en singular o plural. */
function countOf(count: number, one: string, many: string): string {
  return count === 1 ? one : `${count} ${many}`;
}

/** TT-62: la casilla de una fila; la hora la distingue de otra con la misma descripción. */
export function selectEntryLabel(entryName: string, timesLabel: string): string {
  return `Seleccionar «${entryName}», ${timesLabel}`;
}

/** TT-62: la casilla del encabezado de un día. */
export function selectDayLabel(dayLabel: string): string {
  return `Seleccionar las entradas del día ${dayLabel}`;
}

export function selectedCountLabel(count: number): string {
  return countOf(count, "1 entrada seleccionada", "entradas seleccionadas");
}

export function bulkEditTitle(count: number): string {
  return `Editar ${countOf(count, "1 entrada", "entradas")}`;
}

export function bulkDeleteTitle(count: number): string {
  return `¿Borrar ${countOf(count, "1 entrada", "entradas")}?`;
}

export function entriesEditedLabel(count: number): string {
  return count === 1 ? "Se editó 1 entrada." : `Se editaron ${count} entradas.`;
}

export function entriesDeletedLabel(count: number): string {
  return count === 1 ? "Se borró 1 entrada." : `Se borraron ${count} entradas.`;
}

/** PF-14: el marcador de un campo de hora vacío sigue el formato de la persona. */
export function clockPlaceholder(format: TimeFormat): string {
  return format === "12h" ? "h:mm AM" : "hh:mm";
}
