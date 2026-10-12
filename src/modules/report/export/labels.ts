import { filterNames, reportLabels } from "@/modules/report/components/labels";
import { REPORT_EXPORT_MAX_BYTES } from "@/modules/report/schema";

/**
 * Textos del archivo exportado (§5.6). «Total», «Facturable», «Duración», los
 * «Sin …», las notas de etiqueta y de tope y los vacíos son los de la
 * pantalla, en `reportLabels`, `projectLabels` y `trackerLabels`.
 */
export const exportLabels = {
  /** D-R6-8: la primera fila, sola. */
  title: reportLabels.heading,
  period: "Período",
  timeZone: "Zona horaria",
  scope: "Alcance",
  scopeEveryone: "Todas las personas del workspace",
  /** D-R6-8: el archivo dice de quién son las horas aunque se reenvíe. */
  scopeSelf: (name: string) => `Solo las horas de ${name}`,
  groupedBy: "Agrupado por",
  people: filterNames.people,
  clients: filterNames.clients,
  projects: filterNames.projects,
  generated: "Generado",
  note: "Nota",
  summary: "Resumen",
  entries: "Entradas",
  level: "Nivel",
  hours: "Horas",
  yes: "Sí",
  no: "No",
  /** D-R6-3: todas o ninguna, por cantidad o por peso. */
  entriesLimit: (maxEntries: number) =>
    `Las entradas no entran en el archivo: son más de ${maxEntries} o pesan más de ${REPORT_EXPORT_MAX_BYTES / 1_000_000} MB. Acortá el período o filtrá.`,
} as const;

/** D-R6-3: los encabezados de las entradas, en el orden de sus columnas (§4.6). */
export const entryColumnLabels = [
  "Fecha de inicio",
  "Hora de inicio",
  "Fecha de fin",
  "Hora de fin",
  reportLabels.byPerson,
  reportLabels.byClient,
  reportLabels.byProject,
  reportLabels.byTask,
  reportLabels.byDescription,
  "Etiquetas",
  reportLabels.billable,
  reportLabels.duration,
  exportLabels.hours,
] as const;
