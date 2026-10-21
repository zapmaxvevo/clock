import { sameId } from "@/lib/project-pair";

import type { ProjectSettings, UpdateProjectValues } from "./schema";

/** Lo que un parche cambia de un proyecto, con las claves del esquema de Drizzle. */
export type ProjectSettingsChanges = Partial<Omit<ProjectSettings, "id">>;

/**
 * D-P1-3: los campos de `input` que difieren de la fila. Lo que no viaja no
 * cambia. El cliente se compara sin distinguir mayúsculas, como la base.
 */
export function changedProjectFields(
  row: ProjectSettings,
  input: UpdateProjectValues,
): ProjectSettingsChanges {
  return {
    ...(input.name !== undefined && input.name !== row.name ? { name: input.name } : {}),
    ...(input.clientId !== undefined && !sameId(input.clientId, row.clientId)
      ? { clientId: input.clientId }
      : {}),
    ...(input.color !== undefined && input.color !== row.color
      ? { color: input.color }
      : {}),
    ...(input.note !== undefined && input.note !== row.note ? { note: input.note } : {}),
    ...(input.billableByDefault !== undefined &&
    input.billableByDefault !== row.billableByDefault
      ? { billableByDefault: input.billableByDefault }
      : {}),
  };
}

/** Los valores anteriores de los campos que cambian, para la constancia (§4.5). */
export function previousOf(
  row: ProjectSettings,
  changes: ProjectSettingsChanges,
): ProjectSettingsChanges {
  return {
    ...(changes.name !== undefined ? { name: row.name } : {}),
    ...(changes.clientId !== undefined ? { clientId: row.clientId } : {}),
    ...(changes.color !== undefined ? { color: row.color } : {}),
    ...(changes.note !== undefined ? { note: row.note } : {}),
    ...(changes.billableByDefault !== undefined
      ? { billableByDefault: row.billableByDefault }
      : {}),
  };
}
