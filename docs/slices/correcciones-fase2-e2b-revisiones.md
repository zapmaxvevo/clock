# E2b: implementación y revisiones

Rama `fase2/e2b-sin-cuenta` desde `main` en `be15763` (Better Auth 1.7.10), en el
worktree `/home/maxi/program/clock-e2b` (fuera del repositorio). Contrato:
[`fase2-e2b-sin-cuenta.md`](fase2-e2b-sin-cuenta.md), con el ADR 0027 aceptado.

## §0: los seis puntos de Better Auth, sobre este árbol

`node_modules/better-auth` y `node_modules/@better-auth/core` en 1.7.10.
`@better-auth/oauth-provider` no está instalado: lo suma el slice del MCP. Los
seis se sostienen, con las líneas que dejó `mejoras-better-auth-1710.md`.

| Punto                                                                              | Dónde, en 1.7.10                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. `mapProfileToUser` antes de `resolveOAuthAccountKey` y de `handleOAuthUserInfo` | `@better-auth/core/dist/social-providers/google.mjs:117` `getUserInfo`, `:120` `decodeJwt(token.idToken)`, `:125` `options.mapProfileToUser?.(user)`; `better-auth/dist/api/routes/callback.mjs:120` `provider.getUserInfo(...)`, `:137` `resolveOAuthAccountKey(...)`, `:172` `handleOAuthUserInfo(c, ...)`. `accountSubject` de Google es `profile.sub` (`google.mjs:57`; `oauth2/account-key.mjs:13-27`). |
| 2. Busca por la clave antes que por correo; lanza con claves repetidas             | `better-auth/dist/oauth2/link-account.mjs:80` `findAccountOwnerByKey` antes de `:119` `findUserByEmail`; `db/internal-adapter.mjs:557` `findAccountOwnerByKey`, `:570` `if (accountsWithUsers.length > 1) throw new BetterAuthError(...)`.                                                                                                                                                                   |
| 3. `"account not linked"` llega a `/login` como `account_not_linked`               | `link-account.mjs:139-142` (`disableImplicitLinking === true` → `error: "account not linked"`); `callback.mjs:197` `redirectOnError(result.error.split(" ").join("_"))`, con la base de `:78-79` y `:35` (`onAPIError.errorURL`); `src/server/auth.ts:52`. Lo afirma el criterio 5 por el handler.                                                                                                           |
| 4. El callback no verifica la firma del `id_token`                                 | `google.mjs:7` importa `decodeJwt` de `jose` y `:120` decodifica sin verificar; `verifyProviderIdToken` solo corre en `/sign-in/social` (`api/routes/sign-in.mjs:160`). `signInWithGoogle` arma un token con la firma `"firma"` y entra.                                                                                                                                                                     |
| 5. El plugin de OAuth no suma caminos a `getUserInfo` ni `selectedUser`            | `@better-auth/oauth-provider` no está en `node_modules`. Los plugins instalados que llaman a `getUserInfo`, `handleOAuthUserInfo` o usan `selectedUser` son `generic-oauth`, `oauth-proxy` y `one-tap`; Clock no carga ninguno (`auth.ts:53`, `testSessionPlugins()`).                                                                                                                                       |
| 6. `disableIdTokenSignIn` se respeta en `/sign-in/social`                          | `@better-auth/core/dist/oauth2/verify-id-token.mjs:23` y `:39` `if (options.disableIdTokenSignIn) return false;`; `sign-in.mjs:155` `supportsIdTokenSignIn`. Lo afirma el 404 de `auth.integration.test.ts`.                                                                                                                                                                                                 |

Las citas de `src/` del contrato son de `27774d6`; la subida a 1.7.10 solo tocó
un comentario de `src/server/auth.integration.test.ts` y ninguna línea citada.

## Commits

| Commit    | Qué                                                                                                              |
| --------- | ---------------------------------------------------------------------------------------------------------------- |
| `bdb5025` | Tipos y textos de §4.1 y §4.6, con valores neutros en la vista y en `entryFactsOf` hasta el siguiente            |
| `53a4005` | Migración 0017, `can()`, `workspace`, `auth-records`, `email.ts`, el service y las actions de `team`, el ingreso |
| `a11ed39` | Tests de unidad e integración                                                                                    |

## Desvíos y decisiones de implementación

- **`consumeAccountLink` devuelve el solicitante anterior** con un `from` sobre
  la misma fila: el `returning account_link_requested_by_id` de D-E2b-3 devuelve
  la fila nueva, que ya tiene la columna en nulo. La condición de vigencia con
  `clock_timestamp()` es la del contrato.
- **`registersExternal` es `false` en una fila con el correo liberado**: una
  liberada no se vincula, y `<id>@liberado.invalid` no es de los dominios ni
  tiene invitación. El contrato no lo distingue (§4.8).
- **`LINK_ACTIONS` y `LinkAction`** se exportan de `team/schema.ts` para la
  pantalla; el contrato los escribe en línea en `teamMember`.
- **`entryFacts` recibe `linkTtlDays`**: el repository no importa `@/server/access`
  de `workspace`; `entryFactsOf` le pasa `ACCOUNT_LINK_TTL_DAYS`.
- **Los criterios 13 y 14** están en `auth.integration.test.ts`, al lado de
  `signInWithGoogle`, y no en `team/concurrency.integration.test.ts`.
- **El criterio 21** usa `vi.spyOn` sobre el módulo de `auth-records`, como pide
  §9.2; el criterio 22 de `team`, `vi.mock` con un indicador, como el criterio 17
  de E2.
- **La migración se generó con** `npx drizzle-kit generate --name
membership_account_link`, la misma orden que `npm run db:generate` con el
  nombre; después, `npm run db:generate` responde «No schema changes».

## Mutaciones del backend

Cada una se aplicó en una copia del árbol de `a11ed39` (fuera del worktree
compartido), se corrieron los tests que la tienen que ver contra
`clock_e2b_back_mut` y se revirtió.

| Mutación                                                                                     | Falla                                                                                        |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Sin la llamada a `bindRequestedAccount` (§9.2, criterio 2)                                   | criterio 2 por el handler: termina en `account_not_linked`                                   |
| `bindRequestedAccount` antes de `decideGoogleAccess` (criterio 3)                            | criterio 3: queda una `account` y la marca limpia                                            |
| `now()` en lugar de `clock_timestamp()` en `consumeAccountLink` (criterio 6)                 | la marca que vence durante la espera: vincula                                                |
| Sin el `try` de `decideProfileEntry` (criterio 21)                                           | criterio 21: el callback no redirige a `vinculacion_fallida`                                 |
| `lockMembershipOf` sin `for no key update` (criterio 13)                                     | **no falla el 13**; falla el 14 en el orden «la desactivación primero». Ver abajo            |
| `lockMembershipOf` sin bloqueo **y** la decisión con lo leído, con un `update` sin condición | criterio 13: `['unable_to_update_account', null]` en lugar de `[null, 'account_not_linked']` |
| Contar membresías en lugar de filas `user` (§9.2)                                            | «con dos filas user del mismo correo normalizado…»: vincula                                  |
| La autoridad de la sesión en lugar de la releída (criterio 10)                               | «un admin que perdió el rol…»                                                                |
| Desactivar sin cancelar la marca (criterio 9)                                                | criterio 9, los dos casos (el `check` rechaza la desactivación)                              |
| Sin `registerExternalMember` (criterio 15)                                                   | criterio 15: tres casos en `team` y los dos por el handler                                   |
| `releaseEmailOf` sin borrar las cuentas (criterio 16)                                        | criterio 16 en `team`; `releaseEmailOf` en `auth-records`                                    |
| `accountLockOf` sin `team.admin.account` (criterio 10)                                       | criterio 10 (cuatro casos), la vista del admin del criterio 14 de R8 y el criterio 18        |
| Sin `googleAccountOwnerOf` (criterio 12)                                                     | criterio 12 por el handler; `bindRequestedAccount` con un `sub` de otra fila                 |
| `entryFactsOf` sin la marca                                                                  | criterio 2; `entryFactsOf` con una marca vigente                                             |
| Pedir con una vigente escribe (criterio 11)                                                  | criterio 11                                                                                  |
| Reactivar una liberada sin `email_released` (criterio 17)                                    | criterio 17 en `team`; la action con EQ-121                                                  |
| La vista ofrece vincular sin `accountLockOf` (criterio 18)                                   | la vista del admin (R8) y el criterio 18                                                     |
| `claimAccountLink` no responde `inactive` con una inactiva                                   | criterio 14, «la desactivación primero»; `bindRequestedAccount` con la membresía inactiva    |

**Sobre el bloqueo y el criterio 13.** Sin el `for no key update` de
`lockMembershipOf`, dos ingresos con dos `sub` siguen dejando una cuenta: el
`update` de `consumeAccountLink` toma la fila, y el segundo, al conseguirla,
vuelve a evaluar `account_link_requested_at > clock_timestamp() - …` (READ
COMMITTED) y no encuentra la marca. El bloqueo previo es el que da el
`inactive` del criterio 14 cuando la desactivación confirma antes, y lo que
decide con la fila bajo el bloqueo; el 13 lo cubren el bloqueo y la condición
del `update`, y falla cuando faltan los dos.

## Criterio 24: la migración

`npm run db:generate` produjo `drizzle/0017_membership_account_link.sql`:

```sql
ALTER TABLE "membership" ADD COLUMN "account_link_requested_at" timestamp with time zone;
ALTER TABLE "membership" ADD COLUMN "account_link_requested_by_id" text;
ALTER TABLE "membership" ADD CONSTRAINT "membership_account_link_requested_by_id_user_id_fk" FOREIGN KEY ("account_link_requested_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "membership" ADD CONSTRAINT "membership_account_link_active" CHECK ("membership"."account_link_requested_at" is null or "membership"."status" = 'active');
```

`clock_e2b_back_mig`, migrada hasta la `0016` (17 filas en
`drizzle.__drizzle_migrations`), con dos membresías activas y una inactiva; después
`npm run db:migrate` con el diario entero (18 filas) y el control de §6.2:

```
         column_name          |        data_type         | is_nullable
------------------------------+--------------------------+-------------
 account_link_requested_at    | timestamp with time zone | YES
 account_link_requested_by_id | text                     | YES

            conname
--------------------------------
 membership_account_link_active

 count
-------
     0
```

## Criterio 25: las consultas de §6

Sobre la misma base, con esta siembra además de la de arriba (`u-owner`,
`activa@empresa.com` activa sin cuenta, `inactiva@empresa.com` admin inactiva
sin cuenta):

```sql
-- Siembra del criterio 25, sobre la base de arriba (owner, activa e inactiva sin cuenta).
insert into "user" (id, name, email, email_verified) values
 ('u-ext', 'Externa', ' Leo@Gmail.com', true),
 ('u-act-sin', 'Activa sin cuenta', 'sincuenta@empresa.com', true),
 ('u-dup-1', 'Duplicada 1', 'dup@empresa.com', true),
 ('u-dup-2', 'Duplicada 2', 'DUP@empresa.com ', true),
 ('u-cuenta-1', 'Con cuenta 1', 'c1@empresa.com', true),
 ('u-cuenta-2', 'Con cuenta 2', 'c2@empresa.com', true);
insert into membership (workspace_id, user_id, role, status) values
 ('11111111-1111-1111-1111-111111111111', 'u-ext', 'member', 'inactive'),
 ('11111111-1111-1111-1111-111111111111', 'u-act-sin', 'member', 'active'),
 ('11111111-1111-1111-1111-111111111111', 'u-dup-1', 'member', 'active'),
 ('11111111-1111-1111-1111-111111111111', 'u-cuenta-1', 'member', 'active'),
 ('11111111-1111-1111-1111-111111111111', 'u-cuenta-2', 'member', 'active');
-- Todas con cuenta salvo las que la consulta 1 tiene que mostrar.
insert into account (id, account_id, provider_id, user_id, updated_at) values
 ('a-owner', 'sub-owner', 'google', 'u-owner', now()),
 ('a-dup', 'sub-dup', 'google', 'u-dup-1', now()),
 ('a-1', 'sub-repetido', 'google', 'u-cuenta-1', now()),
 ('a-2', 'sub-repetido', 'google', 'u-cuenta-2', now());
insert into time_entry (workspace_id, user_id, started_at, ended_at)
select '11111111-1111-1111-1111-111111111111', u, '2026-10-01 12:00+00', '2026-10-01 13:00+00'
from unnest(array['u-inact', 'u-ext']) as u;
```

**§6.1**, tal cual:

```
        correo         | correo_sin_normalizar |  rol   |  estado  | entradas | invitacion
-----------------------+-----------------------+--------+----------+----------+------------
 activa@empresa.com    | f                     | member | active   |        0 |
 sincuenta@empresa.com | f                     | member | active   |        0 |
 inactiva@empresa.com  | f                     | admin  | inactive |        1 |
 leo@gmail.com         | t                     | member | inactive |        1 |

     correo      | filas
-----------------+-------
 dup@empresa.com |     2

 provider_id |  account_id  | filas
-------------+--------------+-------
 google      | sub-repetido |     2
```

La 1 trae la externa inactiva sin normalizar y sin invitación y las activas sin
cuenta; la 2 y la 3 dan la fila sembrada para que no den vacío.

**§6.8, la marca**, con `sincuenta@empresa.com`, dos veces, y una tercera con el
correo de la inactiva: `INSERT 0 1`, `INSERT 0 1`, `INSERT 0 0`.

```
         action         | actor_id |                      previous_value                      |                        next_value
------------------------+----------+----------------------------------------------------------+----------------------------------------------------------
 membership.linkRequest |          | {"linkRequestedAt" : null}                               | {"linkRequestedAt" : "2026-10-20T01:02:19.942221+00:00"}
 membership.linkRequest |          | {"linkRequestedAt" : "2026-10-20T01:02:19.942221+00:00"} | {"linkRequestedAt" : "2026-10-20T01:02:19.951841+00:00"}
```

La segunda trae la fecha anterior en `previous_value`. `json_build_object` deja
espacios y `+00:00`, distinto del `JSON.stringify` de la aplicación
(`{"linkRequestedAt":"…Z"}`): quien lea el audit log por texto tiene que saberlo.

**§6.8, el externo**, con `leo@gmail.com`, dos veces: `INSERT 0 1` e
`INSERT 0 0`; una invitación `accepted` con `accepted_at` y una sola
`invitation.register`, sin actor.

**§6.5** con `sincuenta@empresa.com`: `active`, pedida, vigente, cero cuentas,
cero sesiones, cero entradas; dos `membership.linkRequest` sin actor. **§6.7**:
cero filas. **§6.6**, pasos 1 y 2: la fila de `sincuenta@empresa.com`, `UPDATE 1`,
y cero marcas después.

## Corridas

Sobre `a11ed39`, con la pantalla de `frontend-dev` sin commitear en el árbol:

| Corrida                                            | Resultado                                                             |
| -------------------------------------------------- | --------------------------------------------------------------------- |
| `npm run lint`                                     | verde                                                                 |
| `npm run typecheck`                                | verde                                                                 |
| `npm test`                                         | 97 archivos, 2407 tests; zona de Buenos Aires: 2 archivos, 305. Verde |
| `npm run test:integration` contra `clock_e2b_back` | 30 archivos, 1945 tests, verde                                        |

## Revisiones

Veredictos: **frontend**, aprobado; **clean code**, con cambios; **tests**, con
cambios; **backend** y **seguridad**, aprobados; **paridad**, pendiente. Los
hallazgos de clean code y de tests que siguen los decidió el team-lead el
2026-10-20 y los aplicó `backend-dev`.

| Commit    | Qué                                                   |
| --------- | ----------------------------------------------------- |
| `2cbe74c` | Clean code 2, 3, 4, 6 y 7                             |
| `36fd524` | Clean code 1: `linkRequested` en `ChangeStatusResult` |
| `b22de43` | Tests T1 a T5                                         |

### Clean code

| Hallazgo                                                                           | Qué se hizo                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. `team-members.tsx` deduce en el cliente si la reactivación pidió la vinculación | `ChangeStatusResult` suma `linkRequested: boolean`; `changeStatus` lo devuelve con lo que decidió bajo el bloqueo (paso 9, `hasAccount(tx, …)`): `true` solo al reactivar sin cuenta, `false` al desactivar y en los idempotentes. Lo afirman los tests de `changeStatus` del service y de la action, incluida una activa sin cuenta que pide `active` (el cliente habría deducido `true`). El componente compila sin cambios; usar el campo es de `frontend-dev`. |
| 2. `registersExternalOf` repite la regla de `registerExternalMember`               | `workspace/service.ts` exporta `registersAsExternal(email, invitationStatus)`, pura. `registerExternalMember` la usa dos veces —sin invitación, para no bloquear con un correo de los dominios, y con la invitación bloqueada— y `registersExternalOf` de `team` la usa después de descartar una liberada (ADR 0010).                                                                                                                                              |
| 3. `consumeAccountLink` pierde `ttlDays`                                           | Usa `ACCOUNT_LINK_TTL_DAYS`, como `linkValid`. El parámetro de `entryFacts` de `workspace` queda: es el desvío ya aceptado.                                                                                                                                                                                                                                                                                                                                        |
| 4. `releaseEmailOf` relee el correo                                                | Recibe `previousEmail`, el que `releaseEmail` leyó con `userEmailOf` para el paso 4.                                                                                                                                                                                                                                                                                                                                                                               |
| 6. `EntryMembership.linkValid` no lo usa nadie                                     | Se quitó del tipo y de la sentencia de `lockMembershipOf`.                                                                                                                                                                                                                                                                                                                                                                                                         |
| 7. `accountLockOf` devuelve `true` fuera de alcance                                | Pasa a `isAccountActionLocked`. Es privada del service: ningún componente la usa.                                                                                                                                                                                                                                                                                                                                                                                  |

**Desvíos de §4.7 que dejan estos cambios.** `lockMembershipOf` devuelve `id`,
`role` y `status`, sin el `linkValid` «solo para describir»; la vigencia la
decide solo `consumeAccountLink`, que pasa a `consumeAccountLink(tx,
membershipId)`, sin `ttlDays`. `releaseEmailOf` de §4.3 pasa a `(tx, actor,
userId, previousEmail)`.

### Tests

| Hallazgo                                                       | Qué se hizo                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1. Criterio 22: falta un fallo después de `bindGoogleAccount` | `auth.integration.test.ts`: una persona con una cuenta, una sesión y la marca; `vi.spyOn(authRecords, "bindGoogleAccount").mockImplementationOnce` llama a la real y lanza. El callback responde `302` a `vinculacion_fallida`; cuentas, sesión, marca y `audit_log` quedan como estaban. |
| T2. Criterio 17 por el callback                                | Liberar a una inactiva con cuenta (correo externo), invitar su correo anterior (`invited`), entrar con un `sub` nuevo: `302` a `/`, una sola fila `user` con ese correo y otro id; la liberada conserva `releasedEmailOf(id)` y no tiene cuentas.                                         |
| T3. Criterio 6, la marca que vence durante la espera           | Sembrada con `7 days -5 seconds`, como §9.2; la barrera es `holdBarrier`, que `src/test/concurrency.ts` pasa a exportar, y se suelta en un `finally`; la espera del vencimiento tiene un tope de 10 s.                                                                                    |
| T4. Criterio 13 afirma solo el `error`                         | Afirma `[status, location]`: `[302, "/"]` y `[302, deniedLocation("account_not_linked")]`.                                                                                                                                                                                                |
| T5. Criterio 4 no cuenta las entradas                          | Cuenta las `time_entry` de `person.userId` después del ingreso: una.                                                                                                                                                                                                                      |

**La mutación de T1.** `bindGoogleAccount` con `db` en lugar de `tx` en sus
cuatro escrituras (borrar cuentas, borrar sesiones, insertar la cuenta y la
constancia), aplicada en el árbol sin commitear y revertida: el test nuevo
falla en la primera afirmación de cuentas (quedó la del `sub` nuevo en lugar
de la de siempre). Con el código real, pasa.

### Frontend

En `9594398`, de `frontend-dev`:

- Clean code 1, la pantalla: `onSuccess` de `changeStatus` arma el desenlace con `statusChangedOf(name, result)` de `team-members-model.ts`, que toma `linkRequested` del resultado; se borró el ref `statusLinks`. Sin entorno de DOM en `npm test`, los dos tests nuevos van en `team-members-model.test.ts`: el aviso sale con `linkRequested: true` aunque la fila tenga cuenta, y no sale con `false` aunque no la tenga.
- `returnFocusTarget` pasa de `deactivate-dialog.tsx` a `team-members-model.ts`, junto a `rowActionsId` y `rowHeaderId`; los tres diálogos la importan de ahí.
- `equipo/page.tsx`: el import de `@/modules/profile/service` va antes de `@/modules/team/actions`.

Corridas sobre `9594398`: `npm run lint` y `npm run typecheck` en verde; `npm test`, 97 archivos y 2409 tests, y zona de Buenos Aires, 2 archivos y 305. Verde.

### Documentos

En el contrato, notas fechadas el 2026-10-20 en §5.1 (la página pasa
`timeSettingsOf(session)` y `TeamScreen` resuelve las fechas de la vinculación)
y en §9.2 (el 13 no falla sin el bloqueo; el bloqueo de `lockMembershipOf` lo
cubre el 14).

### Corridas

Sobre `b22de43`, contra `clock_e2b_fix_back`:

| Corrida                                                                   | Resultado                                                             |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `npm run lint`                                                            | verde                                                                 |
| `npm run typecheck`                                                       | verde                                                                 |
| `npm test`                                                                | 97 archivos, 2407 tests; zona de Buenos Aires: 2 archivos, 305. Verde |
| Integración de `src/server`, `src/modules/team` y `src/modules/workspace` | 12 archivos, 394 tests, verde                                         |
