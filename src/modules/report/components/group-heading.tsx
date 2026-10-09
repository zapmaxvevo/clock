import type { ReactElement } from "react";

import { projectLabels } from "@/modules/project/components/labels";
import { paletteColor } from "@/modules/project/palette";
import type {
  ReportGroup,
  ReportPersonGroup,
  ReportProjectGroup,
  ReportTaskGroup,
} from "@/modules/report/schema";
import { formatDuration } from "@/server/time";

import { reportLabels } from "./labels";

/**
 * Cada cifra se trunca al minuto por separado, la de cada fila y la del total:
 * la suma de lo que muestran las filas queda en o debajo del total (§5.3).
 */
export function durationLabel(seconds: number): string {
  return formatDuration(Math.floor(seconds / 60));
}

/** `ReactElement` y no `ReactNode`, que admite `undefined`: un `kind` sin caso no compila. */
export function GroupHeading({ group }: { readonly group: ReportGroup }): ReactElement {
  switch (group.kind) {
    case "person":
      return <PersonHeading group={group} />;
    case "project":
      return <ProjectHeading group={group} />;
    case "client":
      return <NamedHeading named={group.client} emptyLabel={projectLabels.noClient} />;
    case "task":
      return <TaskHeading group={group} />;
    case "tag":
      return <NamedHeading named={group.tag} emptyLabel={reportLabels.noTag} />;
    case "date":
      return <time dateTime={group.dayKey}>{group.label}</time>;
    case "week":
      return (
        <PartialHeading partial={group.partial}>
          <span>{group.label}</span>
        </PartialHeading>
      );
    case "month":
      return (
        <PartialHeading partial={group.partial}>
          {/* Los siete primeros caracteres, «2026-10», son un mes válido de HTML. */}
          <time dateTime={group.monthStart.slice(0, 7)}>{group.label}</time>
        </PartialHeading>
      );
  }
}

/**
 * D-R10-3: la semana o el mes entero y, si la fila no los cuenta enteros, los
 * días que cuenta en gris. En línea y no en `flex`: a 320 px los dos rangos
 * con año no entran lado a lado, y así bajan de renglón en lugar de ensanchar
 * la tabla.
 */
function PartialHeading({
  partial,
  children,
}: {
  readonly partial: string | null;
  readonly children: ReactElement;
}) {
  if (partial === null) {
    return children;
  }
  return (
    <span>
      {children}{" "}
      <span className="text-muted-foreground">{reportLabels.partialDays(partial)}</span>
    </span>
  );
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
    return <EmptyGroupHeading label={projectLabels.noProject} />;
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

/**
 * El nombre de la tarea y su proyecto en gris, como el cliente de un proyecto:
 * dos tareas que se llaman igual en proyectos distintos se distinguen (D-R3-4).
 * «Sin tarea» en gris y sin proyecto, porque junta varios.
 */
function TaskHeading({ group }: { readonly group: ReportTaskGroup }) {
  if (group.task === null) {
    return <EmptyGroupHeading label={reportLabels.noTask} />;
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

/**
 * Solo el nombre, como el cliente o la etiqueta, archivados o no (RP-29); sin
 * él, el «Sin …» de la dimensión.
 */
function NamedHeading({
  named,
  emptyLabel,
}: {
  readonly named: { readonly name: string } | null;
  readonly emptyLabel: string;
}) {
  if (named === null) {
    return <EmptyGroupHeading label={emptyLabel} />;
  }
  return <span className="truncate">{named.name}</span>;
}

/** RP-28: el grupo de lo que no tiene la dimensión, en gris. */
function EmptyGroupHeading({ label }: { readonly label: string }) {
  return <span className="text-muted-foreground">{label}</span>;
}
