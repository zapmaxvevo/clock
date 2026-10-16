# Fase 2, E1a: invitar y revocar

Contrato del slice E1a de la fase 2. Trae las invitaciones por correo: owner y
admin invitan desde `/equipo` a una o varias personas, del dominio de la empresa
o de otro, ven a las invitadas en la lista y revocan una invitación pendiente.
Clock no manda correo: muestra el texto para avisar a mano. **No cierra la
puerta**: el dominio sigue entrando sin invitación hasta E1b; lo que cambia en
el ingreso es que un correo de otro dominio entra también por una invitación de
la base, y que quien no entra lo ve explicado en `/login`. Trae además la
migración única de `EXTERNAL_INVITE_EMAILS` a la base, como un script que corre
el usuario.

- **Fuente:** [`equipo.md`](../parity/equipo.md), §2 y §3 (EQ-12 … EQ-33), §10
  (EQ-76 … EQ-92), §11 a §14; el [mapa de la fase 2](fase2-mapa.md), §2 (el
  ingreso en producción) y §3 «E1a».
- **Lugar en el plan:** primer slice de la fase 2. No depende de otro slice; E1b
  depende de este y de que en producción estén hechas las invitaciones y la
  migración de la variable (§6).
- **Revisión:** `architecture-reviewer` aprobó con cambios en `dff919e`; están
  aplicados: qué ve quien no entra (D-E1a-14), la decisión del ingreso en una
  función probada (§4.5), la reversión con los externos de la base (§2), y en
  los ADR, el rechazo del gancho de sesión y quién borra una membresía. Aprobado
  en `c879d57`, con un cambio también aplicado: el test que recorre el handler
  de Better Auth (§9.2), que vuelve la comprobación de §6.4 una verificación de
  humo.
- **Decisiones de arquitectura**, las dos **aceptadas** por el usuario el
  2026-10-16 (§11):
  - [ADR 0024](../adr/0024-donde-vive-una-invitacion-y-donde-se-corta-el-ingreso.md):
    la invitación es del módulo `workspace`, una fila por correo, la regla de
    ingreso por vía, el corte en `mapProfileToUser` con el rechazo en `/login`,
    qué habilita una invitación aceptada, la excepción al ADR 0007 y el índice.
  - [ADR 0025](../adr/0025-un-modulo-escribe-en-otro-por-su-service.md): un
    módulo escribe en las tablas de otro solo por una función del service
    dueño. E1a no la usa (D-E1a-1); la deja escrita para E2, E2b, E3 y E6.
  - Aceptados que se aplican: el
    [0010](../adr/0010-un-modulo-consulta-las-reglas-de-otro-por-su-service.md)
    (la pantalla de `team` lee las invitaciones por el service de `workspace`),
    el [0011](../adr/0011-las-acciones-en-masa-son-todo-o-nada.md) (invitar
    varios correos es todo o nada) y el
    [0023](../adr/0023-quitar-el-rol-de-admin-es-una-accion-propia.md) (el
    control de rol de R8 no cambia).

Decisiones del usuario que el contrato da por tomadas (2026-10-16): un member no
ve `/equipo` (P-01); todos entran por invitación, que cierra E1b (P-02); owner y
admin invitan correos de otro dominio (P-03); sin correo, con un texto para
copiar (P-04).

## Decisiones del contrato

**D-E1a-1 — Las invitaciones son de `workspace`; la pantalla sigue en `team`.**
Lo fija el ADR 0024: la invitación se acepta donde nace la membresía, en
`ensureWorkspaceContext`, y `workspace` no puede importar de `team` (`team` →
`profile` → `workspace`). Entonces:

- **`workspace`** tiene la tabla, el repository, las reglas, la lectura para la
  pantalla y las dos actions (`inviteMembers`, `revokeInvitation`). Es el primer
  `schema.ts` y el primer `actions.ts` del módulo.
- **`team`** dibuja: la página `/equipo` pide la vista de `team` y, si está
  lista, la de invitaciones de `workspace`, y le pasa a la pantalla las actions
  de los dos módulos por props. Los componentes nuevos viven en
  `team/components` e importan tipos de `workspace/schema.ts`.
- **Ninguna escritura cruza módulos** en este slice: el ADR 0025 no se aplica
  todavía.

**D-E1a-2 — La tabla `invitation` reemplaza a `external_invite`.** La vieja está
vacía y nadie la usa. La migración corta si tiene alguna fila (§2). El nombre
nuevo dice lo que guarda: también las invitaciones del dominio.

**D-E1a-3 — Una fila por `(workspace, correo)`; volver a invitar la reusa.**
Estados `pending`, `accepted` y `revoked`. Invitar un correo con una fila
`revoked`, o `accepted` sin membresía, la devuelve a `pending` con quién y
cuándo invitó de nuevo. Se queda el índice único completo (ADR 0024, decisión 2).
Es lo que resuelve EQ-23, «el correo se puede volver a invitar».

**D-E1a-4 — El ingreso en E1a: la vía externa por la base, sin tocar el
acceso.** La identidad (ADR 0024, decisión 3):

- **vía del dominio**: igual que hoy, correo de `GOOGLE_WORKSPACE_DOMAINS` con el
  claim `hd` en el login, y por el sufijo del correo en el gancho de sesión;
- **vía externa**: un correo **fuera** de esos dominios que tiene una invitación
  `pending` o `accepted` en la base, **o** que está en `EXTERNAL_INVITE_EMAILS`.
  La variable se sigue leyendo hasta E1b, para que nadie quede afuera si el
  script de §6 todavía no corrió.

El acceso no cambia: quien pasa la identidad entra y `ensureWorkspaceContext` le
crea la membresía, como hoy. **Cambio de comportamiento acotado**: un correo
del dominio que esté en la variable ya no entra sin `hd` por la vía externa.
Hoy la variable tiene solo correos externos; el script de §6 lo muestra.

**D-E1a-5 — Toda membresía que nace acepta la invitación pendiente de su
correo**, en la misma transacción que la crea (ADR 0024, decisión 5). Hoy la
única que nace en la aplicación es la de `ensureWorkspaceContext`. Las del
script de importación las cierra la migración de E1b.

**D-E1a-6 — Invitar es todo o nada por correo, sin id del cliente.**

- **Todo o nada** (ADR 0011, EQ-14): cada correo es una fila. Si alguno no se
  puede invitar (EQ-76, EQ-79), no se escribe ninguno y la respuesta es
  `rejected` con la lista. Un pedido vacío o de más de 50 (EQ-77, EQ-78) es una
  causa de todo el pedido: `validation`, sin lista.
- **Sin id del cliente**: excepción al ADR 0007 que registra el ADR 0024
  (decisión 6). El reintento se resuelve por el correo: lo que el primer intento
  creó, el segundo lo encuentra pendiente y lo cuenta como «ya estaba
  invitada» (EQ-19, EQ-97).

**D-E1a-7 — Cómo se clasifica cada correo.** Después de recortar y pasar a
minúsculas (EQ-105) y de quitar los repetidos del pedido:

| Lo que hay para ese correo en el workspace       | Resultado                                        | Escribe                    |
| ------------------------------------------------ | ------------------------------------------------ | -------------------------- |
| No es un correo válido, o pasa de 320 caracteres | rechazo `invalid_email`, EQ-76                   | —                          |
| Una membresía `active`                           | `already_member`, «Ya está en el equipo» (EQ-20) | nada                       |
| Una membresía que no está activa                 | rechazo `inactive_member`, EQ-79                 | —                          |
| Sin membresía, invitación `pending`              | `already_invited`, «Ya estaba invitada» (EQ-19)  | nada                       |
| Sin membresía, invitación `revoked` o `accepted` | `invited`                                        | la fila vuelve a `pending` |
| Sin membresía ni invitación                      | `invited`                                        | una fila `pending`         |

- **La membresía se busca por el correo de `user`**, en minúsculas, unida a
  `membership` del workspace. Una membresía tiene prioridad sobre la invitación:
  la persona ya está.
- **`invited` de `membership_status`** no tiene escritor (ADR 0024, decisión 7);
  si apareciera, cae en «no está activa».
- **Una persona de las seis importadas** (`user` sin `account`, membresía
  `inactive`) cae en EQ-79: se la vuelve a sumar reactivándola, con E2 y E2b.

**D-E1a-8 — Revocar: solo pendientes, y el reintento no falla.**

- **`pending`**: pasa a `revoked`, con quién y cuándo (EQ-23).
- **`revoked`**: éxito sin escribir. Es el reintento de una revocación cuya
  respuesta se perdió (EQ-97). **Se aparta del texto anterior de EQ-81**, que
  daba el mensaje también para «se revocó»: lo decidió el usuario el 2026-10-16
  (§11), y EQ-81 está corregido en `equipo.md`.
- **`accepted`**: `not_pending`, «Esa invitación ya no está pendiente.» (EQ-81).
  Cortarle el acceso a quien entró es desactivarlo (EQ-32), con E2.
- **Un id que no existe o es de otro workspace**: `not_found`, con el mismo
  texto de EQ-81: para quien mira es la misma situación (como D-R8-6).

**D-E1a-9 — La autoridad se relee bajo bloqueo.** Como D-R8-7: el `Actor` de la
sesión se armó en otra transacción. Invitar y revocar leen la membresía de
quien actúa con `for share` dentro de su transacción y deciden `can()` con ese
rol y ese estado. `for share` espera a un cambio de rol en curso, que toma
`for no key update` sobre la misma fila, y no choca con el `for key share` de un
alta de horas.

**D-E1a-10 — El aviso para copiar (EQ-26, P-04).** Al invitar, el resultado
muestra por cada correo invitado o que ya estaba invitado el texto «Entrá a
{dirección} con tu cuenta de Google {correo}.», con «Copiar». La dirección es
`BETTER_AUTH_URL`, que es la de producción en producción; la vista la trae del
servidor.

**D-E1a-11 — La variable pasa a la base con un script que corre el usuario.**
SQL no puede leer el entorno, y el team-lead no tiene acceso a producción. Es
`scripts/invitations-from-env/`, con `--dry-run` por omisión y `--apply`, en una
transacción, como el de la importación (§4.6, §6).

**D-E1a-12 — Las invitadas, al final de la tabla y por correo.** No tienen
nombre todavía (EQ-04: el nombre llega de Google en el primer ingreso), así que
no entran en el orden de `compareNames`. Van después de las personas, en el
orden del correo, con su marca. La tercera columna pasa de «Cambiar rol» a
«Acciones», porque aloja también «Revocar invitación».

**D-E1a-13 — La auditoría.** Una fila de `audit_log` por cambio efectivo, en la
transacción del cambio, con `entity: "invitation"` y el id de la fila:

| `action`                   | Cuándo                                       | `actorId`            | Valores                                    |
| -------------------------- | -------------------------------------------- | -------------------- | ------------------------------------------ |
| `invitation.create`        | una fila nueva                               | quien invita         | `next: { email, status: "pending" }`       |
| `invitation.reinvite`      | una fila `revoked` o `accepted` a `pending`  | quien invita         | `previous: { status }`, `next: { status }` |
| `invitation.revoke`        | `pending` a `revoked`                        | quien revoca         | `previous` y `next` con el estado          |
| `invitation.accept`        | `pending` a `accepted` al nacer la membresía | la persona que entra | `previous` y `next` con el estado          |
| `invitation.importFromEnv` | cada fila que crea el script de §4.6         | `null`               | `next: { email, status }`                  |

Un correo que no escribe —ya invitado, ya en el equipo— y un pedido rechazado no
dejan fila.

**D-E1a-14 — Quien no entra lo ve en `/login`.** Hoy no ve nada útil: Better
Auth 1.7.7 llama a `getUserInfo` —y con él a `mapProfileToUser`— fuera de todo
`try` del callback (`node_modules/better-auth/dist/api/routes/callback.mjs:120`),
así que su `APIError("FORBIDDEN")` sale como un JSON 403 en
`/api/auth/callback/google`; el rechazo del gancho de sesión pasa por el `catch`
de `handleOAuthUserInfo` (`:171-194`), que redirige a la dirección de error solo
si el error trae `body.code` (`:192`), y el de hoy no lo trae. E1a suma un
rechazo nuevo, el externo con la invitación revocada (criterio 15), así que lo
resuelve acá y no en E1b. Los dos puntos terminan en
`/login?error=<motivo>`, con el motivo de `AccessDenialReason`:

- **`mapProfileToUser` lanza una redirección**:
  `new APIError("FOUND", undefined, { Location: loginErrorUrl(reason) })`, con la
  dirección absoluta sobre `BETTER_AUTH_URL`. El camino, leído en el código
  instalado: el proveedor de Google la llama sin `try`
  (`@better-auth/core/dist/social-providers/google.mjs:124`); el endpoint corre
  dentro de `dispatchAuthEndpoint` con `asResponse: false`, así que el error se
  relanza (`better-call/dist/endpoint.mjs:29-35`); `dispatch` lo atrapa y junta
  sus cabeceras, `location` incluida, con `mergeAPIErrorHeaders`
  (`better-auth/dist/api/dispatch.mjs:50-62`, `:231-241`), y arma la respuesta
  con el estado 302 y esas cabeceras (`:258-260`;
  `better-call/dist/to-response.mjs:125-129`). El `onError` del router ignora un
  `FOUND` (`better-auth/dist/api/index.mjs:196`). Es lo mismo que hace
  `c.redirect` (`better-call/dist/context.mjs:60-63`), con las cabeceras en el
  error en lugar de en el contexto.
- **El gancho `session.create` lanza un error con código**:
  `new APIError("FORBIDDEN", { message: accessDenialMessage[reason], code: reason })`.
  El callback lo atrapa y llama a `redirectOnError(code, message)`
  (`callback.mjs:191-193`), que redirige a `errorURL ?? defaultErrorURL`
  (`:78-84`); sin `errorCallbackURL` en el pedido de ingreso, vale
  `onAPIError.errorURL` (`:35`). `auth.ts` suma
  `onAPIError: { errorURL: <BETTER_AUTH_URL>/login }`.
- **`/login` muestra el motivo** que conoce, con el texto de
  `accessDenialMessage`, en un aviso con `role="alert"` encima del botón. Un
  código que no conoce —los propios del callback de Better Auth, como
  `state_not_found` o `account_not_linked`— muestra «No se pudo iniciar sesión.
  Volvé a intentar.». **Nunca muestra el texto de la dirección**, ni
  `error_description`: así nadie arma un enlace a `/login` con un mensaje
  propio.
- **La sesión de prueba de los e2e** no pasa por el callback: su rechazo sigue
  siendo una respuesta 403 del endpoint de prueba, que es lo que espera
  `signInRejected` (§9.3).

**El camino se prueba antes del despliegue**, con
`src/server/auth.integration.test.ts` (§9.2): el callback decodifica el
`id_token` sin verificar la firma (`google.mjs:119`), y el único I/O externo es
el POST al endpoint de token de Google, que el test simula. El mismo test
cubre las actualizaciones de Better Auth: si una versión nueva cambia el
camino, falla ahí. La comprobación del usuario después del despliegue (§6.4)
queda como verificación de humo. Si algo fallara en producción, se ve lo de
hoy —el JSON 403—, nunca un acceso de más: la redirección es lo que se lanza en
lugar de dejar pasar.

## 0. Precondición de arranque

- **`main` en `424ac1b`**, con el mapa de la fase 2 y los documentos de paridad
  de las decisiones del 2026-10-16. Las citas de abajo son de ese árbol y de
  `node_modules` con `better-auth` 1.7.7.
- **Los ADR 0024 y 0025, aceptados** por el usuario el 2026-10-16 (§11).
- **La consulta previa de §6.1 corrida en producción** antes de desplegar, no
  antes de implementar.

### Supuestos sobre el árbol, con archivo y línea en `424ac1b`

| Supuesto                                                                                                           | Dónde                                                                                             |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `member.invite` existe sobre `WorkspaceResource`, para `owner` y `admin`; `can()` corta por estado y por workspace | `src/server/permissions/index.ts:64`, `:102`, `:133`, `:187-192`                                  |
| `external_invite`: workspace, correo, quién invitó, `revoked_at`; índice único no parcial; sin uso en el código    | `src/server/db/schema.ts:178-199`                                                                 |
| `membership_status` con `active`, `inactive`, `invited`; `membership` única por `(workspace_id, user_id)`          | `schema.ts:33-37`, `:97-123`                                                                      |
| La política de acceso sale de la variable; `mapProfileToUser` decide con el perfil y lanza `FORBIDDEN`             | `src/server/auth.ts:19-25`, `:72-88`                                                              |
| El gancho `session.create` vuelve a comprobar el correo guardado con `isAllowedEmail`, sin `hd`, y sin código      | `auth.ts:104-121`                                                                                 |
| `decideGoogleAccess` exige dominio y `hd`, o la lista de invitados; `normalize` y `domainOf` son privadas          | `src/server/access.ts:26-71`, `:77-83`                                                            |
| `OAuthProfileMapper` devuelve `Awaitable`: `mapProfileToUser` puede leer la base                                   | `node_modules/@better-auth/core/src/oauth2/oauth-provider.ts:291-293`                             |
| El proveedor de Google decodifica el `id_token` sin verificar la firma y llama a `mapProfileToUser` sin `try`      | `node_modules/@better-auth/core/dist/social-providers/google.mjs:116-124`                         |
| El callback de Better Auth: `getUserInfo` sin `try`; el rechazo con código redirige a la dirección de error        | `node_modules/better-auth/dist/api/routes/callback.mjs:35`, `:78-84`, `:120`, `:171-194`          |
| Un `APIError` con cabeceras sale como respuesta con esas cabeceras                                                 | `better-auth/dist/api/dispatch.mjs:50-62`, `:231-260`; `better-call/dist/to-response.mjs:125-129` |
| `/login` no lee ningún parámetro; el botón muestra solo el error de la llamada inicial                             | `src/app/login/page.tsx:6-25`; `src/components/layout/google-sign-in-button.tsx:15-18`            |
| `ensureWorkspaceContext` crea la membresía de cualquiera con sesión, en una transacción                            | `src/modules/workspace/service.ts:57-87`; `workspace/repository.ts:80-101`                        |
| El comentario de `joinedAt` dice que con invitaciones pasaría a ser la fecha de la invitación                      | `workspace/service.ts:97-102`                                                                     |
| `EXTERNAL_INVITE_EMAILS` se parsea con un `csv` privado de `env.ts`                                                | `src/server/env.ts:3-8`, `:19`                                                                    |
| La sesión de prueba crea el `user` y la sesión por el adaptador, que pasa por el gancho `session.create`           | `src/server/test-session.ts:84-110`                                                               |
| `/equipo`: la página compone la vista de `team` y pasa la action por props; la tabla y su tercera columna          | `src/app/(app)/equipo/page.tsx:1-10`; `team/components/team-members.tsx:140-166`; `labels.ts:21`  |
| `RejectedError`, `handle` con la revalidación también en el error, `recordAudits`                                  | `src/server/action.ts:39-49`, `:106-123`; `src/server/audit.ts:39-47`                             |
| `useAction` con `rejections` y `retry`                                                                             | `src/hooks/use-action.ts:46-111`                                                                  |
| `truncateAll` nombra `external_invite`                                                                             | `src/test/database.ts:11`                                                                         |
| El precedente de script de operación: cliente `pg` propio, `--dry-run` por omisión, una transacción                | `scripts/import-clockify/main.ts:1-48` (rama `ops/importar-clockify`)                             |

## 1. Alcance

Cubre EQ-04, EQ-12 … EQ-14, EQ-16, EQ-19 … EQ-23, EQ-25, EQ-26, EQ-32 (la
migración única), EQ-76 … EQ-79, EQ-81, EQ-90, EQ-93, EQ-97, EQ-105 y EQ-106.
Del ingreso, la vía externa por la base (EQ-22), la aceptación al nacer la
membresía (parte de EQ-17) y el lugar donde se muestra un rechazo (la nota de
§10 de `equipo.md` sobre EQ-91 y EQ-92, con los motivos de hoy).

Entra:

- **La tabla `invitation`** y su migración, que borra `external_invite` (§2).
- **En `workspace`**: `schema.ts` y `actions.ts` nuevos; las lecturas y las dos
  mutaciones en `service.ts` y `repository.ts`; la aceptación en
  `ensureWorkspaceContext`.
- **En el ingreso**: la vía externa por la base, la decisión en una función
  propia (`src/server/entry.ts`), los dos rechazos hacia `/login` y el aviso en
  `/login` (D-E1a-14).
- **En `/equipo`**: «Invitar» con su diálogo y su resultado, las invitadas en la
  tabla con «Revocar invitación» y su confirmación, y el vacío de EQ-93.
- **El script** `scripts/invitations-from-env/` y su entrada en `package.json`.
- **Tests** de unidad, integración —con el recorrido del handler de Better Auth—
  y e2e (§9).

Queda afuera: §12.

### Consecuencias sobre código ya entregado

| Archivo                                                            | Qué cambia                                                                                 | Qué hay que volver a probar                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `src/server/db/schema.ts`                                          | Sale `externalInvite`; entran `invitationStatus` e `invitation`                            | `schema.integration.test.ts` de los módulos     |
| `src/server/access.ts`, `access.test.ts`                           | La vía externa recibe un hecho (`invited`); no vale para el dominio; `loginErrorMessage`   | `access.test.ts` entero                         |
| `src/server/auth.ts`                                               | Delega en `entry.ts`; redirección y código en los rechazos; `onAPIError.errorURL`          | `auth.integration.test.ts` (nuevo), e2e entera  |
| `src/server/env.ts`                                                | El `csv` de correos sale a `src/lib/email.ts` como `parseEmailList`                        | `env` en los tests que lo cargan                |
| `src/app/login/page.tsx`                                           | Lee `error` y muestra el motivo                                                            | `login` (test de componente nuevo)              |
| `src/modules/workspace/service.ts`, `repository.ts`                | Aceptación en `ensureWorkspaceContext`; lecturas y mutaciones; el comentario de `joinedAt` | `workspace/service.integration.test.ts`         |
| `src/app/(app)/equipo/page.tsx`                                    | Pide también la vista de invitaciones y pasa sus actions                                   | e2e de `team.spec.ts`                           |
| `team/components/team-screen.tsx`, `team-members.tsx`, `labels.ts` | «Invitar», las filas de invitadas, la columna «Acciones», el vacío                         | `team-screen.test.tsx`, `team-members.test.tsx` |
| `src/test/database.ts`                                             | `truncateAll` nombra `invitation` en lugar de `external_invite`                            | toda la integración                             |

- **`team.spec.ts` de R8 no cambia de valor**: ninguna afirmación nombra la
  tercera columna; `team-screen.test.tsx:141` sí, y pasa a «Acciones».
- `profile`, `report`, `project` y `time-entry` no cambian.

## 2. Esquema y migración

```ts
export const invitationStatus = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "revoked",
]);

/**
 * Una invitación por correo y workspace (ADR 0024). La escribe solo el módulo
 * `workspace`. Volver a invitar reusa la fila: la historia está en `audit_log`.
 */
export const invitation = pgTable(
  "invitation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    /** Recortado y en minúsculas: el `check` lo exige. */
    email: text("email").notNull(),
    status: invitationStatus("status").notNull().default("pending"),
    invitedById: text("invited_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedById: text("revoked_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("invitation_workspace_email_unq").on(table.workspaceId, table.email),
    check(
      "invitation_email_normalized",
      sql`${table.email} = lower(btrim(${table.email}))`,
    ),
    check("invitation_email_len", sql`char_length(${table.email}) between 3 and 320`),
    check(
      "invitation_accepted_at",
      sql`(${table.status} = 'accepted') = (${table.acceptedAt} is not null)`,
    ),
    check(
      "invitation_revoked_at",
      sql`(${table.status} = 'revoked') = (${table.revokedAt} is not null)`,
    ),
  ],
);
```

- **La migración**, generada con `npm run db:generate` y retocada a mano al
  principio: un bloque que corta si `external_invite` tiene filas, antes de
  borrarla.

  ```sql
  do $$
  begin
    if exists (select 1 from external_invite) then
      raise exception 'external_invite tiene filas: migrarlas a mano antes de seguir';
    end if;
  end $$;
  ```

  `drizzle-kit` puede preguntar si `invitation` es un renombre de
  `external_invite`: **no lo es**; se borra una y se crea la otra.

- **Ningún índice más**: el único `(workspace_id, email)` sirve a todas las
  lecturas por correo; la lista de pendientes de un workspace lo usa por su
  prefijo.
- **Orden de despliegue**: la migración antes que el código, como siempre que se
  suma una tabla. Ningún código desplegado lee `external_invite`.
- **Reversión**: una migración hacia adelante que borra `invitation` y su tipo y
  vuelve a crear `external_invite` vacía, y el despliegue del código anterior.
  **Antes de revertir**, el usuario lista en producción los externos que tienen
  invitación en la base y los suma a `EXTERNAL_INVITE_EMAILS` en Vercel: el
  código anterior solo los conoce por la variable, y un externo invitado desde
  la pantalla —Nicolas Veliz, por ejemplo— quedaría afuera.

  ```sql
  select email, status from invitation
  where status in ('pending', 'accepted')
  order by email;
  ```

  De esa lista se suman los correos fuera de `GOOGLE_WORKSPACE_DOMAINS`. Se
  pierden las invitaciones del dominio, que en E1a no dan acceso. **E1a no se
  revierte después de E1b**, que depende de ellas.

## 3. Permisos

**Ninguna acción nueva.** `member.invite` (owner y admin) cubre invitar, revocar
y leer las invitaciones pendientes: «Only owners and admins can invite new
users to a workspace, deactivate users, revoke their invite…» (EQ-12).

- **Antes de abrir la transacción**: `can(actor, "member.invite", workspace)`
  con el actor de la sesión. Sin permiso, no se abre.
- **Dentro**: `can()` con el actor releído bajo `for share` (D-E1a-9). Un admin
  bajado o desactivado entre la sesión y el bloqueo recibe `forbidden`.
- **La lectura** de invitaciones devuelve `forbidden` sin `member.invite`, sin
  leer nada.
- **Ninguna decisión de acceso fuera de `can()`**: la clasificación de D-E1a-7 y
  los estados de D-E1a-8 son reglas del dominio, con sus códigos.

El ingreso no pasa por `can()`: es la regla de `access.ts`, que no tiene actor
(ADR 0024).

## 4. Contrato

El recorrido de `CLAUDE.md`: la action obtiene la sesión con `handle`, valida
con Zod y llama al service; el service consulta `can()` antes de la transacción
y dentro, con la autoridad releída; aplica las reglas, escribe y audita en una
transacción; la action revalida.

### 4.1 Utilidades de correo (`src/lib/email.ts`, nuevo)

```ts
/** Recortado y en minúsculas: la forma con que se guarda y se compara (EQ-105). */
export function normalizeEmail(value: string): string;

/** El dominio, sin la arroba; cadena vacía si no hay arroba. */
export function domainOf(email: string): string;

/** La lista de la variable de entorno, separada por comas; la usa `env.ts` y el script de §4.6. */
export function parseEmailList(value: string): string[];
```

`access.ts` deja de tener sus copias privadas y las importa. Son puras: las usan
el servidor, el navegador y el script.

### 4.2 Esquemas (`src/modules/workspace/schema.ts`, nuevo)

```ts
import { z } from "zod";

import type { ActionErrorCode, ActionResult } from "@/server/action";

/** EQ-78: el tope de correos por pedido. */
export const INVITE_LIMIT = 50;

/** El largo máximo de un correo, el mismo que el `check` de la base. */
export const EMAIL_MAX_LENGTH = 320;

/** Textos que la interfaz muestra tal cual (EQ-76 … EQ-81, EQ-90). */
export const invitationMessages = {
  forbidden: "No tenés permiso para hacer esto.",
  noEmails: "Escribí al menos un correo.",
  tooMany: `Se pueden invitar hasta ${INVITE_LIMIT} correos por vez.`,
  invalidEmail: (email: string) => `${email} no es un correo válido.`,
  inactiveMember: (email: string) =>
    `${email} está desactivada: reactivala desde la lista.`,
  notPending: "Esa invitación ya no está pendiente.",
  rejected: "No se invitó a nadie.",
  unexpectedInvite:
    "No se pudieron mandar las invitaciones. Revisá la conexión y volvé a intentar.",
  unexpectedRevoke:
    "No se pudo revocar la invitación. Revisá la conexión y volvé a intentar.",
} as const;

export type InvitationErrorCode =
  ActionErrorCode | "rejected" | "invalid_email" | "inactive_member" | "not_pending";

/**
 * Lo que manda el diálogo: los correos ya separados (§5.3), crudos. El servidor
 * los normaliza, quita los repetidos y clasifica (D-E1a-7).
 */
export const inviteInput = z.object(
  {
    emails: z
      .array(z.string(), { error: invitationMessages.noEmails })
      .min(1, { error: invitationMessages.noEmails })
      .max(INVITE_LIMIT, { error: invitationMessages.tooMany }),
  },
  { error: invitationMessages.noEmails },
);
export type InviteInput = z.infer<typeof inviteInput>;

export const revokeInvitationInput = z.object(
  { invitationId: z.uuid({ error: invitationMessages.notPending }) },
  { error: invitationMessages.notPending },
);
export type RevokeInvitationInput = z.infer<typeof revokeInvitationInput>;

/** Un correo del pedido, ya normalizado, con lo que pasó (D-E1a-7). */
export type InviteOutcome = {
  readonly email: string;
  readonly result: "invited" | "already_invited" | "already_member";
  /** Fuera de los dominios de la empresa: la marca «Externa». */
  readonly external: boolean;
};

export type InviteResult = {
  /** En el orden del pedido, sin repetidos. */
  readonly outcomes: readonly InviteOutcome[];
};

export type RevokeInvitationResult = { readonly invitationId: string };

/** Una invitación pendiente, para la tabla (EQ-04). */
export type PendingInvitation = {
  readonly id: string;
  readonly email: string;
  readonly external: boolean;
};

export type InvitationsView =
  | { readonly kind: "forbidden" }
  | {
      readonly kind: "ready";
      /** En el orden del correo (D-E1a-12). */
      readonly invitations: readonly PendingInvitation[];
      /** `BETTER_AUTH_URL`: la dirección del aviso (D-E1a-10). */
      readonly appUrl: string;
    };

/** Las actions, como las recibe la pantalla por props desde `page.tsx`. */
export type InvitationActions = {
  readonly inviteMembers: (
    input: InviteInput,
  ) => Promise<ActionResult<InviteResult, InvitationErrorCode>>;
  readonly revokeInvitation: (
    input: RevokeInvitationInput,
  ) => Promise<ActionResult<RevokeInvitationResult, InvitationErrorCode>>;
};
```

- **El formato y el largo de cada correo no los valida la entrada**: son un
  rechazo por correo (EQ-14), que el service arma con
  `z.email().max(EMAIL_MAX_LENGTH)` sobre cada uno, ya normalizado. El tamaño
  total del pedido lo acota el límite del cuerpo de las server actions de Next.
- **Los códigos `invalid_email` e `inactive_member`** solo viajan dentro de las
  `rejections`; la respuesta es `rejected` con `invitationMessages.rejected`.
- El archivo no importa nada del servidor: lo carga el navegador.

### 4.3 Repository (`src/modules/workspace/repository.ts`)

```ts
export type InvitationRow = {
  readonly id: string;
  readonly email: string;
  readonly status: "pending" | "accepted" | "revoked";
};

/** Una membresía encontrada por el correo de su `user` (D-E1a-7). */
export type MemberByEmail = { readonly email: string; readonly status: MembershipStatus };

export const workspaceRepository = {
  // … lo que ya existe …

  /** D-E1a-9: la membresía de quien actúa, `for share`. `undefined` si no está. */
  lockActorMembership(
    tx: Transaction,
    workspaceId: string,
    userId: string,
  ): Promise<{ role: Role; status: MembershipStatus } | undefined>;

  /** Las membresías de `workspaceId` cuyo `lower(user.email)` está en `emails`. */
  membersByEmail(
    tx: Transaction,
    workspaceId: string,
    emails: readonly string[],
  ): Promise<readonly MemberByEmail[]>;

  /** Las invitaciones de esos correos, `order by id`, `for update`, en una sentencia. */
  lockInvitationsByEmail(
    tx: Transaction,
    workspaceId: string,
    emails: readonly string[],
  ): Promise<readonly InvitationRow[]>;

  /** Filas nuevas `pending`; `on conflict do nothing`. Devuelve las que insertó. */
  insertInvitations(
    tx: Transaction,
    workspaceId: string,
    emails: readonly string[],
    invitedById: string,
  ): Promise<readonly InvitationRow[]>;

  /** Vuelve a `pending` las filas dadas, con quién y cuándo; limpia aceptada y revocada. */
  reinvite(
    tx: Transaction,
    workspaceId: string,
    ids: readonly string[],
    invitedById: string,
  ): Promise<void>;

  /** La invitación `(workspaceId, id)`, `for update`. */
  lockInvitation(
    tx: Transaction,
    workspaceId: string,
    id: string,
  ): Promise<InvitationRow | undefined>;

  /** `pending` a `revoked`, con quién y cuándo. */
  revoke(tx: Transaction, workspaceId: string, id: string, revokedById: string): Promise<void>;

  /**
   * D-E1a-5: la pendiente de `email` pasa a `accepted`; `where status = 'pending'`.
   * Devuelve el id si cambió alguna.
   */
  acceptPending(
    tx: Transaction,
    workspaceId: string,
    email: string,
  ): Promise<string | undefined>;

  /** Las `pending` de `workspaceId`, `order by email`. */
  listPending(workspaceId: string): Promise<readonly InvitationRow[]>;

  /** D-E1a-4: si el correo tiene una invitación `pending` o `accepted` en el workspace más viejo. */
  hasOpenInvitation(email: string): Promise<boolean>;
};
```

- **Las listas de correos van con `inArray`**, que escribe un parámetro por
  correo (hasta 50): ninguna forma nueva de parámetro, sin comprobación contra
  Neon.
- **`insertInvitations` con `on conflict do nothing`**: el correo que otro pedido
  insertó a la vez no vuelve en el `returning`, y el service lo cuenta como «ya
  estaba invitada» (EQ-106).
- **`acceptPending` compara el correo ya normalizado**: la fila lo guarda en
  minúsculas; el correo de `user` se normaliza antes de llamar.
- **`hasOpenInvitation`** lee el workspace más viejo, como `findFirstWorkspace`:
  hay uno solo y el login todavía no tiene membresía de la que sacarlo.

### 4.4 Service (`src/modules/workspace/service.ts`)

```ts
export class InvitationError extends DomainError<InvitationErrorCode> {}

/** D-E1a-7, pura: la clasifica sin base, para probarla de a una. */
export function planInvitations(
  emails: readonly string[],
  domains: readonly string[],
  members: readonly MemberByEmail[],
  invitations: readonly InvitationRow[],
): InvitationPlan;

/** Sin `member.invite`, `forbidden` sin leer. */
export async function getInvitationsView(actor: Actor): Promise<InvitationsView>;

export async function inviteMembers(
  actor: Actor,
  input: InviteInput,
): Promise<InviteResult>;

export async function revokeInvitation(
  actor: Actor,
  input: RevokeInvitationInput,
): Promise<RevokeInvitationResult>;

/** D-E1a-4: el hecho de la vía externa, para `src/server/entry.ts`. Lee sin actor: no hay sesión. */
export async function hasOpenInvitation(email: string): Promise<boolean>;
```

`InvitationPlan` lleva los `outcomes` en el orden del pedido, las `rejections`,
los correos a insertar y los ids a volver a `pending`.

**`inviteMembers`**, en este orden:

1. **Sin `can(actor, "member.invite", workspace)`**: `forbidden`, sin abrir la
   transacción.
2. **Normaliza** cada correo, quita los repetidos conservando el primero.
3. **`db.transaction`**:
   1. `lockActorMembership`; sin fila, o `can()` con el actor fresco en
      `false`: `forbidden`.
   2. `membersByEmail` y `lockInvitationsByEmail` con los correos válidos.
   3. `planInvitations` con los dominios de `env()`.
   4. **Con rechazos**: `RejectedError` con todos, en el orden del pedido. No se
      escribió nada.
   5. `reinvite` de los ids; `insertInvitations` de los nuevos; los que no
      vuelven en el `returning` pasan a `already_invited`.
   6. `recordAudits` de lo que se escribió (D-E1a-13).
4. Devuelve `{ outcomes }`.

**`revokeInvitation`**:

1. Sin `member.invite`: `forbidden`, sin abrir la transacción.
2. **`db.transaction`**: `lockActorMembership` y `can()` fresco, como arriba;
   `lockInvitation`; sin fila: `not_found`; `revoked`: devuelve sin escribir;
   `accepted`: `not_pending`; `pending`: `revoke` y `recordAudit`.

**`ensureWorkspaceContext`**: en la rama que crea la membresía, en la misma
transacción, `acceptPending(tx, workspaceId, normalizeEmail(user.email))` y, si
devolvió un id, `recordAudit` de `invitation.accept` con la persona como actor.
La rama que encuentra la membresía no escribe: el costo por pedido no cambia.

- **El orden de los bloqueos** en invitar y revocar: la membresía de quien actúa
  y después las invitaciones, por id. La aceptación toma la invitación después
  de insertar una membresía nueva, que nadie más bloquea: no hay ciclo.
- **EQ-107** (la invitada entra mientras la revocan): las dos escrituras son
  `update … where status = 'pending'` sobre la misma fila; la segunda vuelve a
  evaluar el `where` después del bloqueo. Si gana la revocación, la membresía
  nace igual —en E1a el acceso no depende de la invitación— y la invitación
  queda `revoked`; si gana la aceptación, revocar responde `not_pending`.
- **El comentario de `WorkspacePerson.joinedAt`** se corrige: la membresía nace
  al aceptar, así que `created_at` es la fecha de activación (EQ-33).

### 4.5 El ingreso (`access.ts`, `entry.ts`, `auth.ts`, `/login`)

**`src/server/access.ts`** sigue puro:

```ts
export type AccessPolicy = {
  /** Dominios de Google Workspace habilitados. */
  readonly domains: readonly string[];
};

/**
 * Decide sobre el perfil de Google. `invited`: el correo tiene una invitación
 * `pending` o `accepted` en la base o, hasta E1b, está en la variable. Vale solo
 * para un correo fuera de los dominios (ADR 0024, decisión 3).
 */
export function decideGoogleAccess(
  profile: GoogleProfile,
  policy: AccessPolicy,
  invited: boolean,
): AccessDecision;

/** El correo guardado, en cada inicio de sesión: por el sufijo, o externo e invitado. */
export function decideStoredEmail(
  email: string,
  policy: AccessPolicy,
  invited: boolean,
): AccessDecision;

/**
 * D-E1a-14: el texto de `/login` para el parámetro `error`. `null` sin
 * parámetro; el de `accessDenialMessage` para un motivo conocido; un texto
 * genérico para cualquier otro. Nunca devuelve el parámetro.
 */
export function loginErrorMessage(code: string | undefined): string | null;
```

`isAllowedEmail` pasa a ser `decideStoredEmail`, que devuelve el motivo además
de la decisión: el gancho lo necesita para el código.

**`src/server/entry.ts`** (nuevo) arma la decisión con la variable y la base, y
es lo que se prueba en integración:

```ts
/** D-E1a-4: el ingreso desde el perfil de Google. Lee la variable y la invitación. */
export async function decideProfileEntry(profile: GoogleProfile): Promise<AccessDecision>;

/** En cada inicio de sesión, con el correo guardado. */
export async function decideStoredEmailEntry(email: string): Promise<AccessDecision>;

/** D-E1a-14: `<BETTER_AUTH_URL>/login?error=<motivo>`, absoluta. */
export function loginErrorUrl(reason: AccessDenialReason): string;

/** D-E1a-14: el error que lanza el gancho, con el motivo como código. */
export function sessionEntryError(reason: AccessDenialReason): APIError;
```

Las dos decisiones normalizan el correo, calculan `invited` como
`parseEmailList(EXTERNAL_INVITE_EMAILS).includes(email) || await hasOpenInvitation(email)`
—la base solo si hace falta: un correo del dominio con `hd` no la consulta— y
llaman a la función pura.

**`src/server/auth.ts`** solo traduce:

- `mapProfileToUser` pasa a ser `async`: `decideProfileEntry(profile)`; si no
  entra, `throw new APIError("FOUND", undefined, { Location: loginErrorUrl(reason) })`.
- el gancho `session.create`: `decideStoredEmailEntry(user.email)`; sin `user`, o
  si no entra, `throw sessionEntryError(reason)`;
- `onAPIError: { errorURL: new URL("/login", BETTER_AUTH_URL).toString() }`.

**`src/app/login/page.tsx`** lee `searchParams.error` y, si
`loginErrorMessage` devuelve un texto, lo muestra en un aviso con
`role="alert"` encima del botón. Una persona con sesión sigue yendo a `/`. Los
textos de `accessDenialMessage` no cambian: dicen lo mismo para el dominio y
para la invitación. El genérico es «No se pudo iniciar sesión. Volvé a
intentar.».

### 4.6 El script (`scripts/invitations-from-env/`)

```
DATABASE_URL=… EXTERNAL_INVITE_EMAILS=… npm run invitations:from-env -- [--dry-run | --apply]
```

- **`plan.ts`**, puro: con los correos de la variable (`parseEmailList`), las
  membresías por correo y las invitaciones que ya existen, decide por correo:
  «se crea `accepted`» si tiene membresía, «se crea `pending`» si no, «ya
  existe (estado)» si tiene fila. Nunca cambia una fila que existe.
- **`main.ts`**: su propio cliente de Drizzle con `pg` y `DATABASE_URL`, como el
  de la importación, porque `env()` exige las variables de Google. Toma el
  workspace más viejo; sin workspace, sale con error. Por omisión `--dry-run`:
  lee e imprime el plan, sin escribir. `--apply`: una transacción que inserta
  las filas del plan y una fila de `audit_log` por cada una
  (`invitation.importFromEnv`, sin actor). Correrlo dos veces escribe la
  primera.
- **`package.json`**: `"invitations:from-env": "tsx scripts/invitations-from-env/main.ts"`.

### 4.7 Actions (`src/modules/workspace/actions.ts`, nuevo)

```ts
"use server";

const options = {
  // La tabla de `/equipo`; ni la navegación ni el resto del shell cambian.
  paths: ["/equipo"],
} as const;

export async function inviteMembers(
  input: InviteInput,
): Promise<ActionResult<InviteResult, InvitationErrorCode>>;
// handle(…, { ...options, messages: { forbidden, unexpected: unexpectedInvite } })

export async function revokeInvitation(
  input: RevokeInvitationInput,
): Promise<ActionResult<RevokeInvitationResult, InvitationErrorCode>>;
// handle(…, { ...options, messages: { forbidden, unexpected: unexpectedRevoke } })
```

### 4.8 Las respuestas

| Situación                                       | Código           | Mensaje                                                   | Lista |
| ----------------------------------------------- | ---------------- | --------------------------------------------------------- | ----- |
| Todo invitable                                  | ok               | —                                                         | —     |
| Algún correo inválido o de una persona inactiva | `rejected`       | «No se invitó a nadie.»                                   | sí    |
| Ningún correo                                   | `validation`     | EQ-77                                                     | no    |
| Más de 50                                       | `validation`     | EQ-78                                                     | no    |
| Sin permiso, o lo perdió bajo el bloqueo        | `forbidden`      | EQ-90                                                     | no    |
| Revocar una aceptada                            | `not_pending`    | EQ-81                                                     | no    |
| Revocar un id que no está                       | `not_found`      | EQ-81                                                     | no    |
| Revocar una revocada                            | ok, sin escribir | —                                                         | —     |
| Red o servidor                                  | `unexpected`     | `unexpectedInvite` o `unexpectedRevoke`, con «Reintentar» | no    |

## 5. Pantalla

### 5.1 La página (`src/app/(app)/equipo/page.tsx`)

Pide `getTeamView(actor)`; si es `ready`, pide `getInvitationsView(actor)`.
Pasa a `TeamScreen` las dos vistas y las tres actions: `changeRole` de `team`,
`inviteMembers` y `revokeInvitation` de `workspace`.

### 5.2 La cabecera y el vacío

- **«Invitar»** a la derecha del título, con la vista de invitaciones `ready`.
  Abre el diálogo de §5.3.
- **EQ-93**: con una sola persona en la tabla —la de quien mira— y ninguna
  invitada, debajo de la tabla «Todavía no invitaste a nadie.» y un segundo
  «Invitar».

### 5.3 El diálogo «Invitar personas»

- **Paso de carga**: un `Textarea` rotulado «Correos», con la ayuda «Uno o más,
  separados por comas, espacios o saltos de línea. Hasta 50 por vez.»;
  «Cancelar» e «Invitar».
- **Separar** es un modelo puro (`invite-model.ts`): parte por comas y
  blancos, descarta vacíos y repetidos sin distinguir mayúsculas. Sin ninguno,
  EQ-77 debajo del campo sin mandar; con más de 50, EQ-78. El servidor vuelve a
  comprobar los dos.
- **Con `rejected`**: el diálogo queda abierto con lo escrito; arriba «No se
  invitó a nadie.» y la lista de las causas, una por correo, con el texto de
  cada rechazo; «Quitar los que fallan» deja en el campo solo los correos sin
  rechazo, separados por saltos de línea, y pone el foco en el campo.
- **Con `unexpected`**: el aviso con «Reintentar», que reenvía el último pedido
  (TT-89).
- **Con éxito**: el diálogo pasa al **paso de resultado**, titulado
  «Invitaciones». Primero «Clock no manda correos: avisale a cada persona con
  este texto.»; después una fila por correo con su resultado («Invitada», «Ya
  estaba invitada», «Ya está en el equipo») y, en las dos primeras, el aviso de
  D-E1a-10 y «Copiar» con nombre accesible «Copiar aviso para {correo}». Copiar
  usa el portapapeles del navegador y anuncia «Aviso copiado.»; si falla,
  «No se pudo copiar. Seleccioná el texto y copialo a mano.». «Listo» cierra el
  diálogo y devuelve el foco a «Invitar».

### 5.4 Las invitadas en la tabla

- **Una fila por invitación pendiente**, después de las personas (D-E1a-12).
  En «Persona», el correo y la marca «Invitada» y, si corresponde, «Externa»
  (EQ-22). En «Rol», «Miembro», sin control (EQ-16). En «Acciones», «Revocar
  invitación», con nombre accesible «Revocar invitación: {correo}».
- **La confirmación**: «¿Revocar la invitación de {correo}?», «No va a poder
  entrar con esta invitación. Podés volver a invitar a este correo cuando
  quieras.», «Cancelar» y «Revocar». Al confirmar, el pedido viaja con el
  botón en `aria-disabled`, como los de R8.
- **Con éxito**, la fila sale con la revalidación, la pantalla anuncia
  «Invitación de {correo} revocada.» y el foco va al título de la tabla.
- **Con error**, el aviso de la tabla de R8 con el título «No se pudo revocar
  la invitación de {correo}.» y la causa; «Reintentar» solo con `unexpected`.
- **Un pedido a la vez en la tabla**: con un cambio de rol o una revocación en
  vuelo, los botones de las dos clases quedan en `aria-disabled`.

### 5.5 Textos (`team/components/labels.ts`)

Suma los textos de §5.2 a §5.4. `changeColumn` pasa a «Acciones». Los mensajes
de error salen de `invitationMessages`, no se copian.

## 6. La transición en producción

Lo que el mapa (§2) pide de E1a: que nadie quede afuera, ni quien ya entró ni
las activas de Clockify que todavía no entraron.

### 6.1 Antes de desplegar

El usuario corre en producción, con `!`:

```sql
select count(*) as filas_external_invite from external_invite;
```

Tiene que dar cero. Si no, se para: la migración también corta (§2).

### 6.2 El despliegue

1. **La migración** (`npm run db:migrate` contra producción, como las
   anteriores).
2. **El código**. Desde acá: el dominio entra como hoy; los correos de la
   variable entran como hoy; un correo externo con invitación de la base entra.
   Nadie pierde el acceso que tenía.

### 6.3 Después del despliegue, en este orden

1. **El script, en seco**, con la variable de producción (la copia el usuario de
   Vercel): `DATABASE_URL=<prod> EXTERNAL_INVITE_EMAILS=<valor> npm run invitations:from-env`.
   Se revisa el plan con el team-lead: un correo del dominio en la variable se
   señala (D-E1a-4).
2. **El script con `--apply`**. Cada correo de la variable queda en la base:
   `accepted` si ya entró, `pending` si no.
3. **El owner invita desde `/equipo`** a las activas de Clockify que todavía no
   entraron (grupo 3 del mapa), Nicolas Veliz incluido, y les manda el aviso.
   Las que ya entraron no necesitan nada.
4. **La corrida siguiente del script de importación**, cuando alguna de ellas
   entra, carga sus horas como hasta ahora: la encuentra como `member`.

Hasta E1b nadie queda afuera por este slice: la variable se sigue leyendo y el
dominio no necesita invitación. La consulta que compara la base con la lista de
Clockify es la precondición de E1b, y la escribe su contrato.

### 6.4 La verificación de humo

Después del despliegue, el usuario entra a Clock con una cuenta de Google de
otro dominio, sin invitación y fuera de la variable: tiene que terminar en
`/login` con «La cuenta no pertenece al dominio de la empresa ni tiene una
invitación vigente.». El camino ya lo prueba `src/server/auth.integration.test.ts`
(§9.2); esto confirma la configuración de producción —`BETTER_AUTH_URL` y el
cliente de Google—, que el test no ve.

## 7. Reparto de archivos

### backend-dev

- `src/server/db/schema.ts` y la migración en `drizzle/` (§2).
- `src/lib/email.ts` y su test; `src/server/env.ts` usa `parseEmailList`.
- `src/server/access.ts`, `access.test.ts`, `src/server/entry.ts` y su test de
  integración, `src/server/auth.ts` y `src/server/auth.integration.test.ts`
  (§4.5, §9.2).
- `src/modules/workspace/schema.ts`, `repository.ts`, `service.ts`,
  `actions.ts` (§4.2 a §4.4, §4.7) y sus tests de integración.
- `scripts/invitations-from-env/` y `package.json` (§4.6).
- `src/test/database.ts` (`truncateAll`) y una fábrica `seedInvitation` en
  `src/test/factories.ts`.
- **Primero fija** el esquema, `workspace/schema.ts`, `loginErrorMessage` y las
  firmas de las actions, y avisa a `frontend-dev`.

### frontend-dev

- `src/app/(app)/equipo/page.tsx` (§5.1) y `src/app/login/page.tsx` (§4.5), con
  su test de componente.
- `team/components/`: `team-screen.tsx`, `team-members.tsx`, `labels.ts`, y los
  nuevos `invite-dialog.tsx`, `invite-model.ts` (con su test),
  `invitation-row.tsx`, `revoke-invitation-dialog.tsx`; los tests de
  componente con `renderToStaticMarkup`.
- No toca `workspace/` ni `src/server/` salvo para importar tipos, textos y
  `loginErrorMessage`.

### e2e-tester

- `e2e/team.spec.ts` (o `e2e/invitations.spec.ts`), `e2e/team-page.ts`,
  `e2e/database.ts` (`invitationStatusOf`), `e2e/session.ts` (`signInRejected`,
  que espera el 403 del endpoint de prueba). Recorridos de §9.3; confirma que
  fallan antes de la implementación.

### parity-analyst

- `equipo.md`: EQ-04 con el orden de D-E1a-12; EQ-32 con el script; la nota de
  §10 sobre EQ-91 y EQ-92, con D-E1a-14. EQ-81 ya quedó corregido el
  2026-10-16, con D-E1a-8.

### Lo que no toca nadie

`profile`, `report`, `project`, `time-entry`, `src/server/permissions/`.

### Orden

1. `backend-dev`: esquema, migración, `workspace/schema.ts`, firmas.
2. En paralelo: `backend-dev` con el service, el ingreso y el script;
   `frontend-dev` con las pantallas contra las firmas; `e2e-tester` con el spec.
3. Las seis revisiones; correcciones; corrida final de e2e.

## 8. Criterios de aceptación

1. **Owner y admin activos ven «Invitar»** en `/equipo`; un member, un
   `project_manager` o un `team_manager` siguen viendo la vista sin permiso de
   R8, y la página no lee invitaciones.
2. **Invitar dos correos nuevos**, uno del dominio y uno de otro, crea dos filas
   `pending` con quién y cuándo, dos filas de `audit_log` `invitation.create`,
   y el resultado los muestra como «Invitada», con el aviso y «Copiar». En la
   tabla aparecen al final, por correo, con «Invitada»; el externo, además, con
   «Externa».
3. **El aviso** dice «Entrá a {BETTER_AUTH_URL} con tu cuenta de Google
   {correo}.», y «Copiar» lo deja en el portapapeles.
4. **Un correo con invitación pendiente** sale «Ya estaba invitada», sin
   escribir ni auditar (EQ-19). **El de una persona activa**, «Ya está en el
   equipo», sin fila (EQ-20).
5. **El de una persona inactiva** rechaza todo el pedido con EQ-79 y no crea
   ninguna fila, tampoco la de los demás correos (EQ-21, EQ-14).
6. **Un correo inválido, o de más de 320 caracteres**, rechaza todo el pedido
   con EQ-76; «Quitar los que fallan» deja solo los válidos, y mandarlos crea
   sus filas.
7. **Sin correos**, EQ-77; **con 51**, EQ-78; en el diálogo sin mandar y en la
   action armada a mano, con `validation`.
8. **«Ana@Empresa.com »** y **«ana@empresa.com»** en el mismo pedido son un solo
   correo, guardado en minúsculas (EQ-105).
9. **Dos pedidos simultáneos** con el mismo correo dejan una fila; los dos
   responden éxito, uno «Invitada» y el otro «Ya estaba invitada» (EQ-106).
10. **Revocar** pide confirmación; con «Revocar», la fila pasa a `revoked` con
    quién y cuándo, deja `invitation.revoke` y sale de la tabla.
11. **Volver a invitar** un correo revocado reusa la fila: `pending`, sin
    `revoked_at`, con el nuevo quién y cuándo, y `invitation.reinvite`.
12. **Revocar una aceptada** responde EQ-81 (`not_pending`); **un id que no
    está o de otro workspace**, EQ-81 (`not_found`); **una revocada**, éxito sin
    escribir.
13. **Sin permiso**: la action de un member responde EQ-90 sin escribir; la de
    un admin al que el owner le quitó el rol entre la sesión y el bloqueo,
    también.
14. **Un correo externo sin invitación ni variable no entra**:
    `decideProfileEntry` y `decideStoredEmailEntry` responden
    `dominio_no_habilitado`; el callback de Google responde 302 a
    `/login?error=dominio_no_habilitado` sin crear la fila `user` (criterio 25),
    y `/login` muestra «La cuenta no pertenece al dominio de la empresa ni tiene
    una invitación vigente.». **Con una invitación pendiente entra**: nace su
    membresía `member` activa, la invitación pasa a `accepted` con
    `invitation.accept`, y en `/equipo` deja de estar entre las invitadas y
    aparece entre las personas.
15. **Con la invitación revocada**, ese correo externo no entra —con el mismo
    destino y el mismo texto del criterio 14—, salvo que esté en la variable.
    Si la revocación llega entre las dos comprobaciones, el gancho de sesión lo
    rechaza con el error de código `dominio_no_habilitado`, que el callback
    redirige al mismo lugar, con `user` y `account` ya creados (criterio 25).
16. **Un correo del dominio con invitación y sin `hd`** no entra: la vía externa
    no vale para el dominio; el destino y el texto son los del criterio 14.
17. **Una persona del dominio sin invitación sigue entrando** (E1a no cierra la
    puerta); si tenía una invitación pendiente, queda `accepted`.
18. **La membresía y la aceptación caen juntas**: si la aceptación falla, la
    membresía no se crea.
19. **El script**: en seco no escribe; con `--apply` crea `accepted` para el
    correo con membresía y `pending` para el que no, con
    `invitation.importFromEnv`; la segunda corrida no escribe nada.
20. **La migración** corta si `external_invite` tiene filas; sin filas, crea
    `invitation` con sus `check`: un correo con mayúsculas o un estado
    `accepted` sin `accepted_at` fallan en la base.
21. **Reintentar** una invitación cuya respuesta se perdió deja el mismo estado
    que el primer intento: una fila, y el resultado del reintento la cuenta como
    «Ya estaba invitada».
22. **EQ-93**: con el owner solo y sin invitadas, «Todavía no invitaste a
    nadie.» con «Invitar».
23. **Revalidación**: después de invitar o revocar, `/equipo` muestra el estado
    nuevo sin recargar.
24. **`/login` con `error`**: un motivo conocido muestra su texto; uno
    desconocido, «No se pudo iniciar sesión. Volvé a intentar.»; sin `error`,
    ningún aviso. El texto del parámetro y `error_description` nunca aparecen en
    la página.
25. **El handler de Better Auth**, recorrido de punta a punta con el endpoint de
    token simulado (§9.2): un externo sin invitación recibe 302 a
    `/login?error=dominio_no_habilitado` y no queda fila `user`; un rechazo del
    gancho de sesión recibe 302 al mismo lugar, con `user` y `account` creados;
    un externo invitado recibe 302 a `/` con la cookie de sesión.

## 9. Plan de tests

### 9.1 Unidad

- `src/lib/email.test.ts`: normalizar, dominio, la lista de la variable.
- `access.test.ts`: la vía externa con `invited` solo fuera del dominio
  (criterio 16); el dominio con y sin `hd`; `decideStoredEmail` con los tres
  casos y su motivo; `loginErrorMessage` con un motivo conocido, uno
  desconocido, `undefined` y un texto armado a mano (criterio 24).
- `entry.ts`: `loginErrorUrl` sobre `BETTER_AUTH_URL`; `sessionEntryError` con
  estado `FORBIDDEN`, `body.code` igual al motivo y el texto de
  `accessDenialMessage`, que es lo que el callback necesita para redirigir.
- `planInvitations`: cada fila de la tabla de D-E1a-7, la prioridad de la
  membresía, el largo, repetidos, el orden de los resultados y de los rechazos.
- `invite-model.test.ts`: separar por coma, espacio y salto de línea; repetidos
  sin distinguir mayúsculas; vacío; 51; «Quitar los que fallan».
- `scripts/invitations-from-env/plan.test.ts`: el plan con membresía, sin ella y
  con fila existente.
- Componentes, con `renderToStaticMarkup`: la tabla con invitadas y marcas, la
  columna «Acciones», el vacío de EQ-93, los dos pasos del diálogo y el aviso;
  `/login` con y sin `error`.

### 9.2 Integración (Postgres)

- **Service de `workspace`**: criterios 2, 4, 5, 6, 7 (con la action), 8, 10,
  11, 12, 13 (con el actor bajado por SQL antes de la llamada) y 18, con las
  filas de `audit_log` (`auditFor`).
- **Concurrencia** con las barreras de `src/test/concurrency.ts`: criterio 9;
  revocar contra aceptar (EQ-107), las dos órdenes; un cambio de rol que baja al
  admin mientras invita.
- **`ensureWorkspaceContext`**: acepta la pendiente al crear; no escribe al
  encontrar; la falla de la aceptación deshace la membresía (criterio 18).
- **El ingreso, `entry.ts`**: `decideProfileEntry` y `decideStoredEmailEntry`
  con un externo con invitación `pending`, `accepted` y `revoked`, sin
  invitación, solo en la variable, y un correo del dominio con invitación y sin
  `hd` (criterios 14 a 16). Con la variable sembrada en `process.env` del test.
- **El handler de Better Auth, `src/server/auth.integration.test.ts`**
  (criterio 25). Recorre `auth.handler(new Request(…))` contra la base de test:
  1. `POST /api/auth/sign-in/social` con `provider: "google"` y
     `callbackURL: "/"`, con el `Origin` de `BETTER_AUTH_URL`; da la dirección
     de Google con el `state` y la cookie del estado, que el test guarda;
  2. `GET /api/auth/callback/google?code=x&state=…` con esa cookie, y `fetch`
     simulado para el POST a `https://oauth2.googleapis.com/token`, que devuelve
     un `id_token` sin firmar con `email`, `email_verified`, `hd` y `sub` —y el
     `nonce` del estado, si el proveedor lo exige—. El callback lo decodifica
     sin verificar la firma (`google.mjs:119`); no hay otro I/O externo.

  Tres casos:
  1. **Externo sin invitación**: 302 con `location`
     `<BETTER_AUTH_URL>/login?error=dominio_no_habilitado`, y ninguna fila
     `user` con ese correo.
  2. **Rechazo del gancho**: `hasOpenInvitation` simulado, `true` en la primera
     llamada (`mapProfileToUser`) y `false` en la segunda (el gancho): 302 al
     mismo lugar, con `user` y `account` creados y sin `session`.
  3. **Externo invitado**, con una invitación `pending` sembrada: 302 a `/` y la
     cookie de sesión en la respuesta.

  Este test es el que cubre las actualizaciones de Better Auth: si una versión
  nueva cambia el camino de D-E1a-14, falla acá.

- **Actions**: la traducción de `rejected` con su lista, `validation`,
  `forbidden`, `not_pending`, `not_found` y `unexpected`, y la revalidación de
  `/equipo`, con el arnés de `profile/actions.integration.test.ts`.
- **El script**: `--dry-run` y `--apply` dos veces contra la base de test
  (criterio 19).
- **La migración**: el bloque que corta, sobre una base con una fila en
  `external_invite` (criterio 20).

Cada test nuevo tiene que poder fallar: se verifica con una mutación en una
copia, como en los slices anteriores.

### 9.3 E2E

Heredan la regla de R2a y R8: cada recorrido usa correos únicos y nunca afirma
sobre la tabla entera. Los externos son `…@externo-e2e.test`, fuera de
`TEST_EMAIL_DOMAIN`.

1. **Invitar y avisar**: un admin invita un correo del dominio y uno externo;
   ve el resultado con el aviso, copia uno (`page.evaluate` sobre el
   portapapeles con el permiso del contexto) y, al cerrar, las dos filas con sus
   marcas.
2. **Rechazo y corrección**: un correo inválido y el de una persona sembrada
   inactiva; el diálogo muestra las dos causas; «Quitar los que fallan»;
   reenviar crea solo el válido.
3. **El externo entra por la invitación**: antes de invitarlo,
   `signInRejected`; después, `signIn` en otro contexto entra; en la pantalla
   del admin, después de recargar, está entre las personas.
4. **Revocar y volver a invitar**: confirmar la revocación saca la fila; el
   externo no entra; invitarlo de nuevo lo deja entrar.
5. **Reintentar**: la respuesta de la invitación se pierde
   (`route.fetch()` + `route.abort()`); «Reintentar» termina en una sola fila.
6. **`/login` con `error`**: `/login?error=dominio_no_habilitado` muestra el
   texto; `/login?error=<texto armado>` muestra el genérico y no el texto.

### 9.4 Lo que no se prueba en e2e

El login de Google: la sesión de prueba no pasa por `mapProfileToUser` ni por el
callback. Lo cubren `access.test.ts`, la integración de `entry.ts` y el
recorrido del handler de Better Auth en `auth.integration.test.ts`; la
configuración de producción, la verificación de humo de §6.4. El script y la
migración se prueban en integración.

## 10. Riesgos

- **La redirección depende de Better Auth por dentro** (D-E1a-14): las líneas
  citadas son de la 1.7.7. Una versión nueva puede cambiar el camino; lo detecta
  `auth.integration.test.ts`, que recorre el handler (§9.2). Si igual llegara a
  producción, el rechazo vuelve a ser el JSON 403: no deja entrar a nadie de
  más.
- **El test del handler simula a Google por dentro**: arma la respuesta del
  endpoint de token y un `id_token` sin firmar. Si una versión nueva de Better
  Auth empieza a verificar la firma en el callback, el test lo dice fallando, y
  habrá que firmar el `id_token` con una clave de prueba.
- **El login lee la base.** `mapProfileToUser` pasa a ser asíncrona; una base
  caída deja de dejar entrar en lugar de dejar entrar de más. Una consulta por
  índice por ingreso, y ninguna para un correo del dominio con `hd`.
- **`onAPIError.errorURL` manda a `/login` también los errores propios del
  callback** —un estado vencido, `account_not_linked` (PF-47)— que hoy van a la
  página de error de Better Auth. Ven el texto genérico. Es una mejora sobre la
  deuda del 7b, no su cierre: el texto propio de una cuenta no enlazada sigue
  siendo P-11 de `perfil.md`, que entra con E2b.
- **Un correo del dominio en la variable deja de entrar sin `hd`** (D-E1a-4). El
  script lo muestra en seco antes de que importe.
- **EQ-79 dice «reactivala desde la lista»**, y reactivar llega con E2. Hasta
  entonces el texto apunta a algo que la pantalla no tiene; se acepta por ser
  el texto de paridad, y la salida es el procedimiento SQL del mapa.
- **La sesión de prueba crea un `user` aunque el gancho la rechace**: en la base
  de e2e quedan `user` sin sesión de los recorridos 3 y 4. No afecta a otros
  specs.
- **El portapapeles en e2e** pide el permiso del contexto; si el navegador de CI
  no lo concede, el recorrido 1 afirma el texto del aviso y deja «Copiar» a la
  unidad.
- **`drizzle-kit` y el renombre** (§2): responder que no es un renombre.
- **Revertir** pide sumar antes los externos de la base a la variable (§2), y no
  se revierte después de E1b.

## 11. Decidido el 2026-10-16

El usuario respondió las dos preguntas del contrato con las recomendaciones:

1. **Los ADR 0024 y 0025, aceptados.** El 0024 decide que la invitación es de
   `workspace`, una fila por correo, el corte en `mapProfileToUser` con el
   rechazo en `/login` y la excepción al ADR 0007; el 0025, cómo escribe un
   módulo en las tablas de otro, que se usa desde E2.
2. **Revocar una invitación ya revocada responde éxito sin escribir**
   (D-E1a-8). Es lo que hace seguro el reintento. EQ-81 de `equipo.md` está
   corregido: su mensaje vale para la invitación que ya se usó.

## 12. Fuera de alcance

- **Cerrar la puerta** (EQ-29 … EQ-31, EQ-33, EQ-91, EQ-107 … EQ-113): E1b,
  con la migración que acepta las pendientes de quien ya tiene membresía, la
  consulta contra la lista de Clockify y el motivo nuevo de EQ-91, que usa el
  camino a `/login` de este slice.
- **El motivo de una persona inactiva** (EQ-92): E2, por el mismo camino.
- **Desactivar, reactivar y el filtro de estado** (EQ-05, EQ-06, EQ-11, EQ-37 …
  EQ-48): E2. EQ-94, el vacío de un filtro, llega con el filtro.
- **Reenviar el aviso** desde la fila de una invitada: no está en la paridad
  (P-04 dejó solo el texto al invitar).
- **Correo de invitación**: Clock no manda correos (P-04).
- **Vencimiento** (EQ-25): las invitaciones no vencen; no hay nada que
  construir.
- **Quitar `invited` de `membership_status`**: deuda del mapa (ADR 0024,
  decisión 7).
