import { INVITE_LIMIT, type InviteOutcome } from "@/modules/workspace/schema";
import type { Role } from "@/server/permissions";

/**
 * Textos de la pantalla de equipo. Los mensajes de error de las actions no
 * viven acá: salen de `teamMessages` y de `invitationMessages`, en los esquemas
 * de `team` y de `workspace`. La entrada «Equipo» de la navegación va en
 * `app-nav.tsx`, con las demás.
 */
export const teamLabels = {
  /** El título visible, que también nombra la tabla. */
  heading: "Equipo",
  intro:
    "Un administrador ve las horas de todas las personas en los reportes y puede hacer administradoras a otras personas. Solo el propietario quita el rol de administrador, y el suyo no se cambia.",
  /** D-R8-2: un member, un `project_manager` o un `team_manager` activos. */
  forbiddenRole: "No tenés permiso para administrar el equipo.",
  /** RP-07: el cuerpo del aviso de membresía desactivada, propio de esta pantalla. */
  forbiddenBody: "No podés administrar el equipo.",
  /** La lectura falló; nunca una tabla vacía. */
  loadFailed: "No se pudo cargar el equipo.",
  personColumn: "Persona",
  roleColumn: "Rol",
  /** D-E1a-12: aloja «Cambiar rol» y «Revocar invitación». */
  actionsColumn: "Acciones",
  self: "(vos)",
  promote: "Hacer administrador",
  demote: "Quitar administrador",
  /** D-R8-10: la misma acción se repite en cada fila, así que el nombre suma la persona. */
  actionName: (action: string, name: string) => `${action}: ${name}`,
  /** El aviso vive en la tabla y nombra a la persona de la fila (§5.4). */
  changeFailed: (name: string) => `No se pudo cambiar el rol de ${name}.`,
  /** El cuerpo del aviso con `unexpected`: el título ya dice qué no se hizo. */
  unexpectedBody: "Revisá la conexión y volvé a intentar.",
  changed: (name: string, role: string) => `Rol de ${name}: ${role}.`,
  /** EQ-93: quien mira está solo y no hay invitadas. */
  emptyInvitations: "Todavía no invitaste a nadie.",
  invite: "Invitar",
  invitedMark: "Invitada",
  externalMark: "Externa",
  revoke: "Revocar invitación",
  revokeTitle: (email: string) => `¿Revocar la invitación de ${email}?`,
  revokeBody:
    "No va a poder entrar con esta invitación. Podés volver a invitar a este correo cuando quieras.",
  revokeConfirm: "Revocar",
  cancel: "Cancelar",
  revoked: (email: string) => `Invitación de ${email} revocada.`,
  revokeFailed: (email: string) => `No se pudo revocar la invitación de ${email}.`,
  /** El diálogo de §5.3. */
  inviteTitle: "Invitar personas",
  emailsField: "Correos",
  emailsHelp: `Uno o más, separados por comas, espacios o saltos de línea. Hasta ${INVITE_LIMIT} por vez.`,
  inviting: "Invitando…",
  dropRejected: "Quitar los que fallan",
  resultTitle: "Invitaciones",
  resultIntro: "Clock no manda correos: avisale a cada persona con este texto.",
  outcomes: {
    invited: "Invitada",
    already_invited: "Ya estaba invitada",
    already_member: "Ya está en el equipo",
  } satisfies Record<InviteOutcome["result"], string>,
  /** D-E1a-10: el aviso que se copia, con la dirección de `BETTER_AUTH_URL`. */
  notice: (appUrl: string, email: string) =>
    `Entrá a ${appUrl} con tu cuenta de Google ${email}.`,
  copy: "Copiar",
  copyName: (email: string) => `Copiar aviso para ${email}`,
  copied: "Aviso copiado.",
  copyFailed: "No se pudo copiar. Seleccioná el texto y copialo a mano.",
  done: "Listo",
  roles: {
    owner: "Propietario",
    admin: "Administrador",
    project_manager: "Responsable de proyectos",
    team_manager: "Responsable de equipo",
    member: "Miembro",
  } satisfies Record<Role, string>,
} as const;
