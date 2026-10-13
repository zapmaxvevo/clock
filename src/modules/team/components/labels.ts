import type { Role } from "@/server/permissions";

/**
 * Textos de la pantalla de equipo. Los mensajes de error de la action no viven
 * acá: salen de `teamMessages`, en el esquema del módulo. La entrada «Equipo»
 * de la navegación va en `app-nav.tsx`, con las demás.
 */
export const teamLabels = {
  /** El título visible, que también nombra la tabla. */
  heading: "Equipo",
  intro:
    "Un administrador ve las horas de todas las personas en los reportes y cambia roles. El rol del propietario no se cambia.",
  /** D-R8-2: un member, un `project_manager` o un `team_manager` activos. */
  forbiddenRole: "No tenés permiso para administrar el equipo.",
  /** RP-07: el cuerpo del aviso de membresía desactivada, propio de esta pantalla. */
  forbiddenBody: "No podés administrar el equipo.",
  /** La lectura falló; nunca una tabla vacía. */
  loadFailed: "No se pudo cargar el equipo.",
  personColumn: "Persona",
  roleColumn: "Rol",
  changeColumn: "Cambiar rol",
  self: "(vos)",
  promote: "Hacer administrador",
  demote: "Quitar administrador",
  /** D-R8-10: la misma acción se repite en cada fila, así que el nombre suma la persona. */
  actionName: (action: string, name: string) => `${action}: ${name}`,
  /** El aviso vive en la tabla y nombra a la persona de la fila (§5.4). */
  changeFailed: (name: string) => `No se pudo cambiar el rol de ${name}.`,
  changed: (name: string, role: string) => `Rol de ${name}: ${role}.`,
  /** D-R8-5: la confirmación de un admin que se baja a sí mismo. */
  selfDemoteTitle: "¿Dejar de ser administrador?",
  selfDemoteBody:
    "Vas a dejar de ver las horas de las otras personas en los reportes y de administrar el equipo. Para volver, el propietario u otro administrador te tiene que cambiar el rol.",
  selfDemoteConfirm: "Dejar de ser administrador",
  cancel: "Cancelar",
  roles: {
    owner: "Propietario",
    admin: "Administrador",
    project_manager: "Responsable de proyectos",
    team_manager: "Responsable de equipo",
    member: "Miembro",
  } satisfies Record<Role, string>,
} as const;
