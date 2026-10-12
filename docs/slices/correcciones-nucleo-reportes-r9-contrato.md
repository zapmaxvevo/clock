# Correcciones del contrato de R9 — primera pasada (2026-10-12)

Revisión de `architecture-reviewer` sobre
`docs/slices/nucleo-reportes-r9-personas-sin-horas.md` (rama
`nucleo/r7-contrato`, commit `bc9af1e`). La rama solo suma documentos sobre
`main`, así que lo revisé contra el árbol de `31a83b3`. Las líneas sin archivo
son del contrato.

## Veredicto

**Aprobado**, con cuatro hallazgos menores que se aplican sin otra pasada. No
hay bloqueantes ni mayores.

## Hallazgos

### Menores

**1. La lista de archivos compartidos con R7 está incompleta, y conviene
recomendar un orden.**

- **Dónde:** §0 `:296-301`; §10, «Para el team-lead» `:1064-1069`.
- **Qué pasa:** la superposición es real y más amplia que la que nombra el
  contrato. R7, aprobado en `ce2bfde`, y R9 tocan los dos:
  - `report/schema.ts`;
  - `report/service.ts`: en R7, `ReadPlan.exporting`, la firma de
    `readReportState` y la de `getReportExport`; en R9, `ReadPlan`,
    `readReport`, `readLevelsWithinLimit` y el estado;
  - `export/document.ts` (en R7, `exportDocumentOf`; en R9, `headerOf`) y
    `export/labels.ts`;
  - **`components/labels.ts`** y **`report-toolbar.test.tsx`**: en R7,
    `exportFormatLabels.pdf`; en R9, los textos y el enlace;
  - **`service.integration.test.ts`, `scope.integration.test.ts` y
    `handler.integration.test.ts`**, que los dos editan en su paso 1, R7 por la
    firma de `getReportExport` y R9 por `ReportRequest`;
  - **`export/document.test.ts`**;
  - `e2e/reports-page.ts` y `e2e/reports.spec.ts`.

  En el árbol compartido no pueden ir en paralelo: dos `backend-dev`
  reescribiendo `service.ts` y los mismos tests a la vez.

- **Cuál orden es más barato: R9 primero.**
  - R9 no espera nada. R7a sigue esperando las preguntas 1 y 2 del usuario: la
    medición de `b26c589` recomienda `pdfkit` y Noto Sans, y la decisión es
    suya.
  - El retrabajo de ir segundo es parecido en los dos órdenes: R9 suma un campo
    a `ReportRequest` y R7 un argumento a `getReportExport`, sobre las mismas
    cinco llamadas. Pero con R9 primero, R7 escribe sus casos nuevos (los
    pedidos del PDF en `handler.integration.test.ts`) ya con
    `peopleWithoutTime` y su PDF hereda la fila «Personas sin horas» sin
    cambios (D-R9-10).
  - Con R7 primero, R9 tiene que sumar el caso del PDF al criterio 15 y la
    edición mecánica de su paso 1 alcanza también a los fixtures nuevos de R7.
- **Cambio:** completar la lista de §0 con los archivos en negrita y que §10
  recomiende R9 primero mientras R7a espera al usuario, en lugar de «el que
  tenga el contrato aprobado primero», porque R7 ya lo tiene y está bloqueado.

**2. El criterio 11 no dice la fecha de ingreso de las 3001 personas que
siembra.**

- **Dónde:** criterio 11 `:855-859`.
- **Qué pasa:** el `insert … select generate_series` en `membership`, sin
  `created_at`, toma `defaultNow()` (`db/schema.ts:112`). El período del test
  es anterior al reloj real, así que las 3001 quedarían fuera de las candidatas
  (`joinedAt < until`) y el caso no cortaría el primer nivel. La regla general
  de `:796-798` lo cubre, pero este es justo el caso donde se olvida, porque la
  siembra es una sola sentencia en bloque.
- **Cambio:** que el criterio diga «con `created_at` anterior al período en el
  mismo `insert`», y que §8.1 sume el mutante «las 3001 con `created_at` por
  omisión» que cae por `levelsShown`.

**3. `setJoinedAt` rompe la convención de los helpers de e2e.**

- **Dónde:** §0 `:304-307`; §7, e2e `:717-719`.
- **Qué pasa:** los helpers de `e2e/database.ts` que cambian a una persona
  reciben el email (`setRole`, `setDisplayName`, `setWeekStart`, `:433-490`),
  y `seedPerson` no devuelve el id. `setJoinedAt(userId, instant)` obliga a
  pasar por `userIdOf` en cada llamada.
- **Cambio:** `setJoinedAt(email, instant)`, como `setRole`, con la misma
  guarda de una fila.

**4. `joinedAt` no siempre va a ser «el primer ingreso».**

- **Dónde:** D-R9-2 `:83-89`; §4.5 `:558-561`; §9 `:1008-1013`.
- **Qué pasa:** hoy es cierto: nada crea membresías `invited` (solo se siembran)
  y `ensureWorkspaceContext` crea la membresía al entrar. Cuando la fase 2 traiga
  las invitaciones, la membresía se va a crear al invitar, y `created_at` va a
  ser la fecha de la invitación. Una invitada que entra semanas después
  aparecería sin horas en los períodos que median.
- **Cambio:** que el comentario de `joinedAt` diga «`membership.created_at`:
  desde cuándo existe la membresía; hoy, el primer ingreso», y sumar a §9 la
  deuda: con invitaciones, la candidata necesita la fecha de activación, no la
  de creación.

## Firmas compiladas

Las compilé en un archivo temporal del scratchpad, ya borrado, con el `tsc` del
repo (5.9.3), la `lib` y `strict` del `tsconfig.json`. Usé `LevelTotalRow`,
`ReportPersonGroup`, `ReportGroup`, `ReportReadyState`, `ReportFilters`,
`compareNames` y `displayNameOf` reales del árbol. **Compila sin errores**:

- `ReportGrouping` con `peopleWithoutTime`; `reportLevelsOf` con `Pick`,
  llamado con el estado (que lleva la opción) y con un literal sin ella;
- `reportPeopleWithoutTimeParams` como `z.object({ "sin-horas": z.literal("1") })`,
  y el `refine` del estado. Va en el objeto base: en zod 4, extender un esquema
  ya refinado no vale, así que el campo se suma dentro del `z.object` de
  `reportReadyState`;
- `ReportRequest` con `peopleWithoutTime` y `WorkspacePerson` con `joinedAt`;
- `withoutTimeCandidates` y `peopleWithoutTimeOf`, que devuelve
  `ReportPersonGroup[]` sin `children`;
- `readLevelsWithinLimit` con el tercer argumento `firstLevelExtra`, y
  `groups: [...treeOf(…), ...withoutTime]` como `ReportGroup[]`;
- `ReportLocation` con la opción obligatoria (un `reportHref` sin ella falla en
  un `@ts-expect-error`), `withLevel` con
  `peopleWithoutTime && resultado.groupBy === "person"` y el `href` del enlace
  con la opción invertida.

Al escribir `readLevelsWithinLimit` quedó claro el orden que el contrato
describe: con el primer nivel leído y `firstLevelExtra` sumado, si pasa el
presupuesto, la lista sale vacía (`levelsShown: 0`). Si el primer nivel no tiene
filas pero hay candidatas que entran, se guarda vacío y `levelsShownOf` da todos
los niveles pedidos, como pide el criterio 9.

## Lo que se verificó y quedó bien

- **Supuestos de §0:** coinciden con `31a83b3` en archivo y línea:
  `ReportGrouping` y `reportLevelsOf` (`schema.ts:145-153`), `ReportRequest`
  (`service.ts:103-112`), `scopeOf`, `readLevelsWithinLimit`, `readReport`, el
  estado, `WorkspacePerson` y `listPeople`, `membership.created_at`, los
  permisos (`timeEntry.others.view` de owner y admin; `team.view` y
  `report.view` de todos), `ReportLocation` y `reportQuery`, `groupingOf` y
  `withLevel`, el árbol (`expandable` y el espacio del chevrón), `ReportView`
  con el `key` y «Quitar filtros», y el documento.
- **`ReportLocation` y `withLevel`:** cambian como dice el contrato. La fórmula
  da lo que pide el criterio 16 en todas las transiciones: Persona en el
  nivel 0 la conserva; Proyecto en el nivel 0, también por el intercambio
  desde Persona → Proyecto, la apaga; ninguna la enciende. Los nueve llamadores
  de `reportHref` y `reportExportHref` esparcen `grouping` o están en la lista
  de cambios (`report-view.tsx:38`, `:139`).
- **Alcance de un member, un `project_manager` o un `team_manager`:** la opción
  efectiva exige `everyone` antes de angostar, `listPeople` no se llama con
  `self`, y el `refine` impide la opción con `filterOptions.people` en `null`.
  Los criterios 14 y 29 lo cubren, también con `personas=` ajenas.
- **R4:** las candidatas salen de los filtros efectivos, una invitada o un id
  ajeno se ignora, y con cliente o proyecto vale «quién no cargó en lo
  filtrado» (criterio 8).
- **R5:** el gráfico mira las entradas, y los dos `refine` del estado se
  mantienen.
- **R6:** el resumen lleva las filas sin cambios en `summaryOf`. B4 mide el
  documento entero y las 3000 filas acotan el resumen, así que no cambia; la
  ruta usa `reportRequestOf`, que lee `sin-horas`, y el handler no se toca.
- **RP-33:** la tabla de D-R9-9 es coherente con `levelsShownOf` y con
  `EmptyRow`.
- **Criterios:** verificables, con mutantes por criterio; el borde de `joinedAt`
  está en el criterio 5 y el tope en el criterio 11 (con el hallazgo 2).
- **Permisos y ADR:** sin acción nueva ni ADR, y ninguno aceptado queda
  contradicho.

## Respuesta del architect

Los cuatro menores están aplicados en el contrato, sin otra pasada.

1. **Archivos compartidos y orden.** §0 nombra todos los archivos que R9 comparte
   con R7: los de la lista de arriba, con `components/labels.ts`,
   `report-toolbar.test.tsx`, `document.test.ts` y los tres tests de
   integración. El orden es **R9 primero**, por decisión del team-lead: R7 está
   rehaciendo su contrato para `pdfkit`, y así su PDF hereda «Personas sin
   horas» sin cambios. Eso arrastra tres ajustes de coherencia:
   - el criterio 15 ya no tiene el caso condicional del PDF: lo suma R7a en su
     contrato, y §10 se lo indica;
   - D-R9-10 dice que el PDF, que va después, hereda la fila;
   - los recorridos pasan a ser el **26 y el 27** (antes, 28 y 29), y R7a
     numera los suyos a continuación. Este cambio también alcanza a la mención
     del recorrido 29 en «Lo que se verificó y quedó bien», que ahora es el 27.
2. **Criterio 11.** Las 3001 personas llevan `created_at` anterior al período en
   el mismo `insert`, y la regla general del principio de §8 dice que el valor
   puede ir en el `update` o en el `insert`. §8.1 suma el mutante «las 3001 con
   `created_at` por omisión», que cae porque `levelsShown` no llega a 0.
3. **`setJoinedAt(email, instant)`**, como `setRole`, con la misma guarda de una
   fila (§0 y §7). La tabla de supuestos suma la convención
   (`e2e/database.ts:433-490`).
4. **`joinedAt`.** El comentario de §4.5 dice «desde cuándo existe la membresía;
   hoy, el primer ingreso», y aclara que con las invitaciones de la fase 2 pasa
   a ser la fecha de la invitación. D-R9-2 y la pregunta 2 de §10 dicen lo
   mismo. §9 suma la deuda: con invitaciones, la candidata necesita la fecha de
   activación y no la de creación, y ese slice cambia `joinedAt` en
   `listPeople`. §11 la nombra entre lo que queda fuera.

El encabezado del contrato registra la revisión aprobada y enlaza este
documento.
