# Fase 2, WS2b: formato de duración, el selector y el reporte

Contrato del slice WS2b de la fase 2. **Trae la segunda sección de
`/configuracion`, «Registro de tiempo», con el selector del formato de
duración**, que owner y admin cambian para todo el workspace, y **pasa al
formato del workspace lo que WS2a dejó fijo en compacto**: el reporte en
pantalla, la columna «Duración» de las tres exportaciones y el valor que el
perfil muestra en solo lectura. Con el slice llegan la primera lectura de
`workspace_settings` desde la pantalla y su `error.tsx` (WS-73). **Sin cambios
de esquema y sin migración.** Con WS2b desplegado, el owner pone producción en
completo con el selector (workspace P-07, D-WS2b-11).

- **Fuente:** [`workspace.md`](../parity/workspace.md), WS-03, WS-04, WS-14,
  WS-15, WS-17, WS-56, WS-61 … WS-67, WS-69, WS-73, §14 y P-07;
  [`perfil.md`](../parity/perfil.md), PF-02, PF-20, PF-31 y PF-32; TT-89 y TT-90
  de [`time-tracker.md`](../parity/time-tracker.md); D-R6-6, D-R6-9, D-R6-12 y
  D-R7-6 del núcleo de reportes; el [mapa de la fase 2](fase2-mapa.md), «WS2a» y
  «WS2b».
- **Lugar en el plan:** después de WS1 (en `main`) y de WS2a, que todavía no
  está en `main` (§0). Es el último slice de configuración que toca el formato;
  E4 suma después el primer día por defecto a «General» y a la misma action
  (D-WS2b-2).
- **Revisión:** `architecture-reviewer` lo aprobó con cambios (`507da74`); los
  siete están aplicados.
- **Decisiones de arquitectura: ningún ADR nuevo.** Lo que el slice decide cae
  dentro de ADR aceptados:
  - [ADR 0029](../adr/0029-el-formato-de-duracion-es-del-workspace-y-solo-cambia-lo-que-se-muestra.md)
    (aceptado el 2026-10-20): el formato es del workspace y solo cambia lo que se
    muestra. De ahí salen que «Horas» no cambie (D-WS2b-9), que una celda de
    Excel guarde lo que muestra, y que el MCP, que no muestra nada, siga
    devolviendo números (D-WS2b-10). **Su decisión 3** —«ninguna pantalla lee
    `context.settings` ni la columna directo»— rige el formateo de duraciones:
    toda duración se formatea con lo que arma `timeSettingsOf`. El editor del
    ajuste, `/configuracion`, lee su propia fila para mostrarla y para ver si
    falta (D-WS2b-4), y no formatea ninguna duración con ella. Es lo que prevén
    las «Consecuencias» del ADR: el error de WS-73 «es de esa pantalla (WS2b)».
  - [ADR 0012](../adr/0012-un-solo-juego-de-formatos.md): el reporte recibe el
    formato de su propia lectura, no del layout (D-WS2b-8).
  - [ADR 0009](../adr/0009-la-configuracion-del-workspace-viaja-en-el-recurso.md):
    el formato no decide acceso y no entra en `can()`.
  - [ADR 0025](../adr/0025-un-modulo-escribe-en-otro-por-su-service.md):
    `workspace_settings` es del módulo `workspace`, que la escribe con su
    repository.
  - [ADR 0028](../adr/0028-borrar-columnas-primero-el-codigo-despues-la-migracion.md)
    no se aplica: no hay migración.

Decisiones del usuario que el contrato da por tomadas: dos formatos, compacto
por omisión y decimal fuera (perfil P-01, WS-15); el contador del timer sigue en
`h:mm:ss` (perfil P-06); producción pasa al completo **con WS2b desplegado**
(workspace P-07); se acepta el diseño de `/configuracion`, con los textos de
WS-50 a WS-62 (workspace P-08); el ADR 0029, aceptado el 2026-10-20; las tres
respuestas de WS2a (`correcciones-fase2-ws2a-revisiones.md`, «Respuestas del
usuario»), entre ellas que una celda de la planilla conserva sus segundos
sueltos con el completo.

## Decisiones del contrato

**D-WS2b-1 — Cambian el formato owner y admin, con `workspace.settings.update`,
sin acción nueva (WS-14, WS-49).** Es la acción de toda la pantalla (D-WS1-1):
ver `/configuracion` y cambiar lo que ofrece van juntos, y ningún ajuste es solo
del owner. `can()` no cambia. Como el nombre, **la autoridad se relee bajo
bloqueo** con `assertCanUpdateSettingsLocked`
(`clock-ws2a/src/modules/workspace/service.ts:284-299`, D-WS1-2): un admin al
que le quitan el rol o lo desactivan mientras su pedido viaja no escribe. Los
otros tres roles no entran a la pantalla (WS-50) y un pedido armado a mano
responde `forbidden` (WS-58).

**D-WS2b-2 — Una action para los ajustes de `workspace_settings`, un ajuste por
pedido: `updateWorkspaceSetting({ key, value })` (WS-04, WS-56, WS-65).** La
entrada es una unión discriminada por `key`, como `updatePreferenceInput` del
perfil (`profile/schema.ts:45-69`). Hoy tiene un miembro, `durationFormat`;
**E4 suma `weekStart`** con WS-57, en la misma action y la misma fila. Así:

- «Un ajuste que no existe» (WS-56) es una `key` desconocida, y responde el
  mismo «Ese formato no está disponible.» que un valor fuera de la lista.
- Cada control guarda solo su clave (WS-04), y dos cambios de claves distintas
  no se pisan (WS-65). El nombre sigue en su action, porque vive en otra tabla
  (`workspace`) y tiene otras validaciones.

**Alternativa descartada**: una action por ajuste
(`updateDurationFormat`). E4 sumaría otra con el mismo cuerpo —bloqueo,
comparación, constancia— y WS-56 no tendría «un ajuste que no existe».

**D-WS2b-3 — La escritura: membresía, después la fila de ajustes `for no key
update`; el mismo valor no escribe; sin fila, error inesperado sin crearla
(WS-04, WS-65, WS-73).** En una transacción:

1. `assertCanUpdateSettingsLocked` (D-WS2b-1): la membresía de quien actúa
   `for share`.
2. `lockWorkspaceSettings`: la fila de `workspace_settings` del workspace de la
   sesión, `for no key update`. Pone en fila a dos cambios del mismo ajuste, y
   el segundo lee lo que el primero confirmó. `for no key update` y no `for
update`, como D-WS1-3: nadie apunta a `workspace_settings`, pero es la forma
   del módulo y no traba nada de más. **El orden es membresía y después la
   fila**, el de D-WS1-3 y el que E3 respeta. La lectura de la sesión
   (`findFirstWorkspace`, `left join` sin bloqueo) no espera.
3. **Sin fila** (WS-73): `throw new Error("Falta la fila de ajustes del
workspace.")`, que sale como `unexpected`. No la crea: un ajuste que aparece
   con valores de omisión ocultaría el problema (WS-73). **Con la pantalla
   abierta, quien elige un valor no ve el aviso del campo**: `handle` revalida
   `"/"` también con error, la respuesta trae la página otra vez, la vista lanza
   por la misma fila que falta (D-WS2b-4), y lo que se ve es el `error.tsx` de
   `/configuracion`, con «No se pudo cargar la configuración.» y «Reintentar».
4. **El mismo valor** no escribe ni deja constancia (WS-04); es lo que hace
   inofensivo «Reintentar» después de una respuesta perdida (WS-62).
5. Si no, `update workspace_settings set duration_format = $1` (`updated_at` lo
   pone `$onUpdate`, `schema.ts:88-91`) y `recordAudit` con
   `workspace.updateSetting`, `entity: "workspace_settings"`, `entityId` el id
   del workspace, `previousValue: { durationFormat: <anterior> }`, `nextValue:
{ durationFormat: <nuevo> }` y `...auditActorOf(actor)`. Con `weekStart`, E4
   deja la misma acción con su clave, como `profile.updatePreference`.

El valor anterior se lee con `resolveDurationFormat`
(`workspace/service.ts:77-79`): la columna es `not null` con `check`, así que
un valor fuera de lista lanza y no pasa.

**D-WS2b-4 — La vista lee la fila: una consulta, solo con permiso (WS-61,
WS-63, WS-73).** `getWorkspaceSettingsView` deja de salir solo de la sesión
(D-WS1-5) y pasa a `async`:

- **Sin `workspace.settings.update`**: `forbidden` con su motivo, sin consultar,
  como hoy.
- **Con permiso**: `workspaceRepository.findWorkspaceSettings(workspaceId)`,
  sin bloqueo. **Sin fila**, lanza, y `src/app/(app)/configuracion/error.tsx`
  muestra el error inesperado de la pantalla (WS-73). Con fila, `ready` con el
  nombre de la sesión y el formato leído, resuelto con `resolveDurationFormat`.

**Por qué no se usa el formato de la sesión**: la sesión resuelve una fila que
falta como `compact` (D-WS2a-2, ADR 0029), a propósito, para que nadie se quede
sin pantallas por un ajuste de presentación. La pantalla de configuración es la
única que tiene que ver la falta, y para eso lee la fila. Cuesta una consulta
por clave primaria, solo en `/configuracion` y solo para owner y admin.

**Cómo encaja con la decisión 3 del ADR 0029**, que dice que ninguna pantalla
lee `context.settings` ni la columna directo: esa decisión rige el formateo de
duraciones, para que todas salgan de `timeSettingsOf` y no haya dos lecturas
del formato con que se muestra una duración. `/configuracion` no formatea
ninguna duración: lee el valor del ajuste que edita, para mostrarlo en el
selector y para responder WS-73, como el perfil lee las preferencias que edita.
Las «Consecuencias» del mismo ADR dejan el error de WS-73 a esta pantalla. No
hace falta un ADR nuevo; el registro del slice lo anota al lado del ADR.

**D-WS2b-5 — Revalidación: el árbol entero; la caché no guarda el formato
(WS-64, WS-69).** La action usa las opciones del nombre, `{ path: "/", type:
"layout" }` (`workspace/actions.ts:63-69`):

- **Quien cambia el formato** ve las duraciones nuevas en la pantalla que abra
  después: desde una Server Function, `revalidatePath` «Updates the UI
  immediately» y con `"/"` y `layout` purga la caché del cliente
  (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md:19`,
  `:172-175`).
- **Las demás personas**, en su pedido siguiente (WS-64): cada página con sesión
  lee el workspace y su formato en cada pedido (`findFirstWorkspace`), Clock no
  tiene caché de datos (ningún `use cache`, `unstable_cache` ni `fetch`
  cacheado en `src/`), y las páginas dinámicas no quedan en la caché del cliente
  (`staleTimes.dynamic` es 0 desde Next 15, `staleTimes.md:42`). En `/`, la
  revalidación de cada 60 segundos del rastreador (P-11 del rastreador) lo trae
  sin navegar. Volver atrás con el navegador puede mostrar la página anterior
  hasta el pedido siguiente: es «lo abierto queda hasta el pedido siguiente» de
  WS-64 y WS-69.
- **El proveedor del layout puede quedar viejo** en una navegación del cliente
  (`display-formats.tsx:9-15`). Por eso cada pantalla que muestra duraciones lee
  su formato de su propia lectura: las tres del rastreador ya montan su
  proveedor (WS2a), y el reporte lo recibe por props de `ReportScreen`
  (D-WS2b-8).
- **Las exportaciones** responden con `Cache-Control: no-store`
  (`report/export/handler.ts:43`) y leen el formato de la sesión en cada pedido:
  la siguiente sale con el formato nuevo, y un archivo ya descargado no cambia
  (WS-69).

**D-WS2b-6 — El selector reusa el de las preferencias; las opciones son
«Completo (hh:mm:ss)» y «Compacto (h:mm)», en ese orden (WS-04, WS-15, PF-32).**

- **`ChoiceSelect` pasa a `src/components/choice-select.tsx`**, exportado y sin
  cambios de comportamiento: lo usan `PreferenceField` del perfil y el campo
  nuevo de la configuración. Hoy es una función privada de
  `profile/components/preference-field.tsx:204-286`, con su `triggerWidth`. Es
  el mismo criterio que movió el campo del nombre (D-WS1-8): un selector que
  guarda al cambiar, no abre sin permiso y no usa `disabled`, sin dos copias.
- **El campo** es `DurationFormatField`, en `workspace/components/`: la forma de
  `PreferenceField` —`useOptimistic` con el valor nuevo, `useAction` con
  `optimistic`, el aviso de dos partes con «No se pudo cambiar el formato de
  duración.» (WS-62) y «Reintentar» solo con `unexpected`, el foco al disparador
  antes de reintentar—. Elegir el valor que ya está no manda nada
  (`ChoiceSelect`, `:243-249`).
- **Los textos**: `nameOf` da «Completo» y «Compacto», y el ejemplo de cada
  opción es su patrón, `hh:mm:ss` y `h:mm`. `ChoiceSelect` los escribe «Completo
  (hh:mm:ss)» en el disparador y «Completo» con «(hh:mm:ss)» en gris en la
  lista, como «24 horas (13:00)» del formato de hora. Son los nombres de WS-15,
  PF-20 y PF-31, y los mismos que muestra el perfil (D-WS2b-7). **WS-15 decía
  además «cada opción con su ejemplo de la duración de una hora y media:
  `01:30:00` y `1:30`»**: con el patrón en el nombre, un segundo paréntesis
  sobra («Completo (hh:mm:ss) (01:30:00)»). Pregunta 2 (§11).
- **El orden** es el de WS-15, completo primero, que no es el de
  `DURATION_FORMATS` (`["compact", "full"]`): `DURATION_FORMAT_ORDER` en
  `workspace/components/labels.ts`.

**D-WS2b-7 — El perfil muestra el formato del workspace, con el mismo texto
(PF-02, PF-20, PF-31).** `ProfileView` suma `durationFormat`, tomado de
`timeSettingsOf(context).formats.duration`, sin consulta nueva. La pantalla
muestra `durationFormatText(view.durationFormat)` —«Completo (hh:mm:ss)» o
«Compacto (h:mm)»— con la nota de hoy, «Lo define el workspace.». Los nombres
viven una vez, en `workspace/components/labels.ts`, dueño del ajuste, y el
perfil los importa como el reporte importa `projectLabels`
(`report/components/group-heading.tsx:3`). `profileLabels.durationValue` se
borra.

**D-WS2b-8 — El reporte en pantalla recibe el formato por props, de su propia
lectura (WS-17, ADR 0012).** `ReportScreen` ya recibe `settings`
(`report-screen.tsx:10-16`, desde `reportes/page.tsx:16`) y pasa
`settings.formats.duration` a `ReportView`, que lo pasa a `ReportChart` y a
`ReportTree` (y este a `ReportTreeRows`). **Por props y no con
`useDisplayFormats`**: `ReportView` y `ReportChart` son componentes de servidor
y no leen contexto; un solo camino para los dos lados evita que la tabla y el
total salgan de lecturas distintas.

- **`durationLabel` se borra** (`group-heading.tsx:21-25`): cada llamador usa
  `formatDuration(seconds, durationFormat)`. Era la envoltura del `"compact"`
  fijo de D-WS2a-9. Los llamadores: el total y el facturable
  (`report-view.tsx:62`, `:68`), las filas (`report-tree.tsx:54`), y en el
  gráfico el nombre de cada barra, las líneas de la escala y la tabla de datos
  (`report-chart.tsx:28`, `:43`, `:71`). El comentario de truncado por cifra
  (§5.3 de R2a) pasa a `ReportView`. **Los dos comentarios que la nombran**
  —`export/document.ts:121` («truncados como `durationLabel`») y
  `export/pdf-layout.ts:129` («el texto de `durationLabel`»)— pasan a nombrar
  `formatDuration` con el formato del documento.
- **El ancho de la columna «Duración»** (`w-24` en `report-view.tsx:91` y
  `report-chart.tsx:59`) deja `72 px` de contenido. Con `text-sm` y cifras
  tabulares, `1000:00:00` ya no entra, y un reporte anual de producción pasa las
  mil horas. `durationColumnWidth(format)`, en `report-view.tsx`, da `w-24` con
  el compacto (sin cambio) y la clase que `frontend-dev` **mida en el
  navegador** para que `99999:59:59` entre en una línea con el completo
  (calculado, `w-28`). La usan las dos tablas.

**D-WS2b-9 — Las exportaciones: el documento lleva el formato y la celda de
duración lleva segundos; «Horas» no cambia (WS-17, WS-69, D-R6-9, ADR 0029).**

- **`ExportDocument` suma `durationFormat`**, que `exportDocumentOf` toma de
  `settings.formats.duration` (ya recibe `settings`, `document.ts:34-37`). Lo
  leen los tres escritores y la escala del gráfico del PDF, que no es una celda.
- **La celda `duration` pasa de `minutes` a `seconds`** (`types.ts:13`). Con el
  compacto el texto es el de hoy (`formatDuration` trunca al minuto, criterio 1
  de WS2a); con el completo, los segundos. `durationCells(seconds)`
  (`document.ts:124-130`) arma `{ kind: "duration", seconds }` y `{ kind:
"hours", minutes: Math.floor(seconds / 60) }`.
- **«Horas» sigue en decimal y de los minutos truncados**, con los dos formatos
  (D-R6-9; ADR 0029, decisión 8 y «Consecuencias»: cambiar el formato no cambia
  ningún número). Con el completo, una fila de `00:01:40` dice `0,01` en
  «Horas». La suma de las filas sigue en o debajo del total en las dos columnas
  (D-R6-6).
- **CSV y PDF**: `cellText(cell, durationFormat)` (`cell-text.ts:9-28`), sin el
  comentario de D-WS2a-9. `csvBytesOf` pasa el formato del documento a cada
  campo.
- **Excel** (`xlsx.ts:62-63`): con el compacto, lo de hoy —`floor(seconds / 60)
/ 1440` con `[h]:mm`—; con el completo, `seconds / 86400` con `[hh]:mm:ss`. La
  celda guarda lo que muestra, como pide D-R6-6. **Cada columna con una celda
  `duration` en su hoja lleva un ancho que entra `99999:59:59`**: con el ancho
  por omisión (8,43), Excel muestra `####` en un número que no entra, y con el
  completo pasa desde las mil horas. Vale para los dos formatos, porque no
  cuesta una rama.
- **PDF**: la escala del gráfico arma su rótulo con el formato
  (`pdf-layout.ts:137-140`). El ancho fijo de «Duración», `0.12`
  (`pdf-layout.ts:78-82`), deja unos 57 pt de texto en A4 con márgenes de 36 pt
  y relleno de 3 (`pdf.ts:20-24`); `99999:59:59` en Noto Sans de 9 pt mide unos
  52 pt. **Se mide con la fuente en `pdf.test.ts`** (criterio 10) y se ajusta
  solo si no entra.
- **El tope de bytes** (B4, S2) no cambia: `fittingDocumentOf` mide el CSV
  escrito (`handler.ts:77-87`), y la cota de `entry-size.ts` cuenta `0:00` como
  lo mínimo de «Duración», que sigue siendo una cota inferior con el completo
  (`00:00:00` pesa más). Su comentario lo dice.

**D-WS2b-10 — El MCP no cambia: sus herramientas devuelven números, no rótulos
(ADR 0029).** `toolEntryOf` devuelve `durationMinutes` y `list_entries`,
`totalMinutes`, los dos en minutos enteros truncados
(`src/modules/mcp/tools.ts:69-70`, `:207`). El formato decide cómo se muestra
una duración a una persona; la herramienta no muestra nada, y el asistente
redacta la respuesta. Respetarlo cambiaría el tipo de un campo según un ajuste,
y el `outputSchema` dejaría de ser estable. Lo que el completo deja a la vista
—que el asistente diga «2 h 13 min» donde la pantalla muestra `02:13:27`— no lo
resuelve el formato sino un campo en segundos, que sería un cambio del contrato
del MCP con su slice. Pregunta 1 (§11).

**D-WS2b-11 — Producción pasa a completo con el selector, no con una migración
de datos (P-07).** El mapa lo deja al contrato. Con el selector:

- **Queda constancia** de quién y cuándo (`workspace.updateSetting`), y es la
  verificación del slice en producción (§6.3).
- **Se deshace igual**: elegir «Compacto», sin migración inversa.
- **Una migración** correría en toda base que se migre —`clock`, `clock_test`,
  la rama `preview` de Neon, las bases de los agentes—, cambiaría lo que ven
  los e2e y los tests de integración que esperan el compacto por omisión, y
  pediría su propia transición. Para una fila, no compensa.

**Producción tiene dos workspaces**, «run0km» y «soybot»
(`correcciones-fase2-ws2a-revisiones.md:17-20`), y la sesión usa solo el más
viejo (`findFirstWorkspace`, `workspace/repository.ts:73-83`). El selector
cambia la fila de ese, que es el de la sesión del owner; la del otro no la lee
nadie y queda en `compact`. Las consultas de §6 filtran por el más viejo.

**D-WS2b-12 — Los e2e que cambian el formato corren en un proyecto propio,
`duration-switch`, después del completo y solos.** El formato es de todo el
workspace de los e2e (D-WS2a-12): cambiarlo desde la pantalla mientras corren
otros specs cambia lo que leen. Por eso:

- **`chromium`** (el compacto) prueba la sección sin escribir: el valor, las
  opciones, que elegir el mismo valor no manda nada, y los roles.
- **`duration-full`** (el completo, en paralelo) prueba lo que se lee con el
  completo: el reporte, las tres descargas, el perfil y el selector mostrando
  «Completo».
- **`duration-switch`**, nuevo, con `dependencies: ["duration-full"]` y
  `testMatch: /\.switch\.spec\.ts$/`, prueba lo que escribe: cambiar desde la
  pantalla, la vista optimista, la red, perder el rol y WS-73. Un solo archivo,
  `e2e/duration-format.switch.spec.ts`, en `mode: "serial"`. `chromium` y
  `duration-full` lo ignoran.
- **`workspace.setup.ts` restituye la fila de ajustes** antes de poner el
  compacto: `insert into workspace_settings (workspace_id) values (…) on
conflict do nothing` sobre el workspace de los e2e, con
  `ensureWorkspaceSettings()` de `e2e/database.ts`. Si una corrida se corta
  entre el `delete` de WS-73 (§9.5.5) y su `finally`, la base reusada queda sin
  fila, y `setDurationFormat("compact")` (`workspace.setup.ts:36`, un
  `updateOne`) lanzaría en la corrida siguiente.

**Lo que hace Playwright 1.63 con esto**, leído en
`node_modules/playwright/lib/runner/index.js`: las fases se arman con las
dependencias (`:6518-6527`), así que `duration-switch` corre en una fase propia,
después de que termina `duration-full` y sin nada en paralelo; y el
`teardown` de un setup espera a **todos** los proyectos que dependen de él,
también los transitivos (`buildDependentProjects`, `:2214-2232`, usado en
`:6510-6516`), así que `duration-full-teardown` corre después de
`duration-switch` y deja el workspace en `compact`. `e2e-tester` lo confirma con
la corrida entera (criterio 15).

## 0. Precondición de arranque

- **WS2a en `main`, en local.** El worktree `clock-ws2b` sale de `main` sin
  WS2a: hoy no tiene `DurationFormat`, `DisplayFormats.duration`,
  `WorkspaceContext.settings` ni `formatDuration(seconds, format)`, de los que
  depende todo el slice. WS2a está en un rebase sobre el MCP, que regenera su
  migración como `0020` (D-WS2a-11). **La implementación arranca cuando el
  team-lead mergea WS2a en `main`** y la rama de WS2b se rebasa sobre ese
  `main`; no hace falta que WS2a esté en producción para implementar. Este
  contrato puede revisarse antes.
- **La respuesta del usuario a la pregunta 2 (§11), antes del primer paso de
  `frontend-dev`**: decide los textos de `workspace/components/labels.ts`
  (§5.6), que usan el selector y el perfil, y lo que afirman sus tests y los
  e2e. La pregunta 1 no frena la implementación: con la recomendación, el MCP no
  se toca.
- **WS2b no corre `db:generate` ni trae migración.** Sus bases de prueba se
  migran con el `drizzle/` del árbol, que trae la `0019` del MCP y la `0020` de
  WS2a: bases propias (§6.5).
- **WS1 y el MCP ya están en `main`**: la pantalla, `updateWorkspaceName`,
  `canUpdateWorkspaceSettings`, `assertCanUpdateSettingsLocked` y
  `auditActorOf`.
- **Las citas** de `src/` y `e2e/` son del árbol de `clock-ws2a` (WS2a con WS1)
  al 2026-10-21, con el rebase sobre el MCP en curso; las del MCP, del árbol de
  `clock-ws2b`. Después del rebase, `backend-dev` revalida los números de línea
  de la tabla de abajo y anota en el registro los que cambien.

### Supuestos sobre el árbol

| Supuesto                                                                                                                                       | Dónde                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspace_settings.duration_format`, `text not null default 'compact'`, con `check`; `updated_at` con `$onUpdate`                             | `src/server/db/schema.ts:67-99`                                                                                                                                              |
| `DURATION_FORMATS = ["compact", "full"]`; `formatDuration(seconds, format)`                                                                    | `src/server/time/index.ts:22`, `:80`                                                                                                                                         |
| `WorkspaceContext.settings`; `resolveDurationFormat` es el único lugar del valor por omisión                                                   | `workspace/service.ts:53-61`, `:77-79`                                                                                                                                       |
| La sesión lee el formato del workspace más viejo, `left join`, sin bloqueo; `createWorkspace` crea la fila                                     | `workspace/repository.ts:73-83`, `:99-109`                                                                                                                                   |
| `canUpdateWorkspaceSettings`, `getWorkspaceSettingsView` (sin consultas) y `updateWorkspaceName` con la relectura y el bloqueo                 | `workspace/service.ts:284-299`, `:563-619`                                                                                                                                   |
| `lockActorMembership` (`for share`) y `lockWorkspaceName` (`for no key update`)                                                                | `workspace/repository.ts:175-186`, `:467-477`                                                                                                                                |
| Los textos, la vista y las actions de la configuración                                                                                         | `workspace/schema.ts:141-191`; `workspace/actions.ts:60-79`                                                                                                                  |
| La pantalla dibuja solo «General»; su test afirma una sola sección                                                                             | `workspace/components/workspace-settings-screen.tsx:25-55`; `workspace-settings-screen.test.tsx:30-38`                                                                       |
| La página no espera la vista; no hay `error.tsx` en `/configuracion`                                                                           | `src/app/(app)/configuracion/page.tsx:6-15`                                                                                                                                  |
| `timeSettingsOf` toma la duración de `context.settings`; `getProfileView` no consulta                                                          | `profile/service.ts:123-133`, `:184-218`                                                                                                                                     |
| El perfil muestra «Compacto (h:mm)» fijo                                                                                                       | `profile/components/labels.ts:30-33`; `profile-screen.tsx:93-97`; `profile-screen.test.tsx:169`; `e2e/profile.spec.ts:197`                                                   |
| `PreferenceField`, `ChoiceSelect` (privado) y `FixedSetting`                                                                                   | `profile/components/preference-field.tsx:79-179`, `:189-197`, `:204-286`                                                                                                     |
| El reporte: `durationLabel` en `"compact"`; sus llamadores; `ReportScreen` recibe `settings`; las columnas `w-24`                              | `report/components/group-heading.tsx:21-25`; `report-view.tsx:62`, `:68`, `:91`; `report-chart.tsx:28`, `:43`, `:59`, `:71`; `report-tree.tsx:54`; `report-screen.tsx:10-20` |
| Dos comentarios de las exportaciones nombran `durationLabel`                                                                                   | `export/document.ts:121`; `export/pdf-layout.ts:129`                                                                                                                         |
| Las exportaciones: la celda `duration` en minutos; `cellText` en `"compact"`; Excel con `[h]:mm`; el ancho fijo del PDF; la escala del gráfico | `export/types.ts:13-15`; `document.ts:124-130`; `cell-text.ts:19-22`; `xlsx.ts:19`, `:62-66`; `pdf-layout.ts:78-82`, `:137-140`                                              |
| La descarga lee `timeSettingsOf(session)` en cada pedido y responde `no-store`; el tope mide el CSV escrito                                    | `export/handler.ts:43`, `:77-87`, `:118-152`                                                                                                                                 |
| La cota de bytes cuenta `0:00`                                                                                                                 | `export/entry-size.ts:1-8`                                                                                                                                                   |
| El MCP devuelve minutos enteros                                                                                                                | `clock-ws2b/src/modules/mcp/tools.ts:59-78`, `:207`; `mcp/schema.ts:124`, `:163`                                                                                             |
| Las pantallas del rastreador montan su proveedor; el layout, el de base                                                                        | `tracker-screen.tsx:49-51`; `calendar-screen.tsx:48-50`; `timesheet-screen.tsx:51-53`; `src/app/(app)/layout.tsx:29`                                                         |
| El ancho del campo de duración mira `"full"` (WS2a)                                                                                            | `time-entry/components/clock-field.tsx:177`                                                                                                                                  |
| `handle` revalida también con error; un `ZodError` responde el mensaje de su primer problema                                                   | `src/server/action.ts`; `src/server/failure.ts:48-51`                                                                                                                        |
| La constancia guarda `JSON.stringify` del valor en una columna de texto                                                                        | `src/server/audit.ts:33`, `:43-44`; `src/server/db/schema.ts:657-658`                                                                                                        |
| Sin caché de datos en `src/`                                                                                                                   | ninguna coincidencia de `use cache`, `unstable_cache` ni `revalidateTag`                                                                                                     |
| Los proyectos de Playwright del completo; `setDurationFormat` (un `updateOne`) y `durationFormatOf`; el setup pone el compacto                 | `playwright.config.ts:53-93`; `e2e/database.ts:143`, `:153`; `e2e/workspace.setup.ts:32-36`                                                                                  |
| Los ayudantes de red de los e2e                                                                                                                | `e2e/network.ts:27` (`recordActions`), `:77` (`dropActionRequests`), `:98` (`loseActionResponses`), `:120` (`holdActionResponses`)                                           |
| Los e2e leen descargas: CSV, `.xlsx` con `exceljs` y el texto del PDF                                                                          | `e2e/reports-page.ts:307`, `:424-458`; `src/test/pdf`                                                                                                                        |
| Sin biblioteca de DOM en los tests de unidad: los componentes se prueban con `renderToStaticMarkup`                                            | `package.json`; `time-entry/components/entry-row.test.tsx:1-10`                                                                                                              |
| `PERIOD_TOTAL` del calendario solo reconoce el compacto (nota de la revisión de paridad de WS2a)                                               | `e2e/calendar-page.ts:77`                                                                                                                                                    |

## 1. Alcance

Cubre WS-14, WS-15, WS-17 (el reporte y las exportaciones), WS-56, WS-62 (el
formato), WS-64 (el formato), WS-66 (el cambio con un timer corriendo), WS-69,
WS-73, y PF-02, PF-20 y PF-31. Completa WS-03 (la segunda sección), WS-04 (el
selector), WS-61 y WS-63 (la pantalla lee la fila) y WS-65 (el formato y el
nombre a la vez). Cierra P-07 en producción (§6.3).

Entra:

- **La sección «Registro de tiempo»** con el selector (D-WS2b-6) y el `error.tsx`
  de `/configuracion` (D-WS2b-4).
- **`updateWorkspaceSetting`**: esquema, repository, service y action
  (D-WS2b-2, D-WS2b-3).
- **`ChoiceSelect` compartido** (D-WS2b-6).
- **El perfil** con el valor del workspace (D-WS2b-7).
- **El reporte en pantalla** y **las tres exportaciones** con el formato
  (D-WS2b-8, D-WS2b-9).
- **El proyecto `duration-switch`**, la restitución de la fila en el setup y los
  specs (D-WS2b-12).
- **El paso a completo de producción** y su verificación (§6).
- **Las correcciones de paridad** (§7).

Queda afuera: §12.

### Consecuencias sobre código ya entregado

| Archivo                                                                                                              | Qué cambia                                                                                                                                                                                    | Qué hay que volver a probar                                                                                        |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `workspace/schema.ts`, `repository.ts`, `service.ts`, `actions.ts`                                                   | Lo de §4, al final de cada archivo; `getWorkspaceSettingsView` pasa a `async` y suma `durationFormat`                                                                                         | los tests del módulo; `settings.integration.test.ts`                                                               |
| `src/app/(app)/configuracion/page.tsx`                                                                               | `await` de la vista; la action nueva en `actions`                                                                                                                                             | la e2e de WS1                                                                                                      |
| `workspace/components/workspace-settings-screen.tsx`, su test, `labels.ts`                                           | La segunda sección; el test de WS1 que afirma **una** sección pasa a afirmar dos, en orden                                                                                                    | `workspace-settings-screen.test.tsx`; `e2e/workspace-settings.spec.ts`                                             |
| `profile/components/preference-field.tsx`                                                                            | Importa `ChoiceSelect` de `src/components/`                                                                                                                                                   | `profile-screen.test.tsx`, `e2e/profile.spec.ts`, sin cambiar lo que afirman                                       |
| `profile/service.ts`, `profile/components/profile-screen.tsx`, `labels.ts`                                           | `ProfileView.durationFormat`; el texto del workspace; se borra `durationValue`                                                                                                                | `profile-screen.test.tsx`: el caso de `:169` sigue igual con `compact`                                             |
| `report/components/group-heading.tsx`, `report-view.tsx`, `report-chart.tsx`, `report-tree.tsx`, `report-screen.tsx` | Sin `durationLabel`; el formato por props; el ancho de la columna                                                                                                                             | sus tests, más los casos del completo                                                                              |
| `report/export/types.ts`, `document.ts`, `cell-text.ts`, `csv.ts`, `xlsx.ts`, `pdf-layout.ts`, `entry-size.ts`       | La celda en segundos; `ExportDocument.durationFormat`; `[hh]:mm:ss` y el ancho de columna en Excel; la escala del PDF; los comentarios de `document.ts:121`, `pdf-layout.ts:129` y de la cota | sus tests (los del compacto, sin cambiar lo que afirman salvo la forma de la celda); `handler.integration.test.ts` |
| `report/export/document.test.ts`                                                                                     | Importa `durationLabel` (`:4`, `:527-532`): pasa a `formatDuration`                                                                                                                           | el archivo                                                                                                         |
| `playwright.config.ts`                                                                                               | El proyecto `duration-switch`; `testIgnore` de `chromium` y de `duration-full`                                                                                                                | la e2e entera                                                                                                      |
| `e2e/workspace.setup.ts`, `e2e/database.ts`                                                                          | `ensureWorkspaceSettings()` antes de `setDurationFormat("compact")` (D-WS2b-12)                                                                                                               | la e2e entera, en una base nueva y en una que se reusa                                                             |

- **Sin cambio**: `can()` y `src/server/permissions/`; `src/server/db/` y
  `drizzle/`; `src/server/session.ts`; `src/server/time/`; el service, el
  repository y `schema.ts` del reporte; `export/handler.ts` y `pdf.ts` (salvo
  que la medición de D-WS2b-9 pida otro ancho, en `pdf-layout.ts`);
  `time-entry` entero; el MCP; `team`; `project`.
- **Ninguna e2e existente cambia lo que afirma**, salvo
  `workspace-settings.spec.ts` si afirma que hay una sola sección (§9.3).

## 2. Esquema y migración

**Ningún cambio de esquema y ninguna migración.** La columna, su `default` y su
`check` son de WS2a (`0020` después del rebase). `audit_log` guarda cualquier
acción. `drizzle/` no se toca.

## 3. Permisos

**Ninguna acción nueva** (D-WS2b-1). La unión `Action`, la tabla de roles y el
cuerpo de `can()` no cambian.

| Acción                      | Recurso             | Roles                | Se consulta                                                                                                                 |
| --------------------------- | ------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `workspace.settings.update` | `WorkspaceResource` | `["owner", "admin"]` | la vista (sin permiso, sin consulta) y `updateWorkspaceSetting`, dos veces: con la sesión y bajo el bloqueo de la membresía |

El comentario de `ResourceByAction` (`permissions/index.ts:60`) ya dice «ver y
cambiar todo lo que ofrece `/configuracion`»; no cambia. Leer el formato no es
una decisión de acceso: lo ve toda persona con sesión (ADR 0029).

## 4. Contrato de backend

### 4.1 Esquemas (`src/modules/workspace/schema.ts`)

Suma, al final del archivo:

```ts
// En workspaceSettingsMessages:
  /** WS-56: un formato fuera de la lista, o un ajuste que no existe (PF-35). */
  formatUnavailable: "Ese formato no está disponible.",

/**
 * D-WS2b-2: un ajuste de `workspace_settings` por pedido (WS-04, WS-65). Una
 * clave desconocida responde lo mismo que un valor desconocido (WS-56). E4
 * suma `weekStart` con WS-57.
 */
export const updateWorkspaceSettingInput = z.discriminatedUnion(
  "key",
  [
    z.object({
      key: z.literal("durationFormat"),
      value: z.enum(DURATION_FORMATS, {
        error: workspaceSettingsMessages.formatUnavailable,
      }),
    }),
  ],
  { error: workspaceSettingsMessages.formatUnavailable },
);
export type UpdateWorkspaceSettingInput = z.infer<typeof updateWorkspaceSettingInput>;

/** Los ajustes que quedaron, también si ya eran esos (WS-04). */
export type UpdateWorkspaceSettingResult = {
  readonly settings: WorkspaceSettings;
};

// WorkspaceSettingsView, la rama `ready`, suma:
      /** `workspace_settings.duration_format`, leído por la vista (D-WS2b-4, WS-63). */
      readonly durationFormat: DurationFormat;

// WorkspaceSettingsActions suma:
  readonly updateWorkspaceSetting: (
    input: UpdateWorkspaceSettingInput,
  ) => Promise<ActionResult<UpdateWorkspaceSettingResult, WorkspaceSettingsErrorCode>>;
```

- `WorkspaceSettings` (`{ durationFormat }`) es el tipo de `service.ts`
  (`:53-54`); si importarlo desde `schema.ts` arma un ciclo, se mueve a
  `schema.ts` y `service.ts` lo reexporta. Lo decide `backend-dev` con `tsc`.
- **La salida es un tipo y no un esquema Zod**, como
  `UpdateWorkspaceNameResult`: la escribe el servidor.
- `WorkspaceSettingsErrorCode` sigue siendo `ActionErrorCode`: `validation` sale
  del `ZodError` (`failure.ts:48-51`), `forbidden` de `ForbiddenError`.

### 4.2 Repository (`src/modules/workspace/repository.ts`)

Suma a `workspaceRepository`, al final:

```ts
/**
 * D-WS2b-4: la fila de ajustes del workspace, sin bloqueo, para la pantalla de
 * configuración. `undefined` si falta (WS-73).
 */
async findWorkspaceSettings(workspaceId: string): Promise<{ durationFormat: string } | undefined>;

/**
 * D-WS2b-3: la fila de ajustes, `for no key update`. Pone en fila a dos cambios
 * del mismo ajuste. `undefined` si falta (WS-73).
 */
async lockWorkspaceSettings(tx: Transaction, workspaceId: string): Promise<{ durationFormat: string } | undefined>;

/** D-WS2b-3: una columna de la fila, ya validada. `updated_at` lo pone `$onUpdate`. */
async updateWorkspaceSettings(
  tx: Transaction,
  workspaceId: string,
  values: { durationFormat: DurationFormat },
): Promise<void>;
```

Las tres filtran por el `workspaceId` de la sesión. `updateWorkspaceSettings`
recibe un objeto parcial para que E4 sume `weekStart` sin otra función.

### 4.3 Service (`src/modules/workspace/service.ts`)

```ts
/**
 * D-WS2b-4, WS-61, WS-63, WS-73: sin permiso, `forbidden` sin consultar; con
 * permiso, lee la fila de ajustes y lanza si falta, sin crearla.
 */
export async function getWorkspaceSettingsView(
  context: WorkspaceContext,
): Promise<WorkspaceSettingsView>;

/**
 * WS-04, WS-14, WS-56, WS-65, WS-73: D-WS2b-1 y D-WS2b-3. El mismo valor no
 * escribe. Deja `workspace.updateSetting` con el anterior y el nuevo.
 */
export async function updateWorkspaceSetting(
  actor: Actor,
  input: UpdateWorkspaceSettingInput,
): Promise<UpdateWorkspaceSettingResult>;
```

Por dentro de `updateWorkspaceSetting`, en este orden:

1. `canUpdateWorkspaceSettings(actor)`; si no, `throw new
ForbiddenError("workspace.settings.update")`, sin abrir la transacción.
2. `db.transaction`: `assertCanUpdateSettingsLocked(tx, actor)`.
3. `lockWorkspaceSettings(tx, actor.workspaceId)`; sin fila, `throw new
Error("Falta la fila de ajustes del workspace.")`.
4. `previous = resolveDurationFormat(row.durationFormat)`. Si es `input.value`,
   devuelve `{ settings: { durationFormat: previous } }` sin escribir.
5. `updateWorkspaceSettings` y `recordAudit` de D-WS2b-3; devuelve `{ settings:
{ durationFormat: input.value } }`.

Un `switch` sobre `input.key` arma la columna, como `columnOf` del perfil
(`profile/service.ts:227-240`), para que E4 sume su caso. El comentario del
paso 2 repite el de `updateWorkspaceName`: primero la membresía y después la
fila, el orden de E3.

### 4.4 Action (`src/modules/workspace/actions.ts`)

```ts
export async function updateWorkspaceSetting(
  input: UpdateWorkspaceSettingInput,
): Promise<ActionResult<UpdateWorkspaceSettingResult, WorkspaceSettingsErrorCode>>;
// handle(async (session) =>
//   service.updateWorkspaceSetting(session.actor, updateWorkspaceSettingInput.parse(input)),
//   settingsOptions)
```

Con `settingsOptions` (`actions.ts:63-69`), sin cambios: `{ path: "/", type:
"layout" }` y los mensajes `forbidden` y `unexpected` de la configuración. El
comentario de `settingsOptions` suma que el formato se ve en todas las pantallas
(WS-64).

### 4.5 Auditoría

| Acción                    | `entity`             | `entityId`       | `previousValue`                  | `nextValue`                   | Cuándo                  |
| ------------------------- | -------------------- | ---------------- | -------------------------------- | ----------------------------- | ----------------------- |
| `workspace.updateSetting` | `workspace_settings` | id del workspace | `{ durationFormat: <anterior> }` | `{ durationFormat: <nuevo> }` | solo si el valor cambia |

Con `...auditActorOf(actor)`, que suma `oauthClientId` si algún día la llama el
MCP (hoy no la llama). `recordAudit` guarda cada valor con `JSON.stringify` en
una columna de texto (`audit.ts:33`, `schema.ts:657-658`): en la base queda
`{"durationFormat":"compact"}`, sin espacios.

### 4.6 Las respuestas

| Situación                                                     | Código                 | Mensaje                                                      | Reintentar |
| ------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------ | ---------- |
| Cambió el formato                                             | ok                     | —                                                            | —          |
| El mismo formato                                              | ok, sin escribir       | —                                                            | —          |
| Un formato fuera de la lista, o que no es texto               | `validation`           | WS-56, «Ese formato no está disponible.»                     | no         |
| Una clave que no existe, o un pedido que no es un objeto      | `validation`           | WS-56                                                        | no         |
| Sin permiso, o lo perdió bajo el bloqueo; membresía no activa | `forbidden`            | WS-58, «No tenés permiso para hacer esto.»                   | no         |
| Falta la fila de ajustes (WS-73)                              | `unexpected`           | ver abajo                                                    | ver abajo  |
| Red o servidor                                                | `unexpected`           | «No se pudo guardar. Revisá la conexión y volvé a intentar.» | sí         |
| Sin sesión                                                    | redirección a `/login` | —                                                            | —          |

**Falta la fila con la pantalla abierta** (D-WS2b-3, paso 3): la action
responde `unexpected`, pero `handle` revalida `"/"` también con error, y la
respuesta trae la página otra vez: la vista lanza por la misma fila que falta y
se ve el `error.tsx` de `/configuracion`, con «No se pudo cargar la
configuración.» y su «Reintentar», no el aviso del campo. La fila sigue sin
existir.

## 5. Contrato de frontend

### 5.1 La página y su error

- `src/app/(app)/configuracion/page.tsx`: `requireSession()`, `await
getWorkspaceSettingsView(session)` y `WorkspaceSettingsScreen` con la vista y
  `{ updateWorkspaceName, updateWorkspaceSetting }`. Solo compone.
- `src/app/(app)/configuracion/error.tsx`, **nuevo**: como
  `src/app/(app)/perfil/error.tsx`, el `<h1>` «Configuración del workspace» y
  `ActionFeedback` con «No se pudo cargar la configuración.» y `onRetry={() =>
retry()}`. Nunca la pantalla a medias (WS-73).

### 5.2 La pantalla (`workspace/components/workspace-settings-screen.tsx`)

En `ready`, después de «General», una `<section
aria-labelledby="workspace-settings-time-tracking">` con su `<h2>` «Registro de
tiempo» y, adentro, `DurationFormatField` con `value={view.durationFormat}` y
`save={actions.updateWorkspaceSetting}`. Los estados `forbidden` no cambian. El
comentario del componente deja de decir que WS2b suma la sección.

### 5.3 El campo (`workspace/components/duration-format-field.tsx`, nuevo)

Cliente. Lo de `PreferenceField` (`preference-field.tsx:79-179`) para una sola
clave:

- `<Label htmlFor>` «Formato de duración» y `ChoiceSelect` con
  `options={DURATION_FORMAT_ORDER.map((value) => ({ value, example:
durationFormatPatterns[value] }))}`, `nameOf={(value) =>
durationFormatNames[value]}` y `canEdit` en verdadero (la vista `ready` ya es
  de quien puede cambiarlo).
- `useOptimistic` con el valor elegido; `useAction(save, { unreachableMessage:
workspaceSettingsMessages.unexpected, optimistic })`; `run({ key:
"durationFormat", value })`. Mientras viaja el pedido, el disparador muestra
  el valor elegido.
- Con falla, el control vuelve al valor anterior (la transición descarta la
  vista optimista) y aparece `ActionFeedback` con «No se pudo cambiar el formato
  de duración.» y el mensaje; «Reintentar» solo con `unexpected`, con el foco al
  disparador antes.

### 5.4 `ChoiceSelect` compartido (`src/components/choice-select.tsx`, nuevo)

El componente de `preference-field.tsx:199-286` —`choiceText`, `ChoiceSelect` y
su `triggerWidth`— movido sin cambios de comportamiento ni de marcado, y
exportado. `preference-field.tsx` lo importa y conserva `PreferenceField`,
`FixedSetting`, `ZoneOffset` y `TimeZonePicker`, que usa `triggerWidth`: o se
exporta también, o `TimeZonePicker` repite la clase; lo decide `frontend-dev`,
con un solo lugar para el ancho.

### 5.5 El perfil

`profile-screen.tsx:93-97`: `FixedSetting` con
`value={durationFormatText(view.durationFormat)}` y la nota de hoy. El
comentario de `profileLabels` sobre PF-02 («hoy tiene un solo valor») se
corrige.

### 5.6 Textos (`workspace/components/labels.ts`)

Con la respuesta a la pregunta 2 (§0, §11):

| Clave                                    | Texto                                        | Fuente       |
| ---------------------------------------- | -------------------------------------------- | ------------ |
| `workspaceSettingsLabels.timeTracking`   | «Registro de tiempo»                         | WS-03        |
| `workspaceSettingsLabels.durationFormat` | «Formato de duración»                        | WS-15        |
| `workspaceSettingsLabels.durationFailed` | «No se pudo cambiar el formato de duración.» | WS-62        |
| `workspaceSettingsLabels.loadFailed`     | «No se pudo cargar la configuración.»        | WS-73        |
| `durationFormatNames`                    | `{ full: "Completo", compact: "Compacto" }`  | WS-15, PF-20 |
| `durationFormatPatterns`                 | `{ full: "hh:mm:ss", compact: "h:mm" }`      | WS-15, PF-20 |
| `durationFormatText(format)`             | «Completo (hh:mm:ss)», «Compacto (h:mm)»     | PF-31        |
| `DURATION_FORMAT_ORDER`                  | `["full", "compact"]`                        | WS-15        |

`durationFormatNames` y `durationFormatPatterns` con `satisfies
Record<DurationFormat, string>`, como `timeFormatNames`. El comentario de
`general` deja de anunciar la segunda sección.

### 5.7 El reporte

D-WS2b-8. Firmas:

```ts
ReportView({ state, durationFormat }: { state: ReportReadyState; durationFormat: DurationFormat })
ReportChart({ chart, durationFormat })
ReportTree({ groups, durationFormat })
ReportTreeRows({ rows, onToggle, durationFormat })
/** `w-24` con el compacto; con el completo, la medida de D-WS2b-8. */
export function durationColumnWidth(format: DurationFormat): string;
```

`ReportScreen` pasa `settings.formats.duration`. `ChartBars` no cambia: recibe
los rótulos ya armados.

### 5.8 Las exportaciones

D-WS2b-9. Firmas:

```ts
// types.ts
| { readonly kind: "duration"; readonly seconds: number }
export type ExportDocument = { /* lo de hoy */ readonly durationFormat: DurationFormat };

// cell-text.ts
export function cellText(cell: ExportCell, durationFormat: DurationFormat): string;
```

`csv.ts`, `xlsx.ts` y `pdf-layout.ts` leen `document.durationFormat`;
`handler.ts` no cambia, porque `exportDocumentOf` ya recibe `settings`.

## 6. Despliegue y producción

Hechos que el contrato da por dados: Vercel despliega `main` a producción en
cada push y el build no corre migraciones; las corre el usuario con `!`.
**Producción tiene dos workspaces** (D-WS2b-11): toda consulta de esta sección
mira solo el más viejo, el de la sesión.

### 6.1 Condiciones antes del push de WS2b

1. **La `0019` del MCP y la `0020` de WS2a, corridas en producción**, con sus
   controles (§6 del contrato de WS2a), y **el código de WS2a desplegado** o en
   el mismo push. WS2b no suma ninguna condición de base: sin migración, el push
   de WS2b puede ser el mismo que el de WS2a si las dos migraciones ya están.
2. **La consulta previa**, con `!`:

   ```sql
   select w.name, s.duration_format, s.updated_at
   from workspace_settings s
   join workspace w on w.id = s.workspace_id
   where s.workspace_id = (select id from workspace order by created_at, id limit 1);
   ```

   Una fila, con el nombre del workspace de la sesión, en `compact`. **En
   `full`** no frena el push, pero se avisa al team-lead: alguien puso el
   completo a mano antes de WS2b y producción está mostrando el reporte en
   compacto. **Ninguna fila** es WS-73: se frena y se avisa.

### 6.2 El push y el humo, todavía en compacto

El team-lead pushea; Vercel despliega. **Nada que ya se veía cambia**:

1. **`/configuracion`** (el owner): «General» con el nombre y «Registro de
   tiempo» con «Formato de duración» en «Compacto (h:mm)». Abrir el selector
   muestra «Completo (hh:mm:ss)» y «Compacto (h:mm)», en ese orden. Cerrarlo sin
   elegir.
2. **`/perfil`**: «Compacto (h:mm)» con «Lo define el workspace.», como antes.
3. **`/reportes`** con el período de la semana pasada: el total, las filas y el
   gráfico en `h:mm`, como antes. **Descargar el CSV** de ese período y
   guardarlo: es la comparación de §6.3.
4. **Los logs de Runtime** de producción, quince minutos, sin errores nuevos.

### 6.3 P-07: el owner pasa producción a completo, y cómo se verifica

Con el humo de §6.2 en verde, el mismo día (D-WS2b-11):

1. **El owner elige «Completo (hh:mm:ss)»** en `/configuracion`. No aparece
   ningún aviso; el selector queda en «Completo (hh:mm:ss)».
2. **La base**, con `!`:

   ```sql
   select w.name, s.duration_format, s.updated_at
   from workspace_settings s
   join workspace w on w.id = s.workspace_id
   where s.workspace_id = (select id from workspace order by created_at, id limit 1);

   select w.name, a.action, a.entity, a.previous_value, a.next_value, u.email, a.created_at
   from audit_log a
   join workspace w on w.id = a.workspace_id
   join "user" u on u.id = a.actor_id
   where a.action = 'workspace.updateSetting'
     and a.workspace_id = (select id from workspace order by created_at, id limit 1)
   order by a.created_at desc
   limit 1;
   ```

   Lo esperado, para esa fila y solo para ella: `full`, con el `updated_at` del
   cambio; una constancia `workspace.updateSetting` sobre `workspace_settings`,
   con `previous_value` `{"durationFormat":"compact"}` y `next_value`
   `{"durationFormat":"full"}`, literales y sin espacios (§4.5), y el correo del
   owner. La fila del otro workspace no se mira: nadie la lee. **Otra cosa**
   frena: se vuelve a «Compacto» con el selector y se avisa al team-lead.

3. **Las pantallas**, con la sesión del owner:
   - `/`: las filas y los totales del día y de la semana en `hh:mm:ss`; con un
     timer corriendo, el contador sigue en `h:mm:ss` sin relleno y el total de su
     día avanza en `hh:mm:ss` (WS-66).
   - `/planilla` y `/calendario`: celdas, bloques y totales en `hh:mm:ss`.
   - `/reportes`, el mismo período de §6.2: el total, las filas, el nombre de
     las barras y la tabla de datos del gráfico en `hh:mm:ss`, cada uno en una
     línea.
   - `/perfil`: «Completo (hh:mm:ss)».
4. **Ningún número cambió** (ADR 0029): descargar otra vez el CSV del mismo
   período y compararlo con el de §6.2. Las mismas filas en el mismo orden, la
   columna «Horas» **idéntica** y «Duración» en `hh:mm:ss`, con los mismos
   minutos que el `h:mm` de antes. Descargar también el Excel (la columna
   «Duración» se ve sin `####`) y el PDF (la columna «Duración» en una línea).
5. **Otra persona** ve el completo en su pedido siguiente, sin aviso (WS-64):
   si hay alguien a mano, se le pide que recargue `/`. No es condición.
6. **Los logs de Runtime**, quince minutos, sin errores nuevos.

**Volver atrás** es elegir «Compacto (h:mm)»: deja su constancia y no toca
datos.

### 6.4 Reversión del código

- **Antes de revertir, el formato vuelve a `compact`** con el selector. Si se
  revierte WS2b con el workspace en `full`, el código de WS2a muestra el
  rastreador en completo y el reporte, las exportaciones y el perfil en compacto,
  que es el formato mezclado que el mapa quiere evitar. Si la pantalla no
  responde, con `!`:

  ```sql
  update workspace_settings
  set duration_format = 'compact', updated_at = now()
  where workspace_id = (select id from workspace order by created_at, id limit 1);
  ```

  Una fila actualizada. Sin constancia: se anota en el registro.

- Después, `git revert -m 1 <merge de WS2b>` y push, o Instant Rollback al
  deployment anterior: no hay migración, así que los dos son seguros. Las
  constancias quedan.

### 6.5 Previews y bases

- **Los agentes de WS2b prueban con bases propias**, nunca con `clock` ni
  `clock_test`: `clock_ws2b_back_test`, `clock_ws2b_front_test`,
  `clock_ws2b_e2e`. Su `global-setup` las migra con la `0019` y la `0020`; una
  base compartida que las reciba antes que producción no rompe nada (agregan),
  pero el orden de siempre es producción primero.
- **El preview de la rama** necesita la `0020` en la rama `preview` de Neon, que
  migra WS2a después de producción (§6.6 de WS2a). Cambiar el formato en un
  preview lo cambia para todos los que prueban esa base; los datos son
  sintéticos.

## 7. Reparto de archivos

### backend-dev

- **Primero, el commit que fija tipos y firmas**, y avisa a `frontend-dev` y a
  `e2e-tester`: `formatUnavailable`, `updateWorkspaceSettingInput`,
  `UpdateWorkspaceSettingInput`, `UpdateWorkspaceSettingResult`,
  `WorkspaceSettingsView.durationFormat`, `WorkspaceSettingsActions`, las
  firmas de §4.3 y la forma de la celda `duration` y de `ExportDocument` (§5.8);
  `getWorkspaceSettingsView` ya `async` (la página con `await`). Compila.
- `src/modules/workspace/schema.ts`, `schema.test.ts` (§4.1, §9.1).
- `src/modules/workspace/repository.ts` (§4.2).
- `src/modules/workspace/service.ts`, `settings.integration.test.ts` (§4.3,
  §9.2).
- `src/modules/workspace/actions.ts` y su `describe` en
  `actions.integration.test.ts` (§4.4, §9.2).
- `src/modules/profile/service.ts` (`ProfileView.durationFormat`) y su test de
  integración.
- `src/modules/report/export/`: `types.ts`, `document.ts` (con el comentario de
  `:121`), `cell-text.ts`, `csv.ts`, `xlsx.ts`, `pdf-layout.ts` (con el
  comentario de `:129`), `entry-size.ts` (el comentario) y sus tests;
  `handler.integration.test.ts` con el completo (D-WS2b-9).
- **El registro del slice**:
  `docs/slices/correcciones-fase2-ws2b-revisiones.md`, con la nota de la
  decisión 3 del ADR 0029 (D-WS2b-4).

### frontend-dev

Arranca con la pregunta 2 respondida (§0).

- `src/components/choice-select.tsx`, nuevo, y
  `profile/components/preference-field.tsx` (§5.4).
- `src/modules/workspace/components/`: `labels.ts`, `duration-format-field.tsx`
  y `duration-format-field.test.tsx` (nuevos), `workspace-settings-screen.tsx`
  y su test (§5.2, §5.3, §5.6, §9.1).
- `src/app/(app)/configuracion/page.tsx` y `error.tsx` (nuevo) (§5.1).
- `src/modules/profile/components/profile-screen.tsx`, `labels.ts` y
  `profile-screen.test.tsx` (§5.5).
- `src/modules/report/components/`: `group-heading.tsx`, `report-view.tsx`,
  `report-chart.tsx`, `report-tree.tsx`, `report-screen.tsx` y sus tests (§5.7);
  la medición del ancho de D-WS2b-8, anotada en el registro.
- `src/modules/report/export/document.test.ts`, solo el import de
  `durationLabel` (lo coordina con `backend-dev`, dueño del resto del archivo).

### e2e-tester

- `playwright.config.ts`: el proyecto `duration-switch` y los `testIgnore` de
  `chromium` y de `duration-full` (D-WS2b-12).
- `e2e/workspace.setup.ts` y `e2e/database.ts`: `ensureWorkspaceSettings()`,
  llamada antes de `setDurationFormat("compact")` (D-WS2b-12).
- `e2e/settings-page.ts`: la sección, el selector, sus opciones, el aviso del
  formato y el texto de `error.tsx`.
- `e2e/database.ts`: `deleteWorkspaceSettings()` y
  `restoreWorkspaceSettings(format)` para WS-73, sobre `FIRST_WORKSPACE`;
  `lastWorkspaceSettingAudit()` si el spec lee la constancia.
- `e2e/reports-page.ts`: los patrones del completo para el total, las filas y
  las descargas.
- Los specs de §9.3 a §9.5, nuevos; confirma que fallan antes de la
  implementación.
- La suite entera, con los specs de hoy sin cambiar lo que afirman (§1).

### parity-analyst

Correcciones fechadas, «_Corregido el <fecha>, WS2b_»:

- `workspace.md`: **WS-15** (las opciones son «Completo (hh:mm:ss)» y «Compacto
  (h:mm)», con el patrón como ejemplo y sin el de una hora y media, D-WS2b-6, si
  la pregunta 2 se responde así); **WS-17** (el reporte y las exportaciones con
  el formato desde WS2b; Excel con `[hh]:mm:ss`; «Horas» de los minutos
  truncados con los dos formatos); **WS-61** y **WS-63** (la pantalla lee la
  fila de ajustes: una consulta, D-WS2b-4); **WS-73** (probado en WS2b: la
  sesión ve el compacto y la pantalla, el error inesperado con «No se pudo
  cargar la configuración.», también si falta la fila con la pantalla abierta);
  la fila «_Falta_: formato de duración» de la §14 (columna de WS2a; la cambia
  la pantalla desde WS2b); **P-07** en la §17 (cumplida con el selector en el
  workspace de la sesión, D-WS2b-11; la fecha la pone el registro después de
  §6.3).
- `perfil.md`: **PF-31** (el perfil muestra el formato del workspace, «Completo
  (hh:mm:ss)» o «Compacto (h:mm)»); **PF-02** y **PF-20** solo si el texto
  cambia con la pregunta 2.
- `fase2-mapa.md`, en «WS2b»: P-07 se hace con el selector y no con una
  migración (D-WS2b-11); los e2e que escriben el formato corren en
  `duration-switch`, después de `duration-full` (D-WS2b-12); el MCP no cambia
  (D-WS2b-10).

### Lo que no toca nadie

`src/server/permissions/`, `src/server/db/`, `drizzle/`,
`src/server/session.ts`, `src/server/time/`, `time-entry`, `team`, `project`,
`mcp`, el service, el repository y `schema.ts` del reporte, `.github/` y
`CLAUDE.md`.

### Orden

0. La respuesta a la pregunta 2 (§0).
1. `backend-dev`: los tipos y las firmas, en un commit que compila. Avisa.
2. En paralelo: `backend-dev` con el service, la action y las exportaciones;
   `frontend-dev` con el selector, el perfil y el reporte; `e2e-tester` con el
   arnés y los specs; `parity-analyst` con las correcciones.
3. La búsqueda de §9.6; las revisiones; correcciones; la e2e entera en una base
   nueva **y** en una que se reusa.

## 8. Criterios de aceptación

1. **Cambiar el formato** (WS-14, WS-04): un admin pide `{ key:
"durationFormat", value: "full" }`; la fila queda en `full`, `updated_at`
   avanza y hay una constancia `workspace.updateSetting` sobre
   `workspace_settings`, con el id del workspace, `previous_value`
   `{"durationFormat":"compact"}`, `next_value` `{"durationFormat":"full"}` y el
   admin como actor. El owner, igual.
2. **El mismo valor no escribe** (WS-04): con `full` guardado, pedir `full`
   responde éxito con `{ settings: { durationFormat: "full" } }`, sin tocar la
   fila y sin constancia.
3. **Las validaciones** (WS-56): `value` `"decimal"`, `""`, `1`, `null` o
   ausente, `key` `"weekStart"`, `"foo"` o ausente, y un pedido que no es un
   objeto responden `validation` con «Ese formato no está disponible.» y no
   escriben.
4. **Quién** (WS-14, WS-50, WS-58): `project_manager`, `team_manager` y
   `member` reciben `forbidden` sin escribir; un owner y un admin inactivos,
   igual.
5. **La autoridad bajo el bloqueo** (D-WS2b-1, WS-52): un admin al que le quitan
   el rol, o al que desactivan, entre la sesión y el bloqueo, recibe `forbidden`
   sin escribir.
6. **Dos a la vez** (WS-65, D-WS2b-3): dos cambios en fila detrás del bloqueo de
   la fila terminan los dos con éxito; queda el segundo, y las constancias se
   encadenan. **Un cambio de nombre y uno de formato** a la vez quedan los dos,
   con sus dos constancias.
7. **Lo que no espera** (D-WS2b-3): con la fila de ajustes tomada `for no key
update`, `ensureWorkspaceContext` y un alta de horas terminan sin esperar.
8. **WS-73**: sin la fila de ajustes, `updateWorkspaceSetting` responde
   `unexpected` y la fila sigue sin existir; `getWorkspaceSettingsView` lanza
   para owner y admin, y devuelve `forbidden` sin consultar para los demás; la
   página muestra «No se pudo cargar la configuración.» con «Reintentar»; **con
   la pantalla abierta, elegir un valor lleva a esa misma página de error**, no
   al aviso del campo (§4.6); el resto de la aplicación sigue en compacto; la
   corrida siguiente de la e2e arranca con la fila restituida (D-WS2b-12).
9. **Revalidación** (WS-64, D-WS2b-5): la action llama a `revalidatePath("/",
"layout")` con éxito y con error.
10. **Las exportaciones** (D-WS2b-9, WS-17, WS-69): con el compacto, CSV, PDF y
    Excel dan lo de hoy; con el completo, «Duración» es `00:01:40` para una
    entrada de 100 segundos en el CSV y en el PDF, y en Excel la celda vale
    `100 / 86400` con `[hh]:mm:ss`; «Horas» es la misma con los dos formatos; la
    columna de duración de cada hoja tiene un ancho que entra `99999:59:59`; en
    el PDF, `99999:59:59` en la fuente y el cuerpo del documento mide menos que
    el ancho de texto de «Duración», y la escala del gráfico sigue el formato.
11. **El reporte en pantalla** (D-WS2b-8): con el compacto, lo de hoy; con el
    completo, el total, el facturable, las filas, el nombre de cada barra, las
    líneas de la escala y la tabla de datos en `hh:mm:ss`; con un total de más
    de cien horas, la celda de duración ocupa una línea.
12. **El perfil** (PF-31): «Compacto (h:mm)» o «Completo (hh:mm:ss)» según el
    workspace, con «Lo define el workspace.».
13. **La pantalla** (WS-03, WS-15, WS-63): «General» y «Registro de tiempo», en
    ese orden; el selector «Formato de duración» con el valor guardado y las dos
    opciones en el orden de WS-15; los estados sin permiso, sin ninguna de las
    dos secciones.
14. **El selector** (WS-04, WS-62, WS-64, WS-66): elegir el otro valor lo
    muestra en el disparador mientras viaja el pedido, guarda, y las pantallas
    siguientes muestran el formato nuevo; elegir el mismo no manda pedido; un
    pedido que no llega vuelve al valor anterior y muestra «Reintentar», que
    guarda; con un timer corriendo, el contador sigue en `h:mm:ss`.
15. **La e2e**: `duration-switch` corre después de `duration-full` y antes del
    teardown, solo, en una base nueva y en una que se reusa; al terminar,
    `durationFormatOf()` es `compact`.
16. **La búsqueda de §9.6** da exactamente lo que dice, con sus excepciones.
17. **Las correcciones de paridad** de §7 están, fechadas.

## 9. Plan de tests

Cada test nuevo tiene que poder fallar: se verifica con una mutación en una
copia, como en los slices anteriores. Las de este slice, como mínimo, con el
test que la mata:

| Mutación                                                        | La mata                                                   |
| --------------------------------------------------------------- | --------------------------------------------------------- |
| `updateWorkspaceSetting` sin la relectura bajo bloqueo          | §9.2, criterio 5                                          |
| Sin `lockWorkspaceSettings`                                     | §9.2, criterio 6                                          |
| Crear la fila si falta                                          | §9.2, criterio 8                                          |
| La vista con el formato de la sesión en lugar de la fila        | §9.2, criterio 8 (sin fila, la vista no lanza)            |
| `cellText` con `"compact"` fijo                                 | §9.1, `cell-text.test.ts` y `csv.test.ts` con el completo |
| La celda de Excel con minutos con el completo                   | §9.1, `xlsx.test.ts`                                      |
| `ReportTree`, `ReportView` o `ReportChart` con `"compact"` fijo | §9.1, el test de cada uno con el completo                 |
| El perfil con el texto fijo                                     | §9.1, `profile-screen.test.tsx` con `full`                |
| El campo sin la vista optimista (`run` sin `optimistic`)        | §9.5.3, el disparador mientras la respuesta está retenida |

### 9.1 Unidad

- `workspace/schema.test.ts`: el criterio 3, cada caso con su mensaje; los dos
  valores válidos.
- `workspace/components/duration-format-field.test.tsx`, nuevo, con
  `renderToStaticMarkup` (los tests de unidad no tienen DOM): con cada valor, el
  rótulo «Formato de duración» asociado al disparador por `htmlFor` e `id`, el
  texto del disparador («Completo (hh:mm:ss)» o «Compacto (h:mm)») y ningún
  aviso. Lo que solo pasa con interacción —la vista optimista, el aviso y
  «Reintentar»— lo prueba §9.5.3.
- `workspace-settings-screen.test.tsx`: el criterio 13 con
  `renderToStaticMarkup`, con `compact` y con `full`; **reemplaza** el caso de
  WS1 que afirma una sola sección (`:30-38`) por el de dos, en orden.
- `profile-screen.test.tsx`: el criterio 12 con los dos valores; el caso de
  `:169` sigue igual con `compact`.
- `report-view.test.tsx`, `report-tree.test.tsx`, `report-chart.test.tsx`: el
  criterio 11 con 100 segundos, `0:01` y `00:01:40`, y la clase de
  `durationColumnWidth` con cada formato.
- `export/cell-text.test.ts`, `csv.test.ts`, `document.test.ts`,
  `xlsx.test.ts`, `pdf-layout.test.ts`, `pdf.test.ts`: el criterio 10. En
  `document.test.ts`, el caso de `:527-532` pasa a `formatDuration` con los dos
  formatos. En `pdf.test.ts`, la medida con la fuente real.
- `entry-size.test.ts`: la cota con un documento en completo no pasa su CSV
  escrito.
- `src/components/choice-select.test.tsx`, si hace falta: el disparador con
  nombre y ejemplo, y sin ejemplo. Los tests del perfil cubren el resto sin
  cambios.

### 9.2 Integración (Postgres)

- **`workspace/settings.integration.test.ts`**, un `describe` nuevo:
  - Criterios 1 a 4 y 8 sobre el service, con `seedWorkspace`, `seedMember`,
    `setDurationFormat` y `auditFor("workspace_settings", workspaceId)`. El
    criterio 1 afirma `previous_value` y `next_value` tal como quedan en la
    columna, `{"durationFormat":"compact"}` y `{"durationFormat":"full"}`.
  - **Criterio 5**, con `queueBehindBarrier`: la barrera toma la membresía del
    admin `for no key update`; el corredor 1 le cambia el rol (y otro caso, el
    estado) y confirma; el corredor 2, `updateWorkspaceSetting`. Al abrir, el
    corredor 2 rechaza con `ForbiddenError`, la fila no cambió y no hay
    constancia. Mutación: sin la relectura, el corredor no se traba.
  - **Criterio 6**, con `queueBehindBarrier`: la barrera toma la fila de
    ajustes `for no key update`, con el workspace en `compact`; los corredores
    piden `full` y `compact`, en ese orden. Al abrir, la fila queda en
    `compact` y las constancias son `{ compact → full }` y `{ full → compact
}`. Mutación: sin `lockWorkspaceSettings`, el corredor que pide `compact`
    lee `compact` sin esperar y no escribe; `queueBehindBarrier` rechaza porque
    un corredor terminó sin trabarse, y la fila queda en `full`. El caso del
    nombre y el formato a la vez: los dos valores y las dos constancias.
  - **Criterio 7**, con `outcomeWhileHeld`: la barrera toma la fila de ajustes
    `for no key update`; `ensureWorkspaceContext` y un alta de horas devuelven
    `resolved`.
  - **Criterio 8**: un `delete` de la fila; la action, la vista con owner y con
    member, y que la fila siga sin existir.
- **`workspace/actions.integration.test.ts`**, un `describe` nuevo: cada fila de
  §4.6 con su código y su texto; `revalidatePath("/", "layout")` con éxito, con
  `forbidden` y con la fila que falta (criterio 9); sin sesión, a `/login` sin
  escribir; el reintento de una respuesta perdida —la action dos veces con
  `full`— deja **una** constancia.
- `profile/service.integration.test.ts`: `getProfileView` toma el formato de
  `context.settings` (dos contextos con las mismas preferencias y formatos
  distintos).
- `report/export/handler.integration.test.ts`: con el workspace en `full`, la
  descarga de CSV trae «Duración» en `hh:mm:ss` y «Horas» igual que con
  `compact` para las mismas entradas.

### 9.3 E2E, `chromium` (el compacto, sin escribir el formato)

En `e2e/workspace-settings.spec.ts` (WS1, en serie) o en uno nuevo:

1. **La sección** (criterio 13): un admin ve «General» y «Registro de tiempo»;
   el selector en «Compacto (h:mm)»; al abrirlo, las dos opciones en orden.
   Elegir «Compacto (h:mm)» no manda pedido (`recordActions`) y cierra la lista.
2. **Un member y un admin inactivo** no ven ninguna de las dos secciones (ya lo
   prueba WS1; se suma la segunda al afirmar que no hay campos).
3. **El reporte y el perfil en compacto**: los specs de hoy, sin cambios.

### 9.4 E2E, `duration-full` (el completo, en paralelo)

`e2e/reports-duration.full.spec.ts` y lo que haga falta en
`e2e/duration-format.full.spec.ts`, con personas propias y entradas con
segundos (`seedPersonEntries` acepta `"10:01:40"`):

1. **El reporte** (criterio 11): dos entradas de 100 segundos: las filas
   `00:01:40`, el total `00:03:20`, la tabla de datos del gráfico en
   `hh:mm:ss`. Con un total de más de cien horas sembrado (cinco entradas de
   21 h en días distintos), la celda de duración ocupa una línea (su alto es el
   de una fila de una línea).
2. **Las descargas** (criterio 10): CSV con «Duración» `00:01:40` y «Horas»
   `0,01`; Excel con la celda `100 / 86400`, `[hh]:mm:ss` y el ancho de la
   columna; PDF con `00:01:40` en el texto de la página.
3. **El perfil**: «Completo (hh:mm:ss)».
4. **`/configuracion`**: el selector en «Completo (hh:mm:ss)».

### 9.5 E2E, `duration-switch` (escribe el formato, solo)

`e2e/duration-format.switch.spec.ts`, `test.describe.configure({ mode: "serial"
})`. Cada test arranca con `setDurationFormat("full")` por SQL —el proyecto
corre solo— y entra con un admin propio (`setRole`).

1. **Cambiar desde la pantalla** (criterios 1 y 14, WS-64): elegir «Compacto
   (h:mm)»; `durationFormatOf()` es `compact`; ir a `/` muestra las filas
   sembradas en `0:01` y el total en `0:03`; volver a `/configuracion` y elegir
   «Completo (hh:mm:ss)»; `/reportes` muestra `00:03:20`.
2. **Con un timer corriendo** (WS-66): con un timer sembrado, cambiar a
   compacto; en `/`, el contador sigue en `0:0…:…` sin relleno y el total del
   día pasa a `h:mm`.
3. **La vista optimista y la red** (criterio 14, WS-62):
   - con `holdActionResponses`, desde «Completo», elegir «Compacto (h:mm)»: el
     disparador muestra «Compacto (h:mm)» mientras la respuesta está retenida
     (la vista optimista ya cambió); al soltarla, sigue en «Compacto (h:mm)» y
     `durationFormatOf()` es `compact`. Mata la mutación del campo sin
     `optimistic`, que deja el disparador en «Completo» hasta la respuesta;
   - con `dropActionRequests`, elegir el otro valor: el selector vuelve al
     anterior, el aviso trae «No se pudo cambiar el formato de duración.», el
     mensaje y «Reintentar»; al soltar, «Reintentar» guarda;
   - con `loseActionResponses`, «Reintentar» responde éxito y
     `durationFormatOf()` es el pedido.
4. **Perder el rol con la pantalla abierta** (WS-52): `setRole(email,
"member")`, elegir otro valor: la pantalla muestra WS-50, el enlace ya no
   está y `durationFormatOf()` no cambió.
5. **WS-73** (criterio 8), en un `try` con `restoreWorkspaceSettings("full")`
   en el `finally`:
   - **con la pantalla abierta**: abrir `/configuracion`,
     `deleteWorkspaceSettings()` y elegir «Compacto (h:mm)»: se ve «No se pudo
     cargar la configuración.» con «Reintentar», no el aviso del campo, y la
     fila sigue sin existir;
   - **al entrar**: `/configuracion` muestra lo mismo; `/` sigue entrando, en
     compacto.

   Si la corrida se corta antes del `finally`, la siguiente restituye la fila
   en `workspace.setup.ts` (D-WS2b-12). `e2e-tester` lo prueba una vez: borrar
   la fila por `psql` en la base reusada y correr la suite; el setup pasa.

**La receta para iterar en local** es la de §9.4 de WS2a con este proyecto:
`setDurationFormat` por `psql` y `npx playwright test --project duration-switch
--no-deps`. La corrida que vale para el registro es la entera, sin `--no-deps`
(criterio 15).

### 9.6 La búsqueda

Después de cada rebase, y va al registro:

```
rg -n 'formatDuration\(|durationLabel\(|"compact"|"full"' src scripts --glob '!**/*.test.*'
```

`durationLabel\(`, con el paréntesis: el campo `durationLabel` de
`TimeEntryView` (time-entry) no es la función del reporte y no se busca.

Fuera de `src/server/time/`, `src/server/db/schema.ts`,
`src/modules/workspace/` y `src/test/factories.ts`, tiene que dar
**exactamente**:

- los llamadores de WS2a (S1, C1 … C9 de su §5.6), con el formato de
  `TimeSettings` o de `useDisplayFormats()`;
- los del reporte y las exportaciones de este slice, con el formato recibido;
- **una excepción**: el `"full"` de `time-entry/components/clock-field.tsx:177`,
  el ancho del campo de duración de WS2a, que compara el formato del proveedor y
  no formatea.

**Ningún `durationLabel(`, y ningún otro `"compact"` ni `"full"` literal.** Los
comentarios de `export/document.ts:121` y `export/pdf-layout.ts:129` no los
encuentra la búsqueda; los comprueba la revisión de backend (D-WS2b-8).

### 9.7 Lo que no se prueba

- **WS-67 en vivo** (un borrador a medio escribir cuando otra persona cambia el
  formato): el borrador se formatea con `useDisplayFormats()` al dibujarse
  (WS2a), así que toma el formato nuevo cuando la pantalla recibe el valor. No
  hay un e2e de dos sesiones.
- **Que otra persona vea el cambio en su pedido siguiente** (WS-64): es la misma
  lectura por pedido que ya prueba la e2e del completo.
- **El humo y P-07 en producción**: los hace el usuario (§6).

## 10. Riesgos

- **Un lugar del reporte o de las exportaciones que se escapa** muestra `1:30`
  donde el resto muestra `01:30:00`. Lo cubren la búsqueda de §9.6, que exige
  que no quede ningún `"compact"` literal, y los tests del completo de cada
  lugar.
- **El selector cambia lo que ven los demás specs**: lo evita D-WS2b-12. Un spec
  futuro que cambie el formato va a `duration-switch`, nunca a `chromium` ni a
  `duration-full`.
- **Una corrida cortada en WS-73** deja la base reusada sin fila: la restituye
  `workspace.setup.ts` (D-WS2b-12).
- **Las consultas de producción sin filtro** mirarían también el workspace que
  la sesión no usa: §6 filtra por el más viejo.
- **Una columna que no entra con el completo**: la de la pantalla del reporte
  (D-WS2b-8), la de Excel (`####`) y la del PDF (D-WS2b-9). Cada una con su
  criterio.
- **«Horas» y «Duración» con el completo no se leen igual**: `00:01:40` y
  `0,01`. Es la regla de ADR 0029 (los números no cambian con el formato) y de
  D-R6-9; queda escrita en WS-17.
- **Revertir el código con el workspace en completo** deja formatos mezclados:
  §6.4 pide volver a compacto antes.
- **El rebase sobre WS2a**: `workspace/service.ts`, `repository.ts`,
  `schema.ts` y `actions.ts` cambian al final en los dos; WS2b suma al final.
  `playwright.config.ts` suma un proyecto después de los de WS2a.
- **E4 cambia la misma action y la misma fila**: suma su caso a la unión y a
  `updateWorkspaceSettings`; si E4 entra antes de que WS2b mergee, el segundo
  resuelve los conflictos de líneas vecinas.
- **`ChoiceSelect` movido** puede cambiar el perfil sin querer: lo frenan los
  tests del perfil sin cambios.

## 11. Preguntas para el usuario

1. **¿Las herramientas del MCP siguen devolviendo minutos con el completo?**
   Hoy `list_entries` y las demás devuelven `durationMinutes` y `totalMinutes`,
   números enteros truncados; el asistente arma la respuesta. Con producción en
   completo, la pantalla muestra `02:13:27` y el asistente puede decir «2 h 13
   min». Respetar el formato en la herramienta haría que un campo cambie de
   tipo según un ajuste. **Recomendación: no tocar el MCP en WS2b** (D-WS2b-10).
   Si molesta, sumar un campo `durationSeconds` al lado de `durationMinutes` es
   un cambio chico del MCP, con su propio slice.
2. **¿Las opciones del selector dicen «Completo (hh:mm:ss)» y «Compacto
   (h:mm)», sin el ejemplo de una hora y media?** WS-15 pedía además `01:30:00`
   y `1:30`. Con el patrón ya en el nombre, el ejemplo quedaría como un segundo
   paréntesis. Los nombres con el patrón son los que muestra hoy el perfil
   (PF-31) y los de la ayuda de Clockify. **Recomendación: sí, sin el ejemplo**
   (D-WS2b-6). La alternativa es «Completo (01:30:00)» y «Compacto (1:30)», como
   «24 horas (13:00)» del formato de hora, y cambiar también el texto del
   perfil. **Hace falta antes del primer paso de `frontend-dev`** (§0).

## 12. Fuera de alcance

- **El primer día de la semana por defecto** (WS-08, WS-57, WS-70): E4, en
  «General» y en la misma action (D-WS2b-2).
- **El decimal** (PF-20, perfil P-01): fuera, por ser de plan pago.
- **El contador del timer con el formato**: fuera (PF-22, perfil P-06).
- **El MCP con el formato o con segundos**: pregunta 1.
- **Los segundos sueltos de una celda de la planilla con el completo**:
  decidido en WS2a que no se tocan.
- **La fila de ajustes del workspace que la sesión no usa**: no se lee ni se
  cambia (D-WS2b-11).
- **La verificación contra el workspace de Clockify** (workspace P-09, puntos 6
  a 8): no es de este slice; si cambia la regla del compacto, es un ADR nuevo
  (ADR 0029, «Consecuencias»).
