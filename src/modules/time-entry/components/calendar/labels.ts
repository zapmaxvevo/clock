import { entrySpanText, extraDaysText } from "../labels";
import type { CalendarZoom } from "./calendar-zoom";

/** Lo que nombra un bloque de la grilla (CAL-75), ya en el formato de la persona. */
type BlockLabelParts = {
  /** La descripción, o «Sin descripción». */
  readonly name: string;
  /** El día de inicio, «jue, 01/10». */
  readonly day: string;
  readonly start: string;
  /** El fin, sus días de más y la duración; `null` en el timer que corre. */
  readonly end: {
    readonly clock: string;
    readonly extraDays: number;
    readonly duration: string;
  } | null;
  /** «Proyecto» o «Proyecto: Tarea», o `null` sin proyecto. */
  readonly project: string | null;
  /** CAL-75: el nombre termina en «facturable» cuando lo es. */
  readonly billable: boolean;
};

const RUNNING = "en curso";

const BILLABLE = "Facturable";

function blockLabel({
  name,
  day,
  start,
  end,
  project,
  billable,
}: BlockLabelParts): string {
  const times =
    end === null
      ? `${entrySpanText(start, null)}, ${RUNNING}`
      : `${entrySpanText(start, end.clock)}${end.extraDays > 0 ? extraDaysText(end.extraDays) : ""}, ${end.duration}`;
  return [
    name,
    day,
    times,
    ...(project === null ? [] : [project]),
    ...(billable ? [BILLABLE.toLowerCase()] : []),
  ].join(", ");
}

/**
 * Textos de la pantalla del calendario. Los que ya usa el rastreador se
 * importan de su `labels.ts` y no se copian.
 */
export const calendarLabels = {
  heading: "Calendario",
  /** La región de la pantalla, destino del foco cuando el bloque ya no está. */
  region: "Calendario",
  loading: "Cargando el calendario",
  /** CAL-87. */
  loadFailed: "No se pudo cargar el calendario.",
  /** CAL-15: las flechas de la barra. */
  previousWeek: "Semana anterior",
  nextWeek: "Semana siguiente",
  previousDay: "Día anterior",
  nextDay: "Día siguiente",
  today: "Hoy",
  /** CAL-16: el botón del rango. */
  pickDate: (range: string) => `Elegir fecha: ${range}`,
  /** CAL-07: el selector de la vista. */
  weekView: "Semana",
  dayView: "Día",
  /** CAL-11. */
  zoomIn: "Acercar",
  zoomOut: "Alejar",
  zoomShort: (zoom: CalendarZoom) => (zoom === 60 ? "1 h" : `${zoom} min`),
  zoomStatus: (zoom: CalendarZoom) =>
    zoom === 60 ? "Franjas de 1 hora" : `Franjas de ${zoom} minutos`,
  /** CAL-38: el fin del timer en el bloque. */
  running: RUNNING,
  blockLabel,
  /** CAL-65 y CAL-66: el diálogo de solo lectura. */
  entryTitle: "Entrada",
  runningTitle: "Timer en curso",
  project: "Proyecto",
  /** CAL-23, CAL-45 y CAL-66: el campo del diálogo y la línea del detalle. */
  billable: BILLABLE,
  billableYes: "Sí",
  billableNo: "No",
  duration: "Duración",
  runningEnd: "Fin: en curso",
  close: "Cerrar",
  /** CAL-74: el alta por teclado, al final de la barra, y el título de su diálogo (CAL-43). */
  addEntry: "Agregar entrada",
  /** CAL-65: el título del diálogo de una entrada cerrada. */
  editTitle: "Editar entrada",
  add: "Agregar",
  save: "Guardar",
  /** CAL-40, P-06. */
  stop: "Detener",
  saveBeforeStop: "Guardá los cambios antes de detener el timer.",
  entryNotSaved: "No se pudo guardar la entrada.",
  /** TT-109: el lugar donde mirar es el calendario, no la lista. */
  addLostMessage:
    "Se perdió la respuesta del servidor. Antes de volver a agregarla, fijate en el calendario: puede haberse creado.",
  /** CAL-46: la entrada guardada no tiene ningún segmento en el período. */
  outsideWeek: (day: string) =>
    `La entrada quedó el ${day}, fuera de la semana que estás viendo.`,
  outsideDay: (day: string) =>
    `La entrada quedó el ${day}, fuera del día que estás viendo.`,
  goToWeek: "Ir a esa semana",
  goToDay: "Ir a ese día",
} as const;
