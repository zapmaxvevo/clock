import {
  REPORT_GROUP_BYS,
  reportLevelsOf,
  type ReportGroupBy,
  type ReportGrouping,
} from "@/modules/report/schema";

/** Los niveles como agrupación, con la opción solo si el primero es la persona (D-R9-12). */
function groupingOf(
  [groupBy, ...subgroups]: readonly ReportGroupBy[],
  peopleWithoutTime: boolean,
): ReportGrouping {
  if (groupBy === undefined) {
    throw new RangeError("Una agrupación tiene al menos un nivel.");
  }
  return {
    groupBy,
    subgroups,
    peopleWithoutTime: peopleWithoutTime && groupBy === "person",
  };
}

/**
 * D-R3-8: la agrupación con `dimension` en el nivel `level`, donde 0 es
 * «Agrupar por». Si la dimensión ya está en otro nivel, los dos se
 * intercambian. `null` quita ese nivel y los de abajo, y no vale en el 0.
 * Las personas sin horas se conservan solo si la persona sigue en el primer
 * nivel (D-R9-12).
 * Lanza si `level` está más abajo que el siguiente al último, y si es un nivel
 * nuevo con una dimensión que ya está arriba, porque no hay con qué
 * intercambiarla.
 */
export function withLevel(
  grouping: ReportGrouping,
  level: 0 | 1 | 2,
  dimension: ReportGroupBy | null,
): ReportGrouping {
  const levels = [...reportLevelsOf(grouping)];
  if (level > levels.length) {
    throw new RangeError(`El nivel ${level} no tiene el de arriba.`);
  }
  if (dimension === null) {
    if (level === 0) {
      throw new RangeError("El primer nivel no se quita.");
    }
    return groupingOf(levels.slice(0, level), grouping.peopleWithoutTime);
  }
  const current = levels.indexOf(dimension);
  if (current === -1) {
    levels[level] = dimension;
    return groupingOf(levels, grouping.peopleWithoutTime);
  }
  if (level === levels.length) {
    // Un nivel nuevo no tiene con qué intercambiar: quedaría un hueco arriba.
    throw new RangeError(`${dimension} ya está en el nivel ${current}.`);
  }
  levels[current] = levels[level];
  levels[level] = dimension;
  return groupingOf(levels, grouping.peopleWithoutTime);
}

/** Lo que ofrece el nivel 1 o 2, en el orden de `REPORT_GROUP_BYS`: lo que no está arriba. */
export function levelOptions(
  grouping: ReportGrouping,
  level: 1 | 2,
): readonly ReportGroupBy[] {
  const above = reportLevelsOf(grouping).slice(0, level);
  return REPORT_GROUP_BYS.filter((dimension) => !above.includes(dimension));
}
