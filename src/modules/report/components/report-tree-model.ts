import type { ReportGroup } from "@/modules/report/schema";

/** Una fila del árbol que se ve, en preorden (D-R3-9). */
export type VisibleRow = {
  /** La del padre más `groupKey`: única aunque el mismo día esté debajo de dos proyectos. */
  readonly key: string;
  /** 1 es el primer nivel. */
  readonly level: number;
  readonly group: ReportGroup;
  /** Tiene hijos: lleva el botón de expandir. */
  readonly expandable: boolean;
  readonly expanded: boolean;
};

/** Una fila por persona, proyecto, cliente, tarea, etiqueta o día; cada «Sin …» es una sola. */
export function groupKey(group: ReportGroup): string {
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

/**
 * Las filas que se ven con las claves de `open` abiertas: una fila se ve si
 * todos sus ancestros están abiertos, así que cerrar un grupo oculta a todos
 * sus descendientes y reabrirlo los muestra como estaban.
 */
export function visibleRows(
  groups: readonly ReportGroup[],
  open: ReadonlySet<string>,
): VisibleRow[] {
  return rowsOf(groups, open, "", 1);
}

function rowsOf(
  groups: readonly ReportGroup[],
  open: ReadonlySet<string>,
  parentKey: string,
  level: number,
): VisibleRow[] {
  return groups.flatMap((group) => {
    const key = `${parentKey}/${groupKey(group)}`;
    const { children } = group;
    const expanded = children !== undefined && open.has(key);
    const row: VisibleRow = {
      key,
      level,
      group,
      expandable: children !== undefined,
      expanded,
    };
    if (children === undefined || !expanded) {
      return [row];
    }
    return [row, ...rowsOf(children, open, key, level + 1)];
  });
}
