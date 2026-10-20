# Fase 2, WS1: configuración, la pantalla y el nombre

Contrato del slice WS1 de la fase 2. **Trae `/configuracion`**, la pantalla de
configuración del workspace, con el enlace «Configuración» al final de la
navegación para quien puede cambiarla —owner y admin, por
`workspace.settings.update`, que existe en `can()` y no usa nadie—, y su primer
ajuste: **el nombre del workspace**, que se guarda solo al salir del campo o con
Enter, deja constancia en el audit log y se ve en el encabezado del shell sin
recargar. Los otros roles no ven el enlace y, por la dirección, leen que no
tienen permiso; una membresía inactiva ve el aviso de TT-92. Sin cambios de
esquema y sin migración.

- **Fuente:** [`workspace.md`](../parity/workspace.md), §1 (WS-01 … WS-04), §2
  (WS-05, WS-06), §8 (WS-49 … WS-52), §9 (WS-53 … WS-55, WS-58), §10 (WS-61),
  §11 (WS-62), §12 (WS-63, WS-64 el nombre), §13 (WS-65, WS-71 … WS-73), §16 y
  §17 (P-01, P-05, P-08); PF-07, PF-32 y PF-35 de [`perfil.md`](../parity/perfil.md);
  TT-79, TT-89, TT-90 y TT-92 de [`time-tracker.md`](../parity/time-tracker.md);
  el [mapa de la fase 2](fase2-mapa.md), §3 «Lo que vale para todos», «WS1» y lo
  que dicen de WS1 las secciones de WS2b y E4.
- **Lugar en el plan:** después de E1a, E1b, E2, E2b y WS0 (orden del mapa, §3).
  No depende de ninguno por el código; parte del árbol de WS0 A, que borra
  columnas de `workspace` (§0). WS2b y E4 dependen de este.
- **Decisiones de arquitectura:** **ningún ADR nuevo**. Lo que el slice decide
  cae dentro de ADR aceptados o es de forma:
  - [ADR 0025](../adr/0025-un-modulo-escribe-en-otro-por-su-service.md):
    `workspace.name` es una columna del módulo `workspace`, que la escribe con su
    repository. No hay escritura en tablas ajenas.
  - [ADR 0009](../adr/0009-la-configuracion-del-workspace-viaja-en-el-recurso.md):
    el nombre no entra en ninguna decisión de `can()`, así que no viaja en ningún
    recurso; y WS1 no lee `workspace_settings`, porque ninguno de sus ajustes
    vive ahí (D-WS1-7).
  - El [0007](../adr/0007-el-cliente-elige-el-id-de-las-altas.md) y el
    [0011](../adr/0011-las-acciones-en-masa-son-todo-o-nada.md) no se aplican: no
    hay altas ni acciones en masa.

Decisiones del usuario que el contrato da por tomadas (2026-10-16): sin logo
(workspace P-01); se aceptan la ruta, el rótulo «Configuración», las dos
secciones, el guardado por control y los textos de WS-50 a WS-62 (workspace
P-08).

## Decisiones del contrato

**D-WS1-1 — Una acción de `can()` para toda la pantalla: `workspace.settings.update`,
sin acción nueva (WS-02, WS-49).** Ver la pantalla y cambiar cualquier cosa que
ofrezca van juntos: «Only Workspace owners and Admins can see and edit the
Workspace settings.» (WS-02). La acción existe con `WorkspaceResource` y
`["owner", "admin"]` (`permissions/index.ts:55`, `:100`, `:132`) y su test cubre
los cinco roles (`permissions.test.ts:22-28`); ningún service la consulta. WS1
la usa para el enlace, la vista y la mutación del nombre, y WS2b y E4 para sus
ajustes. **No hay `workspace.settings.view`**: separar ver de cambiar pediría un
rol que vea sin cambiar, y Clockify no lo tiene. **No hay una acción propia del
nombre**: ningún ajuste de la pantalla es solo del owner (WS-49).

**D-WS1-2 — La autoridad se relee bajo bloqueo, como las invitaciones del mismo
módulo (D-E1a-9, WS-52).** El `Actor` de la sesión se armó en otra transacción:
un admin al que el owner le quita el rol, o al que desactivan, mientras su
pedido viaja, no escribe. `updateWorkspaceName`:

1. Antes de la transacción, `can(actor, "workspace.settings.update", …)`; sin
   permiso, `ForbiddenError` sin abrir la transacción.
2. En la transacción, `lockActorMembership` (`for share`,
   `workspace/repository.ts:162-173`) y `can()` con el rol y el estado leídos;
   sin membresía o sin permiso, `ForbiddenError`. Espera a un cambio de rol o a
   una desactivación en curso (`for no key update`) y lee lo que confirmaron.

El permiso lo consulta el service y no la action, como `inviteMembers`
(`workspace/actions.ts:17-18`). `handle` traduce `ForbiddenError` a `forbidden`
con el texto del módulo —hoy en `src/server/action.ts:58-60`; con el MCP, en
`failureOf` de `src/server/failure.ts:45-47` (§0)—, así que el módulo no suma
una clase de error ni un código: `WorkspaceSettingsErrorCode` es
`ActionErrorCode`.

**D-WS1-3 — Gana el último, con la fila del workspace bloqueada `for no key
update` (WS-04, WS-65, WS-71).** Después de D-WS1-2, en la misma transacción:

1. `lockWorkspaceName`: el `name` del workspace de la sesión, `for no key
update`. Pone en fila a dos renombres a la vez, y el segundo lee lo que el
   primero confirmó.
2. **El mismo nombre, recortado, no escribe**: éxito sin `update` y sin
   constancia (WS-04, WS-71). Es también lo que hace inofensivo «Reintentar»
   después de una respuesta perdida (WS-62).
3. `update workspace set name = $1` (el `updated_at` lo pone `$onUpdate`) y
   `recordAudit` con `workspace.updateName`, `entity: "workspace"`, `entityId`
   el id del workspace, `previousValue: { name: <anterior> }` y `nextValue: {
name: <nuevo> }`, con quien actúa como actor. **El autor se arma según el
   orden de los merges** (§0): si el MCP ya está en `main`, con
   `...auditActorOf(actor)` (`clock-mcp/src/server/audit.ts:22-30`), que suma
   `oauthClientId` y es la forma de toda constancia armada con un `Actor` desde
   el MCP; si no, con `workspaceId: actor.workspaceId, actorId: actor.userId`,
   como las invitaciones.

- **`for no key update` y no `for update`**: `membership`, `invitation`,
  `time_entry` y `audit_log` apuntan a `workspace.id`
  (`clock-ws0/src/server/db/schema.ts:82`, `:174`, `:419`, `:611`), así que cada
  alta de esas tablas —toda constancia incluida— toma `for key share` sobre la
  fila del workspace, y `for update` la esperaría. Con `for no key update` un
  renombre no traba ninguna alta ni ninguna lectura: `findFirstWorkspace` lee
  sin bloqueo (`workspace/repository.ts:65-74`).
- **El orden de los bloqueos es membresía y después workspace.** Nadie bloquea
  hoy la fila de `workspace`. **E3**, que bloquea las dos membresías y el
  workspace (mapa, «E3», `fase2-mapa.md:473-486`), **tiene que tomar las
  membresías antes que el workspace**: al revés, un renombre con la membresía
  del admin `for share` esperando el workspace, y una transferencia con el
  workspace esperando esa membresía `for no key update`, se esperan en círculo.
  `parity-analyst` lo suma a los riesgos de E3 en el mapa (§7).
- **Sin el bloqueo**, el `update` igual esperaría al otro, pero el anterior que
  guarda la constancia sería el leído antes de esperar, y las dos constancias no
  se encadenarían. El criterio 6 lo frena.

**D-WS1-4 — Revalidación: el árbol entero, como el perfil (WS-64).** La action
revalida `{ path: "/", type: "layout" }`, la misma opción que
`profile/actions.ts:18-27` por el nombre del menú de la cuenta. La guía de este
Next lo describe como «Revalidating all data»: invalida el layout, los anidados
y sus páginas, y purga el caché del cliente
(`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md:42`,
`:167-175`); desde una Server Function «Updates the UI immediately (if viewing
the affected path)» (`:19`). El encabezado lee `session.workspace.name`
(`src/app/(app)/layout.tsx:15`), que `readSession` arma con la base en cada
pedido —hoy en `src/server/session.ts:50-81`; con el MCP, `readSession` delega
en `readUserContext` de `src/server/user-context.ts:54-81`, que hace lo mismo
(§0)—, así que la respuesta de la action trae el encabezado con el nombre
nuevo. El perfil ya prueba el mismo camino con el nombre del menú de la cuenta
(`e2e/profile-name-theme.spec.ts:98`). Las demás personas lo ven en su pedido
siguiente, sin aviso (WS-64).

**D-WS1-5 — La vista sale de la sesión, sin consultas (WS-63).**
`getWorkspaceSettingsView(context)` no lee la base: el nombre está en
`context.workspace`, leído en el mismo pedido, como `getProfileView`
(`profile/service.ts:196-231`). Sin permiso devuelve `forbidden` con el motivo
de `/equipo` (`team/service.ts:153-156`): `inactive` si la membresía no está
activa, `role` si no. WS2b le suma los ajustes de `workspace_settings` y, con
ellos, la primera lectura.

**D-WS1-6 — Perder el rol con la pantalla abierta muestra WS-50 con la
respuesta, no al recargar (WS-52).** `handle` revalida también cuando la action
falla (`src/server/action.ts:73-95`), así que la respuesta `forbidden` llega con
el árbol nuevo: la pantalla pasa a «No tenés permiso para cambiar la
configuración del workspace.» y el enlace «Configuración» sale de la
navegación. El campo con su aviso de WS-58 se desmonta con la pantalla; el
texto de WS-50 es la explicación. WS-52 decía «el próximo cambio responde «No
tenés permiso para hacer esto.» y el control vuelve a su valor; al recargar ve
WS-50»: lo corrige `parity-analyst` (§7). Lo mismo para una membresía
desactivada con la pantalla abierta, que pasa a WS-51. Los textos aceptados en
P-08 no cambian; cambia en qué pedido aparece WS-50.

**D-WS1-7 — Solo «General»; «Registro de tiempo», su `error.tsx` y WS-73 van
con WS2b (WS-03, WS-61, WS-73).** El mapa pedía «las dos secciones de la
pantalla (WS-03): «General» con el nombre y «Registro de tiempo», que llena
WS2b». Una sección sin controles es lo que WS-03 descarta («una sección vacía …
es configuración que no configura nada»), así que WS1 dibuja **solo «General»**
y deja la pantalla armada como una lista de secciones, cada una un `<section>`
con su `<h2>`, para que WS2b sume la segunda y E4 un control a la primera. Y
WS1 **no lee `workspace_settings`**: el nombre es de `workspace`.

- **WS-73** («la pantalla no crea la fila de ajustes si falta»; responde con el
  error inesperado) se cumple en WS1 porque nada la crea, y **su prueba va con
  WS2b**, el primer slice que lee la fila desde `/configuracion`. WS2a la lee
  antes en la sesión, pero lo que WS-73 describe —el error inesperado de la
  pantalla, sin crear la fila— es de la pantalla.
- **El `error.tsx` de `/configuracion`** llega con WS2b y con esa lectura: en
  WS1 la página no lee la base (§5.1).
- `parity-analyst` suma las dos cosas a «WS2b» en el mapa (§7).

**D-WS1-8 — El campo del nombre se comparte con el perfil.** El comportamiento
de WS-04 es el de PF-07 y PF-32, que `profile/components/name-field.tsx:21-102`
ya implementa: borrador local, guardar al salir o con Enter si el recortado no
es el guardado, Esc descarta, vista optimista con `useOptimistic`, aviso con
«Reintentar» solo con `unexpected`, sin `disabled`. **Se mueve a
`src/components/name-field.tsx`** con lo propio de cada pantalla por props, y lo
usan el perfil y la configuración; `profile/components/name-field.tsx` se borra
y `profile-screen.tsx` importa el compartido. Las dos actions tienen la misma
forma, `{ name } → ActionResult<{ name }>`, así que el campo recibe la action
tal cual, sin envolverla. **Alternativa descartada**: copiar el componente en
`workspace/components/`; serían cien líneas iguales, con el comentario sobre el
foco y el borrador incluido, que divergen al primer arreglo.

## 0. Precondición de arranque

- **WS0 A y E2b en `main`.** WS0 mergea en dos pasos (D-WS0-2,
  `clock-ws0/docs/slices/fase2-ws0-columnas.md:64-100`): **A, el código** —el
  esquema sin las columnas y sus lectores, sin nada en `drizzle/`— y **B, la
  migración**. **WS1 necesita solo A**: parte de su esquema, en el que
  `workspace` tiene `id`, `name`, `owner_id`, `timezone`, `created_at` y
  `updated_at`, y `name` es `text not null` sin `check`
  (`clock-ws0/src/server/db/schema.ts:44-57`). WS1 no corre `db:generate`, así
  que puede vivir en un árbol con A y sin B (ADR 0028, regla 2). Si WS1 se
  implementa antes de que A o E2b mergeen, se rebasa sobre `main` antes de las
  revisiones. **WS1 no genera migraciones**.
- **El MCP puede mergear antes o después que WS1**, porque espera un preview con
  el usuario. Las dos variantes:
  - **El MCP entra antes**: WS1 se rebasa sobre él y arma la constancia con
    `...auditActorOf(actor)` (D-WS1-3). La traducción de `ForbiddenError` vive
    en `failureOf` de `src/server/failure.ts:31-54`, que `handle` llama, y
    `readSession` delega en `readUserContext` de
    `src/server/user-context.ts:54-81`: las citas de D-WS1-2 y D-WS1-4 se leen
    ahí. Lo que WS1 da por dado —`forbidden` con el texto del módulo, el
    workspace leído en cada pedido— no cambia. `Actor` suma `oauthClientId`,
    opcional, y la relectura de D-WS1-2 lo conserva con `{ ...actor, role,
status }`.
  - **El MCP entra después**: WS1 arma la constancia con `workspaceId` y
    `actorId`, como las invitaciones, y quien rebasa el MCP sobre WS1 ajusta
    `updateWorkspaceName` a `auditActorOf`, como las demás constancias de su
    rama.
- Las citas de abajo son del árbol de `clock-ws1` en `eb2ba2d`, de
  `clock-mcp` donde se nombra y de `node_modules` del repositorio principal.

### Supuestos sobre el árbol, con archivo y línea

| Supuesto                                                                                                     | Dónde                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `workspace.settings.update` existe con owner y admin y nadie la consulta                                     | `src/server/permissions/index.ts:55`, `:100`, `:132`; `permissions.test.ts:22-28`                                         |
| `can()` corta por estado y por workspace antes que por rol                                                   | `permissions/index.ts:193-198`                                                                                            |
| El encabezado muestra `session.workspace.name`; la navegación recibe `showTeam` de `canManageTeam`           | `src/app/(app)/layout.tsx:15-16`                                                                                          |
| La navegación: los cinco enlaces fijos y «Equipo» al final con su prop                                       | `src/components/layout/app-nav.tsx:8-27`; `app-nav.test.tsx:14-42`                                                        |
| El nombre de un workspace nuevo es «Workspace» y nadie lo cambia; ningún otro lugar lo muestra               | `src/modules/workspace/service.ts:42`, `:144-148`                                                                         |
| `workspace` ya tiene `schema.ts`, `actions.ts`, `service.ts` y `repository.ts` (E1a); no tiene `components/` | `src/modules/workspace/`                                                                                                  |
| La fila de `workspace_settings` nace con el workspace                                                        | `workspace/repository.ts:89-96`                                                                                           |
| `lockActorMembership` lee `for share`; `assertCanInviteLocked` relee la autoridad con ella                   | `workspace/repository.ts:162-173`; `workspace/service.ts:228-237`                                                         |
| Las actions de invitaciones revalidan `/equipo` con sus propios mensajes                                     | `workspace/actions.ts:17-53`                                                                                              |
| `readSession`: una lectura por pedido, con el workspace leído de la base                                     | `src/server/session.ts:50-81`; `workspace/service.ts:160-170`                                                             |
| `handle` revalida en `finally`, también con error; traduce `ForbiddenError`                                  | `src/server/action.ts:58-60`, `:78-95`                                                                                    |
| El perfil revalida el árbol entero por el nombre del encabezado                                              | `src/modules/profile/actions.ts:18-27`                                                                                    |
| El campo del nombre del perfil: borrador, Enter, salir, Esc, vista optimista, «Reintentar»                   | `src/modules/profile/components/name-field.tsx:21-102`                                                                    |
| Las validaciones y los textos del nombre de una persona                                                      | `profile/schema.ts:17-30`, `:74-85`; `src/lib/text.ts:6`                                                                  |
| `/equipo` sin permiso: el motivo `role` o `inactive`, y el aviso de TT-92 con un cuerpo propio               | `team/service.ts:153-156`; `team/components/team-screen.tsx:56-65`; `src/components/inactive-membership-notice.tsx:10-18` |
| La pantalla de perfil: secciones con `<h2>` y `aria-labelledby`                                              | `profile/components/profile-screen.tsx:26-50`                                                                             |
| `useAction` y `retryHandlerOf`: «Reintentar» solo con `unexpected`                                           | `src/hooks/use-action.ts:47-112`                                                                                          |
| Las tablas que apuntan a `workspace.id`                                                                      | `clock-ws0/src/server/db/schema.ts:62`, `:82`, `:174`, `:419`, `:611`                                                     |
| Las barreras de concurrencia                                                                                 | `src/test/concurrency.ts:113-133`, `:178-200`                                                                             |
| Los e2e corren en paralelo sobre una base común; ninguno afirma el nombre del workspace                      | `playwright.config.ts:42`; ningún `"Workspace"` en `e2e/`                                                                 |
| Los e2e cambian rol y estado por SQL y cortan o pierden pedidos de actions                                   | `e2e/database.ts:545`, `:559`; `e2e/network.ts:77`, `:98`                                                                 |
| Con el MCP: la constancia con `auditActorOf`, la traducción en `failureOf`, el armado en `readUserContext`   | `clock-mcp/src/server/audit.ts:22-30`; `failure.ts:31-54`; `user-context.ts:54-81`                                        |

## 1. Alcance

Cubre WS-01, WS-02, WS-03 (la sección «General», D-WS1-7), WS-04, WS-05,
WS-06, WS-49 … WS-55, WS-58, WS-61, WS-62 (el nombre), WS-63, WS-64 (el
nombre), WS-65, WS-71 y WS-72. WS-73 se cumple sin código y se prueba en WS2b
(D-WS1-7).

Entra:

- **La ruta `/configuracion`** dentro del shell, con su pantalla y los dos
  estados sin permiso (§5).
- **El enlace «Configuración»** al final de la navegación, con
  `workspace.settings.update` (§5.2).
- **`updateWorkspaceName`** en el módulo `workspace`: esquema, repository,
  service y action (§4).
- **El campo compartido** `src/components/name-field.tsx`, que pasa a usar
  también el perfil (D-WS1-8).
- **Tests** de unidad, integración y e2e (§9).

Queda afuera: §12.

### Consecuencias sobre código ya entregado

| Archivo                                                                        | Qué cambia                                                                    | Qué hay que volver a probar                                                                                                      |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/(app)/layout.tsx`                                                     | `AppNav` recibe `showSettings`                                                | `app-nav.test.tsx`; los e2e que navegan                                                                                          |
| `src/components/layout/app-nav.tsx`, `app-nav.test.tsx`                        | El enlace «Configuración» después de «Equipo», con `showSettings` obligatoria | **sus dos casos se reemplazan** por las cuatro combinaciones de §9.1: no pasan `showSettings`, que es obligatoria, y no compilan |
| `src/modules/profile/components/name-field.tsx`                                | Se borra; su contenido pasa a `src/components/name-field.tsx`                 | `profile-screen.test.tsx` y `e2e/profile-name-theme.spec.ts`, sin cambios                                                        |
| `src/modules/profile/components/profile-screen.tsx`                            | Importa el campo compartido con las props del perfil                          | ídem                                                                                                                             |
| `src/modules/workspace/schema.ts`, `repository.ts`, `service.ts`, `actions.ts` | Suman lo de §4, al final de cada archivo                                      | los tests existentes del módulo, sin cambios                                                                                     |
| `src/server/permissions/index.ts`, `permissions.test.ts`                       | Un comentario sobre `workspace.settings.update`; casos de estado y workspace  | la tabla entera                                                                                                                  |
| `e2e/database.ts`                                                              | `workspaceNameOf()`                                                           | —                                                                                                                                |

- **Sin cambio**: `team`, `time-entry`, `project`, `report`, el resto de
  `profile`, `src/server/session.ts`, `src/server/action.ts`, `drizzle/` y
  `src/server/db/`.
- **Los archivos que E2b y el MCP también tocan** (`workspace/service.ts`,
  `workspace/repository.ts`, `permissions/index.ts`, `e2e/database.ts`): WS1
  suma al final y no reordena, para que el rebase no tenga más conflicto que el
  de las líneas vecinas.

## 2. Esquema y migración

**Ningún cambio de esquema y ninguna migración.** `workspace.name` es `text not
null`; `audit_log` ya guarda cualquier acción. `drizzle/` no se toca.

**`workspace.name` no tiene `check`**, a diferencia de `client`, `project`,
`task`, `tag` y `user_preference.display_name`, que llevan `char_length between
1 and 100` y, los cuatro primeros, `= btrim(name)`
(`clock-ws0/src/server/db/schema.ts:146-147`, `:255-256`, `:311-312`,
`:367-368`, `:404-405`). Con WS1 el esquema Zod es la única guarda. Si se suman
los dos `check` es la pregunta 1 (§11).

## 3. Permisos

**Ninguna acción nueva** (D-WS1-1). Se usa la que existe:

| Acción                      | Recurso             | Roles                | Se consulta                                                                             |
| --------------------------- | ------------------- | -------------------- | --------------------------------------------------------------------------------------- |
| `workspace.settings.update` | `WorkspaceResource` | `["owner", "admin"]` | el enlace, la vista y `updateWorkspaceName`, dos veces: con la sesión y bajo el bloqueo |

`ResourceByAction` suma arriba de su fila el comentario «WS-02, WS-49: ver y
cambiar todo lo que ofrece `/configuracion`, también el nombre.». La tabla y el
cuerpo de `can()` no cambian. `permissions.test.ts` suma, para esta acción, el
owner y el admin inactivos y un workspace ajeno, que hoy no tiene (§9.1).

## 4. Contrato

### 4.1 Esquemas (`src/modules/workspace/schema.ts`)

Suma, al final del archivo:

```ts
/** El largo máximo del nombre del workspace (WS-05, WS-54): el de los nombres de PR-54 y PF-35. */
export const WORKSPACE_NAME_MAX = 100;

/** Textos de la configuración que la interfaz muestra tal cual (WS-53 … WS-55, WS-58). */
export const workspaceSettingsMessages = {
  forbidden: "No tenés permiso para hacer esto.",
  unexpected: "No se pudo guardar. Revisá la conexión y volvé a intentar.",
  nameRequired: "Escribí un nombre.",
  nameTooLong: "El nombre no puede superar los 100 caracteres.",
  nameNullCharacter: "El nombre tiene un carácter que no se puede guardar.",
} as const;

/** WS-05, WS-53 … WS-55, WS-71: recortado, entre 1 y 100, sin el carácter nulo. */
export const updateWorkspaceNameInput = z.object(
  {
    name: z
      .string({ error: workspaceSettingsMessages.nameRequired })
      .trim()
      .min(1, workspaceSettingsMessages.nameRequired)
      .max(WORKSPACE_NAME_MAX, workspaceSettingsMessages.nameTooLong)
      .refine(noNullCharacter, workspaceSettingsMessages.nameNullCharacter),
  },
  { error: workspaceSettingsMessages.nameRequired },
);
export type UpdateWorkspaceNameInput = z.infer<typeof updateWorkspaceNameInput>;

/** El nombre que quedó, recortado, también si ya era ese (WS-04). */
export type UpdateWorkspaceNameResult = { readonly name: string };

/** D-WS1-2: sin código propio; `forbidden` sale de `ForbiddenError`. */
export type WorkspaceSettingsErrorCode = ActionErrorCode;

/**
 * D-WS1-5: la pantalla de `/configuracion`. Sin `workspace.settings.update` no
 * hay ajustes: `inactive` si la membresía no está activa (WS-51), `role` si no
 * (WS-50).
 */
export type WorkspaceSettingsView =
  | { readonly kind: "forbidden"; readonly reason: "inactive" | "role" }
  | {
      readonly kind: "ready";
      /** `workspace.name`, de la sesión (WS-63). */
      readonly name: string;
    };

/** Las actions, como las recibe la pantalla por props desde `page.tsx`. */
export type WorkspaceSettingsActions = {
  readonly updateWorkspaceName: (
    input: UpdateWorkspaceNameInput,
  ) => Promise<ActionResult<UpdateWorkspaceNameResult, WorkspaceSettingsErrorCode>>;
};
```

- **Los textos repiten los del perfil** (PF-35, TT-79, TT-89): la regla de una
  redacción por causa pide el mismo texto, no la misma constante. Cada módulo
  tiene la suya, como `project/schema.ts:10`, `:21` y `profile/schema.ts:18`,
  `:27-29`.
- **La salida es un tipo y no un esquema Zod**, como `UpdateNameResult`,
  `InviteResult` e `InvitationsView`: la escribe el servidor y no se valida.
- El orden de los refinamientos es el del perfil: un texto de solo espacios es
  vacío (WS-53), y uno de 100 caracteres con espacios alrededor pasa (WS-71).

### 4.2 Repository (`src/modules/workspace/repository.ts`)

Suma a `workspaceRepository`, al final:

```ts
/**
 * D-WS1-3: el nombre del workspace, `for no key update`. Pone en fila a dos
 * renombres y no choca con el `for key share` de las altas que apuntan al
 * workspace. `undefined` si no está.
 */
async lockWorkspaceName(tx: Transaction, workspaceId: string): Promise<string | undefined>;

/** WS-05: el nombre, ya validado y recortado. */
async updateWorkspaceName(tx: Transaction, workspaceId: string, name: string): Promise<void>;
```

`lockWorkspaceName` usa `.for("no key update")`, como `lockForChange` de
`team`. Las dos filtran por el `workspaceId` de la sesión.

### 4.3 Service (`src/modules/workspace/service.ts`)

Suma, al final:

```ts
/** WS-02, WS-49: `can(actor, "workspace.settings.update", workspace)`: el enlace, la vista y la puerta de la mutación. */
export function canUpdateWorkspaceSettings(actor: Actor): boolean;

/** D-WS1-5: sin consultas; el nombre es el de la sesión. */
export function getWorkspaceSettingsView(
  context: WorkspaceContext,
): WorkspaceSettingsView;

/**
 * WS-04, WS-05, WS-65, WS-71: D-WS1-2 y D-WS1-3. El mismo nombre no escribe.
 * Deja `workspace.updateName` con el anterior y el nuevo.
 */
export async function updateWorkspaceName(
  actor: Actor,
  input: UpdateWorkspaceNameInput,
): Promise<UpdateWorkspaceNameResult>;
```

Por dentro de `updateWorkspaceName`, en este orden:

1. `canUpdateWorkspaceSettings(actor)`; si no, `throw new
ForbiddenError("workspace.settings.update")`.
2. `db.transaction`: `lockActorMembership(tx, actor.workspaceId, actor.userId)`;
   sin fila, o si `canUpdateWorkspaceSettings({ ...actor, role, status })` es
   falso, `ForbiddenError`.
3. `lockWorkspaceName(tx, actor.workspaceId)`; sin fila, `throw new Error("El
workspace de la sesión no está.")` —no pasa: la sesión lo leyó; sale como
   `unexpected`—.
4. Si es igual a `input.name`, devuelve `{ name: input.name }` sin escribir.
5. `updateWorkspaceName` del repository y `recordAudit` de D-WS1-3, con el autor
   de la variante de §0; devuelve `{ name: input.name }`.

`getWorkspaceSettingsView`: con `canUpdateWorkspaceSettings(context.actor)`,
`{ kind: "ready", name: context.workspace.name }`; si no, `{ kind:
"forbidden", reason: context.actor.status === "active" ? "role" : "inactive" }`.

Importa `ForbiddenError` de `@/server/permissions`, donde ya importa `can`.
Ninguna función nueva importa de otro módulo.

### 4.4 Action (`src/modules/workspace/actions.ts`)

```ts
export async function updateWorkspaceName(
  input: UpdateWorkspaceNameInput,
): Promise<ActionResult<UpdateWorkspaceNameResult, WorkspaceSettingsErrorCode>>;
// handle(async (session) =>
//   service.updateWorkspaceName(session.actor, updateWorkspaceNameInput.parse(input)), {
//   paths: [{ path: "/", type: "layout" }],      // D-WS1-4
//   messages: {
//     forbidden: workspaceSettingsMessages.forbidden,
//     unexpected: workspaceSettingsMessages.unexpected,
//   },
// })
```

Con su propio objeto de opciones: las de las invitaciones (`/equipo`) no
cambian. El comentario del de configuración dice que el nombre está en el
encabezado del shell (WS-64) y que el permiso lo consulta el service (D-WS1-2).

### 4.5 Las respuestas

| Situación                                                     | Código                 | Mensaje                     | Reintentar |
| ------------------------------------------------------------- | ---------------------- | --------------------------- | ---------- |
| Cambió el nombre                                              | ok                     | —                           | —          |
| El mismo nombre, también con espacios alrededor               | ok, sin escribir       | —                           | —          |
| Vacío, solo espacios o no es texto                            | `validation`           | WS-53, «Escribí un nombre.» | no         |
| Más de 100 caracteres después de recortar                     | `validation`           | WS-54                       | no         |
| Con el carácter nulo                                          | `validation`           | WS-55                       | no         |
| Sin permiso, o lo perdió bajo el bloqueo; membresía no activa | `forbidden`            | WS-58                       | no         |
| Red o servidor                                                | `unexpected`           | `unexpected`                | sí         |
| Sin sesión                                                    | redirección a `/login` | —                           | —          |

## 5. Pantalla

### 5.1 La página (`src/app/(app)/configuracion/page.tsx`)

`WorkspaceSettingsPage()`: `requireSession()`, `getWorkspaceSettingsView(session)`
y `WorkspaceSettingsScreen` con la vista y `{ updateWorkspaceName }`. Solo
compone. Sin `error.tsx`: la página no lee la base; lo suma WS2b con su lectura
(D-WS1-7).

### 5.2 La navegación (`src/components/layout/app-nav.tsx`, `layout.tsx`)

- `AppNavProps` suma `showSettings: boolean`, obligatoria, como `showTeam`:
  «`canUpdateWorkspaceSettings` de quien mira». `settingsItem = { href:
"/configuracion", label: "Configuración" }` va **después de «Equipo»**, al
  final (WS-01). Cada enlace se muestra por su prop: hoy coinciden, porque
  `team.manage` y `workspace.settings.update` tienen los mismos roles, pero son
  dos acciones.
- `layout.tsx` pasa `showSettings={canUpdateWorkspaceSettings(session.actor)}`.
  Una membresía inactiva no ve ninguno de los dos enlaces, porque `can()` corta
  por estado.
- El enlace se marca con `aria-current="page"` en `/configuracion`, como los
  demás.

### 5.3 La pantalla (`src/modules/workspace/components/workspace-settings-screen.tsx`)

`WorkspaceSettingsScreen({ view, actions })`, en `mx-auto flex w-full max-w-2xl
flex-col gap-8`, como el perfil:

- **`<h1>` «Configuración del workspace»** en los tres estados.
- **`ready`**: una `<section aria-labelledby="workspace-settings-general">` con
  su `<h2>` «General» y, adentro, el campo del nombre (§5.4). Nada más (D-WS1-7).
- **`forbidden`, `role`** (WS-50): un párrafo con «No tenés permiso para cambiar
  la configuración del workspace.».
- **`forbidden`, `inactive`** (WS-51, WS-72): `InactiveMembershipNotice` con el
  cuerpo «No podés cambiar la configuración del workspace.».

### 5.4 El campo del nombre (`src/components/name-field.tsx`, D-WS1-8)

El componente de `profile/components/name-field.tsx` sin cambios de
comportamiento, con estas props:

```ts
type NameFieldProps = {
  /** La action del módulo: recibe y devuelve el nombre recortado. */
  readonly save: (input: {
    readonly name: string;
  }) => Promise<ActionResult<{ readonly name: string }, string>>;
  /** El nombre guardado, de la vista. */
  readonly value: string;
  readonly label: string;
  /** El largo del esquema del módulo: el campo corta en el mismo. */
  readonly maxLength: number;
  readonly autoComplete: string;
  /** TT-90: el título del aviso nombra lo que no se cambió. */
  readonly failureTitle: string;
  /** El `unexpected` del módulo, para cuando la action no llega a responder. */
  readonly unreachableMessage: string;
  /** Sin permiso se ve y no se cambia, con `readOnly` (PF-46). Por omisión, falso. */
  readonly readOnly?: boolean;
};
```

- **Perfil**: `save={actions.updateName}`, `label` «Nombre», `maxLength`
  `NAME_MAX`, `autoComplete="name"`, `failureTitle` «No se pudo cambiar el
  nombre.», `unreachableMessage` `profileMessages.unexpected` y
  `readOnly={!canEdit}`.
- **Configuración**: `save={actions.updateWorkspaceName}`, `label` «Nombre del
  workspace», `maxLength` `WORKSPACE_NAME_MAX`, `autoComplete="organization"`,
  `failureTitle` «No se pudo cambiar el nombre del workspace.» (WS-62) y
  `unreachableMessage` `workspaceSettingsMessages.unexpected`. Sin `readOnly`:
  la vista `ready` ya es de quien puede cambiarlo.
- El ancho, `h-9 w-full sm:w-80`, y el resto del marcado no cambian: los tests
  del perfil afirman el campo por su rótulo y su `maxlength`
  (`profile-screen.test.tsx:125-130`).

Lo que hace, que es lo de WS-04 y WS-62: guarda al salir o con Enter si el texto
recortado no es el guardado; Esc descarta lo escrito sin pedido; la vista
optimista muestra el recortado mientras viaja; con un error, el campo vuelve al
guardado y aparece el aviso con el título y el mensaje; «Reintentar» solo con
`unexpected`, y antes de reintentar el foco vuelve al campo.

### 5.5 Textos (`src/modules/workspace/components/labels.ts`, nuevo)

| Clave           | Texto                                                           | Fuente |
| --------------- | --------------------------------------------------------------- | ------ |
| `heading`       | «Configuración del workspace»                                   | WS-01  |
| `general`       | «General»                                                       | WS-03  |
| `name`          | «Nombre del workspace»                                          | WS-05  |
| `nameFailed`    | «No se pudo cambiar el nombre del workspace.»                   | WS-62  |
| `forbiddenRole` | «No tenés permiso para cambiar la configuración del workspace.» | WS-50  |
| `forbiddenBody` | «No podés cambiar la configuración del workspace.»              | WS-51  |

El rótulo «Configuración» del enlace vive en `app-nav.tsx`, como «Equipo». Los
mensajes de error salen de `workspaceSettingsMessages`.

## 6. La transición en producción

Vercel despliega `main` a producción en cada push y el build no corre
migraciones. **WS1 no trae migración ni consulta previa.**

### 6.1 El despliegue

1. El team-lead mergea WS1 en `main` y pushea; Vercel despliega.

Mientras Vercel cambia de versión, una instancia vieja no tiene la ruta: un
pedido a `/configuracion` responde 404 hasta que atiende la nueva.

### 6.2 La verificación de humo

1. **El owner** ve «Configuración» al final de la navegación, después de
   «Equipo», y la pantalla con «General» y el nombre actual del workspace, el
   mismo del encabezado.
2. **No se cambia el nombre para probar.** Ponerle al workspace el nombre que
   quiera el equipo es una decisión del owner, no un paso del despliegue; si lo
   hace, el encabezado cambia sin recargar y queda `workspace.updateName` en el
   audit log.

### 6.3 Reversión

`git revert -m 1 <merge de WS1>` y push. La columna existía antes: el nombre que
se haya escrito queda y se sigue mostrando en el encabezado, y las constancias
quedan. Nada que deshacer en la base.

### 6.4 Previews y la base local

Nada nuevo. En un preview, renombrar cambia el encabezado de todos los que
prueban esa rama de Neon.

## 7. Reparto de archivos

### backend-dev

- `src/modules/workspace/schema.ts` y `schema.test.ts` (§4.1).
- `src/modules/workspace/repository.ts` (§4.2).
- `src/modules/workspace/service.ts` y `settings.integration.test.ts`, nuevo,
  con el service y la concurrencia (§4.3, §9.2).
- `src/modules/workspace/actions.ts` y un `describe` nuevo en
  `actions.integration.test.ts`, con el reintento de §9.2 (§4.4).
- `src/server/permissions/index.ts`, el comentario, y `permissions.test.ts`
  (§3).
- **Primero fija** `WORKSPACE_NAME_MAX`, `workspaceSettingsMessages`,
  `UpdateWorkspaceNameInput`, `UpdateWorkspaceNameResult`,
  `WorkspaceSettingsErrorCode`, `WorkspaceSettingsView` y
  `WorkspaceSettingsActions`, con la firma de `canUpdateWorkspaceSettings` y de
  `getWorkspaceSettingsView`, y avisa a `frontend-dev` y a `e2e-tester`.

### frontend-dev

- `src/components/name-field.tsx`, nuevo, y su test; borra
  `src/modules/profile/components/name-field.tsx` y ajusta
  `profile-screen.tsx` (D-WS1-8, §5.4).
- `src/modules/workspace/components/`, nueva: `labels.ts`,
  `workspace-settings-screen.tsx` y `workspace-settings-screen.test.tsx` (§5.3,
  §5.5).
- `src/app/(app)/configuracion/page.tsx`, nuevo (§5.1).
- `src/app/(app)/layout.tsx`, `src/components/layout/app-nav.tsx` y
  `app-nav.test.tsx`, con sus dos casos reemplazados por los de §9.1 (§5.2).

### e2e-tester

- `e2e/settings-page.ts`, nuevo: la ruta, el enlace, el encabezado de la página,
  la sección, el campo, los textos de WS-50 y WS-51, el aviso de error y
  «Reintentar»; `workspaceHeaderName(page)`, el nombre del encabezado del shell.
- `e2e/database.ts`: `workspaceNameOf()`, que lee `workspace.name` del
  workspace de los e2e.
- `e2e/workspace-settings.spec.ts`, nuevo, con los recorridos de §9.3; confirma
  que fallan antes de la implementación.
- `profile-name-theme.spec.ts` y `team.spec.ts` siguen en verde sin cambiar lo
  que afirman.

### parity-analyst

- `workspace.md`: **WS-52** (D-WS1-6: WS-50 aparece con la respuesta del
  cambio, no al recargar); **WS-03** y **WS-61** (D-WS1-7: WS1 trae «General»,
  WS2b «Registro de tiempo»); **WS-73** (se prueba en WS2b); **§16, punto 1**
  («deja armado el módulo `workspace` con su `schema.ts`, sus actions y sus
  componentes, que hoy no tiene»: desde E1a tiene `schema.ts` y `actions.ts`;
  WS1 suma `components/`).
- `fase2-mapa.md`, cada cambio con su corrección fechada:
  - **«WS1»**: el módulo (solo `components/` es nuevo), la sección única
    «General» y WS-73 fuera de lo que cubre.
  - **«WS2b»**: suma **WS-73** a lo que cubre, y a lo que trae, **la segunda
    sección «Registro de tiempo» de `/configuracion` con su `error.tsx`**, que
    llegan con la primera lectura de `workspace_settings` desde la pantalla
    (D-WS1-7).
  - **«E3»** (`:473-486`): suma a los riesgos **el orden de los bloqueos, las
    membresías primero y después el workspace**: WS1 toma la membresía de quien
    actúa `for share` y después el workspace `for no key update`, y al revés un
    renombre y una transferencia del mismo admin se esperan en círculo
    (D-WS1-3).

### Lo que no toca nadie

`drizzle/`, `src/server/db/`, `src/server/session.ts`, `src/server/action.ts`,
el cuerpo de `can()`, `team`, `time-entry`, `project`, `report`, y de `profile`
todo lo que no es `name-field.tsx` y `profile-screen.tsx`.

### Orden

1. `backend-dev`: los tipos y textos de §4.1 y las firmas de §4.3.
2. En paralelo: `backend-dev` con el repository, el service y la action;
   `frontend-dev` con el campo compartido, la pantalla y la navegación;
   `e2e-tester` con el arnés y el spec; `parity-analyst` con las correcciones.
3. Las revisiones; correcciones; corrida final de e2e en una base nueva **y** en
   una que se reusa.

## 8. Criterios de aceptación

1. **Renombrar** (WS-05, WS-04): un admin pide `"  Estudio Norte  "`; queda
   `workspace.name = 'Estudio Norte'`, `updated_at` avanza y hay una constancia
   `workspace.updateName` con `entity: "workspace"`, el id del workspace, `{
name: <anterior> }`, `{ name: "Estudio Norte" }` y el admin como actor. El
   owner, igual.
2. **El mismo nombre no escribe** (WS-04, WS-71): con «Estudio Norte» guardado,
   pedir `"Estudio Norte"` o `" Estudio Norte "` responde éxito sin tocar la
   fila —`updated_at` igual— y sin constancia.
3. **Las validaciones** (WS-53 … WS-55): vacío, solo espacios, un número o un
   objeto sin `name` responden `validation` con «Escribí un nombre.»; 101
   caracteres después de recortar, WS-54; 100 con espacios alrededor, éxito; con
   `\u0000`, WS-55. Ninguno escribe.
4. **Quién** (WS-02, WS-49, WS-50, WS-58): `project_manager`, `team_manager` y
   `member` reciben `forbidden` con WS-58 sin escribir; un owner y un admin con
   la membresía inactiva, igual (WS-51, WS-72).
5. **La autoridad bajo el bloqueo** (D-WS1-2, WS-52): un admin al que le quitan
   el rol, o al que desactivan, entre la sesión y el bloqueo, recibe `forbidden`
   sin escribir.
6. **Dos a la vez** (WS-65, D-WS1-3): dos renombres en fila detrás del bloqueo
   del workspace terminan los dos con éxito; queda el segundo, y las dos
   constancias se encadenan: el anterior de la segunda es el nuevo de la
   primera.
7. **Lo que no espera** (D-WS1-3): con la fila del workspace tomada `for no key
update`, `ensureWorkspaceContext`, una invitación nueva y un alta de horas
   terminan sin esperar.
8. **Revalidación** (WS-64, D-WS1-4): `updateWorkspaceName` llama a
   `revalidatePath("/", "layout")` con éxito y con error.
9. **La vista** (D-WS1-5, WS-63): `getWorkspaceSettingsView` devuelve `ready` con
   el nombre de la sesión para owner y admin activos; `forbidden` con `role`
   para los otros tres roles activos; `forbidden` con `inactive` para cualquier
   rol inactivo, también owner y admin.
10. **La navegación** (WS-01): con `showSettings`, «Configuración» va después de
    «Equipo» y se marca en `/configuracion`; sin él, no está ni su `href`. En la
    aplicación: owner y admin lo ven; los otros tres roles y una membresía
    inactiva, no.
11. **La pantalla** (WS-01, WS-03, WS-05, WS-50, WS-51): el título; la sección
    «General» con el campo «Nombre del workspace», el nombre guardado y
    `maxlength="100"`; ninguna otra sección; los textos de WS-50 y de WS-51 en
    su estado, sin el campo.
12. **El campo** (WS-04, WS-62): Enter y salir guardan; Esc descarta sin pedido;
    salir sin cambiar, o con un texto que recortado es el guardado, no manda
    ningún pedido; un error de validación vuelve el campo al guardado y muestra
    el título y el mensaje sin «Reintentar»; un pedido que no llega muestra
    «Reintentar», y reintentarlo guarda; reintentar después de una respuesta
    perdida responde éxito y deja una sola constancia.
13. **El encabezado sin recargar** (WS-64, WS-06): quien renombra ve el nombre
    nuevo en el encabezado con la respuesta, y al recargar sigue ahí.
14. **Perder el rol con la pantalla abierta** (D-WS1-6): con la pantalla abierta,
    el admin pasa a `member` por SQL; su siguiente cambio no escribe, la
    pantalla muestra WS-50 y el enlace ya no está.
15. **El perfil no cambia** (D-WS1-8): `profile-screen.test.tsx` y
    `profile-name-theme.spec.ts` siguen en verde sin cambiar lo que afirman.
16. **La e2e entera en verde**, en una base nueva y en una que se reusa.

## 9. Plan de tests

### 9.1 Unidad

- `workspace/schema.test.ts`: `updateWorkspaceNameInput` con cada caso del
  criterio 3, el recorte y el mensaje de cada rechazo.
- `permissions.test.ts`: `workspace.settings.update` con owner y admin
  inactivos y con un workspace ajeno, `false`.
- `app-nav.test.tsx`: **reemplaza sus dos casos**, que no pasan `showSettings`,
  por el criterio 10 en las cuatro combinaciones de `showTeam` y
  `showSettings`, cada una con la lista de enlaces en orden y, con los dos,
  `aria-current` en uno solo.
- `workspace-settings-screen.test.tsx`: el criterio 11, con
  `renderToStaticMarkup`, como `team-screen.test.tsx`.
- `src/components/name-field.test.tsx`: el rótulo asociado al campo, el valor,
  `maxlength`, `autocomplete` y `readonly` según la prop.

### 9.2 Integración (Postgres)

- **`workspace/settings.integration.test.ts`**:
  - Criterios 1 a 4 y 9 sobre el service, con `seedWorkspace`, `seedMember` y
    `auditFor("workspace", workspaceId)`.
  - **Criterio 5**, con `queueBehindBarrier`: la barrera toma la membresía del
    admin `for no key update` y no escribe; el corredor 1, un `db.transaction`
    propio que hace `update membership set role = 'member'` (y otro caso con
    `status = 'inactive'`) y confirma; el corredor 2, `updateWorkspaceName` con
    el `Actor` del admin activo. Al abrir, el corredor 2 rechaza con
    `ForbiddenError`, el nombre no cambió y no hay constancia. **La mutación**:
    sin la relectura de D-WS1-2, el corredor 2 no se traba y
    `queueBehindBarrier` rechaza con «Un corredor terminó sin trabarse en la
    barrera.».
  - **Criterio 6**, con `queueBehindBarrier`: la barrera toma el workspace `for
no key update`; los corredores renombran a «A» y a «B», en ese orden. Al
    abrir, `workspace.name` es «B» y las constancias son `{ anterior → A }` y
    `{ A → B }`. **La mutación**: sin `lockWorkspaceName`, los dos `update`
    igual esperan, pero la segunda constancia dice `{ anterior → B }`, y el test
    falla.
  - **Criterio 7**, con `outcomeWhileHeld`: la barrera toma el workspace `for no
key update`, como `lockWorkspaceName`; `ensureWorkspaceContext`,
    `inviteMembers` de un correo nuevo y un alta de horas devuelven `resolved`.
    **La mutación**: con `for update` en la barrera, la invitación y el alta
    devuelven `blocked`.
- **`workspace/actions.integration.test.ts`**, un `describe` nuevo:
  - Cada fila de §4.5 con su código y su texto; `revalidatePath("/", "layout")`
    con éxito y con `forbidden` (criterio 8); sin sesión, a `/login` sin
    escribir.
  - **El reintento de una respuesta perdida** (criterio 12, WS-62): la action
    dos veces seguidas con el mismo nombre nuevo; las dos responden éxito con
    ese nombre, y `auditFor("workspace", workspaceId)` tiene **una** constancia
    `workspace.updateName`.

Cada test nuevo tiene que poder fallar: se verifica con una mutación en una
copia, como en los slices anteriores.

### 9.3 E2E

`e2e/workspace-settings.spec.ts`, con `test.describe.configure({ mode:
"serial" })`: renombrar cambia el encabezado de toda la base común, así que los
recorridos de este archivo no corren a la vez entre sí. Cada uno escribe un
nombre único (`e2e-ws-<uuid>`, que entra en el tope) y afirma solo el que
escribió. Ningún otro spec afirma el nombre del workspace.

1. **Renombrar** (criterios 1, 10, 11, 13): un admin (`setRole`, como
   `enterTeamAsAdmin`) ve «Configuración» al final de la navegación, entra, ve
   el título, «General» y el nombre actual, igual al del encabezado. Escribe el
   nombre nuevo con espacios alrededor y Enter: el encabezado muestra el
   recortado sin recargar; `workspaceNameOf()` también. Al recargar, el campo y
   el encabezado lo conservan.
2. **Salir guarda, Esc descarta, el mismo texto no manda nada** (criterio 12),
   con `recordActions` contando los pedidos de action en cada paso:
   - escribir un nombre nuevo y pasar el foco a otro control guarda: un pedido;
   - escribir y Esc vuelve al guardado: ningún pedido;
   - escribir el nombre guardado con espacios alrededor y pasar el foco a otro
     control: ningún pedido, y el campo muestra el guardado;
   - entrar al campo y salir sin escribir: ningún pedido.
3. **Validación** (criterio 12, WS-53): borrar todo y Enter muestra «No se pudo
   cambiar el nombre del workspace.» con «Escribí un nombre.», sin
   «Reintentar»; el campo y el encabezado conservan el nombre anterior.
4. **La red** (criterio 12, WS-62): con `dropActionRequests`, el aviso trae el
   título, «No se pudo guardar. Revisá la conexión y volvé a intentar.» y
   «Reintentar»; al soltar, «Reintentar» guarda. Con `loseActionResponses`,
   «Reintentar» responde éxito y `workspaceNameOf()` es el pedido. La constancia
   única la prueba el reintento de `actions.integration.test.ts` (§9.2).
5. **Un member** (criterio 10, WS-50): no ve «Configuración»; en
   `/configuracion` lee «No tenés permiso para cambiar la configuración del
   workspace.» y no hay campo.
6. **Un admin inactivo** (WS-51, WS-72): con `setMembershipStatus(…,
"inactive")`, `/configuracion` muestra el aviso de membresía desactivada con
   «No podés cambiar la configuración del workspace.» y no hay campo.
7. **Perder el rol con la pantalla abierta** (criterio 14): el admin abre la
   pantalla, `setRole(email, "member")`, escribe un nombre y Enter; la pantalla
   muestra WS-50, el enlace ya no está y `workspaceNameOf()` no cambió.

Y la suite entera corre en una base nueva y en una que se reusa (criterio 16).

### 9.4 Lo que no se prueba en e2e

Las validaciones de WS-54 y WS-55 (el campo corta en 100 y no se teclea
`\u0000`: van en unidad e integración); el owner (mismo camino que el admin, en
integración); las carreras de D-WS1-2 y D-WS1-3 (integración); que otra persona
vea el nombre nuevo en su pedido siguiente (WS-64: es el mismo encabezado,
leído por pedido).

## 10. Riesgos

- **El orden de los bloqueos con E3** (D-WS1-3): WS1 toma la membresía de quien
  actúa y después el workspace. Si el contrato de E3 bloquea el workspace antes
  que las membresías, un renombre y una transferencia del mismo admin pueden
  esperarse en círculo; Postgres corta uno con un error de interbloqueo, que
  llega como `unexpected`. **El contrato de E3 toma las membresías primero**, y
  el mapa lo dice en los riesgos de E3 desde la corrección de `parity-analyst`
  (§7).
- **Mover el campo del perfil** (D-WS1-8) puede cambiar el perfil sin querer:
  el criterio 15 lo frena con los tests que ya existen.
- **El nombre sin `check`** (§2): un camino de escritura que no pase por el
  esquema —un script, SQL a mano— puede dejar un nombre vacío o de mil
  caracteres, y el encabezado lo muestra. Hoy el único otro escritor es
  `createWorkspace`, con «Workspace». Pregunta 1.
- **La base común de los e2e**: renombrar cambia el encabezado de todos los
  specs que corren en paralelo. Hoy ninguno lo afirma; un spec futuro que lo
  haga tiene que leer `workspaceNameOf()` en lugar de un literal.
- **Un admin cambia el nombre que eligió el owner** (WS-49): aceptado por
  paridad; la constancia dice quién y desde qué valor.
- **El rebase sobre WS0 A, E2b y, si entra antes, el MCP** (§0): conflictos de
  líneas vecinas en `workspace/service.ts`, `workspace/repository.ts`,
  `permissions/index.ts` y `e2e/database.ts`, y la constancia con
  `auditActorOf`. WS1 suma al final.
- **Un árbol con WS0 A y sin B**: nadie corre `db:generate` en él (ADR 0028,
  regla 2). WS1 no lo necesita.

## 11. Preguntas para el usuario

1. **¿`workspace.name` lleva los `check` que tienen los demás nombres?**
   `char_length(name) between 1 and 100` y `name = btrim(name)`, como `project`,
   `client`, `task` y `tag` (§2). Pide una migración y su consulta previa
   (que el nombre de producción ya cumpla las dos).
   **Recomendación: sí, en la migración de WS2a**, que ya cambia el esquema del
   workspace, y no en WS1, que el mapa deja sin migración. Hasta entonces la
   guarda es el esquema Zod, y el único escritor que no pasa por él crea
   «Workspace».

## 12. Fuera de alcance

- **«Registro de tiempo» y el formato de duración** (WS-14 … WS-17, WS-56,
  WS-62 y WS-64 del formato, WS-66 … WS-69), con el `error.tsx` de la pantalla
  y la prueba de WS-73: WS2a y WS2b.
- **El primer día de la semana por defecto** (WS-08, WS-57, WS-70): E4, en la
  sección «General» de esta pantalla.
- **El logo** (WS-07, WS-59, WS-60): fuera, por workspace P-01.
- **La zona horaria del workspace** (WS-12): no se muestra ni se cambia.
- **Los `check` de `workspace.name`**: pregunta 1.
- **Quién crea tareas** (WS-40, workspace P-04): un cambio de `task.create`,
  con el primer slice de administración de proyectos.
