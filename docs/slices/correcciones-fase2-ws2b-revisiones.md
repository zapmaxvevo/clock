# WS2b: implementación y revisiones

Rama `fase2/ws2b-selector` desde `main` en `8466e94` (con WS2a), en el
worktree `/home/maxi/program/clock-ws2b` (fuera del repositorio). Contrato:
[`fase2-ws2b-selector.md`](fase2-ws2b-selector.md) en `0ce8fc6`. Sin ADR
nuevo; el slice cae dentro del
[ADR 0029](../adr/0029-el-formato-de-duracion-es-del-workspace-y-solo-cambia-lo-que-se-muestra.md)
(ver «La decisión 3 del ADR 0029»).

## Respuestas del usuario

Pendientes de registrar por el team-lead: la pregunta 2 (§11, los textos del
selector) frena a `frontend-dev`; la pregunta 1 (el MCP) no frena nada.

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
  que escribe el pedido. E4 suma `weekStart` a los dos y a
  `settingsColumnOf` (`service.ts`).
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
