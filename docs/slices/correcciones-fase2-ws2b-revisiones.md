# WS2b: implementación y revisiones

Rama `fase2/ws2b-selector` desde `main` en `8466e94` (con WS2a), en el
worktree `/home/maxi/program/clock-ws2b` (fuera del repositorio). Contrato:
[`fase2-ws2b-selector.md`](fase2-ws2b-selector.md) en `0ce8fc6`. Sin ADR
nuevo; el slice cae dentro del
[ADR 0029](../adr/0029-el-formato-de-duracion-es-del-workspace-y-solo-cambia-lo-que-se-muestra.md)
(ver «La decisión 3 del ADR 0029»).

## Respuestas del usuario

El 2026-10-21, las dos como la recomendación (anotadas en el contrato, en
`0b8ef69`): el MCP sigue devolviendo minutos enteros (pregunta 1), y las
opciones dicen «Completo (hh:mm:ss)» y «Compacto (h:mm)», sin el ejemplo de
una hora y media (pregunta 2).

## Backend

### Paso 1

`f560359`, el commit que fija tipos y firmas (§7, «Orden», paso 1): compila,
con `lint`, `typecheck` y `prettier --check` en verde. Trae los cuerpos
finales de lo que la firma no deja escribir sin ellos:

- `workspace/schema.ts`: `formatUnavailable`, `updateWorkspaceSettingInput`,
  `UpdateWorkspaceSettingInput`, `UpdateWorkspaceSettingResult`,
  `WorkspaceSettingsView.ready.durationFormat` y
  `WorkspaceSettingsActions.updateWorkspaceSetting`.
- **`WorkspaceSettings` pasó a `schema.ts`** y `service.ts` lo reexporta
  (§4.1): `UpdateWorkspaceSettingResult` lo usa, y `schema.ts` importándolo de
  `service.ts` armaba el ciclo `service → schema → service`. Ningún `schema.ts`
  del proyecto importa de un service.
- `workspace/repository.ts`, `service.ts` y `actions.ts`: lo de §4.2 a §4.4,
  completo. `getWorkspaceSettingsView` ya `async`; `page.tsx` con `await` y la
  action nueva en `actions`.
- `ProfileView.durationFormat`, de `timeSettingsOf` (D-WS2b-7).
- Las exportaciones: la celda `duration` en `seconds`,
  `ExportDocument.durationFormat`, `cellText(cell, durationFormat)` y los tres
  escritores leyendo el formato del documento (§5.8).
- Para que compile, sin cambiar lo que afirman: los fixtures de los tests de
  las exportaciones (`minutes: n` pasa a `seconds: n * 60`, y
  `durationFormat: "compact"` en cada documento) y, en archivos de
  `frontend-dev`, el `ready` y el doble de las actions de
  `workspace-settings-screen.test.tsx` y el `durationFormat: "compact"` de
  `profile-screen.test.tsx`. Cuatro casos de `document.test.ts` afirmaban la
  forma de la celda: pasan a los segundos de su fixture (`3599`, `0`,
  `36_059`, `60`).

### Paso 2

| Commit    | Qué                                                                                                                                       |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `abe239f` | Unidad: el esquema (criterio 3) y las exportaciones con el completo (criterio 10); `document.test.ts` con `formatDuration`                |
| `3eaa5a1` | Integración: criterios 1, 2 y 4 a 9 sobre el service y la action; el perfil con el formato de la sesión; la descarga en CSV y en Excel    |
| `480179c` | `xlsx.ts`: la celda de duración sale de un `Record<DurationFormat, …>` y no de `format === "compact"`, que la búsqueda de §9.6 no permite |

**Un desvío del reparto**: `document.test.ts` era de `frontend-dev` solo por
el import de `durationLabel` (§7). Se hizo en `abe239f`, junto con el caso de
`:527-532` que §9.1 pide pasar a `formatDuration` con los dos formatos: los
dos cambios son la misma línea, y así `frontend-dev` puede borrar
`durationLabel` sin tocar el archivo.

**El criterio 3 sobre el service** no tiene caso propio en
`settings.integration.test.ts`: el service recibe la entrada ya parseada (§4.4).
Lo cubren `schema.test.ts` (cada caso con su mensaje) y
`actions.integration.test.ts` (cada caso responde `validation` sin escribir).

### Lo que decide la implementación

- **`SettingsRead` y `SettingsColumn`** (`repository.ts`), como
  `PreferenceColumn` del perfil: la fila como la guarda la base y la columna
  que escribe el pedido. E4 suma `weekStart` a los dos y su caso a
  `settingChangeOf` (`service.ts`, desde `60026e9`; ver «Revisiones»).
- **El ancho de la columna de Excel**: 13 caracteres, en toda columna de una
  hoja con al menos una celda `duration` (en el documento real, la B de la
  cabecera y la «Duración» de cada tabla). `99999:59:59` son 11; las otras
  columnas quedan sin ancho, como hasta WS2b. El test afirma que el ancho
  entra los 11 caracteres más el margen de la celda; Excel no se abrió.
- **El ancho de «Duración» del PDF no cambia** (`0.12`). Medido con Noto Sans
  Regular del repositorio a 9 pt (`fontkit`, `layout().advanceWidth`):
  `99999:59:59` mide 51,16 pt y el texto de la columna tiene
  (595,28 − 2 × 36) × 0,12 − 2 × 3 = 56,79 pt. `pdf.test.ts` lo prueba
  dibujando: el PDF con una fila de `99999:59:59` en el completo tiene el
  mismo `lowestY` que el de una fila de `0:00`. Con el ancho en `0.10`
  (46,33 pt) el test falla.

### La decisión 3 del ADR 0029

D-WS2b-4: `getWorkspaceSettingsView` lee `workspace_settings.duration_format`
con `findWorkspaceSettings` y no el formato de la sesión. La decisión 3 del
ADR («ninguna pantalla lee `context.settings` ni la columna directo») rige el
formateo de duraciones, para que toda duración salga de `timeSettingsOf`.
`/configuracion` no formatea ninguna duración: lee el valor del ajuste que
edita, para mostrarlo en el selector y para ver si falta (WS-73), como el
perfil lee las preferencias que edita. Las «Consecuencias» del ADR dejan el
error de WS-73 a esta pantalla. La sesión, en cambio, resuelve la fila que
falta como `compact` a propósito (D-WS2a-2), y por eso la vista no puede
leerla: la mutación «la vista con el formato de la sesión» la mata el
criterio 8.

## Frontend

| Commit    | Qué                                                                                                                                           |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `42dbeaf` | `ChoiceSelect` pasa a `src/components/choice-select.tsx`, sin cambios de marcado; el perfil lo importa (§5.4)                                 |
| `de87191` | La sección «Registro de tiempo», `DurationFormatField`, los textos de §5.6 y `configuracion/error.tsx`; el test de la pantalla, dos secciones |
| `4823416` | El perfil con `durationFormatText(view.durationFormat)`; se borra `profileLabels.durationValue` (D-WS2b-7)                                    |
| `016c3af` | El reporte con el formato por props; se borra `durationLabel`; `durationColumnWidth` (D-WS2b-8)                                               |

### Lo que decide la implementación

- **El ancho del disparador** se exporta de `choice-select.tsx` como
  `choiceTriggerWidth`, y `TimeZonePicker` lo importa: un solo lugar (§5.4).
- **Los textos** son los de la respuesta a la pregunta 2: «Completo
  (hh:mm:ss)» y «Compacto (h:mm)», sin el ejemplo de una hora y media.

### La medida de la columna «Duración» (D-WS2b-8)

Medida en Chromium (Playwright) contra el build de la rama, con Geist
cargada, `text-sm` y `tabular-nums`, en una celda `px-3` de una tabla
`table-fixed` como la del reporte:

| Texto         | Ancho del texto |
| ------------- | --------------- |
| `99999:59:59` | 87 px           |
| `10080:00:00` | 87 px           |
| `1000:00:00`  | 78 px           |
| `00:00:00`    | 60 px           |
| `10080:00`    | 66 px           |

`w-24` deja 72 px de contenido (96 − 2 × 12) y `1000:00:00` ya no entra;
`w-28` deja 88 px, y `99999:59:59` entra en una línea, con 1 px de sobra.
`durationColumnWidth` da `w-28` con el completo y `w-24` con el compacto,
donde el texto más largo de cinco cifras (`10080:00`) mide 66 px. La celda
mide 36 px de alto con cualquiera de los textos: una línea. La e2e «con más
de diez mil horas la duración entra en un renglón» pasa con `w-28`.

### Mutaciones

Sobre `016c3af`, cada una sola, con `vitest` de `report/components`,
`profile` y `workspace/components`; todas mueren:

| Mutación                                           | La mata                                                                 |
| -------------------------------------------------- | ----------------------------------------------------------------------- |
| `ReportTreeRows` con `"compact"` fijo              | `report-tree.test.tsx` (3) y `report-view.test.tsx`, con el completo    |
| El total de `ReportView` con `"compact"` fijo      | `report-view.test.tsx`, «con el full, las filas, el total…»             |
| La escala del gráfico con `"compact"` fijo         | `report-chart.test.tsx`, «los rótulos de la escala en hh:mm:ss»         |
| La tabla de datos del gráfico con `"compact"` fijo | `report-chart.test.tsx` y `report-view.test.tsx`                        |
| `ReportView` pasa `"compact"` a `ReportChart`      | `report-view.test.tsx`, la tabla de datos con el completo               |
| `durationColumnWidth` con `w-24` en el completo    | `report-view.test.tsx`, el ancho y las dos tablas                       |
| La tabla del gráfico con `w-24` fijo               | `report-chart.test.tsx` y `report-view.test.tsx`                        |
| El perfil con `durationFormatText("compact")`      | `profile-screen.test.tsx`, PF-31                                        |
| El campo con el valor fijo                         | `duration-format-field.test.tsx` y `workspace-settings-screen.test.tsx` |
| `DURATION_FORMAT_ORDER` con el compacto primero    | `duration-format-field.test.tsx`, WS-15                                 |
| La pantalla sin «Registro de tiempo»               | `workspace-settings-screen.test.tsx` (3)                                |

La del campo sin `optimistic` (§9) la mata §9.5.3 en la e2e.

### La búsqueda de §9.6, en `016c3af`

Fuera de las carpetas exceptuadas da los llamadores de WS2a que lista la
búsqueda de backend, `cell-text.ts:21`, la excepción
`clock-field.tsx:177` y los seis del reporte con el formato recibido:
`report-view.tsx:88`, `:94`; `report-chart.tsx:37`, `:52`, `:86`;
`report-tree.tsx:69`. **Ningún `durationLabel(`** ni otro `"compact"` o
`"full"` literal.

### Corridas

| Corrida                  | Resultado                                          |
| ------------------------ | -------------------------------------------------- |
| `npm run lint`           | sin errores                                        |
| `npm run typecheck`      | sin errores                                        |
| `npx prettier --check .` | todo con formato                                   |
| `npm test`               | unidad 119 archivos, 2641 tests; `time-ar` 2 y 309 |

**E2e**, con un build propio de `016c3af` en un worktree aparte y `next start`
en `:3427`, sobre `clock_ws2b_front_e2e` (nueva, migrada con el `drizzle/`
de la rama). Filtrar por archivo no recorta `chromium`, que corrió entero:

- `setup`, `chromium` (con `workspace-settings.spec.ts`), `duration-full-setup`,
  `duration-full` (con `reports-duration.full.spec.ts` y
  `duration-format.full.spec.ts`) y `duration-full-teardown`: 268 verdes.
- `duration-switch`: **el primer test falla por el spec**: entra como admin, y
  el total del reporte de un admin suma las horas de todo el workspace
  («69:19:17» en lugar de «00:03:20»). Avisado a `e2e-tester`. Los otros
  cuatro, que el modo serial salteó, pasan con `--no-deps` y
  `--grep-invert`: 4 verdes. `e2e-tester` corrigió el spec en `41ffa14`: afirma
  la fila de la persona, con un nombre propio, en el agrupado por persona.

## Comprobaciones del árbol

**Los supuestos de backend de la tabla de §0**, en `0ce8fc6` (WS2a ya en
`main`): ninguna línea cambió. `schema.ts:67-99`; `time/index.ts:22`, `:80`;
`workspace/service.ts:53-61`, `:77-79`, `:284-299`, `:563-619`;
`workspace/repository.ts:73-83`, `:99-109`, `:175-186`, `:467-477`;
`workspace/schema.ts:141-191`; `workspace/actions.ts:60-79`;
`profile/service.ts:123-133`, `:184-218`, `:227-240`; `profile/schema.ts:45-69`;
`export/types.ts:13-15`; `document.ts:121`, `:124-130`; `cell-text.ts:19-22`;
`xlsx.ts:19`, `:62-66`; `pdf-layout.ts:78-82`, `:129`, `:137-140`;
`handler.ts:43`, `:77-87`, `:118-152`; `audit.ts:33`; `db/schema.ts:657-658`;
`failure.ts:48-51`; `mcp/tools.ts:69-70`, `:207`. Los de componentes y e2e
los revalidan sus dueños.

**La búsqueda de §9.6** en `480179c`, antes del trabajo de `frontend-dev`.
Fuera de `src/server/time/`, `src/server/db/schema.ts`,
`src/modules/workspace/` y `src/test/factories.ts`:

- los llamadores de WS2a: S1 (`time-entry/service.ts:220`); C1
  (`use-group-total.ts:39`); C2 (`entry-row.tsx:223`); C3
  (`manual-bar.tsx:154`, `:157`); C4 (`calendar-gestures.ts:314`); C5
  (`calendar-block.tsx:106`); C6 (`entry-dialog.tsx:569`, `:573`); C7
  (`timesheet-model.ts:120-121`); C8 (`:278`); C9 (`:401`);
- las exportaciones: `cell-text.ts:21`, con el formato del documento;
- la excepción, `clock-field.tsx:177`;
- **pendiente de `frontend-dev`**: `durationLabel` y su `"compact"`
  (`group-heading.tsx:21`, `:24`) y sus seis llamadores (`report-chart.tsx:28`,
  `:43`, `:71`; `report-view.tsx:62`, `:68`; `report-tree.tsx:54`).

Los comentarios que nombraban `durationLabel` en `document.ts:121` y
`pdf-layout.ts:129` nombran ahora `formatDuration` con el formato del
documento; `entry-size.ts` dice que con el completo la cota sigue debajo.

## Mutaciones

Las de backend de §9, cada una sola, sobre `3eaa5a1`; las de Excel y de
`cellText`, también sobre `480179c`. La integración corrió
`workspace/settings.integration.test.ts` (49 tests) en `clock_ws2b_back`; la
unidad, `src/modules/report/export` (146 tests).

| Mutación                                                           | La mata                                                                                                                                                                                   |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `updateWorkspaceSetting` sin `assertCanUpdateSettingsLocked`       | Criterio 5, los dos casos (le quitan el rol, lo desactivan); además «sin membresía en el workspace del actor…» y «un cambio de nombre y uno de formato a la vez…», que deja de trabarse   |
| `findWorkspaceSettings` en lugar de `lockWorkspaceSettings`        | Criterio 6, «quedan en fila detrás de la fila de ajustes…»: el corredor termina sin trabarse                                                                                              |
| Crear la fila si falta                                             | Criterio 8, «updateWorkspaceSetting lanza un error inesperado y no crea la fila»                                                                                                          |
| La vista con `context.settings.durationFormat` en lugar de la fila | Criterio 8, «la vista lanza para un owner…» y «…para un admin…»                                                                                                                           |
| `cellText` con `"compact"` fijo                                    | 11 tests de `export/`, los del completo: 1 de `cell-text.test.ts`, 2 de `csv.test.ts`, 3 de `document.test.ts`, 1 de `entry-size.test.ts`, 2 de `pdf-layout.test.ts` y 2 de `pdf.test.ts` |
| La celda de Excel del completo con los minutos truncados           | `xlsx.test.ts`, «con el completo, los segundos con `[hh]:mm:ss`; las horas no cambian»                                                                                                    |
| Excel sin el ancho de las columnas de duración                     | `xlsx.test.ts`, «con el %s, cada columna con una duración entra `99999:59:59`…», con los dos formatos                                                                                     |
| La columna «Duración» del PDF en `0.10` (y en `0.09`, `0.07`)      | `pdf.test.ts`, «`99999:59:59` entra en un renglón de «Duración»…». Comparando contra una fila de `00:00:00` sobrevivía con `0.07` (las dos se partían): el test compara contra `0:00`     |

## Corridas

En `480179c`, en un worktree aparte y limpio (el de la rama tenía cambios sin
confirmar de `e2e-tester` y `parity-analyst`), con el `node_modules` de la
rama:

| Corrida                    | Resultado                                             |
| -------------------------- | ----------------------------------------------------- |
| `npm run lint`             | sin errores                                           |
| `npm run typecheck`        | sin errores                                           |
| `npx prettier --check .`   | todo con formato                                      |
| `npm test`                 | unidad 118 archivos, 2618 tests; `time-ar` 2 y 309    |
| `npm run test:integration` | 41 archivos, 2232 tests, en `clock_ws2b_back` (nueva) |

## E2E

Las corridas de la e2e que el registro no tenía (revisión de tests, hallazgo
1), las de `e2e-tester` y las de la revisión de tests sobre `60bbb8f`, en
`clock_ws2b_rev_test` con `next start` en `:3514`:

- **La suite entera, sin `--no-deps`, en una base nueva**: 273 verdes. El
  orden fue `duration-full`, `duration-switch` y `duration-full-teardown`
  (criterio 15).
- **La misma suite en la base reusada**, con la fila de ajustes borrada por
  `psql` antes: 273 verdes; el setup restituyó la fila (D-WS2b-12) y
  `duration_format` quedó en `compact`.
- **La mutación del campo sin `optimistic`** (§9), en un build aparte: la mata
  §9.5.3, `duration-format.switch.spec.ts:199`, que espera «Compacto (h:mm)»
  mientras la respuesta está retenida y recibe «Completo (hh:mm:ss)».

Las corridas finales, después de las revisiones, están en «Corridas finales».

## Revisiones (2026-10-21)

Seis revisiones sobre `60bbb8f`: frontend, paridad, seguridad, backend, clean
code y tests. Todas aprobadas o aprobadas con cambios, sin bloqueantes ni
mayores. Se aplicaron todos los hallazgos; ninguno se rechazó.

| Hallazgo                                                                                                                                      | Revisión                             | Qué se hizo                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `report-chart.tsx` y `report-view.tsx` se importan entre sí por `durationColumnWidth`                                                         | frontend 1, paridad 1, clean code 1  | `7f86901`: `durationColumnWidth` y su tabla en `report/components/duration-column.ts`, que importan la vista, el gráfico y `report-view.test.tsx`. Se aparta de §5.7, que la ponía en `report-view.tsx`            |
| Ningún test afirma el foco en el disparador después de «Reintentar»                                                                           | frontend 2                           | `2f5e246`: `toBeFocused()` después de los dos «Reintentar» de §9.5.3. Sin `triggerRef.current?.focus()`, en un build aparte, el test falla en `:197` (`Received: inactive`)                                        |
| `updateWorkspaceSetting` compara, deja constancia y responde siempre sobre `durationFormat`; con `weekStart`, E4 compararía contra el formato | seguridad 1, backend 2, clean code 3 | `60026e9`: `settingChangeOf`, un `switch` exhaustivo sobre `input.key`, arma la columna de antes, la de después y si cambia; la comparación, la constancia y el resultado (`{ ...current, ...next }`) salen de ahí |
| El reexport `export type { WorkspaceSettings }` del service no lo usa nadie                                                                   | clean code 2                         | `60026e9`: borrado                                                                                                                                                                                                 |
| `csv.ts` y `pdf.test.ts`: el import de `@/server/time` entre dos relativos                                                                    | backend 1, clean code 10, tests 3    | `ed517f5`: en el grupo `@/`. Ningún otro archivo del slice tenía un import `@/` después de uno relativo                                                                                                            |
| `xlsx.ts` fija el ancho en cada celda `duration` de cada fila, y `DURATION_COLUMN_WIDTH` se llama como la clase de la pantalla                | clean code 8                         | `fece2c2`: `durationColumnsOf` junta las columnas con una duración de la cabecera y la sección, y el ancho se fija una vez por columna y hoja; la constante pasa a `DURATION_COLUMN_CHARS`                         |
| `handler.integration.test.ts`: el Excel en completo solo afirma que las celdas son `Date`                                                     | tests 2                              | `65fbb7f`: afirma el número de serie de cada celda (`200`, `0`, `100` y `100` segundos sobre 86 400). Con los minutos truncados en el completo, falla                                                              |
| Las dos `<section>` de `/configuracion` repiten el marcado                                                                                    | clean code 9                         | `f8ff23a`: `SettingsSection({ id, title, children })` local, con el mismo marcado                                                                                                                                  |
| `src/test/factories.ts`: el comentario de `setDurationFormat` dice «el selector de WS2b»                                                      | clean code 10                        | `94fe6f1`: «como lo guarda el selector de `/configuracion`»                                                                                                                                                        |
| `workspace.setup.ts`: `ensureWorkspaceSettings()` y `setDurationFormat("compact")` hacen lo que `restoreWorkspaceSettings("compact")`         | clean code 4                         | `3ded11e`: el setup llama a `restoreWorkspaceSettings("compact")` y `ensureWorkspaceSettings` se borra. D-WS2b-12 del contrato nombra `ensureWorkspaceSettings()`: el mecanismo es el mismo, con otra función      |
| `COUNTER`, `FULL_TOTAL`, los márgenes, `today()` y `skipNearMidnight()` copiados en los dos specs del formato                                 | clean code 5                         | `60bbd2d`: en `e2e/duration-format.ts`, que importan los dos. No es un spec: ningún `testMatch` lo toma                                                                                                            |
| `workspace-settings.spec.ts` rearma la expresión de `durationFormatControl`                                                                   | clean code 6                         | `f382a6a`: `durationFormatControl` acepta la región, y el spec la llama con `timeTrackingSection(page)`; `DURATION_FORMAT` deja de exportarse                                                                      |
| Exports que solo se usan en su archivo: `DURATION_NOT_SAVED`, `SETTINGS_LOAD_FAILED`, `cellTextLayout`, `CellTextLayout`                      | clean code 7                         | `f382a6a` (los dos de `settings-page.ts`) y `223f98c` (los dos de `reports-page.ts`): sin `export`                                                                                                                 |
| El registro no tiene las corridas de la e2e ni la mutación del campo sin `optimistic`                                                         | tests 1                              | La sección «E2E», con las corridas de la revisión, y las de «Corridas finales»                                                                                                                                     |
| `clock_ws2b_rev_sec` y `clock_ws2b_rev_back` pueden haber quedado sin borrar                                                                  | seguridad 2, backend (nota)          | Nada que hacer: al aplicar las revisiones ninguna de las dos existía en `clock-pg`                                                                                                                                 |

**Una mutación más**, después de `60026e9`: `unchanged` siempre falso. La
matan el criterio 2 en `settings.integration.test.ts` y en
`actions.integration.test.ts`, y el reintento de WS-62 (tres tests).

**Lo que dice la revisión de tests sobre `scratchpad/tree/`** (un `git
archive` encima de la carpeta de otro agente) no es de esta rama: queda para
el team-lead.

## Corridas finales

En `2f5e246`, con el árbol quieto, en un worktree aparte y limpio con
`node_modules` en enlaces duros, y cada cosa en una base nueva propia:

| Corrida                    | Resultado                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`             | sin errores                                                                                                         |
| `npm run typecheck`        | sin errores                                                                                                         |
| `npx prettier --check .`   | todo con formato                                                                                                    |
| `npm test`                 | unidad 119 archivos, 2641 tests; `time-ar` 2 y 309                                                                  |
| `npm run test:integration` | 41 archivos, 2232 tests, en `clock_ws2b_fin_int`                                                                    |
| `npm run build`            | compila, 21 rutas, con las variables de relleno del `ci`                                                            |
| E2e, base nueva            | 273 verdes, en `clock_ws2b_fin_e2e` con `next start` propio en `:3521` (build con las variables del servidor local) |
| E2e, base reusada          | 273 verdes, con la fila de ajustes borrada por `psql` antes; al terminar, `duration_format` en `compact`            |

El `build` con las variables del `ci` deja en el log los errores de Better
Auth al sembrar `oauth_resource` contra la base de relleno (`password
authentication failed`), y termina con código 0.
