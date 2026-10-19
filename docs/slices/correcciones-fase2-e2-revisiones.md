# E2: implementación y revisiones

Rama `fase2/e2-desactivar` desde `main` en `e4a6c60`, en el worktree
`/home/maxi/program/clock-e2` (fuera del repositorio). Contrato:
[`fase2-e2-desactivar.md`](fase2-e2-desactivar.md).

## Mutaciones del backend

Cada mutación se aplicó sobre el código de `53995f1` (las dos del gancho, sobre
el mismo código antes de commitearlo), se corrieron los tests que la tienen que
ver contra `clock_e2_back` y se revirtió.

| Mutación                                                            | Falla                                                                                                                                                                       |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sin el gancho `session.create.after`                                | criterio 26: «Un corredor terminó sin trabarse en la barrera.»                                                                                                              |
| Un `after` que espera y no borra                                    | criterio 26, en la cuenta de `session`; `dropSessionOfInactive` con `inactive` e `invited`, y «borra solo la sesión que recibe»                                             |
| `closeAndOpen` sin `isMembershipActiveLocked`                       | criterio 13, los dos órdenes (el corredor del arranque termina sin trabarse); criterio 16, el arranque; `startTimer` y `continueEntry` con la membresía inactiva en la base |
| Cualquier membresía da acceso (la regla de E1b)                     | `access.test.ts` (6 casos); criterio 10 en `entry.integration.test.ts` (5) y en el callback                                                                                 |
| La membresía no gana sobre una invitación pendiente                 | `access.test.ts` (4 casos); «una membresía inactiva con una invitación pendiente tampoco entra»                                                                             |
| Por pedido, la decisión completa en lugar de `decideStoredIdentity` | criterio 11: el externo con `accepted` inactivo, en `entry` y en `session`                                                                                                  |
| `dropSessionOfInactive` borra también sin membresía                 | «sin membresía, la deja» y «sin workspace, la deja»                                                                                                                         |
| `entryMembershipStatusLocked` lee sin bloqueo                       | criterio 26; «las dos esperan a una desactivación en curso»                                                                                                                 |
| `isMembershipActiveLocked` da `true` sin membresía                  | «isMembershipActiveLocked sin membresía: false»                                                                                                                             |
| `team.admin.setStatus` también para admin                           | `permissions.test.ts`; criterio 5 (EQ-85, para desactivar y para reactivar); criterio 18 (la vista del admin)                                                               |
| Desactivar sin `deleteSessionsOf`                                   | criterios 1 y 17                                                                                                                                                            |
| Desactivar sin `stopRunningTimerOf`                                 | criterio 1; criterio 13, el arranque que lee primero; criterio 14                                                                                                           |
| `deleteSessionsOf` deja constancia sin sesiones                     | criterio 2; criterio 5 (tres casos); «sin sesiones no escribe nada»                                                                                                         |
| Reactivar sin exigir `account`                                      | criterio 9, en el service y en la action                                                                                                                                    |
| Sin el paso de la propia                                            | criterio 7, el owner y un admin; la action con EQ-84                                                                                                                        |
| Una `invited` no responde `not_found`                               | criterio 8, en el service y en la action                                                                                                                                    |
| La autoridad de la sesión en lugar de la releída bajo el bloqueo    | criterio 6 (dos casos); criterio 15, «el owner baja a la admin A mientras A desactiva a M»                                                                                  |
| Una inactiva conserva el control de rol                             | criterio 18, la vista del owner y la del admin                                                                                                                              |
| «Reactivar» en una inactiva sin cuenta                              | criterio 18, las dos vistas                                                                                                                                                 |
| `listMembers` solo con las activas                                  | criterio 18, las dos vistas                                                                                                                                                 |

## Criterio 24: las consultas de §6

`backend-dev` corrió las tres consultas de §6.1, las dos sentencias y otra vez
las consultas, con `psql`, contra `clock_e2_queries2` migrada hasta la última,
sobre esta siembra:

```sql
insert into "user" (id, name, email, email_verified) values
  ('u-owner', 'Owner', 'owner@empresa.com', true),
  ('u-sesion', 'Inactiva con sesión', ' Sesion@Empresa.com', true),
  ('u-timer', 'Inactiva con timer', 'timer@empresa.com', true),
  ('u-activa', 'Activa sin cuenta', 'activa.sincuenta@empresa.com', true),
  ('u-inactiva', 'Inactiva sin cuenta', 'inactiva.sincuenta@empresa.com', true);
insert into workspace (id, name, owner_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'Workspace', 'u-owner');
insert into workspace_settings (workspace_id) values ('00000000-0000-0000-0000-0000000000a1');
insert into membership (workspace_id, user_id, role, status) values
  ('00000000-0000-0000-0000-0000000000a1', 'u-owner', 'owner', 'active'),
  ('00000000-0000-0000-0000-0000000000a1', 'u-sesion', 'member', 'inactive'),
  ('00000000-0000-0000-0000-0000000000a1', 'u-timer', 'admin', 'inactive'),
  ('00000000-0000-0000-0000-0000000000a1', 'u-activa', 'member', 'active'),
  ('00000000-0000-0000-0000-0000000000a1', 'u-inactiva', 'member', 'inactive');
insert into account (id, account_id, provider_id, user_id, updated_at) values
  ('a-owner', 'sub-owner', 'google', 'u-owner', now()),
  ('a-sesion', 'sub-sesion', 'google', 'u-sesion', now()),
  ('a-timer', 'sub-timer', 'google', 'u-timer', now());
insert into session (id, token, user_id, expires_at, updated_at) values
  ('s-owner', 't-owner', 'u-owner', now() + interval '1 day', now()),
  ('s-sesion-1', 't-sesion-1', 'u-sesion', now() + interval '1 day', now()),
  ('s-sesion-2', 't-sesion-2', 'u-sesion', now() + interval '1 day', now());
insert into time_entry (id, workspace_id, user_id, description, started_at, ended_at) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', 'u-timer', 'en curso', now() - interval '2 hours', null),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1', 'u-sesion', 'cerrada', now() - interval '1 day', now() - interval '23 hours');
```

Lo que muestra, contra el comentario de cada consulta: la **1** trae las cinco
membresías con su cuenta, sus sesiones y su timer; la **2** trae a la inactiva
con sesiones y a la inactiva con timer, y no a la inactiva sin cuenta, que no
tiene ninguna de las dos; la **3**, a la activa sin cuenta. Después de las dos
sentencias, la **2** da cero filas y la **3** sigue trayendo a la activa sin
cuenta. Las sentencias dejan una constancia cada una, sin actor; la sesión del
owner y la entrada cerrada no cambian.

La salida (`-- q.sql` son las tres consultas, en orden; `-- fix.sql`, las dos
sentencias; `-- after.sql`, el registro, las sesiones y las entradas):

```text
-- seed.sql
INSERT 0 5
INSERT 0 1
INSERT 0 1
INSERT 0 5
INSERT 0 3
INSERT 0 3
INSERT 0 2
-- q.sql
             correo             |  rol   |  estado  | con_cuenta | sesiones | timer_en_curso
--------------------------------+--------+----------+------------+----------+----------------
 activa.sincuenta@empresa.com   | member | active   | f          |        0 | f
 owner@empresa.com              | owner  | active   | t          |        1 | f
 inactiva.sincuenta@empresa.com | member | inactive | f          |        0 | f
 sesion@empresa.com             | member | inactive | t          |        2 | f
 timer@empresa.com              | admin  | inactive | t          |        0 | t
(5 rows)

       correo       |  estado
--------------------+----------
 sesion@empresa.com | inactive
 timer@empresa.com  | inactive
(2 rows)

            correo            |  rol
------------------------------+--------
 activa.sincuenta@empresa.com | member
(1 row)

-- fix.sql
INSERT 0 1
INSERT 0 1
-- q.sql
             correo             |  rol   |  estado  | con_cuenta | sesiones | timer_en_curso
--------------------------------+--------+----------+------------+----------+----------------
 activa.sincuenta@empresa.com   | member | active   | f          |        0 | f
 owner@empresa.com              | owner  | active   | t          |        1 | f
 inactiva.sincuenta@empresa.com | member | inactive | f          |        0 | f
 sesion@empresa.com             | member | inactive | t          |        0 | f
 timer@empresa.com              | admin  | inactive | t          |        0 | f
(5 rows)

 correo | estado
--------+--------
(0 rows)

            correo            |  rol
------------------------------+--------
 activa.sincuenta@empresa.com | member
(1 row)

-- after.sql
      action       |   entity   |              entity_id               | actor_id |   previous_value   |                    next_value
-------------------+------------+--------------------------------------+----------+--------------------+--------------------------------------------------
 session.revokeAll | user       | u-sesion                             |          | {"sessions" : 2}   |
 timeEntry.stop    | time_entry | 00000000-0000-0000-0000-0000000000e1 |          | {"endedAt" : null} | {"endedAt" : "2026-10-19T20:41:47.871143+00:00"}
(2 rows)

   id    | user_id
---------+---------
 s-owner | u-owner
(1 row)

                  id                  | user_id  | abierta
--------------------------------------+----------+---------
 00000000-0000-0000-0000-0000000000e1 | u-timer  | f
 00000000-0000-0000-0000-0000000000e2 | u-sesion | f
(2 rows)

```

Una diferencia de forma, que no cambia lo que la consulta 2 detecta: las
constancias que escriben las sentencias de §6.1 con `json_build_object(...)::text`
llevan blancos (`{"sessions" : 2}`) y el instante con el formato de Postgres
(`2026-10-19T20:41:47.871143+00:00`); las que escribe la aplicación con
`recordAudit` son `{"sessions":2}` y `"2026-10-19T20:41:47.871Z"`. Quien lea
`audit_log` comparando el texto las ve distintas.

## Revisiones y correcciones

`backend-reviewer` y `security-auditor` aprobaron el backend sin hallazgos.
Los hallazgos de clean code y de tests sobre el backend, y qué se hizo con
cada uno:

| Hallazgo                                                                                                                          | Qué se hizo                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `auth.integration.test.ts` repetía `seedAccount` en una función local y en el alta de dos cuentas de `/unlink-account`            | `seedAccount(userId, sub?)` recibe el `sub`, con uno nuevo por defecto; las dos copias se borraron                                                                                                                                                                 |
| `MEMBER_STATUSES` y el estrechamiento de `team` repetían `PRESENT_STATUSES` y `toWorkspacePerson` de `workspace`                  | `MEMBER_STATUSES`, `MemberStatus` y `memberStatusOf` viven una vez en `workspace/schema.ts`; `team/schema.ts` los reexporta para la pantalla. Los dos repositories estrechan el estado al leer, y `listWorkspacePeople` devuelve las filas sin `toWorkspacePerson` |
| `statusChangeOf` volvía a consultar `team.manage`, que `getTeamView` ya decidió                                                   | Se quitó. La vista calcula los pasos 4 a 6 y 8 de D-E2-3; el 3 lo decide `getTeamView` antes de leer                                                                                                                                                               |
| La constancia de un cambio de estado calculaba el previo invirtiendo el nuevo                                                     | El previo es el estado leído bajo el bloqueo (`target.status`)                                                                                                                                                                                                     |
| `as PromiseFulfilledResult<…>` en dos tests de carreras                                                                           | `fulfilledValue` en `src/test/concurrency.ts` estrecha y lanza si el corredor se rechazó; el del criterio 13 lee la entrada de la base y compara, y el del 26 estrecha la respuesta con `instanceof Response`                                                      |
| Opcional: que la vista y la mutación no puedan desalinearse                                                                       | `statusLockOf` devuelve el motivo del bloqueo (la propia, el owner, un admin sin `team.admin.setStatus`) o `null`; la usan `statusChangeOf` y `changeStatus`. Desactivar y reactivar se juntaron en `writeStatus`                                                  |
| El criterio 4 sembraba `account` en «reactivar a una activa»: no fijaba que el paso 7 (idempotente) va antes del 8 (`no_account`) | Caso nuevo: reactivar a una activa sin cuenta responde éxito sin escribir                                                                                                                                                                                          |

Mutaciones sobre el código corregido, contra `clock_e2_back`:

| Mutación                                                 | Falla                                                                                     |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| El paso 8 antes que el 7                                 | el caso nuevo del criterio 4                                                              |
| La constancia con el estado nuevo como previo            | criterios 1 y 3                                                                           |
| `statusChangeOf` sin `statusLockOf`                      | criterio 18, las dos vistas                                                               |
| `statusLockOf` sin la propia                             | criterio 7, el owner y un admin; la action con EQ-84                                      |
| `statusLockOf` sin `team.admin.setStatus`                | criterio 5 (EQ-85, los dos sentidos); criterio 18, la vista del admin                     |
| Reactivar también detiene el timer y borra las sesiones  | criterio 3, que ahora siembra una sesión que reactivar no toca (antes la mutación pasaba) |
| `listPeople` deja pasar `invited` hasta `memberStatusOf` | criterio 17 de R4, «… ni las invitadas …»                                                 |

Las 18 mutaciones de la primera tabla se volvieron a correr sobre este código y
fallan igual, salvo «sin el paso de la propia», que ahora es la de
`statusLockOf` de arriba.

**La enmienda de §4.8**, hecha en `f344883`: `statusChange` sale de
`statusChangeOf(actor, row)`, que aplica los pasos 4 a 6 y 8 de D-E2-3 sobre
el `Actor` de la sesión; el paso 3 (`team.manage` sobre el workspace) ya lo
decidió `getTeamView` antes de leer la lista. Los pasos 4 a 6 son
`statusLockOf`, la misma función con que `changeStatus` los decide bajo el
bloqueo.

### Frontend

`frontend-reviewer` aprobó con cambios y aceptó los cinco desvíos de
`frontend-dev`: las filas de EQ-11 se anotan al mandar el pedido, porque la
revalidación puede llegar antes que la respuesta; «Desactivar» del menú no es
`destructive`, sí el botón de la confirmación; «Sin cuenta de Google
vinculada.» solo en filas inactivas, que es lo que pide §5.3;
`statusFilterItems` exportado para el test; `rowHeaderId` y `rowActionsId` en
`team-members-model.ts`.

| Hallazgo                                                                                                                                           | Qué se hizo                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mayor: `key={filter}` volvía a montar la pantalla y, al elegir un filtro con el teclado, el foco caía a `body` (reproducido con ArrowDown y Enter) | `d810bdd`: sin la `key`; `TeamMembers` recuerda con qué filtro dibujó y, si cambió, en ese mismo dibujo olvida `kept`, el aviso y los marcadores de foco. Un pedido en curso sobrevive al cambio de filtro. Enmienda de §5.2 en `f344883` |

Sin test de componente para el cambio de filtro: los de unidad corren sin DOM y
dibujan una sola vez. Lo cubren dos recorridos e2e (abajo).

### E2E

| Hallazgo                                                                                                                                 | Qué se hizo                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mayor (tests): ningún test cubría que «Reintentar», tras un `changeStatus` con `unexpected`, vuelva a mandar el cambio de estado (TT-89) | `1da2c8a`: 7.º recorrido. Corta el POST una vez antes de que salga, afirma el aviso con «Revisá la conexión y volvé a intentar.» (el cuerpo de §5.4) y que «Reintentar» desactiva con 2 pedidos. Sin `status.retry()`, falla |
| Mayor (frontend), la parte e2e: el foco al elegir el filtro                                                                              | `1da2c8a`: `toBeFocused()` sobre el selector después de cada elección. Fallaba con `key={filter}` y pasa con `d810bdd`                                                                                                       |
| Propuesto por `frontend-dev`: nada cubría que las filas y el aviso se olviden al cambiar de filtro sin recargar                          | `115626c`: en el recorrido 1, «Inactivas» y «Activas» sin recargar; P ya no está en «Activas» y el aviso se fue. Sin `setKept(new Set())`, falla en `team-status.spec.ts:202`                                                |
| Menor (tests): el título «un admin desactiva a un member» no decía lo que se afirma                                                      | «un admin ve el menú de un member y no el de otra admin, el del owner ni el propio, y el servidor decide con el rol de la base»                                                                                              |
| Menor (clean code): `isNameStruck` repetía `isStruckThrough` y comparaba `role="rowheader"`, que nunca se cumple                         | `isTextStruck(text, boundary)` en `e2e/tracker-page.ts`, usado por las dos; sin la comparación con `role`                                                                                                                    |
| Menor (clean code): `hasMembership` equivalía a `membershipStatusOf(email) !== null` y normalizaba el correo distinto                    | `hasMembership` se apoya en `membershipStatusOf`, que compara con `lower(btrim)`                                                                                                                                             |

Corridas de `e2e-tester` después de las correcciones: `team-status.spec.ts` tres
veces seguidas, 8 de 8 cada vez, y la suite completa, 234 de 234.

`parity-reviewer` aprobó con un menor de documentación: un admin que pierde el
rol con la pantalla abierta no ve EQ-90 sino EQ-02, porque `handle` revalida
también con error. Se aclaró en EQ-98 (`8ff0fac`), sin cambio de código.
