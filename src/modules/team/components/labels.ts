import type { TeamFilter } from "@/modules/team/schema";
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
    "Un administrador ve las horas de todas las personas en los reportes y puede hacer administradoras a otras personas. Solo el propietario quita el rol de administrador, y el suyo no se cambia. Solo el propietario desactiva, reactiva, vincula la cuenta o libera el correo de un administrador.",
  /** D-R8-2: un member, un `project_manager` o un `team_manager` activos. */
  forbiddenRole: "No tenés permiso para administrar el equipo.",
  /** RP-07: el cuerpo del aviso de membresía desactivada, propio de esta pantalla. */
  forbiddenBody: "No podés administrar el equipo.",
  /** La lectura falló; nunca una tabla vacía. */
  loadFailed: "No se pudo cargar el equipo.",
  /** D-E2-8: el filtro de `?estado=`, debajo de la introducción. */
  statusFilter: "Estado",
  filters: {
    activas: "Activas",
    inactivas: "Inactivas",
    invitadas: "Invitadas",
    todas: "Todas",
  } satisfies Record<TeamFilter, string>,
  personColumn: "Persona",
  roleColumn: "Rol",
  /** D-E1a-12, D-E2-9: aloja «Cambiar rol», el menú de la fila y «Revocar invitación». */
  actionsColumn: "Acciones",
  self: "(vos)",
  /** EQ-05: después del nombre tachado, sin tachar; el estado no depende del tachado. */
  inactiveMark: "(inactiva)",
  /** D-E2-7, §5.2 de E2b: debajo del correo de quien no tiene cuenta ni vinculación pedida. */
  noAccount: "Sin cuenta de Google vinculada.",
  /** D-E2b-9: en lugar del correo, que se liberó; la fila no lleva nota. */
  releasedEmail: "Correo liberado",
  /** §5.2 de E2b: la nota de una vinculación vigente, sin cuenta y con cuenta, y la de una vencida. */
  linkPendingFirst: (requested: string, expires: string) =>
    `Vinculación pedida el ${requested}, vence el ${expires}: falta su primer ingreso con Google.`,
  linkPendingReplace: (requested: string, expires: string) =>
    `Vinculación pedida el ${requested}, vence el ${expires}: la próxima cuenta de Google nueva con este correo reemplaza a la actual.`,
  linkExpired: (requested: string, expires: string) =>
    `La vinculación pedida el ${requested} venció el ${expires}.`,
  promote: "Hacer administrador",
  demote: "Quitar administrador",
  /** D-R8-10: la misma acción se repite en cada fila, así que el nombre suma la persona. */
  actionName: (action: string, name: string) => `${action}: ${name}`,
  /** El aviso vive en la tabla y nombra a la persona de la fila (§5.4). */
  changeFailed: (name: string) => `No se pudo cambiar el rol de ${name}.`,
  /** El cuerpo del aviso con `unexpected`: el título ya dice qué no se hizo. */
  unexpectedBody: "Revisá la conexión y volvé a intentar.",
  changed: (name: string, role: string) => `Rol de ${name}: ${role}.`,
  /** D-E2-9: el menú de la fila, como el de una entrada del rastreador. */
  rowActions: (name: string) => `Acciones de ${name}`,
  deactivate: "Desactivar",
  reactivate: "Reactivar",
  /** EQ-46: desactivar se confirma; reactivar no (EQ-47). */
  deactivateTitle: (name: string) => `¿Desactivar a ${name}?`,
  deactivateBody:
    "No va a poder entrar. Si tiene un timer en curso, se detiene. Sus horas quedan.",
  deactivateConfirm: "Desactivar",
  deactivated: (name: string) => `Desactivaste a ${name}.`,
  reactivated: (name: string) => `Reactivaste a ${name}.`,
  /** D-E2b-5: reactivar a quien no tiene cuenta también pide la vinculación. */
  reactivatedWithLink: (name: string) =>
    `Reactivaste a ${name}. Su cuenta de Google se vincula en su próximo ingreso.`,
  deactivateFailed: (name: string) => `No se pudo desactivar a ${name}.`,
  reactivateFailed: (name: string) => `No se pudo reactivar a ${name}.`,
  /** §5.3 de E2b: las entradas del menú sobre la vinculación y el correo. */
  requestLink: "Vincular una cuenta de Google",
  requestOtherLink: "Vincular otra cuenta de Google",
  renewLink: "Volver a pedir la vinculación",
  cancelLink: "Cancelar la vinculación",
  releaseEmail: "Liberar el correo",
  /** §5.4 de E2b: la confirmación de vincular, también la de reactivar sin cuenta. */
  reactivateTitle: (name: string) => `¿Reactivar a ${name}?`,
  linkFirstTitle: (name: string) => `¿Vincular una cuenta de Google a ${name}?`,
  linkOtherTitle: (name: string) => `¿Vincular otra cuenta de Google a ${name}?`,
  linkFirstBody: (days: number, email: string, name: string) =>
    `En los próximos ${days} días, la próxima cuenta de Google que entre con ${email} va a quedar vinculada a ${name}, con su rol y sus horas. Hacelo solo si ese correo sigue siendo suyo.`,
  linkOtherBody: (days: number, email: string, name: string) =>
    `En los próximos ${days} días, la próxima cuenta de Google nueva que entre con ${email} va a reemplazar a la actual, con el rol y las horas de ${name}. Hasta entonces, la cuenta actual sigue entrando. Hacelo solo si ese correo sigue siendo suyo.`,
  /** D-E2b-8: el párrafo que suma la confirmación cuando el pedido registra a un externo. */
  linkExternalBody: (email: string, name: string) =>
    `${email} queda registrado como invitado externo, y sigue registrado aunque después canceles la vinculación o venza. Si ${name} ya tiene una cuenta de Google vinculada, vuelve a entrar con ella desde ahora.`,
  linkConfirm: "Vincular",
  /** D-E2b-9: liberar se confirma y no se deshace. */
  releaseTitle: (name: string) => `¿Liberar el correo de ${name}?`,
  releaseBody: (email: string, name: string) =>
    `${email} deja de ser de ${name} y lo vas a poder invitar para otra persona. ${name} queda inactiva, con sus horas, y no va a poder volver a entrar ni reactivarse. No se puede deshacer.`,
  releaseConfirm: "Liberar el correo",
  /** §5.5 de E2b: los avisos de la vinculación y del correo. */
  linkRequested: (name: string) => `Pediste vincular una cuenta de Google a ${name}.`,
  linkCancelled: (name: string) => `Cancelaste la vinculación de ${name}.`,
  emailReleased: (name: string) => `Liberaste el correo de ${name}.`,
  linkFailed: (name: string) => `No se pudo vincular una cuenta de Google a ${name}.`,
  cancelLinkFailed: (name: string) => `No se pudo cancelar la vinculación de ${name}.`,
  releaseFailed: (name: string) => `No se pudo liberar el correo de ${name}.`,
  /** EQ-93: quien mira está solo y no hay invitadas. */
  emptyInvitations: "Todavía no invitaste a nadie.",
  /** EQ-94: el filtro no deja ninguna fila; el párrafo va en lugar de la tabla. */
  emptyInactive: "No hay personas inactivas.",
  emptyInvited: "No hay invitaciones pendientes.",
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
