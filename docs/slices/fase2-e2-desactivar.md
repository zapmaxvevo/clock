# Fase 2, E2: desactivar y reactivar

Contrato del slice E2 de la fase 2. **Reemplaza el procedimiento SQL** del mapa
del núcleo (§5): desde `/equipo`, owner y admin desactivan a una persona —su
membresía pasa a `inactive`, su timer se detiene y sus sesiones se borran, en
una transacción— y la reactivan con el mismo rol. Solo el owner lo hace sobre un
admin (P-07). **La regla de ingreso de E1b pasa a exigir una membresía activa**
(P-05): una inactiva no abre sesión, con EQ-92. La lista de equipo suma las
inactivas, tachadas, con un filtro de estado en la URL y un menú por fila. Sin
cambios de esquema y sin migración.

- **Fuente:** [`equipo.md`](../parity/equipo.md), §1 (EQ-03, EQ-05, EQ-06,
  EQ-11), §4 (EQ-37, EQ-38), §5 (EQ-39 … EQ-48), §10 (EQ-82 … EQ-85, EQ-90,
  EQ-92), §11 (EQ-94), §12 (EQ-98, EQ-99), §13 (EQ-100, EQ-101), §14 (EQ-102 …
  EQ-104, EQ-110) y §18 (P-05, P-06, P-07); RP-60 y RP-63 de
  [`reportes.md`](../parity/reportes.md); TT-92 de
  [`time-tracker.md`](../parity/time-tracker.md); el
  [mapa de la fase 2](fase2-mapa.md), §2, §3 «Lo que vale para todos», «E2» y lo
  que dicen de E2 las secciones de E2b, E3, E4 y E6, §5, §6 y §7.
- **Lugar en el plan:** tercer slice de la fase 2. Depende de E1b (en `main`
  desde `db0991d` y en producción). E2b, E3, E4, E5, E6, P6 y E7 dependen de
  este.
- **Revisión:** `architecture-reviewer` lo aprobó con cambios; las siete
  correcciones están aplicadas.
- **Decisiones de arquitectura:** **ningún ADR nuevo**. Lo que el slice decide
  cae dentro de ADR aceptados:
  - [ADR 0023](../adr/0023-quitar-el-rol-de-admin-es-una-accion-propia.md): la
    excepción del owner es una acción propia de `can()`, `team.admin.setStatus`
    (D-E2-4). El mapa (§4) ya dice que no necesita ADR.
  - [ADR 0025](../adr/0025-un-modulo-escribe-en-otro-por-su-service.md): detener
    el timer es una función del service de `time-entry` y borrar las sesiones,
    una de `src/server/` al lado de `auth.ts` (D-E2-5, D-E2-2). `status` es una
    columna de `team`.
  - [ADR 0010](../adr/0010-un-modulo-consulta-las-reglas-de-otro-por-su-service.md):
    la lectura con bloqueo que `time-entry` pide a `workspace` al abrir un timer
    y la que pide `entry.ts` al crear una sesión son el caso que el 0010 deja
    «al contrato que la pida» (D-E2-6, D-E2-2); la cuenta de Google se muestra
    con un `join` y se exige con una función del dueño (D-E2-7).
  - [ADR 0024](../adr/0024-donde-vive-una-invitacion-y-donde-se-corta-el-ingreso.md):
    el corte sigue en `mapProfileToUser` y el gancho `session.create.before`
    (decisión 4), armado por `entry.ts`; el gancho `session.create.after` que
    cierra la carrera con una desactivación es parte del mismo armado (D-E2-2).
    E2 suma la rama del estado que E1b dejó preparada en `EntryFacts.membership`.
  - El [0008](../adr/0008-la-ventana-de-la-lista-vive-en-la-url.md): el filtro
    de estado vive en la URL (EQ-100). El
    [0007](../adr/0007-el-cliente-elige-el-id-de-las-altas.md) y el
    [0011](../adr/0011-las-acciones-en-masa-son-todo-o-nada.md) no se aplican: no
    hay altas ni acciones en masa (EQ-49 está fuera).

Decisiones del usuario que el contrato da por tomadas (2026-10-16): una persona
inactiva no entra, con EQ-92, y TT-92 cubre solo el pedido en vuelo (P-05);
desactivar conserva el rol y mientras tanto el rol no se cambia (P-06); solo el
owner desactiva o reactiva a un admin (P-07).

## Decisiones del contrato

**D-E2-1 — La regla de ingreso exige una membresía activa (P-05, EQ-42,
EQ-92).** El paso de acceso de D-E1b-1 queda así, en este orden:

| Hecho de la base                                     | Decisión             |
| ---------------------------------------------------- | -------------------- |
| Membresía `active`                                   | entra                |
| Membresía en cualquier otro estado                   | `membresia_inactiva` |
| Sin membresía, con invitación `pending`              | entra                |
| Sin membresía ni pendiente, en el arranque (D-E1b-3) | entra                |
| Sin membresía ni pendiente                           | `sin_invitacion`     |

- **El motivo nuevo es `membresia_inactiva`**, con el texto de EQ-92: «Tu
  acceso al workspace está desactivado. Pedile a quien administra el equipo que
  te vuelva a activar.». `/login` lo muestra sin cambio de código, por
  `loginErrorMessage`.
- **La membresía gana sobre la invitación**: una inactiva con una pendiente no
  entra. La aplicación no produce ese par (invitar a una inactiva responde
  EQ-21), y si existiera, `ensureWorkspaceContext` encontraría la membresía y
  no aceptaría la invitación.
- **`invited` cuenta como no activa.** No tiene escritor (ADR 0024, decisión
  7), y `can()` ya corta todo lo que no es `active`.
- **La identidad va primero, como en E1b**: un externo sin invitación abierta
  responde `sin_invitacion` aunque su membresía esté inactiva; un correo del
  dominio sin `hd`, `dominio_no_habilitado`.
- Rige en los dos puntos de corte: `mapProfileToUser` (`decideGoogleAccess`) y
  el gancho `session.create.before` (`decideStoredEmail`). Ninguno crea sesión.
  El gancho `session.create.after` de D-E2-2 no decide el ingreso: borra la
  sesión que dejó la carrera con una desactivación.
- **Cambia el criterio 9 de E1b** («una membresía inactiva sigue dando acceso
  hasta E2»), y con él los tests que lo afirman (§1).

**D-E2-2 — La carrera con un ingreso se cierra en `session.create.after`; una
sesión abierta con una membresía inactiva sigue en TT-92, y por pedido se vuelve
a decidir solo la identidad.** Desactivar borra las sesiones en la misma
transacción (D-E2-5), así que en el uso normal no queda ninguna. Las que pueden
quedar son dos:

- **El pedido en vuelo** que leyó la sesión antes del `commit`: termina con lo
  que leyó (EQ-104). Es lo que P-05 deja a TT-92.
- **Un estado escrito por SQL**: una membresía pasada a `inactive` a mano, como
  hace `setMembershipStatus` de los e2e.

En los dos casos **la pantalla queda en solo lectura con el aviso de TT-92**,
como hoy: `ensureWorkspaceContext` devuelve el contexto con el estado y `can()`
corta todo.

**La carrera con un ingreso no deja sesión (P-05).** El gancho
`session.create.before` lee la membresía activa, la desactivación confirma (y
borra cero sesiones), y Better Auth inserta la sesión después: el `before` y la
inserción no comparten transacción con nada que la desactivación pueda bloquear.
Desde E2, **un gancho `session.create.after` relee la membresía `for share` y,
si existe y no está activa, borra la sesión, sin lanzar**:

- **Lo que ofrece Better Auth 1.7.7.** `databaseHooks.session.create.after`
  existe, con la firma `(session: Session & Record<string, unknown>, context:
GenericEndpointContext | null) => Promise<void>`
  (`node_modules/@better-auth/core/dist/types/init-options.d.mts:1324`).
  `createWithHooks` lo llama con la fila que devolvió el `insert`, después de
  insertarla (`node_modules/better-auth/dist/db/with-hooks.mjs:25-41`), por
  `queueAfterTransactionHook`: fuera de una transacción corre en el acto, y
  dentro de una, después del `commit`
  (`node_modules/@better-auth/core/dist/context/transaction.mjs:96-114`). En el
  callback de OAuth, `createSession` corre fuera de toda transacción —la del
  alta de `user` y `account` ya cerró—
  (`node_modules/better-auth/dist/oauth2/link-account.mjs:274-289`, `:322`), así
  que el gancho ve la fila de `session` confirmada. Lo que el gancho lance sale
  de `createSession`.
- **Por qué cierra la carrera.** La desactivación toma la membresía
  `for no key update` antes de borrar las sesiones y la suelta en el `commit`
  (D-E2-6); el gancho la lee `for share`, que choca con ese bloqueo. Si la
  sesión confirmó antes de que empezara el `delete` de la desactivación, ese
  `delete` la ve y la borra. Si confirmó después, la desactivación ya tenía la
  membresía: el gancho espera su `commit`, lee `inactive` y la borra. Si el
  gancho leyó `active` antes de que la desactivación tomara la membresía, la
  sesión ya estaba confirmada, y es el primer caso.
- **Sin lanzar.** El `after` corre con la fila ya confirmada: lanzar no deshace
  la inserción, y un error ahí sale de `createSession` en todo camino que crea
  sesiones, también el de la sesión de prueba. El gancho borra y vuelve. El
  callback termina, el navegador recibe la cookie de una sesión que ya no está,
  y el pedido siguiente no tiene sesión y va a `/login`, sin motivo; si la
  persona vuelve a intentar, `mapProfileToUser` responde EQ-92 (§10). Ningún
  pedido usó esa sesión —la cookie sale con la respuesta del callback, después
  del gancho—, así que el borrado no deja constancia.
- **Lo que borra**: solo la sesión de una membresía que existe y no es
  `active`. Sin membresía —una invitación pendiente que se acepta en el primer
  pedido, o el arranque— la sesión queda, como en D-E1b-5. Un error de la base
  en el gancho sale como hoy uno en el `before`: el ingreso falla, y la fila de
  `session` queda sin ninguna cookie que la use (§6.3).
- **El costo**: cada ingreso suma una transacción con una lectura `for share`,
  que espera unos milisegundos a una desactivación o a un cambio de rol en
  curso de esa persona.

**Alternativa descartada**: que `readSession` mande a `/login` toda sesión con
una membresía no activa. También cierra la carrera, pero vuelve inalcanzable
TT-92 —el estado que P-05 conserva para el pedido en vuelo— y cambia el
recorrido de decenas de tests de integración de las actions y de RP-07 en e2e,
que entran con una sesión y pasan la membresía a `inactive`. El gancho cierra la
carrera en el único lugar donde nace una sesión.

**Lo que cambia por pedido**: `decideSessionIdentity` (`entry.ts:57-62`) llama
hoy a la decisión completa para un correo fuera de los dominios. Con D-E2-1, un
externo con la membresía inactiva y la sesión abierta recibiría
`membresia_inactiva` y saldría a `/login`, mientras que alguien del dominio en
el mismo estado vería TT-92. **Desde E2 decide solo la identidad**, con una
función nueva de `access.ts`, `decideStoredIdentity`: el sufijo de un dominio,
o una invitación `pending` o `accepted`. El acceso por pedido lo sigue
decidiendo `ensureWorkspaceContext`, como en E1b, así que cada caso de D-E1b-13
da lo mismo que antes: un externo revocado sigue afuera por la identidad, y uno
aceptado sin membresía (E6) sigue afuera porque el contexto es `null`.

**D-E2-3 — Una sola action, `changeStatus`, idempotente por el estado pedido.**
`{ membershipId, status: "active" | "inactive" }`, como `changeRole` con su rol.
Reintentar después de perder la respuesta (EQ-97) o dos admins sobre la misma
fila (EQ-98) responden éxito sin escribir. Dentro de la transacción, después
del bloqueo (D-E2-6), en este orden:

1. La membresía pedida no está, es de otro workspace o es `invited`:
   `not_found`, EQ-82. Una `invited` no está en la lista (RP-64).
2. La membresía de quien actúa no está: `forbidden`.
3. Sin `team.manage` sobre el workspace, con la autoridad releída: `forbidden`,
   EQ-90.
4. La membresía pedida es la propia: `status_locked`, EQ-84.
5. La membresía pedida es `owner`: `status_locked`, EQ-83.
6. La membresía pedida es `admin` y falta `team.admin.setStatus`: `forbidden`,
   EQ-85.
7. Ya tiene el estado pedido: éxito sin escribir.
8. Reactivar a quien no tiene `account`: `no_account` (D-E2-7).
9. Escribe (D-E2-5).

Los pasos 4 y 5 van antes del 6, que mira el rol de la fila, porque EQ-40 pide
que un pedido armado responda EQ-83 o EQ-84; el 3 va antes para que un member no
reciba un texto que describe la fila. **No hay un paso de `team.manage` sobre la
membresía**: con el 1 y el 5 antes, no agrega nada al 3, porque `can()` solo lo
distingue del de workspace en el workspace y en la membresía del owner
(`permissions/index.ts:190-192`, `:208-215`). El 5 alcanza también a reactivar
una membresía `owner` inactiva por SQL: «la salida es SQL» (ADR 0023, «Sin piso
de admins»).

**D-E2-4 — `team.admin.setStatus`, solo del owner (P-07, EQ-38, EQ-85).** Con
la forma de `team.admin.revoke`: `MembershipResource`, `["membership"]` en
`resourceKinds` y `["owner"]` en `allowedRoles`. **Se consulta solo sobre una
fila `admin`**, para desactivar y para reactivar; `can()` no mira el rol de la
fila (ADR 0023, «Consecuencias»). Sobre el resto de los roles alcanza
`team.manage`: «Admins can bulk manage all regular roles (Team Members, Project
Managers, etc.)» (EQ-38). El cuerpo de `can()` no cambia.

**D-E2-5 — Desactivar es una transacción con tres escrituras, dos de ellas en
tablas ajenas (EQ-41, EQ-43, ADR 0025).** Después de las comprobaciones de
D-E2-3, en este orden:

1. `team` pasa `membership.status` a `inactive` con su repository —`status` es
   de `team` (ADR 0025)— y deja `membership.deactivate`.
2. **`stopRunningTimerOf`**, nueva en el service de `time-entry`: busca el timer
   abierto de la persona y lo cierra con `stopById` —el `now()` de la
   transacción, con piso en el inicio (TT-101)— y deja `timeEntry.stop` **con
   quien desactiva como actor**. Reusa `closeRunning`, que ya escribe con el
   actor que recibe. Sin timer, no escribe.
3. **`deleteSessionsOf`**, nueva en `src/server/auth-records.ts`: borra todas
   las filas de `session` de la persona y, si borró alguna, deja
   `session.revokeAll` con la cantidad. **No toca `account`** (EQ-41): sin ella
   la persona no podría volver a entrar al reactivarla (PF-47, EQ-110).

Ninguna de las dos funciones consulta `can()`: lo decidió `team` antes de
llamarlas (ADR 0025). Las dos reciben `tx` y no abren otra. Better Auth no
guarda la sesión en la cookie —`cookieCache` está apagado salvo `enabled: true`
(`node_modules/better-auth/dist/api/routes/session.mjs:39`), y `auth.ts` no lo
configura—, así que el pedido siguiente de la persona no tiene sesión y va a
`/login`.

**Reactivar** escribe solo la membresía (`active`, el mismo rol, EQ-37, EQ-47) y
`membership.reactivate`. No pone en marcha ningún timer (EQ-43) y no avisa
(EQ-48). Proyectos, tareas y grupos no se tocan al desactivar ni al reactivar
(EQ-45): las filas de `project_member` y `task_assignee` quedan.

**D-E2-6 — Los bloqueos, y la carrera con la propia persona.**

- **Desactivar y reactivar bloquean las dos membresías en una sentencia**
  ordenada por id, `for no key update`: la misma de `changeRole` (D-R8-7), que
  pasa a llamarse `lockForChange`. No choca con el `for key share` que toma un
  alta de horas por la clave de `time_entry` hacia `membership` (criterio 13 de
  R8), así que una desactivación no espera a una entrada cerrada en curso ni la
  traba.
- **Desactivar mientras la persona detiene su timer**: su `stopTimer` bloquea
  la fila de `time_entry` (`findByIdForUpdate`) y no toca `membership`. La
  desactivación bloquea la membresía y después actualiza esa fila: espera a que
  la persona confirme, vuelve a evaluar `ended_at is null` y no cierra nada.
  Queda un solo `timeEntry.stop`, el de quien ganó. Sin ciclo.
- **Desactivar mientras la persona abre un timer** es la carrera que el mapa no
  nombraba, y la que deja el daño: si el arranque confirma después de la
  desactivación, la persona inactiva queda con un timer corriendo que nadie
  puede detener —ella no entra y nadie edita entradas ajenas— hasta una
  corrección por SQL. El `for key share` del alta no espera al
  `for no key update` de la desactivación, así que la clave no alcanza.
  **Desde E2, abrir un timer lee primero la membresía propia `for share`**,
  antes de tocar `time_entry`, y responde TT-79 si no está activa. Lo hace
  `closeAndOpen`, el único camino que crea un timer (`startTimer` y
  `continueEntry`), con `isMembershipActiveLocked`, nueva en el service de
  `workspace` —dueño de la fila y de su lectura para la sesión (ADR 0025)—:
  - si el arranque toma la lectura primero, la desactivación espera, y su
    `findRunning`, una sentencia nueva, ve el timer recién abierto y lo cierra;
  - si la desactivación bloquea primero, el arranque espera, lee `inactive` y
    responde `forbidden` sin escribir.

  `for share` choca con `for no key update` y no con `for key share`: solo el
  arranque de un timer y el gancho de un ingreso (D-E2-2) se ponen en fila con
  una desactivación o con un cambio de rol, y unos milisegundos. Las demás altas
  no cambian.

- **El orden, con todo junto**: desactivar toma las membresías, después la fila
  del timer, después las de `session`. El arranque toma la membresía propia y
  después las filas de `time_entry`. El gancho de un ingreso toma la membresía
  propia y después, si borra, la fila de su `session`. Detener toma solo
  `time_entry`. Ninguno toma una membresía después de una fila de `time_entry`
  o de `session`, así que no hay ciclo.
- **Alternativas descartadas**: aceptar la carrera (deja el timer huérfano);
  `for update` en la desactivación (choca con el `for key share` de toda alta y
  abre un ciclo con un arranque que ya cerró el timer anterior y espera la
  clave); y que el cron diario cierre los timers de las inactivas (un timer
  corriendo hasta 24 horas y un trabajo programado más en el plan Hobby).
- **Las demás escrituras en vuelo** de la persona —una entrada cerrada, la
  planilla, una edición— pueden confirmar después de la desactivación: el
  pedido leyó la sesión antes y su `Actor` dice `active` (EQ-104). Dejan una
  entrada cerrada que la persona mandó antes de que la desactivaran, que es lo
  mismo que si hubiera llegado un instante antes. No se cierran.

**D-E2-7 — Reactivar a quien no tiene `account` se impide hasta E2b (EQ-110).**
Una persona con `user` y membresía pero sin `account` no puede entrar aunque se
la reactive, porque el enlace implícito está apagado (PF-47). Son las tres
inactivas que creó la importación de Clockify en producción y quien se
desactive con el procedimiento SQL antes de que E2 llegue a producción (§6.6).

- **La pantalla no ofrece «Reactivar»** en esa fila y muestra «Sin cuenta de
  Google vinculada.» debajo del correo. **El servidor responde `no_account`**
  con «Esa persona no tiene una cuenta de Google vinculada: todavía no se puede
  reactivar.», sin escribir.
- **Por qué impedir y no avisar**: el mapa ya ordena que E2b vaya «antes de
  reactivar a cualquiera de las seis». Reactivar sin cuenta deja una fila
  «activa» que no puede entrar, que el reporte y los selectores de P6 tratan
  como activa, y le quita a E2b la libertad de decidir cómo se le devuelve la
  entrada. Avisar compraba solo adelantar un clic. E2b levanta la restricción.
- **La cuenta se lee de dos formas**, como pide el ADR 0010: la lista la trae
  con un `exists` en el `join` del repository de `team` (se muestra), y
  `changeStatus` la exige con `hasAccount`, de `src/server/auth-records.ts` (es
  una regla).
- **EQ-21 queda sin salida para ellas**: invitar el correo de una inactiva
  responde «… está desactivada: reactivala desde la lista.», y la lista no deja
  reactivarla. Es el hueco de EQ-110 que cierra E2b (§10).

**D-E2-8 — La lista trae activas e inactivas; el filtro de estado vive en la URL
y se aplica en el navegador.**

- **El servidor lee siempre todo**: las membresías `active` e `inactive` (no
  `invited`) y, con `member.invite`, las invitaciones pendientes. El filtro no
  cambia lo que se lee. La lista es del tamaño de la empresa (EQ-10).
- **El filtro es `?estado=`** con `inactivas`, `invitadas` o `todas`; sin
  parámetro, o con uno inválido o repetido, «Activas» (EQ-06, EQ-100, como
  TS-10). La página lo parsea y se lo pasa a la pantalla, que muestra:

  | Filtro                | Personas       | Invitadas |
  | --------------------- | -------------- | --------- |
  | Activas (por omisión) | las `active`   | todas     |
  | Inactivas             | las `inactive` | ninguna   |
  | Invitadas             | ninguna        | todas     |
  | Todas                 | las dos        | todas     |

- **Orden**: las personas por `compareNames` sin mirar el estado, y después las
  invitadas por correo (D-E1a-12). Así una fila que cambia de estado no se
  mueve.
- **EQ-11, la fila que cambió se queda**: la pantalla guarda los ids de las
  membresías que cambió desde que se dibujó con ese filtro, y las muestra
  aunque el filtro ya no las incluya, con su estado nuevo. Los datos de la fila
  son siempre los del servidor; lo único que guarda el navegador es qué ids no
  se esconden. Recargar o cambiar el filtro los olvida.
- **Por qué en el navegador**: con el filtro en el servidor, la revalidación
  que sigue a desactivar sacaría la fila de «Activas», y EQ-11 pediría guardar
  una copia de la fila en el cliente, que es lo que el ADR 0008 evita. E5 suma
  la búsqueda y el filtro por rol del mismo modo, en la misma URL.

**D-E2-9 — El menú de la fila; el botón de R8 se queda.** La columna
«Acciones» suma, a la derecha del botón de rol de R8, un menú «Acciones de
{nombre}» con «Desactivar» o «Reactivar» (EQ-03). **El botón de R8 no se mueve**
a la columna «Rol» ni entra al menú: cambiarlo reescribe los recorridos de R8 y
de E1a por nada que E2 necesite. `parity-analyst` corrige la frase de EQ-35 que
lo ubica en «Rol». Una fila sin ninguna acción no tiene menú: la propia, la del
owner, la de un admin para otro admin y la inactiva sin cuenta. E3 y E6 suman
sus entradas al mismo menú. Desactivar confirma (EQ-46); reactivar no (EQ-47).
**Revocar invitación** sigue como botón: es la única acción de esa fila.

**D-E2-10 — Las dos lecturas de personas no se unifican.**
`listWorkspacePeople` (`workspace`) arma el catálogo del reporte: lo pide
cualquiera con `team.view`, lee con la transacción del reporte (ADR 0010) y no
lleva correo, rol ni cuenta. La de `team` es la pantalla de administración: pide
`team.manage` y lleva correo, rol, cuenta y lo que cada fila deja hacer. Las dos
leen el mismo `membership.status` y dejan fuera a `invited`, que es la única
regla que comparten. Unificarlas haría que el reporte cargue columnas de
administración o que `team` dependa del catálogo de otra pantalla.

**D-E2-11 — Revalidación: el árbol entero, como R8.** `changeStatus` revalida
`/` como layout (D-R8-8): cubre `/equipo`, el layout y el catálogo de personas
del reporte (EQ-101). La sesión de la persona desactivada no se revalida: ya no
existe.

**D-E2-12 — El procedimiento SQL se retira, sin migración.** Desde que E2 está
en producción, desactivar es la pantalla. No hay datos que mover: en
producción las tres inactivas no tienen `account`, sesiones ni timer (lo
confirma §6.1), y quedan como están, en «Inactivas» y sin «Reactivar» hasta
E2b. Hasta el despliegue, si hay que desactivar a alguien, se usa el
procedimiento de siempre, que sigue borrando `account` (D-E1b-7): esa persona
se suma a las de EQ-110. La corrección fechada del §5 del mapa del núcleo la
escribe `parity-analyst` (§7).

## 0. Precondición de arranque

- **`main` en `db0991d`**, con E1b mergeado y en producción. Las citas de abajo
  son de ese árbol y de `node_modules` con `better-auth` 1.7.7.
- **Los ADR 0023, 0024 y 0025, aceptados** (2026-10-16).
- **La consulta de §6.1 corrida en producción** antes de desplegar, no antes de
  implementar.

### Supuestos sobre el árbol, con archivo y línea en `db0991d`

| Supuesto                                                                                                                   | Dónde                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Una membresía en cualquier estado da acceso; `EntryFacts.membership` ya trae el estado                                     | `src/server/access.ts:30-35`, `:96-112`                                                                                         |
| `decideStoredEmail` decide identidad y acceso en una función                                                               | `access.ts:154-163`                                                                                                             |
| Los motivos son cuatro; `/login` muestra solo los que conoce                                                               | `access.ts:45-46`, `:165-171`, `:185-190`                                                                                       |
| `decideSessionIdentity` usa la decisión completa para un correo fuera de los dominios                                      | `src/server/entry.ts:57-62`                                                                                                     |
| `mapProfileToUser` y el gancho `session.create` traducen cualquier motivo; la sesión dura 14 días                          | `src/server/auth.ts:26-29`, `:76-88`, `:105-124`                                                                                |
| Sin caché de sesión en la cookie: cada pedido lee `session`                                                                | `auth.ts:26-29`; `node_modules/better-auth/dist/api/routes/session.mjs:39`                                                      |
| `readSession`: identidad, después `ensureWorkspaceContext`; el actor lleva el estado de la membresía                       | `src/server/session.ts:50-81`; `src/modules/workspace/service.ts:64-79`, `:87-96`                                               |
| `session` y `account` con índice por `user_id`                                                                             | `src/server/db/auth-schema.ts:17-34`, `:36-58`                                                                                  |
| `time_entry` apunta a `membership` por `(workspace_id, user_id)`, `restrict`; un solo timer abierto por persona            | `src/server/db/schema.ts:465-467`, `:509-513`                                                                                   |
| `can()` corta por estado; la membresía del owner solo la toca el owner; la forma de `team.admin.revoke`                    | `src/server/permissions/index.ts:60-63`, `:101`, `:132`, `:187-189`, `:209-215`                                                 |
| `getTeamView` lee solo las activas; `changeOf` no mira el estado                                                           | `src/modules/team/service.ts:57-67`, `:88-97`; `team/repository.ts:36-52`                                                       |
| `changeRole`: el bloqueo de las dos membresías, la autoridad releída, el owner y la inactiva                               | `team/service.ts:120-181`; `team/repository.ts:65-88`                                                                           |
| Las actions de `team` revalidan el árbol entero                                                                            | `team/actions.ts:16-20`                                                                                                         |
| Textos, códigos, la vista y las actions de `team`                                                                          | `team/schema.ts:25-37`, `:55-75`, `:81-85`                                                                                      |
| La tabla: el botón de R8 en «Acciones», un pedido a la vez, el foco de R8, el vacío de EQ-93                               | `team/components/team-members.tsx:130`, `:137-149`, `:205-206`, `:301-397`                                                      |
| La confirmación de revocar: cierra al confirmar y devuelve el foco a la fila                                               | `team/components/revoke-invitation-dialog.tsx:31-74`                                                                            |
| La página de `/equipo` no lee parámetros; la planilla los lee como promesa y descarta lo inválido                          | `src/app/(app)/equipo/page.tsx:8-22`; `src/app/(app)/planilla/page.tsx:11-14`                                                   |
| `closeRunning` escribe `timeEntry.stop` con el actor que recibe; `stopById` cierra con el `now()` de la transacción y piso | `src/modules/time-entry/service.ts:301-320`; `time-entry/repository.ts:723-733`                                                 |
| Un timer nace solo en `closeAndOpen`, que no lee la membresía                                                              | `time-entry/service.ts:482-501`, `:543-549`, `:587-594`; `time-entry/repository.ts:664-686`                                     |
| Un alta de horas sostiene `for key share` sobre la membresía, que `for no key update` no espera                            | `team/concurrency.integration.test.ts:176-216`                                                                                  |
| `lockActorMembership` lee la membresía `for share`                                                                         | `workspace/repository.ts:157-173`                                                                                               |
| El catálogo de personas del reporte: activas e inactivas, con `team.view` y la transacción de quien llama                  | `workspace/service.ts:192-225`; `workspace/repository.ts:127-146`                                                               |
| El texto de EQ-79 manda a reactivar «desde la lista»                                                                       | `src/modules/workspace/schema.ts:26`                                                                                            |
| El aviso de TT-92                                                                                                          | `src/components/inactive-membership-notice.tsx:10-18`                                                                           |
| Las fábricas de integración crean `user` y membresía sin `account`                                                         | `src/test/factories.ts:36-47`, `:67-76`                                                                                         |
| La sesión de prueba crea `user` y `session`, sin `account`, y pasa por el gancho                                           | `src/server/test-session.ts:84-101`                                                                                             |
| Los e2e siembran inactivas sin cuenta y pasan la membresía propia a `inactive` por SQL                                     | `e2e/database.ts:418-442`, `:566-577`; `e2e/reports.spec.ts:525`                                                                |
| `signIn` siembra la invitación solo sin membresía; `signInRejected` espera el 403                                          | `e2e/session.ts:82-115`; `e2e/database.ts:473-490`                                                                              |
| `rowButtons` cuenta los botones de la fila                                                                                 | `e2e/team-page.ts:89-92`                                                                                                        |
| Tests que afirman D-E1b-7                                                                                                  | `src/server/access.test.ts:208`, `:295`; `src/server/entry.integration.test.ts:90`; `workspace/service.integration.test.ts:176` |
| El script de importación lee el estado y no cambia el de una membresía que existe                                          | `scripts/import-clockify/main.ts:237-263`, `:506-516` (rama `ops/importar-clockify`)                                            |

Las citas de `node_modules` del gancho `session.create.after` están en D-E2-2, y
la del refresco de una sesión borrada, en §10.

## 1. Alcance

Cubre EQ-03 (el menú de la fila), EQ-05, EQ-06, EQ-11, EQ-37 … EQ-48, EQ-82 …
EQ-85, EQ-90 (para la acción nueva), EQ-92, EQ-94 (los dos vacíos de estado; el
de la búsqueda llega con E5), EQ-98, EQ-99, EQ-100 (el filtro de estado),
EQ-101 … EQ-104, EQ-110 (D-E2-7: se impide, la salida es E2b) y RP-60 y RP-63.

Entra:

- **La regla de ingreso** con `membresia_inactiva` y la identidad por pedido
  (D-E2-1, D-E2-2).
- **El gancho `session.create.after`** en `auth.ts`, con `dropSessionOfInactive`
  en `entry.ts`, `deleteSession` en `auth-records.ts` y
  `entryMembershipStatusLocked` en `workspace` (D-E2-2).
- **`team.admin.setStatus`** en `can()` (D-E2-4).
- **`changeStatus`** en `team`, con sus escrituras ajenas: `stopRunningTimerOf`
  en `time-entry` y `deleteSessionsOf` y `hasAccount` en
  `src/server/auth-records.ts`, nuevo (D-E2-3, D-E2-5, D-E2-7).
- **La lectura con bloqueo al abrir un timer**: `isMembershipActiveLocked` en
  `workspace` y su llamada en `closeAndOpen` (D-E2-6).
- **La pantalla**: las inactivas en la lista, el filtro de estado, el menú de la
  fila, la confirmación de desactivar, los avisos y los vacíos (§5).
- **Tests** de unidad, integración y e2e (§9).

Queda afuera: §12.

### Consecuencias sobre código ya entregado

| Archivo                                                                   | Qué cambia                                                                                                   | Qué hay que volver a probar                                      |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `src/server/access.ts`, `access.test.ts`                                  | `membresia_inactiva`; el acceso exige `active`; `decideStoredIdentity`                                       | `access.test.ts` entero; `:208` y `:295` se invierten            |
| `src/server/entry.ts`, `entry.integration.test.ts`                        | `decideSessionIdentity` decide solo la identidad; `dropSessionOfInactive`                                    | el archivo; `:90` se invierte                                    |
| `src/server/auth.ts`, `auth.integration.test.ts`                          | El gancho `session.create.after`; el callback y el `before` con una inactiva                                 | el archivo                                                       |
| `src/server/session.integration.test.ts`                                  | Un externo inactivo con sesión abierta recibe el contexto (TT-92)                                            | el archivo                                                       |
| `src/server/permissions/index.ts`, `permissions.test.ts`                  | `team.admin.setStatus`                                                                                       | la tabla entera                                                  |
| `src/modules/workspace/service.ts`                                        | `isMembershipActiveLocked` y `entryMembershipStatusLocked`                                                   | `workspace/service.integration.test.ts`; `:176` cambia el título |
| `src/modules/time-entry/service.ts`                                       | `stopRunningTimerOf`; `closeAndOpen` lee la membresía primero                                                | los tests de arranque y de continuar, y los de TT-92 de actions  |
| `src/modules/team/schema.ts`, `repository.ts`, `service.ts`, `actions.ts` | La vista con estado, cuenta y acciones; `changeStatus`; `listMembers` y `lockForChange` renombran            | `team/*.test.ts` y `team/*.integration.test.ts`                  |
| `src/modules/team/components/*`, `src/app/(app)/equipo/page.tsx`          | El filtro, las inactivas, el menú, la confirmación                                                           | los tests de componente de `team`                                |
| `src/app/login/page.test.tsx`                                             | El caso de `membresia_inactiva`                                                                              | el archivo                                                       |
| `src/test/factories.ts`                                                   | `seedAccount` y `seedSession`                                                                                | —                                                                |
| `e2e/team-page.ts`, `e2e/database.ts`                                     | Los localizadores del menú, del filtro y de las inactivas; la cuenta, las sesiones y el timer de una persona | `team.spec.ts`, `invitations.spec.ts`, `entry.spec.ts`           |
| `CLAUDE.md`, «Estructura»                                                 | La línea de `src/server/auth-records.ts`                                                                     | —                                                                |

- **Sin cambio**: `report`, `project`, `profile`, `drizzle/`,
  `src/server/db/schema.ts`, `src/server/session.ts`,
  `src/server/test-session.ts` y `/login` (el código; su test suma un caso).
- **TT-92 no cambia**: `ensureWorkspaceContext` sigue devolviendo el contexto de
  una membresía inactiva, y todo lo que hoy se dibuja en solo lectura sigue
  igual (D-E2-2).
- **El criterio 13 de R8 sigue valiendo** para una entrada cerrada; un cambio
  de rol ahora espera a un arranque de timer en curso de esa persona, y al
  revés (D-E2-6).

## 2. Esquema y migración

**Ningún cambio de esquema y ninguna migración.** `membership.status` existe con
`active` e `inactive`; `session` y `account` tienen su índice por `user_id`;
`audit_log` ya guarda cualquier acción. `drizzle/` no se toca.

## 3. Permisos

**Una acción nueva**, en la unión `Action` y en sus dos tablas:

| Acción                 | Recurso              | Roles       | Se consulta                                              |
| ---------------------- | -------------------- | ----------- | -------------------------------------------------------- |
| `team.admin.setStatus` | `MembershipResource` | `["owner"]` | solo sobre una fila `admin`, para desactivar o reactivar |

Con un comentario como el de `team.admin.revoke`: «D-E2-4, P-07: solo el owner
desactiva o reactiva a un admin. Se consulta solo sobre una membresía `admin`:
`can()` no mira el rol de la membresía para esta acción.».

El resto sigue en `team.manage` sobre `MembershipResource`: owner y admin, con
la regla existente de que la membresía del owner solo la toca el owner. **El
ingreso no pasa por `can()`**: es la regla de `access.ts`, sin actor (ADR 0024),
y el gancho de D-E2-2 tampoco: no hay actor todavía.

## 4. Contrato

### 4.1 La regla (`src/server/access.ts`)

Sigue pura.

```ts
export type AccessDenialReason =
  | "sin_email"
  | "email_no_verificado"
  | "dominio_no_habilitado"
  | "sin_invitacion"
  | "membresia_inactiva";

/**
 * D-E2-2: solo la identidad del correo guardado: el sufijo de un dominio, o
 * una invitación `pending` o `accepted`. La usa `entry.ts` en cada pedido de
 * una sesión abierta; el acceso lo decide `ensureWorkspaceContext`.
 */
export function decideStoredIdentity(
  email: string,
  policy: AccessPolicy,
  facts: EntryFacts,
): AccessDecision;

/** Identidad (`decideStoredIdentity`) y acceso, en cada inicio de sesión. */
export function decideStoredEmail(
  email: string,
  policy: AccessPolicy,
  facts: EntryFacts,
): AccessDecision;
```

- **`decideAccess`** sigue la tabla de D-E2-1.
- **`EntryFacts.membership`**: el comentario dice que solo `active` da acceso y
  que cualquier otro estado responde `membresia_inactiva` (D-E2-1).
- **`accessDenialMessage.membresia_inactiva`**: «Tu acceso al workspace está
  desactivado. Pedile a quien administra el equipo que te vuelva a activar.»
  (EQ-92). Los otros cuatro no cambian.
- `decideGoogleAccess`, `verifiedEmailOf`, `isBootstrapOwner` y
  `loginErrorMessage` no cambian de firma.

### 4.2 El armado y el gancho (`src/server/entry.ts`, `src/server/auth.ts`)

`decideSessionIdentity` llama a `decideStoredIdentity` con los hechos del
correo, en lugar de `decideStoredEmailEntry`. Un correo de los dominios sigue
sin consultar. El comentario dice que por pedido se decide solo la identidad
(D-E2-2). Suma:

```ts
/**
 * D-E2-2: cierra la carrera de un ingreso con una desactivación. La llama el gancho
 * `session.create.after`, con la fila de `session` ya confirmada: en una transacción,
 * lee `for share` la membresía de `session.userId` —espera a una desactivación en
 * curso— y, si existe y no está activa, borra la sesión. No lanza por eso. Devuelve
 * si la borró.
 */
export async function dropSessionOfInactive(session: {
  readonly id: string;
  readonly userId: string;
}): Promise<boolean>;
```

Por dentro: `db.transaction`, `entryMembershipStatusLocked(tx, session.userId)`
(§4.4) y, si devuelve un estado distinto de `active`, `deleteSession(tx,
session.id)` (§4.3). `null` no borra. Las demás funciones no cambian.

**`auth.ts`** suma `after` a `databaseHooks.session.create`, al lado del
`before`, que no cambia: llama a `dropSessionOfInactive` con la fila que recibe
y no devuelve nada. El comentario remite a D-E2-2 y dice por qué no lanza. Nada
más de `auth.ts` cambia.

### 4.3 Las tablas de Better Auth (`src/server/auth-records.ts`, nuevo)

```ts
/**
 * Lo que la aplicación lee y escribe de las tablas de Better Auth fuera del
 * login (ADR 0025): `user`, `account`, `session` y `verification` son del
 * código de `src/server/` que configura el ingreso. Cada función recibe la
 * transacción de quien llama y no abre otra.
 */

/**
 * EQ-41, D-E2-5: borra todas las sesiones de `userId` y, si borró alguna, deja
 * `session.revokeAll` con `actor` como autor (`entity: "user"`, `entityId:
 * userId`, `previousValue: { sessions: n }`). No toca `account`. No consulta
 * permisos: la usa `changeStatus` de `team`, que ya los decidió. Devuelve
 * cuántas borró.
 */
export async function deleteSessionsOf(
  tx: Transaction,
  actor: Actor,
  userId: string,
): Promise<number>;

/**
 * D-E2-2: borra la sesión `sessionId`, sin constancia: ningún pedido la usó, porque
 * la cookie sale con la respuesta del callback, después del gancho que la borra.
 */
export async function deleteSession(tx: Transaction, sessionId: string): Promise<void>;

/** D-E2-7: si `userId` tiene alguna fila de `account`. Solo lee (ADR 0010). */
export async function hasAccount(tx: Transaction, userId: string): Promise<boolean>;
```

- El audit nunca guarda tokens ni ids de sesión: solo la cantidad.
- `CLAUDE.md` suma la línea del archivo en «Estructura», debajo de `auth.ts`.

### 4.4 `workspace`: las lecturas con bloqueo (`service.ts`)

```ts
/**
 * D-E2-6: si la membresía de `actor` sigue activa, leída `for share` con `tx`.
 * Espera a una desactivación o a un cambio de rol en curso (`for no key
 * update`) y lee lo que confirmaron. No choca con el `for key share` de un
 * alta. La usa `time-entry` al abrir un timer, antes de tocar `time_entry`.
 * Solo lee; el bloqueo lo nombra el contrato de E2 (ADR 0010).
 */
export async function isMembershipActiveLocked(
  tx: Transaction,
  actor: Actor,
): Promise<boolean>;

/**
 * D-E2-2: el estado de la membresía de `userId` en el workspace, leído `for share`
 * con `tx`; `null` sin workspace o sin membresía. Lee sin actor: no hay sesión
 * todavía. La usa `entry.ts` en el gancho `session.create.after`. Solo lee; el
 * bloqueo lo nombra el contrato de E2 (ADR 0010).
 */
export async function entryMembershipStatusLocked(
  tx: Transaction,
  userId: string,
): Promise<MembershipStatus | null>;
```

Las dos usan `lockActorMembership` del repository, que ya lee `for share`.
`isMembershipActiveLocked`, sin membresía, devuelve `false`.
`entryMembershipStatusLocked` busca el workspace como `entryFactsOf`.

### 4.5 `time-entry` (`service.ts`)

```ts
/**
 * ADR 0025, EQ-43: detiene el timer abierto de `person` con el instante de la
 * transacción y deja `timeEntry.stop` con `actor` —quien desactiva— como
 * autor. No consulta permisos: la usa `changeStatus` de `team`, que ya los
 * decidió. `null` si no había timer o si otro pedido lo cerró mientras tanto.
 */
export async function stopRunningTimerOf(
  tx: Transaction,
  actor: Actor,
  person: { readonly workspaceId: string; readonly userId: string },
): Promise<{ readonly id: string; readonly endedAt: Date } | null>;
```

- Por dentro: `findRunning(person.workspaceId, person.userId, tx)` y
  `closeRunning(tx, actor, row)`. No toma bloqueos propios fuera de los del
  `update` de `stopById` (ADR 0025).
- **`closeAndOpen`**, primera lectura: `isMembershipActiveLocked(tx, actor)`; si
  devuelve `false`, `TimeEntryError("forbidden", timeEntryMessages.forbidden)`
  (TT-79) sin escribir. Va antes de `findRunning`, con un comentario que remite
  a D-E2-6.
- Las demás funciones no cambian.

### 4.6 Esquemas (`src/modules/team/schema.ts`)

```ts
/** Los estados que la pantalla muestra y escribe (D-E2-3). `invited` no está. */
export const MEMBER_STATUSES = ["active", "inactive"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/** D-E2-8: el filtro de `?estado=`; sin parámetro, `activas`. */
export const TEAM_FILTERS = ["activas", "inactivas", "invitadas", "todas"] as const;
export type TeamFilter = (typeof TEAM_FILTERS)[number];
export const teamSearchParams = z.object({ estado: z.enum(TEAM_FILTERS).optional() });

/** Un cambio de estado por pedido. El workspace sale de la sesión (D-R8-6). */
export const changeStatusInput = z.object(
  {
    membershipId: z.uuid({ error: teamMessages.notFound }),
    status: z.enum(MEMBER_STATUSES, { error: teamMessages.statusUnavailable }),
  },
  { error: teamMessages.statusUnavailable },
);
export type ChangeStatusInput = z.infer<typeof changeStatusInput>;

/** El estado que quedó, también si ya era ese (D-E2-3). */
export type ChangeStatusResult = {
  readonly membershipId: string;
  readonly status: MemberStatus;
};

export type TeamErrorCode =
  | ActionErrorCode
  | "role_locked"
  | "inactive_membership"
  | "status_locked"
  | "no_account";
```

**`teamMember`** suma:

```ts
status: z.enum(MEMBER_STATUSES),
/** D-E2-7: si tiene una fila de `account`; sin ella no se reactiva hasta E2b. */
hasAccount: z.boolean(),
/**
 * D-E2-3, D-E2-4: `deactivate` en una activa, `reactivate` en una inactiva con
 * cuenta, si `can()` y las reglas lo dejan; `null` sin control.
 */
statusChange: z.enum(["deactivate", "reactivate"]).nullable(),
```

y `change` pasa a ser `null` en una fila inactiva (EQ-37, P-06). El comentario
de `teamView` `ready` dice «las membresías activas e inactivas, en el orden de
`compareNames`».

**`teamMessages`** suma (los textos de error de la acción nueva):

| Clave                  | Texto                                                                                 | Fuente |
| ---------------------- | ------------------------------------------------------------------------------------- | ------ |
| `forbiddenAction`      | «No tenés permiso para hacer esto.»                                                   | EQ-90  |
| `ownerStatusLocked`    | «El propietario no se desactiva.»                                                     | EQ-83  |
| `selfStatusLocked`     | «No podés desactivar tu propia membresía.»                                            | EQ-84  |
| `adminStatusOwnerOnly` | «Solo el propietario desactiva o reactiva a un administrador.»                        | EQ-85  |
| `noAccount`            | «Esa persona no tiene una cuenta de Google vinculada: todavía no se puede reactivar.» | EQ-114 |
| `statusUnavailable`    | «Ese estado no está disponible.»                                                      | propio |
| `unexpectedStatus`     | «No se pudo cambiar el estado. Revisá la conexión y volvé a intentar.»                | TT-89  |

EQ-114 es nuevo: lo registra `parity-analyst` (§7). `notFound` (EQ-82) se reusa.

**`TeamActions`** suma `changeStatus: (input: ChangeStatusInput) =>
Promise<ActionResult<ChangeStatusResult, TeamErrorCode>>`.

### 4.7 Repository (`src/modules/team/repository.ts`)

- **`listActiveMembers` → `listMembers(workspaceId)`**: las membresías `active`
  e `inactive` del workspace, con `status` y
  `hasAccount: exists (select 1 from account where account.user_id = membership.user_id)`
  (ADR 0010: se muestra). Sin orden.
- **`lockForRoleChange` → `lockForChange`**: la misma sentencia (D-R8-7). El
  comentario nombra a `changeRole` y a `changeStatus`.
- **`updateStatus(tx, workspaceId, membershipId, status: MemberStatus)`**, como
  `updateRole`.

### 4.8 Service (`src/modules/team/service.ts`)

```ts
/** D-E2-3 a D-E2-7. */
export async function changeStatus(
  actor: Actor,
  input: ChangeStatusInput,
): Promise<ChangeStatusResult>;
```

- **Antes de la transacción**, `canManageTeam(actor)`; si no, `forbidden` con
  `forbiddenAction`, como `changeRole`.
- **En la transacción**: `lockForChange`, `freshActorOf`, y los pasos de
  D-E2-3 con estos códigos y textos: `not_found`/`notFound`,
  `forbidden`/`forbiddenAction` (pasos 2 y 3), `status_locked`/`selfStatusLocked`,
  `status_locked`/`ownerStatusLocked`, `forbidden`/`adminStatusOwnerOnly`, éxito
  sin escribir, `no_account`/`noAccount` (con `hasAccount(tx, target.userId)`).
- **Desactivar** (D-E2-5): `updateStatus` a `inactive`; `recordAudit` de
  `membership.deactivate` (`entity: "membership"`, `previousValue: { status:
"active" }`, `nextValue: { status: "inactive" }`, quien actúa como actor);
  `stopRunningTimerOf(tx, actor, { workspaceId, userId: target.userId })`;
  `deleteSessionsOf(tx, actor, target.userId)`.
- **Reactivar**: `updateStatus` a `active` y `membership.reactivate`, con los
  estados al revés.
- **`getTeamView`**: `listMembers`; cada fila con `status`, `hasAccount`,
  `change` (`null` si es inactiva) y `statusChange`, que calcula
  `statusChangeOf(actor, row)` con los mismos pasos 3 a 6 y 8 de D-E2-3 sobre
  el `Actor` de la sesión: `team.manage` sobre el workspace; ni la propia ni la
  del owner; `team.admin.setStatus` si es `admin`; `deactivate` si es activa,
  `reactivate` si es inactiva con cuenta, si no `null`.
- **Exporta** `changeStatus` además de lo que ya exporta. Importa
  `stopRunningTimerOf` de `time-entry` y `deleteSessionsOf` y `hasAccount` de
  `@/server/auth-records`. Las dependencias siguen en una dirección: `team` →
  `time-entry` → `workspace`; ninguno de los dos importa `team` (ADR 0025).

### 4.9 Actions (`src/modules/team/actions.ts`)

```ts
export async function changeStatus(
  input: ChangeStatusInput,
): Promise<ActionResult<ChangeStatusResult, TeamErrorCode>>;
// handle(…, {
//   paths: [{ path: "/", type: "layout" }],          // D-E2-11
//   messages: { forbidden: forbiddenAction, unexpected: unexpectedStatus },
// })
```

`changeRole` conserva sus mensajes: cada action con su objeto de opciones.

### 4.10 Las respuestas

| Situación                                                | Código                            | Mensaje                     | Reintentar |
| -------------------------------------------------------- | --------------------------------- | --------------------------- | ---------- |
| Desactivó o reactivó                                     | ok                                | —                           | —          |
| Ya tenía el estado pedido                                | ok, sin escribir                  | —                           | —          |
| Id que no está, de otro workspace o `invited`            | `not_found`                       | EQ-82                       | no         |
| Id que no es uuid, o estado que no existe                | `validation`                      | EQ-82 o `statusUnavailable` | no         |
| Sin `team.manage`, o lo perdió bajo el bloqueo           | `forbidden`                       | EQ-90                       | no         |
| Un admin sobre otro admin                                | `forbidden`                       | EQ-85                       | no         |
| La propia                                                | `status_locked`                   | EQ-84                       | no         |
| La del owner                                             | `status_locked`                   | EQ-83                       | no         |
| Reactivar sin `account`                                  | `no_account`                      | EQ-114                      | no         |
| Red o servidor                                           | `unexpected`                      | `unexpectedStatus`          | sí         |
| Abrir un timer con la membresía ya inactiva bajo bloqueo | `forbidden` (timer)               | TT-79                       | no         |
| Ingreso de una inactiva                                  | `/login?error=membresia_inactiva` | EQ-92                       | —          |
| Ingreso que pierde la carrera con una desactivación      | `/login`, sin motivo              | EQ-92 al reintentar         | —          |

## 5. Pantalla

### 5.1 La página (`src/app/(app)/equipo/page.tsx`)

`TeamPage({ searchParams }: PageProps<"/equipo">)`: `requireSession()`, después
`teamSearchParams.safeParse(await searchParams)` —inválido o repetido,
`activas`, como la planilla—, `getTeamView` y, si es `ready`,
`getInvitationsView`. Pasa a `TeamScreen` las dos vistas, el filtro y las cuatro
actions (`changeRole`, `changeStatus`, `inviteMembers`, `revokeInvitation`).

### 5.2 El filtro de estado

- Debajo de la introducción, a la izquierda: un `Select` (`@/components/ui/select`)
  con la etiqueta visible «Estado» y las opciones «Activas», «Inactivas»,
  «Invitadas» y «Todas», en ese orden.
- **Elegir navega**: `router.push` a `/equipo` (Activas) o a
  `/equipo?estado=<valor>`, como los filtros del reporte. La página se vuelve
  a dibujar con el filtro nuevo; la pantalla se monta con `key={filter}`, así
  que olvida las filas que se quedaban (EQ-11) y el último aviso.
- Lo que muestra cada filtro, el orden y las filas que se quedan: D-E2-8, en
  funciones puras de `team-members-model.ts` (`visibleMembers`,
  `visibleInvitations`, `filterHref`).

### 5.3 La fila de una persona

- **Activa**: como hoy (R8, E1a).
- **Inactiva** (EQ-05): el nombre con `line-through` y, después, «(inactiva)»
  sin tachar y en gris, dentro del encabezado de fila, como en el reporte
  (RP-62). En «Rol», el rótulo sin botón (EQ-37). Si no tiene cuenta, debajo
  del correo, en gris, «Sin cuenta de Google vinculada.» (D-E2-7).
- **El menú** (D-E2-9): en «Acciones», a la derecha del botón de R8 si lo hay,
  un botón con el ícono `EllipsisVertical` y nombre accesible «Acciones de
  {nombre}», como el de una entrada del rastreador. Abre un `DropdownMenu` con
  «Desactivar» (`statusChange: "deactivate"`) o «Reactivar» (`"reactivate"`).
  Sin `statusChange`, la fila no tiene menú.

### 5.4 Desactivar y reactivar

- **«Desactivar»** abre la confirmación (EQ-46), con la forma de la de revocar:
  título «¿Desactivar a {nombre}?», el texto «No va a poder entrar. Si tiene un
  timer en curso, se detiene. Sus horas quedan.», «Cancelar» y «Desactivar»
  (`destructive`). Confirmar cierra el diálogo y manda el pedido; el foco vuelve
  al menú de la fila, que queda en `aria-disabled` mientras viaja.
- **«Reactivar»** manda el pedido al elegirlo, sin confirmación (EQ-47).
- **Con éxito** la fila se queda donde estaba con su estado nuevo, aunque el
  filtro ya no la incluya (EQ-11), y la pantalla anuncia «Desactivaste a
  {nombre}.» o «Reactivaste a {nombre}.» en el aviso de la tabla (`status`).
  Cuando la revalidación trae la fila con el estado del resultado, el foco va a
  su menú si lo tiene, y si no a su encabezado de fila, como R8 (§5.4 de R8).
- **Con error**, el aviso de la tabla con el título «No se pudo desactivar a
  {nombre}.» o «No se pudo reactivar a {nombre}.» y el mensaje del resultado;
  con `unexpected`, el cuerpo de siempre y «Reintentar» (TT-89).
- **Un pedido a la vez en la tabla**: con un cambio de rol, una revocación o un
  cambio de estado en vuelo, los botones de rol, de revocar y los menús quedan
  en `aria-disabled`, y elegir una entrada de un menú no manda nada (como
  `activate`).

### 5.5 Los vacíos

- **EQ-94**: con «Inactivas» y ninguna fila para mostrar, «No hay personas
  inactivas.»; con «Invitadas» y ninguna, «No hay invitaciones pendientes.». El
  párrafo va en lugar de la tabla.
- **EQ-93**: con «Activas» o «Todas», cuando la vista trae una sola membresía
  —la de quien mira, en cualquier estado— y ninguna invitada. Una inactiva
  cuenta como otra persona: ya invitaste a alguien.

### 5.6 Textos (`team/components/labels.ts`)

Suma: `statusFilter` («Estado»), los cuatro rótulos de `TeamFilter`,
`inactiveMark` («(inactiva)»), `noAccount` («Sin cuenta de Google
vinculada.»), `rowActions` («Acciones de {nombre}»), `deactivate`,
`reactivate`, `deactivateTitle`, `deactivateBody`, `deactivateConfirm`,
`deactivated`, `reactivated`, `deactivateFailed`, `reactivateFailed`,
`emptyInactive` y `emptyInvited`, con los textos de §5.2 a §5.5. `intro` suma
«Solo el propietario desactiva o reactiva a un administrador.». Los mensajes de
error salen de `teamMessages`.

## 6. La transición en producción

Hechos que el contrato da por dados: Vercel despliega `main` a producción en
cada push y el build no corre migraciones; las migraciones las corre el usuario
con `!` antes del push del merge que las necesita. **E2 no trae migración**: no
hay ningún paso con `!` contra la base antes del push, salvo la consulta. E1b
está en producción. Producción tiene diez membresías `active` y tres `inactive`,
estas creadas por la importación de Clockify, sin `account`.

### 6.1 La consulta previa

La corre el usuario en producción, con `!`, lo más cerca posible del push. Todo
correo como `lower(btrim(email))` (D-E1b-1).

```sql
-- 1. Las membresías, con su cuenta, sus sesiones y su timer.
with ws as (select id from workspace order by created_at, id limit 1)
select lower(btrim(u.email)) as correo, m.role as rol, m.status as estado,
       exists (select 1 from account a where a.user_id = u.id) as con_cuenta,
       (select count(*) from session s where s.user_id = u.id) as sesiones,
       exists (select 1 from time_entry t
                where t.workspace_id = m.workspace_id and t.user_id = m.user_id
                  and t.ended_at is null) as timer_en_curso
from membership m
join ws on ws.id = m.workspace_id
join "user" u on u.id = m.user_id
order by m.status, correo;

-- 2. Lo que tiene que dar cero filas: una no activa con sesiones o con timer.
with ws as (select id from workspace order by created_at, id limit 1)
select lower(btrim(u.email)) as correo, m.status as estado
from membership m
join ws on ws.id = m.workspace_id
join "user" u on u.id = m.user_id
where m.status <> 'active'
  and (exists (select 1 from session s where s.user_id = u.id)
       or exists (select 1 from time_entry t
                   where t.workspace_id = m.workspace_id and t.user_id = m.user_id
                     and t.ended_at is null));

-- 3. Informativa, no frena: las activas sin cuenta, que hoy no pueden entrar (PF-47).
with ws as (select id from workspace order by created_at, id limit 1)
select lower(btrim(u.email)) as correo, m.role as rol
from membership m
join ws on ws.id = m.workspace_id
join "user" u on u.id = m.user_id
where m.status = 'active'
  and not exists (select 1 from account a where a.user_id = u.id)
order by correo;
```

Lo esperado: la consulta 1 con diez `active` con cuenta y tres `inactive` sin
cuenta, sin sesiones ni timer; la 2 y la 3, vacías. Qué se hace si no:

- **Una no activa con sesiones** (la 2) se para: con E2 su sesión seguiría
  abierta en solo lectura (D-E2-2). Se borran con su constancia y se repite la
  consulta:

  ```sql
  with ws as (select id from workspace order by created_at, id limit 1),
  deleted as (
    delete from session s
    using membership m, ws
    where m.workspace_id = ws.id and m.status <> 'active' and s.user_id = m.user_id
    returning s.user_id, m.workspace_id
  )
  insert into audit_log (workspace_id, actor_id, action, entity, entity_id, previous_value)
  select workspace_id, null, 'session.revokeAll', 'user', user_id,
         json_build_object('sessions', count(*))::text
  from deleted
  group by workspace_id, user_id;
  ```

- **Una no activa con timer** (la 2) se para: nadie lo puede detener desde la
  aplicación. Se cierra como lo haría `stopRunningTimerOf`, sin actor, y se
  repite:

  ```sql
  with ws as (select id from workspace order by created_at, id limit 1),
  stopped as (
    update time_entry t
    set ended_at = greatest(now(), t.started_at), updated_at = now()
    from membership m, ws
    where m.workspace_id = ws.id and m.status <> 'active'
      and t.workspace_id = m.workspace_id and t.user_id = m.user_id
      and t.ended_at is null
    returning t.id, t.workspace_id, t.ended_at
  )
  insert into audit_log (workspace_id, actor_id, action, entity, entity_id, previous_value, next_value)
  select workspace_id, null, 'timeEntry.stop', 'time_entry', id::text,
         json_build_object('endedAt', null)::text,
         json_build_object('endedAt', ended_at)::text
  from stopped;
  ```

- **Una activa sin cuenta** (la 3) no frena y no tiene sentencia: no puede
  entrar hoy (PF-47) y E2 no lo cambia. Se anota para E2b; si se la desactiva,
  no se va a poder reactivar hasta E2b (D-E2-7).

### 6.2 El despliegue, en este orden

1. **La consulta previa** de §6.1, con la 2 vacía.
2. **El merge y el push**: el team-lead mergea E2 en `main` y pushea; Vercel
   despliega. No hay migración que correr antes.

Mientras Vercel cambia de versión, una instancia vieja deja entrar a una
inactiva con cuenta (D-E1b-7); en producción no hay ninguna, y nadie puede
desactivar desde la pantalla hasta que la versión nueva atiende.

### 6.3 Después del despliegue

La consulta 2 de §6.1 vuelve a dar cero filas. Se repite, sin urgencia, después
de las primeras desactivaciones. Con el gancho de D-E2-2 la carrera con un
ingreso no deja sesiones, así que una fila con sesiones es un estado escrito por
SQL o la fila de un ingreso que falló en el gancho, sin cookie que la use; la
salida es la sentencia de borrado de §6.1.

### 6.4 La verificación de humo

1. **El owner entra a `/equipo`**: ve «Estado» con «Activas», su fila sin menú
   y, en las demás, «Acciones de {nombre}» con «Desactivar». No lo elige.
2. **Con «Inactivas»** la URL pasa a `?estado=inactivas` y aparecen las tres
   inactivas, tachadas, con «(inactiva)», «Sin cuenta de Google vinculada.» y
   sin menú.
3. **En una ventana privada, sin sesión**, `/login?error=membresia_inactiva`
   muestra el texto de EQ-92. Con E1b ese código no era un motivo y mostraba
   «No se pudo iniciar sesión. Volvé a intentar.»: el texto nuevo confirma que
   el código desplegado es el de E2.

No se desactiva a nadie en producción para probar: corta las sesiones y el timer
de una persona real. El camino lo cubren la integración y la e2e (§9).

### 6.5 Reversión

`git revert -m 1 <merge de E2>` y push. No hay migración que conservar.

**Lo que la reversión deja abierto**: con el código de E1b, una membresía
inactiva vuelve a dar acceso (D-E1b-7), y quien se desactivó desde la pantalla
conserva su `account`, así que puede volver a entrar y ver sus horas en solo
lectura (TT-92) hasta que E2 vuelva. La lista:

```sql
with ws as (select id from workspace order by created_at, id limit 1)
select lower(btrim(u.email)) as correo, m.updated_at as desactivada
from membership m
join ws on ws.id = m.workspace_id
join "user" u on u.id = m.user_id
where m.status <> 'active'
  and exists (select 1 from account a where a.user_id = u.id)
order by correo;
```

Para cada una hay dos salidas, y la elige el usuario en ese momento: dejarla
así hasta volver a desplegar E2, o el procedimiento SQL de siempre, que borra su
`account` y la deja en EQ-110 hasta E2b.

### 6.6 El procedimiento SQL y las tres inactivas

- **Hasta el push de E2**, desactivar sigue siendo el procedimiento del núcleo,
  que borra `session` y `account` (D-E1b-7). Quien pase por él queda sin cuenta
  y entra en D-E2-7.
- **Desde el push**, el procedimiento se retira: desactivar es la pantalla
  (D-E2-12). `parity-analyst` lo anota en el §5 del mapa del núcleo.
- **Las tres inactivas de producción** no cambian: siguen `inactive`, sin
  cuenta, con sus horas en el reporte (RP-61), en «Inactivas» y sin
  «Reactivar». Si entran con Google, ven EQ-92 en lugar del error de cuenta no
  vinculada, porque `mapProfileToUser` corta antes. Vuelven con E2b.
- **El script de importación** no cambia el estado de una membresía que existe
  (`main.ts:237-263`): una persona desactivada en Clock sigue inactiva después
  de una corrida, y sus horas se cargan igual (RP-60).

### 6.7 Previews y la base local

Nada nuevo: E2 no trae migración. Quien prueba un preview sigue necesitando una
membresía activa o una invitación pendiente en la rama `preview` (§6.7 de E1b);
desde E2, **una membresía inactiva no alcanza**. Si alguien quedó inactivo en
esa base, se lo reactiva desde el `/equipo` del preview, si tiene cuenta, o con
un `update membership set status = 'active'` en esa rama.

## 7. Reparto de archivos

### backend-dev

- `src/server/access.ts` y `access.test.ts` (§4.1).
- `src/server/entry.ts` y `entry.integration.test.ts`; `src/server/auth.ts`, el
  gancho `session.create.after` (§4.2); `auth.integration.test.ts` y
  `session.integration.test.ts` (§9.2).
- `src/server/auth-records.ts` y `auth-records.integration.test.ts`, nuevos
  (§4.3); la línea de `CLAUDE.md`.
- `src/server/permissions/index.ts` y `permissions.test.ts` (§3).
- `src/modules/workspace/service.ts` y `service.integration.test.ts` (§4.4).
- `src/modules/time-entry/service.ts` y sus tests de integración (§4.5).
- `src/modules/team/schema.ts`, `repository.ts`, `service.ts`, `actions.ts`,
  `schema.test.ts`, `service.integration.test.ts`,
  `actions.integration.test.ts` y `concurrency.integration.test.ts` (§4.6 a
  §4.9).
- `src/test/factories.ts`: `seedAccount(userId)` y `seedSession(userId)`.
- `src/app/login/page.test.tsx`: el caso de `membresia_inactiva`.
- La evidencia del criterio 24 en el registro del slice
  (`docs/slices/correcciones-fase2-e2-revisiones.md`).
- **Primero fija** `AccessDenialReason` y su texto, `TeamMember`,
  `ChangeStatusInput`, `ChangeStatusResult`, `TeamErrorCode`, `teamMessages`,
  `TeamFilter`, `teamSearchParams` y `TeamActions`, y avisa a `frontend-dev` y
  a `e2e-tester`.

### frontend-dev

- `src/app/(app)/equipo/page.tsx` (§5.1).
- **Toda `src/modules/team/components/`** (§5): `team-screen.tsx`,
  `team-members.tsx`, `team-members-model.ts`, `labels.ts`, los nuevos
  `status-filter.tsx`, `member-actions-menu.tsx` y `deactivate-dialog.tsx`, lo
  que haya que tocar del resto de la carpeta, y los tests de componente y de
  modelo de todos ellos.

### e2e-tester

- `e2e/team-page.ts`: el filtro, el menú de la fila y sus entradas, la marca
  «(inactiva)», el tachado, «Sin cuenta de Google vinculada.», la confirmación
  y los avisos. `rowButtons` cuenta también el menú; su comentario lo dice.
- `e2e/database.ts`: `seedGoogleAccount(email)`, `sessionCountOf(email)`,
  `membershipStatusOf(email)`, `seedRunningEntry(email)` y
  `runningEntryOf(email)`.
- `e2e/team-status.spec.ts`, nuevo, con los recorridos de §9.3; confirma que
  fallan antes de la implementación.
- `team.spec.ts`, `invitations.spec.ts` y `entry.spec.ts` siguen en verde sin
  cambiar lo que afirman (§9.3).

### parity-analyst

- `equipo.md`: EQ-35 (el botón de R8 se queda en «Acciones», D-E2-9); EQ-42 y
  P-05 (TT-92 cubre solo el pedido en vuelo; la carrera de un ingreso con una
  desactivación la cierra el gancho de D-E2-2); EQ-104 (el pedido que leyó la
  sesión antes termina con lo que leyó; abrir un timer espera y responde TT-79,
  D-E2-6); EQ-110 (D-E2-7); **EQ-114** nuevo en la §10, «Reactivar a una
  persona sin cuenta de Google» con el texto de `noAccount`, `adaptar`; EQ-39 y
  EQ-41 (el procedimiento se retiró).
- `time-tracker.md`, TT-92: desde E2 el estado aparece solo con un pedido en
  vuelo o por SQL.
- `reportes.md`: RP-60 y RP-63, construidos en E2.
- `nucleo-reportes-mapa.md`, §5: la corrección fechada de D-E2-12.

### Lo que no toca nadie

`report`, `project`, `profile`, `drizzle/`, `src/server/db/`,
`src/server/session.ts`, `src/server/test-session.ts`, `src/components/` y
`src/app/` fuera de `equipo/page.tsx` y del test de `/login`.

### Orden

1. `backend-dev`: los tipos y textos de §4.1 y §4.6.
2. En paralelo: `backend-dev` con la regla, el gancho, `can()`, las funciones
   ajenas y `changeStatus`; `frontend-dev` con la pantalla; `e2e-tester` con el
   arnés y el spec.
3. Las revisiones; correcciones; corrida final de e2e en una base nueva **y** en
   una que se reusa.

## 8. Criterios de aceptación

1. **Desactivar** (EQ-39, EQ-41, EQ-43): el owner desactiva a un member con un
   timer corriendo y dos sesiones. En una transacción: la membresía queda
   `inactive` con su rol; el timer, cerrado con el `now()` de la transacción y
   el resto de sus campos igual; las dos sesiones, borradas; `account`,
   `project_member` y `task_assignee`, intactas. Tres constancias:
   `membership.deactivate`, `timeEntry.stop` y `session.revokeAll` con
   `{ sessions: 2 }`, las tres con el owner como actor.
2. **Sin timer ni sesiones**, desactivar escribe solo la membresía y
   `membership.deactivate`.
3. **Reactivar** (EQ-47, EQ-37): una admin inactiva con cuenta vuelve `active` y
   `admin`; ningún timer nuevo; solo `membership.reactivate`.
4. **Idempotencia** (EQ-97, EQ-98): desactivar a una inactiva y reactivar a una
   activa responden éxito sin escribir ninguna fila, tampoco de `audit_log`.
5. **Quién** (EQ-38, EQ-39, P-07): un admin desactiva y reactiva a un member, a
   una `project_manager` y a una `team_manager`; un admin sobre otro admin
   recibe `forbidden` con EQ-85, para desactivar y para reactivar; el owner
   desactiva y reactiva a un admin; un member recibe `forbidden` con EQ-90.
6. **La autoridad bajo el bloqueo** (EQ-98): un admin que perdió el rol, o cuya
   membresía quedó inactiva, entre la sesión y el bloqueo recibe `forbidden`
   sin escribir.
7. **La propia y la del owner** (EQ-40): la propia responde `status_locked` con
   EQ-84, también para el owner; la del owner, pedida por un admin, responde
   `status_locked` con EQ-83.
8. **Lo que no está** (EQ-82): un id que no existe, uno de otro workspace y una
   membresía `invited` responden `not_found`; un id que no es uuid, `validation`
   con EQ-82; un estado desconocido, `validation` con `statusUnavailable`.
9. **Sin cuenta** (D-E2-7): reactivar a una inactiva sin `account` responde
   `no_account` con EQ-114 sin escribir; con `seedAccount`, reactiva.
10. **El ingreso de una inactiva** (P-05, EQ-92): con `account` y la membresía
    inactiva, el callback responde 302 a `/login?error=membresia_inactiva` sin
    crear sesión; el gancho rechaza con ese motivo; un externo con `accepted` e
    inactivo, igual; un externo inactivo sin invitación abierta,
    `sin_invitacion`. `/login` muestra EQ-92. El criterio 9 de E1b se invierte.
11. **La sesión abierta de una inactiva sigue en TT-92** (D-E2-2): con la
    membresía pasada a `inactive` por SQL y la sesión viva, una persona del
    dominio y una externa con `accepted` reciben el contexto con `status:
"inactive"`; `decideSessionIdentity` no la rechaza.
12. **El pedido siguiente no tiene sesión** (EQ-41): después de desactivarla,
    la página que la persona tenía abierta, al recargar, termina en `/login`, y
    volver a pedir una sesión de prueba responde 403.
13. **Desactivar contra abrir un timer** (D-E2-6), en los dos órdenes: si la
    desactivación bloquea primero, el arranque responde `forbidden` con TT-79 y
    no deja entrada; si el arranque lee primero, la desactivación espera y
    cierra el timer que abrió. En los dos, ningún timer abierto para una
    membresía inactiva.
14. **Desactivar contra detener** (D-E2-6): con la persona deteniendo su timer
    bajo su bloqueo, la desactivación termina sin error, el timer queda cerrado
    una vez y hay un solo `timeEntry.stop`.
15. **Dos sobre la misma fila** (EQ-98): dos desactivaciones a la vez dejan una
    escritura y una respuesta de éxito sin escribir; el owner baja a la admin A
    mientras A desactiva a M: A decide con el rol que leyó bajo el bloqueo.
16. **Lo que no espera**: desactivar no espera a un alta de una entrada cerrada
    en curso de esa persona (criterio 13 de R8); un arranque de timer sí espera
    a una desactivación o a un cambio de rol en curso de esa membresía.
17. **Todo o nada** (ADR 0025): si algo falla después de detener el timer o de
    borrar las sesiones, la membresía, el timer, las sesiones y las constancias
    quedan como estaban.
18. **La vista** (EQ-05, D-E2-8): `getTeamView` trae las activas y las inactivas
    del workspace, no las `invited`, con `status`, `hasAccount`, `change` en
    `null` para las inactivas y `statusChange` según D-E2-3: ni la propia ni la
    del owner; un admin no lo tiene sobre otro admin; una inactiva sin cuenta
    no lo tiene.
19. **El filtro** (EQ-06, EQ-100): sin parámetro, Activas con las invitadas;
    `?estado=inactivas`, `invitadas` y `todas` muestran lo de D-E2-8; uno
    inválido o repetido se ignora; elegir en el selector cambia la URL, y
    recargar la conserva.
20. **La fila que cambió se queda** (EQ-11): con «Activas», desactivar a una
    persona con cuenta (`seedGoogleAccount`) deja la fila en su lugar, tachada,
    con «(inactiva)» y el menú con «Reactivar»; después de recargar o de cambiar
    el filtro ya no está en «Activas» y está en «Inactivas».
21. **La pantalla** (EQ-03, EQ-46, EQ-47): la confirmación con su título, su
    texto y sus botones; reactivar sin confirmar; los avisos de éxito y de
    error con el nombre; «Reintentar» solo con `unexpected`; un pedido a la vez
    en toda la tabla; el foco según §5.4.
22. **Los vacíos** (EQ-93, EQ-94): los dos textos de §5.5 en su filtro; EQ-93
    con quien mira solo.
23. **Revalidación** (EQ-101, D-E2-11): `changeStatus` con éxito llama a
    `revalidatePath("/", "layout")`, y después de desactivar a una persona,
    `listWorkspacePeople` con la transacción de un reporte la devuelve con
    `status: "inactive"`. Las dos cosas juntas son las que hacen que el filtro
    de personas del reporte de quien desactivó la muestre entre las inactivas
    sin recargar; eso último no se prueba en e2e (§9.4).
24. **Las consultas de §6** corren sin error contra una base sembrada —una
    inactiva con sesión, una con timer, una activa sin cuenta, una inactiva sin
    cuenta— y dan lo que su comentario dice: la 2 trae a las dos primeras y la
    3, a la activa sin cuenta. Después de las dos sentencias, la 2 da cero y la
    3 sigue trayendo a la activa sin cuenta. `backend-dev` pega la salida en el
    registro del slice, con la siembra.
25. **La e2e entera en verde**, en una base nueva y en una que se reusa; los
    recorridos de R8, E1a y E1b sin cambiar lo que afirman.
26. **La carrera con un ingreso** (D-E2-2, P-05): con una transacción que pasó
    la membresía de P a `inactive` y no confirmó, una sesión de prueba de P pasa
    el gancho `before` —lee lo confirmado— y queda esperando en el `after`; al
    confirmar, P no tiene ninguna fila de `session`. Sin transacción en curso,
    `dropSessionOfInactive` borra la sesión de una membresía `inactive` o
    `invited`, deja la de una `active` y la de quien no tiene membresía, no deja
    constancia y no lanza.

## 9. Plan de tests

### 9.1 Unidad

- `access.test.ts`: la tabla de D-E2-1 en `decideGoogleAccess` y
  `decideStoredEmail` (membresía de cada estado, con y sin pendiente, del
  dominio y externa); `decideStoredIdentity` con cada estado de invitación, sin
  mirar la membresía; `loginErrorMessage` con `membresia_inactiva` (criterio
  10).
- `permissions.test.ts`: `team.admin.setStatus` con cada rol, con un actor
  inactivo y sobre otro workspace.
- `team/schema.test.ts`: `changeStatusInput` (uuid, estado, `invited` no) y
  `teamSearchParams`.
- `team-members-model.test.ts`: `visibleMembers` y `visibleInvitations` con cada
  filtro y con ids que se quedan; `filterHref`; `feedbackOf` con los
  desenlaces nuevos; que un menú no mande con un pedido en curso.
- Los tests de componente de `team-members`, `team-screen`,
  `member-actions-menu` y `deactivate-dialog`: el tachado y «(inactiva)»;
  «Sin cuenta de Google vinculada.»; el menú solo con `statusChange`, con su
  nombre; la confirmación; `aria-disabled` en todo con un pedido en vuelo; los
  vacíos; el selector con sus cuatro opciones y la etiqueta.
- `src/app/login/page.test.tsx` con `membresia_inactiva`.

### 9.2 Integración (Postgres)

- **`entry.integration.test.ts`**: criterio 10 contra la base; `:90` pasa a
  afirmar el rechazo; `decideSessionIdentity` de un externo `accepted` inactivo
  devuelve `allowed` (criterio 11).
- **`auth.integration.test.ts`**, por el handler: el callback de una persona del
  dominio con `account` (`seedAccount`) y membresía inactiva, 302 a
  `/login?error=membresia_inactiva` sin `session`; el rechazo del gancho
  `before` con la membresía pasada a `inactive` entre `mapProfileToUser` y el
  gancho. **El gancho `after`** (criterio 26) se arma con `queueBehindBarrier`
  de `src/test/concurrency.ts`, que no cambia. Toda barrera de ese archivo se
  suelta con `rollback` (`concurrency.ts:86-99`), así que lo que tiene que
  confirmar no puede escribirlo la barrera:
  - **La barrera** toma la membresía de P con `select … for no key update` y no
    escribe.
  - **Corredor 1**: un `db.transaction` propio que hace `update membership set
status = 'inactive'` sobre P y confirma solo. Queda trabado detrás de la
    barrera.
  - **Corredor 2**: `testSessionSignIn(P)`, el helper de
    `auth.integration.test.ts:57`. Pasa el `before` con lo confirmado —P sigue
    `active`—, inserta la sesión y queda trabado en el `for share` del `after`,
    en la cola detrás del corredor 1.
  - **Al abrir la barrera**, el corredor 1 confirma y el `after` lee `inactive`
    y borra: los dos corredores `fulfilled`, P `inactive` y cero filas de
    `session` de P.
  - **El corredor 1 no es `changeStatus`.** Su `delete from session` correría
    después de que se abre la barrera y vería la sesión ya insertada: el test
    pasaría sin el gancho y no probaría el único caso que cierra el `after`, el
    de una sesión que confirma después del `delete` de la desactivación.
  - **La mutación**: sin el `after` la sesión queda, y el test tiene que fallar.
    Falla antes de contar filas: el corredor 2 termina sin trabarse y
    `queueBehindBarrier` rechaza con «Un corredor terminó sin trabarse en la
    barrera.» (`concurrency.ts:139-143`). Un `after` que espera pero no borra
    llega a la cuenta de `session` y falla ahí.

  Sin barrera, `dropSessionOfInactive` con cada estado de la membresía y sin
  membresía.

- **`session.integration.test.ts`**: criterio 11, con `getSession` simulado.
- **`auth-records.integration.test.ts`**: `deleteSessionsOf` borra las de la
  persona y no las de otra, deja `session.revokeAll` con la cantidad y sin
  sesiones no escribe; no toca `account`; `deleteSession` borra solo la fila
  pedida y no deja constancia; `hasAccount` con y sin fila.
- **`workspace/service.integration.test.ts`**: `isMembershipActiveLocked` y
  `entryMembershipStatusLocked` con cada estado y sin membresía; `:176` cambia
  el título a TT-92 y sigue afirmando el contexto.
- **`time-entry`**: `stopRunningTimerOf` cierra el timer de otra persona con
  piso en un inicio futuro (TT-101), con el actor que recibe en
  `timeEntry.stop`, y sin timer devuelve `null` sin escribir; `startTimer` y
  `continueEntry` con la membresía inactiva en la base y el `Actor` activo
  responden `forbidden` sin escribir.
- **`team/service.integration.test.ts`**: criterios 1 a 9, 17 y 18. El 17, con
  un fallo inyectado después de `deleteSessionsOf`. Y la mitad de servicio del
  23: `listWorkspacePeople` después de desactivar.
- **`team/actions.integration.test.ts`**: cada fila de §4.10 que es de
  `changeStatus` con su código, su texto y, con éxito, `revalidatePath("/",
"layout")` (criterio 23); sin sesión, a `/login` sin escribir.
- **`team/concurrency.integration.test.ts`**, con las barreras de
  `src/test/concurrency.ts`: criterios 13 a 16. El 13, con `queueBehindBarrier`
  en los dos órdenes; se verifica que falla sin la lectura de `closeAndOpen`
  (queda un timer abierto con la membresía inactiva). El 16, con
  `outcomeWhileHeld`: `resolved` para la entrada cerrada, `blocked` para el
  arranque.
- **Las consultas de §6** (criterio 24): a mano, una vez, con la salida en el
  registro.

Cada test nuevo tiene que poder fallar: se verifica con una mutación en una
copia, como en los slices anteriores.

### 9.3 E2E

Heredan la regla de R2a, R8, E1a y E1b: correos y nombres únicos, nunca afirmar
sobre la tabla entera ni sobre un vacío de la base común. `e2e/team-status.spec.ts`:

1. **Desactivar corta en el acto**: P entra (`signIn`), recibe una cuenta con
   `seedGoogleAccount(P)` —sin ella la fila no ofrecería «Reactivar»
   (D-E2-7)— y queda con `seedRunningEntry`; el owner, en su pestaña, abre
   «Acciones de P», elige «Desactivar», lee la confirmación y confirma. La fila
   se queda tachada con «(inactiva)», el aviso dice «Desactivaste a P.», y el
   menú ofrece «Reactivar». En la base: `membershipStatusOf` en `inactive`,
   `runningEntryOf` en nada, `sessionCountOf` en 0. La página de P, al
   recargar, termina en `/login`; `signInRejected` para P.
2. **Reactivar**: con `seedGoogleAccount(P)`, el owner elige «Inactivas», abre
   el menú de P y elige «Reactivar» sin confirmación; el aviso dice «Reactivaste
   a P.» y la fila se queda sin tachar. P vuelve a entrar con `signIn` al
   rastreador, sin timer corriendo.
3. **El filtro en la URL**: elegir «Inactivas» lleva a `?estado=inactivas`;
   recargar conserva el filtro; una persona sembrada inactiva sin cuenta está,
   tachada, con «Sin cuenta de Google vinculada.» y sin menú; con «Invitadas»,
   una invitación del recorrido está y P no.
4. **Un admin y otro admin**: un admin ve el menú en la fila de un member y no en
   la de otra admin, ni en la del owner, ni en la propia.
5. **Un pedido a la vez**: con la respuesta de desactivar retenida, el botón de
   rol de otra fila y su menú quedan en `aria-disabled`; un segundo clic no
   manda nada.
6. **`/login?error=membresia_inactiva`** muestra EQ-92.

Y la suite entera corre en una base nueva y en una que se reusa (criterio 25).
`team.spec.ts` sigue afirmando cero botones en las filas que no tienen ni rol ni
menú, que son las mismas que hoy (D-E2-9).

### 9.4 Lo que no se prueba en e2e

El login de Google (lo cubren `access.test.ts`, `entry.integration.test.ts` y
el handler en `auth.integration.test.ts`); la carrera de D-E2-2 (criterio 26) y
las de D-E2-6 (integración); el reporte después de desactivar más allá de la
revalidación (criterio 23, en integración); y las consultas de §6, a mano.

## 10. Riesgos

- **Quien pierde la carrera con un ingreso llega a `/login` sin motivo**
  (D-E2-2): el gancho `after` borra la sesión sin lanzar, y `/login` no sabe
  por qué. Al reintentar, `mapProfileToUser` responde EQ-92. Aceptado: pide un
  ingreso en el mismo instante en que alguien desactiva a esa persona.
- **Un `getSession` que refresca una sesión ya borrada responde
  `UNAUTHORIZED`**: si la sesión de la persona tiene más de un día
  (`updateAge`, `auth.ts:28`), el pedido que la leyó antes de que la
  desactivación confirmara y la renueva después no encuentra la fila, borra la
  cookie y lanza
  (`node_modules/better-auth/dist/api/routes/session.mjs:198-209`).
  `readSession` no lo atrapa, así que ese pedido termina en un error en lugar
  de terminar con lo que leyó (EQ-104). El siguiente no tiene sesión y va a
  `/login`. Aceptado: es un pedido en vuelo de la persona desactivada, una vez,
  y no escribe nada.
- **Un timer huérfano** si la lectura de `closeAndOpen` se pierde en un cambio
  futuro: el criterio 13 lo frena, y el comentario de `closeAndOpen` remite a
  D-E2-6. Un camino nuevo que cree un timer tiene que pasar por ahí.
- **Una sesión de una inactiva** si el gancho `after` se pierde en un cambio
  futuro o en una versión de Better Auth que lo llame de otro modo: el criterio
  26 lo frena, y §6.3 lo detecta en producción.
- **Las escrituras cerradas en vuelo** confirman después de desactivar
  (D-E2-6). Aceptado: son pedidos que la persona mandó antes.
- **EQ-21 sin salida para las inactivas sin cuenta** (D-E2-7): no se las invita
  ni se las reactiva hasta E2b. Afecta a las tres de producción y a quien pase
  por el procedimiento antes del push.
- **La reversión** devuelve el acceso de solo lectura a quien se desactivó desde
  la pantalla (§6.5).
- **Un arranque de timer y un ingreso esperan a un cambio de rol** de esa
  persona: unos milisegundos, solo para ella (D-E2-6, D-E2-2).
- **La e2e común acumula inactivas** sembradas sin cuenta: la lista de
  «Inactivas» crece en la base que se reusa. Ningún recorrido afirma sobre su
  tamaño.
- **El menú suma un botón por fila**: `rowButtons` lo cuenta; un recorrido de R8
  que afirme cero botones en una fila que ahora tiene menú fallaría. Hoy no hay
  ninguno (§9.3).

## 11. Preguntas

Ninguna abierta. Lo que el mapa dejaba al contrato —impedir o avisar al
reactivar sin cuenta, la carrera con la propia persona y las dos lecturas de
personas— está en D-E2-7, D-E2-6 y D-E2-10; la carrera con un ingreso, en
D-E2-2.

## 12. Fuera de alcance

- **Volver a entrar sin `account`** (EQ-110) y P-11 de `perfil.md` (EQ-109): E2b,
  que levanta D-E2-7.
- **Desactivar y reactivar en masa** (EQ-49): fuera, por `equipo.md`.
- **Búsqueda y filtro por rol** (EQ-07, EQ-08) y el vacío de la búsqueda
  (EQ-94): E5, sobre la misma URL.
- **Transferir la propiedad** (EQ-55 … EQ-59, EQ-86): E3, que suma su entrada
  al menú.
- **Quitar del equipo** (EQ-51, EQ-87, EQ-88): E6, que suma la suya y se ofrece
  solo sobre una inactiva.
- **El primer día de la semana** desde la tabla (EQ-71): E4.
- **No ofrecer a una inactiva para altas nuevas** en los selectores de
  proyectos, tareas y grupos (EQ-45): P6, P7 y E7, cuando existan esos
  selectores.
- **Quitar `invited` de `membership_status`**: deuda del mapa (ADR 0024,
  decisión 7).
