# Paridad: equipo

Alcance de este documento: la página **Team** de Clockify y lo que cuelga de
ella en el plan Free —la lista de personas, invitar, los roles, desactivar y
reactivar, quitar del workspace, transferir la propiedad, los grupos y el
perfil de una persona editado desde el equipo—, y cómo encaja todo eso con el
login de Clock. No cubre los ajustes del workspace, que tienen su propia
especificación, ni el perfil propio ([`perfil.md`](perfil.md)), ni los reportes
([`reportes.md`](reportes.md)), ni el acceso a proyectos
([`proyectos.md`](proyectos.md)) salvo donde se cruzan.

Cada comportamiento lleva un identificador `EQ-nn` y una marca `replicar`,
`adaptar` o `fuera de alcance`; las dos últimas llevan una línea de
justificación. Las preguntas abiertas son `P-nn` de este documento; las de otro
documento se nombran con el suyo («P-09 de `reportes.md`»).

Relevado el 2026-10-16 para el arranque de la fase 2. El mismo día el usuario
respondió las preguntas P-01 a P-09 de la
[sección 18](#18-pendientes-de-definición-del-equipo) con las recomendaciones:
lo que este documento proponía atado a ellas quedó decidido, y cada
comportamiento dice qué pregunta lo decidió. Sigue abierta P-10, que no es una
decisión sino la lista de verificación. P-11, sobre EQ-111, la respondió
también el 2026-10-16, con la recomendación del contrato de E1b.

## Punto de partida en Clock

Lo que ya existe y este documento no reabre:

- **`/equipo`, del slice R8** ([contrato](../slices/nucleo-reportes-r8-cambiar-rol.md)):
  la ven solo owner y admin activos (RP-70); lista las membresías activas por
  nombre, con el correo en gris y «(vos)»; el owner y los admins hacen
  administradora a una persona (RP-67), y solo el owner le quita el rol (RP-68,
  [ADR 0023](../adr/0023-quitar-el-rol-de-admin-es-una-accion-propia.md),
  aceptado). El rol del owner no cambia desde ahí (RP-69). El módulo es
  `src/modules/team`, que «la extiende sin moverlo» en la fase 2 (D-R8-1).
- **`can()`** ya tiene las acciones de esta pantalla: `team.view` (todos),
  `team.manage` (owner y admin), `team.admin.revoke` (owner), `member.invite`
  (owner y admin), `workspace.transfer` y `workspace.delete` (owner).
  Corta por `status` antes que por rol (PR-60).
- **El esquema**: `membership` con `role` (los cinco de Clockify), `status`
  (`active`, `inactive`, `invited`), `week_start` y `weekly_capacity_minutes`
  (sin uso); `external_invite` (workspace, correo, quién invitó, `revoked_at`),
  **sin uso en el código**: el login lee la variable `EXTERNAL_INVITE_EMAILS`.
  _Desde E1a_, `invitation`, del módulo `workspace`, reemplazó a
  `external_invite` (migración `0015`;
  [ADR 0024](../adr/0024-donde-vive-una-invitacion-y-donde-se-corta-el-ingreso.md),
  decisión 1); desde E1b la variable no se lee (EQ-32).
  _Corregido el 2026-10-20, WS0_: `weekly_capacity_minutes` ya no existe; se
  borró con la migración `0018` (P-09,
  [contrato de WS0](../slices/fase2-ws0-columnas.md)).
- **Una persona con horas no se borra** (P-09 de `reportes.md`, RP-65,
  [ADR 0020](../adr/0020-nucleo-de-reportes-antes-de-la-fase-2.md)): las claves
  de `time_entry` hacia `user` y hacia `membership` son `restrict`.
- **Desactivar hoy es un procedimiento SQL** (mapa del núcleo, §5): pasa la
  membresía a `inactive`, cierra el timer y borra las filas de `session` y de
  `account` de la persona. _Desde E2_, desactivar y reactivar se hacen en
  `/equipo` (EQ-39, EQ-47) y el procedimiento se retira (D-E2-12 del
  [contrato de E2](../slices/fase2-e2-desactivar.md)).
- **La deuda de seguridad**: `ensureWorkspaceContext`
  (`src/modules/workspace/service.ts`) crea una membresía `member` a cualquiera
  que pase el login —el dominio con el claim `hd`, o la lista de invitados
  externos (`src/server/access.ts`)—. Viene del slice 1 y la fase 2 la cierra
  (sección 3). _Desde E1b_ está cerrada: sin invitación no se entra (EQ-29).

## Fuentes y límites del relevamiento

Centro de ayuda de Clockify, referencia pública de su API y páginas de precios,
consultados el 2026-10-16:

- https://clockify.me/help/administration/inviting-users (la página de equipo:
  invitar, filtrar, roles, desactivar, borrar, reactivar)
- https://clockify.me/help/getting-started/getting-started-as-admin-and-workspace-owner/invite-users-assign-roles-in-your-workspace
  («la guía»)
- https://clockify.me/help/administration/bulk-activate-or-deactivate-team-members
- https://clockify.me/help/administration/user-groups
- https://clockify.me/help/administration/edit-profiles
- https://clockify.me/help/administration/user-roles-and-permissions/admins
- https://clockify.me/help/administration/user-roles-and-permissions/regular-users
- https://clockify.me/help/administration/user-roles-and-permissions/manager-role
- https://clockify.me/help/administration/user-roles-and-permissions/who-can-do-what
- https://clockify.me/help/administration/updates-to-clockify-free-plan
- https://clockify.me/help/administration/manage-accounts
- https://clockify.me/pricing y https://clockify.me/paid-features
- https://docs.clockify.me/openapi.json (rutas `users`, `user-groups` y los
  esquemas `UpdateUserStatusRequest`, `UserGroupRequest`,
  `AddUserToWorkspaceRequest`, `MembershipDtoV1`)

**Método.** Toda cita marcada «Documentado» pasó una segunda consulta que pedía
la cadena literal y FOUND con la oración, o NOT FOUND, porque el resumidor de
la herramienta inventa citas. Las oraciones largas quedaron cortadas por el
tope de la herramienta y van con «…». Las celdas de una tabla se citan como
«celda» / «celda». Lo que no pasó el filtro va como _no verificado_ y entra en
la lista de P-10.

**No pude entrar al workspace real del equipo**: no tengo credenciales de
Clockify en este entorno. Lo que solo se ve con una sesión va a P-10.

**La API se cita como indicio, no como pantalla**: dice qué parámetros existen,
no cómo se ven.

### Lo que el plan Free deja fuera de este módulo

Citas confirmadas el 2026-10-16:

| Qué                             | Qué dice la documentación                                                                                                                                                                                                                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rol de responsable de proyectos | «Project manager is a paid feature available on any paid plan.» (roles de manager)                                                                                                                                                                                                                        |
| Rol de responsable de equipo    | «The Team manager role is an additional feature…» y «…a Standard, Pro, or Enterprise plan.» (roles de manager)                                                                                                                                                                                            |
| Campos de usuario               | «Later, each time entry will get that user's data so you can filter and export time entries in Excel/CSV along with user fields.» (funciones pagas, Pro)                                                                                                                                                  |
| Tarifas                         | «You can no longer set hourly rates, assign dollar amounts to projects.» (cambios del plan Free)                                                                                                                                                                                                          |
| Esconder la página de equipo    | «Hide Projects, Team, and Reports from regular users.» (precios, de Basic en adelante)                                                                                                                                                                                                                    |
| Kiosco y miembros limitados     | «Get limited kiosk seats for a much lower price!» (funciones pagas, Basic)                                                                                                                                                                                                                                |
| Cuentas e «iniciar sesión como» | «See your users' information, and log in on their behalf for troubleshooting purposes.» (precios, solo Enterprise)                                                                                                                                                                                        |
| Tope de personas                | «User Limit: 5 active users (including the Owner and active members).» (cambios del plan Free); «You can invite up to 5 users on a Free plan.» (invitar personas); «You can invite up to 4 users on the Free plan.» y «The Free plan allows for unlimited users and projects.» (la guía). Se contradicen. |

**Dos cosas que no aparecen como pagas y no pude confirmar como Free**: los
grupos (EQ-60) y la capacidad con los días laborables (EQ-72). Ninguna página
les pone plan; van a P-10.

## Vocabulario

| Clockify                     | Clock (interfaz en español)           |
| ---------------------------- | ------------------------------------- |
| Team                         | Equipo                                |
| Member (fila de la lista)    | Persona                               |
| Invite / Revoke invite       | Invitar / Revocar invitación          |
| Pending (invitado)           | Invitada                              |
| Deactivate / Activate        | Desactivar / Reactivar                |
| Inactive                     | Inactiva                              |
| Delete user                  | Quitar del equipo                     |
| Transfer ownership           | Transferir la propiedad               |
| Owner / Admin / Member (rol) | Propietario / Administrador / Miembro |
| Group                        | Grupo                                 |
| Week start                   | Primer día de la semana               |

`adaptar`: la interfaz va en español, como en el resto de los documentos. Los
rótulos de los roles son los de `src/modules/team/components/labels.ts`, de R8.
«Persona» es femenino en toda la copia: «inactiva», «invitada», como en
`reportes.md`.

## 1. La pantalla de equipo

**EQ-01 Una pantalla con dos pestañas** — `adaptar`
Documentado: los grupos viven en la misma página, «You can create, edit, and
delete groups in the Groups tab of a Team page.» (grupos), y la lista de
personas tiene dos pestañas, completas y limitadas: «Regular users, Team
managers, or Project managers can filter users in both the Full and Limited
tabs based on the information you have permission to view in the table.»
(invitar personas). Acá: `/equipo` con «Personas» y «Grupos» (EQ-60), sin
pestaña de limitadas. Justificación: las limitadas son del kiosco, pago
(EQ-28).

**EQ-02 Quién ve la pantalla** — `adaptar`
Documentado: un member ve a las demás personas, «See other members» / «Yes
(unless disabled)» (regular users), y filtra la lista con lo que tiene permiso
de ver (la cita de EQ-01). Esconder la página es pago (tabla del plan Free).
Acá sigue RP-70: la ven owner y admin activos; los demás roles no tienen la
entrada «Equipo» y, en `/equipo`, ven «No tenés permiso para administrar el
equipo.» sin lista. Justificación: un member no tiene ninguna acción en esta
pantalla y, con P-01 de `reportes.md`, tampoco ve horas ajenas; abrirle la
lista solo le muestra el directorio de la empresa, que ya tiene en Google. Es
la decisión que R8 dejó a la fase 2 (`team.view`), tomada por el usuario el
2026-10-16 (P-01): un member no ve `/equipo`.

**EQ-03 Columnas** — `adaptar`
Documentado a medias: la columna «Name» (EQ-04) y, en la oración de orden por
columnas, «(e.g. Billable rate, Cost rate, Role, Week start, Daily working
capacity)». Acá: **Persona** (nombre, correo en gris y «(vos)», como R8),
**Rol**, **Grupos** (EQ-63), **Primer día de la semana** (EQ-71) y
**Acciones**, con el botón de rol de R8 y, a su derecha, el menú de la fila.
Justificación: tarifas, capacidad y campos de usuario están fuera (EQ-72 …
EQ-74), y el correo se queda porque dos personas pueden llamarse igual (RP-31).
_No verificado_: qué columnas muestra Clockify por omisión y si muestra el
correo.
_Corregido el 2026-10-19, E2 (D-E2-9)_: decía «**Rol** (con el control de R8)»
y «un menú de acciones por fila». El botón de R8 está en la tercera columna,
que E1a llamó «Acciones» (D-E1a-12), y ahí se queda (EQ-35).

**EQ-04 Las invitadas están en la lista, marcadas** — `replicar`
Documentado: «your Team page will show invited users with the envelope icon
next to their names in the Name column» (invitar personas). Acá: la fila de una
invitación muestra el correo en lugar del nombre —el nombre llega de Google en
el primer ingreso (PF-45)—, la marca «Invitada», sin rol editable (EQ-16) y con
«Revocar invitación» (EQ-23).

**EQ-05 Las inactivas, tachadas y aparte** — `replicar`
Documentado: «All inactive user names are struck out.» (invitar personas);
«User's name is moved to the "Inactive" list» (tabla de la guía); y la persona
desactivada «…won’t be able to see and track time on the workspace and won’t
appear on the Team page anymore.» (invitar personas), es decir, no está en la
vista por omisión. Acá: con el filtro por omisión no aparecen; con «Inactivas» o
«Todas», el nombre va tachado y seguido de «(inactiva)», porque el tachado no se
anuncia (es la forma de RP-62 y RP-31).

**EQ-06 Filtro de estado** — `adaptar`
Documentado: «Select Show all or Show inactive users in the drop down menu»
(invitar personas) y «Select Show All or Show Inactive Users from the
dropdown» (la guía). Acá: un selector con **Activas** (por omisión, incluye a
las invitadas con su marca), **Inactivas**, **Invitadas** y **Todas**.
Justificación de «Invitadas» como opción propia: revisar las invitaciones
pendientes es lo que se hace antes de revocar, y con una lista de toda la
empresa no se encuentran a ojo.
_No verificado_: cómo se llama la opción por omisión de Clockify («Show active»
NOT FOUND) y si en ella están las invitadas.

**EQ-07 Búsqueda** — `adaptar`
No documentada («Search» solo aparece como «Popular searches» del sitio). Acá:
un buscador sobre el nombre y el correo, sin distinguir mayúsculas, que se
combina con el filtro de estado. Justificación: R8 la dejó para la fase 2 «si
hace falta» (§8 de su contrato), y con todas las personas de la empresa en una
lista hace falta.

**EQ-08 Filtros por rol y por grupo** — `adaptar`
Documentado: una barra de filtros con criterios «(e.g. role, group, week
start…)», «Click Apply Filter to update the table with your filtered results»
y «Clear filters to reset your view.» (invitar personas). Acá: filtro por rol y
por grupo (este, con EQ-60), que se aplican al elegir, sin botón «Aplicar».
Justificación: el primer día de la semana y los campos personalizados como
criterio no se justifican con tres roles y una sola empresa; los campos son
pagos.

**EQ-09 Columnas configurables y orden por columna** — `fuera de alcance`
Documentado: «Select/Deselect Columns: Choose which columns are visible in the
table» y «Sort Columns: Sort data by most columns that contain single
values…» (invitar personas). Justificación: casi todas las columnas que se
esconden o por las que se ordena son pagas; el orden fijo por nombre de R8
(`compareNames`) alcanza.

**EQ-10 Paginación** — `fuera de alcance`
No documentada («pagination» y «load more» NOT FOUND). La API pagina de a 50
(`page-size` de `GET /users`), como indicio. Justificación: R8 §10 ya la dejó
fuera; el tamaño de la lista lo acota la empresa.

**EQ-11 La fila que cambia de estado se queda hasta recargar** — `replicar`
Documentado (desactivar en masa): «After deactivating users, they will remain
visible on your screen regardless of your current filters.» y «This allows you
to review your changes before refreshing or navigating away from the page.».
Acá: al desactivar o reactivar, la fila se queda donde estaba, con su estado
nuevo, y la pantalla lo anuncia; la próxima carga la ubica según el filtro.
_No verificado_: si vale también para la acción de a una persona.

## 2. Invitar

**EQ-12 Quién invita y revoca** — `replicar`
Documentado: «Only owners and admins can invite new users to a workspace,
deactivate users, revoke their invite…» (invitar personas); «Invite users» /
«Yes» (admins); «Invite users» / «No» (regular users y roles de manager). Es
`member.invite`, que ya existe con owner y admin.

**EQ-13 Invitar a una o varias personas por correo** — `replicar`
Documentado: «Click Add new member/Add full member (if kiosk is activated) in
the upper right corner», «Enter the email/s of the person/s you want to
invite» y «…then click Send invite.» (invitar personas). Acá: «Invitar» en la
cabecera de `/equipo`, que abre un diálogo con un campo de texto para uno o más
correos —separados por coma, espacio o salto de línea— y «Invitar». Tope
propio: 50 correos por pedido (EQ-78), con el mismo criterio que las 50
etiquetas de PR-48.
_No verificado_: qué separadores acepta Clockify («comma» NOT FOUND) y si tiene
tope.

**EQ-14 Un correo inválido frena el envío** — `replicar`
Documentado: «Invalid emails will be highlighted in red.» y «…click Remove all
invalid emails (located in the bottom-right corner of the list)» (invitar
personas). Acá: el pedido es todo o nada
([ADR 0011](../adr/0011-las-acciones-en-masa-son-todo-o-nada.md)): si un correo
no pasa (EQ-76, EQ-79), no se crea ninguna invitación y el diálogo queda
abierto con la lista, cada correo con problema marcado y su causa. «Quitar los
que fallan» deja en el campo solo los válidos.

**EQ-15 Nombre al invitar** — `fuera de alcance`
Documentado: «Toggle Insert names to ON if you want to assign a full name to
each user you are adding» (invitar personas). Justificación: el nombre llega de
Google en cada ingreso y el editado vive en el perfil (PF-08, PF-45); un tercer
origen del nombre no tiene dónde vivir.

**EQ-16 Se invita como miembro; el rol se da después** — `replicar`
Documentado: los pasos de invitar no eligen rol (lista «To invite users to your
workspace:», invitar personas), y «Regular users can become Admins or Team
managers after being promoted by existing Admins and Project managers»
(regular users). Acá: la invitación entra como `member`, y el rol se cambia con
el control de R8 cuando la persona ya está activa (RP-67).

**EQ-17 Aceptar la invitación es entrar con Google** — `adaptar`
Documentado: «Members can sign up on their own and they’ll automatically be
part of your workspace (if they have a pending invite).», y quien ya tiene
cuenta «…will receive an email and a notification in Clockify.» y acepta
desde la campana: «…they have to open the bell notification from the top right
corner and click Accept» (invitar personas). Acá no hay registro ni campana: la
invitación se acepta al entrar por primera vez con Google con ese correo, y en
ese momento nace la membresía `active`. Justificación: Google es el único
ingreso (`src/server/auth.ts`).
**Consecuencia para el esquema**: `membership.user_id` apunta a `user`, que
crea Better Auth en el primer ingreso, así que una invitación pendiente no
puede ser una fila de `membership`. Hace falta una tabla por correo: es
`invitation`, del módulo `workspace`, con una fila por workspace y correo en
estado `pending`, `accepted` o `revoked`, que reemplazó a `external_invite` en
E1a (migración `0015`;
[ADR 0024](../adr/0024-donde-vive-una-invitacion-y-donde-se-corta-el-ingreso.md),
decisiones 1 y 2). **No se crean filas de `user` por adelantado**: con el
enlace implícito apagado (PF-47), una fila de `user` con ese correo le cerraría
la entrada a la cuenta de Google verdadera.

**EQ-18 Antes de aceptar, la invitada no accede a nada** — `replicar`
Documentado: «A user remains “Pending” or “Inactive” until they click the link
in their invitation email and verify their account.» (la guía). Acá: sin
primer ingreso no hay cuenta ni membresía; la invitada no ve nada y no aparece
en los reportes (RP-64). Con EQ-17, el estado `invited` de `membership_status`
no representa una invitación pendiente: queda sin escritor y no se quita,
porque sacar un valor de un enum de Postgres pide recrear el tipo; es deuda del
mapa de la fase 2 (ADR 0024, decisión 7).

**EQ-19 Un correo que ya tiene invitación pendiente** — `adaptar`
Documentado solo del lado del registro: «If the user is already invited, they
won’t be able to create an account with the same email address on the Signup
page.» (invitar personas). Acá: no es error. La invitación existente queda como
está y el resultado la cuenta como hecha, con «ya estaba invitada»; el mismo
correo repetido en un pedido cuenta una vez. Justificación: es lo que hace
seguro el reintento de EQ-97, con el mismo criterio que el
[ADR 0007](../adr/0007-el-cliente-elige-el-id-de-las-altas.md).

**EQ-20 El correo de una persona activa** — `adaptar`
No documentado. Acá: no es error; el resultado la cuenta como hecha, con «ya
está en el equipo». Justificación: no hay nada que hacer y frenar un pedido de
veinte correos por uno que ya entró no protege nada.

**EQ-21 El correo de una persona inactiva** — `adaptar`
No documentado. Reactivar es una acción propia (EQ-47) y volver después de un
borrado pide «a completely new invitation» (EQ-50), lo que sugiere que una
inactiva vuelve reactivándola. Acá: error de ese correo (EQ-79), y por EQ-14 no
se crea ninguna. Justificación: reactivar le devuelve rol, proyectos y grupos
(EQ-45, EQ-47), y una invitación no; que el admin elija a sabiendas.

**EQ-22 Correos de otro dominio** — `adaptar`
Clockify invita cualquier correo. En Clock el login acepta el dominio de la
empresa, con el claim `hd`, o un correo de la lista de invitados externos, que
hoy es la variable `EXTERNAL_INVITE_EMAILS`. Decidido el 2026-10-16 (P-03):
invitar desde la pantalla un correo de otro dominio lo habilita como invitado
externo —es lo que describía el comentario de `external_invite`, la tabla que
E1a reemplazó por `invitation` (migración `0015`): «La lista inicial llega por
EXTERNAL_INVITE_EMAILS y a partir de ahí se administra desde la app.»—, y la
fila lleva además la marca «Externa», que se deriva del dominio del correo
(ADR 0024, decisión 9). Lo hacen el owner y los admins, como cualquier
invitación (EQ-12).
_Desde E1b_: `EXTERNAL_INVITE_EMAILS` ya no se lee. Un correo de otro dominio
entra solo con su invitación en la base
([ADR 0024](../adr/0024-donde-vive-una-invitacion-y-donde-se-corta-el-ingreso.md),
decisión 3; EQ-32).
_Desde E2b_ (D-E2b-8 del [contrato de E2b](../slices/fase2-e2b-sin-cuenta.md)):
una `accepted` también nace cuando quien administra pide la vinculación de un
externo sin invitación abierta (EQ-115), también al reactivarlo sin cuenta
(EQ-47): sin ella, su vinculación nunca se usaría. Una `revoked` pasa a
`accepted`. Queda con quien la pidió como autor y con `invitation.register` en
el audit log, que la distingue de la que dejó un ingreso por invitación
(`invitation.accept`), y no se deshace al cancelar la vinculación, al dejarla
vencer ni al usarla. Un externo activo con cuenta y sin invitación abierta
vuelve a entrar con su cuenta desde ese momento; para cortarlo, se lo desactiva
(EQ-39). La confirmación de la vinculación lo avisa. Es la decisión 8 del
[ADR 0027](../adr/0027-una-fila-user-sin-cuenta-de-google.md), que cambia lo que
significa una `accepted` en el ADR 0024. Sin equivalente relevado en Clockify.

**EQ-23 Revocar una invitación** — `replicar`
Documentado: «Choose Revoke invite option» y «Once you confirm the action, the
invite is revoked and the previously invited user is no longer visible in the
Team page.» (invitar personas); quién, en EQ-12. Acá: «Revocar invitación» en
la fila de una invitada, con confirmación; la fila sale de la lista y el correo
se puede volver a invitar.

**EQ-24 Una invitación revocada no deja entrar** — `replicar`
Documentado: «If the user tries to accept the invite after it has been revoked,
they will be redirected to the landing page…» y «…with the info that the
invite has expired» (invitar personas). Acá: el ingreso con ese correo se
responde como un ingreso sin invitación (EQ-91). El dominio de la empresa no es
otra vía de entrada: también entra por invitación (EQ-29, P-02).

**EQ-25 Las invitaciones no vencen** — `adaptar`
No hay vencimiento documentado; la página solo dice «expired» de la revocada.
Acá: una invitación vale hasta que se usa o se revoca. Justificación: con pocas
invitaciones y un solo cron diario, un vencimiento suma estado sin resolver
nada que revocar no resuelva.

**EQ-26 Correo de invitación y reenvío** — `adaptar`
Documentado: Clockify manda un correo al invitar, y se reenvía: «Click on three
dots next to member and choose Resend an invite email» (invitar personas). La
API tiene `send-email` en `POST /users`, «Indicates whether to send an email
when user is added to the workspace.». Clock no manda correos (PF-28), aunque
`RESEND_API_KEY` y `EMAIL_FROM` existen como variables opcionales en
`src/server/env.ts`. Decidido el 2026-10-16 (P-04): sin correo ni reenvío; al
invitar, el resultado muestra un texto para avisar a mano —«Entrá a {dirección
de Clock} con tu cuenta de Google {correo}.»— con «Copiar».

**EQ-27 Tope de personas** — `fuera de alcance`
Documentado y contradictorio: las citas del tope en la tabla del plan Free y,
para bajar a Free, «limits your active team to the Owner and the 4 oldest
active users» (desactivar en masa). Justificación: es un límite comercial
(RP-66).

**EQ-28 Miembros limitados y kiosco** — `fuera de alcance`
Documentado: la pestaña de limitadas (EQ-01) y el kiosco como función paga
(tabla del plan Free). Justificación: pago, y el kiosco es un dispositivo
compartido sin ingreso por Google.

## 3. El ingreso: la invitación cierra la deuda

En Clockify se entra a un workspace ajeno solo por invitación (EQ-17). En Clock,
hoy, entra cualquiera que pase el login y queda `member`. Esta sección dice
cómo se cierra, con P-02 decidido el 2026-10-16; todo es `adaptar`, porque el
login de Clock no tiene equivalente en Clockify.
_No verificado_: si Clockify tiene alguna forma de unirse a un workspace por
dominio sin invitación; no la encontré en las páginas relevadas.

**EQ-29 Una membresía nueva nace de una invitación** — `adaptar`
Decidido el 2026-10-16 (P-02), también para el dominio de la empresa: el primer
ingreso crea la membresía solo si hay una invitación
vigente para ese correo (o es el owner del arranque, EQ-30). Sin invitación, el
ingreso se rechaza con EQ-91 y no se crean ni membresía ni sesión. La regla de
dominio de `decideGoogleAccess` se conserva y se suma: hace falta pasar las
dos. Se corta en `mapProfileToUser`, y el gancho de sesión lo vuelve a
comprobar en cada inicio
([ADR 0024](../adr/0024-donde-vive-una-invitacion-y-donde-se-corta-el-ingreso.md),
decisión 4); el requisito es que sin invitación no quede una sesión con la que
pedir páginas.
Justificación: replica cómo se entra en Clockify y cierra la deuda del slice 1.
La alternativa —que el dominio entre solo y la invitación sirva únicamente a los
externos— dejaba la deuda como está y quedó descartada.

**EQ-30 El owner del arranque no necesita invitación** — `adaptar`
`WORKSPACE_OWNER_EMAIL` crea el workspace y la membresía `owner` en el primer
ingreso. Se conserva **solo para el arranque**, cuando no hay workspace. Antes
de E1b también daba el rol `owner` a ese correo cada vez que su membresía no
existía (`workspace/service.ts:73` en `e9ba1ec`); después de una transferencia
(EQ-57) eso podía dejar dos owners si esa membresía se quitaba (EQ-51) y se
volvía a crear. Desde E1b, con un workspace, es un correo más: entra por
membresía o por invitación, como `member` (D-E1b-3 del
[contrato de E1b](../slices/fase2-e1b-ingreso.md)).
Justificación: la variable nombra a quien arranca, no a quien es owner hoy.

**EQ-31 Las membresías que ya existen no cambian** — `adaptar`
Al cerrar la deuda nadie pierde su membresía y no hay invitación retroactiva.
Quien entró por la deuda y no debía se desactiva (EQ-39) o, si no tiene horas,
se quita (EQ-51). Antes de desplegar conviene una consulta informativa en
producción —las membresías que existen y quién las tiene—, como la de R1, para
que el usuario revise la lista. Justificación: cerrar la puerta no debe sacar a
nadie que ya trabaja con Clock.

**EQ-32 Los invitados externos pasan de la variable a la base** — `adaptar`
Hoy `EXTERNAL_INVITE_EMAILS` se lee en el login y en cada inicio de sesión, y
sacar un correo de la lista le cierra el acceso. Con EQ-22, la lista vive en la
base y el chequeo de cada inicio la lee de ahí; los correos de la variable se
migran una vez. Cortar a un externo que ya entró es desactivarlo (EQ-39), no
revocar: revocar es solo para pendientes (EQ-23). Justificación: dos lugares
para la misma lista es la regla de acceso en dos lugares.
_Desde E1b_: la variable no se lee y el script que copiaba sus correos a la
base salió (D-E1b-12 del [contrato de E1b](../slices/fase2-e1b-ingreso.md)).
Producción nunca la tuvo, así que no hubo nada que migrar.

**EQ-33 La fecha de alta es la de activación** — `adaptar`
RP-64 y la §9 del contrato de R9 piden que, con invitaciones, «quien entró
después del período» se decida por la fecha de activación y no por la de la
invitación. Con EQ-17 la membresía nace al aceptar, así que
`membership.created_at` ya es esa fecha y no hace falta una columna propia
(ADR 0024, «Consecuencias»).

## 4. Roles

**EQ-34 Los roles del plan Free: propietario, administrador y miembro** —
`replicar`
Documentado: los dos roles de manager son pagos (tabla del plan Free); el de
admin no tiene nota de plan, y su tabla de permisos es la de la página de
admins. El enum de cinco valores se queda; la pantalla escribe solo dos, como
en R8 (D-R8-4).

**EQ-35 Dar y quitar el rol de admin** — `replicar`
Ya construido: RP-67, RP-68 y RP-69, con el
[ADR 0023](../adr/0023-quitar-el-rol-de-admin-es-una-accion-propia.md). Vuelto a
confirmar el 2026-10-16: «Only the Workspace owner can remove an admin role
from someone» (invitar personas) y «Only the Workspace Owner can remove the
Admin role from someone.» (la guía). La fase 2 no lo toca: el botón de R8 se
queda en la columna «Acciones», y las acciones nuevas van al menú de la fila,
«Acciones de {nombre}», a su derecha (D-E2-9 del
[contrato de E2](../slices/fase2-e2-desactivar.md)).
_Corregido el 2026-10-19, E2_: decía que el control de R8 se quedaba en la
columna «Rol». No estaba ahí: R8 lo puso en la tercera columna, que E1a
renombró «Acciones» (D-E1a-12). E2 no lo mueve a «Rol» ni lo mete en el menú,
porque eso reescribía los recorridos de R8 y de E1a sin que E2 lo necesitara.

**EQ-36 Responsable de proyectos y de equipo** — `fuera de alcance`
Justificación: pagos (EQ-34). Las membresías que los tengan por SQL se ven con
su rótulo y sin control, como en R8. La marca de responsable de un proyecto es
otra cosa, por proyecto (PR-19).

**EQ-37 El rol de una persona inactiva** — `adaptar`
No documentado (P-12 de `reportes.md`). Decidido el 2026-10-16 (P-06):
desactivar y reactivar conservan el rol, y mientras la persona está inactiva el
rol no se cambia (R8 ya responde `inactive_membership`). Justificación:
reactivar devuelve a la persona como estaba, y mientras tanto `can()` ya le
corta todo por estado. R8
lo dejó a esta pantalla (§8 de su contrato: «Al reactivar, en la fase 2, vuelve
admin; esa pantalla decide si lo baja.»). La alternativa —bajarla a `member`
al desactivar— quedó descartada.

**EQ-38 Lo que un admin no puede hacerle a otro admin ni al owner** —
`replicar`
Documentado (desactivar en masa): «Owners can activate or deactivate anyone in
the workspace», «Admins can bulk manage all regular roles (Team Members,
Project Managers, etc.)» y «Admins cannot manage owners or other admins». La
página de admins, en cambio, da «Set up user’s status (active/inactive)» /
«Yes» sin excepción, y su única excepción es «Manage users» / «Yes (except
removing Admin role – Owner only)». O se contradicen, o la primera habla solo
de la acción en masa.
Decidido el 2026-10-16 (P-07): **desactivar y reactivar a un admin es solo del
owner**, con una
acción propia, como dejó dicho el ADR 0023 («si Clockify exceptúa algo más,
entra como otra acción propia, no como una regla por rol dentro de
`team.manage`»). Editar el primer día de un admin sigue en `team.manage`, porque
«Owners and Admins can edit users’ profile.» (perfiles) no exceptúa a nadie.
_Desde E2b_ (D-E2b-4 del [contrato de E2b](../slices/fase2-e2b-sin-cuenta.md)),
decidido por el usuario el 2026-10-19: la misma frontera vale para vincular una
cuenta de Google (EQ-115) y para liberar el correo (EQ-116). Los hacen el owner
y los admins, y sobre un admin o sobre el owner, solo el owner, con la acción
propia `team.admin.account`. Un admin no vincula su propia fila, como no la
desactiva; el owner sí puede pedir la suya.

## 5. Desactivar y reactivar

**EQ-39 Quién desactiva** — `replicar`
Documentado: «Only Workspace admins and owners can deactivate a user.»
(invitar personas, RP-60); «Set up user’s status (active/inactive)» / «No»
para regular users y roles de manager. Acá: «Desactivar» en el menú de la fila
de una persona activa, para owner y admin, con la excepción de EQ-38. El
procedimiento SQL del mapa del núcleo se retira, sin migración (D-E2-12 del
[contrato de E2](../slices/fase2-e2-desactivar.md)).
_Corregido el 2026-10-19, E2_: decía «Reemplaza el procedimiento SQL del mapa
del núcleo.». Desde que E2 llega a producción, desactivar es la pantalla; hasta
entonces sigue el procedimiento, que borra `account`, y quien pase por él queda
en EQ-110.

**EQ-40 El owner no se desactiva, y nadie se desactiva a sí mismo** — `adaptar`
No documentado. Acá: ni la fila del owner ni la propia tienen «Desactivar», y
un pedido armado responde EQ-83 o EQ-84. El owner se va transfiriendo antes
(EQ-55). Justificación: con el owner inactivo nadie quita el rol de admin ni
transfiere («Sin piso de admins», ADR 0023), y quien se desactiva a sí mismo
queda afuera sin poder deshacerlo.

**EQ-41 Desactivar corta el acceso en el acto** — `replicar`
Documentado: «When a user is deactivated, they are instantly logged out of the
workspace across all devices, and their active timer is automatically
stopped.» (la guía); «When you deactivate a user, you temporarily end their
login, access to the application and all their billing actions.» (invitar
personas); «User can no longer log in or track time in the workspace» (tabla de
la guía). Acá, en una transacción: la membresía pasa a `inactive`, se detiene
el timer (EQ-43) y se borran las filas de `session` de la persona; si borró
alguna, `audit_log` guarda `session.revokeAll` con la cantidad y con quien
desactivó como actor. **No las de `account`**, como hacía el procedimiento
SQL: sin ellas la persona no puede volver a entrar aunque se la reactive
(PF-47; EQ-110). Better Auth no guarda la sesión en la cookie (`auth.ts` no
configura caché), así que el próximo pedido de esa persona ya no tiene sesión.
_Corregido el 2026-10-19, E2_: decía «como hace el procedimiento SQL»; el
procedimiento se retira con E2 (EQ-39).

**EQ-42 Qué pasa si una inactiva vuelve a entrar** — `adaptar`
Documentado que en Clockify no entra (la tabla de EQ-41) y que, si era su único
workspace, «…they’ll be logged out and redirected…» (invitar personas). En
Clock hay una decisión anterior, TT-92: una membresía desactivada con la
sesión abierta ve sus horas en solo lectura, con el aviso «Tu acceso al
workspace está desactivado.». Con EQ-41 ya no queda sesión abierta, y la
pregunta es el ingreso siguiente. Decidido el 2026-10-16 (P-05):
**rechazarlo**, con EQ-92, como Clockify. La alternativa —dejarla entrar a ver
sus horas— quedó descartada. TT-92 queda solo para el pedido en vuelo, que leyó
la sesión antes de la desactivación (EQ-104), y para una membresía pasada a
`inactive` por SQL.
La carrera de un ingreso con una desactivación la cierra el contrato de E2
(D-E2-2): el gancho `session.create.before` puede leer la membresía activa, la
desactivación confirmar sin sesiones que borrar y Better Auth insertar la
sesión después. Un gancho `session.create.after` relee la membresía
`for share`, que espera a la desactivación en curso, y si existe y no está
activa borra la sesión, sin lanzar. El pedido siguiente no tiene sesión y va a
`/login`, sin motivo; si la persona vuelve a intentar, recibe EQ-92.
_Corregido el 2026-10-19, E2_: decía que TT-92 «sigue cubriendo el pedido que
llega entre la desactivación y el borrado de la sesión». Desactivar borra las
sesiones en la misma transacción (D-E2-5), así que no hay un pedido entre las
dos: hay uno que leyó la sesión antes del `commit`, que termina con lo que leyó
(EQ-104), y un ingreso que se cruza con la desactivación, que el gancho deja
sin sesión. La decisión P-05 no cambia.

**EQ-43 El timer en curso se detiene** — `replicar`
Documentado: «Also, when a user is deactivated, their current timer is stopped
(if they have one running).» (invitar personas; RP-63) y «If a timer is
running, it will be automatically stopped» (tabla de la guía). Acá: en la
misma transacción que EQ-41, la entrada con `end` nulo de esa persona recibe
como fin el instante de la desactivación y conserva todo lo demás; desde ahí
cuenta en los reportes (RP-30). La escritura queda en `audit_log` con quien
desactivó como actor. Reactivar no lo vuelve a poner en marcha.

**EQ-44 Las horas quedan** — `replicar`
Documentado: «However, all their data is saved, including their activity and
history.» y «The time entries of both inactive and deleted users will remain.»
(invitar personas). Es RP-60 y RP-61: nada se borra, y el reporte las sigue
sumando. Ver la [sección 15](#15-correcciones-para-otros-documentos) por un
cambio en la página que toca RP-61 y RP-62.

**EQ-45 Proyectos, tareas y grupos de una inactiva** — `adaptar`
No documentado. Acá: conserva sus filas en `project_member` —con la marca de
responsable—, en `task_assignee` y en los grupos; nada se limpia y, al
reactivarla, vuelve a tener lo que tenía. Los selectores de personas de esas
pantallas no la ofrecen para altas nuevas. Justificación: es el criterio del
archivado (PR-22): deja de ofrecerse, no desaparece.

**EQ-46 Desactivar pide confirmación** — `adaptar`
_No verificado_: si Clockify confirma; sus pasos terminan en «Select
Deactivate». Acá: un diálogo «¿Desactivar a {nombre}?» que dice qué pasa —«No
va a poder entrar. Si tiene un timer en curso, se detiene. Sus horas quedan.»—
con «Cancelar» y «Desactivar». Justificación: corta las sesiones y el timer de
otra persona, y el timer detenido no vuelve.

**EQ-47 Reactivar** — `replicar`
Documentado: «Select Show all or Show inactive users in the drop down menu»
seguido de «Select Activate» (invitar personas), y «You can reactivate the user
at any time from the Team page» (tabla de la guía). Acá: «Reactivar» en el
menú de la fila de una inactiva, sin confirmación; vuelve `active` con su rol
(EQ-37), sus proyectos y sus grupos (EQ-45). Quién: owner y admin, con la
excepción de EQ-38.
_Desde E2_: una inactiva sin cuenta de Google no se reactiva hasta E2b
(EQ-110, EQ-114).
_Desde E2b_ (D-E2b-5 del [contrato de E2b](../slices/fase2-e2b-sin-cuenta.md)):
reactivar a una persona sin cuenta de Google es reactivarla y pedir la
vinculación (EQ-115), en una transacción, y **pide confirmación**: «¿Reactivar
a {nombre}?», con el texto de la vinculación, y «Cancelar» y «Reactivar»; al
terminar, «Reactivaste a {nombre}. Su cuenta de Google se vincula en su próximo
ingreso.». Quién, como siempre: owner y admin, con la excepción de EQ-38.
Reactivar a quien tiene cuenta sigue sin confirmación, y a una persona con el
correo liberado no se la reactiva (EQ-121). EQ-114 queda sin uso.
Justificación de la confirmación: la próxima cuenta de Google con ese correo
queda atada a la fila, con su rol y sus horas.

**EQ-48 Reactivar no avisa** — `replicar`
Documentado: «Inactive users won't receive an email notification when they are
reactivated.» (la guía). Acá no hay correo de ningún modo (PF-28).

**EQ-49 Desactivar y reactivar en masa** — `fuera de alcance`
Documentado: casillas en la lista, «Click the Deactivate button that appears at
the top of the list» y «The Activate button will not appear if your selection
includes a mix of active and inactive statuses.» (desactivar en masa). Ninguna
página dice en qué plan está. Justificación: la página la justifica con los
asientos y el tope del plan, que Clock no tiene, y las personas se van de a
una. Se agrega después sin tocar el modelo, como todo o nada (ADR 0011).

**EQ-115 Vincular una cuenta de Google** — `adaptar`
Sin equivalente relevado en Clockify, donde la identidad es la cuenta de
CAKE.com (EQ-75) y no una cuenta de Google atada a la fila. Acá, en el menú de
la fila de una persona activa: «Vincular una cuenta de Google» si no tiene
cuenta, «Vincular otra cuenta de Google» si tiene, «Volver a pedir la
vinculación» si la anterior venció, y «Cancelar la vinculación» con una pedida,
sin confirmación. Pedirla confirma: «¿Vincular una cuenta de Google a
{nombre}?» con «En los próximos {días} días, la próxima cuenta de Google que
entre con {correo} va a quedar vinculada a {nombre}, con su rol y sus horas.
Hacelo solo si ese correo sigue siendo suyo.», o, con cuenta, «¿Vincular otra
cuenta de Google a {nombre}?» con el texto que dice que la nueva reemplaza a la
actual y que hasta entonces la actual sigue entrando; con «Cancelar» y
«Vincular». Con un externo sin invitación abierta, la confirmación suma el
registro de EQ-22.
La regla: la piden el owner y los admins; sobre un admin o sobre el owner, solo
el owner (EQ-38, EQ-117), y el owner puede pedir la suya. **Vence a los siete
días**, sin cron, y **vale una vez**: el primer ingreso con ese correo, dentro
del plazo y con una cuenta de Google que no esté vinculada a ninguna fila, la
deja como la única cuenta de la persona, borra sus otras cuentas y sus
sesiones, y limpia la marca. Solo una membresía activa la tiene: a una inactiva
se la reactiva (EQ-47, EQ-118), y desactivar la cancela. Pedirla con una
vigente es éxito sin escribir; con una vencida, la renueva. Mientras está
pedida, la fila dice debajo del correo «Vinculación pedida el {pedido}, vence
el {vencimiento}: falta su primer ingreso con Google.» o, con cuenta, «…: la
próxima cuenta de Google nueva con este correo reemplaza a la actual.»;
vencida, «La vinculación pedida el {pedido} venció el {vencimiento}.». Los
avisos: «Pediste vincular una cuenta de Google a {nombre}.» y «Cancelaste la
vinculación de {nombre}.».
Justificación: con el enlace implícito apagado (PF-47), es la forma de
devolverle la entrada a la persona correcta —las importadas sin cuenta (EQ-110)
o la misma persona con otra cuenta (EQ-109)— sin dársela a cualquiera que
traiga ese correo. Es D-E2b-1, D-E2b-3, D-E2b-6, D-E2b-7 y D-E2b-11 del
[contrato de E2b](../slices/fase2-e2b-sin-cuenta.md), con el
[ADR 0027](../adr/0027-una-fila-user-sin-cuenta-de-google.md); el plazo y la
frontera los decidió el usuario el 2026-10-19.

**EQ-116 Liberar el correo de una persona inactiva** — `adaptar`
Sin equivalente relevado en Clockify, donde el correo lo cambia la persona en
su cuenta de CAKE.com (EQ-75). Acá: «Liberar el correo» en el menú de la fila de
una inactiva, con confirmación: «¿Liberar el correo de {nombre}?», «{correo}
deja de ser de {nombre} y lo vas a poder invitar para otra persona. {nombre}
queda inactiva, con sus horas, y no va a poder volver a entrar ni reactivarse.
No se puede deshacer.», con «Cancelar» y «Liberar el correo»; al terminar,
«Liberaste el correo de {nombre}.». El correo guardado pasa a uno que no es de
nadie (`<id>@liberado.invalid`), se borran sus cuentas de Google y sus
sesiones, y la fila muestra «Correo liberado» en lugar del correo, sin nota.
Quedan el nombre, la membresía inactiva con su rol, las horas, los proyectos y
el audit log, que guarda el correo anterior; el reporte la sigue mostrando por
su nombre (RP-61). La dirección queda libre: invitarla ya no responde EQ-79, y
quien la tenga entra con una fila nueva (EQ-17).
La regla: la misma frontera que EQ-115 (EQ-38, EQ-119); una activa no se libera
(EQ-120); liberar una ya liberada es éxito sin escribir; a una liberada no se la
reactiva ni se le pide una vinculación (EQ-121). No se deshace desde la
pantalla: volver atrás es una corrección a mano con el correo del audit log.
Justificación: es la salida de la dirección reciclada (EQ-109, P-11 de
`perfil.md`), y vincular no sirve ahí porque le daría a la persona nueva las
horas de la anterior. Solo a una inactiva, porque liberarle el correo a una
activa la dejaría afuera; si la empresa le cambia la dirección, sigue siendo
una corrección a mano (PF-48 de `perfil.md`). Es D-E2b-9 del
[contrato de E2b](../slices/fase2-e2b-sin-cuenta.md).

## 6. Quitar del workspace

**EQ-50 Borrar a una persona con horas no existe** — `adaptar`
Documentado en Clockify: «Only Organization owners can delete a user.»,
«Users can only be deleted once they are deactivated.», «A deleted user is
permanently removed from the workspace and the Clockify app…», «However, for
deleted users, their time entries will only be shown under the alias deleted
user…» (invitar personas); «Time entries remain in reports, but you can no
longer filter data by that specific user's name» y «To bring the user back,
you must send a completely new invitation» (tabla de la guía). La API marca su
`DELETE /users/{userId}` como «This endpoint is not functional and has been
deprecated.» y remite a CAKE.com.
Acá: a una persona con horas no se la quita; desactivarla es la salida.
Justificación: es P-09 de `reportes.md` (RP-65, ADR 0020), y la base lo
impide. El alias «deleted user» cambiaría el nombre de los totales del pasado.

**EQ-51 Quitar a una persona sin horas** — `adaptar`
El ADR 0020 deja abierta una sola puerta: «borrar una membresía queda para quien
no tiene horas, como una invitación». Decidido el 2026-10-16 (P-08): «Quitar del
equipo», solo para
el owner —como «Only Organization owners can delete a user.»—, solo sobre una
inactiva —como «Users can only be deleted once they are deactivated.»— y solo
si no tiene entradas. Borra la membresía y, por sus claves en `cascade`, sus
filas de `project_member` y `task_assignee`; no borra `user` ni `account`, así
que volver pide una invitación nueva (EQ-29). Con horas responde EQ-87.
Justificación: sirve para quien entró por error, típicamente por la deuda de
EQ-31. Sirve porque entra EQ-29 (P-02): sin él, el próximo ingreso recrearía
la membresía.

**EQ-52 Irse del workspace por cuenta propia** — `fuera de alcance`
Documentado: se hace en CAKE.com, con «Choose Manage workspaces» (perfiles).
Justificación: hay un solo workspace; irse es pedir que te desactiven.

**EQ-53 El owner que se va borra el workspace** — `fuera de alcance`
Documentado: «If the Owner leaves the workspace, the entire workspace is
deleted» (admins). Justificación: EQ-52 no existe, y borrar el workspace es
`workspace.delete`, de la especificación del workspace.

**EQ-54 Los datos de tiempo libre de una persona borrada** — `fuera de alcance`
Documentado: «…the time off data of deleted users is permanently lost…»
(invitar personas). Justificación: Clock no tiene tiempo libre.

## 7. Transferir la propiedad

**EQ-55 Solo el owner transfiere** — `replicar`
Documentado: «Transfer owner role» / «Yes (Owner only)» (admins); «Assign
(transfer) owner role» / «No» (regular users); «To make someone an owner,
current owner needs to:» con «Click on the three dots next to the user's
name» y «Click Transfer ownership» (invitar personas). La guía lo hace en
CAKE.com: «Go to the Members page» y «Choose Transfer ownership». Acá:
«Transferir la propiedad» en el menú de la fila, solo para el owner; es
`workspace.transfer`, que ya existe con `["owner"]`. Va en la pantalla porque
Clock no tiene un portal de cuenta aparte.

**EQ-56 A quién se transfiere** — `adaptar`
No documentado si hay condiciones. Acá: a una membresía activa que no es la
propia, sea `member` o `admin`. A una inactiva o invitada responde EQ-86.
Justificación: una inactiva no puede ejercer el rol, y una invitada todavía no
tiene cuenta.

**EQ-57 El owner anterior queda administrador** — `replicar`
Documentado: «The former Owner is automatically downgraded to an Admin.» (la
guía). Acá, en una transacción con las dos membresías bloqueadas, como D-R8-7:
`workspace.owner_id` pasa a la persona nueva, su membresía a `owner`, la del
anterior a `admin`, y una fila de `audit_log`. Si la nueva tenía por SQL
`project_manager` o `team_manager`, queda `owner` igual.

**EQ-58 Transferir pide confirmación** — `replicar`
Documentado: «Caution: To avoid accidentally transferring ownership to the
wrong person» (la guía). Acá: un diálogo que nombra a la persona con su correo
y dice qué cambia —«Vas a pasar a ser administrador. Desde ese momento, solo
{nombre} quita el rol de administrador y transfiere la propiedad.»— con
«Cancelar» y «Transferir».
_No verificado_: la forma del diálogo de Clockify.

**EQ-59 Después de transferir** — `adaptar`
La pantalla de quien transfirió se vuelve a dibujar como la de un admin: pierde
«Quitar administrador» y «Transferir la propiedad». La de la persona nueva
cambia en su próxima carga completa o en la próxima action que revalide, como
en R8 (D-R8-8). Justificación: el servidor no guarda estado para empujar el
cambio. `WORKSPACE_OWNER_EMAIL` deja de nombrar al owner (EQ-30).

## 8. Grupos

**EQ-60 Grupos de personas** — `replicar` (P-10 verifica el plan)
Documentado: «Groups make managing people on projects easier.» y la pestaña de
EQ-01 (grupos). **Plan _no verificado_**: la página de grupos no tiene nota de
plan («paid» y «plan» aparecen solo en enlaces), la lista de funciones pagas no
los nombra como función —«group» aparece solo en «You can add time either for a
single user, or for a whole group at once.», de «Add time for others», Basic— y
el comparador de precios los nombra solo en SCIM, Enterprise. Ningún indicio los
hace pagos, pero no lo pude confirmar. Ya estaba decidido que entran en la fase
2 (PR-20, P-25 de `proyectos.md`); si P-10 muestra que no están en el plan Free,
la sección entera pasa a ser diseño propio sin referencia.

**EQ-61 Crear, renombrar y borrar un grupo** — `replicar`
Documentado: «Enter the group’s name in the Add new group field» (grupos);
renombrar y borrar existen («You can create, edit, and delete groups…») pero no
tienen pasos documentados. Acá: en «Grupos», un campo «Nuevo grupo» con
«Agregar», y renombrar y borrar desde el menú de la fila.

**EQ-62 El nombre del grupo** — `adaptar`
La API (indicio) tiene `UserGroupRequest.name` con `"maxLength": 100`. Acá:
obligatorio, hasta 100 caracteres, recortado y único por workspace sin
distinguir mayúsculas, con las reglas de PR-49 y PR-54 y los mensajes de EQ-89.
Justificación: la unicidad no está documentada; es la decisión de proyectos
(P-19 de `proyectos.md`) por coherencia.

**EQ-63 Agregar y quitar personas de un grupo** — `replicar`
Documentado: «Click + Access under Access column next to the group’s name»,
«Click + Group» (desde la fila de la persona), «If you’d like to manage all user
groups at once, click on the group you’d like to modify and check the Select
all option.» y «Remove a user from a group the same way as you added them.»
(grupos). Acá, los dos caminos: desde el grupo, una lista de casillas con las
personas activas; desde la persona, una con los grupos. Una invitada no se
agrega —no tiene cuenta— y una inactiva se ve pero no se agrega (EQ-45).
_No verificado_: si se puede crear un grupo escribiendo su nombre desde la fila
de la persona; acá no.

**EQ-64 Un grupo da acceso a un proyecto** — `replicar`
Documentado: «Once you assign a group, everyone that belongs to that group will
immediately have access to the project.» (grupos). La pestaña de acceso del
proyecto es de `proyectos.md` (PR-18, PR-20). Lo que este documento fija es la
regla: se ve y se elige un proyecto privado siendo miembro directo **o de un
grupo con acceso**, así que el `ProjectResource` de `can()` tiene que llevar la
pertenencia por grupo. Con todos los proyectos públicos (PR-17) no cambia nada
visible hasta que haya privados.

**EQ-65 Un grupo como asignado de una tarea** — `replicar`
Es PR-37 («el asignado se elige entre personas, grupos o "Anyone"»). Entra con
la regla de asignados de la fase 2, de `proyectos.md`.

**EQ-66 Grupos en los reportes** — `replicar`, fase 3
_No verificado_: filtrar y agrupar los reportes por grupo («group them by
Group» NOT FOUND). Entra con el resto de los filtros de la fase 3 (RP-25).

**EQ-67 Borrar un grupo** — `adaptar`
No documentado qué pasa con los accesos. Acá: se borran el grupo, sus
pertenencias, sus accesos a proyectos y sus asignaciones de tareas; cada
persona pierde lo que le daba el grupo y conserva lo directo, y ninguna entrada
se toca (PR-71). La confirmación dice a cuántos proyectos daba acceso.
Justificación: es lo que significa que el acceso venga del grupo.

**EQ-68 Quién administra los grupos** — `replicar`
Documentado: «Manage groups» / «Yes» (admins), «Manage groups» / «No» (regular
users) y «…managing groups, inviting users, setting user statuses…» (admins).
Acá: owner y admin. Si es `team.manage` o una acción propia lo decide
`architect`.

**EQ-69 El responsable de equipo de un grupo** — `fuera de alcance`
Documentado: «…assigning Team managers directly to individual users or entire
groups.» (invitar personas). Justificación: el rol es pago (EQ-34).

## 9. El perfil de una persona, desde el equipo

**EQ-70 Editar el perfil de otra persona** — `replicar`
Documentado: «Owners and Admins can edit users’ profile.» y «Make the changes
(week start*, capacity, working days, entering user’s ID or setting the type of
employment to part-time)» (perfiles); y «…in the Edit profile window, you can
also edit that same data directly in the table» (invitar personas). Acá entra
solo el primer día de la semana (EQ-71), editado en su celda de la tabla, sin
ventana aparte. Justificación de no tener ventana: es un solo dato.

**EQ-71 El primer día de la semana** — `replicar`
Ya relevado y decidido: PF-01, PF-16, PF-17, PF-18, de la fase 2. Se suma:
«Week start set up on the Team page overrides the default one in the Workspace
settings.» (perfiles), es decir, hay un valor del workspace por omisión, que
es de la especificación del workspace: WS-08, que entra solo para las personas
nuevas (workspace P-02). «Week start* cannot be changed if there
are pending approvals» no aplica: no hay aprobaciones. Acá: owner y admin,
también sobre otro admin (EQ-38); solo sobre una persona activa, como el rol en
R8; el valor inválido responde «Ese día no existe.» (PF-35).

**EQ-72 Capacidad diaria y días laborables** — `fuera de alcance`
Documentado: «Daily capacity and working days can be edited regardless of the
number of workspaces that the user has.» (perfiles). Plan _no verificado_:
«capacity» NOT FOUND en la lista de funciones pagas. PF-19 los mandó a la
pantalla de equipo de la fase 2, y `membership.weekly_capacity_minutes` existía
sin uso (semanal; la de Clockify es diaria). Decidido el 2026-10-16 (P-09, y
workspace P-06 para el valor del workspace): quedan fuera hasta que exista algo
que los use, y la columna se borró en WS0. Justificación: nada en Clock la
consume —los objetivos, la planificación y los recordatorios no existen—, y un
dato guardado sin efecto invita a creer que tiene uno, el mismo criterio del
ADR 0020 con `who_sees_all_entries`.
_Corregido el 2026-10-20, WS0_: decía que la columna «existe sin uso» y que
«sigue sin uso». La decisión 1 del §7 del
[mapa de la fase 2](../slices/fase2-mapa.md) la sumó a WS0, que la borró con la
migración `0018` ([contrato de WS0](../slices/fase2-ws0-columnas.md)). Si la
capacidad entra, la columna vuelve con su consumidor.

**EQ-73 Identificador, tipo de empleo y campos de usuario** —
`fuera de alcance`
Documentado: «If you have custom user fields (e.g. employee ID, department),
you can edit these directly in the profile» (perfiles); los campos de usuario
son de Pro (tabla del plan Free). Justificación: pagos.

**EQ-74 Tarifas por persona** — `fuera de alcance`
La API tiene `hourly-rate` y `cost-rate` por persona; las tarifas son pagas
(tabla del plan Free). Justificación: pagas (P-32 de `proyectos.md`).

**EQ-75 Correo, foto y nombre no los cambia un admin** — `replicar`
Documentado: «Workspace owners and admins can’t change user’s email, profile
picture and username.» (invitar personas) y «Users can only edit their email,
profile picture and username themselves on their CAKE.com Account page»
(perfiles). Acá el nombre lo edita la persona (PF-07) y la foto y el correo
vienen de Google (PF-06, PF-09).

## 10. Validaciones y mensajes

Los mensajes son nuestros. Se reusan los que ya existen, por la regla de una
redacción por causa de `time-tracker.md`.

| ID     | Regla                                              | Mensaje                                                                                                 | Marca              |
| ------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------ |
| EQ-76  | Correo con forma inválida                          | «{correo} no es un correo válido.»                                                                      | `adaptar`          |
| EQ-77  | Invitar sin ningún correo                          | «Escribí al menos un correo.»                                                                           | `adaptar`          |
| EQ-78  | Más de 50 correos en un pedido                     | «Se pueden invitar hasta 50 correos por vez.»                                                           | `adaptar`          |
| EQ-79  | Correo de una persona inactiva (EQ-21)             | «{correo} está desactivada: reactivala desde la lista.»                                                 | `adaptar`          |
| EQ-80  | Correo de otro dominio: sin uso, P-03 los admite   | —                                                                                                       | `fuera de alcance` |
| EQ-81  | Revocar una invitación que ya se usó               | «Esa invitación ya no está pendiente.»                                                                  | `adaptar`          |
| EQ-82  | La persona ya no está                              | «Esa persona ya no está en el equipo.» (R8)                                                             | `replicar`         |
| EQ-83  | Desactivar al owner                                | «El propietario no se desactiva.»                                                                       | `adaptar`          |
| EQ-84  | Desactivarse a sí mismo                            | «No podés desactivar tu propia membresía.»                                                              | `adaptar`          |
| EQ-85  | Un admin desactiva o reactiva a otro admin (EQ-38) | «Solo el propietario desactiva o reactiva a un administrador.»                                          | `replicar`         |
| EQ-86  | Transferir a una inactiva o invitada               | «Esa persona ya no está activa en el workspace.» (R8)                                                   | `adaptar`          |
| EQ-87  | Quitar a una persona con horas                     | «{nombre} tiene horas cargadas: no se puede quitar, solo desactivar.»                                   | `adaptar`          |
| EQ-88  | Quitar a una persona activa                        | «Desactivá a {nombre} antes de quitarla.»                                                               | `replicar`         |
| EQ-89  | Nombre de grupo vacío, largo o repetido            | PR-75, PR-76 y «Ya hay un grupo con ese nombre.»                                                        | `adaptar`          |
| EQ-90  | Sin permiso                                        | «No tenés permiso para hacer esto.» (TT-79)                                                             | `replicar`         |
| EQ-91  | Ingreso sin invitación (EQ-29)                     | «Tu cuenta no tiene una invitación a Clock. Pedísela a quien administra el equipo.»                     | `adaptar`          |
| EQ-92  | Ingreso de una inactiva (EQ-42)                    | «Tu acceso al workspace está desactivado. Pedile a quien administra el equipo que te vuelva a activar.» | `adaptar`          |
| EQ-114 | Reactivar sin cuenta de Google: sin uso desde E2b  | —                                                                                                       | `fuera de alcance` |
| EQ-117 | Un admin vincula a un admin o al owner (EQ-115)    | «Solo el propietario vincula la cuenta de Google de un administrador o del propietario.»                | `adaptar`          |
| EQ-118 | Vincular a una persona inactiva (EQ-115)           | «Esa persona está desactivada: reactivala para vincular su cuenta.»                                     | `adaptar`          |
| EQ-119 | Un admin libera el correo de un admin o del owner  | «Solo el propietario libera el correo de un administrador o del propietario.»                           | `adaptar`          |
| EQ-120 | Liberar el correo de una persona activa (EQ-116)   | «Desactivá a esa persona antes de liberar su correo.»                                                   | `adaptar`          |
| EQ-121 | Reactivar o vincular con el correo liberado        | «El correo de esa persona se liberó: no se puede reactivar ni vincular.»                                | `adaptar`          |
| EQ-122 | Cuenta de Google nueva, correo en uso (PF-47)      | «Ya hay una persona en Clock con ese correo. Pedile a quien administra el equipo que revise tu acceso.» | `adaptar`          |

- **Idempotencia**: desactivar a una inactiva o reactivar a una activa responde
  éxito sin escribir, como pedir el rol que ya tiene en R8 (D-R8-7).
- **EQ-81**: revocar una invitación ya revocada responde éxito sin escribir, como
  el reintento de una revocación cuya respuesta se perdió (EQ-97; D-E1a-8 del
  contrato de E1a). _Corregido el 2026-10-16, decisión del usuario_: la regla
  decía «que ya se usó o se revocó».
- **EQ-80** era el rechazo de un correo de otro dominio si P-03 cerraba esa
  puerta. P-03 la abrió el 2026-10-16 (EQ-22): el identificador se conserva y
  no tiene mensaje.
- **EQ-82, EQ-86**: los textos son los de `teamMessages`, de R8.
- **EQ-88** replica «Users can only be deleted once they are deactivated.»;
  **EQ-85**, la lectura de EQ-38.
- **EQ-90**: R8 tiene además «No tenés permiso para cambiar roles.» para su
  acción; cada acción nueva usa TT-79, salvo que su contrato diga otra cosa.
- **EQ-91 y EQ-92** se muestran en `/login`, donde hoy se muestran los motivos
  de `accessDenialMessage`.
- **EQ-114**, agregado el 2026-10-19 con E2 (D-E2-7 del
  [contrato de E2](../slices/fase2-e2-desactivar.md)): la fila de una inactiva
  sin cuenta no tiene «Reactivar» y muestra «Sin cuenta de Google vinculada.»
  debajo del correo; el mensaje es el de un pedido armado, que no escribe. Sin
  equivalente relevado en Clockify. Justificación: con el enlace implícito
  apagado (PF-47), reactivarla dejaría una fila activa que no puede entrar; lo
  levanta E2b (EQ-110).
  _Sin uso desde E2b_ (D-E2b-5 del
  [contrato de E2b](../slices/fase2-e2b-sin-cuenta.md)), como EQ-80: decía
  «Esa persona no tiene una cuenta de Google vinculada: todavía no se puede
  reactivar.», con la marca `adaptar`. Quien puede reactivar puede vincular, así
  que reactivar a una persona sin cuenta pide la vinculación (EQ-47, EQ-115) y
  no hay quién reciba el rechazo. El identificador se conserva; el texto salió
  de `teamMessages` y su código, de los de error. Justificación del
  `fuera de alcance`: el caso dejó de existir.
- **EQ-117 … EQ-122**, agregados el 2026-10-20 con E2b (§4.1 y §4.6 del
  [contrato de E2b](../slices/fase2-e2b-sin-cuenta.md)), sin equivalente
  relevado en Clockify, que no tiene este ingreso. EQ-117 … EQ-121 son textos de
  `teamMessages`; EQ-117 y EQ-119 son la lectura de EQ-38 para vincular y para
  liberar, como EQ-85 para desactivar. **EQ-122** lo muestra `/login` para el
  `account_not_linked` de Better Auth —una cuenta de Google nueva con el correo
  de una fila que tiene otra cuenta, o ninguna, y sin vinculación vigente—, que
  no es un motivo de la regla de ingreso (`callbackErrorMessage` de
  `src/server/access.ts`). Es neutro porque el mismo código llega por la misma
  persona con otra cuenta, que se vincula, y por otra persona con una dirección
  reciclada, que se invita después de liberar el correo: quien administra
  pregunta y decide (EQ-109). Remite a quien administra, como EQ-91 y EQ-92,
  porque los admins también vinculan y liberan. Con la fila inactiva, el
  ingreso responde antes EQ-92. Un error al usar la vinculación vuelve a
  `/login` con el genérico «No se pudo iniciar sesión. Volvé a intentar.», sin
  escribir (D-E2b-3).

## 11. Estados vacíos

**EQ-93 Solo está el owner** — `adaptar`
La lista muestra su fila y, debajo, «Todavía no invitaste a nadie.» con
«Invitar». Justificación: copia propia.

**EQ-94 Un filtro sin resultados** — `adaptar`
«No hay personas inactivas.», «No hay invitaciones pendientes.» y, con la
búsqueda, «Nadie coincide con «{texto}».». Justificación: como PR-89, distingue
«no hay nadie» de «no hay nadie acá».

**EQ-95 Sin grupos** — `adaptar`
«Todavía no hay grupos.» con el campo de EQ-61 arriba. Justificación: copia
propia.

**EQ-96 Un grupo sin personas** — `adaptar`
La fila del grupo dice «Sin personas» en lugar de la lista. Justificación:
copia propia.

## 12. Estados de error

**EQ-97 Falla de red al guardar** — `adaptar`
Como TT-89 y PR-90: el aviso con «Reintentar», solo por esta causa. Reintentar
una invitación no la duplica (EQ-19), y desactivar o reactivar dos veces no
escribe dos veces (sección 10). Justificación: la de TT-89.

**EQ-98 Dos personas actúan sobre la misma fila** — `adaptar`
La mutación relee la membresía de quien actúa y la de la fila bajo bloqueo,
como D-R8-7, y decide con lo leído: desactivar a quien otro admin ya desactivó
es éxito sin escribir; transferir a quien otro acaba de desactivar responde
EQ-86; un admin que perdió el rol mientras tanto recibe EQ-90. Justificación:
el `Actor` de la sesión se armó en otra transacción.
_Aclarado el 2026-10-19, revisión de paridad de E2_: la action responde EQ-90,
pero la revalidación corre también con error (`handle`), y la página vuelve a
dibujarse sin `team.manage`: lo que se ve es EQ-02, no el aviso de la fila. La
base no cambia. Es el mismo mecanismo que en R8.

**EQ-99 La lista no carga** — `replicar`
«No se pudo cargar el equipo.», de R8, nunca una tabla vacía.

## 13. Al recargar

**EQ-100 Filtro, búsqueda y pestaña viven en la URL** — `adaptar`
Como dice el [ADR 0008](../adr/0008-la-ventana-de-la-lista-vive-en-la-url.md)
de la ventana de una lista: recargar o compartir el enlace muestra lo mismo.
Justificación: el servidor no guarda estado.
_No verificado_: qué conserva Clockify al recargar.

**EQ-101 Qué se revalida después de una mutación** — `adaptar`
`/equipo` siempre; el layout cuando cambia lo que la navegación muestra (un
rol, una transferencia); y lo que lee el catálogo de personas de los reportes
(`listWorkspacePeople`) cuando cambia un estado. La fila que cambió se queda
hasta recargar (EQ-11). Justificación: es el mecanismo de Next que ya usan las
demás pantallas.

## 14. Casos borde

| ID     | Caso                                                                                            | Comportamiento esperado                                                                                                                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EQ-102 | Desactivar a quien tiene un timer corriendo desde ayer                                          | Se detiene en el instante de la desactivación, como cualquier entrada detenida (EQ-43); si cruza la medianoche, vale lo que el rastreador ya hace con esa entrada.                                                   |
| EQ-103 | Desactivar a la única responsable de un proyecto                                                | Conserva la marca (EQ-45); el proyecto lo administran owner y admin (PR-55) hasta que se nombre otro responsable.                                                                                                    |
| EQ-104 | La persona tiene un pedido en vuelo cuando la desactivan                                        | El pedido que leyó la sesión antes termina con lo que leyó; abrir un timer espera a la desactivación y responde TT-79 (D-E2-6). El pedido siguiente ya no tiene sesión (EQ-41).                                      |
| EQ-105 | El mismo correo con mayúsculas o espacios                                                       | Se recorta y se pasa a minúsculas, como `access.ts`; dos variantes son el mismo correo (EQ-19).                                                                                                                      |
| EQ-106 | Dos admins invitan el mismo correo a la vez                                                     | Una sola invitación por workspace y correo, con su índice único; el segundo pedido la cuenta como hecha (EQ-19).                                                                                                     |
| EQ-107 | La invitada entra en el mismo instante en que la revocan                                        | El ingreso lee la invitación bajo bloqueo; gana la transacción que llega primero, y si gana el ingreso, la persona queda activa y se la desactiva (EQ-39).                                                           |
| EQ-108 | Invitar el correo de una persona quitada (EQ-51) que vuelve con la misma cuenta de Google       | La invitación crea la membresía nueva al entrar; su `user` y su `account` siguen ahí.                                                                                                                                |
| EQ-109 | La misma dirección con otra cuenta de Google                                                    | No entra (PF-47). Si es la misma persona, se pide una vinculación (EQ-115); si la dirección pasó a otra persona, se libera el correo de la inactiva (EQ-116) y se lo invita. Lo decide quien administra (EQ-122).    |
| EQ-110 | Reactivar a alguien desactivado con el procedimiento SQL del núcleo                             | Ese procedimiento borró su `account` (PF-47). Desde E2b, quien puede reactivarla la reactiva y, a la vez, pide la vinculación, con confirmación (D-E2b-5); su próximo ingreso con Google deja esa cuenta en la fila. |
| EQ-111 | Se saca un dominio de `GOOGLE_WORKSPACE_DOMAINS`                                                | Deja de entrar quien entró sin invitación (antes de E1b); quien tiene una `accepted` sigue entrando, como externa, y se la corta desactivándola (EQ-39). Decidido el 2026-10-16 (P-11).                              |
| EQ-112 | El owner pide transferirse a sí mismo con un pedido armado                                      | Éxito sin escribir; su fila no tiene el control.                                                                                                                                                                     |
| EQ-113 | La membresía de `WORKSPACE_OWNER_EMAIL` se quita después de una transferencia y vuelve a entrar | Con EQ-30 entra como cualquiera, por invitación y como `member`; nunca crea un segundo owner.                                                                                                                        |

**EQ-102 … EQ-113** — `adaptar`: ninguno está documentado en Clockify; son
consecuencias de las reglas de arriba con el login y el esquema de Clock.

**EQ-104** — _Corregido el 2026-10-19, E2 (D-E2-6 del
[contrato de E2](../slices/fase2-e2-desactivar.md))_: decía «`can()` lo rechaza
por estado y TT-92 cubre la pantalla». `can()` decide con el `Actor` que el
pedido armó al leer la sesión. Si leyó la membresía activa, una entrada
cerrada, la planilla o una edición confirman aunque la desactivación confirme
antes, y dejan lo que la persona mandó antes de que la desactivaran, como si
hubiera llegado un instante antes; si la leyó ya inactiva, `can()` corta y la
pantalla queda en TT-92. Abrir un timer es la excepción, porque dejaría un
timer que nadie detiene: relee la membresía propia `for share` antes de tocar
`time_entry`. Si la desactivación la tomó primero, espera, lee `inactive` y
responde TT-79 sin escribir; si la lectura llegó primero, la desactivación
espera y detiene el timer recién abierto (EQ-43).

**EQ-109** — _Corregido el 2026-10-20, E2b (D-E2b-6, D-E2b-9 y D-E2b-10 del
[contrato de E2b](../slices/fase2-e2b-sin-cuenta.md))_: decía «No entra
(PF-47); la pantalla de equipo no lo resuelve. Es P-11 de `perfil.md`, que
sigue abierto.». La cuenta nueva no entra porque Better Auth no la enlaza a la
fila (PF-47), y esa misma respuesta llega por dos causas con salidas opuestas.
La misma persona con otra cuenta se resuelve con una vinculación (EQ-115): la
próxima cuenta nueva con ese correo reemplaza a la actual, y hasta entonces la
actual sigue entrando. Otra persona con una dirección reciclada se resuelve
liberando el correo de la anterior (EQ-116) e invitándolo, con una fila nueva:
vincular le daría las horas de la anterior. Por eso el texto que ve quien
entra, EQ-122, no sugiere ninguna de las dos: quien administra pregunta y
decide. Si la fila de ese correo está inactiva, el ingreso responde antes EQ-92
(D-E2-1); si la persona anterior sigue activa, primero se la desactiva
(EQ-120).

**EQ-110** — _Corregido el 2026-10-19, E2 (D-E2-7)_: decía «Hace falta una
corrección a mano o que `architect` defina la salida». El contrato de E2 impide
reactivar sin cuenta hasta E2b: dejaría una fila activa que no puede entrar y
que el reporte y los selectores tratan como activa. Están en este caso las tres
inactivas que la importación de Clockify creó en producción sin cuenta, y quien
se desactive con el procedimiento antes de que E2 llegue a producción (EQ-39).
Tampoco tienen salida por EQ-21: invitar su correo responde EQ-79. Quien se
desactiva desde la pantalla conserva `account` (EQ-41) y se reactiva sin este
problema.
_Corregido el 2026-10-20, E2b (D-E2b-5 del
[contrato de E2b](../slices/fase2-e2b-sin-cuenta.md))_: la tabla decía «la fila
no ofrece «Reactivar», muestra «Sin cuenta de Google vinculada.» y un pedido
armado responde EQ-114. Lo resuelve E2b (D-E2-7).». Desde E2b la fila de una
inactiva sin cuenta ofrece «Reactivar» —con confirmación, que pide la
vinculación (EQ-47, EQ-115)— y «Liberar el correo» (EQ-116), y sigue mostrando
«Sin cuenta de Google vinculada.» debajo del correo hasta que se la reactive.
Un admin ve esas entradas en la fila de un member; en la de un admin, solo el
owner (EQ-38). Es la salida de las tres importadas, antes de reactivar a
cualquiera de ellas. EQ-114 queda sin uso.

**EQ-111** — `adaptar`, decidido por el usuario el 2026-10-16 (P-11): la opción
(a) de la §11 del [contrato de E1b](../slices/fase2-e1b-ingreso.md), D-E1b-13.
No tiene equivalente relevado en Clockify, que no limita el ingreso por dominio
en las páginas relevadas (sección 3). _Corregido el 2026-10-16, decisión del
usuario_: decía que todas sus personas dejaban de entrar. Con E1b, un correo
fuera de los dominios es externo, y un externo entra solo con su invitación
(ADR 0024, decisión 3). Quien entró sin invitación —por la deuda, antes de E1b
(EQ-31)— no tiene ninguna y deja de entrar, con EQ-91. Quien entró por
invitación conserva su fila `accepted`, sigue entrando y su fila pasa a llevar
la marca «Externa», que se deriva del dominio (EQ-22); para cortarle la entrada
se la desactiva (EQ-39, slice E2). En los dos casos la lista la sigue mostrando
activa hasta que alguien la desactiva. Justificación: sacar un dominio es raro,
y la alternativa —que deje de entrar salvo que se la vuelva a invitar como
externa— pedía guardar por qué vía fue cada invitación, con una columna, un
script de relleno, dos migraciones y un ADR. El costo: quien administra tiene
que acordarse de desactivar a cada una.

## 15. Correcciones para otros documentos

No toqué otros documentos; esto es para quien los mantiene.

_Aplicadas el 2026-10-16_: RP-61, RP-62, RP-65 y la decisión P-08 en
`reportes.md`, y el procedimiento de la §5 y la deuda de la §6 del
[mapa del núcleo](../slices/nucleo-reportes-mapa.md), cada una con su
corrección fechada. RP-62 pasó a `replicar`; la regla de RP-61 no cambió.

_Aplicadas el 2026-10-19, con E2_: RP-60 y RP-63 en `reportes.md`, TT-92 en
`time-tracker.md` y el retiro del procedimiento en la §5 del mapa del núcleo
(D-E2-12), cada una con su nota fechada.

_Aplicadas el 2026-10-20, con E2b_: PF-47, PF-48 y P-11 en `perfil.md`, y en el
[mapa de la fase 2](../slices/fase2-mapa.md) la fila del ADR 0027 y la cuenta de
las inactivas importadas, tres y no seis, cada una con su nota fechada.

- **RP-61 y RP-62 (`reportes.md`)**: RP-61 cita «…but you won’t be able to filter
  reports by them.». El 2026-10-16, en la página de invitar personas, «won’t be
  able to filter» dio NOT FOUND, y la página dice ahora «You can still filter
  reports by inactive users using their name.»; la tabla de la guía dice «All
  time entries remain in reports can still be filtered by that user». **RP-62
  dejaría de ser una divergencia y pasaría a paridad.** La misma guía dice
  además «All past time entries, descriptions, and tags remain in the system,
  but these won't appear in reports by default.» y «You would need to use the
  Inactive filter to see their data.», que contradice a su propia tabla y a
  RP-61 («cuentan en los totales»). No propongo cambiar RP-61, que es la regla
  que protege los totales del pasado; va a P-10 para mirarlo.
- **RP-65**: la contradicción que registra se resuelve en la página actual: las
  entradas de una persona borrada quedan bajo el alias «deleted user» (EQ-50).
  No cambia la decisión P-09 de `reportes.md`.
- **Mapa del núcleo, §5**: el procedimiento SQL de desactivar borra `account`.
  Ver EQ-110: deja a la persona sin poder volver.

## 16. Qué es de la fase 2

**Entra**. Las preguntas que lo condicionaban (P-01 a P-09) se decidieron el
2026-10-16; solo los grupos esperan la verificación del plan (P-10):

- La lista: EQ-01 … EQ-08, EQ-11.
- Invitar: EQ-12 … EQ-14, EQ-16 … EQ-26.
- El ingreso: EQ-29 … EQ-33.
- Roles: EQ-34, EQ-35 (hecho), EQ-37, EQ-38.
- Desactivar y reactivar: EQ-39 … EQ-48. Con esto entran RP-60 y RP-63, que
  `reportes.md` dejó para la fase 2. Con E2b, EQ-115 y EQ-116.
- Quitar: EQ-50 como regla y EQ-51.
- Transferir: EQ-55 … EQ-59 (`workspace.transfer`, que R8 dejó para la fase 2).
- Grupos: EQ-60 … EQ-65, EQ-67, EQ-68 (según P-10 para el plan).
- Perfil desde el equipo: EQ-70, EQ-71, EQ-75.
- Validaciones, vacíos, errores, recarga y bordes: EQ-76 … EQ-79,
  EQ-81 … EQ-113 y EQ-117 … EQ-122.

**Fase 3**: EQ-66.

**Fuera de alcance**: EQ-09, EQ-10, EQ-15, EQ-27, EQ-28, EQ-36, EQ-49, EQ-52,
EQ-53, EQ-54, EQ-69, EQ-72, EQ-73, EQ-74; EQ-80, sin uso desde P-03, y EQ-114,
sin uso desde E2b.

_Actualizado el 2026-10-20, E2b_: suma EQ-115 … EQ-122 y pasa EQ-114 de
«Validaciones» a fuera de alcance.

## 17. Orden de slices (sugerencia, no decisión)

1. **E1 — Entrar por invitación.** Invitar uno o varios correos, revocar, las
   invitadas en la lista y el ingreso que exige invitación (EQ-12 … EQ-33). Va
   primero porque cierra la deuda de seguridad, y porque desde ese momento
   quitar a alguien (EQ-51) tiene sentido.
2. **E2 — Desactivar y reactivar.** EQ-38 … EQ-48, el filtro de estado y el
   tachado (EQ-05, EQ-06, EQ-11). Reemplaza el procedimiento SQL; resuelve antes
   EQ-110.
3. **E3 — Transferir la propiedad**, con el ajuste de `WORKSPACE_OWNER_EMAIL`
   (EQ-30, EQ-55 … EQ-59). Chico y aislado.
4. **E4 — El primer día de la semana desde el equipo, la búsqueda y el filtro
   por rol** (EQ-07, EQ-08, EQ-71). Sin riesgo; puede ir en cualquier momento.
5. **E5 — Grupos** (EQ-60 … EQ-68), después de verificar el plan (P-10). Su
   efecto sobre los proyectos (EQ-64, EQ-65) se junta con los slices de
   proyectos privados y asignados de la fase 2, de `proyectos.md`.
6. **E6 — Quitar a una persona sin horas** (EQ-51, que entra por P-08).

## 18. Pendientes de definición del equipo

### Decididos el 2026-10-16

El usuario respondió todas con la recomendación. Se dejan con su identificador
porque el cuerpo del documento y los contratos de slice los citan.

| ID   | Decisión                                                                                                                                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P-01 | **Un member no ve `/equipo`** (EQ-02), porque no tiene ninguna acción ahí. Sigue RP-70: la ven owner y admin activos. En Clockify la ve, salvo que se la escondan, que es pago.                                                                              |
| P-02 | **Todos entran por invitación, también los del dominio de la empresa** (EQ-29). Cierra la deuda de `ensureWorkspaceContext` y replica Clockify; la regla de dominio se conserva y se suma (EQ-24, EQ-91).                                                    |
| P-03 | **Los correos de otro dominio se invitan desde la pantalla, y lo hacen el owner y los admins**, como en Clockify, con la marca «Externa» en la fila (EQ-22). La lista de externos pasa de `EXTERNAL_INVITE_EMAILS` a la base (EQ-32), y EQ-80 queda sin uso. |
| P-04 | **Clock no manda el correo de invitación** (EQ-26): muestra un texto para avisar a mano, con «Copiar», y no hay «Reenviar». Las variables de Resend siguen sin uso.                                                                                          |
| P-05 | **Una persona inactiva no puede entrar, como en Clockify** (EQ-42): el ingreso se rechaza con EQ-92. TT-92 cubre solo el pedido en vuelo, que leyó la sesión antes de la desactivación (EQ-104).                                                             |
| P-06 | **Desactivar conserva el rol**, y reactivar devuelve el mismo (EQ-37). Mientras la persona está inactiva, el rol no se cambia.                                                                                                                               |
| P-07 | **Solo el owner desactiva o reactiva a un admin** (EQ-38, EQ-85), con una acción propia, como dejó dicho el ADR 0023. Sigue la página de acción en masa: «Admins cannot manage owners or other admins».                                                      |
| P-08 | **Entra «Quitar del equipo» para quien no tiene horas, solo para el owner** (EQ-51), sobre una inactiva sin entradas. Sirve porque P-02 hace que volver pida una invitación nueva.                                                                           |
| P-09 | **Capacidad y días laborables, fuera de alcance** hasta que exista algo que los use (EQ-72); la columna `weekly_capacity_minutes` queda sin uso. Corrige PF-19, que los mandaba a esta pantalla. Es la misma respuesta que workspace P-06.                   |
| P-11 | **Al sacar un dominio de `GOOGLE_WORKSPACE_DOMAINS`, quien tiene una `accepted` sigue entrando, como externa** (EQ-111), y para cortarla se la desactiva (EQ-39); solo deja de entrar quien entró sin invitación. Sin equivalente relevado en Clockify.      |

_Corregido el 2026-10-19, E2_: P-05 decía «TT-92 cubre solo el pedido que llega
entre la desactivación y el borrado de la sesión.». Desactivar y borrar las
sesiones van en la misma transacción (D-E2-5 del
[contrato de E2](../slices/fase2-e2-desactivar.md)); la decisión del usuario no
cambia, y lo que esa redacción no nombraba —un ingreso que se cruza con una
desactivación— lo cierra el contrato con el gancho `session.create.after`
(D-E2-2, EQ-42).

_Corregido el 2026-10-20, WS0_: P-09 dice que la columna
`weekly_capacity_minutes` «queda sin uso». La decisión 1 del §7 del
[mapa de la fase 2](../slices/fase2-mapa.md) la borró, y WS0 la quitó con la
migración `0018` ([contrato de WS0](../slices/fase2-ws0-columnas.md)). La
decisión no cambia: la capacidad y los días laborables siguen fuera de alcance.

### Abierto

| ID   | Punto                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-10 | **Verificar en el workspace del equipo** (no es decisión, es mirar): si la pestaña «Groups» existe en el plan Free (EQ-60) y si «Edit profile» muestra capacidad y días laborables (EQ-72); las columnas por omisión y si se ve el correo (EQ-03); el nombre de la opción por omisión del filtro de estado y si incluye a las invitadas (EQ-06); si la fila desactivada de a una se queda hasta recargar (EQ-11); qué separadores acepta el campo de correos y si hay tope (EQ-13); qué pasa al reinvitar un correo invitado o de una persona activa o inactiva (EQ-19 … EQ-21); si desactivar pide confirmación (EQ-46); si un admin ve «Deactivate» en la fila de otro admin (EQ-38); la forma del diálogo de transferir (EQ-58); si se puede crear un grupo desde la fila de una persona (EQ-63); si los reportes filtran y agrupan por grupo (EQ-66); qué conserva la pantalla al recargar (EQ-100); y, en un reporte, si las horas de una inactiva aparecen sin el filtro «Inactive» (sección 15). |

**Para `architect`, no para el usuario**: la acción de `can()` de EQ-38 y la de
grupos (EQ-68); la pertenencia por grupo en `ProjectResource` (EQ-64); y la
salida para EQ-110, que el contrato de E1b deja a E2b. Dónde vive una
invitación, si `invited` sigue teniendo uso y dónde se corta el ingreso (EQ-17,
EQ-18, EQ-29) los decidió el
[ADR 0024](../adr/0024-donde-vive-una-invitacion-y-donde-se-corta-el-ingreso.md).
La membresía nueva nace en `createMembership` de `workspace/service.ts`, donde
WS-08 de [`workspace.md`](workspace.md) copia el primer día de la semana del
workspace (E4, según la §12 del [contrato de E1b](../slices/fase2-e1b-ingreso.md)):
el contrato que la toque lee las dos especificaciones.
_Actualizado el 2026-10-19, E2_: la acción de EQ-38 es `team.admin.setStatus`,
solo del owner (D-E2-4 del [contrato de E2](../slices/fase2-e2-desactivar.md)).
_Actualizado el 2026-10-20, E2b_: la salida para EQ-110 es la vinculación
(EQ-115), con el [ADR 0027](../adr/0027-una-fila-user-sin-cuenta-de-google.md);
las acciones de `can()` de E2b son `team.account.link`, `team.email.release` y
`team.admin.account`, esta solo del owner (D-E2b-4 del
[contrato de E2b](../slices/fase2-e2b-sin-cuenta.md)).
