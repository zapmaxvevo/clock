# Fase 1, slice 7b: perfil, nombre editable y tema

Contrato del slice que completa la pantalla `/perfil` del
[slice 7](fase1-slice7-perfil.md): el nombre pasa a editarse dentro de la
aplicación y el perfil suma el tema. Módulo `profile`, en
`src/modules/profile/`, más el layout raíz y la hoja de estilos.

- **Fuente de los comportamientos:** `docs/parity/perfil.md`: PF-07, PF-08,
  PF-23, PF-24 y PF-45, y las partes de PF-31, PF-32 y PF-35 que el 7 dejó para
  este slice.
- **Lugar en el plan:** [mapa de la fase 1](fase1-mapa.md), slice 7b. Depende
  del 7.
- **Revisión del contrato:** ronda 1 aplicada, con las resoluciones de
  [`correcciones-fase1-slice7b.md`](correcciones-fase1-slice7b.md).
- **Decisiones de arquitectura asociadas:**
  - [ADR 0015, el tema se resuelve en el servidor y «seguir al sistema» en la hoja de estilos](../adr/0015-el-tema-se-resuelve-en-el-servidor.md):
    **aceptado** (2026-10-05). Fija dónde vive el tema, cómo llega a
    `<html>` y cómo se resuelve «seguir al sistema».
  - [ADR 0010](../adr/0010-un-modulo-consulta-las-reglas-de-otro-por-su-service.md):
    no cambia. `profile` sigue sin importar nada de `time-entry` ni de
    `project`.
  - [ADR 0012](../adr/0012-un-solo-juego-de-formatos.md): no cambia. El tema
    no es un formato y no viaja por `DisplayFormats`.

## Decisiones del usuario sobre este contrato

Tomadas antes de escribirlo (estado de la fase, 2026-10-04):

1. **El modo timer/manual queda en la cookie** y no entra al 7b (TT-16).
2. **El nombre se edita con una action propia del módulo.**
   `/api/auth/update-user` quedó cerrado en el 7 (`disabledPaths`) y sigue
   cerrado.

Heredadas del 7 (§2.4 de su contrato) y que este contrato cumple tal cual: el
nombre editado va en `user_preference.display_name`, no en `user.name`; el tema
va en `user_preference.theme`; las dos columnas entran nulas y sin relleno.

**Resueltas el 2026-10-05 por el team-lead**, con la delegación del usuario («todo lo que vos
puedas hacer, decidilo»), siguiendo la recomendación de este contrato:

- **A. ADR 0015: aceptado.** Sin él no hay cómo cumplir PF-24 sin un script en línea.
- **D1. Si la persona escribe exactamente el nombre de Google, se guarda lo escrito.** Es la
  regla de las demás columnas del perfil (elegir el predeterminado también escribe) y no le pide
  al service el nombre de Google. El costo, una vez editado no hay forma de volver a seguir a
  Google desde la pantalla, queda en §8.
- **D2. «Salir» hace una carga completa** (`window.location.assign("/login")` en lugar de
  `router.replace`): el layout raíz se conserva en una navegación del cliente, así que sin esto
  `/login` quedaría con la clase de quien salió, y la carga completa además descarta la caché del
  router con pantallas de esa persona.

El resto de lo que el slice fija sin paridad está en §1, «Lo que el slice
decide», con su registro en `perfil.md`.

## 0. Precondición de arranque

**El 7b arranca sobre `main` en `54daee0`**, con el 7, el 6, el 8, el 8c y el
8b adentro. No depende de nada que no esté mergeado.

**Corre en paralelo con el contrato del 11** (ADR 0016). Los dos cambian el
esquema: el 11a con una columna de `time_entry`, el 11b con tablas nuevas y
este con dos columnas de `user_preference`. Comparten `src/server/db/schema.ts`
(bloques distintos), el diario y las instantáneas de `drizzle/meta/`, y
`src/test/factories.ts`. **Las migraciones chocan de número**: la de este slice
y la del 11a salen las dos como `0008`. La que se mergee segunda descarta la
suya y la vuelve a generar después del rebase, como el 5 y el 9 (§2).

**Supuestos sobre el árbol**, con archivo y línea en `54daee0`:

| Supuesto                                                                                                                                                                    | Dónde                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `user_preference` tiene `user_id`, `timezone`, `time_format`, `date_format` y las dos fechas, con tres `check`; la migración más nueva es la `0007`                         | `src/server/db/schema.ts:126-156`; `drizzle/0007_user_preference.sql`                                                            |
| `Preferences` son tres campos resueltos; `updatePreferenceInput` es una unión por `key` con tres claves; una clave desconocida responde `formatUnavailable`                 | `src/modules/profile/schema.ts:21-25`, `:32-52`                                                                                  |
| `profileMessages` y `ProfileActions` con una sola action                                                                                                                    | `schema.ts:13-18`, `:58-62`                                                                                                      |
| `PreferenceColumn` es una unión de tres columnas; `writePreference` escribe solo la columna que recibe                                                                      | `src/modules/profile/repository.ts:9-12`, `:60-74`                                                                               |
| `PREFERENCE_DEFAULTS`, `resolvePreferences` con `knownFormat` que lanza fuera de lista, `preferencesOf`                                                                     | `src/modules/profile/service.ts:41-45`, `:58-88`, `:91-93`                                                                       |
| `updatePreference` asegura la fila, la bloquea, sale sin efecto con el mismo valor, escribe una columna y audita `profile.updatePreference`                                 | `service.ts:214-242`                                                                                                             |
| `ProfileUser`, `ProfileView` y `getProfileView` sin consultas; `Choice` exige `example`                                                                                     | `service.ts:120-124`, `:126-130`, `:132-146`, `:158-191`                                                                         |
| La action valida con Zod, consulta `assertCan` con `ownProfileResource` y revalida `{ path: "/", type: "layout" }`, también con error                                       | `src/modules/profile/actions.ts:17-33`                                                                                           |
| `currentSession` lee el contexto y las preferencias en paralelo y toma `user.name` de Better Auth; no está envuelta en `cache`                                              | `src/server/session.ts:31-51`, `:37-40`, `:46`                                                                                   |
| El layout del shell lee la sesión y le pasa a `UserMenu` el nombre, el correo y la foto; la página de perfil la vuelve a leer                                               | `src/app/(app)/layout.tsx:8`, `:17-21`; `src/app/(app)/perfil/page.tsx:7`                                                        |
| El layout raíz dibuja `<html>` sin sesión y sin clase de tema; `/login` lee la sesión                                                                                       | `src/app/layout.tsx:14-23`; `src/app/login/page.tsx:7`                                                                           |
| La hoja de estilos tiene la variante `dark:` atada a la clase `.dark` y el bloque `.dark` con las variables oscuras; nadie pone la clase                                    | `src/app/globals.css:5`, `:54-91`, `:93-128`                                                                                     |
| No hay `next-themes` ni otra dependencia de tema                                                                                                                            | `package.json:24-47`                                                                                                             |
| La CSP mantiene `unsafe-inline` en `script-src` hasta el nonce                                                                                                              | `next.config.ts:4-10`                                                                                                            |
| Better Auth 1.7.7: `disabledPaths: ["/update-user"]`; `mapProfileToUser` devuelve `{ name, image }`; no están `overrideUserInfoOnSignIn`, `account` ni `databaseHooks.user` | `src/server/auth.ts:47`, `:61-76`, `:79-98`; `node_modules/better-auth/package.json:3`                                           |
| Con `overrideUserInfoOnSignIn`, cada ingreso por Google pide reescribir `name`, `image` y **`email`** del usuario, con un `updateUser` fuera de todo `try`                  | `node_modules/better-auth/dist/oauth2/link-account.mjs:238-254`; `dist/api/routes/callback.mjs:182`                              |
| `updateUser` pasa por los ganchos `user.update.before`; el `data` que devuelve el gancho se mezcla sobre el del update                                                      | `dist/db/internal-adapter.mjs:601-621`; `dist/db/with-hooks.mjs:44-61`, `:56-59`                                                 |
| En un update, el adaptador descarta los campos `undefined` sin `onUpdate`                                                                                                   | `node_modules/@better-auth/core/dist/db/adapter/factory.mjs:115`                                                                 |
| La firma del gancho: `before(data, context)` devuelve `false`, nada o `{ data }`                                                                                            | `@better-auth/core/dist/types/init-options.d.mts:1282-1290`                                                                      |
| El enlace implícito: un `sub` sin fila en `account` con el correo de una fila existente se enlaza a ella; `disableImplicitLinking` lo rechaza                               | `link-account.mjs:119-125`, `:139-145`, `:146-189`; `init-options.d.mts:1076-1085`                                               |
| El rechazo del enlace redirige a la página de error de Better Auth con `error=account_not_linked`                                                                           | `callback.mjs:35`, `:195-197`                                                                                                    |
| `handleOAuthUserInfo` se exporta desde `better-auth/oauth2`; la aplicación no usa `linkSocial`                                                                              | `node_modules/better-auth/dist/oauth2/index.d.mts:5`; `package.json:79-83` de `better-auth`                                      |
| `decideGoogleAccess` exige `email_verified`                                                                                                                                 | `src/server/access.ts:54`                                                                                                        |
| El gancho de la sesión vuelve a comprobar el correo de la base al crear cada sesión                                                                                         | `src/server/auth.ts:84-95`                                                                                                       |
| El test de la ruta cerrada responde 404 y no cambia el nombre; importa el `auth` real con la sesión de prueba habilitada                                                    | `src/server/auth.integration.test.ts:12-19`, `:62-79`                                                                            |
| `session.integration.test.ts` ya existe: reemplaza `getSession` con un `name` fijo y prueba la foto de PF-09                                                                | `src/server/session.integration.test.ts:13-31`, `:28`, `:43-63`                                                                  |
| `seedUser` siembra `name` «Persona de prueba» y `emailVerified` en verdadero                                                                                                | `src/test/factories.ts:32-41`                                                                                                    |
| `PreferenceField` es una unión por `preference`, la zona sin permiso es un `FixedSetting`, los formatos son un `Select` con `aria-disabled` y `readOnly`                    | `src/modules/profile/components/preference-field.tsx:38-59`, `:135-150`, `:200-260`                                              |
| `FormatSelect` exige `example` en cada opción y siempre dibuja el paréntesis, en el disparador y en la opción                                                               | `preference-field.tsx:181-183`, `:189`, `:210-213`, `:251-255`                                                                   |
| La pantalla dibuja la identidad en solo lectura, con la nota de que sale de Google, y el grupo «Hora y fecha»                                                               | `components/profile-screen.tsx:29-43`, `:58-97`; `components/labels.ts:12`                                                       |
| «Salir» navega con `router.replace("/login")`                                                                                                                               | `components/user-menu.tsx:36-43`                                                                                                 |
| Los tests que usan `theme` como clave desconocida                                                                                                                           | `schema.test.ts:85`; `actions.integration.test.ts:202`                                                                           |
| Las afirmaciones y fixtures con `Preferences` o `UserPreferenceRow` literales                                                                                               | `service.integration.test.ts:97-106`, `:116-129`, `:173-178`; `actions.integration.test.ts:129`; `profile-screen.test.tsx:24-28` |
| `preferencesOf` se usa fuera del módulo solo en tests                                                                                                                       | `service.integration.test.ts:29`, `:70`, `:116`, `:125`, `:135-136`; `time-entry/service.integration.test.ts:47`, `:3982`        |
| El e2e del 7 afirma la nota de Google, el nombre como texto, cero `textbox` y tres `combobox` en `/perfil`                                                                  | `e2e/profile.spec.ts:190`, `:193-196`, `:213`                                                                                    |
| `SeedPreferenceValues` elige las tres columnas del 7                                                                                                                        | `src/test/factories.ts:65-67`                                                                                                    |
| El bloque del calendario mezcla el color del proyecto con `var(--background)`; la paleta son tonos 600                                                                      | `time-entry/components/calendar/calendar-block.tsx:57-68`; `project/palette.ts:36`                                               |

## 1. Alcance

Entran:

- **El nombre editable** (PF-07, PF-08), en la pantalla de perfil, con un campo
  de texto que guarda al salir o con Enter (PF-32) y las validaciones de PF-35.
  Se ve en el encabezado sin recargar (PF-33).
- **El nombre de Google llega en cada ingreso** a quien no lo editó (PF-45):
  `overrideUserInfoOnSignIn` en el proveedor de Google, con un gancho
  `databaseHooks.user.update.before` que saca el correo de toda actualización.
  **El correo no cambia (PF-06).**
- **El enlace implícito por correo se apaga**:
  `account.accountLinking.disableImplicitLinking`. Es un riesgo que ya existe en
  `main` y no sale de la paridad; entra acá porque el slice ya toca `auth.ts`
  (§4.5).
- **El tema** (PF-23): «Seguir al sistema», «Claro» y «Oscuro», con «Seguir al
  sistema» como predeterminado, en un grupo «Apariencia» de las preferencias
  (PF-31).
- **El tema aplicado antes del primer dibujo y sin recargar** (PF-24), según el
  ADR 0015: la clase en `<html>` la dibuja el servidor, y «seguir al sistema»
  lo resuelve la hoja de estilos.
- **«Salir» con una carga completa** (D2), para que `/login` no herede el tema
  de quien salió.
- **Una sola lectura de la sesión por pedido**: `currentSession` envuelta en
  `cache` de React (ADR 0015). Paga la deuda que dejó el 7.

Entran por arrastre, verificándose por el camino nuevo:

- **PF-34 y PF-46**: los cinco roles editan su nombre y su tema; una membresía
  no activa los ve y no los cambia.
- **PF-36**: al recargar se ven los valores guardados.
- **PF-09**: la identidad sigue sin escribirse por `/api/auth/update-user`.

### Lo que el slice decide y que la paridad tiene que registrar

- **El nombre se guarda recortado**: sin espacios en los extremos. Con solo
  espacios es «Escribí un nombre.».
- **Escribir el nombre de Google lo guarda igual** (D1): desde ese momento, un
  cambio de nombre en Google no llega.
- **`Esc` en el campo del nombre descarta lo escrito** y vuelve al guardado,
  sin pedido, como en la edición en línea (TT-55). Salir del campo o Enter con
  el mismo nombre no hace ningún pedido.
- **Después de guardar, el campo muestra el nombre guardado**, también si
  sigue con foco: el recortado si se guardó, el anterior si falló.
- **Sin permiso, el nombre se ve en el campo, en solo lectura** (PF-46).
- **Un nombre con el carácter nulo** responde «El nombre tiene un carácter que
  no se puede guardar.»; **un tema desconocido**, «Ese tema no está
  disponible.». Los dos solo llegan en un pedido armado a mano (PF-35).
- **El tema se elige en un selector**, como los formatos: «Seguir al sistema»,
  «Claro», «Oscuro», en ese orden, sin ejemplo. Su grupo se llama
  «Apariencia» y su rótulo, «Tema».
- **«Seguir al sistema» sigue al sistema en vivo**: si el sistema cambia de
  claro a oscuro con la pantalla abierta, la pantalla cambia sin recargar.
- **Sin sesión, la pantalla sigue al sistema**: `/login` y cualquier pantalla
  que se dibuje antes de entrar, también justo después de «Salir» (D2).
- **Cada ingreso por Google actualiza el nombre de la cuenta y la foto**
  (PF-45). El nombre editado no cambia (PF-08). **El correo no cambia
  (PF-06)**: si Google trae otro, la cuenta conserva el suyo.
- **Una cuenta de Google nueva con el correo de una persona que ya existe no
  entra**: el ingreso termina en la página de error de Better Auth con
  `account_not_linked`. La cuenta de Google que creó a esa persona sigue
  entrando.
- **La nota de la identidad** pasa a «La foto y el correo salen de tu cuenta de
  Google.».
- **Los títulos de los avisos** (PF-32): «No se pudo cambiar el nombre.» y «No
  se pudo cambiar el tema.».

**Lo registra `parity-analyst` antes del merge** (§6).

### Queda afuera

- **El modo timer/manual** (TT-16): sigue en la cookie.
- **La foto editable** (PF-09): sigue siendo de Google.
- **Volver a seguir el nombre de Google** una vez editado (D1, §8).
- **Liberar el correo de una persona** para que entre otra cuenta de Google
  (§8).
- **El nombre editado en otras pantallas**: hoy solo lo muestran el encabezado y
  el perfil, que leen la sesión. Las pantallas de la fase 2 que muestren a otras
  personas lo leen con la regla de §5.5.
- **El tema en las salidas que no son pantallas** (PDF, planillas): no existen
  todavía.

### Consecuencias sobre código ya entregado

| Archivo                                                                       | Qué cambia                                                                                                                                                                                                                              | Qué hay que volver a probar                                   |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `src/server/db/schema.ts`                                                     | `user_preference` suma `display_name` y `theme`, con su `check` cada una (§2).                                                                                                                                                          | `profile/schema.integration.test.ts`                          |
| `src/server/auth.ts`                                                          | `overrideUserInfoOnSignIn: true` en `socialProviders.google`; `databaseHooks.user.update.before` que saca el correo; `account.accountLinking.disableImplicitLinking: true` (§4.5). `disabledPaths` y el gancho de la sesión no cambian. | `auth.integration.test.ts`; el ingreso de e2e                 |
| `src/server/session.ts`                                                       | `currentSession` envuelta en `cache`; lee `profileOf` en lugar de `preferencesOf`; `user.name` sale de `displayNameOf` (§5.1).                                                                                                          | Toda action, por los arneses de `actions.integration.test.ts` |
| `src/server/session.integration.test.ts`                                      | El doble de `getSession` toma `name` de la fila `user` de la base, o de `mocks.name` si un caso lo fija. Los casos de la foto no cambian.                                                                                               | Los casos de la foto de PF-09                                 |
| `src/app/layout.tsx`                                                          | Lee `currentSession()` y pone en `<html>` la clase de `themeClassOf` (§5.2).                                                                                                                                                            | Toda pantalla, por e2e                                        |
| `src/app/globals.css`                                                         | La variante `dark` y el bloque oscuro según el ADR 0015, con `color-scheme` (§5.3).                                                                                                                                                     | Toda pantalla en claro, por e2e                               |
| `src/app/(app)/perfil/page.tsx`                                               | Pasa `updateName` a la pantalla.                                                                                                                                                                                                        | —                                                             |
| `src/modules/profile/schema.ts`                                               | `THEMES`, `Theme`, `NAME_MAX`; `Preferences` suma `theme`; la clave `theme` en `updatePreferenceInput`; `updateNameInput`; cuatro mensajes; `ProfileActions` suma `updateName` (§4.1).                                                  | `schema.test.ts` entero                                       |
| `src/modules/profile/repository.ts`                                           | `PreferenceColumn` suma `theme` y `displayName`.                                                                                                                                                                                        | `service.integration.test.ts`                                 |
| `src/modules/profile/service.ts`                                              | `PREFERENCE_DEFAULTS` y `resolvePreferences` suman el tema; `profileOf` reemplaza a `preferencesOf`; `displayNameOf`, `themeClassOf`, `updateName`; `ProfileView.options.themes` (§4, §5).                                              | `service.integration.test.ts` entero                          |
| `src/modules/profile/actions.ts`                                              | Suma `updateName`.                                                                                                                                                                                                                      | `actions.integration.test.ts` entero                          |
| `profile/schema.test.ts` y `profile/actions.integration.test.ts`              | El caso «una clave desconocida» deja de usar `{ key: "theme", value: "dark" }`, que pasa a ser válido, y usa `{ key: "displayName", value: "Ana" }`. Su mensaje no cambia.                                                              | —                                                             |
| `profile/service.integration.test.ts` y `profile/actions.integration.test.ts` | Las `Preferences` literales suman `theme: "system"`; `rowWith` suma `displayName` y `theme` en nulo; `preferencesOf(id)` pasa a `(await profileOf(id)).preferences`.                                                                    | —                                                             |
| `time-entry/service.integration.test.ts`                                      | Dos líneas: `:47`, el import de `preferencesOf` pasa a `profileOf`, y `:3982`, `preferencesOf(userId)` pasa a `(await profileOf(userId)).preferences`.                                                                                  | —                                                             |
| `src/test/factories.ts`                                                       | `SeedPreferenceValues` suma `displayName` y `theme`.                                                                                                                                                                                    | —                                                             |
| `profile/components/profile-screen.tsx`                                       | El nombre es un `NameField`; la nota de la identidad cambia; el grupo «Apariencia» con el tema (§5.4).                                                                                                                                  | `profile-screen.test.tsx`                                     |
| `profile/components/preference-field.tsx`                                     | La clave `theme`, con un `Select` sin ejemplo; `example` pasa a ser opcional en `FormatSelect` y sin él no se dibuja el paréntesis (§5.4).                                                                                              | PF-32 en los tres controles del 7                             |
| `profile/components/labels.ts`                                                | Los textos de §6.                                                                                                                                                                                                                       | —                                                             |
| `profile/components/profile-screen.test.tsx`                                  | La vista de prueba suma `theme` y `options.themes`; el doble de `ProfileActions` suma `updateName`; la afirmación de la nota de `:104` pasa al texto nuevo.                                                                             | —                                                             |
| `profile/components/user-menu.tsx`                                            | «Salir» termina con una carga completa de `/login` (D2, §5.2).                                                                                                                                                                          | «Salir», por e2e                                              |
| `e2e/profile.spec.ts`                                                         | El recorrido 1: `:190` mira el nombre en el campo y no en el texto; `:193-196`, la nota nueva y un `textbox`, «Nombre»; `:213`, cuatro `combobox`. Nada más.                                                                            | —                                                             |

**Ninguna otra afirmación de un test existente cambia.** Las de arriba son
fixtures que el tipo nuevo exige, el caso de la clave desconocida, que el 7
escribió con la clave que este slice vuelve válida, y los tres pasos del e2e
del 7 que miraban la identidad en solo lectura. El doble de `getSession` de
`session.integration.test.ts` cambia de dónde saca el nombre, no lo que afirman
sus casos.

**Lo que no cambia.** `src/app/(app)/layout.tsx`: le sigue pasando
`session.user.name` a `UserMenu`, que desde este slice ya es el nombre resuelto.
`timeSettingsOf`, `DisplayFormats` y todo `src/server/time`: el tema no es un
formato. `can()` y la tabla de permisos.

## 2. Cambios de esquema

**Dos columnas nuevas en `user_preference`**, nulas y sin valor por omisión, en
una migración generada con
`npm run db:generate -- --name=user_preference_name_theme`. Sobre `54daee0` sale
`drizzle/0008_user_preference_name_theme.sql` con
`drizzle/meta/0008_snapshot.json`. **La del 11a también sale como `0008`**: si
el 11a se mergea antes, se descarta la generada y se vuelve a generar después
del rebase, y sale `0009`. El diario `drizzle/meta/_journal.json` no se edita a
mano.

```ts
// src/server/db/schema.ts, dentro de userPreference
    /** El nombre que eligió la persona (PF-07). Nulo es «el de Google» (PF-08, PF-45). */
    displayName: text("display_name"),
    /** `THEMES` de `src/modules/profile/schema.ts`. Nulo es «seguir al sistema» (PF-23). */
    theme: text("theme"),

// en la lista de restricciones
    check(
      "user_preference_display_name_len",
      sql`char_length(${table.displayName}) between 1 and 100`,
    ),
    check(
      "user_preference_theme_known",
      sql`${table.theme} in ('system', 'light', 'dark')`,
    ),
```

El comentario de la tabla deja de decir que las preferencias son solo de hora:
suma que el nombre editado vive acá y no en `user.name`, que regenera
`npm run auth:schema`.

El SQL que tiene que salir, en sustancia:

```sql
ALTER TABLE "user_preference" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "user_preference" ADD COLUMN "theme" text;--> statement-breakpoint
ALTER TABLE "user_preference" ADD CONSTRAINT "user_preference_display_name_len" CHECK (char_length("user_preference"."display_name") between 1 and 100);--> statement-breakpoint
ALTER TABLE "user_preference" ADD CONSTRAINT "user_preference_theme_known" CHECK ("user_preference"."theme" in ('system', 'light', 'dark'));
```

La lista del `check` del tema repite `THEMES` (§4.1), y el largo del nombre
repite `NAME_MAX`, como los formatos del 7 repiten `TIME_FORMATS` y
`DATE_FORMATS`. El criterio 1 inserta cada valor de `THEMES`.

### 2.1 Por qué así

- **En `user_preference` y no en `user`**: lo fijó el 7 (§2.4 de su contrato).
  `user.name` lo sigue escribiendo Better Auth, y desde este slice en cada
  ingreso (§4.5), sin pisar nunca el editado. Es lo que cumple PF-08 y PF-45 a
  la vez.
- **Nulo es «sin elegir»**, como las columnas del 7, y el predeterminado lo
  aplica un solo lugar: `resolvePreferences` para el tema y `displayNameOf`
  para el nombre (§5.1). Elegir «Seguir al sistema» guarda `system`, igual que
  elegir el formato por omisión guarda su valor.
- **`char_length` cuenta caracteres** y Zod cuenta unidades de UTF-16: un
  nombre con emojis puede pasar la base y no el esquema, nunca al revés. Es lo
  mismo que hacen `client.name` y `project.name`.

### 2.2 Sin tiempo de caída

Columnas nulas sin valor por omisión: el `ALTER` no reescribe la tabla, y los
dos `check` validan filas que tienen las dos columnas en nulo. El código viejo
nombra las columnas una por una (Drizzle arma la lista desde el esquema), así
que no las ve. Se aplica antes del despliegue sin coordinar nada.

### 2.3 La reversión

```sql
ALTER TABLE "user_preference" DROP COLUMN "theme";
ALTER TABLE "user_preference" DROP COLUMN "display_name";
DELETE FROM "drizzle"."__drizzle_migrations"
  WHERE "created_at" = <el `when` de la migración en drizzle/meta/_journal.json>;
```

**Solo es segura con el código anterior a este slice ya desplegado**: el de
este slice lee las dos columnas en cada pedido con sesión. Se pierden los
nombres editados, que vuelven a ser los de Google, y los temas, que vuelven a
seguir al sistema. Nadie pierde horas.

## 3. Permisos

**Ninguna acción nueva.** La unión `Action` de `src/server/permissions` no
cambia.

| Operación             | Acción de `can()`    | Recurso                     |
| --------------------- | -------------------- | --------------------------- |
| Cambiar el tema       | `profile.own.update` | `ownProfileResource(actor)` |
| Cambiar el nombre     | `profile.own.update` | `ownProfileResource(actor)` |
| Editar en la pantalla | `profile.own.update` | `canEdit` de `ProfileView`  |

El nombre y el tema son del perfil propio, igual que la zona y los formatos.
Una acción aparte para el nombre sería una segunda decisión sobre lo mismo que
`profile.own.update` ya decide. Editar el nombre de otra persona es de la
pantalla de equipo (PF-17), que no entra.

Lo de Better Auth de §4.5 (el correo que no cambia, el enlace apagado) no es una
decisión de acceso de la aplicación: decide qué fila corresponde a quién entra,
antes de que haya `Actor`. No pasa por `can()`.

## 4. Contrato de las server actions

Una action nueva, `updateName`, y una clave nueva en `updatePreference`. Las
dos con el recorrido de siempre: sesión, Zod, `assertCan`, service en una
transacción con su constancia, revalidación también con error.

**Ningún archivo de `components/` importa `actions.ts`.** Las dos actions
llegan a la pantalla por props desde `page.tsx`, como en el 7.

### 4.1 Los tipos

```ts
// src/modules/profile/schema.ts
/** Los tres temas (PF-23), en el orden del selector. El `check` de la base los repite. */
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

/** El largo máximo del nombre (PF-35). El `check` de la base lo repite. */
export const NAME_MAX = 100;

export const profileMessages = {
  // … los cuatro del 7, sin cambios
  themeUnavailable: "Ese tema no está disponible.",
  nameRequired: "Escribí un nombre.",
  nameTooLong: "El nombre no puede superar los 100 caracteres.",
  nameNullCharacter: "El nombre tiene un carácter que no se puede guardar.",
} as const;

export type Preferences = {
  readonly timezone: string;
  readonly timeFormat: TimeFormat;
  readonly dateFormat: DateFormat;
  readonly theme: Theme;
};

// updatePreferenceInput suma una rama:
z.object({
  key: z.literal("theme"),
  value: z.enum(THEMES, { error: profileMessages.themeUnavailable }),
}),

/** El nombre editado (PF-07, PF-35): recortado, entre 1 y 100, sin el carácter nulo. */
export const updateNameInput = z.object(
  {
    name: z
      .string({ error: profileMessages.nameRequired })
      .trim()
      .min(1, profileMessages.nameRequired)
      .max(NAME_MAX, profileMessages.nameTooLong)
      .refine(noNullCharacter, profileMessages.nameNullCharacter),
  },
  { error: profileMessages.nameRequired },
);

export type UpdateNameInput = z.infer<typeof updateNameInput>;
export type UpdateNameResult = { readonly name: string };

export type ProfileActions = {
  readonly updatePreference: (…) => …; // sin cambios
  readonly updateName: (input: UpdateNameInput) => Promise<ActionResult<UpdateNameResult>>;
};
```

- **`THEMES` vive en el `schema.ts` del módulo**, no en `src/server/time`: no es
  un formato y solo lo usan `profile` y el layout raíz, por `themeClassOf`.
- **El nombre no es una clave de `updatePreference`.** Tiene sus propios
  mensajes, su recorte y su campo, y es identidad, no una preferencia. Una
  `key: "displayName"` en `updatePreference` sigue siendo una clave
  desconocida, con «Ese formato no está disponible.» (criterio 4).
- `noNullCharacter` viene de `src/lib/text.ts`, como en `project` y
  `time-entry`.

Los códigos son los del 7: `validation`, `forbidden` y `unexpected`.

### 4.2 `updatePreference` con el tema: PF-23

Sin cambios de conducta: la clave `theme` recorre los mismos pasos que las
otras tres (§4.2 del 7). `columnOf` suma el caso, `PreferenceColumn` suma
`{ readonly theme: string }`, y la constancia es `profile.updatePreference` con
`{ theme: null }` → `{ theme: "dark" }`.

### 4.3 `updateName`: PF-07, PF-08, PF-35

```ts
// src/modules/profile/service.ts
export async function updateName(
  actor: Actor,
  input: UpdateNameInput,
): Promise<UpdateNameResult>;
```

1. **La action** valida con `updateNameInput` y consulta
   `assertCan(actor, "profile.own.update", ownProfileResource(actor))`, en el
   orden de `updatePreference` (`actions.ts:28-31`).
2. En una transacción, **los mismos pasos que `updatePreference`**: asegura la
   fila, la lee con `for update`, sale sin efecto si `display_name` ya es el
   nombre pedido, escribe solo `display_name` y deja la constancia.
3. La constancia es **`profile.updateName`**, entidad `user_preference`,
   `entityId` igual a `actor.userId`, con `{ displayName: null }` →
   `{ displayName: "Ana Prueba" }`. Una acción de auditoría propia porque es la
   identidad y no una preferencia: quien busque cambios de nombre los encuentra
   sin leer valores.
4. Devuelve `{ name }`, el guardado.

**Los pasos comunes viven en una sola función privada del service**, que
reciben las dos: la columna con su valor y el nombre de la constancia. Ni
`updateName` ni `updatePreference` repiten el `insert … on conflict`, el
bloqueo ni la comparación.

**La comparación es contra `display_name` y nada más** (D1): un nulo no es
igual al nombre de Google, y escribir el nombre de Google lo guarda. El service
no lee `user.name`.

Es seguro de reintentar sin el ADR 0007, por lo mismo que `updatePreference`.
Un nombre y un tema simultáneos de la misma persona se ponen en fila sobre la
fila asegurada y quedan los dos escritos.

### 4.4 La revalidación

Las dos actions revalidan `{ path: "/", type: "layout" }`, también con error,
con las `options` que `actions.ts` ya tiene. Ese destino incluye el layout raíz,
que es el que dibuja la clase del tema (§5.2), y el del shell, que dibuja el
nombre en el encabezado (PF-33).

```ts
// src/modules/profile/actions.ts
export async function updateName(
  input: UpdateNameInput,
): Promise<ActionResult<UpdateNameResult>> {
  return handle(async (session) => {
    const values = updateNameInput.parse(input);
    assertCan(session.actor, "profile.own.update", ownProfileResource(session.actor));
    return service.updateName(session.actor, values);
  }, options);
}
```

### 4.5 Better Auth: el nombre de Google en cada ingreso (PF-45), el correo fijo (PF-06) y sin enlace implícito

```ts
// src/server/auth.ts
account: {
  // Sin enlace implícito: una cuenta de Google que no creó la fila no entra a
  // ella aunque traiga su correo. Con una dirección reciclada, la persona nueva
  // entraría a la cuenta de la anterior, con su rol y sus horas.
  accountLinking: { disableImplicitLinking: true },
},
socialProviders: {
  google: {
    // … lo de hoy, más:
    // PF-45: el nombre y la foto de Google llegan en cada ingreso. El nombre que
    // la persona editó vive en `user_preference` y esto no lo toca (PF-08).
    overrideUserInfoOnSignIn: true,
  },
},
databaseHooks: {
  user: {
    update: {
      // PF-06: el correo es la identidad y no cambia. Sin esto, cada ingreso lo
      // reescribe con el de Google (`overrideUserInfoOnSignIn`).
      before: async (data) => {
        if (data.email === undefined) {
          return;
        }
        return { data: { email: undefined } };
      },
    },
  },
  session: {
    // … sin cambios
  },
},
```

- **Qué escribe un ingreso**: `name` e `image` con lo que devuelve
  `mapProfileToUser`. Better Auth también pide `email` con el de Google
  (`link-account.mjs:238-247`), y el gancho lo saca: el `data` que devuelve se
  mezcla sobre el del update (`with-hooks.mjs:56-59`) y en un update el
  adaptador descarta los campos `undefined` (`factory.mjs:115`). `emailVerified`
  se sigue escribiendo, con el `true` que exige `decideGoogleAccess`
  (`access.ts:54`); la aplicación no lo lee. **El correo no cambia (PF-06).**
- **Por qué un gancho**: `overrideUserInfoOnSignIn` no tiene una forma de dejar
  el correo afuera. El gancho vale para todo `updateUser` y `updateUserByEmail`
  de Better Auth (`internal-adapter.mjs:601-621`), así que ninguna ruta de la
  librería cambia el correo. Sin él, un correo de Google que ya es el de otra
  fila (`user.email` es único; por ejemplo, una dirección reciclada cuya fila
  guarda horas) hace lanzar ese `updateUser`, que está fuera de todo `try`
  (`link-account.mjs:238-254`), y cada ingreso de esa persona da 500.
- **El enlace implícito, apagado.** Sin la opción, un `sub` de Google sin fila
  en `account` que trae el correo de una fila existente se enlaza a ella
  (`link-account.mjs:119-125`, `:146-189`): con una dirección reciclada, la
  persona nueva entra a la cuenta de la anterior, con su rol y sus horas. Ni
  `decideGoogleAccess` ni el gancho de la sesión lo frenan, porque los dos
  miran el correo, que es válido. Con la opción, `handleOAuthUserInfo` responde
  `account not linked` (`:139-145`) y el callback redirige a la página de error
  de Better Auth con `error=account_not_linked` (`callback.mjs:195-197`). La
  cuenta de Google que creó la fila se encuentra por `sub` (`:80-106`) y no
  pasa por ahí. La aplicación no usa `linkSocial`.
- **La foto** sigue pasando por `googlePhotoOf` de `session.ts` antes de
  mostrarse.
- **`disabledPaths` no cambia**: la identidad sigue sin escribirse por la API
  de Better Auth (PF-09).
- **No se puede probar el ingreso por Google** fuera del navegador. Se prueban
  las piezas: el gancho con `internalAdapter.updateUser` y la composición de la
  sesión con `user.name` cambiado en la base, que es lo que hace el ingreso
  (criterio 7); el enlace con `handleOAuthUserInfo` (criterio 16).

**Lo revisa `security-auditor` antes del merge** (§6, handshake): es una
escritura de la identidad que hoy no existe y un cambio en qué fila corresponde
a quién entra.

## 5. Contrato de lectura y pantalla

### 5.1 La sesión trae el nombre resuelto

```ts
// src/modules/profile/service.ts
/** Lo que la persona guardó de su cuenta, resuelto. */
export type StoredProfile = {
  readonly preferences: Preferences;
  /** El nombre que eligió, o `null` si nunca lo editó. */
  readonly displayName: string | null;
};

/** Una consulta por clave primaria. Reemplaza a `preferencesOf`. */
export async function profileOf(userId: string): Promise<StoredProfile>;

/** El nombre que se muestra: el editado, o el de la cuenta de Google (PF-08, PF-45). */
export function displayNameOf(stored: StoredProfile, accountName: string): string;
```

- **`resolvePreferences`** suma el tema con la regla de los formatos: nulo es
  `system`, un valor fuera de `THEMES` lanza (`knownFormat`).
  `PREFERENCE_DEFAULTS.theme` es `"system"` (P-03).
- **`profileOf` lee la fila una vez** y devuelve las preferencias resueltas y
  `display_name` tal como está.
- **`preferencesOf` desaparece**: su único consumidor de producción era
  `session.ts`. Sus usos en tests pasan a `(await profileOf(id)).preferences`
  (§1).

```ts
// src/server/session.ts
export const currentSession = cache(async (): Promise<SessionContext | null> => {
  // … getSession como hoy
  const [context, stored] = await Promise.all([
    ensureWorkspaceContext({ id: session.user.id, email: session.user.email }),
    profileOf(session.user.id),
  ]);
  return {
    ...context,
    preferences: stored.preferences,
    user: {
      id: session.user.id,
      name: displayNameOf(stored, session.user.name),
      email: session.user.email,
      image: googlePhotoOf(session.user.image),
    },
  };
});
```

- **`CurrentUser.name` pasa a ser el nombre resuelto.** No hay otro campo con
  el de Google: nadie lo muestra (D1).
- **`cache` de React** (ADR 0015): el layout raíz, el del shell y la página
  comparten una lectura por pedido. Las actions la leen de nuevo, porque corren
  fuera de una pasada de render, y el render que sigue a la revalidación
  empieza con la memoria vacía. `requireSession` no cambia: llama a
  `currentSession`.
- **Si `cache` no está en la build de React que carga Vitest** (los arneses
  llaman a `currentSession` fuera de un render), se avisa antes de seguir: los
  arneses de las actions dependen de que la llamada pase de largo.

### 5.2 El tema en `<html>`

```ts
// src/modules/profile/service.ts
/**
 * La clase de `<html>` (PF-23, PF-24, ADR 0015). Sin sesión, o con «Seguir al
 * sistema», ninguna: lo resuelve la hoja de estilos. Única lectura del tema
 * para mostrar.
 */
export function themeClassOf(
  context: ProfileContext | null,
): "light" | "dark" | undefined;
```

```tsx
// src/app/layout.tsx
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await currentSession();
  return (
    <html
      lang="es"
      className={cn(
        geistSans.variable,
        geistMono.variable,
        "h-full antialiased",
        themeClassOf(session),
      )}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
```

- **El layout raíz solo compone**: la sesión y `themeClassOf`, sin leer
  `preferences`. Sigue en pie la regla del 7 de que ningún archivo fuera de
  `profile/service.ts` lee `context.preferences` para mostrar algo.
- **`currentSession` y no `requireSession`**: el layout raíz también envuelve
  `/login`, que no tiene sesión.
- **Sin `suppressHydrationWarning` ni script**: la clase la dibuja el servidor
  y el cliente la recibe igual en la carga del RSC; no hay nada que corregir
  antes de hidratar.
- **El cambio sin recargar** lo trae la revalidación de §4.4: el layout raíz se
  vuelve a dibujar con la clase nueva, y React actualiza el atributo de
  `<html>`. Es el primer supuesto que verifica `frontend-dev` (§6, handshake).
- **«Salir» hace una carga completa** (D2): en `user-menu.tsx`,
  `router.replace("/login")` pasa a `window.location.assign("/login")`. En una
  navegación del cliente el layout raíz se conserva, y `/login` quedaría con la
  clase de quien salió; la carga completa la dibuja de nuevo sin sesión y
  además descarta la caché del router con pantallas de esa persona.

### 5.3 La hoja de estilos

**La regla**: `<html class="dark">` es oscuro siempre; `<html class="light">`
es claro siempre; sin ninguna de las dos, oscuro cuando
`prefers-color-scheme: dark`. **Los valores oscuros se escriben una sola vez**,
y la variante `dark:` de Tailwind que usan los componentes de `components/ui`
sigue la misma regla. La forma esperada:

```css
/* PF-23 y ADR 0015: «Oscuro» es la clase `dark` en <html>; «Claro», la clase
   `light`; «Seguir al sistema», ninguna, y decide el sistema. */
@custom-variant dark {
  &:where(.dark, .dark *) {
    @slot;
  }
  @media (prefers-color-scheme: dark) {
    &:where(:root:not(.light), :root:not(.light) *) {
      @slot;
    }
  }
}

:root {
  color-scheme: light;
  /* … las variables claras de hoy, sin cambios */

  @variant dark {
    color-scheme: dark;
    /* … las variables del bloque `.dark` de hoy, sin cambios */
  }
}
```

- **Ningún valor cambia.** Los de `:root` y los de `.dark` son los de hoy; solo
  cambia qué selecciona los oscuros.
- **`color-scheme`** hace que las barras de desplazamiento, el autocompletado y
  los controles nativos sigan al tema.
- **Si `@variant` dentro de `:root` no compila con la variante de bloque**, la
  alternativa es el mismo bloque oscuro bajo `.dark` y bajo
  `@media (prefers-color-scheme: dark) { :root:not(.light) }`. Duplica las
  variables; se avisa antes de elegirla (§6, handshake).

### 5.4 La pantalla de perfil

```ts
// src/modules/profile/service.ts
export type ProfileView = {
  // … lo del 7, sin cambios; `identity.name` es el nombre resuelto
  readonly options: {
    // … las tres del 7
    readonly themes: readonly Theme[];
  };
};
```

`getProfileView` arma `options.themes` con `THEMES` y sigue sin consultas.
`page.tsx` le pasa `{ updatePreference, updateName }`.

- **«Datos de la cuenta»**: la foto o las iniciales; el **nombre, un
  `NameField`** con el rótulo «Nombre»; el correo como texto; y la nota «La
  foto y el correo salen de tu cuenta de Google.».
- **«Preferencias»**: el aviso de PF-46 sin permiso, el grupo «Hora y fecha»
  del 7 sin cambios, y **el grupo «Apariencia»** con un `PreferenceField` de
  clave `theme`.

**`name-field.tsx`** (nuevo, `"use client"`):

- Un `Input` de texto con `maxLength={NAME_MAX}` y `autoComplete="name"`, y el
  valor resuelto de la vista.
- **Guarda al salir del campo o con Enter** (PF-32) si el texto recortado no es
  el nombre guardado; si es igual, no hay pedido. Con
  `useAction(updateName, …)` y el valor nuevo como vista optimista.
- **`Esc`** vuelve el campo al nombre guardado, sin pedido.
- **La respuesta del pedido propio repone el texto guardado, aunque el campo
  tenga foco.** Con éxito, el nombre que devuelve la action, ya recortado; con
  falla, el guardado de la vista, al que vuelve la transición de `useAction`
  al descartar la vista optimista. Después de un Enter el campo sigue con foco,
  y es esta regla la que lo deja en el guardado. La revalidación que llega con
  esa respuesta es parte de ella.
- **Si falla**, además, debajo aparece el aviso de dos partes con «No se pudo
  cambiar el nombre.» y el mensaje. «Reintentar» solo con `unexpected`
  (`retryHandlerOf`).
- **La regla del foco solo protege de las revalidaciones ajenas**: una
  revalidación que no viene de un pedido de este campo (por ejemplo, la de un
  cambio de tema) y llega mientras se escribe no reemplaza el texto. Sin foco,
  el campo sigue a la vista.
- **Sin permiso, `readOnly`**, nunca `disabled`: el valor se ve y el foco no se
  pierde si la revalidación trae `canEdit` en falso con el campo enfocado.
- No importa nada de `time-entry`: el `DescriptionField` de ese módulo hace lo
  mismo con rebote, y el ADR 0010 no deja usarlo desde `profile`.

**`preference-field.tsx`** suma la rama `theme` a su unión: un `FormatSelect`
como el de los formatos, con `themeNames` como nombre de cada opción y **sin
ejemplo**. Para eso **`example` pasa a ser opcional en las opciones de
`FormatSelect`**: sin ejemplo, ni el disparador (`choiceText`) ni la opción
(`SelectItem`) dibujan el paréntesis (`preference-field.tsx:181-183`, `:189`,
`:210-213`, `:251-255`). La rama `theme` le pasa `options.themes` como
`{ value }`. Los formatos del 7 se ven igual: el `Choice` de `service.ts` sigue
exigiendo `example`. Sin permiso, `aria-disabled` y no abre, como los formatos.
El título del aviso es «No se pudo cambiar el tema.». El selector cambia al
instante con la vista optimista; los colores, con la respuesta (ADR 0015).

### 5.5 El nombre en el resto de la aplicación

Hoy lo muestran solo el encabezado y el perfil, y los dos lo toman de
`session.user.name`. **La regla para la fase 2**: toda pantalla que muestre el
nombre de una persona lo lee como
`coalesce(user_preference.display_name, user.name)`, con un `join` en su
repository (ADR 0010: lo que solo se muestra se lee con un `join`). Este slice
no lo construye: no hay ninguna consulta que lo necesite.

## 6. Reparto de archivos

Rutas absolutas; **(nuevo)** marca lo que el slice crea.

### backend-dev

```
/home/maxi/program/clock/src/server/db/schema.ts
/home/maxi/program/clock/drizzle/0008_user_preference_name_theme.sql             (nuevo, generado)
/home/maxi/program/clock/drizzle/meta/0008_snapshot.json                         (nuevo, generado)
/home/maxi/program/clock/drizzle/meta/_journal.json
/home/maxi/program/clock/src/server/auth.ts
/home/maxi/program/clock/src/server/auth.integration.test.ts
/home/maxi/program/clock/src/server/session.ts
/home/maxi/program/clock/src/server/session.integration.test.ts
/home/maxi/program/clock/src/modules/profile/schema.ts
/home/maxi/program/clock/src/modules/profile/schema.test.ts
/home/maxi/program/clock/src/modules/profile/repository.ts
/home/maxi/program/clock/src/modules/profile/service.ts
/home/maxi/program/clock/src/modules/profile/actions.ts
/home/maxi/program/clock/src/modules/profile/schema.integration.test.ts
/home/maxi/program/clock/src/modules/profile/service.integration.test.ts
/home/maxi/program/clock/src/modules/profile/actions.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/service.integration.test.ts
/home/maxi/program/clock/src/test/factories.ts
```

- Los archivos de `drizzle/` salen del generador (§2); si el 11a entró antes,
  son la `0009`.
- **`auth.ts`** suma las tres piezas de §4.5: `overrideUserInfoOnSignIn`,
  `databaseHooks.user.update.before` y
  `account.accountLinking.disableImplicitLinking`.
- **`auth.integration.test.ts`** suma dos casos sobre el `auth` real que ya
  importa: el gancho con `(await auth.$context).internalAdapter.updateUser` y
  el enlace con `handleOAuthUserInfo` de `better-auth/oauth2` y ese mismo
  `$context` (criterios 7 y 16). Si `handleOAuthUserInfo` no se deja llamar
  fuera de un pedido, se avisa antes de cambiar la forma del test.
- **`session.integration.test.ts` ya existe** y se extiende, con su arnés:
  `next/headers` y `auth` reemplazados, el resto de verdad. El doble de
  `getSession` toma `name` de la fila `user` de la base, o de `mocks.name` si
  un caso lo fija, para que cambiar `user.name` en la base cambie lo que
  devuelve. Los casos de la foto de PF-09 y `mocks.image` quedan. Prueba la
  composición de `currentSession` (criterio 7).
- **`time-entry/service.integration.test.ts`** cambia dos líneas: `:47` y
  `:3982`.

### frontend-dev

```
/home/maxi/program/clock/src/app/layout.tsx
/home/maxi/program/clock/src/app/globals.css
/home/maxi/program/clock/src/app/(app)/perfil/page.tsx
/home/maxi/program/clock/src/modules/profile/components/profile-screen.tsx
/home/maxi/program/clock/src/modules/profile/components/profile-screen.test.tsx
/home/maxi/program/clock/src/modules/profile/components/preference-field.tsx
/home/maxi/program/clock/src/modules/profile/components/name-field.tsx            (nuevo)
/home/maxi/program/clock/src/modules/profile/components/labels.ts
/home/maxi/program/clock/src/modules/profile/components/user-menu.tsx
```

- **`preference-field.tsx`**: la rama `theme` y `example` opcional en
  `FormatSelect` (§5.4).
- **`user-menu.tsx`**: «Salir» con `window.location.assign("/login")` (D2,
  §5.2).

### tests-slice7b

```
/home/maxi/program/clock/e2e/profile-name-theme.spec.ts                          (nuevo)
/home/maxi/program/clock/e2e/profile.spec.ts
/home/maxi/program/clock/e2e/tracker-page.ts
```

`profile.spec.ts` cambia solo los tres pasos de §1. `tracker-page.ts` suma los
ayudantes del spec nuevo —el campo del nombre, el fondo de la página, la clase
de `<html>`— y los existentes no cambian.

### security-auditor

No edita archivos. Revisa `src/server/auth.ts` y sus tests antes del merge: el
gancho que saca el correo, el enlace implícito apagado y
`overrideUserInfoOnSignIn` (§4.5).

### parity-analyst

```
/home/maxi/program/clock/docs/parity/perfil.md
```

Antes del merge: lo de §1, «Lo que el slice decide»; PF-07 y PF-08 como
implementados, con D1; PF-45 con `overrideUserInfoOnSignIn` y el correo que no
cambia (PF-06); el rechazo de una cuenta de Google nueva con el correo de una
persona existente; PF-23 y PF-24 con el ADR 0015; la nota del slice 7 en PF-31,
reemplazada por la pantalla de este; los títulos de PF-32; las dos filas nuevas
de PF-35 (el tema desconocido, el carácter nulo); y en §10 las filas de
`auth.ts` y de `layout.tsx` y `globals.css`, que dejan de estar pendientes. P-09
suma los nombres de los temas y el grupo «Apariencia», que son decisiones
nuestras.

### Lo que no toca nadie

`src/server/permissions/`, `src/server/action.ts`, `src/server/time/`,
`src/server/db/auth-schema.ts`, `src/server/access.ts`, `next.config.ts` (la
CSP no cambia), `src/modules/workspace/`, `src/modules/project/`,
`src/modules/time-entry/` salvo las dos líneas de su test, `src/components/`
(incluido `components/ui` y `display-formats.tsx`), `src/hooks/`,
`src/app/(app)/layout.tsx` y el resto de `src/app/` salvo lo listado. De los e2e
existentes, solo `profile.spec.ts`, con lo de §1. Los contratos y correcciones
anteriores son históricos. El mapa y el estado de la fase los actualiza
team-lead.

### Handshake de orden

0. **Antes de implementar**: si el 11a se mergeó antes, la migración se genera
   sobre ese `main` (§2).
1. **Primer commit de `backend-dev`**: la migración y las columnas; en
   `profile/schema.ts`, `THEMES`, `Theme`, `NAME_MAX`, los mensajes,
   `Preferences.theme`, la clave `theme`, `updateNameInput` y `ProfileActions`;
   las firmas de `profileOf`, `displayNameOf`, `themeClassOf`, `updateName` y
   `ProfileView.options.themes`; `SeedPreferenceValues`; y los fixtures y el
   caso de la clave desconocida de §1. La suite existente sigue verde. Avisa a
   `frontend-dev`.
2. **`frontend-dev` arranca en paralelo**, y **primero de todo** prueba en un
   navegador los dos supuestos del ADR 0015: que `@variant dark` dentro de
   `:root` compila con la variante de bloque y da las cuatro combinaciones
   (clase `dark`, clase `light`, sin clase con el sistema claro y con el
   oscuro), y que una revalidación del layout raíz cambia la clase de `<html>`
   sin recargar. Si alguno falla, avisa antes de seguir, porque cambia §5.2 o
   §5.3. Después, `labels.ts` y `name-field.tsx`.
3. **`tests-slice7b` arranca en paralelo** con el spec nuevo y los tres pasos de
   `profile.spec.ts`, y confirma que fallan por la funcionalidad y no por el
   arnés.
4. Con el primer commit en la rama, `frontend-dev` sigue con el layout raíz, la
   pantalla, el campo del tema, `user-menu.tsx` y `page.tsx`; `backend-dev`,
   con el service, la action, `auth.ts`, `session.ts` y sus tests.
5. **`security-auditor`**, con `auth.ts` y sus tests terminados, antes del
   merge.
6. `parity-analyst`, antes del merge.

### Responsabilidades que no se leen en el nombre del archivo

- **`src/app/layout.tsx`** lee `currentSession()` y pone `themeClassOf(session)`
  en `<html>`. No lee preferencias ni decide nada.
- **`src/server/session.ts`** es el único que compone el nombre que se muestra,
  con `displayNameOf`.
- **`src/server/auth.ts`** es el único lugar que fija que el correo no cambia y
  que una cuenta de Google no se enlaza por correo.
- **`labels.ts`** suma:

  | Clave                 | Texto                                                                    |
  | --------------------- | ------------------------------------------------------------------------ |
  | `identityNote`        | «La foto y el correo salen de tu cuenta de Google.» (reemplaza la del 7) |
  | `appearance`          | «Apariencia»                                                             |
  | `theme`               | «Tema»                                                                   |
  | `themeNames`          | `system` → «Seguir al sistema», `light` → «Claro», `dark` → «Oscuro»     |
  | `failureTitles.theme` | «No se pudo cambiar el tema.»                                            |
  | `failureTitles.name`  | «No se pudo cambiar el nombre.»                                          |

  `themeNames` lleva `satisfies Record<Theme, string>`, como `timeFormatNames`.
  `name` («Nombre») ya existe y es el rótulo del campo.

## 7. Criterios de aceptación

1. **La migración** — La tabla acepta las dos columnas en nulo, cada valor de
   `THEMES` y un nombre de 1 y de 100 caracteres; rechaza un nombre vacío, uno
   de 101 y los temas `'Dark'` y `'auto'`.
2. **Los predeterminados** (PF-23, PF-37) — Sin fila, el tema es `system` y
   `displayName` es nulo. Con solo `theme` guardado, las otras columnas son las
   del 7. Un tema fuera de lista lanza.
3. **Guardar el tema** (PF-23, PF-32) — La clave `theme` escribe solo su
   columna, sale sin efecto con el mismo valor, deja `profile.updatePreference`
   con el valor anterior crudo, y elegir `system` escribe `system`. Un tema
   desconocido responde «Ese tema no está disponible.».
4. **Guardar el nombre** (PF-07, PF-35) — `updateName` recorta, escribe solo
   `display_name`, responde el guardado y deja `profile.updateName`; con el
   mismo nombre no escribe ni registra. Un nombre y un tema simultáneos quedan
   los dos. Vacío o solo espacios, «Escribí un nombre.»; 101 caracteres, «El
   nombre no puede superar los 100 caracteres.»; 100, se guarda; con el
   carácter nulo, «El nombre tiene un carácter que no se puede guardar.»; un
   valor que no es texto o un pedido sin `name`, «Escribí un nombre.».
   `updatePreference` con `{ key: "displayName" }` responde «Ese formato no está
   disponible.».
5. **Permisos** (PF-34, PF-46) — Una membresía `inactive` o `invited` recibe
   `forbidden` en las dos actions, sin escritura ni constancia.
6. **Revalidación** — Las dos actions revalidan `{ path: "/", type: "layout" }`,
   también con error.
7. **El nombre que se muestra y el correo** (PF-06, PF-08, PF-45) —
   `currentSession` da el nombre editado si hay uno y el de la cuenta si no.
   Con `user.name` cambiado en la base, que es lo que hace un ingreso por
   Google, cambia el de quien no editó y no el de quien editó.
   `internalAdapter.updateUser(id, { name, image, email: otro })` cambia el
   nombre y la foto y no el correo. `overrideUserInfoOnSignIn` está puesto en
   el proveedor de Google. `/update-user` sigue respondiendo 404.
8. **El tema en el documento** (PF-24) — El HTML que manda el servidor trae
   `<html>` con `dark`, con `light` o sin ninguna de las dos según el tema
   guardado, sin ningún script que lo cambie. Sin sesión, sin clase, también
   justo después de «Salir» con «Oscuro» guardado (D2).
9. **Seguir al sistema** (PF-23) — Sin clase, el fondo sigue al
   `prefers-color-scheme` emulado y cambia en vivo; con `light`, es claro con el
   sistema oscuro; con `dark`, oscuro con el sistema claro; el contenido de un
   `Select` abierto, que se dibuja en un portal, sigue al tema.
10. **Sin recargar** (PF-24, PF-33) — Elegir un tema lo aplica sin recargar, y
    se conserva al navegar a `/` y al recargar. Cambiar el nombre lo muestra en
    el menú de la cuenta, con sus iniciales, sin recargar.
11. **Una falla al guardar** (PF-32, PF-36) — El selector del tema vuelve al
    valor anterior, `<html>` conserva su clase, y aparece «No se pudo cambiar el
    tema.» con «Reintentar», que guarda. Un nombre rechazado vuelve el campo al
    guardado **aunque el campo conserve el foco**, con «No se pudo cambiar el
    nombre.» y el mensaje, sin «Reintentar».
12. **La pantalla** (PF-31, PF-46) — El nombre es un campo rotulado «Nombre» con
    el valor resuelto; la foto y el correo, texto; la nota nueva; el grupo
    «Apariencia» con «Tema» y el valor guardado o el predeterminado. Sin
    permiso, el campo del nombre es `readOnly` y el `Select` del tema tiene
    `aria-disabled`, ninguno con `disabled`. Las opciones del tema no llevan
    paréntesis; las de los formatos siguen con su ejemplo.
13. **El campo del nombre** (PF-32) — Salir o Enter con el mismo nombre no hace
    pedido; `Esc` descarta sin pedido. Un nombre guardado con Enter deja en el
    campo, todavía con foco, el guardado ya recortado.
14. **Una sola lectura** — `currentSession` está envuelta en `cache`; ningún
    archivo fuera de `profile/service.ts` lee `context.preferences`; solo
    `session.ts` compone el nombre que se muestra.
15. **Lo existente sigue verde** — Unidad, integración y e2e de `main` pasan,
    cambiando solo lo que lista §1. En particular, todos los e2e corren con el
    sistema claro de Playwright y la persona sin tema, así que ninguno cambia de
    colores.
16. **Sin enlace implícito** — Un `sub` de Google nuevo con el correo de una
    fila existente no se enlaza: `handleOAuthUserInfo` responde
    `account not linked`, no hay fila nueva en `account` para ese `sub` ni
    sesión nueva, y la fila conserva sus cuentas.

### Con qué se verifica cada criterio

| Criterio | Tipo                       | Archivo                                                                                                | Qué afirma                                                                                                                                |
| -------- | -------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | integración                | `profile/schema.integration.test.ts`                                                                   | cada `THEMES`, los largos de borde y los rechazos, con inserts directos                                                                   |
| 2        | integración                | `profile/service.integration.test.ts`                                                                  | `profileOf` sin fila y con fila parcial; `resolvePreferences` con un tema fuera de lista                                                  |
| 3        | unidad + integración       | `profile/schema.test.ts`; `profile/service.integration.test.ts`; `profile/actions.integration.test.ts` | la rama `theme` del esquema; escritura, punto fijo y constancia; el mensaje por la action                                                 |
| 4        | unidad + integración       | `profile/schema.test.ts`; `profile/service.integration.test.ts`; `profile/actions.integration.test.ts` | cada rechazo del esquema; escritura, recorte, punto fijo, constancia y el simultáneo con `raceThroughBarrier`; los mensajes por la action |
| 5        | integración                | `profile/actions.integration.test.ts`                                                                  | las dos actions con `inactive` e `invited`                                                                                                |
| 6        | integración                | `profile/actions.integration.test.ts`                                                                  | el destino en éxito y en error de `updateName`                                                                                            |
| 7        | integración                | `src/server/session.integration.test.ts`; `src/server/auth.integration.test.ts`                        | las tres combinaciones de nombre; el `updateUser` con otro correo; la opción del proveedor; el 404 de siempre                             |
| 8        | integración + e2e          | `profile/service.integration.test.ts`; `e2e/profile-name-theme.spec.ts`                                | `themeClassOf` con los tres temas y sin sesión; el recorrido 2, con «Salir» al final                                                      |
| 9        | e2e                        | `e2e/profile-name-theme.spec.ts`                                                                       | el recorrido 2                                                                                                                            |
| 10       | e2e                        | `e2e/profile-name-theme.spec.ts`                                                                       | los recorridos 1 y 2                                                                                                                      |
| 11       | e2e                        | `e2e/profile-name-theme.spec.ts`                                                                       | los recorridos 1 y 3                                                                                                                      |
| 12       | unidad + integración + e2e | `profile-screen.test.tsx`; `profile/service.integration.test.ts`; `e2e/profile.spec.ts`                | el marcado con y sin permiso; `options.themes` e `identity.name`; el recorrido 1 del 7 con sus tres cambios                               |
| 13       | e2e                        | `e2e/profile-name-theme.spec.ts`                                                                       | el recorrido 1                                                                                                                            |
| 14       | revisión                   | —                                                                                                      | `cache` en `session.ts`; la búsqueda de lecturas de `preferences` y de `user.name`                                                        |
| 15       | unidad + integración + e2e | las suites existentes                                                                                  | en verde, con solo lo de §1 cambiado                                                                                                      |
| 16       | integración + revisión     | `src/server/auth.integration.test.ts`                                                                  | `handleOAuthUserInfo` con un `sub` nuevo y el correo de una fila sembrada; la revisión de `security-auditor`                              |

**El criterio 7 es el que sostiene PF-08 sin Google.** Siembra tres personas
—sin nombre editado, con nombre editado, y con nombre editado igual al de la
cuenta— y cambia `user.name` de las tres en la base: el mutante que lee
`user.name` primero, o que guarda nulo al editar, cae acá. Con el doble de
`getSession` de nombre fijo, este caso no podría fallar: por eso lee la fila.
**Su caso del correo** llama a `updateUser` con otro correo y lee la fila: sin
el gancho, el correo cambia y el caso cae.

**El criterio 16 cae sin la opción.** La fila sembrada con `seedUser` tiene
`emailVerified` en verdadero y el `userInfo` del caso también, así que sin
`disableImplicitLinking` el mismo pedido se enlaza (`link-account.mjs:139`): el
caso no puede pasar por otra rama del rechazo.

**El criterio 4 cruza el simultáneo** con `raceThroughBarrier` de
`src/test/concurrency.ts`, como el 7: un nombre y un tema de la misma persona,
los dos sobre una fila que todavía no existe.

**El test de componente** sigue el patrón del 7: `renderToStaticMarkup`, una
vista armada a mano y un `ProfileActions` con dobles escritos a mano. Con
`canEdit` en falso afirma el `input` con `readonly` y sin `disabled`, y el
disparador del tema con `aria-disabled` y sin `disabled`.

**Una pasada visual en oscuro** de `/`, `/calendario`, `/proyectos` y
`/perfil`, con los menús, el diálogo del calendario y el selector de proyecto
abiertos, es parte de la revisión de frontend: los componentes de
`components/ui` ya traen su variante `dark:`, y lo que no la traiga se ve ahí.

### Recorridos obligatorios de `e2e/profile-name-theme.spec.ts`

Dueño: `tests-slice7b`. **Tres tests, uno por recorrido**: cada uno abre una
sola sesión, con una persona propia que nace sin preferencias. Las respuestas
se esperan con `withServerAction`; las opciones del `Select` se buscan en
`page`, porque se dibujan en un portal. «Sin recargar» se afirma con la marca
en la ventana de `profile.spec.ts` (`markDocument`, `documentIsMarked`). Los
colores se comparan como estilo calculado: el fondo de `body` contra los dos
valores de `--background` de `globals.css`, en la forma en que el navegador
serializa `oklch`, que el spec fija al escribirse.

1. **El nombre** (criterios 10, 11, 13).
   1. Entrar a `/perfil` por el menú. El campo «Nombre» dice «Persona de
      prueba». Marcar la ventana.
   2. Escribir «Ana Prueba» y salir con `Tab`: el disparador del menú dice «AP»
      y el menú, «Ana Prueba», con la ventana todavía marcada.
   3. Escribir «Otro nombre» y `Esc`: el campo vuelve a «Ana Prueba».
   4. Borrar todo, escribir dos espacios y Enter: «No se pudo cambiar el
      nombre.» con «Escribí un nombre.», sin «Reintentar», y el campo, **con el
      foco todavía en él**, dice «Ana Prueba».
   5. Escribir « Ana María » (con un espacio en cada extremo) y Enter: el
      campo, con el foco todavía en él, dice «Ana María», y el menú, «Ana
      María» con «AM». Enter otra vez: no sale ningún pedido.
   6. Recargar: el campo y el menú dicen «Ana María».
2. **El tema** (criterios 8, 9, 10).
   1. Con el sistema emulado en oscuro y el tema en «Seguir al sistema»,
      `<html>` no tiene `dark` ni `light` y el fondo es el oscuro; con el
      sistema en claro, el claro, sin recargar.
   2. Marcar la ventana y elegir «Oscuro» con el sistema en claro: `<html>`
      tiene `dark`, el fondo es el oscuro y la ventana sigue marcada. Abrir el
      selector del tema: el fondo de su contenido es el oscuro.
   3. Volver a `/` por la navegación: el fondo sigue oscuro. Pedir `/` con
      `page.request`, que comparte las cookies: el `<html>` del HTML trae
      `dark`.
   4. En `/perfil`, con el sistema en oscuro, elegir «Claro»: el fondo es el
      claro.
   5. Elegir «Seguir al sistema»: el fondo es el oscuro; emular el sistema en
      claro: el claro, sin recargar.
   6. Elegir «Oscuro» con el sistema en claro y «Salir» por el menú de la
      cuenta: en `/login`, `<html>` no tiene `dark` y el fondo es el claro.
3. **Una falla al guardar el tema** (criterio 11).
   1. Cortar el pedido del cambio de tema **antes** de que llegue al servidor,
      con `route.abort()`, como el recorrido 5 del 7.
   2. Elegir «Oscuro»: el selector vuelve a «Seguir al sistema», `<html>` no
      tiene `dark`, y aparece «No se pudo cambiar el tema.» con «Reintentar».
   3. Quitar la ruta y reintentar: `<html>` tiene `dark`.
   4. Recargar: sigue oscuro.

**La membresía no activa no se prueba en e2e**, por lo mismo que en el 7: se
cubre en integración y en el test del componente.

## 8. Deuda conocida del slice

- **Una vez editado, el nombre no vuelve a seguir a Google** (D1). Escribir el
  de Google lo guarda como editado. Si hace falta, es un «Usar el de Google»
  que guarda nulo, en un slice aparte.
- **El correo no cambia (PF-06), tampoco si Google lo cambia.** La fila
  conserva el correo con que se creó, y el gancho de la sesión sigue
  comprobando ese. Si la empresa cambia la dirección de una persona, la cuenta
  sigue entrando por su `sub` con la dirección vieja en la fila.
- **Un correo ocupado no se libera.** Con el enlace implícito apagado, una
  cuenta de Google nueva con la dirección de una fila existente (una dirección
  reciclada, o la misma persona con otra cuenta de Google) no entra, y no hay
  pantalla para liberar la fila ni para enlazar la cuenta nueva: es una
  corrección a mano en la base hasta que la pantalla de equipo (fase 2) lo
  cubra. La página de error es la de Better Auth, sin texto propio.
- **PF-45 no tiene e2e**: el ingreso por Google no corre en Playwright. Lo
  cubren la configuración, el gancho y la composición de la sesión (criterio
  7), y el enlace (criterio 16).
- **Los nombres admiten caracteres de control** salvo el nulo, como los de
  proyecto. Hoy cada persona ve solo el suyo; cuando la fase 2 muestre nombres
  de otras personas, conviene revisar los de dirección del texto.
- **El contraste en oscuro no está auditado** con herramientas (WCAG 1.4.3 y
  1.4.11): los valores son los de shadcn, la paleta de proyectos son tonos 600
  que su comentario da por legibles en los dos fondos, y el bloque del
  calendario mezcla su relleno con el fondo. La pasada visual de §7 es la única
  verificación.
- **Los colores cambian con la respuesta del servidor**, no al elegir: entre el
  clic y la respuesta, el selector ya dice «Oscuro» y la pantalla sigue clara.
- **El layout raíz depende de la base** (ADR 0015): sin sesión legible no se
  dibuja ninguna pantalla. Sigue sin haber `global-error`; ya estaba anotado en
  el estado de la fase.
- **La regla de §5.5 no tiene código todavía**: la primera pantalla de la fase
  2 que muestre nombres de otras personas la construye.
