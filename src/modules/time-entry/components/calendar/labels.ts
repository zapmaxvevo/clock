import { extraDaysText } from "../labels";
import type { CalendarZoom } from "./calendar-zoom";

/** Lo que nombra un bloque de la grilla (CAL-75), ya en el formato de la persona. */
export type BlockLabelParts = {
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
};

const RUNNING = "en curso";

function blockLabel({ name, day, start, end, project }: BlockLabelParts): string {
  const times =
    end === null
      ? `desde las ${start}, ${RUNNING}`
      : `de ${start} a ${end.clock}${end.extraDays > 0 ? extraDaysText(end.extraDays) : ""}, ${end.duration}`;
  return [name, day, times, ...(project === null ? [] : [project])].join(", ");
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
  retry: "Reintentar",
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
  /** CAL-33: el total del período. */
  total: "Total",
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
  description: "Descripción",
  project: "Proyecto",
  date: "Fecha",
  duration: "Duración",
  runningEnd: "Fin: en curso",
  close: "Cerrar",
} as const;
