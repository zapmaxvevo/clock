# Fase 2, E2b: volver a entrar sin `account`

Contrato del slice E2b de la fase 2. **Devuelve la entrada a una persona con
`user` y membresía activa pero sin la cuenta de Google con que entra**, sin
volver a encender el enlace implícito que PF-47 apagó: el owner pide una
**vinculación** en la fila de la persona, y el próximo ingreso con ese correo,
dentro del plazo, la usa una vez para dejar su cuenta de Google como la de esa
fila. Reactivar a una persona sin cuenta pasa a ser reactivar y pedir la
vinculación. Cubre además P-11 de `perfil.md`: **liberar el correo** de una
persona inactiva, para que la dirección se pueda invitar para otra, y un texto
propio en `/login` cuando una cuenta de Google nueva choca con un correo en uso.

- **Fuente:** [`equipo.md`](../parity/equipo.md), §5 (EQ-41, EQ-47), §10
  (EQ-79, EQ-114), §14 (EQ-108 … EQ-110) y §18 (P-05, P-07);
  [`perfil.md`](../parity/perfil.md), PF-45, PF-47, PF-48 y P-11; el
  [mapa de la fase 2](fase2-mapa.md), §2 (grupo 2), §3 «Lo que vale para todos»
  y «E2b», §4, §5 y §7; el [contrato de E2](fase2-e2-desactivar.md), D-E2-2,
  D-E2-3, D-E2-5 … D-E2-7 y §6; el contrato del MCP
  (`mejoras-mcp.md`, D-MCP-5), que se escribe en paralelo.
- **Lugar en el plan:** cuarto slice de la fase 2. Depende de E1b y de E2, los
  dos en `main` (`27774d6`). Va **antes de reactivar a cualquiera de las tres
  inactivas que creó la importación**; mientras tanto, E2 ya lo impide
  (D-E2-7).
- **Revisión:** `architecture-reviewer` lo aprobó con cambios en dos rondas; las
  doce correcciones de la primera y las cinco de la segunda están aplicadas.
- **Decisiones de arquitectura:** el
  [ADR 0027](../adr/0027-una-fila-user-sin-cuenta-de-google.md), **una fila
  `user` sin cuenta de Google**, en estado «Propuesto»: la vinculación pendiente
  (D-E2b-1 … D-E2b-3, D-E2b-11), liberar el correo (D-E2b-9) y lo que pasa a
  significar una invitación `accepted` (D-E2b-8). El resto cae dentro de ADR
  aceptados:
  - [ADR 0023](../adr/0023-quitar-el-rol-de-admin-es-una-accion-propia.md):
    vincular y liberar son acciones propias de `can()`, solo del owner
    (D-E2b-4).
  - [ADR 0024](../adr/0024-donde-vive-una-invitacion-y-donde-se-corta-el-ingreso.md):
    la vinculación se usa en `mapProfileToUser`, que sigue siendo el corte del
    ingreso (decisión 4), y solo después de que la regla deja entrar.
  - [ADR 0025](../adr/0025-un-modulo-escribe-en-otro-por-su-service.md): las
    columnas nuevas de `membership` son de `team`; las escrituras en `user`,
    `account` y `session` son funciones de `src/server/auth-records.ts`; el
    registro de un externo, una función de `workspace` (D-E2b-2, D-E2b-3,
    D-E2b-8, D-E2b-9).
  - [ADR 0010](../adr/0010-un-modulo-consulta-las-reglas-de-otro-por-su-service.md):
    la lista muestra la vinculación, el correo liberado y la invitación del
    correo con un `join`; las reglas los leen con funciones del dueño.

Decisiones del usuario que el contrato da por tomadas: una persona inactiva no
entra (P-05, 2026-10-16); solo el owner desactiva o reactiva a un admin (P-07);
P-11 de `perfil.md` entra con E2b (mapa §7, 2026-10-16). Lo que queda para el
usuario está en §11.

## Decisiones del contrato

**D-E2b-1 — La salida es una vinculación que pide el owner y usa el próximo
ingreso con ese correo (ADR 0027).** Se compararon cinco salidas:

| Salida                                                                     | Quién queda atado a la fila                            | Por qué no, o por qué sí                                                                                                                                                                                                       |
| -------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Enlace implícito para las filas activas sin cuenta; reactivar autoriza     | quien tenga la dirección                               | No cubre a quien ya tiene una cuenta (EQ-109). No se ve ni se cancela. Toda fila activa sin cuenta que exista al desplegar queda abierta sin que nadie lo decida.                                                              |
| El `sub` de Google conocido                                                | la cuenta exacta                                       | El dato no existe: Clockify no lo exporta, el procedimiento SQL lo borró y la persona no lo ve en ningún lado.                                                                                                                 |
| Una invitación nueva que ata la fila                                       | quien tenga la dirección                               | La misma confianza que la vinculación, pero rompe dos invariantes: una `pending` es de un correo sin membresía (E1a) y la membresía gana sobre la invitación (D-E2-1). Invitar a una persona existente responde EQ-20 o EQ-79. |
| **Una vinculación del owner, en la membresía, que usa el próximo ingreso** | quien tenga la dirección, **cuando el owner lo pidió** | **Elegida.** Se ve en la fila, se cancela, vence, vale una vez y solo con la membresía activa. Cubre a las importadas, a las del procedimiento y a quien necesita otra cuenta.                                                 |
| La vinculación con un código de un solo uso                                | quien recibió el código                                | Más fuerte, pero pide una pantalla previa al ingreso y llevar el código por el `state` de OAuth hasta `mapProfileToUser`, que no recibe el pedido. Queda para el usuario (§11, pregunta 3).                                    |

Rehacer la fila —dejar que Better Auth cree un `user` nuevo y mover la
membresía, las horas y los proyectos— se descartó por el alcance: toca toda
tabla con `user_id` y la clave `restrict` de `time_entry`.

**Para el dominio de la empresa** la dirección la controla la empresa, con el
claim `hd` que exige `decideGoogleAccess`; el riesgo que queda es que el owner
pida la vinculación de una dirección que la empresa ya le dio a otra persona. Lo
cubren el texto de la confirmación (§5.4), que pide hacerlo solo si el correo
sigue siendo de esa persona, y el vencimiento (D-E2b-11).

**D-E2b-2 — La vinculación vive en dos columnas de `membership`, de `team`, que
un `check` ata a una membresía activa.** Migración nueva (§2):

- `account_link_requested_at timestamptz null`: hay una marca si no es nula; es
  **vigente** mientras no pasaron `ACCOUNT_LINK_TTL_DAYS` días (D-E2b-11).
- `account_link_requested_by_id text null`, con clave a `user(id)` y `on delete
set null`: quién la pidió. Nula también si la pidió una sentencia SQL (§6.8).
- `check membership_account_link_active`:
  `account_link_requested_at is null or status = 'active'`. **Solo una membresía
  activa tiene una marca** (P-05): la base rechaza una en una inactiva.

El comentario de las columnas en `src/server/db/schema.ts` dice que son de
`team` (ADR 0025: «Una columna nueva de `membership` dice en el esquema de quién
es») y remite a D-E2b-2. **Por qué en `membership` y no en una tabla propia**: la
vinculación es de una membresía —la que recupera la entrada—, la lista ya lee
esa fila, desactivar ya la bloquea, y el `check` expresa P-05 en la base. Una
tabla aparte pedía la misma clave hacia `membership`, un `join` más en la lista
y en el ingreso, y no protegía nada más.

**D-E2b-3 — La vinculación se usa en `mapProfileToUser`, después de la regla de
ingreso y antes de que Better Auth busque la cuenta.**

**Por qué ahí.** Es el único punto propio que conoce el `sub` antes de la
búsqueda. El callback llama a `getUserInfo`
(`node_modules/better-auth/dist/api/routes/callback.mjs:120-128`), que llama a
`mapProfileToUser` con el `id_token` decodificado, `sub` incluido
(`node_modules/@better-auth/core/dist/social-providers/google.mjs:116-135`;
el tipo, `google.d.mts:30`); después deriva la clave con `accountSubject`, que
para Google es `profile.sub` (`google.mjs:56`; `callback.mjs:137`;
`better-auth/dist/oauth2/account-key.mjs:14-27`), y recién entonces llama a
`handleOAuthUserInfo` (`callback.mjs:172-194`). Ninguna otra pieza sirve:

- `disableImplicitLinking` es estática y se evalúa sin excepción
  (`better-auth/dist/oauth2/link-account.mjs:139`); `trustedProviders` no la
  saltea;
- el enlace a una fila elegida (`selectedUser`, `link-account.mjs:78`,
  `:107-118`) lo pasan solo plugins (`one-tap`, `oauth-proxy`), y el callback no
  (`callback.mjs:172-190`);
- el enlace explícito (`linkOAuthAccount`, `link-account.mjs:22-71`, vía
  `/link-social`) pide una sesión de la persona, y `/link-social` está
  deshabilitado (`src/server/auth.ts:48`);
- los `databaseHooks` de `account` no corren: Better Auth no crea una cuenta
  para un correo que ya tiene fila (`link-account.mjs:134-145`).

Las líneas son de la 1.7.7; las de la 1.7.10 están en §0.

**Cuándo.** `decideProfileEntry` decide la regla como hoy, **primero**: un
correo del dominio sin `hd`, un correo sin verificar, un externo sin invitación
abierta o una membresía inactiva responden su motivo y no tocan la marca. Solo
si `usesAccountLink(decision, facts)` —la regla deja entrar, la membresía del
correo está `active` y tiene una marca vigente— llama a
`bindRequestedAccount(email, sub)` antes de devolver. Sin marca vigente no abre
ninguna transacción: el costo de un ingreso normal es una columna más en la
lectura de los hechos.

**Qué hace `bindRequestedAccount`**, en una transacción, en este orden:

1. **`googleAccountOwnerOf(tx, sub)`**: si el `sub` ya es la cuenta de alguna
   fila, no escribe y devuelve `skipped`. Dos casos: la persona entra con la
   cuenta que ya tenía (la marca queda, esperando otra), o el `sub` es de otra
   fila (la marca queda; Better Auth sigue su camino con esa fila, como hoy).
   **Nunca se inserta un `sub` que ya existe**: dos filas con la misma clave
   hacen lanzar a `findAccountOwnerByKey`
   (`better-auth/dist/db/internal-adapter.mjs:555`) en todo ingreso de esa
   cuenta.
2. **`claimAccountLink(tx, email)`** (`team`) parte de las filas `user` cuyo
   correo normalizado es `email`, como `entryFacts`
   (`workspace/repository.ts:356-363`):
   - **más de una fila `user`, o ninguna, o una sin membresía en el workspace
     del ingreso**: `none`, sin bloquear ni escribir;
   - **una sola**: bloquea `for no key update` su membresía y decide con lo que
     lee bajo el bloqueo. **No activa**: `inactive`, sin escribir; la perdió en
     la carrera con una desactivación. **Activa**: intenta limpiar la marca con
     una sentencia que **decide la vigencia en el momento de escribir**, con
     `clock_timestamp()` y no con `now()`, que es la hora de inicio de la
     transacción:

     ```sql
     update membership
     set account_link_requested_at = null, account_link_requested_by_id = null
     where id = $1
       and account_link_requested_at > clock_timestamp() - make_interval(days => $ttl)
     returning account_link_requested_by_id
     ```

     Si devuelve una fila, deja `membership.linkUse` y devuelve `claimed` con
     la persona. Si no devuelve ninguna —no había marca, o venció, también
     mientras el ingreso esperaba el bloqueo—, `none`, sin escribir.

   Con `none`, `bindRequestedAccount` devuelve `skipped`; con `inactive`,
   `inactive`.

3. Con `claimed`, **`bindGoogleAccount(tx, person, sub)`** (`auth-records`):
   borra las otras filas de `account` de la persona, borra sus sesiones con
   `deleteSessionsOf` (E2) e inserta la cuenta de `sub`, sin tokens; deja
   `account.link`. **Con el MCP en `main`** borra además sus autorizaciones con
   `deleteGrantsOf` (D-MCP-5), después de las sesiones: un asistente que la
   cuenta vieja conectó no sigue con la nueva. Devuelve `linked`.

**Por qué el bloqueo no va en una sola sentencia con el `left join`**: Postgres
no acepta `for no key update` sobre el lado nulable de un `outer join`. Son dos
lecturas en la misma transacción: las filas `user` del correo, sin bloqueo, y
el bloqueo de la membresía del único `user_id`. Una segunda fila `user` con el
mismo correo normalizado que aparezca entre las dos solo la crea el script de
importación, y la consulta 2 de §6.1 la detecta.

`decideProfileEntry` traduce lo que devuelve `bindRequestedAccount`:

- `linked` o `skipped`: la decisión de la regla, `allowed`. Better Auth sigue.
  Con `skipped` y una fila sin la cuenta de ese `sub`, Better Auth responde
  `account_not_linked`, con el texto de D-E2b-10.
- `inactive`: `membresia_inactiva`, con EQ-92. Es el mismo texto que la persona
  vería si la desactivación hubiera llegado antes de leer los hechos.
- **Un error** (la base, un `check`, un bloqueo que expira): la transacción no
  confirma, así que nada se escribe y la marca queda. `mapProfileToUser` corre
  fuera de todo `try` del callback (`callback.mjs:120-128`; `auth.ts:74-76`), y
  un error que no es una redirección saldría como un 500 en JSON.
  `decideProfileEntry` lo atrapa, lo registra con `console.error`, como
  `src/server/action.ts:69`, y devuelve `vinculacion_fallida`: `mapProfileToUser`
  redirige a `/login?error=vinculacion_fallida`, que no es un motivo conocido y
  muestra el genérico «No se pudo iniciar sesión. Volvé a intentar.». Reintentar
  vuelve a intentar la vinculación.

`person` es el `Actor` de la persona, armado con la membresía bloqueada: las
constancias de este ingreso tienen a la persona como autora, y el
`account_link_requested_by_id` que devolvió la sentencia, que va en
`membership.linkUse`, dice quién la autorizó.

**Lo que hace Better Auth después**: `findAccountOwnerByKey` encuentra la cuenta
(`link-account.mjs:80-106`; `internal-adapter.mjs:542-566`) y sigue el camino de
una cuenta ya enlazada (`link-account.mjs:190-237`): escribe los tokens
(`updateAccountOnSignIn` vale `true` salvo que se apague, `:208-215`,
`:224-235`), marca el correo verificado (`:236`), escribe el nombre y la foto
de Google (`overrideUserInfoOnSignIn`, `:238-254`; el correo no cambia por el
gancho de `auth.ts:98-103`) y crea la sesión (`:322`), que pasa por los dos
ganchos de `session.create` como cualquier ingreso.

**Las sesiones viejas se borran** porque la cuenta se reemplaza: si la persona
pidió otra cuenta porque perdió la anterior, la sesión que haya quedado abierta
con ella no tiene por qué seguir. La sesión del ingreso en curso nace después,
en `link-account.mjs:322`. Una fila sin cuenta no tiene sesiones: no borra nada
y no deja `session.revokeAll`.

**Los bloqueos.** `bindRequestedAccount` toma la membresía, después las filas de
`account`, después las de `session` y, con el MCP, las del plugin. Desactivar
toma las membresías, después `time_entry`, `session` y, con el MCP, las del
plugin (D-E2-6, D-MCP-5); pedir o cancelar una vinculación, las membresías y
después `invitation` (D-E2b-8); liberar, las membresías, después `user`,
`account`, `session` y, con el MCP, las del plugin (D-E2b-9). El gancho
`session.create.after` toma la membresía `for share` y después su `session`
(D-E2-2). Todas empiezan por la membresía: no hay ciclo.

- **Contra una desactivación**: si la desactivación bloquea primero, el ingreso
  espera, lee `inactive` (la marca ya la limpió D-E2b-7), no vincula y responde
  `membresia_inactiva`. Si el ingreso bloquea primero, vincula y confirma; la
  desactivación espera, borra las sesiones —ninguna todavía— y el gancho `after`
  borra la que Better Auth crea después (D-E2-2). En los dos, la persona termina
  sin sesión.
- **Dos ingresos a la vez con dos `sub` distintos y la misma marca**: el segundo
  espera el bloqueo de la membresía, su `update` no encuentra la marca (`none`,
  y `bindRequestedAccount` devuelve `skipped`) y Better Auth responde
  `account_not_linked`. Queda una cuenta.

**Si algo falla después del `commit`** —la sesión, por ejemplo—, la cuenta queda
vinculada: es lo que el owner pidió, y el reintento entra por el camino normal.

**D-E2b-4 — Vincular y liberar son dos acciones propias de `can()`, solo del
owner.** `team.account.link` y `team.email.release`, con la forma de
`team.admin.setStatus` (ADR 0023): `MembershipResource`, `["membership"]` en
`resourceKinds` y `["owner"]` en `allowedRoles`. El cuerpo de `can()` no cambia.

- **Por qué solo el owner**: vincular le da a quien tenga una dirección la fila
  entera de otra persona, con su rol y sus horas; es la operación que reabre
  PF-47. Liberar es irreversible desde la aplicación. Las dos son raras y las
  decide quien conoce a las personas. Es la misma razón que E6 («Quitar del
  equipo», solo del owner, P-08). La alternativa —owner y admin, con las filas
  `admin` solo del owner— queda para el usuario (§11, pregunta 1).
- **La fila propia**: `can()` deja al owner actuar sobre su membresía, así que
  **el owner puede pedir una vinculación para sí mismo**. Sirve si sabe que va a
  cambiar de cuenta. Liberar la propia no llega a pasar: la fila del owner está
  activa (D-E2b-9, paso 5).
- **El owner que ya perdió su cuenta** no puede pedirla desde la aplicación; la
  salida es la sentencia de §6.8.

**D-E2b-5 — Reactivar a una persona sin cuenta es reactivar y pedir la
vinculación, en una transacción. Levanta D-E2-7.** El paso 8 de D-E2-3 cambia:

- **Sin cuenta, con `team.account.link`** (el owner): la membresía pasa a
  `active` y recibe la marca, con `membership.reactivate` y
  `membership.linkRequest`, y el registro del externo de D-E2b-8. Reactivar sin
  la marca dejaría una fila activa que no puede entrar, que es lo que D-E2-7
  evitaba.
- **Sin cuenta, sin `team.account.link`** (un admin): `forbidden` con EQ-114,
  que cambia de texto: «Solo el propietario reactiva a una persona sin cuenta de
  Google vinculada.». La fila no le ofrece «Reactivar», como hoy.
- **Con el correo liberado**: `email_released` con EQ-121, para cualquiera. Una
  fila liberada no vuelve (D-E2b-9).
- **Reactivar sin cuenta pide confirmación**, a diferencia de EQ-47: dice que la
  próxima cuenta de Google con ese correo queda atada a la fila (§5.4).
  Reactivar a quien tiene cuenta sigue sin confirmación.
- `no_account` sale de `TeamErrorCode`: la regla es de permiso y responde
  `forbidden`.

**D-E2b-6 — Pedir, renovar y cancelar la vinculación de una persona activa:
`setAccountLink`, idempotente.** `{ membershipId, link: boolean }`, como
`changeStatus` con su estado. Dentro de la transacción, después del bloqueo de
las dos membresías (`lockForChange`, D-E2-6), en este orden:

1. La membresía pedida no está, es de otro workspace o es `invited`:
   `not_found`, EQ-82.
2. La membresía de quien actúa no está: `forbidden`, EQ-90.
3. Sin `team.manage` con la autoridad releída: `forbidden`, EQ-90.
4. Sin `team.account.link` sobre la fila: `forbidden`, EQ-117.
5. **Cancelar** (`link: false`): sin marca, éxito sin escribir; con una, vigente
   o vencida, la limpia y deja `membership.linkCancel`.
6. **Pedir** (`link: true`), con el correo de la fila (`userEmailOf`):
   1. correo liberado: `email_released`, EQ-121;
   2. membresía inactiva: `inactive_membership`, EQ-118 (se reactiva, y
      reactivar pide la vinculación si falta la cuenta, D-E2b-5);
   3. marca vigente: éxito sin escribir;
   4. sin marca o con una vencida: registra el externo (D-E2b-8), escribe la
      marca con la fecha de la base y quien actúa, y deja
      `membership.linkRequest`. Con una vencida es **renovarla**.

**Con cuenta o sin ella** se pide igual: con cuenta, la próxima cuenta nueva con
ese correo **reemplaza** a la actual (D-E2b-3), y hasta entonces la actual sigue
entrando; sin cuenta, la próxima cuenta con ese correo es la primera. Es EQ-109
para la misma persona con otra cuenta.

**D-E2b-7 — Desactivar cancela la marca.** En `writeStatus`, antes de pasar la
membresía a `inactive`, si tiene una marca, vigente o vencida, la limpia y deja
`membership.linkCancel` con quien desactiva como actor. Va antes porque el
`check` de D-E2b-2 rechazaría el cambio de estado con la marca puesta. El resto
de D-E2-5 no cambia. Reactivar no la devuelve, salvo el caso sin cuenta de
D-E2b-5.

**D-E2b-8 — Pedir la vinculación de un externo sin invitación abierta lo
registra, y el registro queda.** La regla de ingreso exige a un correo fuera de
los dominios una invitación `pending` o `accepted` (ADR 0024, decisión 3;
`access.ts:94-97`, `:152-154`). Una inactiva importada con un correo externo no
tiene ninguna: su vinculación nunca se usaría, y no se la puede invitar
(EQ-79). **Al pedir** la vinculación —también al reactivar sin cuenta—, `team`
llama a **`registerExternalMember(tx, actor, email)`**, del service de
`workspace` (dueño de `invitation`, ADR 0025):

- correo de los dominios, o con una invitación `pending` o `accepted`: no
  escribe;
- sin invitación: inserta una `accepted`, con quien actúa como `invited_by_id`;
- con una `revoked`: la pasa a `accepted`;
- deja `invitation.register` en los dos últimos casos.

Lo que eso implica, y lo que el owner tiene que saber al confirmar (§5.4):

- **El registro no se deshace** al cancelar la vinculación, al dejarla vencer
  ni al usarla. Es el registro de un externo con membresía, como el de todo
  externo que entró por invitación (E1b).
- **Un externo activo con cuenta y sin invitación abierta** —la tenía revocada,
  o su dominio salió de `GOOGLE_WORKSPACE_DOMAINS` (EQ-111)— hoy no entra por la
  identidad. **Apenas se pide su vinculación vuelve a entrar con su cuenta
  vieja**, sin usar la marca, y conserva la entrada aunque la vinculación se
  cancele o venza. Para cortarla, se la desactiva (EQ-39).
- **Cambia lo que significa una `accepted`** (ADR 0024, decisión 3): además de
  «entró por una invitación», puede ser «el owner la registró al pedir una
  vinculación». Lo distingue el audit log (`invitation.accept` o
  `invitation.register`). Es la decisión 8 del ADR 0027.

El ingreso, la identidad por pedido (D-E2-2) y la marca «Externa» de la lista
no cambian.

**D-E2b-9 — Liberar el correo de una persona inactiva (P-11, EQ-109).** Es la
salida de la dirección reciclada: la dirección de una persona que se fue la usa
otra, que no entra porque la fila vieja ocupa el correo (PF-47) y no se la
puede invitar porque es de una inactiva (EQ-79). Vincular no sirve: le daría a
la persona nueva las horas de la anterior. **`releaseEmail({ membershipId })`**,
idempotente, con el mismo bloqueo que D-E2b-6, en este orden:

1. La membresía pedida no está, es de otro workspace o es `invited`:
   `not_found`, EQ-82.
2. La membresía de quien actúa no está, o perdió `team.manage` bajo el
   bloqueo: `forbidden`, EQ-90.
3. Sin `team.email.release` sobre la fila: `forbidden`, EQ-119.
4. El correo ya está liberado: éxito sin escribir.
5. La membresía está activa: `active_membership`, EQ-120. Incluye la propia y la
   del owner, que están activas.
6. **`releaseEmailOf(tx, actor, userId)`** (`auth-records`): cambia `user.email`
   por `releasedEmailOf(userId)`, borra sus filas de `account` y sus sesiones
   (`deleteSessionsOf`) y, **con el MCP en `main`**, sus autorizaciones
   (`deleteGrantsOf`, D-MCP-5); deja `user.releaseEmail` con el correo anterior
   y la cantidad de cuentas.

- **La forma del correo liberado**: `<userId>@liberado.invalid`, de
  `releasedEmailOf` en `src/lib/email.ts`. Es única porque el id lo es (el
  índice único de `user.email`, `auth-schema.ts:7`, la respeta); `.invalid` no se
  resuelve (RFC 2606); no es de ningún dominio de la empresa ni tiene invitación,
  así que no pasa la identidad en ningún punto de corte. `isReleasedEmail` la
  reconoce.
- **Lo que queda**: el nombre, la membresía inactiva con su rol, las horas, los
  proyectos y el audit log. El reporte la sigue mostrando por su nombre
  (RP-61), que no lleva correo (D-E2-10).
- **Lo que deja de pasar**: la persona vieja no entra con ninguna cuenta —su
  cuenta se borró y el correo guardado no pasa la identidad—, no se reactiva y
  no se le pide una vinculación (EQ-121). **No se deshace desde la
  aplicación**: el audit log guarda el correo anterior, y volver atrás es una
  corrección a mano.
- **La dirección queda libre**: invitarla responde como un correo nuevo, o
  reinvita la `accepted` de un externo (`invitation-plan.ts:89-98`); quien la
  tenga entra por la invitación, con una fila nueva, como cualquier invitada
  (EQ-17).
- **Por qué solo una inactiva**: una persona activa a la que la empresa le
  cambió la dirección (PF-48) sigue entrando por su cuenta; liberarle el correo
  la dejaría afuera. Ese caso no lo resuelve E2b (§12).

**D-E2b-10 — `/login` explica `account_not_linked` con un texto neutro (P-11,
PF-47).** Una cuenta de Google nueva con el correo de una fila que tiene otra
cuenta, o ninguna, y sin marca vigente, termina en `handleOAuthUserInfo` con
`account not linked` (`link-account.mjs:134-145`); el callback lo redirige a
`onAPIError.errorURL` con `error=account_not_linked` (`callback.mjs:195-198`,
`:35`; `auth.ts:52`). Hoy `/login` muestra el genérico «No se pudo iniciar
sesión. Volvé a intentar.», que invita a reintentar algo que no va a cambiar.
Desde E2b muestra EQ-122: «Ya hay una persona en Clock con ese correo. Pedile al
propietario del workspace que revise tu acceso.».

- **Por qué neutro**: el mismo código llega por dos causas con salidas opuestas.
  La misma persona con otra cuenta se resuelve vinculando; otra persona con una
  dirección reciclada, liberando el correo e invitándolo, y vincular ahí le daría
  las horas de la anterior. El texto no sugiere ninguna de las dos ni dice «otra
  cuenta de Google», que es falso cuando la fila no tiene ninguna: el owner
  pregunta y decide.
- `loginErrorMessage` suma el código en un mapa propio,
  `callbackErrorMessage`, que no es un `AccessDenialReason`: no lo produce la
  regla de ingreso sino Better Auth.
- Una inactiva sin cuenta sigue viendo EQ-92: `mapProfileToUser` la corta antes
  (D-E2-1).

**D-E2b-11 — La vinculación vence a los siete días.** Una vinculación no es una
invitación: abre una fila con rol y horas, así que la comparación con EQ-25 no
alcanza. Siete días bastan para que el owner coordine el ingreso con la persona
y acotan cuánto tiempo una dirección reasignada podría entrar a la fila.

- **`ACCOUNT_LINK_TTL_DAYS = 7`**, en `src/server/access.ts`, al lado de
  `EntryFacts`: es parte de la regla del ingreso.
- **Se calcula sin cron, con el reloj de la base.** Las lecturas lo calculan
  para describir y para decidir si vale la pena intentar: `entryFacts` llama
  vigente a una marca con `account_link_requested_at > now() - make_interval(days
=> 7)`, y `listMembers` y `lockForChange` traen el vencimiento y si ya pasó, con
  la misma expresión. **Lo decide la escritura que la usa**: el `update` de
  `claimAccountLink` (D-E2b-3) compara con `clock_timestamp()`, la hora del
  momento, porque `now()` es la del inicio de la transacción y una marca que
  vence mientras el ingreso espera el bloqueo se usaría igual. Ningún código de
  TypeScript suma días a una fecha.
- **Vencida, la marca queda** hasta que el owner la renueva, la cancela o
  desactiva a la persona (D-E2b-6, D-E2b-7). No se usa: un ingreso con un `sub`
  nuevo termina en `account_not_linked`.
- **La fila muestra la fecha del pedido** y la del vencimiento (§5.2).
- Si el usuario prefiere que no venza, es la pregunta 2 de §11: sale la
  constante y la condición de vigencia, y la nota pierde el vencimiento.

**D-E2b-12 — Lo que E2b no resuelve.**

- **PF-48**, la empresa cambia la dirección de una persona activa: la fila
  conserva la vieja (PF-06) y sigue entrando por su cuenta. Sigue siendo una
  corrección a mano (§12).
- **El owner sin cuenta y sin vinculación pedida**: §6.8.
- **Dos filas `user` con el mismo correo normalizado**: `entryFacts` ya devuelve
  la membresía en `null` (`workspace/repository.ts:336-346`), y
  `claimAccountLink` no elige entre dos: `none`, sin vincular. La consulta 2 de
  §6.1 lo detecta.

## 0. Precondición de arranque

- **`main` en `27774d6`**, con E1a, E1b y E2 mergeados. Las citas de abajo son
  de ese árbol y de `node_modules` con `better-auth` 1.7.7.
- **El ADR 0027 aceptado** y las preguntas de §11 respondidas, antes de
  implementar.
- **La consulta de §6.1 corrida en producción** antes de migrar, no antes de
  implementar.
- **Si `main` ya trae Better Auth 1.7.10** (la sube el MCP), los seis puntos de
  abajo tienen que sostenerse en esa versión. **`architecture-reviewer` ya los
  verificó** sobre el paquete de la 1.7.10 (`npm pack`) contra la 1.7.7, y ese
  es el punto de partida de `backend-dev`, que **solo confirma** sobre el árbol
  real y deja el resultado en el registro del slice:
  1. que el `getUserInfo` de Google siga llamando a `mapProfileToUser` antes de
     que el callback llame a `resolveOAuthAccountKey` y a `handleOAuthUserInfo`;
  2. que `handleOAuthUserInfo` siga buscando por la clave de la cuenta antes que
     por correo, y que `findAccountOwnerByKey` siga lanzando con claves
     repetidas;
  3. que el rechazo siga siendo `"account not linked"` y llegue a `/login` como
     `account_not_linked`;
  4. que el callback siga sin verificar la firma del `id_token`: el helper
     `signInWithGoogle` arma uno sin firmar (`auth.integration.test.ts:313-316`);
  5. que `@better-auth/oauth-provider` no sume caminos que llamen a
     `getUserInfo`, o a `handleOAuthUserInfo` con `selectedUser`;
  6. que `disableIdTokenSignIn` se siga respetando en `/sign-in/social`.

  Lo que encontró el revisor en la 1.7.10: `callback.mjs`, `link-account.mjs`,
  `account-key.mjs` y `account.mjs` son idénticos a los de la 1.7.7; en
  `google.mjs`, `decodeJwt` pasa a la línea 120 y la llamada a
  `mapProfileToUser` a la 125; en `internal-adapter.mjs`,
  `findAccountOwnerByKey` pasa a la 557 y su lanzamiento con claves repetidas a
  la 570; `disableIdTokenSignIn` se evalúa en
  `@better-auth/core/dist/oauth2/verify-id-token.mjs:23` y `:39`; el plugin de
  OAuth no llama a `getUserInfo`, a `handleOAuthUserInfo` ni usa `selectedUser`.
  Los seis puntos se sostienen. Si la confirmación de `backend-dev` da otra
  cosa, el contrato vuelve a `architect` antes de seguir.

- **Las citas de `auth-schema.ts`** se corren si el MCP regenera ese archivo
  (`npm run auth:schema`); lo que dicen no cambia.

### Supuestos sobre el árbol, con archivo y línea en `27774d6`

| Supuesto                                                                                                                                                | Dónde                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Enlace implícito apagado; `/link-social` y `/unlink-account` deshabilitados; errores del callback a `/login`                                            | `src/server/auth.ts:38-43`, `:48`, `:52`                                                     |
| Sin ingreso por `id_token`                                                                                                                              | `auth.ts:58-61`                                                                              |
| `mapProfileToUser` arma `decideProfileEntry` con correo, verificación y `hd`; no pasa `sub`; corre sin `try`                                            | `auth.ts:74-89`; `src/server/entry.ts:39-45`                                                 |
| El correo de `user` no cambia en ningún ingreso                                                                                                         | `auth.ts:98-103`                                                                             |
| Los dos ganchos de `session.create`                                                                                                                     | `auth.ts:106-134`; `entry.ts:77-89`                                                          |
| `loginErrorUrl` recibe un `AccessDenialReason`                                                                                                          | `entry.ts:91-96`                                                                             |
| `EntryFacts` con invitación y membresía; solo `active` entra                                                                                            | `src/server/access.ts:25-43`, `:106-121`                                                     |
| La identidad de un externo pide una invitación `pending` o `accepted`                                                                                   | `access.ts:94-97`, `:152-154`, `:163-172`                                                    |
| `/login` muestra un genérico para un código que no es un motivo                                                                                         | `access.ts:188-215`                                                                          |
| Un error inesperado se registra con `console.error`                                                                                                     | `src/server/action.ts:69`                                                                    |
| `entryFacts`: una sentencia sobre el workspace más viejo; parte de `user` con `left join` a `membership`; dos `user` con el correo dan membresía `null` | `src/modules/workspace/repository.ts:336-378`, `:356-363`                                    |
| `entryFactsOf` y `entryMembershipStatusLocked`                                                                                                          | `src/modules/workspace/service.ts:380-387`, `:414-425`                                       |
| `deleteSessionsOf` y `hasAccount`                                                                                                                       | `src/server/auth-records.ts:22-44`, `:55-62`                                                 |
| `account` sin índice único por `(provider_id, account_id)`; `user.email` único                                                                          | `src/server/db/auth-schema.ts:7`, `:36-58`                                                   |
| `account.updated_at` sin valor por omisión                                                                                                              | `auth-schema.ts:53-55`                                                                       |
| `membership` e `invitation`                                                                                                                             | `src/server/db/schema.ts:97-123`, `:190-231`                                                 |
| `can()`: la forma de `team.admin.setStatus`; la membresía del owner solo la toca el owner                                                               | `src/server/permissions/index.ts:64-67`, `:106`, `:138`, `:214-221`                          |
| D-E2-7 en el service: la vista no ofrece reactivar sin cuenta; `changeStatus` responde `no_account`                                                     | `src/modules/team/service.ts:121-129`, `:319-322`                                            |
| `writeStatus`: estado, constancia, timer y sesiones                                                                                                     | `team/service.ts:258-281`                                                                    |
| La lista y el bloqueo de `team`                                                                                                                         | `src/modules/team/repository.ts:46-70`, `:83-106`, `:124-136`                                |
| Textos, códigos, la fila y las actions de `team`                                                                                                        | `src/modules/team/schema.ts:34-65`, `:99-121`, `:134-141`; `team/actions.ts:17-51`           |
| El menú de la fila recibe una sola entrada                                                                                                              | `src/modules/team/components/member-actions-menu.tsx:18-26`, `:53-58`                        |
| Invitar: la membresía gana; una `accepted` sin membresía se reinvita                                                                                    | `src/modules/workspace/invitation-plan.ts:75-98`                                             |
| `user.email` lo leen la lista de equipo, el perfil propio y el encabezado propio                                                                        | `team/repository.ts:57`; `src/modules/profile/service.ts:210`; `src/app/(app)/layout.tsx:20` |
| El callback por `auth.handler` con un `id_token` sin firmar y `fetch` reemplazado en cada llamada                                                       | `src/server/auth.integration.test.ts:313-372`                                                |
| La e2e de E2 afirma «sin menú» en una inactiva sin cuenta, mirada por un admin                                                                          | `e2e/team-status.spec.ts:263-296`                                                            |

Las citas de `node_modules` están en D-E2b-3 y D-E2b-10 (1.7.7) y en la lista de
arriba (1.7.10).

## 1. Alcance

Cubre EQ-109 y EQ-110 (`equipo.md`), EQ-114 con su texto nuevo, y P-11 de
`perfil.md` (PF-47 con D-E2b-10). Propone a `parity-analyst` EQ-115 … EQ-122
(§7).

Entra:

- **La vinculación**: las columnas y su `check` (D-E2b-2), su uso en el
  ingreso (D-E2b-3), pedirla, renovarla y cancelarla (D-E2b-6), reactivar sin
  cuenta (D-E2b-5), desactivar la cancela (D-E2b-7), el registro del externo
  (D-E2b-8) y el vencimiento (D-E2b-11).
- **Liberar el correo** (D-E2b-9).
- **El texto de `account_not_linked`** en `/login` (D-E2b-10).
- **Dos acciones de `can()`** (D-E2b-4).
- **La pantalla**: las notas de la fila, las entradas nuevas del menú, dos
  confirmaciones y los avisos (§5).
- **La migración** y las consultas de §6.
- **Tests** de unidad, integración y e2e (§9).

Queda afuera: §12.

### Consecuencias sobre código ya entregado

| Archivo                                                                   | Qué cambia                                                                                                                                                 | Qué hay que volver a probar                                                                    |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/server/db/schema.ts`, `drizzle/`                                     | Las dos columnas y el `check` (§2)                                                                                                                         | `db:generate` y `db:migrate` en una base con datos                                             |
| `src/server/access.ts`, `access.test.ts`                                  | `EntryFacts.accountLink`; `usesAccountLink`; `ACCOUNT_LINK_TTL_DAYS`; `callbackErrorMessage`                                                               | `access.test.ts` entero                                                                        |
| `src/server/entry.ts`, `auth.ts` y sus tests de integración               | `decideProfileEntry` recibe `sub`, usa la vinculación y atrapa su error; `bindRequestedAccount`; `loginErrorUrl` con un código más                         | `entry.integration.test.ts`, `auth.integration.test.ts`                                        |
| `src/server/auth-records.ts`, `auth-records.integration.test.ts`          | `googleAccountOwnerOf`, `bindGoogleAccount`, `userEmailOf`, `releaseEmailOf`                                                                               | el archivo                                                                                     |
| `src/lib/email.ts`                                                        | `releasedEmailOf`, `isReleasedEmail`                                                                                                                       | su test                                                                                        |
| `src/server/permissions/index.ts`, `permissions.test.ts`                  | `team.account.link` y `team.email.release`                                                                                                                 | la tabla entera                                                                                |
| `src/modules/workspace/service.ts`, `repository.ts`                       | `entryFacts` con la marca vigente; `entryWorkspaceIdOf`; `registerExternalMember`                                                                          | `workspace/service.integration.test.ts`                                                        |
| `src/modules/team/schema.ts`, `repository.ts`, `service.ts`, `actions.ts` | La fila con la vinculación, el correo liberado y el registro externo; `setAccountLink`, `releaseEmail`, `claimAccountLink`; `changeStatus` y `writeStatus` | `team/*.test.ts` y `team/*.integration.test.ts`; el criterio 9 de E2 se invierte para el owner |
| `src/modules/team/components/*`, `src/app/(app)/equipo/page.tsx`          | Las notas, el menú con varias entradas, dos confirmaciones                                                                                                 | los tests de componente y de modelo de `team`                                                  |
| `src/app/login/page.test.tsx`                                             | Los casos de `account_not_linked` y `vinculacion_fallida`                                                                                                  | el archivo                                                                                     |
| `e2e/team-page.ts`, `e2e/database.ts`, `e2e/team-status.spec.ts`          | Los localizadores nuevos; la marca, el correo y las cuentas de una persona                                                                                 | `team-status.spec.ts` sin cambiar lo que afirma; `team.spec.ts`                                |

- **Sin cambio**: `report`, `project`, `profile`, `time-entry`,
  `src/server/session.ts`, `src/server/test-session.ts`, `/login` (el código; su
  test suma dos casos) y la regla de ingreso de `access.ts` (`decideAccess`,
  `decideGoogleAccess`, `decideStoredEmail` y `decideStoredIdentity` no
  cambian).
- **El criterio 9 de E2** («reactivar a una inactiva sin `account` responde
  `no_account`») pasa a valer para un admin, con `forbidden` y EQ-114; para el
  owner, reactiva y pide la vinculación (criterio 4).
- **`e2e/team-status.spec.ts:291-296`** sigue valiendo: la mira un admin, que no
  tiene «Reactivar» ni «Liberar el correo» en esa fila.

### El MCP, en paralelo

El contrato del MCP (`mejoras-mcp.md`, D-MCP-5, §4.15) suma
`deleteGrantsOf(tx, actor, userId)` de `src/server/oauth-records.ts` a la
desactivación. Reemplazar la cuenta de una persona y liberar su correo también
tienen que borrar sus autorizaciones: un asistente conectado por la cuenta vieja
no sigue con la nueva, ni con una fila liberada.

| Quién mergea segundo | Qué suma                                                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E2b                  | `bindGoogleAccount` y `releaseEmailOf` llaman a `deleteGrantsOf` después de `deleteSessionsOf`; los criterios 2 y 16 afirman que la persona queda sin autorizaciones; `auth-records.integration.test.ts`, que no toca las de otra persona. |
| El MCP               | Lo mismo, en el archivo de E2b ya mergeado; el MCP lo anota en su contrato.                                                                                                                                                                |

**Los dos editan `writeStatus`** de `team/service.ts`: E2b suma la cancelación de
la marca antes de `updateStatus` (D-E2b-7) y el MCP, `deleteGrantsOf` después de
`deleteSessionsOf`. Quien mergea segundo resuelve el conflicto conservando las
dos, en ese orden.

## 2. Esquema y migración

**Una migración**, que genera `npm run db:generate` desde el esquema:
`drizzle/0017_membership_account_link.sql`. Si el MCP (ADR 0026) mergea antes
una migración, el número es el siguiente: se genera después de rebasar.

```ts
// En `membership`, después de `weekStart`:
/**
 * D-E2b-2: la vinculación que pidió el owner; la usa el próximo ingreso con el
 * correo de la persona mientras esté vigente (D-E2b-3, D-E2b-11). Columnas de
 * `team` (ADR 0025).
 */
accountLinkRequestedAt: timestamp("account_link_requested_at", { withTimezone: true }),
accountLinkRequestedById: text("account_link_requested_by_id").references(() => user.id, {
  onDelete: "set null",
}),
// En la lista de restricciones:
check(
  "membership_account_link_active",
  sql`${table.accountLinkRequestedAt} is null or ${table.status} = 'active'`,
),
```

- **Sin relleno**: ninguna membresía nace con la marca; la pide el owner.
- **Una instancia vieja** no nombra las columnas (`select()` nombra las de su
  esquema), así que la migración corre antes del push sin romper nada.
- **La reversión** es una migración hacia adelante que borra el `check` y las
  columnas (§6.6).
- **`user`, `account` y `session` no cambian**: son de Better Auth y las
  regenera `npm run auth:schema`. Por eso no se suma un índice único por
  `(provider_id, account_id)`: lo cuida `googleAccountOwnerOf` (D-E2b-3) y la
  consulta 3 de §6.1.

## 3. Permisos

**Dos acciones nuevas**, en la unión `Action` y en sus dos tablas:

| Acción               | Recurso              | Roles       | Se consulta                                                                             |
| -------------------- | -------------------- | ----------- | --------------------------------------------------------------------------------------- |
| `team.account.link`  | `MembershipResource` | `["owner"]` | pedir, renovar o cancelar una vinculación; reactivar a una persona sin cuenta (D-E2b-5) |
| `team.email.release` | `MembershipResource` | `["owner"]` | liberar el correo de una inactiva                                                       |

Con comentarios como el de `team.admin.setStatus`:

- `team.account.link`: «D-E2b-4, ADR 0027: solo el owner pide que el próximo
  ingreso con el correo de una persona quede atado a su fila. Se consulta para
  pedir, renovar o cancelar una vinculación y para reactivar a quien no tiene
  cuenta.».
- `team.email.release`: «D-E2b-4, D-E2b-9: solo el owner libera el correo de
  una persona inactiva.».

**El ingreso no pasa por `can()`** (ADR 0024): `bindRequestedAccount` no tiene
actor de sesión, y la decisión ya la tomó el owner al pedir la vinculación.

## 4. Contrato

### 4.1 La regla (`src/server/access.ts`)

Sigue pura.

```ts
/** D-E2b-11: los días que vale una vinculación desde que se pide. */
export const ACCOUNT_LINK_TTL_DAYS = 7;

export type EntryFacts = {
  readonly bootstrap: boolean;
  readonly invitation: InvitationStatus | null;
  readonly membership: MembershipStatus | null;
  /**
   * D-E2b-3: si la membresía de `membership` tiene una marca vigente
   * (D-E2b-11). `false` sin membresía o con más de una fila `user` con ese correo.
   */
  readonly accountLink: boolean;
};

/**
 * D-E2b-3: si el ingreso intenta usar la vinculación: la regla deja entrar por
 * una membresía activa con una marca vigente.
 */
export function usesAccountLink(decision: AccessDecision, facts: EntryFacts): boolean;

/**
 * D-E2b-10: los códigos del callback de Better Auth que `/login` explica. No son
 * motivos de la regla de ingreso.
 */
export const callbackErrorMessage: Readonly<Record<"account_not_linked", string>>;
```

- `NO_ENTRY_FACTS` suma `accountLink: false`.
- `callbackErrorMessage.account_not_linked`: EQ-122, «Ya hay una persona en
  Clock con ese correo. Pedile al propietario del workspace que revise tu
  acceso.».
- `loginErrorMessage(code)`: un motivo, su texto; `account_not_linked`, el de
  `callbackErrorMessage`; cualquier otro —también `vinculacion_fallida`—, el
  genérico. Nunca devuelve el parámetro.
- Las demás funciones no cambian.

### 4.2 El ingreso (`src/server/entry.ts`, `src/server/auth.ts`)

```ts
/**
 * D-E2b-3: los códigos con que el ingreso desde el perfil vuelve a `/login`.
 * `vinculacion_fallida` no es un motivo de la regla: `/login` muestra el genérico.
 */
export type EntryDenialCode = AccessDenialReason | "vinculacion_fallida";

export type ProfileEntryDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: EntryDenialCode };

/**
 * D-E1b-1, D-E2b-3: el ingreso desde el perfil de Google. Decide la regla
 * primero; si deja entrar por una membresía activa con una marca vigente, usa
 * la vinculación antes de devolver. `inactive` responde `membresia_inactiva`; un
 * error se registra y responde `vinculacion_fallida`, sin escribir.
 */
export async function decideProfileEntry(
  profile: GoogleProfile & { readonly sub: string },
): Promise<ProfileEntryDecision>;

/** D-E2b-3: lo que hizo `bindRequestedAccount`. */
export type AccountLinkOutcome = "linked" | "skipped" | "inactive";

/**
 * D-E2b-3: en una transacción, si `sub` no es la cuenta de ninguna fila,
 * `claimAccountLink` (team) toma la marca del correo y `bindGoogleAccount`
 * deja `sub` como la única cuenta de la persona. Devuelve `skipped` si `sub` ya
 * tiene cuenta o si `claimAccountLink` devuelve `none`, e `inactive` si devuelve
 * `inactive`; los dos sin escribir. `email` ya normalizado. Lanza si la base
 * falla; no atrapa.
 */
export async function bindRequestedAccount(
  email: string,
  sub: string,
): Promise<AccountLinkOutcome>;

/** D-E1a-14: `<BETTER_AUTH_URL>/login?error=<código>`, absoluta. */
export function loginErrorUrl(reason: EntryDenialCode): string;
```

- `sessionEntryError` sigue recibiendo un `AccessDenialReason`: el gancho de
  sesión no vincula.
- `GoogleProfile` de `access.ts` no cambia: el `sub` no es parte de la regla.
- **El `try` envuelve solo `bindRequestedAccount`**: un error al leer los hechos
  sigue como hoy.
- **`auth.ts`**: `mapProfileToUser` pasa `sub: profile.sub`. El comentario suma
  que, con una marca vigente, la decisión escribe la cuenta antes de que Better
  Auth la busque, y que un error de esa escritura vuelve como un código
  (D-E2b-3). Nada más cambia.

### 4.3 Las tablas de Better Auth (`src/server/auth-records.ts`)

```ts
/** D-E2b-3: el `user_id` dueño de la cuenta de Google `sub`, o `null`. Solo lee. */
export async function googleAccountOwnerOf(
  tx: Transaction,
  sub: string,
): Promise<string | null>;

/**
 * D-E2b-3, ADR 0025: deja la cuenta de Google `sub` como la única de
 * `person.userId`. Borra sus otras filas de `account` y sus sesiones
 * (`deleteSessionsOf`, con `person` como autor), inserta la de `sub` sin tokens
 * —los escribe Better Auth en el mismo ingreso— y deja `account.link` (`entity:
 * "user"`, `entityId: userId`, `previousValue: { accounts: n }`) con `person`
 * como autor. No consulta permisos: la usa `bindRequestedAccount`, con la
 * membresía ya bloqueada.
 */
export async function bindGoogleAccount(
  tx: Transaction,
  person: Actor,
  sub: string,
): Promise<void>;

/** D-E2b-6, D-E2b-9: el correo guardado de `userId`, tal como está. Solo lee. */
export async function userEmailOf(tx: Transaction, userId: string): Promise<string>;

/**
 * D-E2b-9, ADR 0025: cambia el correo de `userId` por `releasedEmailOf(userId)`,
 * borra sus filas de `account` y sus sesiones (`deleteSessionsOf`), y deja
 * `user.releaseEmail` (`entity: "user"`, `previousValue: { email, accounts: n }`,
 * `nextValue: { email: <liberado> }`) con `actor` como autor. No consulta
 * permisos: la usa `releaseEmail` de `team`, que ya los decidió.
 */
export async function releaseEmailOf(
  tx: Transaction,
  actor: Actor,
  userId: string,
): Promise<void>;
```

- **La fila de `account`** que inserta `bindGoogleAccount`: `id` con
  `randomUUID()`, `providerId: "google"`, `accountId: sub`, `userId`, y
  `createdAt` y `updatedAt` explícitos, porque `updated_at` no tiene valor por
  omisión (`auth-schema.ts:53-55`). Ningún token.
- **Con el MCP en `main`**, `bindGoogleAccount` y `releaseEmailOf` llaman a
  `deleteGrantsOf(tx, actor, userId)` después de `deleteSessionsOf`, y su
  comentario lo dice (§1, «El MCP, en paralelo»).
- **`userEmailOf`** lanza si la fila no existe: la membresía bloqueada la
  garantiza (`on delete cascade`).
- El audit nunca guarda tokens ni ids de cuenta: solo cantidades y correos.

### 4.4 Correos liberados (`src/lib/email.ts`)

```ts
/** D-E2b-9: el dominio de un correo liberado. `.invalid` no se resuelve (RFC 2606). */
export const RELEASED_EMAIL_DOMAIN = "liberado.invalid";

/** D-E2b-9: el correo que reemplaza al de `userId` al liberarlo: `<userId>@liberado.invalid`. */
export function releasedEmailOf(userId: string): string;

/** D-E2b-9: si el correo es uno liberado, sin distinguir mayúsculas ni blancos. */
export function isReleasedEmail(email: string): boolean;
```

### 4.5 `workspace` (`service.ts`, `repository.ts`)

```ts
/**
 * D-E2b-3: el id del workspace del ingreso, el más viejo (ADR 0024, decisión 3),
 * o `null`. Solo lee, con `tx` (ADR 0010).
 */
export async function entryWorkspaceIdOf(tx: Transaction): Promise<string | null>;

/**
 * D-E2b-8, ADR 0025: deja `email` registrado como externo, con una invitación
 * `accepted`, si es de fuera de los dominios y no tiene una `pending` o
 * `accepted`: inserta la fila, o pasa una `revoked` a `accepted`, y deja
 * `invitation.register` con `actor`. Si no, no escribe. No se deshace al cancelar
 * la vinculación. No consulta permisos: la usa `team` al pedir una vinculación.
 * Devuelve si escribió.
 */
export async function registerExternalMember(
  tx: Transaction,
  actor: Actor,
  email: string,
): Promise<boolean>;
```

- **`entryFacts`** suma `accountLink`, en la misma sentencia: `true` si hay una
  sola fila `user` con ese correo normalizado y su membresía en el workspace
  tiene una marca vigente según `now()` (D-E2b-11, con `ACCOUNT_LINK_TTL_DAYS`
  de `@/server/access`). Solo decide si el ingreso intenta; la vigencia final la
  decide `claimAccountLink`. `entryFactsOf` lo pasa a `EntryFacts`.
- **`entryMembershipStatusLocked`** usa `entryWorkspaceIdOf`, sin cambiar lo que
  devuelve.
- `registerExternalMember` bloquea la fila de `invitation` del correo
  (`lockInvitationsByEmail`, que ya existe) antes de decidir, y escribe con
  `email` normalizado (el `check` de `invitation` lo exige). La invitación
  `accepted` lleva `accepted_at` y `invited_by_id`; una `revoked` que pasa a
  `accepted` deja `revoked_at` y `revoked_by_id` en nulo (los `check` de
  `schema.ts:222-229`).

### 4.6 Esquemas (`src/modules/team/schema.ts`)

```ts
/** D-E2b-6: pedir o renovar (`true`), o cancelar (`false`), una vinculación. */
export const setAccountLinkInput = z.object(
  {
    membershipId: z.uuid({ error: teamMessages.notFound }),
    link: z.boolean({ error: teamMessages.linkUnavailable }),
  },
  { error: teamMessages.linkUnavailable },
);
export type SetAccountLinkInput = z.infer<typeof setAccountLinkInput>;

/** Si quedó una marca vigente, también si ya estaba así. */
export type SetAccountLinkResult = {
  readonly membershipId: string;
  readonly linkPending: boolean;
};

/** D-E2b-9. */
export const releaseEmailInput = z.object(
  { membershipId: z.uuid({ error: teamMessages.notFound }) },
  { error: teamMessages.notFound },
);
export type ReleaseEmailInput = z.infer<typeof releaseEmailInput>;
export type ReleaseEmailResult = { readonly membershipId: string };

export type TeamErrorCode =
  | ActionErrorCode
  | "role_locked"
  | "inactive_membership"
  | "status_locked"
  | "active_membership"
  | "email_released";
```

**`teamMember`** cambia:

```ts
/** D-E2b-9: `null` si se liberó; la fila muestra «Correo liberado». */
email: z.string().nullable(),
/** D-E2b-2, D-E2b-11: la marca, con su pedido, su vencimiento y si ya venció; `null` sin marca. */
link: z
  .object({ requestedAt: z.date(), expiresAt: z.date(), expired: z.boolean() })
  .nullable(),
/**
 * D-E2b-6: lo que el menú ofrece sobre la vinculación, si `can()` deja
 * `team.account.link` en una activa: `["request"]` sin marca, `["cancel"]` con
 * una vigente, `["request", "cancel"]` con una vencida; `[]` sin control.
 */
linkActions: z.array(z.enum(["request", "cancel"])),
/** D-E2b-8: si pedir la vinculación registra el correo como externo. */
registersExternal: z.boolean(),
/** D-E2b-9: si se ofrece «Liberar el correo». */
canReleaseEmail: z.boolean(),
```

y los comentarios de `hasAccount` y `statusChange` dicen: «`reactivate` en una
inactiva con cuenta, o sin cuenta con `team.account.link` (D-E2b-5); nunca en una
con el correo liberado». El `ready` de **`teamView`** suma `linkTtlDays`, el
valor de `ACCOUNT_LINK_TTL_DAYS`, para los textos de §5.4.

**`teamMessages`** cambia `noAccount` y suma:

| Clave               | Texto                                                                        | Fuente |
| ------------------- | ---------------------------------------------------------------------------- | ------ |
| `noAccount`         | «Solo el propietario reactiva a una persona sin cuenta de Google vinculada.» | EQ-114 |
| `linkOwnerOnly`     | «Solo el propietario vincula una cuenta de Google.»                          | EQ-117 |
| `linkInactive`      | «Esa persona está desactivada: reactivala para vincular su cuenta.»          | EQ-118 |
| `releaseOwnerOnly`  | «Solo el propietario libera un correo.»                                      | EQ-119 |
| `releaseActive`     | «Desactivá a esa persona antes de liberar su correo.»                        | EQ-120 |
| `emailReleased`     | «El correo de esa persona se liberó: no se puede reactivar ni vincular.»     | EQ-121 |
| `linkUnavailable`   | «Esa vinculación no está disponible.»                                        | propio |
| `unexpectedLink`    | «No se pudo cambiar la vinculación. Revisá la conexión y volvé a intentar.»  | TT-89  |
| `unexpectedRelease` | «No se pudo liberar el correo. Revisá la conexión y volvé a intentar.»       | TT-89  |

**`TeamActions`** suma `setAccountLink` y `releaseEmail`, con la forma de
`changeStatus`.

### 4.7 Repository (`src/modules/team/repository.ts`)

- **`listMembers`** suma `linkRequestedAt`, `linkExpiresAt` y `linkExpired`,
  calculados en la sentencia con `now()` y `ACCOUNT_LINK_TTL_DAYS` (D-E2b-11), y
  `invitationStatus`, el estado de la invitación del correo normalizado en el
  workspace, con un `left join` (ADR 0010: se muestra). `email` sigue siendo el
  de `user`; el service lo pasa a `null` si es uno liberado.
- **`lockForChange`** suma `linkPending` (hay marca, vigente o vencida) y
  `linkValid` (vigente según `now()`) a `LockedMembership`. `setAccountLink` los
  usa para decidir entre «ya está», renovar o cancelar: ahí no importa la hora
  del momento, porque el peor caso es renovar una marca que venció hace
  instantes.
- **`usersByEmail(tx, email)`**, nueva: los `id` de las filas `user` cuyo
  `lower(btrim(email))` es `email`, sin bloqueo. Parte de `user`, como la
  subconsulta de `entryFacts` (`workspace/repository.ts:356-363`).
- **`lockMembershipOf(tx, workspaceId, userId)`**, nueva: la membresía de ese
  `user_id` en el workspace, con `id`, `role`, `status` y `linkValid` (solo
  para describir), `for no key update`. `undefined` si no tiene.
- **`consumeAccountLink(tx, membershipId, ttlDays)`**, nueva: la sentencia de
  D-E2b-3, paso 2, con `clock_timestamp()`. Devuelve `{ requestedById: string |
null }` si limpió la marca, o `undefined` si no había una vigente en ese
  momento.
- **`updateAccountLink(tx, workspaceId, membershipId, requestedById: string |
null)`**, nueva: con un id, `account_link_requested_at = now()` y
  `account_link_requested_by_id`; con `null`, las dos en nulo. La sentencia de
  §6.8 no pasa por acá: es SQL a mano.

`lockByEmail`, que la versión anterior del contrato nombraba, no existe: contaba
membresías en lugar de filas `user`, y no se puede bloquear el lado nulable de
un `left join`.

### 4.8 Service (`src/modules/team/service.ts`)

```ts
/** D-E2b-6. */
export async function setAccountLink(
  actor: Actor,
  input: SetAccountLinkInput,
): Promise<SetAccountLinkResult>;

/** D-E2b-9. */
export async function releaseEmail(
  actor: Actor,
  input: ReleaseEmailInput,
): Promise<ReleaseEmailResult>;

/** D-E2b-3: lo que `claimAccountLink` leyó y escribió. */
export type ClaimedAccountLink =
  | { readonly kind: "claimed"; readonly person: Actor }
  | { readonly kind: "inactive" }
  | { readonly kind: "none" };

/**
 * D-E2b-3, ADR 0025: toma la marca vigente del `user` cuyo correo normalizado es
 * `email`, en el workspace del ingreso. Con más de una fila `user`, ninguna o una
 * sin membresía, `none` sin bloquear. Con una, bloquea su membresía `for no key
 * update`: no activa, `inactive`; activa, intenta limpiar la marca con
 * `consumeAccountLink`, que decide la vigencia con la hora del momento; si la
 * limpió, deja `membership.linkUse` con la persona como autora y `nextValue: {
 * requestedById }` y devuelve `claimed`; si no, `none`. `inactive` y `none` no
 * escriben. No consulta permisos: la usa `entry.ts` en el ingreso, sin sesión.
 */
export async function claimAccountLink(
  tx: Transaction,
  email: string,
): Promise<ClaimedAccountLink>;
```

- **`setAccountLink`**: antes de la transacción, `canManageTeam(actor)`; si no,
  `forbidden` con `forbiddenAction`. En la transacción, `lockForChange`,
  `freshActorOf` y los pasos de D-E2b-6, con `userEmailOf` para el paso 6 y
  `registerExternalMember` antes de `updateAccountLink`. Constancias, con quien
  actúa como actor: `membership.linkRequest` (`previousValue: {
linkRequestedAt: <anterior o null> }`, `nextValue: { linkRequestedAt: <nueva>
}`) y `membership.linkCancel` (`previousValue: { linkRequestedAt }`,
  `nextValue: { linkRequestedAt: null }`).
- **`releaseEmail`**: la misma entrada; los pasos de D-E2b-9 con `userEmailOf` e
  `isReleasedEmail`, y `releaseEmailOf(tx, actor, target.userId)`.
- **`changeStatus`**: el paso 8 de D-E2-3 pasa a ser, para reactivar: 8. correo liberado (`userEmailOf`, `isReleasedEmail`): `email_released`; 9. sin cuenta (`hasAccount`) y sin `team.account.link` con la autoridad
  releída: `forbidden` con `noAccount`; 10. escribe (`writeStatus`) y, si no tenía cuenta, `registerExternalMember` y
  `updateAccountLink` con quien actúa, con `membership.linkRequest`.
- **`writeStatus`**, al desactivar: si la fila tiene `linkPending`,
  `updateAccountLink(…, null)` y `membership.linkCancel` **antes** de
  `updateStatus` (D-E2b-7).
- **`claimAccountLink`**: `entryWorkspaceIdOf(tx)`; sin workspace, `none`.
  `usersByEmail`; con otra cantidad que una, `none`. `lockMembershipOf`; sin
  membresía, `none`; no `active`, `inactive`. `consumeAccountLink`; sin fila,
  `none`; con una, la constancia y `claimed` con el `Actor` (`status:
"active"`).
- **`getTeamView`**: cada fila suma `email` (`null` si `isReleasedEmail`),
  `link`, `linkActions` (`linkActionsOf`), `registersExternal` y
  `canReleaseEmail` (`releaseOf`):
  - `linkActionsOf(actor, row)`: `[]` si no está activa o si
    `can(actor, "team.account.link", recurso)` no deja; si no, según la marca
    (§4.6). La fila propia del owner la tiene.
  - `registersExternal`: el correo no es de `GOOGLE_WORKSPACE_DOMAINS`
    (`isCompanyEmail`) y `invitationStatus` no es `pending` ni `accepted`.
  - `releaseOf(actor, row)`: inactiva, con el correo sin liberar y
    `can(actor, "team.email.release", recurso)`.
  - `statusChangeOf`: una inactiva con el correo liberado no tiene
    `reactivate`; una sin cuenta, solo con `team.account.link`.
- **Importa** `registerExternalMember` y `entryWorkspaceIdOf` de `workspace`,
  `userEmailOf` y `releaseEmailOf` de `auth-records`, `ACCOUNT_LINK_TTL_DAYS` de
  `@/server/access` (el repository y la vista) e `isReleasedEmail` e
  `isCompanyEmail` de `@/lib/email`. Las dependencias siguen en una dirección:
  `entry.ts` → `team` → `time-entry` → `workspace`; ni `team` ni `workspace`
  importan `entry.ts` ni `auth.ts` (ADR 0025).

### 4.9 Actions (`src/modules/team/actions.ts`)

```ts
export async function setAccountLink(
  input: SetAccountLinkInput,
): Promise<ActionResult<SetAccountLinkResult, TeamErrorCode>>;
// handle(…, { paths, messages: { forbidden: forbiddenAction, unexpected: unexpectedLink } })

export async function releaseEmail(
  input: ReleaseEmailInput,
): Promise<ActionResult<ReleaseEmailResult, TeamErrorCode>>;
// handle(…, { paths, messages: { forbidden: forbiddenAction, unexpected: unexpectedRelease } })
```

Las dos revalidan `/` como layout, como `changeStatus` (D-E2-11).

### 4.10 Las respuestas

| Situación                                                      | Código                             | Mensaje                                | Reintentar |
| -------------------------------------------------------------- | ---------------------------------- | -------------------------------------- | ---------- |
| Pidió, renovó, canceló o liberó                                | ok                                 | —                                      | —          |
| Ya estaba así                                                  | ok, sin escribir                   | —                                      | —          |
| Id que no está, de otro workspace o `invited`                  | `not_found`                        | EQ-82                                  | no         |
| Id que no es uuid, o `link` que no es booleano                 | `validation`                       | EQ-82 o `linkUnavailable`              | no         |
| Sin `team.manage`, o lo perdió bajo el bloqueo                 | `forbidden`                        | EQ-90                                  | no         |
| Un admin pide o cancela una vinculación                        | `forbidden`                        | EQ-117                                 | no         |
| Un admin reactiva a una persona sin cuenta                     | `forbidden`                        | EQ-114                                 | no         |
| Un admin libera un correo                                      | `forbidden`                        | EQ-119                                 | no         |
| Pedir la vinculación de una inactiva                           | `inactive_membership`              | EQ-118                                 | no         |
| Liberar el correo de una activa, también la propia             | `active_membership`                | EQ-120                                 | no         |
| Reactivar o pedir la vinculación de una con el correo liberado | `email_released`                   | EQ-121                                 | no         |
| Red o servidor                                                 | `unexpected`                       | `unexpectedLink` o `unexpectedRelease` | sí         |
| Cuenta de Google nueva con un correo en uso, sin marca vigente | `/login?error=account_not_linked`  | EQ-122                                 | —          |
| El ingreso pierde la carrera con una desactivación             | `/login?error=membresia_inactiva`  | EQ-92                                  | —          |
| La vinculación falla antes de confirmar                        | `/login?error=vinculacion_fallida` | el genérico                            | sí         |

## 5. Pantalla

### 5.1 La página (`src/app/(app)/equipo/page.tsx`)

Pasa a `TeamScreen` las seis actions: las cuatro de E2, `setAccountLink` y
`releaseEmail`. Nada más cambia.

### 5.2 La fila de una persona

- **El correo**: el de la vista, o, si es `null`, «Correo liberado» en gris.
- **La nota debajo del correo**, en gris, la primera que corresponda. Las
  fechas, con el formato de fecha de quien mira (PF-12):
  - marca vigente, sin cuenta: «Vinculación pedida el {pedido}, vence el
    {vencimiento}: falta su primer ingreso con Google.»;
  - marca vigente, con cuenta: «Vinculación pedida el {pedido}, vence el
    {vencimiento}: la próxima cuenta de Google nueva con este correo reemplaza a
    la actual.»;
  - marca vencida: «La vinculación pedida el {pedido} venció el
    {vencimiento}.»;
  - sin cuenta y con el correo sin liberar: «Sin cuenta de Google vinculada.»
    (D-E2-7, sin cambio).

  Una fila liberada no tiene nota: «Correo liberado» ya lo dice.

### 5.3 El menú

`MemberActionsMenu` pasa a recibir la lista de entradas de la fila, en este
orden, y la fila sin ninguna no tiene menú (D-E2-9):

1. «Desactivar» o «Reactivar» (`statusChange`, E2).
2. Por `linkActions`: `request` es «Vincular otra cuenta de Google» con cuenta,
   «Vincular una cuenta de Google» sin cuenta y «Volver a pedir la vinculación»
   con una marca vencida; `cancel` es «Cancelar la vinculación».
3. «Liberar el correo» (`canReleaseEmail`).

La lista sale de una función pura de `team-members-model.ts`
(`menuEntriesOf(member)`). Con lo que deja `can()` hoy, el owner ve el menú en su
propia fila, con «Vincular otra cuenta de Google»; un admin no ve ninguna
entrada nueva.

### 5.4 Las confirmaciones

Con la forma de la de desactivar (`deactivate-dialog.tsx`): cierran al
confirmar, mandan el pedido y devuelven el foco al menú de la fila. `{días}` es
`linkTtlDays` de la vista: el componente no importa `@/server/access`.

- **«Reactivar» sin cuenta**, **«Vincular una cuenta de Google»** y **«Volver a
  pedir la vinculación»** sin cuenta (`link-account-dialog.tsx`, nuevo): título
  «¿Reactivar a {nombre}?» o «¿Vincular una cuenta de Google a {nombre}?»; texto
  «En los próximos {días} días, la próxima cuenta de Google que entre con
  {correo} va a quedar vinculada a {nombre}, con su rol y sus horas. Hacelo solo
  si ese correo sigue siendo suyo.»; botones «Cancelar» y «Reactivar» o
  «Vincular».
- **«Vincular otra cuenta de Google»** y **«Volver a pedir la vinculación»** con
  cuenta (el mismo diálogo): título «¿Vincular otra cuenta de Google a
  {nombre}?»; texto «En los próximos {días} días, la próxima cuenta de Google
  nueva que entre con {correo} va a reemplazar a la actual, con el rol y las
  horas de {nombre}. Hasta entonces, la cuenta actual sigue entrando. Hacelo
  solo si ese correo sigue siendo suyo.»; botones «Cancelar» y «Vincular».
- **Con `registersExternal`**, el diálogo suma un párrafo (D-E2b-8): «{correo}
  queda registrado como invitado externo, y sigue registrado aunque después
  canceles la vinculación o venza. Si {nombre} ya tiene una cuenta de Google
  vinculada, vuelve a entrar con ella desde ahora.».
- **«Liberar el correo»** (`release-email-dialog.tsx`, nuevo): título
  «¿Liberar el correo de {nombre}?»; texto «{correo} deja de ser de {nombre} y
  lo vas a poder invitar para otra persona. {nombre} queda inactiva, con sus
  horas, y no va a poder volver a entrar ni reactivarse. No se puede deshacer.»;
  botones «Cancelar» y «Liberar el correo» (`destructive`).
- **«Cancelar la vinculación»** y **«Reactivar» con cuenta** no confirman.

### 5.5 Los avisos

En el aviso de la tabla (`status`), como E2:

- Éxito: «Reactivaste a {nombre}. Su cuenta de Google se vincula en su próximo
  ingreso.» (reactivar sin cuenta); «Pediste vincular una cuenta de Google a
  {nombre}.» (también al renovar); «Cancelaste la vinculación de {nombre}.»;
  «Liberaste el correo de {nombre}.».
- Error: «No se pudo vincular una cuenta de Google a {nombre}.», «No se pudo
  cancelar la vinculación de {nombre}.» o «No se pudo liberar el correo de
  {nombre}.», con el mensaje del resultado; con `unexpected`, «Reintentar»
  (TT-89).
- **La fila se queda** con su estado nuevo aunque el filtro ya no la incluya
  (EQ-11), y el foco va a su menú si lo tiene, y si no a su encabezado de fila
  (§5.4 de E2).
- **Un pedido a la vez en la tabla**: con cualquier pedido en vuelo, los botones
  de rol, de revocar y los menús quedan en `aria-disabled` (§5.4 de E2).

### 5.6 Textos (`team/components/labels.ts`)

Suma los rótulos de §5.2 a §5.5: `releasedEmail`, `linkPendingFirst`,
`linkPendingReplace`, `linkExpired`, `requestLink`, `requestOtherLink`,
`renewLink`, `cancelLink`, `releaseEmail`, los de los dos diálogos con el
párrafo del externo, los cuatro de éxito y los tres de error. `intro` suma «Solo
el propietario vincula una cuenta de Google y libera un correo.». Los mensajes de
error salen de `teamMessages`.

## 6. La transición en producción

Hechos que el contrato da por dados: Vercel despliega `main` a producción en
cada push y el build no corre migraciones; las migraciones las corre el usuario
con `!` antes del push del merge que las necesita. E2 está en producción. **E2b
trae una migración** (§2). La consulta de producción del 2026-10-19 dio **diez
membresías activas, todas con cuenta, y tres inactivas sin cuenta**, las que
creó la importación.

Todo correo, como `lower(btrim(email))` (D-E1b-1).

### 6.1 La consulta previa

La corre el usuario en producción, con `!`, antes de migrar.

```sql
-- 1. Las membresías sin cuenta de Google: las que E2b deja volver.
with ws as (select id from workspace order by created_at, id limit 1)
select lower(btrim(u.email)) as correo,
       u.email <> lower(btrim(u.email)) as correo_sin_normalizar,
       m.role as rol, m.status as estado,
       (select count(*) from time_entry t
         where t.workspace_id = m.workspace_id and t.user_id = m.user_id) as entradas,
       (select i.status from invitation i
         where i.workspace_id = m.workspace_id and i.email = lower(btrim(u.email))) as invitacion
from membership m
join ws on ws.id = m.workspace_id
join "user" u on u.id = m.user_id
where not exists (select 1 from account a where a.user_id = u.id)
order by m.status, correo;

-- 2. Tiene que dar cero filas: dos `user` con el mismo correo normalizado.
select lower(btrim(email)) as correo, count(*) as filas
from "user"
group by 1
having count(*) > 1;

-- 3. Tiene que dar cero filas: una cuenta de Google en dos filas.
select provider_id, account_id, count(*) as filas
from account
group by 1, 2
having count(*) > 1;
```

Lo esperado: la 1 con las tres inactivas, ninguna activa, y en cada una
`entradas` mayor que cero; la 2 y la 3, vacías. Qué se hace si no:

- **Una fila de la 1 con un correo de fuera de los dominios** y `invitacion`
  nula: no frena. Reactivarla la registra como externa (D-E2b-8), y el diálogo
  lo avisa.
- **`correo_sin_normalizar` verdadero**: no frena. La vinculación compara el
  correo normalizado y escribe la cuenta antes de que Better Auth busque por
  correo, así que entra igual. Se anota.
- **Una activa en la 1**: no frena. No puede entrar hoy y E2b no la abre sola:
  el owner le pide la vinculación desde la fila (D-E2b-6).
- **Una fila en la 2**: esa persona no se puede vincular (D-E2b-12). Se resuelve
  a mano antes de reactivarla, y no frena el despliegue.
- **Una fila en la 3**: ya rompe hoy el ingreso de esa cuenta
  (`internal-adapter.mjs:555`). Se borra la fila repetida a mano; no frena.

### 6.2 La migración

El usuario corre `npm run db:migrate` contra producción con `!`, como en las
migraciones anteriores. Control, después de migrar:

```sql
-- Las dos columnas, nulables, y el check.
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'membership' and column_name like 'account_link%'
order by column_name;

select conname from pg_constraint where conname = 'membership_account_link_active';

-- Cero: nadie tiene una marca todavía.
select count(*) from membership where account_link_requested_at is not null;
```

Lo esperado: `account_link_requested_at` (`timestamp with time zone`) y
`account_link_requested_by_id` (`text`), las dos `YES`; el `check`; cero. La
versión vieja sigue atendiendo: no nombra las columnas.

### 6.3 El despliegue

1. La consulta de §6.1 y la migración de §6.2, con su control.
2. **El merge y el push**: el team-lead mergea E2b en `main` y pushea; Vercel
   despliega.

Mientras Vercel cambia de versión, una instancia vieja que desactive a una
persona a la que la nueva le acaba de pedir una vinculación choca con el `check`
y responde `unexpected`; reintentar en la versión nueva funciona. Pide que el
owner pida una vinculación en esos segundos.

### 6.4 La verificación de humo

1. **El owner entra a `/equipo?estado=inactivas`**: cada una de las tres tiene
   «Sin cuenta de Google vinculada.» y un menú con «Reactivar» y «Liberar el
   correo». No elige nada.
2. **Su propia fila** tiene un menú con «Vincular otra cuenta de Google». No lo
   elige.
3. **En una ventana privada, sin sesión**, `/login?error=account_not_linked`
   muestra EQ-122. Antes mostraba el genérico: el texto nuevo confirma que el
   código desplegado es el de E2b.

### 6.5 La primera reactivación

Es el uso real, y lo hace el owner cuando quiera, con una persona a la vez:

1. **Confirma con la persona** que la dirección sigue siendo suya y que va a
   entrar en los próximos siete días.
2. **La reactiva** desde «Inactivas» y confirma el diálogo.
3. **La persona entra con Google** con esa dirección.

Control, antes y después del paso 3, con el correo de la persona:

```sql
with ws as (select id from workspace order by created_at, id limit 1)
select m.id as membresia, u.id as usuario, m.status as estado,
       m.account_link_requested_at as vinculacion_pedida,
       m.account_link_requested_at > now() - make_interval(days => 7) as vigente,
       (select count(*) from account a where a.user_id = u.id) as cuentas,
       (select count(*) from session s where s.user_id = u.id) as sesiones,
       (select count(*) from time_entry t
         where t.workspace_id = m.workspace_id and t.user_id = m.user_id) as entradas
from membership m
join ws on ws.id = m.workspace_id
join "user" u on u.id = m.user_id
where lower(btrim(u.email)) = '<correo>';

select action, actor_id, previous_value, next_value, created_at
from audit_log
where entity_id in ('<membresia>', '<usuario>')
order by created_at;
```

Lo esperado antes de que entre: `active`, `vinculacion_pedida` con fecha,
`vigente` verdadero, cero cuentas, cero sesiones, las mismas `entradas` que en
§6.1, y `membership.reactivate` y `membership.linkRequest` con el owner como
actor (`invitation.register` sobre la invitación si es externa). Después:
`vinculacion_pedida` nula, una cuenta, al menos una sesión, las mismas
`entradas`, y `membership.linkUse` y `account.link` con la persona como actor.

Si la persona ve EQ-122 en lugar de entrar, entró con una cuenta cuyo correo no
es ese, su `sub` ya tenía cuenta, o la marca venció (`vigente` falso): la marca
sigue, y el owner la renueva si hace falta.

### 6.6 Reversión

Volver a desplegar E2, **conservando la migración en el diario**:

1. **La lista de lo que se pierde**: las marcas, que la reversión borra.

   ```sql
   select lower(btrim(u.email)) as correo, m.account_link_requested_at as pedida
   from membership m join "user" u on u.id = m.user_id
   where m.account_link_requested_at is not null;
   ```

2. **Limpiarlas**, porque el código de E2 desactivaría una membresía con la marca
   puesta y chocaría con el `check`:

   ```sql
   update membership
   set account_link_requested_at = null, account_link_requested_by_id = null
   where account_link_requested_at is not null;
   ```

3. **El revert, sin tocar `drizzle/`**, y push:

   ```
   git revert --no-commit -m 1 <merge de E2b>
   git checkout HEAD -- drizzle/
   git commit
   ```

   Sin el `checkout`, el revert borraría `0017_membership_account_link.sql` y su
   entrada de `drizzle/meta/_journal.json`, mientras la base ya la tiene
   aplicada: el diario y la base dejarían de coincidir, y la migración siguiente
   se generaría con el número de la `0017` (como §6.5 de E1b).

4. **Repetir la limpieza del paso 2 con el revert ya desplegado**: entre la
   primera limpieza y el despliegue, el owner pudo pedir una vinculación con la
   versión de E2b, y esa marca haría chocar con el `check` cualquier
   desactivación de E2. La consulta del paso 1 da cero después.
5. **La migración hacia adelante** que borra el `check` y las columnas,
   generada con `npm run db:generate` desde el esquema revertido —el diario
   conserva la `0017`, así que sale como la siguiente— y corrida con `!`.

**Lo que la reversión deja**: las cuentas ya vinculadas quedan, y son filas
válidas para E2 (la persona entra y se desactiva y reactiva como cualquiera).
Los correos liberados quedan liberados: la lista de E2 los muestra con
`<id>@liberado.invalid`, sin cuenta y sin «Reactivar» (D-E2-7). Las invitaciones
`accepted` que registró D-E2b-8 quedan; son las de un externo con membresía.

### 6.7 El script de importación y los correos liberados

El script (`ops/importar-clockify`) identifica a las personas por correo. Una
corrida después de liberar un correo no encuentra a la persona vieja por él: o
crea otra fila con ese correo, que lo vuelve a ocupar, o, si la persona nueva ya
entró, le carga las horas de Clockify de la anterior. **Antes de cada corrida**,
el usuario lista los correos liberados y los saca de `personas.json`:

```sql
select previous_value, created_at
from audit_log
where action = 'user.releaseEmail'
order by created_at;
```

Y **solo libera el correo de una persona cuya importación terminó**. Si el
usuario prefiere que el script lo resuelva solo, es la pregunta 4 de §11.

### 6.8 Una vinculación sin la aplicación

Si el owner perdió su cuenta de Google sin haber pedido una vinculación, nadie
puede pedirla desde la pantalla (D-E2b-4). Esta sentencia la escribe sobre una
membresía activa, con su constancia sin actor; la persona entra después, en los
siete días que siguen, con su cuenta nueva y la usa como cualquiera (D-E2b-3).
Sirve para cualquier persona activa, no solo para el owner.

```sql
with ws as (select id from workspace order by created_at, id limit 1),
target as (
  select m.id, m.workspace_id, m.account_link_requested_at as anterior
  from membership m
  join ws on ws.id = m.workspace_id
  join "user" u on u.id = m.user_id
  where lower(btrim(u.email)) = '<correo>'
    and m.status = 'active'
),
requested as (
  update membership m
  set account_link_requested_at = now(), account_link_requested_by_id = null
  from target
  where m.id = target.id
  returning m.id, m.workspace_id, target.anterior
)
insert into audit_log (workspace_id, actor_id, action, entity, entity_id, previous_value, next_value)
select workspace_id, null, 'membership.linkRequest', 'membership', id::text,
       json_build_object('linkRequestedAt', anterior)::text,
       json_build_object('linkRequestedAt', now())::text
from requested;
```

Lo esperado: una fila insertada en `audit_log`, con la fecha anterior o `null`
en `previous_value`. Cero filas: el correo no es el de una membresía activa. Si
ya había una marca, vigente o vencida, la renueva.

**Si el correo es de fuera de los dominios**, el ingreso pide además una
invitación abierta (D-E2b-8). Antes de la sentencia de arriba, el usuario mira
la invitación del correo y, si no hay ninguna `pending` o `accepted`, la
registra:

```sql
with ws as (select id from workspace order by created_at, id limit 1),
registered as (
  insert into invitation (workspace_id, email, status, invited_at, accepted_at)
  select ws.id, '<correo normalizado>', 'accepted', now(), now() from ws
  on conflict (workspace_id, email) do update
    set status = 'accepted', accepted_at = now(),
        revoked_at = null, revoked_by_id = null, updated_at = now()
    where invitation.status = 'revoked'
  returning id, workspace_id
)
insert into audit_log (workspace_id, actor_id, action, entity, entity_id, next_value)
select workspace_id, null, 'invitation.register', 'invitation', id::text,
       json_build_object('status', 'accepted')::text
from registered;
```

Una `pending` o `accepted` que ya existe no cambia (el `where` del `do update`) y
no deja constancia. Para un correo de los dominios no hace falta.

### 6.9 Previews y la base local

La rama `preview` de Neon necesita la migración de §2 antes de probar un preview
de E2b: el usuario la corre con `!` contra esa rama. La base local la recibe con
`npm run db:migrate`.

## 7. Reparto de archivos

### backend-dev

- La confirmación de §0 si `main` trae Better Auth 1.7.10, en el registro del
  slice.
- `src/server/db/schema.ts` y la migración generada (§2).
- `src/server/access.ts` y `access.test.ts` (§4.1).
- `src/server/entry.ts`, `auth.ts` (§4.2), `entry.integration.test.ts` y
  `auth.integration.test.ts` (§9.2).
- `src/server/auth-records.ts` y `auth-records.integration.test.ts` (§4.3).
- `src/lib/email.ts` y su test (§4.4).
- `src/server/permissions/index.ts` y `permissions.test.ts` (§3).
- `src/modules/workspace/service.ts`, `repository.ts` y
  `service.integration.test.ts` (§4.5).
- `src/modules/team/schema.ts`, `repository.ts`, `service.ts`, `actions.ts`,
  `schema.test.ts`, `service.integration.test.ts`,
  `actions.integration.test.ts` y `concurrency.integration.test.ts` (§4.6 a
  §4.9).
- `src/test/factories.ts`: `seedAccountLink(membershipId, requestedById, age)`,
  que escribe la marca con `now()` menos `age`, un intervalo de Postgres (`'8
days'`, `'7 days' - '5 seconds'`).
- `src/app/login/page.test.tsx`: los casos de `account_not_linked` y
  `vinculacion_fallida`.
- Con el MCP mergeado antes, la llamada a `deleteGrantsOf` (§1).
- La evidencia de los criterios 24 y 25 en el registro del slice
  (`docs/slices/correcciones-fase2-e2b-revisiones.md`).
- **Primero fija** `TeamMember`, `TeamView`, `SetAccountLinkInput`,
  `SetAccountLinkResult`, `ReleaseEmailInput`, `ReleaseEmailResult`,
  `TeamErrorCode`, `teamMessages`, `TeamActions` y `callbackErrorMessage`, y
  avisa a `frontend-dev` y a `e2e-tester`.

### frontend-dev

- `src/app/(app)/equipo/page.tsx` (§5.1).
- **Toda `src/modules/team/components/`** (§5): `team-members.tsx`,
  `team-members-model.ts` (`menuEntriesOf`, las notas, los avisos),
  `member-actions-menu.tsx` (varias entradas), `labels.ts`, `team-screen.tsx`,
  los nuevos `link-account-dialog.tsx` y `release-email-dialog.tsx`, y los tests
  de componente y de modelo de todos ellos.

### e2e-tester

- `e2e/team-page.ts`: las entradas nuevas del menú, las notas de la fila,
  «Correo liberado», los dos diálogos y los avisos.
- `e2e/database.ts`: `accountLinkOf(email)` (si tiene la marca, si está vigente
  y quién la pidió), `seedExpiredAccountLink(email)`, `userEmailOfMember(name)`,
  `accountCountOf(userId)`.
- `e2e/team-link.spec.ts`, nuevo, con los recorridos de §9.3; confirma que
  fallan antes de la implementación.
- `team-status.spec.ts`, `team.spec.ts`, `invitations.spec.ts` y
  `entry.spec.ts` siguen en verde sin cambiar lo que afirman; los comentarios
  de `team-status.spec.ts` que dicen «ofrece solo Desactivar» se ajustan a las
  entradas nuevas.

### parity-analyst

- `equipo.md`:
  - **EQ-109**: deja de remitir a P-11; la misma persona con otra cuenta se
    resuelve con una vinculación (EQ-115) y otra persona con una dirección
    reciclada, liberando el correo (EQ-116) e invitándolo. El texto que ve la
    persona es neutro (EQ-122) porque el owner decide cuál corresponde.
  - **EQ-110**: lo resuelve E2b; el owner la reactiva y pide la vinculación
    (D-E2b-5).
  - **EQ-47**: reactivar a una persona sin cuenta pide confirmación y es solo del
    owner.
  - **EQ-114**: el texto nuevo, para el admin.
  - **EQ-22 o EQ-32**: una `accepted` también nace al pedir la vinculación de un
    externo sin invitación abierta, y queda (D-E2b-8).
  - **Nuevos**, `adaptar`, sin equivalente relevado en Clockify: EQ-115
    «Vincular una cuenta de Google» (regla, §5: la pide el owner, vence a los
    siete días, vale una vez); EQ-116 «Liberar el correo de una persona
    inactiva» (regla, §5); y en la §10, EQ-117 … EQ-121 con los textos de §4.6 y
    EQ-122 con el de §4.1, «Ya hay una persona en Clock con ese correo. Pedile
    al propietario del workspace que revise tu acceso.».
- `perfil.md`: **PF-47** (el rechazo termina en `/login` con EQ-122, no en la
  página de error de Better Auth, desde D-E1a-14 y E2b; el owner decide si
  vincula o libera); **P-11** pasa a cerrados con D-E2b-6, D-E2b-9 y D-E2b-10;
  **PF-48** sigue siendo una corrección a mano (D-E2b-12).
- El [mapa de la fase 2](fase2-mapa.md): la fila del ADR en la §4 nombra el
  0027, y «seis» pasa a «tres» donde habla de las inactivas importadas, con su
  nota fechada (consulta de producción del 2026-10-19): líneas 83, 337, 346,
  348, 701 y 723. Las «seis actions» de la línea 845 son otra cosa y quedan.

### Lo que no toca nadie

`report`, `project`, `profile`, `time-entry`, `src/server/session.ts`,
`src/server/test-session.ts`, `src/components/` y `src/app/` fuera de
`equipo/page.tsx` y del test de `/login`.

### Orden

1. `backend-dev`: la confirmación de §0, los tipos y textos de §4.1 y §4.6, y la
   migración.
2. En paralelo: `backend-dev` con el ingreso, `can()`, las funciones ajenas y el
   service; `frontend-dev` con la pantalla; `e2e-tester` con el arnés y el spec.
3. Las revisiones; correcciones; corrida final de e2e en una base nueva **y** en
   una que se reusa.

## 8. Criterios de aceptación

1. **Pedir la vinculación de una activa con cuenta** (D-E2b-6): el owner la
   pide; la membresía queda con la fecha y el owner como solicitante, y
   `membership.linkRequest`. Nada más cambia: la cuenta actual sigue entrando
   por el callback con su `sub`, y la marca queda.
2. **El ingreso la usa** (D-E2b-3), por `auth.handler`: con una marca vigente,
   un `sub` nuevo con ese correo termina en un 302 al `callbackURL` con una
   sesión de esa fila; la fila tiene una sola cuenta, la del `sub` nuevo; sus
   sesiones viejas se borraron; la marca está limpia; constan
   `membership.linkUse` y `account.link` (`{ accounts: 1 }`) con la persona
   como actor, y `session.revokeAll` con la cantidad; `user.email` no cambió.
   Con el MCP en `main`, la persona queda además sin autorizaciones de MCP.
3. **La regla va primero** (D-E2b-3, PF-47), por `auth.handler`: con una marca
   vigente en una fila del dominio, un perfil con ese correo y sin `hd` —una
   cuenta de consumo con el correo de la empresa— termina en
   `/login?error=dominio_no_habilitado`, sin ninguna `account` nueva y con la
   marca intacta; uno con `email_verified: false`, en `email_no_verificado`,
   igual. Falla si `bindRequestedAccount` se llama antes de
   `decideGoogleAccess`.
4. **Reactivar sin cuenta** (D-E2b-5): el owner reactiva a una inactiva sin
   cuenta; queda `active` con la marca, con `membership.reactivate` y
   `membership.linkRequest`. Un `sub` cualquiera con ese correo entra a esa
   fila, con sus entradas (mismo `user_id`, misma cantidad).
5. **Sin vinculación**: una activa sin cuenta y sin marca, con un `sub` nuevo,
   termina en `/login?error=account_not_linked`, sin cuenta ni sesión nuevas; lo
   mismo una con cuenta y un `sub` nuevo. `/login` muestra EQ-122.
6. **Vencida** (D-E2b-11): con una marca de hace ocho días, un `sub` nuevo
   termina en `account_not_linked` y la marca queda; con una de hace seis, se
   usa. **Una marca que vence mientras el ingreso espera el bloqueo no se usa**:
   sembrada con siete días menos unos segundos, con la membresía tomada por una
   barrera (`queueBehindBarrier`) hasta que pasa el vencimiento, el ingreso
   termina en `account_not_linked`, sin `account` nueva y con la marca intacta.
   La vista trae `link.expired` y `linkActions` `["request", "cancel"]`; pedirla
   de nuevo la renueva (fecha nueva, `membership.linkRequest` con la fecha
   anterior) y vuelve a servir.
7. **Solo una activa** (D-E2b-2, P-05): la base rechaza poner la marca en una
   inactiva; una inactiva sin cuenta que entra sigue viendo EQ-92 sin escribir.
8. **Cancelar** (D-E2b-6): limpia la marca, vigente o vencida, con
   `membership.linkCancel`; después, un `sub` nuevo termina en
   `account_not_linked`.
9. **Desactivar la cancela** (D-E2b-7): desactivar a una persona con la marca la
   limpia, con `membership.linkCancel` del que desactiva, y hace todo lo de
   D-E2-5.
10. **Quién** (D-E2b-4): un admin recibe `forbidden` con EQ-117 al pedir o
    cancelar, con EQ-114 al reactivar a una inactiva sin cuenta (sin escribir) y
    con EQ-119 al liberar; un member, EQ-90; el owner pide la vinculación de su
    propia fila; liberar el correo de una activa, también la propia, responde
    `active_membership` con EQ-120.
11. **Idempotencia** (EQ-97): pedir con una marca vigente, cancelar sin marca y
    liberar un correo ya liberado responden éxito sin escribir ninguna fila,
    tampoco de `audit_log`.
12. **Un `sub` con cuenta no se vincula** (D-E2b-3): con la marca en X, la cuenta
    de X con su `sub` de siempre entra y la marca queda; un `sub` que es la
    cuenta de otra fila no se inserta en X, y X conserva sus cuentas y la marca.
13. **Dos ingresos a la vez** (D-E2b-3): con la marca y dos `sub` distintos, uno
    vincula y el otro termina en `account_not_linked`; la fila tiene una cuenta.
14. **Contra una desactivación** (D-E2b-3, D-E2-2), en los dos órdenes: si la
    desactivación bloquea primero, el ingreso no vincula y termina en
    `/login?error=membresia_inactiva`, con EQ-92; si el ingreso bloquea primero,
    vincula, la desactivación espera y confirma, y la persona termina sin sesión.
15. **El externo** (D-E2b-8): pedir la vinculación —o reactivar sin cuenta— de un
    correo de fuera de los dominios sin invitación deja una `accepted` con
    `invitation.register`; con una `revoked`, la pasa a `accepted`; con una
    `accepted` o un correo de los dominios, no escribe. Ese externo entra por el
    callback y vincula. **Un externo activo con cuenta y con la invitación
    revocada** entra con su cuenta apenas se pide la vinculación, y sigue
    entrando después de cancelarla; la `accepted` queda. La vista trae
    `registersExternal` verdadero antes del pedido y falso después.
16. **Liberar** (D-E2b-9): el owner libera el correo de una inactiva con una
    cuenta y una sesión sembrada; `user.email` es `releasedEmailOf(userId)`; sin
    cuentas ni sesiones; consta `user.releaseEmail` con el correo anterior; la
    membresía, su rol, sus entradas y sus filas de `project_member` siguen. La
    vista la trae con `email: null`, sin `reactivate`, con `linkActions` vacío y
    sin `canReleaseEmail`. Con el MCP en `main`, queda además sin autorizaciones
    de MCP.
17. **El correo liberado se invita y entra otra persona**: invitar ese correo
    responde `invited`; un `sub` nuevo con ese correo entra por la invitación con
    una fila nueva, y la liberada no cambia. Reactivar o pedir la vinculación de
    la liberada responde `email_released` con EQ-121.
18. **La vista** (§4.8): `link`, `linkActions`, `registersExternal` y
    `canReleaseEmail` para el owner y para un admin en una activa con y sin
    cuenta, una con una marca vigente, una con una vencida, una inactiva con y
    sin cuenta, una liberada y la fila propia; `statusChange` de una inactiva
    sin cuenta, `reactivate` para el owner y `null` para un admin.
19. **La pantalla** (§5): las notas de la fila con sus fechas; las entradas del
    menú y su orden; los textos de confirmación, con el párrafo del externo
    cuando corresponde; reactivar con cuenta y cancelar sin confirmar; los
    avisos de éxito y de error con el nombre; «Reintentar» solo con
    `unexpected`; un pedido a la vez; el foco.
20. **`/login`** (D-E2b-10): `?error=account_not_linked` muestra EQ-122;
    `?error=vinculacion_fallida` y un código desconocido muestran el genérico;
    ninguno muestra el parámetro.
21. **Si la vinculación falla** (D-E2b-3), por `auth.handler`, con un fallo
    inyectado en `bindGoogleAccount`: el callback redirige a
    `/login?error=vinculacion_fallida`, no a un 500; no queda ninguna `account`
    ni `session` nueva, ni constancia; la marca sigue vigente; y un segundo
    intento sin el fallo vincula.
22. **Todo o nada** (ADR 0025): un fallo inyectado después de `bindGoogleAccount`
    deja la marca, las cuentas y las sesiones como estaban; uno después de
    `releaseEmailOf`, el correo, las cuentas y las sesiones; uno después de
    `registerExternalMember`, la invitación y la marca.
23. **Revalidación**: `setAccountLink` y `releaseEmail` con éxito llaman a
    `revalidatePath("/", "layout")`.
24. **La migración**: `db:generate` produce las dos columnas, la clave y el
    `check`; `db:migrate` corre sobre una base con membresías activas e
    inactivas.
25. **Las consultas de §6** corren sin error contra una base sembrada —una
    inactiva sin cuenta con un correo externo sin normalizar, una activa sin
    cuenta, dos `user` con el mismo correo normalizado, una cuenta repetida— y
    dan lo que su comentario dice; las sentencias de §6.8 escriben la marca, la
    invitación de un externo y sus constancias —la de la marca, con la fecha
    anterior en `previous_value`—, y una segunda corrida de la de la invitación
    no escribe. `backend-dev` pega la salida en el registro del slice, con la
    siembra.
26. **La e2e entera en verde**, en una base nueva y en una que se reusa; los
    recorridos de R8, E1a, E1b y E2 sin cambiar lo que afirman.

## 9. Plan de tests

### 9.1 Unidad

- `access.test.ts`: `usesAccountLink` con cada decisión y cada estado de la
  membresía, con y sin marca; `loginErrorMessage` con `account_not_linked`,
  `vinculacion_fallida`, un motivo y uno desconocido (criterio 20).
- `src/lib/email.test.ts`: `releasedEmailOf` e `isReleasedEmail`, con mayúsculas
  y blancos, y que un correo de la empresa no es liberado.
- `permissions.test.ts`: las dos acciones con cada rol, con un actor inactivo,
  sobre otro workspace y sobre la membresía del owner.
- `team/schema.test.ts`: `setAccountLinkInput` (uuid, `link` booleano) y
  `releaseEmailInput`.
- `team-members-model.test.ts`: `menuEntriesOf` con cada combinación de §5.3,
  también la marca vencida; las notas de §5.2; los avisos nuevos; que un menú no
  mande con un pedido en curso.
- Tests de componente de `team-members`, `member-actions-menu`,
  `link-account-dialog` y `release-email-dialog`: las notas con sus fechas,
  «Correo liberado», las entradas y su orden, los textos de los diálogos con y
  sin el párrafo del externo, `aria-disabled` con un pedido en vuelo
  (criterio 19).
- `src/app/login/page.test.tsx` con `account_not_linked` y
  `vinculacion_fallida`.

### 9.2 Integración (Postgres)

- **`signInWithGoogle`** (`auth.integration.test.ts:339-372`) sube al nivel del
  archivo y cambia de forma: hoy reemplaza `globalThis.fetch` en cada llamada,
  así que con dos ingresos a la vez el segundo pisa al primero. Pasa a **un solo
  reemplazo de `fetch`** por test, que responde el `id_token` según el `code` del
  pedido al endpoint de token; cada ingreso usa su propio `code` en el callback.
- **`auth.integration.test.ts`**, por `auth.handler`, que recorre el callback
  entero: criterios 1 (la cuenta vieja sigue entrando), 2, 3, 4, 5, 6, 12, 15 y 21.
  - **El 2 frena un cambio de Better Auth** que mueva `mapProfileToUser` después
    de la búsqueda: sin la vinculación antes de `handleOAuthUserInfo`, termina en
    `account_not_linked`. Se verifica que falla quitando la llamada a
    `bindRequestedAccount`.
  - **El 3 frena una vinculación antes de la regla**: se verifica que falla
    llamando a `bindRequestedAccount` antes de `decideGoogleAccess` (queda una
    `account` nueva y la marca limpia).
  - **El 6, la marca que vence durante la espera**: `seedAccountLink` con `'7
days' - '5 seconds'`; la barrera toma la membresía `for no key update` sin
    escribir; el ingreso pasa `entryFacts` (vigente) y queda trabado en
    `lockMembershipOf`; la barrera se suelta cuando pasaron los segundos de
    margen. Se verifica que falla con `now()` en lugar de `clock_timestamp()`
    en `consumeAccountLink` (vincula). El margen se espera con la condición de
    vencimiento, no con una espera fija.
  - **El 21** inyecta el fallo con `vi.spyOn` sobre el módulo de
    `auth-records` y verifica que, sin el `try` de `decideProfileEntry`, el
    callback responde un 500.
- **Criterio 13**, con `queueBehindBarrier` (`src/test/concurrency.ts`): la
  barrera toma la membresía `for no key update` sin escribir; dos
  `signInWithGoogle` con dos `sub` y dos `code` quedan trabados en
  `lockMembershipOf`; al abrir, uno vincula y el otro termina en
  `account_not_linked`. Se verifica que falla sin el bloqueo (quedan dos
  cuentas).
- **Criterio 14**, con la misma barrera y `changeStatus` como corredor en los
  dos órdenes, como el criterio 26 de E2; en el primero, el ingreso termina en
  `membresia_inactiva`.
- **`entry.integration.test.ts`**: `bindRequestedAccount` con marca vigente,
  vencida y sin marca, con un `sub` con cuenta, con la membresía inactiva, sin
  workspace, con cada `AccountLinkOutcome`, y **con dos filas `user` del mismo
  correo normalizado y una sola membresía con la marca**: `skipped`, sin
  `account` nueva y con la marca intacta. Se verifica que falla contando
  membresías en lugar de filas `user`.
- **`auth-records.integration.test.ts`**: `googleAccountOwnerOf`;
  `bindGoogleAccount` borra las otras cuentas y las sesiones de la persona y no
  las de otra, inserta la nueva con `updated_at`, y deja sus constancias;
  `userEmailOf`; `releaseEmailOf` con su constancia, sin tocar `membership`.
  Con el MCP, las autorizaciones de la persona y no las de otra.
- **`workspace/service.integration.test.ts`**: `entryFactsOf` con
  `accountLink` vigente, vencida y sin marca; `entryWorkspaceIdOf`;
  `registerExternalMember` en sus cuatro casos (criterio 15).
- **`team/service.integration.test.ts`**: criterios 1, 4, 6 (la vista y la
  renovación), 7 a 11, 15 (la vista), 16 a 18 y 22. El 7, con un `update`
  directo que choca con el `check`. El 22, con un fallo inyectado después de
  cada función ajena. `consumeAccountLink` con una marca vigente, una vencida y
  sin marca.
- **`team/actions.integration.test.ts`**: cada fila de §4.10 de
  `setAccountLink` y `releaseEmail` con su código y su texto; con éxito,
  `revalidatePath("/", "layout")` (criterio 23); sin sesión, a `/login` sin
  escribir.
- **La migración** (criterio 24) y **las consultas de §6** (criterio 25): a
  mano, una vez, con la salida en el registro.

Cada test nuevo tiene que poder fallar: se verifica con una mutación en una
copia, como en los slices anteriores.

### 9.3 E2E

Heredan la regla de R2a, R8, E1a, E1b y E2: correos y nombres únicos, nunca
afirmar sobre la tabla entera ni sobre un vacío de la base común. El ingreso por
Google no corre en el navegador de pruebas: lo que pasa después de pedir la
vinculación se afirma en la base. `e2e/team-link.spec.ts`:

1. **Reactivar sin cuenta**: con una persona sembrada inactiva sin cuenta, el
   owner (`OWNER_EMAIL`, en una pestaña) elige «Inactivas», abre su menú, ve
   «Reactivar» y «Liberar el correo», elige «Reactivar», lee la confirmación y
   confirma. El aviso dice «Reactivaste a {nombre}. Su cuenta de Google se
   vincula en su próximo ingreso.», la fila queda sin tachar con «Vinculación
   pedida el …, vence el …: falta su primer ingreso con Google.», y
   `accountLinkOf` trae la marca vigente pedida por el owner.
2. **Pedir y cancelar en una activa con cuenta** (`seedGoogleAccount`): «Vincular
   otra cuenta de Google» confirma con su texto; la nota de reemplazo aparece;
   «Cancelar la vinculación» la quita sin confirmar; `accountLinkOf` sin marca.
3. **Una marca vencida** (`seedExpiredAccountLink`): la fila dice «La
   vinculación pedida el … venció el ….»; el menú ofrece «Volver a pedir la
   vinculación» y «Cancelar la vinculación»; volver a pedirla confirma y deja la
   marca vigente.
4. **Liberar**: con una inactiva con cuenta, «Liberar el correo» confirma con su
   texto; la fila muestra «Correo liberado», sigue tachada y su menú ya no
   existe; `userEmailOfMember` termina en `@liberado.invalid` y
   `accountCountOf` es cero. Después, invitar el correo anterior desde la misma
   pantalla responde «invitada».
5. **Un admin** ve, en la misma inactiva sin cuenta, la nota y ningún menú; en
   una activa, el menú sin «Vincular» (solo «Desactivar»).
6. **`/login?error=account_not_linked`** muestra EQ-122.

Y la suite entera corre en una base nueva y en una que se reusa (criterio 26).

### 9.4 Lo que no se prueba en e2e

El ingreso por Google con la vinculación (integración, por el handler,
criterios 2 a 6, 12 a 15 y 21); las carreras (integración); la migración y las
consultas de §6 (a mano).

## 10. Riesgos

- **El riesgo de PF-47 vuelve, acotado** (D-E2b-1, ADR 0027): mientras una
  marca está vigente, quien tenga la dirección y pase la regla de ingreso entra
  a la fila, con su rol y sus horas. Lo acotan que la pida el owner, que se vea,
  que se cancele, que venza a los siete días, que valga una vez, que la regla se
  decida antes (criterio 3) y que solo valga con la membresía activa. Lo que
  queda: una dirección que la empresa reasigna entre el pedido y el ingreso, y,
  para un externo de un dominio que no es Google Workspace, una segunda cuenta
  de Google creada con ese correo. La pregunta 3 de §11 lo cerraría con un
  código.
- **Pedir la vinculación de un externo le devuelve la entrada a su cuenta
  vieja** si la tenía (D-E2b-8), y no se deshace al cancelar. El diálogo lo
  dice; para cortarla, se la desactiva.
- **`mapProfileToUser` escribe**: si el ingreso falla después del `commit`, la
  cuenta queda vinculada (D-E2b-3). Aceptado: es lo que el owner pidió. Antes del
  `commit`, el error vuelve como `vinculacion_fallida` (criterio 21).
- **Una versión de Better Auth que mueva `getUserInfo`** después de la búsqueda
  deja la vinculación sin efecto: el criterio 2, por el handler, lo frena, y §0
  pide confirmar los seis puntos en cada actualización.
- **Otros caminos que llaman a `getUserInfo`** correrían `mapProfileToUser`, y
  con él la vinculación:
  - **`/sign-in/social` con `idToken`** (`better-auth/dist/api/routes/sign-in.mjs:155-171`):
    llama a `getUserInfo` con un `id_token` que manda el cliente. Lo cierra
    `disableIdTokenSignIn` (`auth.ts:58-61`; en la 1.7.10,
    `verify-id-token.mjs:23` y `:39`), y el test de
    `auth.integration.test.ts:101` afirma el 404. Si alguna vez se abre, la
    vinculación correría con un token verificado por firma, pero por un camino
    que este contrato no revisó.
  - **`/account-info`** (`better-auth/dist/api/routes/account.mjs:604`), con los
    tokens de una cuenta ya vinculada: su `sub` tiene cuenta, así que no
    vincula (D-E2b-3, paso 1). Clock no usa el endpoint; deshabilitarlo queda
    fuera (§12).
- **El MCP y E2b editan las mismas funciones** (§1): quien mergea segundo suma
  `deleteGrantsOf` y resuelve `writeStatus`. Si se olvida, un asistente sigue
  conectado a una fila cuya cuenta se reemplazó o cuyo correo se liberó.
- **El nombre cambia en el primer ingreso**: Better Auth escribe el de Google
  (PF-45), y una importada pasa del nombre de Clockify al de Google en el
  reporte, salvo que tenga uno editado. Es lo que le pasa a cualquiera.
- **El script de importación y los correos liberados** (§6.7): una corrida que
  no saque los liberados vuelve a ocupar el correo o le carga horas ajenas a la
  persona nueva. Lo cubre la consulta previa; la pregunta 4 de §11.
- **Un correo liberado en `user.email`**: un lector futuro que lo muestre tiene
  que pasar por `isReleasedEmail`. Hoy solo la lista de equipo lo muestra.
- **Liberar no se deshace desde la aplicación** (D-E2b-9): la confirmación lo
  dice y el audit log guarda el correo anterior.
- **El owner que se vincula a sí mismo** cierra sus otras sesiones al entrar con
  la cuenta nueva (D-E2b-3). Aceptado.
- **El número de la migración** choca con el del MCP si mergean a la vez: se
  genera después de rebasar (§2).
- **Una instancia vieja durante el despliegue** choca con el `check` si
  desactiva a quien la nueva acaba de marcar (§6.3); lo mismo en la reversión,
  que por eso limpia dos veces (§6.6).
- **La e2e común acumula correos liberados** y personas con la marca: ningún
  recorrido afirma sobre su cantidad.

## 11. Para decidir el usuario

1. **¿Quién vincula y libera?** Recomendado: **solo el owner** (D-E2b-4).
   Vincular le da a quien tenga una dirección la fila entera de otra persona, y
   liberar no se deshace; son raras y las decide quien conoce a las personas.
   Alternativa: owner y admin, con las filas `admin` solo del owner, como
   desactivar (P-07). Con la alternativa, un admin también reactiva a una
   persona `member` sin cuenta.
2. **¿La vinculación vence?** Recomendado: **sí, a los siete días**, sin cron,
   con la fecha del pedido y la del vencimiento en la fila (D-E2b-11). Una
   vinculación abre una fila con rol y horas; siete días alcanzan para coordinar
   el ingreso y acotan la exposición. Alternativas: otro plazo, que es cambiar
   la constante; o que no venza, como una invitación (EQ-25), y se cancele a
   mano.
3. **¿Un código de un solo uso además del correo?** Recomendado: **no**
   (D-E2b-1). El owner confirma, al pedirla, que la dirección sigue siendo de
   esa persona, la marca vence, y para el dominio la dirección la controla la
   empresa. El código ata la fila a quien lo recibió y no solo a quien tiene la
   dirección, a costa de una pantalla previa al ingreso y de llevar el código
   por el `state` de OAuth.
4. **¿El script de importación aprende a saltear los correos liberados?**
   Recomendado: **no**; se resuelve con la consulta de §6.7 antes de cada
   corrida y liberando solo a quien ya terminó de importarse. El script es de
   una sola vez y vive en otra rama. Alternativa: que lea `audit_log` y saltee
   esos correos, en `ops/importar-clockify`.
5. **El ADR 0027**, en «Propuesto»: aceptarlo. Su decisión 8 cambia lo que
   significa una invitación `accepted` del ADR 0024.

## 12. Fuera de alcance

- **PF-48**, la empresa cambia la dirección de una persona activa: sigue siendo
  una corrección a mano (D-E2b-12).
- **P-10 de `perfil.md`** (volver a seguir el nombre de Google): fuera de la fase
  2 (mapa §7).
- **Un índice único por `(provider_id, account_id)`** en `account`: la tabla la
  regenera `npm run auth:schema`; lo cuida `googleAccountOwnerOf`.
- **Deshabilitar `/account-info`**: no vincula (§10), y cerrarlo es endurecer
  otra cosa.
- **Deshacer una liberación** desde la pantalla, y deshacer el registro de un
  externo al cancelar una vinculación (D-E2b-8).
- **El código de un solo uso**, salvo que el usuario elija la alternativa (§11).
- **Quitar del equipo** (EQ-51): E6. Una persona quitada conserva su `user` y su
  cuenta (EQ-108); si su dirección pasa a otra persona, la salida es liberar el
  correo antes de quitarla, porque liberar pide la membresía.
