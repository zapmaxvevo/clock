# Fase 2, WS2a: formato de duración, el dato y sus lectores

Contrato del slice WS2a de la fase 2. **Suma el formato de duración del
workspace** —una columna de `workspace_settings`, compacta por omisión— y hace
que **todo lo que muestra una duración en el rastreador, la planilla y el
calendario la respete**, en el servidor y en el navegador. El contador del timer
sigue en `h:mm:ss`. **Sin selector y sin cambio de formato en producción**:
nadie puede elegir el completo hasta WS2b, que trae el selector junto con el
reporte, las exportaciones y el perfil. Lo único que producción puede notar son
dos detalles de la edición (D-WS2a-6, D-WS2a-8). Una migración que agrega, la
`0019`, que se corre en producción antes del push.

- **Fuente:** [`workspace.md`](../parity/workspace.md), WS-14 … WS-17, WS-66 …
  WS-68, §14 y P-07; [`perfil.md`](../parity/perfil.md), PF-20 … PF-22 y la
  tabla de la §10; TT-19 y TT-21 de
  [`time-tracker.md`](../parity/time-tracker.md); TS-24 … TS-27 y TS-36 de
  [`timesheet.md`](../parity/timesheet.md); CAL-21 de
  [`calendario.md`](../parity/calendario.md); el
  [mapa de la fase 2](fase2-mapa.md), «WS2a», «WS2b» y §4.
- **Lugar en el plan:** después de WS0 (el árbol: arranca desde un `main` con la
  `0018`, ADR 0028, regla 2) y en paralelo con WS1, que no está en `main`
  (§0). WS2b depende de este y de WS1.
- **Revisión:** `architecture-reviewer` lo aprobó con cambios; los diez están
  aplicados.
- **Decisiones de arquitectura:**
  - **[ADR 0029](../adr/0029-el-formato-de-duracion-es-del-workspace-y-solo-cambia-lo-que-se-muestra.md),
    nuevo, propuesto**: el formato de duración es del workspace, viaja en la
    sesión y solo cambia lo que se muestra; fija la regla del compacto (WS-16,
    WS-68). Extiende el [ADR 0012](../adr/0012-un-solo-juego-de-formatos.md),
    que anticipaba el caso. Pregunta 1 (§11).
  - El [ADR 0009](../adr/0009-la-configuracion-del-workspace-viaja-en-el-recurso.md)
    no cambia: el formato no decide acceso y no entra en `can()`.
  - El [ADR 0028](../adr/0028-borrar-columnas-primero-el-codigo-despues-la-migracion.md)
    no se aplica: la `0019` agrega, y va con la regla de siempre —migrar antes
    del push—.
  - Los [ADR 0018](../adr/0018-lo-que-escribe-una-celda-se-calcula-en-instantes.md)
    y [0019](../adr/0019-escribir-una-celda-fija-su-valor.md) no cambian: una
    celda de la planilla escribe lo mismo con los dos formatos (D-WS2a-8).

Decisiones del usuario que el contrato da por tomadas: compacto por omisión,
completo como la otra opción y decimal fuera (perfil P-01, workspace WS-15); el
contador del timer sigue en `h:mm:ss` (perfil P-06); producción pasa al completo
(workspace P-07), **con WS2b** y no con este slice; el orden del mapa (WS2a sin
cambio visible, el selector y el reporte en WS2b).

## Decisiones del contrato

**D-WS2a-1 — La columna: `workspace_settings.duration_format`, texto con
`check`, `not null`, `compact` por omisión (WS-15, ADR 0029).** Los valores son
`compact` y `full`, los nombres de la API de Clockify (`COMPACT`, `FULL`) en
minúscula, como `24h` y `dd/MM/yyyy` en `user_preference`. **Texto con `check` y
no un `pgEnum`**: es la forma de las columnas de formato que ya existen
(`schema.ts:153-160`), y sumar un valor —el decimal, si algún día entra— es
cambiar un `check` y no agregar un valor a un tipo. Los valores viven una vez,
en `DURATION_FORMATS` de `src/server/time`, y el `check` los repite, como
`TIME_FORMATS` y `user_preference_time_format_known`. **Ninguna fila cambia**:
la de producción toma `compact` por el `default`, que es lo que hoy se ve.

**D-WS2a-2 — El formato viaja en la sesión, en la misma consulta que el
workspace (ADR 0029, decisión 2).** `findFirstWorkspace` suma un `left join` a
`workspace_settings` y devuelve el workspace y `durationFormat`;
`createWorkspace` devuelve lo mismo, con lo que devuelve el alta de la fila de
ajustes. `WorkspaceContext` suma `settings: { durationFormat }`, armado por
`resolveDurationFormat` del módulo `workspace`, **único lugar que aplica el
valor por omisión**:

- **Sin fila de ajustes** (`null` del `left join`): `compact`, sin crear la fila
  ni escribir nada. No pasa —la fila nace con el workspace (WS-73)—, y si
  pasara, la sesión no se cae por un ajuste de presentación: el error de WS-73
  es de la pantalla de configuración, que lo prueba WS2b (D-WS1-7).
- **Un valor fuera de `DURATION_FORMATS`**: lanza `RangeError`, como
  `knownChoice` del perfil (`profile/service.ts:62-76`). El `check` lo impide.

No hay consulta nueva por pedido: la lectura del workspace es la que ya corre en
cada pedido con sesión (`workspace/service.ts:165-175`). `entryWorkspaceIdOf`
lee `current?.workspace.id`.

**D-WS2a-3 — El formato entra a `DisplayFormats` y se resuelve en
`timeSettingsOf` (ADR 0012, ADR 0029).** `DisplayFormats` suma `duration:
DurationFormat`; `timeSettingsOf` lo toma de `context.settings.durationFormat`,
no de las preferencias. **Ningún consumidor lee `context.settings`**: lo reciben
en el `TimeSettings` de su pantalla (servidor) o en `useDisplayFormats()`
(navegador). Los proveedores no cambian: el del shell
(`src/app/(app)/layout.tsx:25`) y los de las tres pantallas
(`tracker-screen.tsx:51`, `calendar-screen.tsx:50`, `timesheet-screen.tsx:53`)
ya pasan el objeto entero.

**D-WS2a-4 — Una sola función: `formatDuration(seconds, format)`, con los dos
argumentos obligatorios.** Hoy recibe minutos (`src/server/time/index.ts:63-69`).
Pasa a recibir **segundos** y el formato:

- `compact`: `h:mm`, con los segundos truncados y las horas sin relleno. **Para
  todo valor da lo mismo que la función de hoy** con los minutos truncados:
  `formatDuration(m * 60 + s, "compact")` es el texto de hoy con `m`, para todo
  `m ≥ 0` y `0 ≤ s < 60` (criterio 1). Por eso producción no cambia.
- `full`: `hh:mm:ss`, cada parte con dos cifras como mínimo: `00:01:40`,
  `01:30:00`, `100:00:00`.
- Un valor negativo da cero, como hoy; un valor con decimales se trunca.

**El cambio de unidad es la trampa**, y lo que la cubre es que el formato sea
obligatorio: todo llamador deja de compilar hasta que se lo visita, y cada
consumidor se prueba con un valor que tiene segundos (100 s: `0:01` y
`00:01:40`), así uno que siga pasando minutos falla. Cada llamador de hoy queda
así:

- **Los que tienen segundos los pasan enteros, sin dividir**: `toView`
  (`formatDuration(seconds, …)` en lugar de `Math.floor(seconds / 60)`), el
  total de grupo, el bloque del timer y los totales de la planilla, y
  `report/components/group-heading.tsx:22`, que pasa a
  `formatDuration(seconds, "compact")`.
- **Los que tienen minutos enteros pasan `minutes * 60`**: los borradores, la
  celda de la planilla, el arrastre y `report/export/cell-text.ts:20`, que pasa
  a `formatDuration(cell.minutes * 60, "compact")`.

**D-WS2a-5 — La regla del compacto: el formato solo cambia lo que se muestra
(WS-16, WS-68, ADR 0029).** Toda suma es de segundos exactos y cada rótulo
trunca una sola vez, en la unidad de su formato. Una fila muestra sus segundos
truncados; un total, la suma exacta truncada. Con el compacto, dos entradas de
1 minuto 40 segundos muestran `0:01` cada una y su día `0:03`; con el completo,
`00:01:40`, `00:01:40` y `00:03:20`. Es la regla que ya aplica el código
(`use-group-total.ts:20-40`, `timesheet-model.ts:111-118`), escrita; ningún
total cambia. `parity-analyst` la escribe en WS-16 y WS-68 (§7).

**D-WS2a-6 — Lo que se teclea no depende del formato, y acepta lo que el
completo muestra (PF-21, WS-67, TT-19).** `parseDurationInput`
(`src/server/time/index.ts:735-764`) suma la forma `h:mm:ss`: una o dos cifras
de horas y dos partes de una o dos cifras, minutos y segundos entre 0 y 59, con
los segundos truncados —los campos de duración escriben minutos enteros, como ya
pasa con `1h30m1s`—, y el mismo tope de menos de 24 horas (TS-26). Sin esto, un
campo que muestra `01:30:00` rechaza su propio valor en cuanto se lo edita. Vale
con los dos formatos: **es uno de los dos cambios que se pueden observar en
producción** —el otro es el de D-WS2a-8, mientras viaja la escritura de una
celda—, y es una forma más que se acepta, no una que cambia de significado.

| Texto                      | Minutos |
| -------------------------- | ------- |
| `1:30:00`, `01:30:45`      | 90      |
| `1:30:5`                   | 90      |
| `0:00:59`                  | 0       |
| `23:59:59`                 | 1439    |
| `24:00:00`                 | `null`  |
| `1:60:00`, `1:30:60`       | `null`  |
| `1::30`, `:30:00`, `1:30:` | `null`  |

`0:00:59` da cero, y la barra y la celda rechazan el cero como hoy (TT-21,
TS-27). Las formas de hoy (`30`, `2h`, `2:00`, `2.75`, `2,75`, `1h30m1s`) no
cambian.

**D-WS2a-7 — Los consumidores son de tres clases, y solo una se edita (§5).**

- **Los que formatean una duración** —`formatDuration` en el servidor y en el
  navegador— reciben el formato de `TimeSettings` o de `useDisplayFormats()`:
  la fila del servidor, los totales de grupo, los borradores, el arrastre, el
  bloque del timer en el calendario y la planilla entera. Son diez lugares
  (§5.1, §5.2).
- **Los que muestran el rótulo que armó el servidor** (`durationLabel` de
  `TimeEntryView`) no se editan: siguen al servidor (§5.3).
- **El contador del timer** (`formatElapsed`) no es una duración que se suma
  sino un transcurrido, y no cambia (§5.4, PF-22, WS-66).

**El bloque del timer en el calendario sigue el formato.** Hoy muestra el
transcurrido con `formatDuration` en `h:mm` (`calendar-block.tsx:105-107`,
CAL-21), no con el contador: es la duración del bloque, como la de los demás,
y con el completo avanza cada segundo. El contador de la barra del timer
(`timer-bar.tsx:119`) y el «Fin: en curso» del diálogo del calendario
(`entry-dialog.tsx:636`, `entry-dialog-body.tsx:109`) siguen en `h:mm:ss`.
`parity-analyst` corrige CAL-21 (§7).

**D-WS2a-8 — La planilla escribe minutos con los dos formatos; con el completo
muestra los segundos que tiene (TS-24, TS-36, ADR 0018, ADR 0019).** Una celda
escribe lo mismo que hoy: el pedido lleva minutos y el servidor compara
`cellMinutes` (`time-entry/timesheet-cell.ts:25-31`, `:102-145`), que no se
toca. Lo que cambia es lo que la celda muestra:

- **El rótulo de la celda sale de sus segundos**, no de sus minutos:
  `formatDuration(cell.seconds, format)`. Con el compacto es lo mismo que hoy.
- **Lo que muestra mientras una escritura viaja imita al servidor**, para que
  con el completo no salte al llegar la foto. El servidor deja la celda en
  `minutos × 60` si tenía cero o una entrada cerrada —crea, o mueve el fin de la
  única desde su inicio—, y en `segundos + (minutos − minutos de la foto) × 60`
  si tenía varias —agrega o achica la que empieza más tarde por la diferencia en
  minutos (TS-34)—. Esa cuenta es `writtenSeconds` (§4.5). Con el compacto, el
  rótulo de la celda es el de hoy, porque el resto de segundos nunca llega al
  minuto.
- **Con el compacto, los totales mientras viaja la escritura cambian, y
  mejoran.** Hoy los totales suman `escrito × 60` por la celda en vuelo, sin el
  resto de segundos que el servidor conserva; con WS2a suman lo que va a dejar
  el servidor. Ejemplo, en una fila con la celda A (entradas de 100 s y 60 s,
  `0:02`) y la B (100 s y 100 s, `0:03`): al escribir `5` en A, hoy la fila
  muestra `0:08` y salta a `0:09` cuando llega la foto; con WS2a muestra `0:09`
  desde el principio. Es el segundo cambio que producción puede notar (§6.4).
- **«Sin cambios» se decide en minutos**, como hoy y como el servidor (TS-36):
  con el completo, teclear `2:13` sobre `02:13:27` no manda nada, y el campo
  vuelve a mostrar `02:13:27`, el rótulo de la celda, no uno armado con lo
  tecleado.
- **Un total es gris si su rótulo es el de cero** (TS-45): con el compacto,
  menos de un minuto; con el completo, cero segundos.

**La consecuencia**, con el completo: escribir `2:15` en una celda con varias
entradas que suman `02:13:27` la deja en `02:15:27`. Es la regla de TS-34 con los
segundos a la vista; quitarlos cambiaría lo que escribe una celda, y eso no es
de este slice. Pregunta 3 (§11).

**D-WS2a-9 — El reporte, las exportaciones y el perfil quedan para WS2b, y por
eso producción no ve formatos mezclados.** Fijos en el compacto en WS2a:

- **El reporte**: `durationLabel` de `report/components/group-heading.tsx:21-22`,
  que usan los totales de `report-view.tsx:62`, `:68`, el árbol
  (`report-tree.tsx:54`) y el gráfico (`report-chart.tsx:28`, `:43`, `:71`).
- **Las exportaciones**: «Duración» en CSV y PDF (`export/cell-text.ts:19-20`,
  por `cellText`; `pdf-layout.ts:129-138`, que además mide anchos con ese
  texto), en XLSX (`xlsx.ts:62-63` y su `DURATION_FORMAT`), y las celdas que
  arma `document.ts:121-127` en minutos. «Horas» sigue en decimal siempre
  (D-R6-9): no es un consumidor ni en WS2b.
- **El perfil**: «Compacto (h:mm)» es un texto fijo
  (`profile/components/labels.ts:32-33`, PF-31). Pasa a mostrar el valor del
  workspace con WS2b (PF-02, PF-20, PF-31 del mapa).

**Por qué no se ve un formato mezclado en producción**: la columna nace en
`compact` (D-WS2a-1), WS2a no trae ninguna escritura —ni selector, ni action, ni
acción en `can()`—, y el único modo de poner `full` es SQL a mano. Con `compact`
en todos lados, lo que formatea con el valor del workspace y lo que está fijo en
compacto dan el mismo texto (D-WS2a-4). El selector llega con WS2b, en el mismo
despliegue que el reporte, las exportaciones y el perfil, así que nadie elige el
completo antes de que todo lo respete. Lo mismo vale para un preview, salvo que
alguien ponga `full` por SQL en la rama `preview` de Neon: ahí se vería el
reporte en compacto, y es esperado.

En el código, **los dos llamadores del reporte pasan el literal `"compact"`**,
con un comentario que remite a WS2b, y la búsqueda de §5.6 los encuentra:

- `report/components/group-heading.tsx:22`: `formatDuration(seconds,
"compact")`, sin el `Math.floor(seconds / 60)` de hoy;
- `report/export/cell-text.ts:20`: `formatDuration(cell.minutes * 60,
"compact")`.

`pdf-layout.ts`, `document.ts` y `xlsx.ts` no llaman a `formatDuration` y no se
tocan.

**D-WS2a-10 — Los `check` de `workspace.name`, como parte opcional de la `0019`
(pregunta 2, §11).** `char_length(name) between 1 and 100` y `name =
btrim(name)`, con los nombres `workspace_name_len` y `workspace_name_trimmed`,
como `project`, `client`, `task` y `tag` (`schema.ts:271-272`, `:327-328`,
`:383-384`, `:420-421`). Los propuso WS1 (§2 y pregunta 1 de su contrato), que
no trae migración. **Son compatibles con todo escritor de hoy**: el arranque
escribe «Workspace» (`workspace/service.ts:47`, `:149-153`), y WS1 escribe lo
que valida `updateWorkspaceNameInput` —recortado con `.trim()`, que quita más
que `btrim`, y con `.max(100)` en unidades UTF-16, que nunca son menos que los
caracteres que cuenta `char_length`—. **Entran si el usuario responde que sí
antes de generar la migración** y la consulta 4 de §6.1 da cero filas; si no,
la `0019` sale sin ellos y la pregunta pasa al slice siguiente que cambie el
esquema del workspace (E4).

**D-WS2a-11 — La migración se genera una vez, con nombre, sobre el último
`main`, y se revisa a mano.**

- **Cómo**: `npm run db:generate -- --name workspace_duration_format`, con el
  esquema de §2.1 (con los `check` de D-WS2a-10 o sin ellos). En `main` la
  última es la `0018_drop_unused_columns` (`drizzle/meta/_journal.json:132-135`),
  así que sale **`0019_workspace_duration_format`**; si el diario dice otro
  número, vale el del diario.
- **Lo que trae, y nada más** (lo comprueba `backend-dev`, lo vuelve a mirar la
  revisión de backend y queda en el registro):

  ```sql
  ALTER TABLE "workspace_settings" ADD COLUMN "duration_format" text DEFAULT 'compact' NOT NULL;--> statement-breakpoint
  ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_duration_format_known" CHECK ("workspace_settings"."duration_format" in ('compact', 'full'));
  -- Solo con D-WS2a-10:
  ALTER TABLE "workspace" ADD CONSTRAINT "workspace_name_len" CHECK (char_length("workspace"."name") between 1 and 100);--> statement-breakpoint
  ALTER TABLE "workspace" ADD CONSTRAINT "workspace_name_trimmed" CHECK ("workspace"."name" = btrim("workspace"."name"));
  ```

  En el orden que elija `drizzle-kit`. Ningún `DROP`, ningún `RENAME`, ningún
  `UPDATE`, ningún `CREATE TYPE` y ninguna otra tabla. La instantánea nueva
  difiere de la anterior solo en eso (y en `id` y `prevId`); la entrada del
  diario es la última, con el `when` mayor.

- **Si `drizzle-kit` pregunta** si una columna se creó o se renombró, el diff
  trae algo de más: se corta con Ctrl-C sin elegir nada y se revisa el árbol.
- **No se edita a mano** el SQL generado ni se renombra un archivo generado: el
  `when` de su entrada tiene que superar el `created_at` de la última migración
  de producción, o `drizzle-kit migrate` la saltea sin aviso (ADR 0028,
  «Contexto»).
- **El MCP** (`/home/maxi/program/clock-mcp`, rama `mejoras/mcp`) trae
  `0018_mcp`, que también va a numerarse como `0019`. **El que se integre
  segundo regenera la suya**: en la rama rebasada sobre el `main` que trae la
  otra, toma `drizzle/meta/_journal.json` y las instantáneas de `main`, borra su
  `.sql` y su instantánea, y vuelve a correr `db:generate` con el mismo
  `--name`. Si WS2a es la segunda, sale `0020_workspace_duration_format`. **Nunca
  se renombra** la vieja: su `when` es anterior al de la otra, y una base que
  ya tenga la otra la saltearía. Toda base propia donde se aplicó la versión
  vieja se tira y se crea de nuevo.

**D-WS2a-12 — La e2e del completo corre en un proyecto propio de Playwright,
después de toda la suite, sobre la misma base.** El formato es de todo el
workspace, y los e2e corren en paralelo sobre uno solo
(`playwright.config.ts:40-62`, `e2e/database.ts:16-19`): cambiarlo en medio de
la suite cambia lo que leen los demás specs, que afirman el compacto (`0:01`,
`1:30`) en cientos de lugares. El mapa decía «en una base propia» (WS2b); este
contrato lo resuelve sin otra base, sin otro servidor y sin tocar CI:

- **`duration-full-setup`** depende de `chromium`: Playwright lo corre cuando
  terminó toda la suite. Pone el workspace en `full` con `setDurationFormat`.
  Su `teardown` es **`duration-full-teardown`**, que lo vuelve a `compact`.
- **`duration-full`** depende de `duration-full-setup` y corre los
  `e2e/*.full.spec.ts`. Adentro pueden ir en paralelo: todos esperan el
  completo.
- **`chromium`** ignora los `*.full.spec.ts` y los dos archivos de arriba.
- **`workspace.setup.ts` pone `compact` al arrancar**, después de renovar el
  workspace: una corrida cortada en medio del proyecto del completo no deja la
  siguiente en `full`.

Lo que hace Playwright 1.63 con esto, verificado en la revisión: un proyecto
que es dependencia corre entero aunque se filtre por archivo; filtrar un spec de
`chromium` no dispara `duration-full-setup`; y `--no-deps` saltea el setup y el
teardown. Por eso la iteración en local sobre el spec del completo tiene su
propia receta (§9.4).

WS2b reusa el proyecto para el reporte y las exportaciones con el completo.
`parity-analyst` corrige la línea del mapa (§7).

## 0. Precondición de arranque

- **`main` con WS0 B** (`b91c4b8`): el worktree sale de `c08369d`. WS2a corre
  `db:generate`, que pide un árbol con la migración del borrado (ADR 0028,
  regla 2).
- **La `0018` corrida en producción, con su control** (§6.5 y §6.6 del contrato
  de WS0), antes de la migración de WS2a: `db:migrate` aplicaría también lo que
  falte, y la `0018` tiene su propio procedimiento. No hace falta para
  implementar.
- **WS1 puede entrar antes o después**: no comparten migración ni tipos.
  Comparten archivos (`workspace/service.ts`, `workspace/repository.ts`,
  `e2e/database.ts`), donde WS1 suma al final y WS2a cambia el principio
  (`WorkspaceContext`, `contextOf`, `findFirstWorkspace`, `createWorkspace`) y
  suma al final. El segundo en entrar resuelve los conflictos de líneas
  vecinas. WS1 no lee `context.settings`, y su `getWorkspaceSettingsView` arma
  la vista con `context.workspace.name`, que no cambia de lugar.
- **El MCP puede entrar antes o después.** Comparte con WS2a la numeración de
  la migración (D-WS2a-11) y, como WS1, archivos donde los cambios son de líneas
  vecinas, no de las mismas:
  - `playwright.config.ts`: el MCP suma `MCP_ENABLED` a `localServerEnv`; WS2a,
    los proyectos del completo y los `testIgnore` de `chromium`;
  - `e2e/database.ts`: los dos suman funciones;
  - `workspace/service.ts`, `profile/service.ts` y `time-entry/service.ts`: el
    MCP pasa sus constancias a `auditActorOf`; WS2a cambia `WorkspaceContext` y
    `contextOf`, `timeSettingsOf` y `toView`.

  El segundo en entrar resuelve los conflictos. Las herramientas del MCP
  devuelven números (`durationMinutes`, `totalMinutes`:
  `clock-mcp/src/modules/mcp/tools.ts:63-64`, `:201`), no rótulos: **no es un
  consumidor del formato**. Su `readUserContext` arma el contexto con
  `ensureWorkspaceContext`, así que recibe `settings` sin cambios.

- Las citas son del árbol de `clock-ws2a` en `c08369d`.

### Supuestos sobre el árbol, con archivo y línea en `c08369d`

| Supuesto                                                                                                                            | Dónde                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `formatDuration` recibe minutos y fija `h:mm`; `formatElapsed` da `h:mm:ss` sin relleno en las horas                                | `src/server/time/index.ts:63-69`, `:149-156`                                                                                                                                           |
| `DisplayFormats` tiene hora y fecha; `TimeSettings` los lleva                                                                       | `src/server/time/index.ts:22-30`                                                                                                                                                       |
| `parseDurationInput` acepta `h:mm`, decimal y unidades; trunca los segundos de `1h30m1s`; tope de 24 h                              | `src/server/time/index.ts:735-768`                                                                                                                                                     |
| `timeSettingsOf` es la única lectura para mostrar; arma los formatos con las preferencias                                           | `src/modules/profile/service.ts:132-146`                                                                                                                                               |
| `knownChoice` lanza con un valor fuera de lista                                                                                     | `src/modules/profile/service.ts:62-76`                                                                                                                                                 |
| `WorkspaceContext` lleva workspace, membresía y actor; `contextOf` lo arma                                                          | `src/modules/workspace/service.ts:33-37`, `:65-80`                                                                                                                                     |
| El arranque crea el workspace y su fila de ajustes; `ensureWorkspaceContext` lee el workspace en cada pedido                        | `workspace/service.ts:137-175`; `workspace/repository.ts:65-74`, `:89-96`                                                                                                              |
| `entryWorkspaceIdOf` lee el workspace para el ingreso                                                                               | `workspace/service.ts:399-402`                                                                                                                                                         |
| `readSession` arma el contexto una vez por pedido                                                                                   | `src/server/session.ts:50-81`                                                                                                                                                          |
| `workspace_settings` tiene `workspace_id`, `who_sees_all_entries` y fechas; los formatos de `user_preference` son texto con `check` | `src/server/db/schema.ts:59-74`, `:148-169`                                                                                                                                            |
| El test de WS0 afirma la lista exacta de columnas de `workspace_settings`                                                           | `src/server/db/schema.integration.test.ts:40-47`                                                                                                                                       |
| Los `check` de nombre de las otras tablas                                                                                           | `schema.ts:271-272`, `:327-328`, `:383-384`, `:420-421`                                                                                                                                |
| La fila del servidor: `durationLabel` con los segundos truncados                                                                    | `src/modules/time-entry/service.ts:197-223` (`:216`)                                                                                                                                   |
| Los totales de grupo suman segundos y formatean una vez                                                                             | `time-entry/components/use-group-total.ts:20-40`; `day-group.tsx:288-323`; `week-group.tsx:47-69`; `calendar/calendar-grid.tsx:278`; `calendar/calendar-toolbar.tsx:142`               |
| Los borradores formatean minutos                                                                                                    | `entry-row.tsx:220-221`; `manual-bar.tsx:153-162`; `calendar/entry-dialog.tsx:568-578`                                                                                                 |
| El arrastre arma la vista con minutos y el formato de hora                                                                          | `calendar/calendar-gestures.ts:298-316`; `calendar-grid.tsx:155`, `:158`                                                                                                               |
| El bloque del timer formatea el transcurrido con `formatDuration`                                                                   | `calendar/calendar-block.tsx:99-107`                                                                                                                                                   |
| El contador: la barra y el diálogo del calendario                                                                                   | `timer-bar.tsx:119`; `entry-dialog.tsx:636`; `entry-dialog-body.tsx:109`; `elapsed-counter.tsx:70-79`                                                                                  |
| Los que muestran el rótulo del servidor                                                                                             | `entry-row.tsx:362`; `calendar-block.tsx:107`; `entry-dialog.tsx:455-458`; `entry-dialog-body.tsx:45`, `:118`; `timesheet/cell-entries-dialog.tsx:144`                                 |
| La planilla: totales, celda, `cellCommit` y quién los llama                                                                         | `timesheet/timesheet-model.ts:111-118`, `:229-268`, `:301-321`, `:350-359`; `timesheet-cell.tsx:42-51`; `timesheet-view.tsx:113-122`                                                   |
| La celda en el servidor compara minutos                                                                                             | `time-entry/timesheet-cell.ts:25-31`, `:102-145`                                                                                                                                       |
| `ClockField` no confirma un texto igual al valor                                                                                    | `time-entry/components/clock-field.tsx:118`                                                                                                                                            |
| El reporte, las exportaciones y el perfil, fijos                                                                                    | `report/components/group-heading.tsx:21-22`; `report/export/cell-text.ts:19-20`; `xlsx.ts:62-63`; `document.ts:121-127`; `pdf-layout.ts:129-138`; `profile/components/labels.ts:32-33` |
| La lista de proyectos no muestra duraciones                                                                                         | ninguna coincidencia de duración en `src/modules/project/`                                                                                                                             |
| Los tests de componente renderizan con `renderToStaticMarkup` y un `DisplayFormatsProvider`                                         | `time-entry/components/entry-row.test.tsx:1-10`                                                                                                                                        |
| `timeSettingsOf` y el workspace se prueban en integración (sus módulos importan la base)                                            | `profile/service.integration.test.ts`; `workspace/service.integration.test.ts`                                                                                                         |
| Los literales `formats: { time, date }` de los tests (§7, backend-dev, paso 1)                                                      | los de la lista de §7                                                                                                                                                                  |
| Los formatos de prueba y el `TrackerWorkspace` de los tests                                                                         | `src/test/factories.ts:31-32`, `:53-65`; `src/test/time-entry.ts:28-34`                                                                                                                |
| Las actions de integración pasan por la sesión real con la base                                                                     | `time-entry/actions.integration.test.ts:60-95`                                                                                                                                         |
| Los e2e: un workspace, specs en paralelo, el setup lo crea y lo renueva                                                             | `playwright.config.ts:40-62`; `e2e/workspace.setup.ts:26-48`; `e2e/database.ts:16-19`                                                                                                  |
| `seedEntries` acepta horas con segundos (`$4::time`)                                                                                | `e2e/database.ts:935-964`                                                                                                                                                              |
| La última migración de `main` es la `0018`                                                                                          | `drizzle/meta/_journal.json:132-135`                                                                                                                                                   |
| El MCP trae `0018_mcp` y devuelve números                                                                                           | `clock-mcp/drizzle/0018_mcp.sql`; `clock-mcp/src/modules/mcp/tools.ts:63-64`, `:201`                                                                                                   |
| Hoy no hay `"compact"` ni `"full"` en `src/` ni en `scripts/`                                                                       | búsqueda de §5.6 sobre `c08369d`                                                                                                                                                       |

## 1. Alcance

Cubre WS-16, WS-17 (todo menos el reporte y las exportaciones, que van con
WS2b), WS-66 (las filas, los totales y el contador; el cambio en vivo lo prueba
WS2b), WS-67, WS-68 y PF-22.

Entra:

- **La columna** y la migración `0019` (§2), con los `check` de
  `workspace.name` si el usuario los acepta (D-WS2a-10).
- **El formato en la sesión** (D-WS2a-2) y en `DisplayFormats` (D-WS2a-3).
- **`formatDuration(seconds, format)`** y la forma `h:mm:ss` de
  `parseDurationInput` (D-WS2a-4, D-WS2a-6).
- **Los diez consumidores** de §5.1 y §5.2, con la planilla de D-WS2a-8.
- **Los dos llamadores del reporte**, fijos en `"compact"` (D-WS2a-9).
- **El proyecto de Playwright del completo** y su spec (D-WS2a-12).
- **Las consultas de §6** y la transición en producción.
- **Las correcciones de paridad** (§7).

Queda afuera: §12.

### Consecuencias sobre código ya entregado

| Archivo                                                                      | Qué cambia                                                                                                                             | Qué hay que volver a probar                                              |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `src/server/db/schema.ts`                                                    | `durationFormat` y su `check` en `workspaceSettings`; los `check` de `workspace` si entran                                             | `npm run typecheck`; `src/server/db/schema.integration.test.ts`          |
| `src/server/db/schema.integration.test.ts`                                   | La lista de columnas de `workspace_settings` suma `duration_format` (`:40-47`)                                                         | el archivo                                                               |
| `drizzle/`                                                                   | `0019_workspace_duration_format.sql`, su instantánea y su entrada del diario                                                           | `db:migrate` sobre una base con datos (§9.3)                             |
| `src/server/time/index.ts`                                                   | `DURATION_FORMATS`, `DurationFormat`, `DisplayFormats.duration`, `formatDuration(seconds, format)`, `parseDurationInput` con `h:mm:ss` | `time.test.ts` entero                                                    |
| `src/modules/workspace/repository.ts`, `service.ts`                          | `findFirstWorkspace` y `createWorkspace` con el formato; `WorkspaceContext.settings`; `resolveDurationFormat`                          | `workspace/service.integration.test.ts`; todo lo que arma una sesión     |
| `src/modules/profile/service.ts`                                             | `timeSettingsOf` suma `duration`                                                                                                       | `profile/service.integration.test.ts`                                    |
| `src/modules/time-entry/service.ts`, `schema.ts`                             | `toView` con el formato; el comentario de `durationLabel`                                                                              | `service.integration.test.ts`, `actions.integration.test.ts`             |
| `src/components/layout/display-formats.tsx`                                  | El comentario: la duración es del workspace                                                                                            | `display-formats.test.tsx`                                               |
| Los consumidores de §5.2                                                     | Formatean con el formato                                                                                                               | sus tests (§9.1)                                                         |
| `report/components/group-heading.tsx`, `report/export/cell-text.ts`          | `formatDuration(…, "compact")` (D-WS2a-9)                                                                                              | los tests del reporte y de las exportaciones, sin cambiar lo que afirman |
| `src/test/factories.ts`, `src/test/time-entry.ts`                            | `defaultFormats` con `duration: "compact"`; `setDurationFormat`                                                                        | —                                                                        |
| Los tests con un literal `formats: { time, date }` (§7, backend-dev, paso 1) | Suman `duration: "compact"`                                                                                                            | sin cambiar lo que afirman                                               |
| Los tests que arman `WorkspaceContext` o `TimeEntryView` a mano              | Suman `settings`; `durationLabel` sale de `formatDuration` con segundos                                                                | sin cambiar lo que afirman                                               |
| `playwright.config.ts`, `e2e/workspace.setup.ts`, `e2e/database.ts`          | Los proyectos del completo; `compact` al arrancar; `setDurationFormat`, `durationFormatOf`                                             | la e2e entera                                                            |

- **Sin cambio**: `can()` y `src/server/permissions/`; `team`, salvo sus tests,
  y en ellos solo el literal de formatos; `project`; el `service.ts`, el
  `repository.ts` y las vistas del reporte (sus tests, solo el literal);
  `pdf-layout.ts`, `document.ts`, `xlsx.ts`; `elapsed-counter.tsx`,
  `timer-bar.tsx`; `time-entry/timesheet-cell.ts` (el servidor de la celda);
  `src/server/session.ts` (el contexto llega armado de
  `ensureWorkspaceContext`); las actions.
- **Ninguna e2e existente cambia lo que afirma**: corren con el compacto, que
  da el mismo texto que hoy (criterio 2).

## 2. Esquema y migración

### 2.1 El esquema

```ts
export const workspace = pgTable(
  "workspace",
  { /* las columnas de hoy, sin cambio */ },
  // Solo con D-WS2a-10:
  (table) => [
    check("workspace_name_len", sql`char_length(${table.name}) between 1 and 100`),
    check("workspace_name_trimmed", sql`${table.name} = btrim(${table.name})`),
  ],
);

export const workspaceSettings = pgTable(
  "workspace_settings",
  {
    workspaceId: …,
    whoSeesAllEntries: …,
    /**
     * Cómo se muestran las duraciones a todas las personas del workspace
     * (WS-14, WS-15): `DURATION_FORMATS` de `src/server/time`. Solo cambia lo
     * que se muestra (ADR 0029). Lo lee la sesión en cada pedido.
     */
    durationFormat: text("duration_format").notNull().default("compact"),
    createdAt: …,
    updatedAt: …,
  },
  (table) => [
    check(
      "workspace_settings_duration_format_known",
      sql`${table.durationFormat} in ('compact', 'full')`,
    ),
  ],
);
```

Los `…` son las definiciones de hoy. Las relaciones no cambian.

### 2.2 La migración

`drizzle/0019_workspace_duration_format.sql`, con lo que fija D-WS2a-11. **Es
compatible con el código anterior**, que es el que atiende entre la migración y
el push:

- El código anterior no nombra `duration_format`: sus `select()` no la leen y
  su `insert` de `workspace_settings` en el arranque
  (`workspace/repository.ts:94`) la deja con su `default`.
- Los `check` de `workspace.name` los cumplen el único escritor de hoy
  («Workspace») y, si WS1 está, su action (D-WS2a-10).

Lo único del código anterior que no la tolera es un test, a propósito:
`src/server/db/schema.integration.test.ts:40-47` afirma la lista exacta de
columnas de `workspace_settings` (criterio 12).

Postgres no reescribe la tabla por una columna con `default` constante. Cada
`ADD CONSTRAINT … CHECK` recorre su tabla con un bloqueo exclusivo: una fila.
La migración corre en la transacción de `drizzle-kit migrate`: si una sentencia
falla —un nombre que no cumple, una columna que ya estaba—, no queda nada.

### 2.3 Reversión

- **Antes del push**: la columna queda en `compact`, sin lector, y el código de
  `main` no la nombra. No se toca la base. Si WS2a se abandona, la columna se
  borra con una migración que solo la quita: ningún código desplegado la nombra,
  así que el orden de ADR 0028 no hace falta.
- **Después del push**: se revierte **solo el código**, conservando la
  migración y el esquema que la generó:

  ```
  git revert -m 1 --no-commit <merge>
  git checkout HEAD -- drizzle/ src/server/db/schema.ts
  git commit
  ```

  El diario y la base siguen coincidiendo (ADR 0028, regla 7: nunca se revierte
  el commit de una migración aplicada), y el esquema sigue coincidiendo con la
  instantánea: si `schema.ts` volviera sin la columna y la instantánea la
  tuviera, el próximo `db:generate` emitiría un `DROP COLUMN`. El código
  anterior compila con la columna en el esquema, porque no la nombra. **Instant
  Rollback a un deployment anterior es seguro**, al revés que en WS0: el código
  viejo no nombra la columna.

## 3. Permisos

**Ningún cambio en `can()`**: ninguna acción nueva, ninguna regla nueva.
`workspace.settings.update`, que va a usar el selector, es de WS1 y WS2b. Leer
el formato no es una decisión de acceso: lo ve toda persona con sesión, como su
propia zona.

## 4. Contrato

### 4.1 `src/server/time/index.ts`

```ts
export const DURATION_FORMATS = ["compact", "full"] as const;
/** Cómo se muestra una duración (PF-20, WS-15). Es del workspace (ADR 0029). */
export type DurationFormat = (typeof DURATION_FORMATS)[number];

/**
 * Cómo ve el tiempo quien mira: la hora y la fecha son suyas (PF-12, PF-13); la
 * duración, del workspace (WS-14, ADR 0029). Lo junta `timeSettingsOf`.
 */
export type DisplayFormats = {
  readonly time: TimeFormat;
  readonly date: DateFormat;
  readonly duration: DurationFormat;
};

/**
 * Una duración de `seconds` segundos como se muestra: compacto `h:mm`, con los
 * segundos truncados; completo `hh:mm:ss`. Un total se formatea una sola vez,
 * sobre la suma exacta (ADR 0029). Un negativo da cero. No es el contador del
 * timer, que es `formatElapsed`.
 */
export function formatDuration(seconds: number, format: DurationFormat): string;

/** Lo de hoy, más `h:mm:ss` con los segundos truncados (D-WS2a-6, PF-21). */
export function parseDurationInput(text: string): number | null;
```

`formatElapsed`, `formatDecimalHours` y `truncatedHours` no cambian.

### 4.2 Workspace (`src/modules/workspace/`)

`repository.ts`:

```ts
/** El workspace y su formato de duración; `null` si falta la fila de ajustes (WS-73). */
export type WorkspaceRead = {
  readonly workspace: WorkspaceRow;
  readonly durationFormat: string | null;
};

// workspaceRepository:
/** El de hoy, con un `left join` a `workspace_settings`: una consulta, el mismo orden. */
async findFirstWorkspace(tx?): Promise<WorkspaceRead | undefined>;
/** El de hoy; el alta de la fila de ajustes devuelve su `duration_format`. */
async createWorkspace(tx, values): Promise<WorkspaceRead>;
```

`service.ts`:

```ts
/** Los ajustes del workspace que se leen en cada pedido (ADR 0029). */
export type WorkspaceSettings = { readonly durationFormat: DurationFormat };

export type WorkspaceContext = {
  readonly workspace: WorkspaceRow;
  readonly settings: WorkspaceSettings;
  readonly membership: MembershipRow;
  readonly actor: Actor;
};

/**
 * D-WS2a-2: único lugar que aplica el valor por omisión. Sin fila, `compact`,
 * sin crearla (WS-73); fuera de `DURATION_FORMATS`, lanza. Pura.
 */
export function resolveDurationFormat(value: string | null): DurationFormat;
```

`contextOf` recibe el `WorkspaceRead` y arma `settings`; `bootstrapContext`,
`joinedContext` y `ensureWorkspaceContext` pasan el `WorkspaceRead` en lugar del
`WorkspaceRow`; `entryWorkspaceIdOf` devuelve `current?.workspace.id ?? null`.
Ninguna firma exportada cambia salvo `WorkspaceContext`, que suma un campo, y
`findFirstWorkspace`, que también llaman dos tests de integración
(`profile/service.integration.test.ts:64`,
`time-entry/service.integration.test.ts:4046`).

### 4.3 Perfil (`src/modules/profile/service.ts`)

```ts
export function timeSettingsOf(context: ProfileContext): TimeSettings {
  return {
    timezone: context.preferences.timezone,
    weekStart: weekStartOf(context),
    formats: {
      time: context.preferences.timeFormat,
      date: context.preferences.dateFormat,
      // Del workspace, no de la persona (WS-14, ADR 0029).
      duration: context.settings.durationFormat,
    },
  };
}
```

El comentario de la función suma que la duración es del workspace.

### 4.4 Rastreador (`src/modules/time-entry/service.ts`, `schema.ts`)

`toView`: `durationLabel: seconds === null ? null : formatDuration(seconds,
workspace.formats.duration)`. El comentario de `durationLabel` en `schema.ts`
(`:447`) dice «con el formato de duración del workspace». **La forma de
`TimeEntryView` no cambia**: el campo ya es `z.string().nullable()`.

### 4.5 La planilla (`time-entry/components/timesheet/timesheet-model.ts`)

```ts
export type TimesheetGridInput = {
  // los de hoy, y:
  /** `useDisplayFormats().duration` de la pantalla. */
  readonly format: DurationFormat;
};

/**
 * D-WS2a-8: los segundos en que queda la celda si se escriben `minutes`, como
 * los deja el servidor (TS-29, TS-33, TS-34): con cero o una entrada cerrada,
 * `minutes × 60`; con varias, la suma exacta de sus `durationSeconds` más la
 * diferencia en minutos con los minutos truncados de esa suma.
 */
export function writtenSeconds(
  entries: readonly TimeEntryView[],
  minutes: number,
): number;

/** D-WS2a-8: «sin cambios» en minutos; con él, el rótulo de la celda. */
export function cellCommit(
  text: string,
  cell: Pick<GridCell, "minutes" | "label" | "entries">,
  format: DurationFormat,
): CellCommit;
```

- Las entradas cerradas de una celda son las de `cell.entries` con `endedAt`
  distinto de `null`, las mismas que suma el servidor.
- `GridCell.seconds`: sin escritura pendiente, la suma exacta de la foto; con
  una, `writtenSeconds(entries, written)`. `GridCell.label`: vacío sin valor; si
  no, `formatDuration(seconds, format)`. `GridCell.minutes` no cambia.
- `GridTotal.zero`: `formatDuration(seconds, format) === formatDuration(0,
format)`.
- `GridRow.closedTotal`: la suma exacta de la foto, con el formato.
- `cellCommit`: `rejected` como hoy; `unchanged` si los minutos son los de la
  celda, con `label: cell.label`; `write` con `label:
formatDuration(writtenSeconds(cell.entries, minutes), format)`.
- `timesheet-view.tsx` pasa `format`; `timesheet-cell.tsx` pasa la celda y el
  formato a `cellCommit`.

### 4.6 Lo demás del navegador

- `useGroupTotalLabel` (`use-group-total.ts`) lee `useDisplayFormats().duration`
  y formatea la suma en segundos, sin dividir: `formatDuration(max(0, closed −
removed) + elapsed, duration)`. Su firma no cambia.
- `movedView(entry, times, formats: Pick<DisplayFormats, "time" | "duration">)`
  (`calendar-gestures.ts`): `durationLabel: formatDuration(minutes * 60,
formats.duration)`. `calendar-grid.tsx` pasa los dos.

### 4.7 Esquemas Zod

**Ninguno nuevo ni cambiado**: WS2a no tiene entrada nueva. El esquema del
selector, con `z.enum(DURATION_FORMATS)` y el mensaje de WS-56, es de WS2b.

## 5. Los consumidores

### 5.1 En el servidor

| #   | Dónde                                 | Qué muestra                                                                                                                                          | Cambio                                                |
| --- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| S1  | `time-entry/service.ts:216`, `toView` | `durationLabel` de toda `TimeEntryView`: la fila del rastreador, el bloque del calendario, los diálogos del calendario y el de entradas de una celda | `formatDuration(seconds, workspace.formats.duration)` |

`toView` lo usan las lecturas del rastreador, el calendario y la planilla, y
toda action que devuelve una entrada (`trackerWorkspaceOf(session)`).

### 5.2 En el navegador

| #   | Dónde                                  | Qué muestra                                                                                                                                                                                                                               | Cambio                                            |
| --- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| C1  | `use-group-total.ts:37-39`             | El total del día (`day-group.tsx:323`) y de la semana (`week-group.tsx:69`) del rastreador; el del día de cada columna (`calendar-grid.tsx:278`) y el del período (`calendar-toolbar.tsx:142`) del calendario; con el timer, suben con él | segundos y `duration` (§4.6)                      |
| C2  | `entry-row.tsx:220-221`                | La duración de la fila mientras se edita o viaja el trío                                                                                                                                                                                  | `formatDuration(draftDuration(…) * 60, duration)` |
| C3  | `manual-bar.tsx:153-162`               | El campo «Duración» de la barra manual, y lo que muestra al confirmar                                                                                                                                                                     | ídem                                              |
| C4  | `calendar/calendar-gestures.ts:314`    | El bloque mientras se arrastra y mientras viaja                                                                                                                                                                                           | `movedView` con `duration` (§4.6)                 |
| C5  | `calendar/calendar-block.tsx:105-106`  | El bloque del timer: el transcurrido como duración (D-WS2a-7)                                                                                                                                                                             | `formatDuration(elapsed, duration)`               |
| C6  | `calendar/entry-dialog.tsx:568-578`    | El campo «Duración» del diálogo, cuando el trío cambió (TT-97)                                                                                                                                                                            | `formatDuration(draftDuration(…) * 60, duration)` |
| C7  | `timesheet/timesheet-model.ts:111-114` | Los totales de fila, de día y de semana, y el total del diálogo de quitar la fila (TS-53)                                                                                                                                                 | `totalOf(seconds, format)` (§4.5)                 |
| C8  | `timesheet-model.ts:241-248`           | La celda, en reposo y mientras viaja su escritura                                                                                                                                                                                         | `seconds` y `label` de §4.5                       |
| C9  | `timesheet-model.ts:350-359`           | Lo que el campo de la celda muestra al confirmar                                                                                                                                                                                          | `cellCommit` de §4.5                              |

### 5.3 Los que muestran el rótulo del servidor, sin cambio

`entry-row.tsx:362` (en reposo), `calendar-block.tsx:107`,
`entry-dialog.tsx:455-458` (mientras el trío no cambió, TT-97),
`entry-dialog-body.tsx:45` y `:118` (el diálogo de solo lectura),
`timesheet/cell-entries-dialog.tsx:144`. Siguen a S1.

### 5.4 Lo que no cambia: el contador

`formatElapsed` en `elapsed-counter.tsx:79`: la barra del timer
(`timer-bar.tsx:119`) y «Fin: en curso» del diálogo del calendario
(`entry-dialog.tsx:636`, `entry-dialog-body.tsx:109`). Sigue en `h:mm:ss`, con
las horas sin relleno: `0:01:40`, no `00:01:40` (PF-22, WS-66, CAL-66).

### 5.5 Lo que queda para WS2b

D-WS2a-9: el reporte, las exportaciones (menos «Horas», que no es consumidor) y
el texto del perfil. Las herramientas del MCP devuelven números y no son
consumidores (§0).

### 5.6 La búsqueda

Se repite después de cada rebase y va al registro:

```
rg -n 'formatDuration\(|"compact"|"full"' src scripts --glob '!**/*.test.*'
```

Fuera de `src/server/time/`, `src/server/db/schema.ts` y
`src/modules/workspace/`, tiene que dar **exactamente**: S1 y C1 … C9 con el
formato de `TimeSettings` o de `useDisplayFormats()`, y los dos llamadores del
reporte con `"compact"`. Un `formatDuration` con un solo argumento no compila.

Un rótulo de duración armado **sin** `formatDuration` no existe hoy: la revisión
de frontend corre `rg -n 'padStart|/ 60\b|/ 3600' src --glob '!**/*.test.*'` y
comprueba que, fuera de `src/server/time/`, cada coincidencia es una cuenta de
minutos y no un rótulo (hoy: `time-entry/timesheet-cell.ts:30`,
`calendar/calendar-layout.ts:140`, `timesheet-model.ts:112`, `:242`, y las del
reporte de D-WS2a-9).

## 6. La transición en producción

Hechos que el contrato da por dados: Vercel despliega `main` a producción en
cada push y el build no corre migraciones; las corre el usuario con `!`.
**La `0019` agrega: se corre antes del push**, con el código anterior
atendiendo (§2.2).

### 6.1 La consulta previa

La corre el usuario en producción, con `!`. **La 4, antes de generar la
migración**: decide si entran los `check` (D-WS2a-10). Las demás, antes de
migrar.

```sql
-- 1. Las últimas migraciones aplicadas: la primera, la 0018 de main.
select id, hash, created_at
from drizzle.__drizzle_migrations
order by created_at desc
limit 3;

-- 2. Cada workspace con su fila de ajustes.
select w.id, w.created_at, s.workspace_id is not null as tiene_ajustes
from workspace w
left join workspace_settings s on s.workspace_id = w.id
order by w.created_at, w.id;

-- 3. La columna y las restricciones todavía no existen.
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'workspace_settings'
  and column_name = 'duration_format';
select conname
from pg_constraint
where conname in ('workspace_settings_duration_format_known',
                  'workspace_name_len', 'workspace_name_trimmed');

-- 4. Solo para D-WS2a-10: los nombres que no cumplirían los check.
select id, char_length(name) as largo, name <> btrim(name) as con_espacios
from workspace
where not (char_length(name) between 1 and 100) or name <> btrim(name);
```

Lo esperado y qué se hace si no:

- **La 1**: la primera fila con `created_at` `1792502701085`, el `when` de la
  `0018`. **Otra** frena: producción no está al día con `main` (la `0018` tiene
  su procedimiento, §0).
- **La 2**: un workspace, con `tiene_ajustes` verdadero. **Falso** no frena la
  migración —la sesión ve el compacto, D-WS2a-2— pero se avisa al team-lead: es
  WS-73 y lo tiene que saber WS2b.
- **La 3**: cero filas en las dos. **Alguna** frena: alguien tocó el esquema a
  mano, y la migración fallaría en esa sentencia.
- **La 4**: cero filas. **Alguna** deja los `check` afuera de la `0019`: el
  nombre se corrige primero, desde `/configuracion` si WS1 está en producción, y
  los `check` pasan a E4. La consulta imprime solo largos y banderas.

### 6.2 El merge y la migración

1. El team-lead mergea WS2a en `main` **en local, sin push**. Si el MCP entró
   antes, la migración ya se regeneró (D-WS2a-11).
2. El usuario corre, desde `/home/maxi/program/clock` con ese `main`:
   `DATABASE_URL=<prod> npm run db:migrate`, con `!`. Si no está en la
   computadora, el bloque `do $$ … $$` en el editor SQL de Neon, con las
   sentencias de la `0019` y el `insert into drizzle.__drizzle_migrations (hash,
created_at)` con el sha256 del archivo y su `when`, probado antes en una base
   local —después, `db:migrate` contra esa base no hace nada—, como la `0017` y
   la `0018`.
3. Entre la migración y el push atiende el código anterior, que no nombra la
   columna (§2.2).

### 6.3 El control, enseguida

```sql
-- 5. La columna.
select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'workspace_settings'
  and column_name = 'duration_format';

-- 6. El valor de cada workspace.
select duration_format, count(*) from workspace_settings group by 1;

-- 7. Las restricciones.
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conname in ('workspace_settings_duration_format_known',
                  'workspace_name_len', 'workspace_name_trimmed')
order by conname;

-- La 1 de §6.1 otra vez: la primera es la 0019, con el `created_at` igual a su `when`.
```

Lo esperado: en la 5, `text`, `'compact'::text` y `NO`; en la 6, una fila,
`compact` con la cantidad de workspaces de la 2; en la 7, una fila, o tres con
los `check` del nombre; en la 1, la `0019`. **Si la 1 no muestra la `0019`** y la
5 viene vacía, `drizzle-kit` la salteó por el `when`: no se toca nada a mano, se
avisa al team-lead, que la regenera (D-WS2a-11).

### 6.4 El push y la verificación de humo

El team-lead pushea; Vercel despliega. **Ningún formato cambia**, así que el
humo compara con lo que el owner ya conoce:

1. **`/`**: las filas, el total del día y el de la semana en `h:mm`, como antes;
   con un timer corriendo, el contador en `h:mm:ss` y el total de su día
   subiendo en `h:mm`.
2. **La barra manual**: el campo «Duración» muestra el borrador en `h:mm`;
   teclear `1:30:00` y salir lo deja en `1:30` (D-WS2a-6, nuevo). Sin
   «Agregar»: no se crea nada.
3. **`/planilla`** y **`/calendario`**: celdas, bloques y totales en `h:mm`.
   **El otro cambio que se puede notar** (D-WS2a-8): escribir una celda que
   tiene varias entradas con segundos sueltos muestra los totales de fila, de
   día y de semana con el valor final mientras viaja la escritura, sin el salto
   de un minuto que hoy se ve al llegar la foto. No hace falta provocarlo en
   producción: lo prueban `timesheet-model.test.ts` y la e2e.
4. **`/reportes`** y **`/perfil`**: sin cambios.
5. **Los logs de Runtime** de producción en Vercel, quince minutos, sin errores
   nuevos; en particular, ningún `RangeError` de `resolveDurationFormat`.

**No se pone `full` en producción para probar**: el reporte y el perfil quedan
en compacto hasta WS2b (D-WS2a-9). Producción pasa al completo con WS2b
(workspace P-07).

### 6.5 Reversión

La de §2.3. Si el humo falla después del push: el revert del código con
`git checkout HEAD -- drizzle/ src/server/db/schema.ts` antes del commit, y
push; o Instant Rollback, que acá es seguro.

### 6.6 Previews y las bases compartidas

- **Los agentes de WS2a prueban con bases propias**, nunca con `clock` ni
  `clock_test`: `clock_ws2a_back_test`, `clock_ws2a_front_test`,
  `clock_ws2a_e2e` y las de §9.3. La integración migra sola su base
  (`src/test/global-setup.ts`): correrla desde la rama contra `clock_test` le
  aplicaría la `0019` antes que a producción, y una base con la `0019` saltearía
  la migración del MCP si esa sale con un `when` anterior (D-WS2a-11).
- **La rama `preview` de Neon** necesita la `0019` para el preview de la rama de
  WS2a: el código nuevo la nombra y sin ella cada pedido con sesión falla con
  `42703`. Se migra con `!` **después de producción**; antes, la consulta 1 de
  §6.1 contra ella, y si su última no es la de `main` se avisa al team-lead y no
  se migra. Agregar no rompe los previews de otras ramas.
- **`clock` y `clock_test`** reciben la `0019` desde `main` después de
  producción, como siempre.

## 7. Reparto de archivos

### backend-dev

- **Primero, el commit del paso 1 del orden**, y avisa a `frontend-dev` y a
  `e2e-tester`. Fija `DURATION_FORMATS`, `DurationFormat`,
  `DisplayFormats.duration`, la firma de `formatDuration`,
  `WorkspaceContext.settings` y `defaultFormats` con `duration: "compact"`.
  Hasta ese commit, el árbol no compila para nadie. **Es el dueño de sumar
  `duration: "compact"` a los literales `formats: { time, date }` que dejan de
  compilar**, en tests de todos los módulos, sin cambiar lo que afirman:
  - `src/modules/report/period.test.ts:12`;
  - `src/modules/report/export/pdf-layout.test.ts:66`;
  - `src/modules/report/export/document.test.ts:22`, `:266`;
  - `src/modules/report/service.integration.test.ts:4048`;
  - `src/modules/team/components/team-members-model.test.ts:1048`;
  - `src/modules/team/components/team-screen.test.tsx:33`;
  - `src/modules/team/components/team-members.test.tsx:16`;
  - `src/modules/time-entry/components/calendar/calendar-block.test.tsx:21-22`;
  - `src/modules/time-entry/components/calendar/entry-dialog.test.tsx:111`,
    `:157`, `:217`, `:295`;
  - `src/modules/time-entry/components/entry-row.test.tsx:58`, `:134`;
  - `src/components/layout/display-formats.test.tsx:14-15`.

  Si `tsc` encuentra otro, va en el mismo commit. Los casos nuevos de esos tests
  (§9.1) son de quien tiene el consumidor.

- `src/server/time/index.ts` y `time.test.ts` (§4.1, D-WS2a-4, D-WS2a-6).
- `src/server/db/schema.ts` (§2.1); la migración (D-WS2a-11), **una vez**, con
  la respuesta de la pregunta 2 y la consulta 4, sobre el último `main`; pega el
  SQL y el diff de la instantánea en el registro.
- `src/server/db/schema.integration.test.ts` (de WS0): el `it` de `:40-47` pasa a
  `[workspace_id, who_sees_all_entries, created_at, updated_at,
duration_format]`; y suma la columna, su `default`, su `check` y, si entran,
  los del nombre (§9.2).
- `src/modules/workspace/repository.ts`, `service.ts` y
  `service.integration.test.ts`, con `resolveDurationFormat` (§4.2).
- `src/modules/profile/service.ts` y `service.integration.test.ts` (§4.3).
- `src/modules/time-entry/service.ts`, `schema.ts` (el comentario),
  `service.integration.test.ts` y `actions.integration.test.ts` (§4.4, §9.2).
- `src/modules/report/export/cell-text.ts` (D-WS2a-9).
- `src/test/factories.ts` (`defaultFormats`, `setDurationFormat(workspaceId,
format)`) y `src/test/time-entry.ts`.
- Los tests de integración que arman `TimeEntryView` o `WorkspaceContext` a
  mano, y los dos que llaman a `findFirstWorkspace`.
- Las pruebas de §9.3.
- **El registro del slice**: `docs/slices/correcciones-fase2-ws2a-revisiones.md`.

### frontend-dev

- `src/components/layout/display-formats.tsx` (el comentario) y su test, más
  allá del literal del paso 1.
- C1 … C9 (§5.2) con sus tests (§9.1): `use-group-total.ts`, `entry-row.tsx`,
  `manual-bar.tsx`, `calendar/calendar-gestures.ts`, `calendar/calendar-grid.tsx`,
  `calendar/calendar-block.tsx`, `calendar/entry-dialog.tsx`,
  `timesheet/timesheet-model.ts`, `timesheet/timesheet-view.tsx`,
  `timesheet/timesheet-cell.tsx`.
- Los tests nuevos de §9.1: `manual-bar.test.tsx`, `elapsed-counter.test.tsx` y,
  si hace falta, `use-group-total.test.tsx`.
- `src/modules/report/components/group-heading.tsx` (D-WS2a-9).
- Los tests de componente que arman `TimeEntryView` a mano.

### e2e-tester

- `e2e/database.ts`: `setDurationFormat(format)` y `durationFormatOf()`, sobre
  el workspace de los e2e (`FIRST_WORKSPACE`).
- `e2e/workspace.setup.ts`: `setDurationFormat("compact")` después de
  `renewWorkspace()` (D-WS2a-12).
- `playwright.config.ts`: los proyectos `duration-full-setup`,
  `duration-full-teardown` y `duration-full`, y los `testIgnore` de `chromium`.
- `e2e/duration-full.setup.ts`, `e2e/duration-full.teardown.ts` y
  `e2e/duration-format.full.spec.ts`, nuevos (§9.4); confirma que el spec falla
  antes de la implementación.
- La suite entera, con los specs de hoy sin cambiar lo que afirman.

### parity-analyst

Correcciones fechadas, «_Corregido el <fecha>, WS2a_»:

- `workspace.md`: **WS-16** (la regla de D-WS2a-5, que deja de estar pendiente
  y pasa a «decisión del equipo, ADR 0029», con P-09 punto 7 como la
  verificación que la puede cambiar), **WS-68** (la regla escrita, con el
  ejemplo de `0:01` + `0:01` = `0:03`), **WS-67** (`h:mm:ss` se acepta con los
  dos formatos), **WS-17** (el bloque del timer en el calendario sigue el
  formato; el reporte y las exportaciones, con WS2b), **WS-73** (sin la fila de
  ajustes, la sesión muestra el compacto —ADR 0029— y solo la pantalla de
  configuración de WS2b responde con el error inesperado), la fila «_Falta_:
  formato de duración» de la §14 («Columna desde WS2a, `0019`, compacta») y el
  punto 2 de la §16.
- `perfil.md`: las filas de `formatDuration` y de `use-group-total.ts` de la
  tabla de la §10 (recibe segundos y el formato; el formato llega por
  `useDisplayFormats`), y PF-21 (el intérprete acepta `h:mm:ss`, con los dos
  formatos).
- `time-tracker.md`: **TT-19** (suma `1:30:00` y `01:30:45` → 1 h 30 m, con los
  segundos truncados).
- `timesheet.md`: **TS-25** (lo mismo, por TT-19) y una nota en TS-34: con el
  completo, una celda con varias entradas conserva sus segundos sueltos al
  escribirla (D-WS2a-8, pregunta 3).
- `calendario.md`: **CAL-21** (el bloque del timer muestra el transcurrido con
  el formato de duración del workspace, no siempre en `h:mm`).
- `fase2-mapa.md`: en «WS2b», los e2e del completo corren en el proyecto
  `duration-full` de WS2a, después de la suite y sobre la misma base, y no en
  una base propia (D-WS2a-12); en §4, la fila del ADR de WS2a nombra el
  [ADR 0029](../adr/0029-el-formato-de-duracion-es-del-workspace-y-solo-cambia-lo-que-se-muestra.md).

### Lo que no toca nadie

`src/server/permissions/`, `src/server/session.ts`, las actions, `project`,
`time-entry/timesheet-cell.ts`, `elapsed-counter.tsx`, `timer-bar.tsx`,
`profile/components/`, `.github/` y `CLAUDE.md`. **`team` y el resto de
`report/`** (service, repository, `pdf-layout.ts`, `document.ts`, `xlsx.ts`, las
vistas) tampoco, salvo sus tests, y en ellos solo el literal de formatos del
paso 1.

### Orden

1. `backend-dev`: los tipos y firmas de §4.1, `WorkspaceContext.settings`,
   `defaultFormats` y los literales de la lista de arriba, en un commit que
   compila. Los llamadores de `formatDuration` pasan segundos —`seconds`, o
   `minutes * 60` donde tienen minutos (D-WS2a-4)— y un `"compact"` provisorio,
   que el paso 2 reemplaza por el formato; así, entre los pasos 1 y 2, S1 no
   muestra `0:00`. Avisa.
2. En paralelo: `backend-dev` con el esquema, la sesión, `toView` y sus tests;
   `frontend-dev` con C1 … C9; `e2e-tester` con el arnés y el spec;
   `parity-analyst` con las correcciones.
3. **La migración**, con la pregunta 2 respondida y la consulta 4 corrida.
4. La búsqueda de §5.6, sin ningún `"compact"` provisorio; las revisiones;
   correcciones; las pruebas de §9.3 y la e2e en una base nueva **y** en una que
   se reusa.

## 8. Criterios de aceptación

1. **El compacto es el de hoy**: `formatDuration(m * 60 + s, "compact")` da el
   texto de la función anterior con `m`, para `m` de 0 a 6000 y `s` de 0 a 59, y
   para un negativo; `npm test` lo prueba contra una copia de la función vieja
   dentro del test.
2. **Nada visible cambia con el compacto**: la e2e entera de hoy pasa sin
   cambiar ninguna afirmación, con la columna en `compact`.
3. **El completo**: `00:00:00`, `00:01:40`, `01:30:00`, `23:59:59`, `100:00:00`;
   un negativo da `00:00:00`.
4. **Lo tecleado** (D-WS2a-6): la tabla de D-WS2a-6 y la tabla de hoy de
   `parseDurationInput`, sin cambios en las formas viejas.
5. **El dato** (D-WS2a-1, D-WS2a-2): un workspace nuevo —el del arranque y el de
   una fábrica— queda en `compact`; con `full` escrito por SQL,
   `ensureWorkspaceContext` lo trae en `settings`; sin la fila de ajustes, trae
   `compact` y la fila sigue sin existir; un `update` a `decimal` falla con
   `23514` nombrando `workspace_settings_duration_format_known`.
6. **De la base al rótulo**: con el workspace en `full`, una action del
   rastreador que devuelve una entrada de 100 segundos —editar la descripción
   de una entrada sembrada— responde `durationLabel` `00:01:40`; en `compact`,
   `0:01`.
7. **Cada consumidor con los dos valores**: S1 y C1 … C9 muestran, para una
   duración de 100 segundos (o el valor con segundos que corresponda), el texto
   compacto y el completo; C5 avanza cada segundo con el completo; el contador
   sigue en `h:mm:ss` sin relleno con los dos.
8. **La regla del compacto** (D-WS2a-5): dos entradas de 100 segundos en el mismo
   día muestran `0:01`, `0:01` y `0:03` con el compacto, y `00:01:40`,
   `00:01:40` y `00:03:20` con el completo, en el rastreador, la planilla y el
   calendario.
9. **La planilla** (D-WS2a-8):
   - con el completo, una celda con dos entradas que suman `00:03:20` muestra
     `00:05:20` al escribir `5`, mientras viaja y después; una con una sola
     entrada de `00:01:40` queda en `00:05:00`; teclear `3` sobre `00:03:20` no
     manda nada y el campo vuelve a `00:03:20`;
   - con el compacto, en la fila del ejemplo de D-WS2a-8 (A con 100 s y 60 s, B
     con 100 s y 100 s), escribir `5` en A muestra la fila en `0:09` mientras
     viaja, no en `0:08`;
   - un total de 30 segundos no es gris con el completo y sí con el compacto.
10. **El reporte, las exportaciones y el perfil no cambian** (D-WS2a-9): sus
    tests pasan sin cambiar lo que afirman —el único cambio en ellos es el
    literal de formatos del paso 1—, y la búsqueda de §5.6 da exactamente los
    dos `"compact"` del reporte.
11. **La migración** (D-WS2a-11): trae lo que dice la lista y nada más; corre
    sobre una base con datos sin cambiar ningún conteo; con los `check` del
    nombre, un `update` a `''`, a `' x'` o a 101 caracteres falla con `23514`.
12. **Compatible con el código anterior** (§2.2): la integración entera del
    árbol de `c08369d` pasa contra una base migrada con la `0019`, **salvo una
    falla esperada**: el `it` de `src/server/db/schema.integration.test.ts:40-47`,
    que afirma la lista exacta de columnas de `workspace_settings` y encuentra
    `duration_format` de más. Cualquier otra falla frena.
13. **Las consultas de §6** corren sin error contra una base local sembrada,
    antes y después de la `0019`, y dan lo que dice su comentario.
14. **La e2e del completo** (D-WS2a-12): el proyecto `duration-full` corre
    después de la suite, en una base nueva y en una que se reusa, y al terminar
    el workspace queda en `compact` (`durationFormatOf()`); con el workspace
    dejado en `full` a mano, la corrida siguiente arranca en `compact`.
15. **Las correcciones de paridad** de §7 están, fechadas.

## 9. Plan de tests

Cada test nuevo tiene que poder fallar: se verifica con una mutación en una
copia —un llamador que pase minutos en lugar de segundos, `timeSettingsOf` que
devuelva `"compact"` fijo, el `left join` cambiado por `inner join`, `cellCommit`
que devuelva el rótulo de lo tecleado, `writtenSeconds` que devuelva
`minutes × 60` siempre—, como en los slices anteriores.

### 9.1 Unidad

- `src/server/time/time.test.ts`: criterios 1, 3 y 4.
- **Cada consumidor del navegador con los dos formatos**, con
  `renderToStaticMarkup` y un `DisplayFormatsProvider` con `duration` en cada
  valor, como los tests de hoy; las funciones puras, directo:
  - C1: los totales del día y de la semana del rastreador (`day-group` y
    `week-group`, o un `use-group-total.test.tsx` nuevo que monte un componente
    mínimo con el hook) y los del calendario (`calendar-totals.test.ts` o el de
    `calendar-grid`), con dos entradas de 100 segundos.
  - C4: `calendar-gestures.test.ts`, `movedView` con los dos.
  - C5: `calendar-block.test.tsx`, el bloque del timer con 100 segundos de
    transcurrido.
  - C3: `manual-bar.test.tsx`, nuevo: el valor inicial del campo «Duración» con
    un borrador de 90 minutos, `1:30` y `01:30:00`.
  - C6: `entry-dialog.test.tsx`, el campo «Duración» con un trío distinto del de
    la entrada.
  - C7 … C9: `timesheet-model.test.ts` —el criterio 9 sobre el modelo, con los
    dos formatos: los totales, `zero`, `closedTotal`, `writtenSeconds` con
    cero, una y varias entradas, `cellCommit` en sus tres resultados, y **el
    caso del compacto de D-WS2a-8**, la fila con A y B que muestra `0:09`
    mientras viaja la escritura de `5` en A— y `timesheet-cell.test.tsx` (la
    celda en reposo con los dos).
  - El contador: `elapsed-counter.test.tsx`, nuevo (`frontend-dev`), con el
    proveedor en `full`: `0:01:40`.
- **Lo que solo aparece con interacción** —C2 mientras se edita el trío, lo que
  C3 y C6 muestran al confirmar, el campo de la celda después de C9— lo cubre la
  e2e del completo (§9.4); el compacto, la e2e de hoy.

### 9.2 Integración (Postgres)

- `src/server/db/schema.integration.test.ts`: el `it` de `:40-47` con la lista
  `[workspace_id, who_sees_all_entries, created_at, updated_at,
duration_format]`; la columna (`text`, `not null`, `default 'compact'`), su
  `check` (`23514` con `decimal`) y, si entran, los del nombre (criterio 11).
- `workspace/service.integration.test.ts`: `resolveDurationFormat` con `null`,
  `compact`, `full` y un valor desconocido; el criterio 5, con
  `setDurationFormat` y un `delete` de la fila de ajustes; el arranque en
  `compact`.
- `profile/service.integration.test.ts`: `timeSettingsOf` toma `duration` de
  `context.settings` y no de las preferencias (dos contextos con las mismas
  preferencias y formatos distintos).
- `time-entry/service.integration.test.ts`: S1 con los dos formatos, por
  `TrackerWorkspace` con `formats.duration` (criterio 7, servidor).
- `time-entry/actions.integration.test.ts`: criterio 6, con el workspace
  sembrado en cada valor y la sesión real.
- Los tests del reporte y de las exportaciones, sin cambiar lo que afirman
  (criterio 10).

### 9.3 La migración y la compatibilidad

En este orden, con bases propias:

1. **La subida con datos** (criterios 11 y 13): `clock_ws2a_upgrade`, migrada
   con el `drizzle/` de `c08369d` y sembrada con el `seed.sql` del volumen del
   reporte o con las fábricas; las consultas de §6.1; `npm run db:migrate` desde
   la rama; las de §6.3; los conteos de `workspace`, `workspace_settings`,
   `membership` y `time_entry`, iguales.
2. **El código anterior contra la base nueva** (criterio 12): un worktree
   temporal en `c08369d`, y su integración entera con
   `TEST_DATABASE_URL=…/clock_ws2a_compat`, una base nueva migrada con la rama
   (con la `0019`); `global-setup` no tiene nada que aplicar. **Falla un solo
   caso, el esperado**: el `it` de `src/server/db/schema.integration.test.ts:40-47`,
   por `duration_format`. El registro guarda la salida con esa falla y nada más.
   El worktree se borra después.
3. **La suite entera con la `0019`**: `test:all` y la e2e contra bases nuevas,
   y la e2e otra vez contra una que se reusa.

### 9.4 E2E

`e2e/duration-format.full.spec.ts`, en el proyecto `duration-full`
(D-WS2a-12), con entradas sembradas con segundos (`seedEntries` acepta
`"10:01:40"`) y las personas de cada test. Cada test afirma el completo, y el
contador donde aparece:

1. **Rastreador** (criterios 7 y 8): dos entradas de 100 segundos de hoy: las
   filas `00:01:40`, el día `00:03:20`, la semana igual. Con un timer
   sembrado, el contador en `0:00:…` (sin relleno) y el total de su día en
   `00:0…:…`, que cambia de un segundo al siguiente.
2. **Barra manual**: el campo «Duración» con el borrador en `hh:mm:ss`; teclear
   `1:30` lo muestra `01:30:00`; editar ese texto a `01:45:00` lo acepta;
   «Agregar» crea la fila con `01:45:00`.
3. **Editar el trío de una fila**: la duración de la fila mientras viaja, en
   `hh:mm:00`, y después la del servidor.
4. **Planilla** (criterio 9): la celda de dos entradas, `00:03:20`; escribir
   `5` la deja en `00:05:20` sin salto entre el pedido y la foto, y los totales
   de fila, de día y de semana la siguen; la celda de una entrada queda en
   `00:05:00`; teclear `3` sobre `00:03:20` no manda pedido (`recordActions`);
   el diálogo de entradas de la celda y el de quitar la fila muestran el
   completo.
5. **Calendario**: el bloque `00:01:40`; el total de la columna y el del
   período; el diálogo con el campo «Duración»; un arrastre muestra el bloque
   en `hh:mm:00` mientras viaja; el bloque del timer en `hh:mm:ss`, que avanza,
   y su diálogo con «Fin: en curso» y el contador en `h:mm:ss`.

El resto de la suite, en `chromium` con el compacto, es la otra mitad de «cada
pantalla con los dos valores» (criterio 2).

**La receta para iterar en local sobre el spec del completo** es el ciclo normal
de trabajo, no un atajo: filtrar el archivo no dispara `duration-full-setup`
(D-WS2a-12), y correr el proyecto con sus dependencias corre la suite entera.

1. Poner el workspace de los e2e en `full` con `psql` contra la base de la e2e
   (`clock_ws2a_e2e`):
   `update workspace_settings set duration_format = 'full' where workspace_id = (select id from workspace order by created_at, id limit 1);`
2. `npx playwright test --project duration-full --no-deps`, las veces que haga
   falta. `--no-deps` saltea el setup y el teardown, así que el workspace queda
   en `full` entre corridas.
3. La corrida siguiente de la suite —o de cualquier spec de `chromium`— lo
   vuelve a `compact` en `workspace.setup.ts`. Hasta entonces, los specs de
   `chromium` corridos con `--no-deps` contra esa base ven el completo.

La corrida que vale para el registro es la entera, sin `--no-deps` (criterio
14).

### 9.5 Lo que no se prueba

- Cambiar el formato con las pantallas abiertas (WS-64, WS-66 en vivo, WS-67,
  WS-69): no hay escritor; lo prueba WS2b con el selector.
- La consulta y el humo de producción: los hace el usuario en el momento (§6).

## 10. Riesgos

- **Un llamador que sigue pasando minutos** muestra `0:00` en lugar de `1:30`.
  Lo cubren el formato obligatorio (no compila sin visitarlo) y los tests con
  segundos de cada consumidor (D-WS2a-4).
- **Un consumidor que se escapa** muestra `1:30` donde el resto muestra
  `01:30:00`. Lo cubren la búsqueda de §5.6 y el spec del completo. En
  producción no se ve hasta WS2b, que es cuando alguien puede elegir el
  completo.
- **Los tests que dejan de compilar** con `DisplayFormats.duration` obligatorio
  están en módulos que WS2a no toca (`report`, `team`): su dueño es el commit
  del paso 1 (§7), y solo cambia el literal.
- **El rebase con WS1 y con el MCP**: conflictos de líneas vecinas en
  `workspace/service.ts`, `repository.ts`, `profile/service.ts`,
  `time-entry/service.ts`, `playwright.config.ts` y `e2e/database.ts` (§0), y la
  numeración de la migración, que resuelve D-WS2a-11 regenerando y nunca
  renombrando.
- **Una base compartida que recibe la `0019` antes de tiempo** puede saltear la
  migración del MCP regenerada con un `when` anterior. Lo evita §6.6: bases
  propias hasta producción.
- **El proyecto del completo depende de toda la suite**: si un test de
  `chromium` falla, Playwright no corre `duration-full`. CI ya está en rojo en
  ese caso. En local, iterar sobre el spec del completo es siempre la receta de
  §9.4 —`full` con `psql` y `--project duration-full --no-deps`—: es el ciclo
  normal, porque filtrar el archivo no corre el setup.
- **La e2e cortada en medio de `duration-full`**, o la receta de §9.4, dejan el
  workspace en `full`. Lo vuelve a `compact` el setup de la corrida siguiente
  (D-WS2a-12).
- **La planilla con el completo conserva los segundos sueltos** al escribir una
  celda con varias entradas (D-WS2a-8). Es una regla, y se ve recién con WS2b;
  pregunta 3.
- **Un borrador en minutos enteros** muestra `hh:mm:00` con el completo hasta
  la respuesta (ADR 0029, «Consecuencias»): pasa hoy con el compacto, más
  difícil de ver.
- **Revertir después del push sin conservar `schema.ts`** deja el esquema sin
  la columna y la instantánea con ella, y el próximo `db:generate` emitiría un
  `DROP COLUMN`. Lo evita la receta de §2.3.
- **Los `check` del nombre con una fila que no cumple**: la migración entera
  falla y no queda nada. Lo evita la consulta 4, corrida antes de generar.

## 11. Preguntas para el usuario

1. **¿Se acepta el ADR 0029?** Fija que el formato de duración es del workspace,
   que viaja en la sesión y que **solo cambia lo que se muestra**: toda suma es
   de segundos exactos y cada rótulo trunca una vez. Con el compacto, una fila
   y su total pueden no cerrar (`0:01` + `0:01` = `0:03`); con el completo, que
   es el que producción va a usar (P-07), cierran al segundo. La alternativa,
   redondear cada entrada en el compacto, mueve la regla a la base del reporte y
   a la planilla, y hace que un ajuste de presentación cambie totales.
   **Recomendación: aceptarlo.** Es la regla que el código ya aplica, ningún
   número cambia, y el caso que la distingue solo se ve con el compacto. Si la
   verificación de workspace P-09 (punto 7) muestra otra cosa en Clockify, se
   cambia con un ADR nuevo.
2. **¿`workspace.name` lleva los `check` de los demás nombres en la `0019`?**
   `char_length(name) between 1 and 100` y `name = btrim(name)`, la pregunta 1
   de WS1. **Recomendación: sí, en la `0019`.** Son compatibles con todo
   escritor de hoy (D-WS2a-10), la consulta 4 de §6.1 dice antes si el nombre de
   producción los cumple, y con ellos un script o un SQL a mano no pueden dejar
   el encabezado vacío o con mil caracteres. Sin respuesta antes de generar la
   migración, salen sin ellos y la pregunta pasa a E4.
3. **Con el completo, ¿escribir una celda de la planilla con varias entradas
   tiene que borrar los segundos sueltos?** Hoy una celda escribe en minutos
   (TS-34, ADR 0018): si sus entradas suman `02:13:27` y se escribe `2:15`, queda
   en `02:15:27`. Con el compacto no se ve; con el completo, sí. Quitarlos
   cambia lo que escribe una celda: la entrada que se agrega puede durar menos
   de un minuto, y teclear lo que la celda ya muestra en minutos pasaría a
   escribir. **Recomendación: no en WS2a.** WS2a muestra la regla de hoy sin
   cambiarla (D-WS2a-8), y los segundos sueltos vienen solo de entradas del
   timer. Si con producción en el completo molesta, es un cambio chico de la
   planilla con su propio contrato.

## 12. Fuera de alcance

- **El selector** de «Registro de tiempo», su action, `workspace.settings.update`
  para el formato, WS-56, WS-62 y WS-64 del formato, WS-69 y WS-73 en la
  pantalla: WS2b.
- **El reporte, las exportaciones y el perfil** con el formato, y los anchos del
  PDF con el completo: WS2b (D-WS2a-9).
- **Poner producción en el completo** (P-07): con WS2b desplegado.
- **El decimal** (PF-20, perfil P-01): fuera, por ser de plan pago.
- **El contador del timer** con el formato: fuera (PF-22, perfil P-06).
- **Cambiar lo que escribe una celda** con segundos sueltos: pregunta 3.
- **El primer día por defecto del workspace** (WS-08): E4, con su columna.
