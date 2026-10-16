# Fase 2, E1b: el ingreso exige invitación

Contrato del slice E1b de la fase 2. **Cierra la puerta**: desde acá entra a
Clock quien pasa la identidad —dominio de la empresa con el claim `hd`, o correo
externo con una invitación `pending` o `accepted` en la base— **y** tiene acceso
—una membresía, o una invitación `pending`—. La variable `EXTERNAL_INVITE_EMAILS`
deja de leerse, `ensureWorkspaceContext` crea una membresía solo desde una
invitación pendiente y `WORKSPACE_OWNER_EMAIL` vale solo para arrancar un
workspace que no existe. Es la deuda que arrastran el slice 1, el mapa de la
fase 1 (§5) y el del núcleo (§6). Sin tablas nuevas; trae una migración de
datos.

- **Fuente:** [`equipo.md`](../parity/equipo.md), §3 (EQ-29 … EQ-33), EQ-17,
  EQ-18, EQ-24, §10 (EQ-91) y §14 (EQ-107 … EQ-109, EQ-111, EQ-113); el
  [mapa de la fase 2](fase2-mapa.md), §2 (el ingreso en producción), §3 «Lo que
  vale para todos» y «E1b», §5 y §6.
- **Lugar en el plan:** segundo slice de la fase 2. Depende de E1a (en `main`
  desde `85eaedf`) y de una condición operativa: las invitaciones del grupo 3
  hechas en producción, revisadas con la consulta de §6.1. E2, E2b, E3, E4 y E6
  dependen de este.
- **Revisión:** `architecture-reviewer` aprobó con cambios; están aplicados: la
  carrera entre invitar y el primer ingreso (D-E1b-11), EQ-111 llevado al
  usuario, que lo decidió (§11), el texto de `dominio_no_habilitado` (D-E1b-2),
  una sola normalización del correo (D-E1b-1), la reversión que conserva la
  `0016` (§6.5), los previews y la base local (§6.7), los archivos que faltaban
  en el reparto (§7) y la evidencia de las consultas (criterio 18).
- **Decisiones de arquitectura:** **ningún ADR nuevo**. Todo lo que el slice
  decide cae dentro de ADR aceptados; las alternativas propias del slice
  (D-E1b-5 y D-E1b-8) son locales y quedan acá, como D-E1a-14 en E1a.
  - [ADR 0024](../adr/0024-donde-vive-una-invitacion-y-donde-se-corta-el-ingreso.md),
    aceptado: la regla por vía (decisión 3), el corte en `mapProfileToUser` con
    el gancho como segunda comprobación (decisión 4), qué habilita una
    invitación aceptada (decisión 5), «Externa» que no se guarda (decisión 9).
    Este slice escribe la parte «desde E1b».
  - [ADR 0025](../adr/0025-un-modulo-escribe-en-otro-por-su-service.md),
    aceptado: E1b no escribe datos ajenos. La invitación y la membresía son de
    `workspace`, y se aceptan ahí.
  - El [0010](../adr/0010-un-modulo-consulta-las-reglas-de-otro-por-su-service.md):
    `src/server/entry.ts` lee los hechos del ingreso por el service de
    `workspace`, como en E1a. El
    [0007](../adr/0007-el-cliente-elige-el-id-de-las-altas.md) y el
    [0011](../adr/0011-las-acciones-en-masa-son-todo-o-nada.md) no se aplican:
    E1b no tiene altas desde la pantalla ni acciones en masa.

Decisiones del usuario que el contrato da por tomadas (2026-10-16): todos entran
por invitación, también el dominio de la empresa (P-02 de `equipo.md`); los
externos se invitan desde la pantalla (P-03); una persona inactiva no entra
(P-05), que llega con E2; y, para este contrato, **si se saca un dominio, quien
tiene una invitación `accepted` sigue entrando como externa** (EQ-111, §11).

## Decisiones del contrato

**D-E1b-1 — La regla de ingreso, con los hechos de la base.** La decisión sigue
pura en `access.ts`; `entry.ts` le pasa la política y lo que la base sabe del
correo, en una sola lectura (§4.2). En este orden:

| Paso      | Pregunta                                                                                                                                        | Si no                                                                |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Perfil    | ¿Trae correo? ¿Está verificado? (solo en `mapProfileToUser`)                                                                                    | `sin_email`, `email_no_verificado`                                   |
| Identidad | **Dominio**: en el perfil, el claim `hd` lo confirma; con el correo guardado, alcanza el sufijo. **Externo**: invitación `pending` o `accepted` | dominio sin `hd`: `dominio_no_habilitado`; externo: `sin_invitacion` |
| Acceso    | Una membresía en cualquier estado, o una invitación `pending`, o el arranque (D-E1b-3)                                                          | `sin_invitacion`                                                     |

- **La variable deja de leerse.** `EXTERNAL_INVITE_EMAILS` sale de `env.ts`; si
  algún entorno de Vercel la tiene, no la lee nadie (§6.5).
- **Una membresía en cualquier estado da acceso hasta E2** (D-E1b-7).
- **Una sola normalización del correo**: `lower(btrim(email))` en la lectura de
  los hechos (§4.2), en la `0016` (§2) y en las consultas de §6; en TypeScript,
  `normalizeEmail`, que hace lo mismo. Ninguna comparación con `lower` solo.
- **El costo**: una consulta por índice en cada decisión, también para un correo
  del dominio con `hd`, que en E1a no consultaba. Sin correo o sin verificar, no
  se consulta.

**D-E1b-2 — Los motivos: `sin_invitacion` para todo lo que una invitación
arregla.** El motivo nuevo es EQ-91, «Tu cuenta no tiene una invitación a Clock.
Pedísela a quien administra el equipo.». Lo recibe:

- un correo del dominio sin membresía ni invitación pendiente (EQ-29);
- un externo sin invitación, o con la invitación revocada (EQ-24: «se responde
  como un ingreso sin invitación»);
- un externo con la invitación aceptada y sin membresía, el caso de EQ-51
  cuando llegue E6.

`dominio_no_habilitado` queda solo para un correo del dominio cuyo perfil no
trae el `hd` que lo confirma: ninguna invitación lo arregla (ADR 0024,
decisión 3). **Su texto cambia** a «La cuenta no es la de Google Workspace de la
empresa.»: el de hoy, «La cuenta no pertenece al dominio de la empresa ni tiene
una invitación vigente.», menciona una invitación que ese caso no puede usar.
Los otros dos textos de `accessDenialMessage` no cambian.

**Cambia el motivo de dos casos de E1a**: el externo sin invitación y el externo
revocado pasan de `dominio_no_habilitado` a `sin_invitacion` (criterios 14, 15
y 25 de E1a). El recorrido 6 de `e2e/invitations.spec.ts` afirma el texto viejo
de `dominio_no_habilitado` y pasa al nuevo.

**D-E1b-3 — `WORKSPACE_OWNER_EMAIL` vale solo para arrancar (EQ-30, EQ-113).**
Con la base sin workspace, ese correo pasa el acceso sin invitación, y su primer
pedido crea el workspace y su membresía `owner`. Con un workspace, es un correo
más: entra por membresía o por invitación, como `member`.

- **El rol `owner` nace solo con el workspace.** Hoy
  `ensureWorkspaceContext` le da `owner` a ese correo, o al `owner_id` del
  workspace, cada vez que su membresía falta; después de una transferencia (E3)
  y de quitarla (E6) eso crearía un segundo owner. Desde E1b, toda membresía que
  nace de una invitación es `member` (EQ-16).
- **Nadie más arranca un workspace.** Hoy el primero que entra lo crea y queda
  como su owner. Desde E1b, otro correo sin workspace no tiene acceso
  (`sin_invitacion`) y no crea nada.
- **La identidad sigue valiendo**: el owner del arranque tiene que ser del
  dominio, con `hd`. Un externo no puede tener invitación sin workspace.

**D-E1b-4 — Una membresía nace solo de una invitación pendiente, y la acepta
primero.** `ensureWorkspaceContext`, en su transacción, cuando no encuentra la
membresía:

1. **acepta** la invitación pendiente del correo (`acceptPending`, un
   `update … where status = 'pending' returning id`, que toma el bloqueo de la
   fila);
2. si aceptó una, **crea** la membresía `member` y deja `invitation.accept`;
3. si no aceptó ninguna, **vuelve a leer** la membresía: otro pedido de la misma
   persona pudo crearla mientras tanto;
4. si sigue sin membresía, **devuelve `null`**: sin acceso, sin escribir nada.

E1a hacía al revés —primero la membresía, después la aceptación— porque la
membresía nacía igual. Aceptar primero es lo que resuelve EQ-107: la aceptación
y la revocación son `update … where status = 'pending'` sobre la misma fila; la
segunda vuelve a evaluar el `where` después del bloqueo. Si gana la revocación,
no nace la membresía; si gana el ingreso, la persona queda activa y revocar
responde `not_pending`, como pide EQ-107.

**Un solo lugar donde nace una membresía en la aplicación**: la función privada
`createMembership` de `workspace/service.ts`, que usan la invitación y el
arranque. E4 copia ahí el primer día por defecto del workspace (WS-08).

**D-E1b-5 — Una sesión sin acceso termina en `/login` con el motivo.** Con el
corte en `mapProfileToUser` y el gancho, una sesión sin acceso solo existe si la
invitación se revoca entre la creación de la sesión y el primer pedido, o, desde
E6, si se quita a la persona con la sesión abierta. Para ese caso:

- `ensureWorkspaceContext` devuelve `null`;
- `currentSession` devuelve `null`, como sin sesión: la raíz y `/login` se
  dibujan como para alguien que no entró, sin bucle;
- `requireSession` distingue los dos casos: sin sesión redirige a `/login`,
  como hoy; con sesión y sin acceso, a `/login?error=sin_invitacion`.

**La fila de `session` queda.** Alternativas: borrarla —escribe en una tabla de
Better Auth, que pide una función de `src/server/` (ADR 0025), y no compra nada:
cada pedido vuelve a decidir— o tratarla como sin sesión, que manda a `/login`
sin decir por qué. Con la sesión viva, si a la persona la vuelven a invitar, su
pedido siguiente acepta la invitación y entra sin pasar por Google.

**D-E1b-6 — La migración de datos acepta las pendientes de quien ya tiene
membresía.** Salen de tres lados: la ventana de E1a (la nota de la revisión de
backend en el registro de E1a), una corrida del script de importación, y la
carrera entre invitar y el primer ingreso que corrige D-E1b-11, que el código
de E1a en producción todavía tiene. Sin ella, quien se quite con E6 volvería a
entrar por una invitación vieja (EQ-51). Es una migración `--custom` (§2), con
una fila de `audit_log` por invitación: `invitation.acceptBackfill`, sin actor,
como `membership.backfill` de R1.

**D-E1b-7 — Hasta E2, una membresía inactiva sigue dando acceso; el
procedimiento SQL sigue borrando `account`.** El mapa deja P-05 —una inactiva
no entra, con EQ-92— para E2, que trae el motivo y el resto de la
desactivación. Con E1b, una membresía en cualquier estado pasa el acceso, así
que **el procedimiento SQL del núcleo**
([`nucleo-reportes-mapa.md`](nucleo-reportes-mapa.md), §5) **sigue borrando
`session` y `account`**: es lo único que le corta la entrada a una inactiva
hasta E2. El hecho que lee el ingreso ya trae el estado de la membresía
(`EntryFacts.membership`), para que E2 sume la rama sin cambiar la lectura.

**D-E1b-8 — Los arneses de prueba siembran la invitación.** La sesión de prueba
de los e2e crea la sesión por el adaptador, que pasa por el gancho
`session.create` (`src/server/test-session.ts:101`): desde E1b, una persona sin
membresía ni invitación recibe 403, y toda la suite cae.

- **e2e**: `signIn` siembra, antes de pedir la sesión, una invitación `pending`
  para un correo de `TEST_EMAIL_DOMAIN` que no tiene membresía ni fila de
  invitación (`on conflict do nothing`). No toca una fila que existe —una
  revocada sigue revocada— y **nunca siembra un externo**: los recorridos de
  invitaciones tienen que llegar a la fila por la pantalla. Un correo sin
  workspace (el owner del setup, en una base nueva) no se siembra: entra por el
  arranque (D-E1b-3). `signInUnseeded` pide la sesión sin sembrar, para los
  recorridos del ingreso.
- **Integración**: los tests que entran por la sesión de prueba, por el
  callback o por `ensureWorkspaceContext` con alguien nuevo siembran la
  membresía o la invitación con las fábricas que ya existen (`seedMember`,
  `seedInvitation`).
- **Descartado**: que el endpoint de prueba cree la invitación. Ensancharía un
  atajo que ya fabrica sesiones, escribiría la tabla de `workspace` desde un
  plugin de `src/server/` (ADR 0025) y dejaría sin forma de expresar
  `signInRejected`.

**D-E1b-9 — Previews: la rama `preview` de Neon necesita las invitaciones de
quien prueba.** Lo pide el mapa (§3): desde E1b, quien prueba un preview con
Google necesita una membresía o una invitación pendiente en esa base. Quien ya
entró a esa base tiene membresía y no necesita nada. Para los demás, §6.7 da la
consulta y el alta, que valen también para la base local de desarrollo. Los e2e
contra un preview siembran solos (D-E1b-8), por la `E2E_DATABASE_URL` que ya
exigen.

**D-E1b-10 — El script de importación deja de crear membresías para un `user`
existente.** Hoy, a una persona de `personas.json` que tiene `user` y no
membresía, el script le crea una (`newMembership`,
`scripts/import-clockify/main.ts:260-263` y `:506-518` de la rama
`ops/importar-clockify`). Después de E1b ese estado solo sale de un ingreso
rechazado por el gancho (una invitación revocada a mitad de camino) o, con E6,
de quitar a alguien: el script le devolvería la entrada a quien un admin acaba
de dejar afuera. El cambio va en la rama del script, **fuera del merge de E1b**,
y es condición de su próxima corrida con `--apply` (§6.6). No se toca en este
slice.

**D-E1b-11 — Invitar lee las membresías después de bloquear las
invitaciones.** Hoy `inviteMembers` lee `membersByEmail` sin bloqueo y después
toma `lockInvitationsByEmail … for update` (`workspace/service.ts:261-270`). Si
el primer ingreso de esa persona acepta su invitación y crea la membresía entre
las dos lecturas, invitar ve la fila `accepted` sin la membresía que leyó antes,
la clasifica como «`accepted` sin membresía» (D-E1a-7) y `reinvite` la vuelve a
`pending`: queda una membresía con una invitación pendiente, que es lo que la
`0016` limpia y lo que EQ-51 no admite. **E1a tiene la misma carrera**, con el
orden de E1a en `ensureWorkspaceContext`; el registro de E1a solo anotaba la
otra entrada a ese estado, la de una persona del dominio sin invitación.

Desde E1b, dentro de la transacción de invitar: `lockActorMembership`, después
`lockInvitationsByEmail` y **recién después** `membersByEmail`. El primer
ingreso tiene la fila de la invitación bloqueada desde `acceptPending` hasta su
`commit`, así que invitar espera, y la lectura de las membresías, que es una
sentencia nueva en `read committed`, ve la membresía ya confirmada: el correo
sale `already_member` y la fila queda `accepted`. Si invitar bloquea primero,
ve la pendiente, responde `already_invited` sin escribir, y el ingreso acepta
después. El orden de los bloqueos sigue sin ciclo (§4.2).

**D-E1b-12 — El script `invitations-from-env` se va.** Era la copia única de la
variable a la base (D-E1a-11); con la variable sin leer, no tiene qué copiar, y
producción nunca la tuvo (§6). Salen `scripts/invitations-from-env/` y su
entrada de `package.json`. Si E1b se revierte (§6.5), vuelve con el código de
E1a.

**D-E1b-13 — Sacar un dominio corta solo a quien entró sin invitación (EQ-111),
por decisión del usuario del 2026-10-16** (§11). Quien entró por invitación
tiene su fila `accepted`; si su dominio sale de `GOOGLE_WORKSPACE_DOMAINS`, para
la regla pasa a ser un externo invitado y sigue entrando. Es lo que dicen las
decisiones 3 y 9 del ADR 0024: la vía externa acepta una `accepted`, y
«Externa» se deriva del dominio, no se guarda. Para cortarle la entrada a una
persona se la desactiva, con E2. Quien entró sin invitación (el grupo 1 del
mapa) deja de entrar, porque su correo pasa a ser externo y no tiene invitación
abierta. Ningún cambio de código ni de esquema; `parity-analyst` corrige el
texto de EQ-111.

## 0. Precondición de arranque

- **`main` en `e9ba1ec`**, con E1a mergeado y desplegado. Las citas de abajo son
  de ese árbol y de `node_modules` con `better-auth` 1.7.7.
- **Los ADR 0024 y 0025, aceptados** (2026-10-16).
- **La consulta de §6.1 corrida en producción** antes de desplegar, no antes de
  implementar.

### Supuestos sobre el árbol, con archivo y línea en `e9ba1ec`

| Supuesto                                                                                                                     | Dónde                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Los motivos son tres; `accessDenialMessage` los traduce y `loginErrorMessage` muestra solo los que conoce                    | `src/server/access.ts:20-21`, `:93-98`, `:112-117`                                                                                      |
| La decisión recibe `invited: boolean`; la vía externa no vale para el dominio; el guardado entra por el sufijo               | `access.ts:30-32`, `:46-72`, `:79-91`                                                                                                   |
| `entry.ts` lee la variable y `hasOpenInvitation`; un correo del dominio con `hd` no consulta la base                         | `src/server/entry.ts:30-36`, `:42-51`, `:54-67`                                                                                         |
| `loginErrorUrl` y `sessionEntryError` llevan el motivo a `/login`                                                            | `entry.ts:70-85`                                                                                                                        |
| `mapProfileToUser` redirige con el motivo; el gancho decide con el correo guardado; `onAPIError.errorURL` es `/login`        | `src/server/auth.ts:51`, `:72-84`, `:101-119`                                                                                           |
| `EXTERNAL_INVITE_EMAILS` y `WORKSPACE_OWNER_EMAIL` en el esquema del entorno y en el ejemplo                                 | `src/server/env.ts:16`, `:18`; `.env.example:16`                                                                                        |
| Los comentarios de `src/lib/email.ts` nombran el script de la variable                                                       | `src/lib/email.ts:3`, `:27`                                                                                                             |
| `ensureWorkspace` crea el workspace para el primero que entra, con él como owner                                             | `src/modules/workspace/service.ts:54-69`                                                                                                |
| `createMembership` inserta la membresía y después acepta la pendiente                                                        | `workspace/service.ts:76-104`                                                                                                           |
| `ensureWorkspaceContext` crea la membresía de cualquiera; `owner` si es el correo configurado o el `owner_id`                | `workspace/service.ts:111-142` (`:115-116`, `:128`)                                                                                     |
| El comentario de `joinedAt` ya dice que la membresía nace al aceptar (EQ-33): E1a lo corrigió                                | `workspace/service.ts:152-157`                                                                                                          |
| Invitar lee las membresías sin bloqueo y después bloquea las invitaciones                                                    | `workspace/service.ts:259-271`                                                                                                          |
| `hasOpenInvitation` en el service, en el repository y en su test, sobre el workspace más viejo                               | `workspace/service.ts:365-367`; `workspace/repository.ts:45-51`, `:340-353`; `workspace/invitations.integration.test.ts:17`, `:406-428` |
| `createMembership` del repository es idempotente por el índice único; `acceptPending` es `update … where status = 'pending'` | `workspace/repository.ts:107-128`, `:305-322`                                                                                           |
| `membersByEmail` compara con `lower(user.email)`, sin `btrim`                                                                | `workspace/repository.ts:179-193`                                                                                                       |
| `currentSession` arma el contexto con `ensureWorkspaceContext`; `requireSession` redirige a `/login` sin sesión              | `src/server/session.ts:34-55`, `:58-64`                                                                                                 |
| `/login` redirige a `/` con sesión y muestra el motivo de `error`                                                            | `src/app/login/page.tsx:10-16`                                                                                                          |
| La sesión de prueba crea el `user` y después la sesión por el adaptador, que pasa por el gancho                              | `src/server/test-session.ts:84-101`                                                                                                     |
| `signIn` de los e2e no siembra nada; `signInRejected` espera el 403; el fixture entra con un correo del dominio              | `e2e/session.ts:48-51`, `:59-65`, `:91-99`                                                                                              |
| El setup entra con `OWNER_EMAIL`, que arranca el workspace en una base nueva                                                 | `e2e/workspace.setup.ts:26-32`; `playwright.config.ts:31-32`                                                                            |
| La base de los e2e: el workspace más viejo, `seedPerson` inserta la membresía directo, `invitationStatusOf`                  | `e2e/database.ts:20`, `:419-443`, `:451-464`                                                                                            |
| Contra un preview, los e2e exigen `E2E_DATABASE_URL`                                                                         | `e2e/environment.ts:66-77`                                                                                                              |
| El entorno de integración: dominio `empresa.com`, owner `owner@empresa.com`; las fábricas de workspace e invitación          | `src/test/setup.ts:13-14`; `src/test/factories.ts:50-61`, `:263-282`                                                                    |
| `auth.integration.test.ts` entra por la sesión de prueba sin sembrar, y simula `hasOpenInvitation` en el rechazo del gancho  | `src/server/auth.integration.test.ts:52-65`, `:237-259`, `:340`, `:362-364`                                                             |
| `entry.integration.test.ts` siembra la variable y afirma que el dominio con `hd` no consulta la base                         | `src/server/entry.integration.test.ts:19-34`, `:61-66`, `:84-98`                                                                        |
| Tests de `ensureWorkspaceContext` que crean la membresía de alguien del dominio sin invitación                               | `workspace/service.integration.test.ts:54-117`, `:249-260`, `:369-398`                                                                  |
| EQ-107 en E1a: si gana la revocación, la membresía nace igual                                                                | `workspace/invitations-concurrency.integration.test.ts:104-120`                                                                         |
| Precedente de migración `--custom` de datos con su auditoría, y de test que lee la migración del diario                      | `drizzle/0013_time_entry_people_backfill.sql`; `src/modules/workspace/schema.integration.test.ts:24-35`                                 |
| La última migración es `0015_invitation`; `audit_log` tiene `previous_value` y `next_value` de texto                         | `drizzle/0015_invitation.sql`; `src/server/db/schema.ts:627-639`                                                                        |
| El script de la variable lee `process.env` y tiene su entrada en `package.json`                                              | `scripts/invitations-from-env/main.ts:40`; `package.json:22`                                                                            |
| El README nombra la variable                                                                                                 | `README.md:14-16`                                                                                                                       |
| El script de importación: `newMembership`, el alta de membresías y lo que imprime en seco                                    | `scripts/import-clockify/main.ts:260-263`, `:506-518`, `:700-701` (rama `ops/importar-clockify`)                                        |

## 1. Alcance

Cubre EQ-17 y EQ-18 (la membresía nace al aceptar y antes no hay nada), EQ-24,
EQ-29 … EQ-31, EQ-32 (la variable deja de leerse), EQ-33, EQ-91, EQ-107,
EQ-108 (la regla que lo permite; el caso llega con E6), EQ-109 (sin cambio:
sigue en P-11 de `perfil.md`, E2b), EQ-111 (D-E1b-13, sin código) y EQ-113.

Entra:

- **La regla de ingreso por vía** en `access.ts`, con el motivo
  `sin_invitacion` y el texto nuevo de `dominio_no_habilitado`, y su armado en
  `entry.ts` con los hechos de la base.
- **En `workspace`**: la lectura de los hechos del ingreso;
  `ensureWorkspaceContext` con la membresía solo desde una invitación y el
  arranque solo para el owner configurado; invitar con las membresías leídas
  bajo el bloqueo (D-E1b-11).
- **En la sesión**: `requireSession` con el destino de una sesión sin acceso.
- **La migración de datos** `0016` (§2).
- **Lo que sale**: `EXTERNAL_INVITE_EMAILS` de `env.ts`, de `.env.example` y del
  README, y `scripts/invitations-from-env/`.
- **Los arneses**: `signIn` de los e2e siembra la invitación; los tests de
  integración siembran lo que el ingreso pide.
- **Tests** de unidad, integración y e2e (§9).

Queda afuera: §12.

### Consecuencias sobre código ya entregado

| Archivo                                                        | Qué cambia                                                                                                                                             | Qué hay que volver a probar                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `src/server/access.ts`, `access.test.ts`                       | `EntryFacts`, la política con el owner del arranque, el motivo `sin_invitacion`, el texto de `dominio_no_habilitado`                                   | `access.test.ts` entero                                 |
| `src/server/entry.ts`, `entry.integration.test.ts`             | Lee `entryFactsOf` en lugar de la variable y `hasOpenInvitation`                                                                                       | `entry.integration.test.ts` entero                      |
| `src/server/auth.ts`                                           | Solo el comentario del gancho, que nombra la lista de invitados                                                                                        | `auth.integration.test.ts`                              |
| `src/server/auth.integration.test.ts`                          | Siembra lo que el ingreso pide; los motivos nuevos; simula `entryFacts`                                                                                | el archivo                                              |
| `src/server/env.ts`, `.env.example`, `README.md`               | Sale `EXTERNAL_INVITE_EMAILS`; el texto de `WORKSPACE_OWNER_EMAIL`                                                                                     | los tests que cargan `env`                              |
| `src/lib/email.ts`                                             | Los comentarios de `:3` y `:27` dejan de nombrar el script de la variable                                                                              | —                                                       |
| `src/server/session.ts`, `session.integration.test.ts`         | `requireSession` distingue sin sesión de sin acceso                                                                                                    | el archivo; la e2e entera                               |
| `src/modules/workspace/service.ts`, `repository.ts`            | `entryFactsOf`; `ensureWorkspaceContext` devuelve `null`; aceptar antes de crear; invitar lee las membresías bajo el bloqueo; sale `hasOpenInvitation` | `workspace/*.integration.test.ts`                       |
| `workspace/invitations.integration.test.ts`                    | `:17` y `:406-428` pasan de `hasOpenInvitation` a `entryFactsOf`                                                                                       | el archivo                                              |
| Los tests que llaman `ensureWorkspaceContext`                  | El tipo de retorno admite `null`                                                                                                                       | `team/service.integration.test.ts` y los de `workspace` |
| `drizzle/`                                                     | La `0016` `--custom` y su entrada en el diario                                                                                                         | `workspace/schema.integration.test.ts`                  |
| `scripts/invitations-from-env/`, `package.json`                | Salen el script y su entrada                                                                                                                           | `vitest` sin esos tests                                 |
| `src/app/login/page.test.tsx`                                  | El caso de `sin_invitacion` y el texto nuevo de `dominio_no_habilitado`                                                                                | el archivo                                              |
| `e2e/session.ts`, `e2e/database.ts`, `e2e/invitations.spec.ts` | `signIn` siembra; `signInUnseeded`; ayudas de invitación y membresía; el texto del recorrido 6                                                         | la e2e entera                                           |

- **`/login` no cambia de código**: `loginErrorMessage` ya muestra todo motivo
  de `accessDenialMessage`.
- `team`, `profile`, `report`, `project`, `time-entry`,
  `src/server/permissions/` y `src/server/test-session.ts` no cambian.

## 2. Esquema y migración

**Ningún cambio de esquema.** `schema.ts` no se toca.

**`0016_invitation_accept_members`, la custom** (D-E1b-6):
`npm run db:generate -- --custom --name=invitation_accept_members`. Un
comentario que remite a este contrato y una sola sentencia:

```sql
-- Lo que drizzle-kit no puede expresar. Contrato de E1b de la fase 2, §2 y
-- D-E1b-6. Una invitación pendiente cuyo correo ya tiene membresía en su
-- workspace pasa a aceptada, con su constancia: desde E1b, una pendiente da
-- acceso, y la de quien ya está le dejaría volver si se la quita (EQ-51).
WITH "accepted" AS (
  UPDATE "invitation"
  SET "status" = 'accepted', "accepted_at" = now(), "updated_at" = now()
  WHERE "invitation"."status" = 'pending'
    AND EXISTS (
      SELECT 1
      FROM "membership"
      INNER JOIN "user" ON "user"."id" = "membership"."user_id"
      WHERE "membership"."workspace_id" = "invitation"."workspace_id"
        AND lower(btrim("user"."email")) = "invitation"."email"
    )
  RETURNING "invitation"."id", "invitation"."workspace_id"
)
INSERT INTO "audit_log" ("workspace_id", "actor_id", "action", "entity", "entity_id", "previous_value", "next_value")
SELECT "workspace_id", NULL, 'invitation.acceptBackfill', 'invitation', "id"::text,
  json_build_object('status', 'pending')::text,
  json_build_object('status', 'accepted')::text
FROM "accepted";
```

- **Cumple los `check` de `invitation`**: `accepted` con `accepted_at` y sin
  `revoked_at`, que una pendiente no tiene.
- **Es compatible con el código de E1a**, que puede seguir corriendo entre la
  migración y el despliegue: E1a no distingue una aceptada de una pendiente
  para el ingreso de quien tiene membresía.
- **Orden de despliegue**: la migración antes que el código (§6.2).
- **Reversión**: no se revierte. Aceptar la invitación de quien ya tiene
  membresía es lo que E1a también hace al crearla (D-E1a-5); el estado es
  correcto con los dos códigos. Revertir E1b es solo el código, y conserva la
  `0016` y su entrada del diario (§6.5).

## 3. Permisos

**Ninguna acción nueva** y ninguna fila de `can()` cambia. El ingreso no pasa por
`can()`: es la regla de `access.ts`, que no tiene actor (ADR 0024, §3 de E1a).
La autoridad de invitar y revocar sigue en `member.invite`.

## 4. Contrato

### 4.1 La regla (`src/server/access.ts`)

Sigue pura: no toca base ni entorno.

```ts
import type { InvitationStatus } from "@/server/db/schema";
import type { MembershipStatus } from "@/server/permissions";

export type AccessPolicy = {
  /** Dominios de Google Workspace habilitados. */
  readonly domains: readonly string[];
  /** `WORKSPACE_OWNER_EMAIL`: entra sin invitación solo si no hay workspace (EQ-30). */
  readonly bootstrapOwnerEmail: string;
};

/** Lo que la base sabe de un correo, en el workspace más viejo (ADR 0024, decisión 3). */
export type EntryFacts = {
  /** Todavía no hay workspace: el arranque (D-E1b-3). */
  readonly bootstrap: boolean;
  /** El estado de la invitación del correo, o `null` si no tiene fila. */
  readonly invitation: InvitationStatus | null;
  /**
   * El estado de la membresía del `user` con ese correo, o `null`, también si
   * más de una fila `user` tiene ese correo (§4.2). Hasta E2, cualquier estado
   * da acceso (D-E1b-7); E2 exige `active` (P-05).
   */
  readonly membership: MembershipStatus | null;
};

/** Sin nada en la base. `entry.ts` lo pasa cuando el perfil no trae correo verificado y no consulta. */
export const NO_ENTRY_FACTS: EntryFacts;

export type AccessDenialReason =
  "sin_email" | "email_no_verificado" | "dominio_no_habilitado" | "sin_invitacion";

/** D-E1b-1: perfil, identidad por vía y acceso, en ese orden. */
export function decideGoogleAccess(
  profile: GoogleProfile,
  policy: AccessPolicy,
  facts: EntryFacts,
): AccessDecision;

/** El correo guardado, en cada inicio de sesión: identidad por el sufijo o externa, y acceso. */
export function decideStoredEmail(
  email: string,
  policy: AccessPolicy,
  facts: EntryFacts,
): AccessDecision;
```

- **`accessDenialMessage`**:
  - `sin_invitacion`: «Tu cuenta no tiene una invitación a Clock. Pedísela a
    quien administra el equipo.» (EQ-91);
  - `dominio_no_habilitado`: «La cuenta no es la de Google Workspace de la
    empresa.» (D-E1b-2);
  - `sin_email` y `email_no_verificado`, sin cambio.
- **El arranque compara el correo normalizado** con `bootstrapOwnerEmail`
  normalizado, y solo con `facts.bootstrap`.
- **`decideGoogleAccess` responde `sin_email` y `email_no_verificado` sin leer
  `facts`**: es lo que deja a `entry.ts` no consultar en esos casos.
- `loginErrorMessage` no cambia.

### 4.2 `workspace`: los hechos del ingreso, el ingreso e invitar

**Repository**, sale `hasOpenInvitation` y entra:

```ts
/**
 * D-E1b-1: en una sentencia, sobre el workspace más viejo: si existe, el estado
 * de la invitación de `email` y el de la membresía del `user` cuyo
 * `lower(btrim(user.email))` es `email`. `email` ya normalizado. Sin workspace,
 * los dos en `null`. Si más de una fila `user` tiene ese correo normalizado, la
 * membresía es `null`: el ingreso no elige entre dos personas, y la que tenga
 * invitación pendiente entra por ella.
 */
async entryFacts(email: string): Promise<{
  readonly workspaceId: string | null;
  readonly invitation: InvitationStatus | null;
  readonly membership: MembershipStatus | null;
}>;
```

- **Una sentencia**: el workspace con la subconsulta de `firstWorkspaceId`, la
  invitación por `(workspace_id, email)` —el índice único de `invitation`— y la
  membresía unida a `user`, contando las filas `user` del correo.
  `lower(btrim(user.email))` no usa el índice único de `user`, como
  `membersByEmail`; la tabla tiene decenas de filas.
- **`membersByEmail`** pasa a comparar con `lower(btrim(user.email))`, la misma
  normalización (D-E1b-1).

**Service**, sale `hasOpenInvitation` y entra:

```ts
/**
 * D-E1b-1: lo que la base sabe del correo, para `src/server/entry.ts`. Lee sin
 * actor: no hay sesión todavía. `email` ya normalizado.
 */
export async function entryFactsOf(email: string): Promise<EntryFacts>;
```

**`ensureWorkspaceContext`** (D-E1b-3, D-E1b-4):

```ts
/**
 * El workspace y la membresía de quien pide. La membresía nace solo de una
 * invitación pendiente, que se acepta primero; el workspace, solo para
 * `WORKSPACE_OWNER_EMAIL` cuando no hay ninguno. `null`: sin acceso.
 */
export async function ensureWorkspaceContext(user: {
  id: string;
  email: string;
}): Promise<WorkspaceContext | null>;
```

En una transacción:

1. **El workspace más viejo.** Si existe, sigue con el paso 2. Si no hay:
   - con un correo que no es el del arranque, devuelve `null`;
   - con el del arranque, toma `lockWorkspaceBootstrap` y vuelve a leer. **Si
     al releer el workspace ya existe** —otro pedido del owner lo creó
     mientras esperaba—, sigue con el paso 2. Si sigue sin haber, crea el
     workspace con ese `user` como `owner_id` y su membresía `owner` por
     `createMembership`, y devuelve.
2. **`findMembership`**: si está, devuelve, sin escribir (el costo por pedido no
   cambia).
3. **`acceptPending`** con el correo normalizado: si devolvió un id,
   `createMembership` con `member` y `recordAudit` de `invitation.accept` con la
   persona como actor; devuelve.
4. **`findMembership` otra vez**: si otro pedido de la misma persona aceptó y
   creó mientras tanto, la encuentra; devuelve.
5. **`null`**, sin escribir nada.

- **`createMembership`** (privada) deja de aceptar: inserta con el rol que
  recibe. Es el único lugar donde nace una membresía en la aplicación (D-E1b-4);
  el comentario lo dice, para E4.
- **Dos primeros pedidos de la misma persona a la vez**: el segundo espera el
  bloqueo de la invitación en el paso 3, la encuentra `accepted` y no actualiza
  nada; el paso 4, en una sentencia nueva, ve la membresía que el primero ya
  confirmó.
- **`WORKSPACE_OWNER_EMAIL`** se lee solo en el paso 1.

**`inviteMembers`** (D-E1b-11): dentro de la transacción, en este orden,
`assertCanInviteLocked`, `lockInvitationsByEmail` y `membersByEmail`. El resto
no cambia.

**El orden de los bloqueos**, con todo junto:

- el primer ingreso: la invitación (`acceptPending`) y después la membresía
  nueva;
- invitar: la membresía de quien actúa (`for share`) y después las
  invitaciones, por id; la lectura de membresías ya no bloquea;
- revocar: la membresía de quien actúa y después la invitación.

La membresía nueva del ingreso no es la de quien actúa en invitar o revocar, así
que no hay ciclo.

### 4.3 El armado (`src/server/entry.ts`)

Las firmas exportadas no cambian (`decideProfileEntry`, `decideStoredEmailEntry`,
`loginErrorUrl`, `sessionEntryError`). Por dentro:

- **La política** suma `bootstrapOwnerEmail: env().WORKSPACE_OWNER_EMAIL`.
- **Los hechos**: `entryFactsOf(normalizeEmail(email))`, una vez por decisión.
  `decideProfileEntry` pasa `NO_ENTRY_FACTS` sin consultar cuando el perfil no
  trae correo o no está verificado.
- **Salen** `isInvited`, `decideWithInvitation` y toda lectura de
  `EXTERNAL_INVITE_EMAILS`.

### 4.4 El login (`src/server/auth.ts`)

Sin cambio de comportamiento: `mapProfileToUser` y el gancho ya traducen lo que
devuelve `entry.ts`, con cualquier motivo. El comentario del gancho deja de
nombrar «la lista de invitados»: dice que revocar una invitación antes del
primer ingreso le cierra la entrada.

### 4.5 La sesión (`src/server/session.ts`)

```ts
/** El contexto de quien pide, o `null` sin sesión o sin acceso (D-E1b-5). */
export const currentSession: () => Promise<SessionContext | null>;

/**
 * Sin sesión, redirige a `/login`; con sesión y sin acceso, a
 * `/login?error=sin_invitacion`.
 */
export async function requireSession(): Promise<SessionContext>;
```

- Por dentro, una lectura en caché por pedido (ADR 0015) con tres resultados
  —sin sesión, sin acceso, listo—; `currentSession` y `requireSession` la
  comparten. La dirección de `requireSession` es relativa: vale en cualquier
  preview.
- **`/login` con una sesión sin acceso** muestra el aviso y el botón:
  `currentSession` es `null`, así que no redirige a `/`. Volver a entrar con
  Google pasa otra vez por `mapProfileToUser`.
- Las descargas (`report/export/handler.ts`) y las actions (`handle`) usan
  `requireSession` y heredan el destino.

### 4.6 Lo que sale

- **`src/server/env.ts`**: `EXTERNAL_INVITE_EMAILS`. `parseEmailList` sigue en
  `src/lib/email.ts`: lo usa `GOOGLE_WORKSPACE_DOMAINS`.
- **`.env.example`**: la línea de `EXTERNAL_INVITE_EMAILS` (`:16`), y el
  comentario de `WORKSPACE_OWNER_EMAIL` con el texto de abajo.
- **`src/lib/email.ts`**: el comentario del archivo (`:3`) y el de
  `parseEmailList` (`:27`) dejan de nombrar el script de la variable; el de
  `parseEmailList` dice que la usa `env.ts` para `GOOGLE_WORKSPACE_DOMAINS`.
- **`scripts/invitations-from-env/`** entero y `invitations:from-env` de
  `package.json` (D-E1b-12).
- **`README.md`**: la frase de la variable.

El texto de `WORKSPACE_OWNER_EMAIL`, el mismo en `.env.example` y en el README:
«El correo que arranca el workspace en una base vacía y queda como su owner.
Con el workspace creado, todos entran por invitación desde `/equipo`, también
este correo.»

## 5. Pantalla

Ningún componente nuevo. `/login` muestra el texto de EQ-91 con
`?error=sin_invitacion`, y el nuevo de `dominio_no_habilitado`, con el aviso de
E1a (`role="alert"`, encima del botón). `/equipo` no cambia: una persona que
entra deja de estar entre las invitadas y aparece entre las personas, como en
E1a.

## 6. La transición en producción

Hechos que el contrato da por dados: Vercel despliega `main` a producción en
cada push y el build no corre migraciones; las migraciones las corre el usuario
con `!` contra producción **antes** del push del merge que las necesita (en E1a
el código llegó antes que la migración, y no se repite). Producción **no tiene**
`EXTERNAL_INVITE_EMAILS`: el grupo 4 del mapa está vacío y no hay variable que
migrar. Hasta E2, desactivar es el procedimiento SQL del núcleo, que borra
`account` (D-E1b-7).

### 6.1 La consulta previa

La corre el usuario en producción, con `!`, lo más cerca posible del despliegue.
El usuario y el team-lead cruzan la salida con la lista de activas de Clockify
(`personas.json`, fuera del repositorio). `<dominios>` es el valor de
`GOOGLE_WORKSPACE_DOMAINS` de Vercel, tal cual. Todo correo se compara como
`lower(btrim(email))` (D-E1b-1).

```sql
-- 0. La marca de tiempo, para la consulta posterior (§6.3).
select now() as consulta_previa;

-- 1. Las membresías, con su correo, su estado, su cuenta, su invitación y sus horas.
with ws as (select id from workspace order by created_at, id limit 1)
select lower(btrim(u.email)) as correo, m.role as rol, m.status as estado,
       m.created_at::date as alta,
       exists (select 1 from account a where a.user_id = u.id) as con_cuenta,
       i.status as invitacion,
       count(t.id) as entradas,
       round(coalesce(sum(extract(epoch from (t.ended_at - t.started_at))), 0) / 3600, 2) as horas
from membership m
join ws on ws.id = m.workspace_id
join "user" u on u.id = m.user_id
left join invitation i on i.workspace_id = m.workspace_id and i.email = lower(btrim(u.email))
left join time_entry t on t.workspace_id = m.workspace_id and t.user_id = m.user_id
group by u.id, u.email, m.role, m.status, m.created_at, i.status
order by m.status, correo;

-- 2. Las invitaciones abiertas: las pendientes y los externos registrados.
--    Las pendientes con membresía son las que acepta la migración 0016.
select i.email as correo, i.status as estado, i.invited_at::date as invitada,
       exists (select 1 from membership m join "user" u on u.id = m.user_id
                where m.workspace_id = i.workspace_id
                  and lower(btrim(u.email)) = i.email) as con_membresia
from invitation i
where i.workspace_id = (select id from workspace order by created_at, id limit 1)
  and i.status in ('pending', 'accepted')
order by i.status, correo;

-- 3. Filas `user` sin membresía: lo que el script de importación convertiría
--    en membresía (§6.6). Informativa.
select lower(btrim(u.email)) as correo, u.created_at::date as creada,
       exists (select 1 from account a where a.user_id = u.id) as con_cuenta
from "user" u
where not exists (
  select 1 from membership m
  where m.user_id = u.id
    and m.workspace_id = (select id from workspace order by created_at, id limit 1))
order by correo;

-- 4. Externos con membresía y sin invitación abierta: desde E1b no entran.
--    Tiene que dar cero filas.
select lower(btrim(u.email)) as correo, m.status as estado
from membership m
join "user" u on u.id = m.user_id
left join invitation i on i.workspace_id = m.workspace_id and i.email = lower(btrim(u.email))
where m.workspace_id = (select id from workspace order by created_at, id limit 1)
  and split_part(lower(btrim(u.email)), '@', 2)
      <> all (string_to_array(lower(replace('<dominios>', ' ', '')), ','))
  and (i.status is null or i.status = 'revoked');

-- 5. Correos repetidos entre filas `user`: para el ingreso no tienen membresía
--    (§4.2). Tiene que dar cero filas.
select lower(btrim(email)) as correo, count(*) as filas
from "user"
group by lower(btrim(email))
having count(*) > 1;
```

Qué se hace con cada resultado, **antes de seguir**:

- **Cada activa de Clockify** tiene que estar en la consulta 1 o como
  `pending` en la 2. La que falta se invita desde `/equipo` (E1a, en
  producción), con el aviso para copiar, y se repite la consulta.
- **Alguien que entró por la deuda y no debía** (consulta 1, sin estar en
  Clockify ni ser una incorporación conocida) se desactiva con el procedimiento
  SQL del núcleo (§5 del mapa del núcleo), que borra su `session` y su
  `account`: con E1b su membresía, aunque inactiva, le seguiría dando acceso
  (D-E1b-7).
- **La consulta 4 con filas**: se para. Cada fila es un externo que entró antes
  de E1a sin quedar registrado; se registra como lo habría hecho el script de
  E1a, con su constancia, y se repite la consulta:

  ```sql
  with ws as (select id from workspace order by created_at, id limit 1),
  inserted as (
    insert into invitation (workspace_id, email, status, accepted_at)
    select ws.id, lower(btrim('<correo>')), 'accepted', now() from ws
    on conflict (workspace_id, email) do update
      set status = 'accepted', accepted_at = now(), revoked_at = null, revoked_by_id = null
      where invitation.status = 'revoked'
    returning id, workspace_id, email
  )
  insert into audit_log (workspace_id, actor_id, action, entity, entity_id, next_value)
  select workspace_id, null, 'invitation.registerExternal', 'invitation', id::text,
         json_build_object('email', email, 'status', 'accepted')::text
  from inserted;
  ```

- **La consulta 5 con filas**: se para. Dos filas `user` con el mismo correo
  normalizado son un dato que hoy no produce la aplicación; el team-lead lo
  mira con el usuario antes de seguir.
- **La consulta 3** no frena el despliegue: es la lista que §6.6 protege. Se
  anota.

### 6.2 El despliegue, en este orden

1. **La consulta previa** de §6.1, limpia. Se anota la marca de la consulta 0.
2. **La migración** contra producción, con `!`: `npm run db:migrate` con la
   `DATABASE_URL` de producción. Aplica solo la `0016`.
3. **La comprobación de la migración**:

   ```sql
   select count(*) from audit_log where action = 'invitation.acceptBackfill';
   ```

   Tiene que dar tantas filas como las de la consulta 2 con `estado = 'pending'`
   y `con_membresia = true`.

4. **Recién entonces, el merge y el push**: el team-lead mergea E1b en `main` y
   pushea; Vercel despliega. Si el paso 3 no cierra, no se pushea.

Entre los pasos 1 y 4 producción sigue con E1a: alguien del dominio todavía
puede entrar sin invitación, y la carrera de D-E1b-11 todavía puede dejar una
pendiente con membresía. Por eso la consulta va lo más cerca posible del push, y
la de §6.3 mira esa ventana.

### 6.3 Después del despliegue

```sql
-- Quien entró en la ventana, después de la consulta previa.
select lower(btrim(u.email)) as correo, m.status as estado, m.created_at
from membership m
join "user" u on u.id = m.user_id
where m.workspace_id = (select id from workspace order by created_at, id limit 1)
  and m.created_at > '<consulta_previa>'
order by m.created_at;

-- Pendientes de quien ya tiene membresía.
select count(*) from invitation i
where i.status = 'pending'
  and exists (select 1 from membership m join "user" u on u.id = m.user_id
               where m.workspace_id = i.workspace_id
                 and lower(btrim(u.email)) = i.email);
```

- Quien aparezca en la primera y no debía entrar se desactiva con el
  procedimiento SQL.
- **La segunda puede no dar cero**: en la ventana corrió E1a, que tiene la
  carrera de D-E1b-11, y una persona del dominio pudo entrar sin invitación
  mientras alguien la invitaba (la nota del registro de E1a). Si no da cero, el
  usuario corre a mano la sentencia de la `0016`, tal cual, y la cuenta vuelve a
  cero. Con E1b desplegado, ese estado ya no se produce.

### 6.4 La verificación de humo

1. **El owner entra** a Clock como siempre y ve `/equipo` con su lista.
2. **Una cuenta de Google personal sin invitación** —la misma de la verificación
   de E1a— termina en `/login` con «Tu cuenta no tiene una invitación a Clock.
   Pedísela a quien administra el equipo.». En E1a esa cuenta veía el texto de
   `dominio_no_habilitado`: el texto nuevo confirma que el código desplegado es
   el de E1b.

No se prueba entrar con una invitación en producción: dejaría una membresía real
de prueba que hasta E6 no se puede quitar. El camino lo cubren
`auth.integration.test.ts` y la e2e (§9).

### 6.5 Reversión

Volver a desplegar E1a, **conservando la `0016`**:

```
git revert --no-commit -m 1 <merge de E1b>
git checkout HEAD -- drizzle/
git commit
```

y push. Sin el `checkout`, el revert borraría `0016_invitation_accept_members.sql`
y su entrada de `drizzle/meta/_journal.json`, mientras la base ya la tiene
aplicada: el diario y la base dejarían de coincidir, y la migración siguiente
se generaría con el número de la `0016`. La `0016` no se revierte (§2): su
estado es correcto también con E1a.

Con E1a otra vez, el dominio vuelve a entrar sin invitación; las invitaciones y
los externos de la base quedan. Producción no tiene la variable, así que no hay
nada que volver a cargar en Vercel. Si algún entorno de Vercel —un preview—
todavía tiene `EXTERNAL_INVITE_EMAILS`, se puede sacar después del despliegue de
E1b: nada la lee.

### 6.6 El script de importación después de E1b

El script vive en `ops/importar-clockify`, sin mergear. **Hasta que tenga el
cambio de D-E1b-10, cada corrida con `--apply` después de E1b exige que la
corrida en seco no muestre ninguna línea «encontrada, se crea la membresía»**
(`main.ts:700-701`); si la muestra, no se aplica.

El cambio, en la rama del script y no en el merge de E1b:

- **`newMembership` deja de crear la membresía**: una persona con `user` y sin
  membresía no se carga en la corrida, como `missing`, y la corrida en seco la
  lista con «tiene `user` sin membresía: se carga cuando entre por invitación».
  Si es una activa de Clockify, se la invita desde `/equipo`; su primer ingreso
  crea la membresía y la corrida siguiente la encuentra como `member`.
- **`newUser`** (una inactiva de Clockify sin `user`) sigue creando el `user`
  sin `account` y la membresía `inactive`, **salvo que su correo tenga una
  invitación `pending`**: entonces tampoco se carga, y la corrida en seco lo
  dice. Crearle la membresía le cerraría la entrada que la invitación le da
  (EQ-110) y dejaría una pendiente con membresía.
- Con eso **el script nunca crea una membresía con una invitación pendiente**, y
  no tiene nada que aceptar: cumple «toda membresía que nace acepta la
  invitación pendiente de su correo» (mapa, §2) sin escribir en `invitation`.
- **El rebase**: para leer `invitation`, el script necesita el esquema de
  `main` desde E1a. WS0 ya le pide rebasarse; si E1b llega antes, el rebase va
  con este cambio.

Lo asigna el team-lead (`backend-dev`) en la rama del script, con su test del
plan.

### 6.7 Previews y la base local

Los previews usan la rama `preview` de Neon (mapa, §3). Desde E1b:

1. **La `0016` corre también en esa rama**, con `npm run db:migrate` y su
   `DATABASE_URL`, **antes de probar el preview**.
2. **Quien prueba un preview con Google** necesita una membresía o una
   invitación pendiente en esa base. La consulta:

   ```sql
   select lower(btrim(u.email)) as correo, m.role, m.status
   from membership m join "user" u on u.id = m.user_id
   where m.workspace_id = (select id from workspace order by created_at, id limit 1)
   order by correo;
   ```

   Si no está, un owner o admin de esa base la invita desde el `/equipo` del
   preview, o el usuario corre en la rama `preview` el alta, que deja la fila
   `pending` también si estaba revocada o aceptada sin membresía:

   ```sql
   with ws as (select id from workspace order by created_at, id limit 1)
   insert into invitation (workspace_id, email)
   select ws.id, lower(btrim('<correo>')) from ws
   on conflict (workspace_id, email) do update
     set status = 'pending', invited_at = now(),
         accepted_at = null, revoked_at = null, revoked_by_id = null
     where invitation.status = 'revoked'
        or (invitation.status = 'accepted'
            and not exists (
              select 1 from membership m join "user" u on u.id = m.user_id
              where m.workspace_id = invitation.workspace_id
                and lower(btrim(u.email)) = invitation.email));
   ```

3. **Los e2e contra un preview** no necesitan nada más: `signIn` siembra por
   `E2E_DATABASE_URL` (D-E1b-8).
4. **La base local de desarrollo `clock`** (`compose.yaml`) sigue los mismos dos
   pasos: `npm run db:migrate` y, para quien entra con Google sin membresía en
   esa base, la consulta y el alta de arriba contra
   `postgresql://clock:clock@localhost:5432/clock`. En una base vacía, entra
   primero el `WORKSPACE_OWNER_EMAIL` del `.env`, que la arranca.

## 7. Reparto de archivos

### backend-dev

- `src/server/access.ts` y `access.test.ts` (§4.1).
- `src/modules/workspace/repository.ts` y `service.ts` (§4.2), con
  `service.integration.test.ts`, `invitations-concurrency.integration.test.ts`
  (EQ-107 y la carrera de D-E1b-11), `invitations.integration.test.ts` (`:17` y
  `:406-428`, de `hasOpenInvitation` a `entryFactsOf`) y
  `schema.integration.test.ts` (la `0016`).
- `src/server/entry.ts` y `entry.integration.test.ts` (§4.3);
  `src/server/auth.ts` (el comentario) y `auth.integration.test.ts` (§9.2).
- `src/server/session.ts` y `session.integration.test.ts` (§4.5).
- `src/server/env.ts`, `.env.example`, `README.md`, los comentarios de
  `src/lib/email.ts`, la salida de `scripts/invitations-from-env/` y de su
  entrada en `package.json` (§4.6).
- `drizzle/0016_invitation_accept_members.sql` y su diario (§2).
- Los demás tests de integración que llaman `ensureWorkspaceContext`, por el
  tipo con `null` (`team/service.integration.test.ts:557`).
- `src/app/login/page.test.tsx`: el caso de `sin_invitacion` y el texto nuevo de
  `dominio_no_habilitado`.
- La evidencia del criterio 18 en el registro del slice
  (`docs/slices/correcciones-fase2-e1b-revisiones.md`).
- **Primero fija** `AccessDenialReason`, `EntryFacts`, los textos de
  `accessDenialMessage` y la firma de `ensureWorkspaceContext`, y avisa a
  `e2e-tester`.
- Con su propio commit en `ops/importar-clockify`, cuando el team-lead lo pida:
  §6.6. No va en la rama de E1b.

### frontend-dev

Sin trabajo en este slice: `/login` no cambia de código (§5).

### e2e-tester

- `e2e/session.ts`: `signIn` siembra (D-E1b-8); `signInUnseeded`;
  `signInRejected` sin cambio.
- `e2e/database.ts`: `inviteForSignIn(email)` (la siembra de `signIn`, `pending`,
  `invited_by_id` nulo, `on conflict do nothing`, solo con workspace y sin
  membresía), `revokeInvitationOf(email)` y `hasMembership(email)`.
- `e2e/entry.spec.ts`, nuevo, con los recorridos de §9.3; confirma que fallan
  antes de la implementación.
- `e2e/invitations.spec.ts`: los recorridos que entran por la invitación pasan a
  `signInUnseeded`, para que el arnés no les cree la fila; el recorrido 6 afirma
  el texto nuevo de `dominio_no_habilitado`.
- **La siembra de `signIn` entra en el mismo commit que la regla**: la suite
  tiene que quedar en verde en cada commit de la rama.

### parity-analyst

`equipo.md`: EQ-24 y EQ-91 con D-E1b-2; EQ-29 (el corte quedó en
`mapProfileToUser`, ADR 0024); EQ-30 y EQ-113 con D-E1b-3; EQ-32 (la variable ya
no se lee); EQ-107 con D-E1b-4; el texto de EQ-111 con la decisión del usuario
del 2026-10-16 (D-E1b-13).

### Lo que no toca nadie

`team`, `profile`, `report`, `project`, `time-entry`, `src/server/permissions/`,
`src/server/test-session.ts`, `src/components/` y `src/app/`, salvo
`src/app/login/page.test.tsx`.

### Orden

1. `backend-dev`: tipos y textos de `access.ts` y la firma de
   `ensureWorkspaceContext`.
2. En paralelo: `backend-dev` con la regla, el service, la sesión y la `0016`;
   `e2e-tester` con el arnés y el spec.
3. Las revisiones; correcciones; corrida final de e2e en una base nueva **y** en
   una que se reusa (§9.3).

## 8. Criterios de aceptación

1. **Un correo del dominio con `hd`, sin membresía ni invitación, no entra**
   (EQ-29): `mapProfileToUser` responde 302 a `/login?error=sin_invitacion` sin
   crear la fila `user`, y `/login` muestra EQ-91.
2. **Con una invitación pendiente entra** (EQ-17): su primer pedido crea la
   membresía `member` activa, la invitación pasa a `accepted` con
   `invitation.accept`, y en `/equipo` deja las invitadas y aparece entre las
   personas.
3. **Quien ya tiene membresía entra sin invitación y sin escribir** (EQ-31): la
   rama que encuentra la membresía no acepta ni audita.
4. **Un externo**: con `pending` entra; con `accepted` y membresía entra; con
   `accepted` sin membresía, con `revoked` o sin fila, no entra, con
   `sin_invitacion` (EQ-24, D-E1b-2).
5. **Un correo del dominio sin `hd`** no entra, con `dominio_no_habilitado` y el
   texto «La cuenta no es la de Google Workspace de la empresa.», aunque tenga
   invitación o membresía.
6. **La variable no se lee**: con `EXTERNAL_INVITE_EMAILS` en el entorno, un
   correo de la lista sin invitación no entra; `env()` no tiene el campo.
7. **El arranque** (EQ-30): sin workspace, `WORKSPACE_OWNER_EMAIL` entra y su
   primer pedido crea el workspace y su membresía `owner`; otro correo del
   dominio no entra (`sin_invitacion`) y su `ensureWorkspaceContext` devuelve
   `null` sin crear workspace. Dos primeros pedidos del owner a la vez dejan un
   workspace y una membresía.
8. **Después del arranque** (EQ-113): `WORKSPACE_OWNER_EMAIL` sin membresía, en
   un workspace de otro owner, no entra sin invitación; con una, entra como
   `member`. Nunca nace un segundo owner.
9. **Una membresía inactiva sigue dando acceso** hasta E2 (D-E1b-7). E2 cambia
   este criterio.
10. **`ensureWorkspaceContext` sin membresía ni pendiente** devuelve `null` y no
    escribe: ni membresía, ni invitación, ni `audit_log`.
11. **Una sesión sin acceso** (la invitación revocada después de crear la
    sesión): toda página de `(app)` y toda action redirigen a
    `/login?error=sin_invitacion`; `/login` muestra EQ-91 y el botón, sin
    redirigir a `/`; la fila de `session` queda.
12. **EQ-107**, las dos órdenes: si gana la revocación, `ensureWorkspaceContext`
    devuelve `null`, no hay membresía y la invitación queda `revoked` con solo
    `invitation.revoke`; si gana el ingreso, la membresía nace, la invitación
    queda `accepted` y revocar responde `not_pending`.
13. **Dos primeros pedidos de la misma persona a la vez** dejan una membresía,
    una aceptación y un `invitation.accept`; los dos devuelven el contexto.
14. **El rechazo del gancho**: con la invitación revocada entre
    `mapProfileToUser` y el gancho, el callback responde 302 a `/login` con
    `error=sin_invitacion`, con `user` y `account` creados y sin `session`.
15. **La `0016`** acepta las pendientes cuyo correo tiene membresía en su
    workspace —también con el correo de `user` con mayúsculas o blancos—, con
    una fila `invitation.acceptBackfill` cada una, sin actor; no toca una
    pendiente sin membresía, ni una de otro workspace, ni una `accepted` o
    `revoked`.
16. **La e2e entera en verde** con la siembra de `signIn`, en una base nueva y
    en una que se reusa; una persona del dominio sin invitación recibe el 403 de
    la sesión de prueba.
17. **Lo que sale**: `scripts/invitations-from-env/` y su entrada no están; ni
    `src/`, ni `.env.example`, ni el README nombran `EXTERNAL_INVITE_EMAILS`;
    `.env.example` y el README describen `WORKSPACE_OWNER_EMAIL` con el texto de
    §4.6.
18. **Las consultas de §6** corren sin error contra una base migrada y sembrada
    —una membresía con pendiente, un `user` sin membresía, un externo sin
    invitación, dos `user` con el mismo correo normalizado— y dan lo que su
    comentario dice. `backend-dev` las corre una vez y **pega la salida de cada
    una** en el registro del slice, con la siembra que usó.
19. **Invitar contra el primer ingreso** (D-E1b-11): con el ingreso que acepta
    la invitación y crea la membresía mientras invitar el mismo correo está en
    curso, la invitación queda `accepted`, invitar responde `already_member` y
    no deja `invitation.reinvite`.
20. **Dos `user` con el mismo correo normalizado**: `entryFactsOf` devuelve
    `membership: null` aunque los dos tengan membresía; con una invitación
    pendiente, el acceso sale de ella.
21. **Un dominio sacado** (EQ-111, D-E1b-13): con un correo de un dominio que ya
    no está en la política, `decideStoredEmail` deja entrar a quien tiene una
    `accepted` y membresía, y responde `sin_invitacion` a quien tiene membresía
    sin invitación.

## 9. Plan de tests

### 9.1 Unidad

- `access.test.ts`: la tabla de D-E1b-1 entera, en las dos funciones: perfil
  sin correo y sin verificar (sin leer `facts`); dominio con y sin `hd`;
  externo con cada estado de invitación; acceso por membresía de cada estado,
  por pendiente, por aceptada sola (no), y por el arranque, con el correo con
  mayúsculas y espacios y con otro correo; el dominio sacado del criterio 21;
  `loginErrorMessage` con `sin_invitacion` y `dominio_no_habilitado`, con sus
  textos (criterios 1, 4, 5, 7, 9, 21).
- `src/app/login/page.test.tsx` con los dos motivos.

### 9.2 Integración (Postgres)

- **`entry.integration.test.ts`**: `decideProfileEntry` y
  `decideStoredEmailEntry` contra la base sembrada, criterios 1, 4 a 9; sin
  correo o sin verificar no llama a `entryFacts` (espía); la variable en
  `process.env` no cambia nada (criterio 6).
- **`workspace/invitations.integration.test.ts`**: el bloque de
  `hasOpenInvitation` (`:406-428`) pasa a `entryFactsOf`: cada estado de
  invitación, la membresía por correo con mayúsculas y blancos, sin workspace,
  solo el workspace más viejo, y dos `user` con el mismo correo normalizado
  (criterio 20).
- **`workspace/service.integration.test.ts`**: `ensureWorkspaceContext`,
  criterios 2, 3, 7, 8, 10; la falla de la aceptación o después de ella deshace
  todo (el criterio 18 de E1a, con el orden nuevo). Los casos de hoy que crean
  la membresía de alguien del dominio sin invitación pasan a sembrarla
  (`:54-117`, `:249-260`, `:369-398`); el de «sigue entrando» (criterio 17 de
  E1a) pasa a afirmar el `null`.
- **Concurrencia**, con las barreras de `src/test/concurrency.ts`, en
  `invitations-concurrency.integration.test.ts`:
  - criterio 12, que reemplaza `:104-120`;
  - criterio 13;
  - el arranque con el owner y otra persona a la vez: un workspace, una
    membresía, la otra en `null`; y con dos pedidos del owner (criterio 7);
  - **criterio 19**: `queueBehindBarrier` con la invitación retenida, primero
    `ensureWorkspaceContext` y después `inviteMembers` del mismo correo. Con el
    orden de hoy, invitar lee las membresías antes de encolarse detrás del
    ingreso y el test falla con la fila en `pending`; con D-E1b-11, invitar se
    encola antes de leerlas. Se verifica que falla con el orden viejo.
- **`session.integration.test.ts`**: criterio 11 con `getSession` simulado y
  `redirect` espiado: sin sesión, `/login`; sin acceso, `/login?error=sin_invitacion`;
  `currentSession` en `null` en los dos.
- **`auth.integration.test.ts`**, por el handler de Better Auth: `signIn` del
  arnés siembra el workspace y la membresía; el caso de
  `handleOAuthUserInfo` que entra siembra la membresía del correo. El callback:
  1. externo sin invitación: 302 a `/login?error=sin_invitacion`, sin `user`;
  2. dominio con `hd` sin invitación: lo mismo (criterio 1);
  3. dominio con `hd` e invitación pendiente: 302 a `/` con la cookie;
  4. dominio sin `hd` con invitación: 302 a `/login?error=dominio_no_habilitado`;
  5. externo invitado: 302 a `/` con la cookie (el de E1a);
  6. rechazo del gancho, con `entryFacts` simulado (`pending` y después
     `revoked`): criterio 14.
- **La `0016`** (criterio 15): la sentencia leída del diario y del archivo, como
  `workspace/schema.integration.test.ts:24-35`, corrida sobre una base sembrada
  con los casos del criterio.
- **Las consultas de §6** (criterio 18): a mano, una vez, con la salida en el
  registro del slice.

Cada test nuevo tiene que poder fallar: se verifica con una mutación en una
copia, como en los slices anteriores.

### 9.3 E2E

Heredan la regla de R2a, R8 y E1a: correos únicos, nunca afirmar sobre la tabla
entera. `e2e/entry.spec.ts`:

1. **Una persona del dominio sin invitación no entra, y entra cuando la
   invitan**: `signInRejected`; `hasMembership` en `false`; un admin la invita
   desde `/equipo` (`invitationStatusOf` en `pending`); `signInUnseeded` en otro
   contexto entra al rastreador; en la pantalla del admin, después de recargar,
   está entre las personas.
2. **Revocada no entra**: un admin invita a una persona del dominio y revoca;
   `signInRejected`.
3. **Una sesión sin acceso termina en `/login`**: `inviteForSignIn`,
   `signInUnseeded` (la sesión se crea), `revokeInvitationOf` y `goto("/")`:
   termina en `/login?error=sin_invitacion` con el texto de EQ-91 y el botón;
   `hasMembership` en `false`.
4. **`/login?error=sin_invitacion`** muestra EQ-91.

Y la suite entera corre sobre la siembra de `signIn` (criterio 16), en una base
nueva —el setup arranca el workspace por `WORKSPACE_OWNER_EMAIL`— y en una que
se reusa —con personas de corridas viejas sin invitación, que entran por su
membresía—.

### 9.4 Lo que no se prueba en e2e

El login de Google: la sesión de prueba no pasa por `mapProfileToUser`. Lo
cubren `access.test.ts`, `entry.integration.test.ts` y el handler en
`auth.integration.test.ts`; la configuración de producción, la verificación de
humo (§6.4). La migración y la carrera de D-E1b-11 se prueban en integración, y
las consultas de §6, a mano (criterio 18). El dominio sacado (criterio 21), en
unidad: cambiar los dominios del servidor de los e2e cambiaría lo que ven los
demás specs.

## 10. Riesgos

- **Dejar afuera a alguien** al desplegar: lo cubren la consulta previa (§6.1)
  contra `personas.json` y la posterior (§6.3). La reversión es volver a E1a
  (§6.5), sin pasos de datos.
- **La ventana entre la consulta y el push**: con E1a todavía en producción,
  alguien del dominio entra sin invitación y la carrera de D-E1b-11 puede dejar
  una pendiente con membresía. §6.3 mira las dos cosas.
- **El script de importación sin el cambio de §6.6** crearía la membresía de un
  `user` rechazado. Hasta el cambio, la regla de la corrida en seco lo frena.
- **Una inactiva entra hasta E2** si conserva su `account` (D-E1b-7): la
  desactivación por SQL tiene que seguir borrando `account`. Una persona del
  grupo 2 (sin `account`) no entra, por PF-47.
- **`WORKSPACE_OWNER_EMAIL` de otro dominio** no puede arrancar un workspace
  nuevo (D-E1b-3). Producción ya arrancó; una base local o de preview vacía
  necesita un owner del dominio.
- **El login consulta la base siempre**, también con `hd`: una base caída deja
  de dejar entrar, nunca deja entrar de más.
- **Dos `user` con el mismo correo normalizado** no entran por su membresía
  (§4.2); la consulta 5 de §6.1 lo mira antes del despliegue.
- **La siembra de `signIn` puede tapar una falla de la pantalla de invitar** en
  un recorrido del dominio: por eso no siembra externos y los recorridos de
  invitaciones usan `signInUnseeded` (D-E1b-8).
- **Una sesión sin acceso queda en `session`** hasta vencer (D-E1b-5). No
  habilita nada: cada pedido vuelve a decidir.
- **Sacar un dominio no corta a quien entró por invitación** (D-E1b-13): quien
  administra tiene que desactivar a cada una con E2.
- **Previews y base local**: quien prueba sin membresía ve EQ-91 hasta que lo
  invitan (§6.7).
- **La reversión sin el `checkout` de `drizzle/`** desalinea el diario con la
  base (§6.5).

## 11. Decidido el 2026-10-16

El usuario respondió la pregunta del contrato. No quedan preguntas abiertas.

1. **Sacar un dominio de `GOOGLE_WORKSPACE_DOMAINS` (EQ-111): quien tiene una
   invitación `accepted` sigue entrando, como externa, y para cortar a alguien
   se usa E2** (D-E1b-13). Quien entró sin invitación deja de entrar. Ningún
   cambio de código ni de esquema; `parity-analyst` corrige el texto de EQ-111
   en `equipo.md`. La alternativa descartada —que dejara de entrar aunque
   tuviera una `accepted` del dominio, salvo que se la invitara de nuevo como
   externa— pedía guardar la vía de cada invitación (una columna, un script de
   relleno, dos migraciones), reemplazar la decisión 9 del ADR 0024 con un ADR
   nuevo y que invitar registrara como externa a una persona activa.

## 12. Fuera de alcance

- **Una inactiva no entra** (P-05, EQ-42, EQ-92): E2, que suma la rama sobre
  `EntryFacts.membership` y el motivo de EQ-92.
- **Volver a entrar sin `account`** (EQ-110) y P-11 de `perfil.md` (EQ-109):
  E2b.
- **Quitar del equipo** (EQ-51, EQ-108 con una persona quitada): E6. E1b deja la
  regla que hace que vuelva solo con una invitación nueva.
- **El primer día por defecto en la membresía nueva** (WS-08): E4, en
  `createMembership`.
- **Borrar las sesiones de una persona**: E2, con su función de `src/server/`
  (ADR 0025).
- **Quitar `invited` de `membership_status`**: deuda del mapa (ADR 0024,
  decisión 7).
- **El cambio del script de importación** (§6.6): va en su rama, no en este
  merge.
