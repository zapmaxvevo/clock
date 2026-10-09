import type { ReactElement } from "react";

import { projectLabels } from "@/modules/project/components/labels";
import { paletteColor } from "@/modules/project/palette";
import type {
  ReportClientGroup,
  ReportGroup,
  ReportGroupBy,
  ReportPersonGroup,
  ReportProjectGroup,
  ReportReadyState,
  ReportTagGroup,
  ReportTaskGroup,
} from "@/modules/report/schema";
import { formatDuration } from "@/server/time";

import { reportLabels } from "./labels";

/** El `h1` de la pantalla, que nombra la tabla. */
export const REPORT_HEADING_ID = "reporte-titulo";

/** El encabezado de la primera columna, por la agrupación. */
const GROUP_COLUMN_HEADINGS = {
  person: reportLabels.byPerson,
  project: reportLabels.byProject,
  client: reportLabels.byClient,
  task: reportLabels.byTask,
  tag: reportLabels.byTag,
  date: reportLabels.byDate,
} as const satisfies Record<ReportGroupBy, string>;

/**
 * Cada cifra se trunca al minuto por separado, la de cada fila y la del total:
 * la suma de lo que muestran las filas queda en o debajo del total (§5.3).
 */
function durationLabel(seconds: number): string {
  return formatDuration(Math.floor(seconds / 60));
}

/**
 * El alcance y la zona (D-R2a-2, D-R2a-5), el aviso de la suma por etiqueta
 * (D-R3-3), los totales (RP-18) y una fila por grupo, en el orden en que llegan.
 */
export function ReportView({ state }: { readonly state: ReportReadyState }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="text-muted-foreground flex flex-col gap-1 text-sm">
        <p>
          {state.scope === "everyone"
            ? reportLabels.scopeEveryone
            : reportLabels.scopeSelf}
        </p>
        <p>{reportLabels.zone(state.timeZone)}</p>
        {state.groupBy === "tag" && <p>{reportLabels.tagOverlap}</p>}
      </div>

      <dl className="flex flex-wrap gap-x-8 gap-y-2">
        <div className="flex flex-col">
          <dt className="text-muted-foreground text-sm">{reportLabels.total}</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {durationLabel(state.totalSeconds)}
          </dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-muted-foreground text-sm">{reportLabels.billable}</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {durationLabel(state.billableSeconds)}
          </dd>
        </div>
      </dl>

      <div className="overflow-x-auto rounded-lg border">
        <table aria-labelledby={REPORT_HEADING_ID} className="w-full text-sm">
          <thead className="border-b">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                {GROUP_COLUMN_HEADINGS[state.groupBy]}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                {reportLabels.duration}
              </th>
            </tr>
          </thead>
          <tbody>
            {state.groups.length === 0 ? (
              <tr>
                <td colSpan={2} className="text-muted-foreground px-3 py-6 text-center">
                  {reportLabels.empty}
                </td>
              </tr>
            ) : (
              state.groups.map((group) => (
                <tr key={groupKey(group)} className="border-b last:border-b-0">
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    <GroupHeading group={group} />
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {durationLabel(group.seconds)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Una fila por persona, proyecto, cliente, tarea, etiqueta o día; cada «Sin …» es una sola. */
function groupKey(group: ReportGroup): string {
  switch (group.kind) {
    case "person":
      return group.userId;
    case "project":
      return group.project === null ? "sin-proyecto" : group.project.id;
    case "client":
      return group.client === null ? "sin-cliente" : group.client.id;
    case "task":
      return group.task === null ? "sin-tarea" : group.task.id;
    case "tag":
      return group.tag === null ? "sin-etiqueta" : group.tag.id;
    case "date":
      return group.dayKey;
  }
}

/** `ReactElement` y no `ReactNode`, que admite `undefined`: un `kind` sin caso no compila. */
function GroupHeading({ group }: { readonly group: ReportGroup }): ReactElement {
  switch (group.kind) {
    case "person":
      return <PersonHeading group={group} />;
    case "project":
      return <ProjectHeading group={group} />;
    case "client":
      return <ClientHeading group={group} />;
    case "task":
      return <TaskHeading group={group} />;
    case "tag":
      return <TagHeading group={group} />;
    case "date":
      return <time dateTime={group.dayKey}>{group.label}</time>;
  }
}

/** RP-31: una persona inactiva lo dice en texto, no solo con el gris. */
function PersonHeading({ group }: { readonly group: ReportPersonGroup }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate">{group.name}</span>
      {group.inactive && (
        <span className="text-muted-foreground">{reportLabels.inactivePerson}</span>
      )}
    </span>
  );
}

/** El punto del color, el nombre y el cliente en gris, como la planilla. */
function ProjectHeading({ group }: { readonly group: ReportProjectGroup }) {
  if (group.project === null) {
    return <span className="text-muted-foreground">{projectLabels.noProject}</span>;
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: paletteColor(group.project.color).value }}
      />
      <span className="truncate">{group.project.name}</span>
      {group.client !== null && (
        <span className="text-muted-foreground truncate">{group.client.name}</span>
      )}
    </span>
  );
}

/** El nombre del cliente; «Sin cliente» en gris, como «Sin proyecto». */
function ClientHeading({ group }: { readonly group: ReportClientGroup }) {
  if (group.client === null) {
    return <span className="text-muted-foreground">{projectLabels.noClient}</span>;
  }
  return <span className="truncate">{group.client.name}</span>;
}

/**
 * El nombre de la tarea y su proyecto en gris, como el cliente de un proyecto:
 * dos tareas que se llaman igual en proyectos distintos se distinguen (D-R3-4).
 * «Sin tarea» en gris y sin proyecto, porque junta varios.
 */
function TaskHeading({ group }: { readonly group: ReportTaskGroup }) {
  if (group.task === null) {
    return <span className="text-muted-foreground">{reportLabels.noTask}</span>;
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate">{group.task.name}</span>
      {group.project !== null && (
        <span className="text-muted-foreground truncate">{group.project.name}</span>
      )}
    </span>
  );
}

/** El nombre de la etiqueta, archivada o no (RP-29); «Sin etiqueta» en gris. */
function TagHeading({ group }: { readonly group: ReportTagGroup }) {
  if (group.tag === null) {
    return <span className="text-muted-foreground">{reportLabels.noTag}</span>;
  }
  return <span className="truncate">{group.tag.name}</span>;
}
