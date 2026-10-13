import { projectLabels } from "@/modules/project/components/labels";
import { groupByLabels, reportLabels } from "@/modules/report/components/labels";
import {
  REPORT_EXPORT_MAX_ENTRIES,
  REPORT_MAX_ROWS,
  hasReportFilters,
  reportLevelsOf,
  type ReportEntryRow,
  type ReportExportEntries,
  type ReportGroup,
  type ReportRange,
  type ReportReadyState,
} from "@/modules/report/schema";
import type { ReportExportState } from "@/modules/report/service";
import { trackerLabels } from "@/modules/time-entry/components/labels";
import {
  clockLabel,
  dayKey,
  formatClock,
  formatDayKey,
  type DateFormat,
  type TimeSettings,
} from "@/server/time";

import { entryColumnLabels, exportLabels } from "./labels";
import type { ExportCell, ExportDocument, ExportRow, ExportSection } from "./types";

export type ReportExportInput = Extract<ReportExportState, { kind: "ready" }> & {
  /** `session.user.name`: la línea del alcance propio (D-R6-8). */
  readonly exporter: string;
};

/** D-R6-6 a D-R6-8. Pura: no lee la base ni el reloj. */
export function exportDocumentOf(
  input: ReportExportInput,
  settings: TimeSettings,
): ExportDocument {
  return {
    header: headerOf(input, settings),
    // D-R7-3: sin las entradas leídas, solo el resumen.
    sections:
      input.entries === null
        ? [summaryOf(input.report)]
        : [summaryOf(input.report), entriesSectionOf(input.entries)],
  };
}

/**
 * D-R6-7: el texto de un grupo, como lo dice `GroupHeading`: lo que la
 * pantalla pone en gris va entre paréntesis o después de un espacio.
 */
export function groupTextOf(group: ReportGroup): string {
  switch (group.kind) {
    case "person":
      return personText(group);
    case "project":
      return group.project === null
        ? projectLabels.noProject
        : projectText(group.project, group.client);
    case "client":
      return group.client?.name ?? projectLabels.noClient;
    case "task":
      if (group.task === null) {
        return reportLabels.noTask;
      }
      return group.project === null
        ? group.task.name
        : `${group.task.name} (${group.project.name})`;
    case "tag":
      return group.tag?.name ?? reportLabels.noTag;
    case "date":
      return group.label;
    case "week":
    case "month":
      return group.partial === null
        ? group.label
        : `${group.label} ${reportLabels.partialDays(group.partial)}`;
    case "description":
      if (group.description === null) {
        return trackerLabels.noDescription;
      }
      return group.description.truncated
        ? `${group.description.text}…`
        : group.description.text;
  }
}

/** RP-31: una persona inactiva lo dice en texto, como en pantalla. */
function personText({
  name,
  inactive,
}: {
  readonly name: string;
  readonly inactive: boolean;
}): string {
  return inactive ? `${name} ${reportLabels.inactivePerson}` : name;
}

/** El proyecto con su cliente, que la pantalla pone en gris al lado. */
function projectText(
  project: { readonly name: string },
  client: { readonly name: string } | null,
): string {
  return client === null ? project.name : `${project.name} (${client.name})`;
}

function text(value: string): ExportCell {
  return { kind: "text", text: value };
}

const EMPTY: ExportCell = { kind: "empty" };

/** Un texto, o la celda vacía si no hay (D-R6-6). */
function textOrEmpty(value: string | null): ExportCell {
  return value === null || value === "" ? EMPTY : text(value);
}

/**
 * «Duración» y «Horas» de los mismos minutos, truncados como `durationLabel`:
 * la suma de las filas queda en el total o debajo (D-R6-6).
 */
function durationCells(seconds: number): readonly [ExportCell, ExportCell] {
  const minutes = Math.floor(seconds / 60);
  return [
    { kind: "duration", minutes },
    { kind: "hours", minutes },
  ];
}

/** D-R6-8: una fila por dato, el nombre en la primera celda. */
function headerOf(
  input: ReportExportInput,
  settings: TimeSettings,
): readonly ExportRow[] {
  const { report } = input;
  const requested = reportLevelsOf(report);
  // Los que entraron en el tope (D-R3-6, D-R10-10).
  const shown = requested.slice(0, report.levelsShown);
  const rows: ExportRow[] = [
    [text(exportLabels.title)],
    [text(exportLabels.period), text(periodText(report.range, settings.formats.date))],
    [text(exportLabels.timeZone), text(report.timeZone)],
    [
      text(exportLabels.scope),
      text(
        report.scope === "everyone"
          ? exportLabels.scopeEveryone
          : exportLabels.scopeSelf(input.exporter),
      ),
    ],
    [
      text(exportLabels.groupedBy),
      text(requested.map((level) => groupByLabels[level]).join(" / ")),
    ],
    // D-R9-10: la opción cambia el resumen, así que la cabecera la nombra.
    ...(report.peopleWithoutTime
      ? [[text(exportLabels.peopleWithoutTime), text(exportLabels.yes)]]
      : []),
    ...filterRows(report),
    [text(reportLabels.total), ...durationCells(report.totalSeconds)],
    [text(reportLabels.billable), ...durationCells(report.billableSeconds)],
    [text(exportLabels.generated), text(generatedText(input.generatedAt, settings))],
  ];
  // Las notas, en el orden de la pantalla: la de etiquetas y después la del tope,
  // que con el primer nivel cortado es la fila del resumen (D-R6-8).
  if (shown.includes("tag")) {
    rows.push([text(exportLabels.note), text(reportLabels.tagOverlap)]);
  }
  if (report.levelsShown > 0 && shown.length < requested.length) {
    rows.push([text(exportLabels.note), text(reportLabels.rowLimit(REPORT_MAX_ROWS))]);
  }
  return rows;
}

/** «Período»: las dos fechas con año en el formato de quien mira; un día, una. */
function periodText({ first, last }: ReportRange, format: DateFormat): string {
  const from = formatDayKey(first, format, true);
  return first === last ? from : `${from} – ${formatDayKey(last, format, true)}`;
}

/** «Generado»: la fecha con año y la hora de reloj de quien mira, en su zona. */
function generatedText(instant: Date, settings: TimeSettings): string {
  const day = formatDayKey(
    dayKey(instant, settings.timezone),
    settings.formats.date,
    true,
  );
  const clock = clockLabel(
    formatClock(instant, settings.timezone),
    settings.formats.time,
  );
  return `${day} ${clock}`;
}

/**
 * D-R4-9, D-R6-8: los nombres de lo filtrado, de los filtros efectivos y en el
 * orden de las opciones, en una sola celda; ninguna fila sin filtro.
 */
function filterRows({ filters, filterOptions }: ReportReadyState): readonly ExportRow[] {
  const people = (filterOptions.people ?? [])
    .filter(({ id }) => filters.people.includes(id))
    .map(personText);
  const clients = filterOptions.clients
    .filter(({ id }) => filters.clients.includes(id))
    .map(({ name }) => name);
  const projects = [
    ...filterOptions.projects
      .filter(({ id }) => filters.projects.includes(id))
      // Con su cliente: dos proyectos se pueden llamar igual (D-R3-4).
      .map((project) => projectText(project, project.client)),
    ...(filters.withoutProject ? [projectLabels.noProject] : []),
  ];
  return (
    [
      [exportLabels.people, people],
      [exportLabels.clients, clients],
      [exportLabels.projects, projects],
    ] as const
  )
    .filter(([, names]) => names.length > 0)
    .map(([name, names]) => [text(name), text(names.join(", "))]);
}

/**
 * D-R6-7: un nivel por columna, con los de arriba repetidos y vacíos los de
 * abajo; todo el árbol, como si estuviera expandido (D-R6-2).
 */
function summaryOf(report: ReportReadyState): ExportSection {
  const shown = reportLevelsOf(report).slice(0, report.levelsShown);
  if (report.levelsShown === 0) {
    return note(exportLabels.summary, reportLabels.firstLevelLimit(REPORT_MAX_ROWS));
  }
  if (report.groups.length === 0) {
    return note(
      exportLabels.summary,
      hasReportFilters(report.filters) ? reportLabels.emptyFiltered : reportLabels.empty,
    );
  }
  const rows: ExportRow[] = [
    [
      text(exportLabels.level),
      ...shown.map((level) => text(groupByLabels[level])),
      text(reportLabels.duration),
      text(exportLabels.hours),
    ],
  ];
  const visit = (groups: readonly ReportGroup[], path: readonly string[]) => {
    for (const group of groups) {
      const own = [...path, groupTextOf(group)];
      rows.push([
        { kind: "integer", value: own.length },
        ...own.map(text),
        ...shown.slice(own.length).map(() => EMPTY),
        ...durationCells(group.seconds),
      ]);
      if (group.children !== undefined && own.length < shown.length) {
        visit(group.children, own);
      }
    }
  };
  visit(report.groups, []);
  return { title: exportLabels.summary, rows };
}

/** D-R6-3: todas las entradas, en el orden en que llegan, o la nota. */
function entriesSectionOf(entries: ReportExportEntries): ExportSection {
  if (entries.kind === "tooMany") {
    return note(
      exportLabels.entries,
      exportLabels.entriesLimit(REPORT_EXPORT_MAX_ENTRIES),
    );
  }
  return {
    title: exportLabels.entries,
    rows: [entryColumnLabels.map(text), ...entries.rows.map(entryCellsOf)],
  };
}

function entryCellsOf(entry: ReportEntryRow): ExportRow {
  return [
    { kind: "day", dayKey: entry.startDay },
    { kind: "clock", clock: entry.startClock },
    { kind: "day", dayKey: entry.endDay },
    { kind: "clock", clock: entry.endClock },
    text(personText(entry.person)),
    textOrEmpty(entry.client),
    textOrEmpty(entry.project),
    textOrEmpty(entry.task),
    textOrEmpty(entry.description),
    textOrEmpty(entry.tags.join(", ")),
    text(entry.billable ? exportLabels.yes : exportLabels.no),
    ...durationCells(entry.seconds),
  ];
}

/** Una sección que es solo un aviso, sin encabezados. */
function note(title: string, message: string): ExportSection {
  return { title, rows: [[text(message)]] };
}
