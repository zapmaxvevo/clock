# Estado de la fase 1

Registro vivo de por dónde va la ejecución. Se actualiza al cerrar cada paso;
quien retome el trabajo empieza acá. Última actualización: 2026-10-16 (decimotercera sesión).

## Dónde estamos

| Slice                                       | Estado    |
| ------------------------------------------- | --------- |
| 1 — Timer sin proyecto                      | En `main` |
| 2 — Modo manual                             | En `main` |
| 2b — Reintento de «Iniciar»                 | En `main` |
| 3 — Corregir horas y fecha                  | En `main` |
| 4 — Continuar, duplicar, descartar, atajos  | En `main` |
| 5 — Semana y paginación                     | En `main` |
| 9 — Núcleo de proyectos                     | En `main` |
| 10 — Selector de proyecto y tarea           | En `main` |
| 7 — Perfil                                  | En `main` |
| 6 — Selección y acciones en masa            | En `main` |
| 7b — Perfil: nombre editable y tema         | En `main` |
| 8 — Calendario: lectura                     | En `main` |
| 8c — Calendario: escritura                  | En `main` |
| 8b — Calendario: arrastre                   | En `main` |
| 11a — Facturable                            | En `main` |
| 11b — Etiquetas                             | En `main` |
| 12 — Edición masiva de proyecto y etiquetas | En `main` |
| 2c — «Reintentar» en el alta manual         | En `main` |
| Arreglo: piso de fechas fijo (2000-01-01)   | En `main` |
| 13 — Planilla de horarios semanal           | En `main` |
| 13b — Planilla: menú y detalle de la celda  | En `main` |
| Núcleo de reportes, R1                      | En `main` |
| Núcleo de reportes, R2a                     | En `main` |
| Núcleo de reportes, R2b                     | En `main` |
| Núcleo de reportes, R3a                     | En `main` |
| Núcleo de reportes, R3b                     | En `main` |
| Núcleo de reportes, R4a                     | En `main` |
| Núcleo de reportes, R4b                     | En `main` |
| Núcleo de reportes, R10a                    | En `main` |
| Núcleo de reportes, R10b                    | En `main` |
| Núcleo de reportes, R5                      | En `main` |
| Núcleo de reportes, R6a y R6b               | En `main` |
| Núcleo de reportes, R9                      | En `main` |
| Núcleo de reportes, R7a                     | En `main` |
| Núcleo de reportes, R7b                     | En `main` |
| Núcleo de reportes, R8                      | En `main` |
| Fase 2, E1a — Invitar y revocar             | En `main` |

Los slices 1 a 13 (con 2b, 2c, 7b, 8b, 8c, 11a y 11b) y el arreglo del piso fijo están en `main`.
El 13 (planilla de horarios) se mergeó el 2026-10-08 con lint, typecheck, 1279 de unidad, 1223 de
integración, `next build` y 171 de 171 e2e en verde, dos corridas sobre una base nueva; el spec de
la planilla, 17 de 17 en tres corridas. Sus seis revisiones y las correcciones están en
`correcciones-fase1-slice13-arranque.md` y `-revisiones.md`. Pusheado hasta `07674bc`: el usuario
tiene que pushear el merge del 13. Postgres local: `docker start clock-pg`; los e2e corren contra
una base nueva (`DATABASE_URL=…/clock_e2e13final`), porque `clock` tiene un segundo workspace
vacío del owner y `renewWorkspace` se corta.

## Lo primero de la sesión siguiente

0. **Lo que sigue** (cierre de la cuarta sesión, 2026-10-09, ~02:10).
   - **Push**: lo hace el team-lead después de cada merge en verde (el usuario sacó el `deny` de
     `git push` y `gh pr merge` en `.claude/settings.json`, **cambio local suyo, no se commitea**;
     `.idea/` tampoco). `origin/main` está en `23de226`, al día.
   - **R2a** en `main` (`314e8b9`): corrida final sobre `6e68af0` con `reports.spec.ts` 7/7 ×3,
     la suite 191/191 ×2 y los once mutantes caídos; el cierre está en
     `correcciones-nucleo-reportes-r2a-revisiones.md`. La rama no compila entre `aff26e5` y
     `9ad028f` (un `git rm` ajeno en el índice compartido); HEAD sí. No se reescribe.
   - **Arreglos de CI** en `main`: `fix/postgres-18` (`b0e34ed`) y `fix/zona-de-la-maquina`
     (`23de226`), con lint, typecheck, 1419 de unidad, 228 de `test:time-ar` y 1275 de
     integración en Postgres 18. **CI de `main` en verde** desde `23de226` (`verify` e
     `integration`; desde el 2026-10-09, PR #1, `e2e` corre contra un servidor local y un Postgres en contenedor).
   - **Postgres local en 18** (2026-10-09, decisión del usuario): `clock-pg` (puerto 5432) es
     `postgres:18-alpine` con las 31 bases restauradas de un `pg_dumpall`; el contenedor 17 quedó
     parado como `clock-pg17` (respaldo, se puede borrar) y `clock-pg18` (5433) sigue aparte.
     Integración 1275/1275 con la configuración por defecto.
   - **R2b, comprobación contra Neon** (decisión del usuario): en el preview de la rama apenas
     `totalsByBucket` esté, siempre antes del merge; se le avisa al usuario en ese momento.
   - **R2b en `main`** (2026-10-09): seis revisiones, ronda de correcciones, corrida final en verde
     y la comprobación contra Neon del usuario pasada en el preview de `6561286`
     (`correcciones-nucleo-reportes-r2b-revisiones.md`, «Cierre»). El preview de Vercel tiene
     `DATABASE_URL` (rama `preview` de Neon), `BETTER_AUTH_SECRET` y `BETTER_AUTH_URL` propios;
     `BETTER_AUTH_URL` quedó cargado solo para la rama `nucleo/r2b-atajos`.
   - **R3a en `main`** (2026-10-09): tarea y etiqueta en un nivel, parte A del contrato
     de R3. Seis revisiones (cinco aprobadas; código pidió cambios sin efecto en el
     comportamiento), ronda de correcciones y corrida final en verde sobre `feab6e1`: 1499 de
     unidad, 277 de `test:time-ar`, 1302 de integración y e2e 195/195 ×2. No hizo falta la
     comprobación contra Neon (sin forma de parámetro nueva). Todo en
     `correcciones-nucleo-reportes-r3a-revisiones.md`.
   - **R3b en `main`** (2026-10-09): subgrupos de hasta tres niveles, tope de 3000 filas y
     expandir. Seis revisiones (backend, seguridad y paridad sin hallazgos), ronda de
     correcciones y corrida final en verde sobre `8fc687e`: 1561 de unidad, 277 de
     `test:time-ar`, 1329 de integración y e2e 197/197 ×2. Sin comprobación contra Neon (sin
     forma de parámetro nueva). Pedidos enteros: 127 ms y 223 ms. Payload de 3000 filas: 278 KB.
     Todo en `correcciones-nucleo-reportes-r3b-revisiones.md`. Con esto, R3 entero está en
     `main`.
   - **Lo que sigue** (decisión del usuario del 2026-10-09: seguir con R4 y con lo que venga
     después, sin frenar hasta que él diga): R4 (filtros, mapa §R4: RP-25 reducido a personas,
     cliente y proyecto, RP-26 solo «sin proyecto», RP-33, RP-34 y RP-62). Después R5, R6, R7 y
     R9, en el orden del mapa. R8 (cambiar el rol, mapa §R8) no toca la pantalla del reporte:
     su contrato se puede escribir en paralelo al de R4, y su implementación va en un worktree
     aparte. Para R4, el encargo del `architect` hereda la forma de los contratos de R3 y R3b y
     los riesgos del mapa: los catálogos los dan `project` y `workspace` (ADR 0010), las
     inactivas se siembran por base, las invitadas no aparecen, y el filtro de personas pasa por
     el `ReportScope` (un member con ids ajenos ve lo propio). Lecciones de R3 para el
     pipeline: cada agente con su base de test propia, y la de e2e creada y migrada antes;
     corridas en primer plano; el `parity-analyst` no puede escribir `reportes.md`, así que el
     team-lead aplica su texto.
     Decisiones del usuario del 2026-10-09 (quinta sesión): lo abierto al recargar se acepta
     como está (todo contraído, sin URL; pregunta 2 de §10 de R3, cerrada); P-11 entra al
     núcleo como **R10** (agrupar por descripción, mes y semana, mapa §R10), en serie después
     de R4 y antes de R5; `npm audit` con altas solo de desarrollo (S1 de R3a) lo delegó en el
     team-lead: se toleran, porque CI audita solo producción, y se revisa cuando haya versión
     corregida. Sigue abierta para el usuario P-05 (sesión de relevamiento).

     Deuda nueva: `Executor` común en `src/server/db/` (C13 de R3a).

     Quinta sesión: los contratos de R4 (`nucleo-reportes-r4-filtros.md`) y R8
     (`nucleo-reportes-r8-cambiar-rol.md`) en `main` (`be55db3`), aprobados por
     `architecture-reviewer` en dos rondas cada uno. **R8: solo el contrato** (decisión del
     usuario del 2026-10-09; adelantarlo no había sido decisión suya); antes de implementarlo,
     ronda corta contra el árbol (§0). R4 se parte en **R4a** (cliente y proyecto) y **R4b**
     (personas); R10 arranca con R4b mergeado. Sin comprobación contra Neon (D-R4-11). R4 y R8
     tienen cada uno su lectura de personas (`workspace` y `team`); unificarlas es de la fase 2.
     **R4a en `main`** (`cd77a5b`): filtros de cliente y de proyecto. Seis revisiones (frontend
     pidió un mayor, el botón sin truncar), ronda de correcciones, segunda pasada de frontend
     aprobada y corrida final en verde salvo un flaky previo del rastreador
     (`correcciones-nucleo-reportes-r4a-revisiones.md`, «Cierre»). **Sigue R4b** (personas)
     desde el paso 6 del contrato, con C11 (sacar el cuerpo de la transacción de
     `getReportState` a `readReport`) al arrancar. Deuda nueva: `e2e/tracker.spec.ts:477`
     falla 6 de 10 en `main` esperando la respuesta del blur; `ProjectColorDot` común (sexta
     copia); el borde invisible de las flechas del reporte (`buttonVariants` sin `cn`); los
     popovers de período y subnivel sin nombre accesible.

     **Al cortar la quinta sesión** (2026-10-09, ~15:15, por el tope de uso): rama
     `nucleo/r4b` desde `2aff669`, en checkout en el árbol principal y pusheada. `backend-r4a`
     (sesión `f88c70a0-…`, transcript en `subagents/agent-abackend-r4a-*.jsonl`) arrancó C11 y
     el paso 6 de R4b; si no hay commits nuevos en la rama, relanzar un `backend-dev` con el
     mismo encargo (C11 en su commit; pasos 6, 8 y 9; base `clock_r4b_back`). Frontend,
     test-engineer y e2e de R4b todavía no arrancaron: se lanzan con el hash del paso 6, como
     en R4a, con `clock_r4b_front`, `clock_r4b_test` y `clock_r4b_e2e` (esta migrada), y
     `parity-analyst`/`parity-reviewer` con base propia. R4b lleva la revisión de seguridad
     completa (§7, paso 11, B). El flaky de `e2e/tracker.spec.ts:477` quedó arreglado en `main` (`d5bc75e`, fast-forward): el test suponía que `page.clock.install()` detiene el reloj, y en Playwright 1.63 solo lo hace `pauseAt`, así que el rebote de 500 ms guardaba antes del blur. `stopClock(page)` en `e2e/clock.ts`; 20/20 con el arreglo, 5 de 20 fallan sin él. Deuda: `stopClock` también en `:383` y `:403`, que dicen tener el reloj detenido (pasan 40/40). `nucleo/r4b` lo recibe al mergear `main`. Mirar `git worktree list` y `git branch` al retomar. **Sexta sesión** (2026-10-09, ~15:00):
     el tope de uso cortó a los cuatro agentes de R4b a las 12:29 en medio de una edición,
     después de que el team-lead los reactivara pese al aviso de tope del usuario (lección en la
     memoria `tope-de-uso`). Su trabajo a medias quedó sin commitear en el árbol, con una copia
     en parches por área en el scratchpad de la sesión `da8db711-…` (`r4b-corte/`): backend
     (paso 8), frontend (paso 7), integración (`scope.integration.test.ts`) y e2e (helpers).
     Se relanzó de a dos. `backend-r4b` (pasos 8 y 9) y `frontend-r4b`
     (paso 7) relanzados sobre ese trabajo; integración y e2e, con el hash del paso 8. **R4b en `main`** (2026-10-09): el filtro de personas. Seis
     revisiones aprobadas (de a dos), ronda de correcciones y corrida final en verde sobre
     `4aa6b01`: 1652 de unidad, 277 de `test:time-ar`, 1397 de integración y e2e 201/201 ×2.
     Todo en `correcciones-nucleo-reportes-r4b-revisiones.md`. Deuda nueva: C4, C5 y C6 de R4b
     (copias de helpers de test y `seedUser` posicional). **Sigue R10** (agrupar por
     descripción, mes y semana, mapa §R10): primero su contrato.

     **Al cortar la sexta sesión** (2026-10-09, ~18:30, por el 40 % de contexto, regla del
     usuario): contrato de R10 en `main` (`1b1f1bc`), aprobado en dos rondas; se parte en R10a
     (mes y semana) y R10b (descripción). El usuario aceptó agrupar la descripción por el texto
     exacto. **R10a**, rama `nucleo/r10a` (pusheada), implementada entera y con cuatro de seis
     revisiones: backend, seguridad y frontend aprobadas; tests pide un mayor. Todo en
     `correcciones-nucleo-reportes-r10a-revisiones.md`. **Al retomar**:
     (1) `clean-code-reviewer` y `parity-reviewer` (base propia `clock_r10a_parity`, crearla y
     migrarla antes); (2) la ronda de correcciones a un `backend-dev` (T1, T2, B1) más lo que
     pidan código y paridad; (3) aplicar el texto de paridad («13. Núcleo, R10») y T3 en el
     contrato; (4) corrida final con bases nuevas (lint, typecheck, `test:all`, e2e completa ×2)
     y merge. Bases que quedan: `clock_r10a_back`, `clock_r10a_front`, `clock_r10a_test` y
     `clock_r10a_e2e`. Después, R10b; F1 de frontend (`truncate` en la tabla) entra en su
     encargo. R8 sigue solo
     en contrato. Después de R4b: R10, R5, R6, R7 y R9.

     **R10a en `main`** (`19e70db`, séptima sesión, 2026-10-09): agrupar por semana y por mes.
     Seis revisiones (código con cinco menores, paridad sin hallazgos), ronda de correcciones
     (`bdeeac8`, `4e511ac`) y corrida final en verde sobre `4e511ac`: 1689 de unidad, 298 de
     `test:time-ar`, 1422 de integración y e2e 203/203 ×2. Texto de paridad en `reportes.md`
     (sección 13). Todo en `correcciones-nucleo-reportes-r10a-revisiones.md`. **Sigue R10b**
     (descripción, parte B del contrato de R10); su encargo de frontend lleva
     F1 de R10a y N1 de paridad (la tabla a 320 px). Bases de R10a que se pueden borrar:
     `clock_r10a_back`, `_front`, `_test`, `_e2e`, `_parity`, `_final_test` y `_final_e2e`.
     **R10b en `main`** (octava sesión, 2026-10-10): paridad aplicada en `reportes.md` (`43225c0`),
     e2e 205/205 ×2 sobre `6920a06` (Chromium headless volvió a dibujar tras el reinicio) y la
     corrida final de `718cf32` con lint, typecheck, 1702 de unidad, 298 de `test:time-ar` y 1444
     de integración. Ruido sin fallos: `The destination stream closed early` en el log del
     servidor de e2e (~15 por vuelta). Aviso: la `DATABASE_URL` del `.env` del usuario falla contra
     el Postgres local; los agentes usan la cadena de `e2e/environment.ts`. Merge `b0262e0`
     pusheado, con lint, typecheck y e2e 205/205 sobre el merge. **Sigue R5** (gráfico de barras, mapa §R5) y
     después el resto sin parar (decisión del usuario del 2026-10-10, novena sesión: «r5 y
     despues segui sin parar»): R6, R7 y R9 en el orden del mapa; R8 sigue solo en contrato
     salvo que él lo pida.
     **R5 en `main`** (novena sesión, 2026-10-10): el gráfico de barras. Contrato aprobado en dos
     pasadas; seis revisiones (backend, seguridad, frontend y tests aprobadas; código y paridad
     pidieron cambios), ronda de correcciones, segunda pasada de frontend aprobada y corrida
     final en verde sobre `ba53958`: 1773 de unidad, 300 de `test:time-ar`, 1489 de integración
     y e2e 207/207 ×2. Desvíos D1 (marcas angostas por debajo de 24rem), D2 (modificadores) y
     P6 (la barra enfocada se aparta 3 px del contorno; a 320 px con 31 columnas queda en
     ~0,6 px). Todo en `correcciones-nucleo-reportes-r5-revisiones.md`. Deuda nueva: el foco del
     summary de `report-tree.tsx:91` con colores forzados (`outline-none`, F1 de R5); con
     JavaScript desactivado, `/reportes` queda en «Cargando el reporte» (el `Suspense` de
     `page.tsx:24`). **Sigue R6** (CSV y Excel, mapa §R6): primero su contrato. Bases de R5 que
     se pueden borrar: `clock_r5_*`.

     **Al cortar la novena sesión** (2026-10-10, ~17:15, a pedido del usuario): contrato de R6
     escrito por el `architect` (`docs/slices/nucleo-reportes-r6-exportar-csv-y-excel.md`,
     `48af8a6`, rama `nucleo/r6-contrato`, pusheada), **sin revisar**. Se parte en **R6a** (ruta
     `src/app/(app)/reportes/exportar/<formato>/route.ts`, `ExportDocument`, CSV con resumen y
     entradas una por una, decisión del mapa §5, y el grupo «Exportar» en la barra) y **R6b**
     (Excel). No abre ADR. **Al retomar**: (1) `architecture-reviewer` sobre el contrato hasta
     aprobar; (2) merge del contrato y el pipeline de R6a, con las bases por agente creadas
     antes y `TEST_DATABASE_URL` en los encargos. **Preguntas para el usuario**: (a) `exceljs`
     4.4.0 trae `uuid <11.1.1` (GHSA-w5hq-g745-h8pq, moderada, en producción); el `architect`
     recomienda aceptarla porque `exceljs` usa `uuid` solo como `v4()` sin `buf`, en formato
     condicional que no se escribe (`cf-rule-ext-xform.js`), a confirmar por `security-auditor`;
     las otras opciones son un escritor propio sobre `node:zlib` u otra biblioteca. Bloquea solo
     R6b. (b) Si cada exportación va al `audit_log`; recomienda que no; no bloquea. Notas del
     `architect` para el team-lead: sin `download` ni RFC 5987 (D-R6-5, D-R6-10); el tope de R3
     vale solo para el resumen; la comprobación en Vercel queda para después del despliegue.
     Q25 de R10, medida de nuevo sin carga: 53,0 ms (≤ 150). Bases sin
     borrar (el permiso lo frenó): `clock_r10a_*` y `clock_r10b_final_*`.

     **Décima sesión** (2026-10-12): respuestas del usuario a las dos preguntas de R6. (a)
     `exceljs` se acepta con la alerta de `uuid`, siempre que el `security-auditor` de R6b
     confirme que la ruta vulnerable no se ejecuta; se revisa cuando haya versión corregida. (b)
     Las exportaciones **no** van al `audit_log`. `architecture-reviewer` lanzado sobre el
     contrato (primera pasada). Pedido del usuario (2026-10-12): «seguí sin parar con R6a, R6b,
     R7 y R9», en ese orden. R8 sigue solo en contrato. **Contrato de R6 aprobado** en dos
     pasadas (`correcciones-nucleo-reportes-r6-contrato.md`): nueve hallazgos, «Horas» trunca
     al centésimo (opción A, decisión del team-lead), mutante de la subconsulta de etiquetas
     declarado equivalente. Merge del contrato a `main` y arranque de R6a en la rama
     `nucleo/r6a-csv`, con las bases `clock_r6a_{back,front,test,e2e,parity}` ya creadas
     (e2e, parity y front migradas). Al mergear R6a, el team-lead aplica a CLAUDE.md el texto
     de §10 «Para el team-lead», punto 6. **CI de `main`** estuvo en rojo desde el merge de R10b
     (`format:check` sobre `correcciones-nucleo-reportes-r10b-revisiones.md`, así que `e2e` no
     corría en CI); arreglado en `c19d04c`, con `verify`, `integration` y `e2e` en verde.
     **R6a implementado** en `nucleo/r6a-csv` (`b0c56cf`..`098ff93`): pasos 1–7 hechos, el texto de
     paridad aplicado (`34ffd6a`), mediciones dentro del presupuesto (Q40–Q43 ≤ 160 ms, E1–E5
     ≤ 604 ms y ≤ 1,57 MB). Seis revisiones lanzadas sobre `098ff93` (bases
     `clock_r6a_rev_*`, puertos 3102 paridad y 3103 frontend); al llegar, se juntan en
     `correcciones-nucleo-reportes-r6a-revisiones.md`. Pendientes para esa ronda: «10000» frente a
     «10 000» en el aviso de entradas; D-R6-6 generaliza de más con etiquetas en un subnivel
     (salvedad ya en RP-18); el criterio 13 (abrir el CSV) con LibreOffice, que está instalado.
     `backend-dev` corrió mutantes del paso 3 en el árbol compartido (revertidos, árbol limpio).
     **R6a en `main`** (2026-10-12): exportar a CSV. Seis revisiones (tests pidió cambios; las
     demás aprobaron con menores), dos rondas de correcciones (la cota de lectura de seguridad:
     S1, S2 y S3, con `statement_timeout` de 8 s en la exportación) y corrida final en verde
     sobre `5b3aeff`: 1854 de unidad, 303 de `test:time-ar`, 1537 de integración, e2e 209/209 ×2
     y `reports.spec.ts` ×3. CLAUDE.md con la ruta de descarga. Todo en
     `correcciones-nucleo-reportes-r6a-revisiones.md`. **Sigue R6b** (Excel): para el
     `architect` o `backend-dev`, B4 (la cota de las entradas por formato: la del CSV no vale
     para el `.xlsx` comprimido). Bases de R6a que se pueden borrar: `clock_r6a_*`.
     **R6b en `main`** (2026-10-12): exportar a Excel. B4 resuelto por el team-lead: el tope de
     las entradas es del documento medido como CSV, igual para los dos formatos. Revisiones:
     seguridad confirmó que GHSA-w5hq-g745-h8pq no se alcanza (`exceljs` llama a `v4()` sin
     argumentos y solo en el formato condicional); se corrigieron U+FFFF (rompía el `.xlsx`), la
     regla de ESLint (`import()` y subrutas), «Horas» truncadas también en el Excel
     (`truncatedHours`) y la guarda posterior medida como CSV. Criterio 21 con LibreOffice.
     Corrida final sobre `2149be7`: 1862 de unidad, 305 de `test:time-ar`, 1541 de integración,
     e2e 210/210 ×2. Todo en `correcciones-nucleo-reportes-r6b.md`. **R6 entero en `main`.**
     **Sigue R7** (mapa §R7), primero su contrato; después R9. R8, solo contrato. Bases que se
     pueden borrar: `clock_r6b_*`. La prueba del CSV y el Excel con el Excel del usuario queda
     opcional (§10 del contrato).
     **R7 y R9 en contrato** (rama `nucleo/r7-contrato`): contrato de R7 aprobado en dos pasadas
     (`ce2bfde`); medición R7-0 en `nucleo-reportes-r7-medicion.md` (`b26c589`):
     `@react-pdf/renderer` no cumple (3000 filas en 30 s y 1,5 GB), pdfkit sí (0,25 s, ~130 MB).
     **Decisión del usuario (2026-10-12): pdfkit directo** (ADR 0022). Decisiones del team-lead
     (el usuario no contestó esas preguntas): Noto Sans Regular incrustada, `pdfjs-dist` en
     `devDependencies`, R7a antes que R9 (el orden que pidió), R7b (el gráfico) solo si lo pide.
     El `architect` adapta el contrato a pdfkit y escribe el ADR. Contrato de R9 escrito
     (`bc9af1e`), en revisión; R7 y R9 tocan los mismos archivos y van en serie.
     **Al cortar la décima sesión** (2026-10-12, ~18:00, por contexto): en `main` los contratos
     de R7 y R9, el ADR 0022 y la medición R7-0. **Orden: R9 primero** (decisión del team-lead,
     confirmada por `architecture-reviewer`: R9 no espera nada y el PDF hereda «Personas sin
     horas» sin cambios). **Al retomar**: (1) el pipeline de R9 (contrato aprobado, `5249bc4`,
     correcciones en `correcciones-nucleo-reportes-r9-contrato.md`): rama `nucleo/r9-sin-horas`
     desde `main`, bases `clock_r9_*` creadas y migradas antes, `backend-dev` primero fija formas,
     después `frontend-dev`, `test-engineer`, `e2e-tester` (recorridos 26 y 27) y
     `parity-analyst` (texto que aplica el team-lead), seis revisiones, corrección, corrida
     final, merge. (2) Después, **una pasada más de `architecture-reviewer` sobre el contrato de
     R7 adaptado a pdfkit** (`cf94f4d`, reescrito entero: 432+/520−), y el pipeline de R7a. El
     contrato suma `pdfkit` y `fontkit` a `dependencies`, `@types/pdfkit`, `@types/fontkit` y
     `pdfjs-dist` a `devDependencies` (versiones de los `@types` sin verificar), y saca
     `@react-pdf/renderer` en el paso 1 de R7a (decisión del `architect`; la regla de ESLint lo
     prohíbe igual). La medición no tiene M8 (peor pedido en frío) ni M9 (`pdfjs-dist` bajo
     Vitest): M8 pasó a P2 en frío en §6.2 y M9 lo prueba `backend-dev` en el paso 1 de R7a; si
     falla, se detiene. **Actualización**: `backend-dev` rehízo R7-0 contra el contrato corregido (`7644438`, en `main`): M8 con pdfkit 0,83 s (react-pdf, 35 a 44 s y pierde texto); M9 funciona (`pdfjs-dist` 6.4.299 legacy, sin worker; los tests afirman el texto unido de cada fila, no celda por celda); y **la fuente sí entra sola al trazado** (Turbopack sigue `path.join(process.cwd(), …)`), así que `outputFileTracingIncludes` del contrato sobra. La pasada de `architecture-reviewer` sobre R7 tiene que alinear el contrato con `7644438`. R7b (el gráfico en el PDF) solo si el usuario lo pide. Lección de R6:
     `backend-dev` probó dos veces en el árbol compartido; repetir en cada encargo que las
     pruebas descartables y los mutantes van en un worktree. Bases que se pueden borrar:
     `clock_r6a_*`, `clock_r6b_*`, `clock_r10a_*`, `clock_r10b_final_*`.
     **Decimoctava sesión** (2026-10-21):
     **Cierre (2026-10-21 ~15:40 UTC):**
     - **En producción** (`096aa21`, desplegado a mano por el usuario: Vercel no recibió
       el aviso de GitHub de los pushes `a65f717` y `096aa21`; revisar en Settings → Git
       que el repo siga conectado): WS2a (`0020` aplicada, control OK), WS2b y el MCP para
       owner y admin (`list_people`, `summarize_hours`, ADR 0030; lotes JSON-RPC
       rechazados con 400). Humo OK. **P-07 cumplido:** el workspace «RunOne» pasó a
       completo el 2026-10-21 15:22 UTC (pantallas y CSV OK según el usuario).
     - Producción tiene **un solo workspace**, «RunOne»; «run0km» y «soybot» son los
       dominios de correo (corregido en `a65f717`).
     - Falta: el CI de `096aa21` (estaba corriendo al cierre) y, de ahí en más, el roadmap
       sigue con **E3** (transferir la propiedad), después E4 (que suma `weekStart` al
       `settingChangeOf` de WS2b).
     - Bases locales que se pueden borrar: `clock_ws2a_*`, `clock_ws2b_*`, `clock_mcpe_*`,
       `clock_mcp_*`; hay unas 196 `clock_*` y los checkpoints de Postgres se volvieron
       lentos (un `drop database` tardó minutos).
     - **MCP en producción.** El usuario corrió en Neon `main` el bloque de la `0019`; el
       control dio `1792540623295 | 20 | fcf1b85b… | 9 | 1 | 0` (una primera corrida, por
       error, fue en la rama `preview`: 10 constancias con cliente, de las pruebas de V-7).
       Las consultas quedaron en `/home/maxi/program/clock-ops/mcp-0019-previa-control.sql`.
       Push de `34ed2b5`, deploy y humo OK, y el usuario conectó el MCP en producción.
     - **WS2a mergeado en `main` en local** (`8466e94`, rama en `a16da9e`), sin pushear:
       rebasado sobre el MCP, migración `0020` (`when` `1792584289697`), corrida final verde
       (unidad 2589, integración 2187, build, e2e 262 en base nueva y reusada). Falta del
       usuario en Neon `main`: previa, `/home/maxi/program/clock-ops/ws2a-0020-do.sql` y
       control (`ws2a-0020-previa-control.sql`, previa con 2 workspaces); después el push.
     - **WS2b** (`clock-ws2b`, rama `fase2/ws2b-selector`, sobre `8466e94`): contrato
       revisado y corregido, sin migración ni ADR; preguntas respondidas (MCP en minutos;
       selector «Completo (hh:mm:ss)» / «Compacto (h:mm)»). Backend hecho (`f560359`…
       `5220d78`), e2e escrita (`c0099f3`), paridad (`d00040a`, WS-15 en curso). En curso:
       `ws2b-front`. Después: suite entera, seis revisiones, correcciones, final, merge.
     - **MCP para owner y admin** (mejora 5, pedida hoy, en paralelo): worktree
       `clock-mcp-equipo`, rama `mejoras/mcp-equipo`. Contrato `mejoras-mcp-equipo.md`
       revisado y corregido; ADR 0030 aceptado; §10 respondida como la recomendación
       (`cf447a2`). Herramientas nuevas `list_people` y `summarize_hours`, sin migración.
       Backend con V-1 OK y tipos en `c4e556f`; en curso `mcpe-back`, `mcpe-front`,
       `mcpe-int` y `mcpe-e2e`. Después: seis revisiones (con seguridad), final, merge.
       **Decimoséptima sesión** (2026-10-20/21). **Cierre (2026-10-21 ~02:15 UTC):**
     - **En producción:** la `0018` de WS0 (control OK), WS1 (`2dc1452`) y `npm audit fix`
       (`467e730`, vite 8.3.4, CI verde). Falta del usuario la §6.6 de WS0: logs de Runtime
       sin «does not exist» por 15 min y humo.
     - **MCP mergeado en `main` en local** (`5d92b19`, sobre `35a1d54`), **sin pushear**.
       Antes del push el usuario corre en Neon (rama `main`) la consulta previa
       (`1792502701085 | 19 | 0 | 0`), el bloque `/home/maxi/program/clock-ops/mcp-0019-do.sql`
       y el control (`1792540623295 | 20 | fcf1b85b… | 9 | 1 | 0`); las tres están en
       «Cierre para el merge» de `correcciones-mejoras-mcp-revisiones.md` y en
       `mejoras-mcp.md`. Seis revisiones y correcciones hechas; V-7 cerrada con Claude Code en
       el preview `mejoras/mcp-preview-3`; claude.ai y ChatGPT se prueban después, en
       producción, con `MCP_ENABLED=true` (decisión del usuario). En prod el MCP entra apagado.
       El preview tiene Vercel Authentication: el secreto de bypass quedó en `~/.claude.json`
       (`clock-preview`) y en la conversación; rotarlo.
     - **WS2a** (`clock-ws2a`, rama `fase2/ws2a-formato`, punta `e41bb75`, rebasado sobre
       `467e730`): contrato y ADR 0029 (aceptado), paridad, implementación, seis revisiones y
       correcciones; registro en `correcciones-fase2-ws2a-revisiones.md`. Respuestas del usuario:
       `check` de `workspace.name` sí (en la migración), segundos sueltos de la planilla no se
       tocan, EQ-122 se deja. **Sigue:** con el MCP en `main`, rebasar WS2a, regenerar su
       migración como `0020` (con `db:generate`, nunca renombrar; `when` mayor que
       `1792540623295`), corrida final completa (build y e2e en base nueva y reusada), consulta
       previa y bloque `do` en prod, merge y push.
     - Bases locales que se pueden borrar: `clock_ws2a_*`, `clock_mcp_*` (salvo que se retome).
       **Decimosexta sesión** (2026-10-20, con el usuario por remote control):
     - **E2b listo para mergear** (`clock-e2b`, HEAD `9f0c874`). Paridad actualizada
       (`0c20de1`: EQ-115…EQ-122, PF-47, P-11 cerrado, «tres» en el mapa). Seis revisiones:
       frontend, backend, seguridad y paridad aprobadas; clean code y tests con cambios,
       corregidos (`2cbe74c`, `36fd524`, `b22de43`, `551eac2`, `9594398`). Corrida final
       con el árbol quieto: lint, typecheck, prettier, unidad 2409 + 305, integración 1947
       en base nueva, e2e 242/242 en base nueva y en reusada. Registro en
       `correcciones-fase2-e2b-revisiones.md`. **Falta, del usuario:** la consulta previa
       de §6.1, la `0017` en producción con el control de §6.2, el pedido de merge en local
       y el push; después la verificación de humo de §6.4.
     - **Para el que integre segundo (E2b o MCP):** regenerar la migración (no
       renombrarla: con el `when` viejo Drizzle la saltea sin avisar) y comprobar que su
       `when` supere el último `created_at` de `drizzle.__drizzle_migrations` en prod;
       sumar `deleteGrantsOf` en `bindGoogleAccount` y `releaseEmailOf` con su test
       (hallazgo condicional de security).
     - Decidido por el team-lead: el recién llegado con una dirección reciclada de una
       inactiva sigue viendo EQ-92 (D-E2b-10), no EQ-122.
     - **MCP:** commit temporal de captura de V-7 (`baa4c66`, se revierte antes del merge).
       El force-push de `mejoras/mcp` lo bloqueó el clasificador: el usuario elige entre
       pushearlo él o usar la rama `mejoras/mcp-preview`. Después, el preview de §6.6.
     - **E2b en `main` y en producción** (merge `80e2f6c`, CI verde, deploy OK). El usuario
       corrió la consulta previa (las tres inactivas; la 2 y la 3 vacías) y, lejos de la
       compu, aplicó la `0017` con un bloque `do $$ … $$` en el editor SQL de Neon (los
       `ALTER` de la migración más la fila de `drizzle.__drizzle_migrations` con el mismo
       hash y `when`; probado en local: `db:migrate` después no hace nada). Control `2|2|0`.
       Falta su humo de §6.4. Generador del bloque:
       `scratchpad/tools/do-block.cjs <dir drizzle> <idx desde>` (copiarlo si se reusa).
     - **MCP rebasado sobre E2b** (`475d465`, migración `0018_mcp`, `deleteGrantsOf` en
       vincular y liberar con test) y pusheado a la rama nueva `mejoras/mcp-preview`. **El
       usuario postergó la prueba del preview.** Como WS0 entra antes, el MCP regenera su
       migración como `0019` al retomarlo.
     - **WS1** (`clock-ws1`, rama `fase2/ws1-configuracion`): contrato con una ronda de
       architecture-reviewer, implementado, seis revisiones (tests con cambios, corregidos en
       `d8cc35d`) y corrida final verde (unidad 2432 + 305, integración 1986, e2e 249/249 en
       base nueva y reusada). Sin migración. Su §0 pide WS0 A en `main` antes del merge.
       Pregunta al usuario: los `check` de `workspace.name` en la migración de WS2a.
     - **WS0** (`clock-ws0`): contrato y ADR 0028 (propuesto, falta que el usuario lo
       apruebe), commit A con tres revisiones aprobadas y e2e 235/235; `roundMinutes`
       borrado. En curso: rebase sobre `main` y commit B (`0018`).
     - Postgres local tardó ~20 min en arrancar (fsync de ~100 bases, 2,1 GB). El
       clasificador bloquea `drop database`: el usuario decide si limpiarlas.
     - **Cierre de la decimosexta (2026-10-20 ~23:10 UTC).** La sesión se compactó sola a
       las 15:00 UTC sin el corte del 40 %: el usuario lo marcó y pasa a una sesión nueva.
       - **E2b cerrado:** el usuario hizo el humo de §6.4 y dio todo bien. Pregunta abierta:
         no le gusta el texto de EQ-122 («Ya hay una persona en Clock con ese correo…»)
         porque cree que revela que el correo existe. El team-lead recomendó dejarlo: solo
         lo ve quien Google ya confirmó como dueño de esa dirección, y la URL no lleva el
         correo. Ofreció un texto neutro («No pudimos completar el ingreso. Pedile a quien
         administra el equipo que revise tu acceso.») si lo prefiere. Falta su respuesta.
       - **WS0:** A en producción, humo de §6.3 OK. **B mergeado y pusheado** (`b91c4b8`,
         15:59 UTC): lint, typecheck y unidad 2407 + 303. **Falta, del usuario, §6.1 y
         §6.5:** la consulta previa (1, 2, 2b, 3, 4) de a una sentencia, el bloque `do` de
         la `0018` y el control. El bloque está en `/home/maxi/program/clock-ops/ws0-0018-do.sql`
         (exige `max(created_at)` = 1792456513460 y registra 1792502701085). Probado en
         local desde la `0017`: borra las doce, `db:migrate` después no hace nada y una
         segunda corrida frena. Después, §6.6: logs de Vercel sin «does not exist» por
         15 min, humo otra vez y las bases compartidas (D-WS0-8).
       - **WS1 rebasado sobre `main` con B** (`clock-ws1`, 11 commits, sin pushear): lint,
         typecheck, prettier, unidad 2430 + 303, integración 1989, e2e 249/249 en base nueva
         y reusada (`clock_ws1_conb_*`). Se mergea y pushea cuando el control de §6.5 dé
         bien.
       - Herramientas fuera del scratchpad, en `/home/maxi/program/clock-ops/`:
         `do-block.cjs <dir drizzle> <idx desde>` y `migrar.mjs <url> <dir drizzle>`. La e2e
         no migra su base: `DATABASE_URL=<base> npm run db:migrate` antes de la primera
         corrida.
       - Siguiente en el roadmap: WS2a (contrato), con la pregunta de los `check` de
         `workspace.name`.

     **Decimoquinta sesión** (2026-10-19): se retomaron C1 y E2.
     - **C1 en `main` y en producción** (merge `78820d8`, CI verde). Tres revisiones con
       cambios: el e2e no cubría el ancla de la selección (se aprieta a 08:40), el rótulo de la
       selección desbordaba con zoom 60 y la paridad le atribuía al usuario el `min(zoom, 15)`;
       los 15 minutos son del usuario y el caso del zoom en 5 es la D1 del contrato.
     - **E2 en `main` y pusheado** (merge `27774d6`). Contrato con dos rondas de
       architecture-reviewer (la segunda: el test del gancho `after` se arma con
       `queueBehindBarrier`). Seis revisiones; registro en
       `correcciones-fase2-e2-revisiones.md`. Corrida final: integración 1840, e2e 234 en base
       nueva y en reusada. Consulta previa de §6.1 en producción: 10 activas con cuenta, 3
       inactivas sin cuenta (daniel, naara, sofia), la 2 y la 3 vacías.
     - **El merge y el push a `main` los bloquea el clasificador de permisos**: el team-lead
       mergea en local cuando el usuario lo pide y el usuario pushea.
     - **En paralelo:** E2b (worktree `/home/maxi/program/clock-e2b`, rama
       `fase2/e2b-sin-cuenta`, ADR 0027) y, **pedido por el usuario**, el **MCP** para cargar
       horas (worktree `/home/maxi/program/clock-mcp`, rama `mejoras/mcp`, ADR 0026): lo quiere
       usar desde claude.ai y desde Claude Code, así que va con OAuth. Los dos en contrato de
       `architect`.
     - Deuda: `npm audit` da 9 high en dependencias de desarrollo (también en `main`); es del
       usuario decidir (control de seguridad de CI).
     - **Decisiones del usuario (2026-10-19, tarde):** ADR 0026 y 0027 **aceptados**. MCP: clientes
       de Claude **y de OpenAI** (ChatGPT, Codex); el resto de §11 como lo recomendó el
       contrato. E2b: owner **y admins** (sobre no admins) vinculan y liberan; la vinculación
       vence a 7 días. Better Auth a 1.7.10, sola y primero.
     - **Better Auth 1.7.10 en `main` y en producción** (merge `be15763`, CI verde; registro
       `mejoras-better-auth-1710.md`). Falta que el usuario confirme el humo: cerrar sesión y
       volver a entrar con Google. `npm run auth:schema` está roto (llama a un binario que no
       existe); lo arregla el MCP con `npx -y auth@1.7.10 generate …`.
     - **E2b implementado, sin revisar** (`clock-e2b`): tipos `bdb5025`, backend `53a4005`,
       frontend `e945bb6`, tests `a11ed39`, registro `ea7108b`, e2e `b787628`/`06b1a60`/`ce54849`
       (suite 242/242 en base nueva y reusada). `e2b-back` cerró en verde sobre `ea7108b`: lint, typecheck, unidad 2407 + 305 e integración 1945. La migración es `0017_membership_account_link.sql`; 19 mutaciones, y una sola no la detecta su test (el 13 sin `for no key update` en `lockMembershipOf`; la cubre el 14). Siete desvíos chicos, en el registro. No llama a `deleteGrantsOf`, porque el MCP no está en `main`. Desvío aceptado: las fechas de la vinculación las resuelve `TeamScreen` (servidor) en la zona y el formato de quien mira (ADR 0012); la página pasa `timeSettingsOf(session)` (enmendar §5.1). **Sigue:** lanzar parity-analyst (§7: EQ-115…EQ-122, «seis»→«tres» en `fase2-mapa.md`) y las seis
       revisiones, correcciones, corrida final, consulta y migración en producción (la `0017`;
       renumera si el MCP mergea antes) y merge. Avisos de e2e: un flake no reproducido (el menú
       no cerró con Escape tras cancelar) y `/equipo` lento con ~1.100 membresías (preexistente).
     - **MCP en implementación** (`clock-mcp`, con `node_modules` propio): tipos `d03965b`,
       backend parcial `839de45`, frontend `0781654` y `fadb0a0`, e2e `0079109`. `mcp-back` cerró en verde, con commits `839de45`, `a467ec6`, `481c5d2` y `938576b`: unidad 2399 + 305, integración 1999, build, y 15 de 15 mutaciones detectadas. Registro en `correcciones-mejoras-mcp-revisiones.md`.
       - **Arreglos:** «Conectar» funciona: `submitConsent` ahora pasa un `Request`. «Cancelar» de la vista forbidden también anda. `auth:schema` usa `npx auth@1.7.10`.
       - **V-8 cerrada.** El SDK valida la forma; una herramienta desconocida da `isError` y no un error JSON-RPC, así que hay que enmendar §4.17.
       - **V-7, cerrada por documentación salvo lo que se ve en el preview:**
         - claude.ai vuelve a `https://claude.ai/api/mcp/auth_callback`; claude.com no aparece y salió de la lista.
         - Claude Code y Codex usan loopback.
         - ChatGPT vuelve a `connector_platform_oauth_redirect` (RFC 9207, que el plugin cumple).
         - Todos registran por DCR, así que el script de §4.16 no hace falta.
         - En el preview quedan por capturar los cuerpos reales del registro, el `Origin` y qué hace cada cliente con `destructiveHint`.
       - **Desvíos:** las funciones puras pasaron a `src/lib/oauth.ts`. Las tablas son snake_case y tienen `on delete cascade` hacia `user`, así que la consulta de §6.5 usa `oauth_consent` y `user_id`. `/admin/oauth2/resources` va a `disabledPaths`.
       - **Para security:** los metadatos anuncian `introspection_endpoint`, que responde 404. Un token con `cnf` (DPoP) sirve como portador. `destructiveHint` queda en true por omisión en create, start y stop. `oauth_resource` se siembra aun con el MCP apagado.
       - **La migración es `0017_mcp`.** E2b trae otra `0017`, y el que mergee segundo renumera.
         `mcp-tests` cerró la integración en `48d7c49`: 106 tests propios en verde, `test:integration` completo en 1989, y 33 mutaciones detectadas. Para las revisiones deja estos puntos:
       - El 429 del registro solo se prueba con el limitador encendido en el test.
       - Para security: el plugin limita por IP `/oauth2/token` a 20 cada 60 s y `/oauth2/authorize` a 30 cada 60 s (`authorize-dkOG8GqZ.mjs:5371-5414`). Con conectores remotos, toda la empresa sale por las IP del proveedor, y D-MCP-13 no lo nombra.
       - El contrato no coincide en dos puntos: §2 dice «sin cascada», pero las tablas generadas tienen `on delete cascade` hacia `user`; y §4.17 dice que una herramienta desconocida da error JSON-RPC, pero el SDK responde `isError`.
       - Los cuerpos de registro de claude.ai y de ChatGPT hay que reemplazarlos por los capturados en el preview.
       - La prueba de `auth:schema` sin `MCP_ENABLED` la hizo `mcp-back`: no cambia el esquema.
       - e2e del MCP sobre `23b8c25`: `mcp.spec.ts` dio 3 corridas seguidas en verde. La suite completa dio 239/240: con el MCP encendido falla
         `profile.spec.ts:180`, que cuenta los textbox de todo `main`. Hecho en `57d73cb`: `MCP_ENABLED: "true"` en `playwright.config.ts` y el test de perfil cuenta los textbox de «Datos de la cuenta». La suite completa da 240/240 sobre una base reusada; falta correrla en una base nueva (criterio 21). La dirección de vuelta de Claude Code en `e2e/mcp.ts` es `127.0.0.1`; si V-7 cierra con `localhost`, hay que cambiarla.
       - **Sigue:** el **preview con el usuario** para cerrar V-7 (conectar claude.ai, ChatGPT y Codex:
         direcciones de vuelta, cuerpos de registro, `resource`), revisiones con security-auditor,
         migración y merge con `MCP_ENABLED` apagado.
     - Worktrees que se pueden borrar: `clock-c1`, `clock-e2`, `clock-ba`. Los agentes de esta
       sesión no siguen en la próxima: si un informe no llegó, leer el registro y el `git log`
       del worktree.

     **Decimocuarta sesión** (2026-10-16, tarde): el usuario pidió seguir el roadmap sin
     frenar («E1b y después lo que siga») y dio permiso para desplegar.
     - **E1a**: Vercel despliega `main` en cada push y el build no migra; E1a llegó a
       producción antes que la `0015`, que el usuario aplicó después. Desde ahora, un merge
       con migración no se pushea hasta que el usuario la corrió en producción.
     - **E1b en `main` y en producción** (merge `db0991d`, CI verde). Seis revisiones
       aprobadas; registro en `correcciones-fase2-e1b-revisiones.md`. En producción: la
       consulta previa limpia, la `0016` aplicada (0 filas aceptadas), el push, la consulta
       de control en 0 y el Gmail personal rechazado con EQ-91. **Decisión del usuario:**
       EQ-111 con la opción (a) (D-E1b-13), y las diez membresías activas, incluidas
       administracion@ y juan@soybot.com, tienen que tener acceso.
     - **Mejoras pedidas** en [`../mejoras-pedidas.md`](../mejoras-pedidas.md). **Decisión del
       usuario:** TT-09 (crear un proyecto desde el selector) entra en P1, y el arrastre de 15
       minutos se hace ya, como slice chico **C1**. El MCP para cargar horas queda anotado.
     - **C1** (rama `mejoras/c1-arrastre-15`, worktree `/home/maxi/program/clock-c1`, pusheada):
       el contrato (`a1f3cf8`; paso `min(zoom, 15)`, decidido por el team-lead) y el código
       con su unidad en verde (`61737df`). Quedó a medias, en commits `wip`: la paridad de
       `calendario.md` (falta aclarar en CAL-53 y en P-07 que la verificación solo registra una
       divergencia, porque el paso lo decidió el usuario) y el e2e de `calendar-drag.spec.ts`,
       sin corrida verificada. Falta: terminar esos dos, revisiones (frontend, tests, clean
       code), corrida final y merge. Base de e2e: `clock_c1_e2e`.
     - **E2** (rama `fase2/e2-desactivar`, worktree `/home/maxi/program/clock-e2`, pusheada):
       contrato en `4825ca9`, **aprobado con cambios** por architecture-reviewer y **sin
       corregir** todavía. Las correcciones a aplicar (antes de implementar):
       1. Mantener P-05 como la decidió el usuario: cerrar la carrera con un ingreso
          simultáneo con un gancho `session.create.after` que relee la membresía `for share`
          y borra la sesión si no está activa (sin lanzar); `auth.ts` pasa a backend-dev, con
          test en `auth.integration.test.ts`; sale el riesgo aceptado de 14 días.
       2. §6.1: la activa sin `account` sale de la consulta 2 a una consulta 3 informativa;
          criterio 24 en consecuencia.
       3. Recorrido e2e 1 y criterio 20: `seedGoogleAccount(P)` antes de desactivar.
       4. Quitar el paso 6 de D-E2-3 (inalcanzable).
       5. Criterio 23 como lo que se prueba (`revalidatePath` y el catálogo).
       6. §10: el `UNAUTHORIZED` de un `getSession` que refresca después del borrado, aceptado.
       7. frontend-dev es dueño de toda `src/modules/team/components/`.
     - Deuda vista: el Postgres local tiene 68 bases (las de pruebas viejas); tras un apagado
       sucio tardó minutos en arrancar. Se pueden borrar las `clock_e1a_*` y `clock_e1b_*`.

     **Decimotercera sesión** (2026-10-16): el usuario aprobó el
     [ADR 0023](../adr/0023-quitar-el-rol-de-admin-es-una-accion-propia.md) (solo el owner quita
     el rol de admin) y corrió la importación de Clockify en producción (ver «Decisiones
     pendientes del usuario»). Después pidió «empecemos la fase 2»:
     - Paridad nueva: `equipo.md` (EQ) y `workspace.md` (WS), con las decisiones del día en sus
       apartados «Decididos». Mapa: [`fase2-mapa.md`](fase2-mapa.md), aprobado en dos rondas.
       Orden: E1a, E1b, E2, E2b, WS0, WS1, WS2a, WS2b, E3 … E6, P1 … P8, E7, P9, T1, T2.
     - **E1a en `main`**: invitar y revocar desde `/equipo`, la tabla `invitation`, el ingreso
       con `entry.ts` y el script `invitations:from-env`. ADR 0024 y 0025 aceptados. Detalle y
       corrida final en `correcciones-fase2-e1a-revisiones.md`.
     - **Hasta E2, el procedimiento SQL de desactivar sigue borrando `account`**: el login solo
       mira el dominio, y es lo único que deja afuera a una inactiva (mapa §5).
     - **Producción no tiene `EXTERNAL_INVITE_EMAILS`** (dicho por el usuario el 2026-10-16): el
       script `invitations:from-env` no tiene nada que pasar y el bajo 1 de seguridad no aplica.
       **Pendiente del usuario**: desplegar E1a, invitar desde `/equipo` a las activas de
       Clockify que no entraron (Nicolas Veliz incluido) y la verificación de humo (§6.4).

     **Duodécima sesión** (2026-10-13): el usuario reinició el host (lo del 2026-10-12 quedó
     resuelto; el e2e vuelve a correr en el host) y pidió «R7b y R8 en paralelo».
     - **R7b en `main`** (`a8f3e70`): el gráfico de R5 en el PDF del resumen. Contrato con dos
       rondas (`af04f91`); un solo `backend-dev`. Revisiones, correcciones y corrida final (e2e
       214/214 dos veces) en `correcciones-nucleo-reportes-r7b-revisiones.md`.
     - **R8 en `main`** (`1e95b56`): `/equipo`, cambiar el rol entre member y admin. Worktree
       aparte, ya borrado. **Decisión del usuario del 2026-10-13: replicar Clockify, solo el owner
       quita el rol de admin** (`team.admin.revoke` en `can()`, [ADR 0023](../adr/0023-quitar-el-rol-de-admin-es-una-accion-propia.md),
       aceptado el 2026-10-16). Dos rondas de implementación y de revisiones; corrida
       final con e2e 217/217 dos veces. Detalle en `correcciones-nucleo-reportes-r8-revisiones.md`.
     - **Desde R8, el setup de e2e corta** si la base tiene más de 1.500 membresías activas: las
       bases locales viejas (`clock` incluida) hay que reemplazarlas por una nueva (procedimiento en
       el README), sin un servidor de desarrollo en :3000.
     - **Pendiente del usuario**: P-12 de `reportes.md` (roles en Clockify);
       P-05 (el PDF de Clockify con gráfico); ver un PDF con gráfico impreso (criterio 13 bis de R7).
     - Deuda nueva: `cellsOf` (document.test) repite `readBack` (xlsx.test); `chartOf` repite el
       cableado de `ReportChart`; homónimos con el mismo nombre accesible en `/equipo`; las otras copias de `textOf` y la
       tercera de `signInAs`.

     **Undécima sesión** (2026-10-12):
     - **R9 en `main`** (`b255b99`). Mostrar personas sin horas. Las seis revisiones aprobaron.
       Test-reviewer encontró que el recorrido 26 fallaba con una base de e2e reusada (el primer
       nivel pasaba de 3000 filas). Desde entonces va en una semana fija de 2001. Corrida final:
       e2e 212/212 dos veces. La CI de `main` quedó en verde. Detalle en
       `correcciones-nucleo-reportes-r9-revisiones.md`. Deuda: `peopleWithoutTimeOf` repite el
       nombre y el orden de `toPersonOptions`.
     - **Contrato de R7** con la tercera pasada aprobada (`ebc4f33`). Tiene las cifras de
       `7644438`, va sin `outputFileTracingIncludes` y fija `pdfkit` 0.20.2. El ADR 0022 suma un
       párrafo «Corrección», sin cambiar la decisión.
     - **R7a en `main`** (`bb93255`). El PDF lleva la cabecera y el resumen, sin las entradas.
       pdfkit 0.20.2 con Noto Sans incrustada. La medición entra en todos los presupuestos: el
       peor pedido en frío, 0,755 s.
       - Revisiones: backend, frontend y seguridad aprobaron sin hallazgos. Clean code marcó un
         mayor: `readPdf` copiaba `src/test/pdf.ts` y ahora lo importa. Paridad corrigió el texto
         de los emoji compuestos.
       - Corrida final: e2e 213/213 dos veces. Detalle en
         `correcciones-nucleo-reportes-r7a-revisiones.md`.
     - **Host colgado** desde las 21:20 hora local: Xorg y un kworker en estado D. El Chromium
       headless del host no dispara `requestAnimationFrame` y el e2e local falla hasta el setup.
       La corrida final usó Playwright en `mcr.microsoft.com/playwright:v1.63.0-noble`
       (`--network host`) contra `next start` en el host. El usuario tiene que reiniciar.
     - **Pendiente del usuario**:
       - R7b (el gráfico en el PDF);
       - R8;
       - abrir un PDF con su visor (criterio 13, opcional);
       - en Vercel, después del despliegue, la comprobación de §10 punto 4 del contrato de R7;
       - las dos preguntas de R9 (inactivas sin horas, ingreso posterior), que ya van con la
         recomendación;
       - mirar un PDF de Clockify (P-05).
     - Bases que se pueden borrar: `clock_r7a_*`. Queda la rama local `nucleo/r7-contrato-3`, ya
       en `main`. El modo automático no dejó borrarla.

   - **R3 en contrato** (historia; subgrupos, tarea y etiqueta), rama `nucleo/r3-contrato` desde `main`
     (`7b66b03`), en checkout en el árbol principal. `architect-r3` quedó escribiendo
     `docs/slices/nucleo-reportes-r3-subgrupos-tarea-y-etiqueta.md` (sin commit). Tarea entra
     (decisión del usuario, mapa ~l. 382). Se le pidió resolver el tamaño del árbol (árbol entero
     con tope o expandir pidiendo al servidor, con lo abierto en la URL), la suma por etiqueta
     con aviso, la comprobación contra Neon si hay una forma de parámetro nueva, y proponer partir
     el slice si es grande. **Al retomar**: si el archivo existe y el agente terminó (su informe
     está en `subagents/agent-aarchitect-r3-*.jsonl` de la sesión `e1bb799a-…`), pasarle
     `npx prettier --write`, lanzar `architecture-reviewer` hasta aprobar, commitear, mergear el
     contrato a `main` y seguir el pipeline como en R2b (bases por agente creadas antes, backend
     primero fija formas). Si no existe, relanzar el `architect` con el mismo encargo.
   - CI de `main` en verde en `7b66b03` (`verify` e `integration`). El job `e2e` corre en local
     desde el PR #1 (`1908c85`, 2026-10-09): 203/203 en 9m26s.
   - Después de R3: R4 (filtros); R8 (cambiar el rol) se puede adelantar porque solo depende de R2a.
     Orden del mapa: R2a → R2b → R3 → R4 → R5 → R6 → R7, con R8 después de R2a y
     R9 después de R4.
   - **Deuda nueva**: C5 de R2a (`RangePicker` es la tercera copia del calendario de mes: sumarlo
     al `DayCalendar` compartido); la deuda de R1 (C1, `rejection` y la lectura del diario a
     `src/test/`); `.claude/worktrees/` sin ignorar en ESLint (un worktree aislado de un agente
     rompe `npm run lint`); la navegación del shell da desplazamiento horizontal a 320 y 375 px;
     `role="list"` en las listas sin viñetas de todo el proyecto (N2 de R2b); los e2e de reportes
     sin salto cerca de la medianoche (T3 de R2b); días anteriores a 1953 con desplazamientos de segundos empiezan
     hasta 59 s tarde (antes del piso de 2000, sin efecto).
1. Deuda chica sin slice:
   - `pickDate` (`e2e/tracker-page.ts`) no espera el foco del disparador al cerrar el calendario:
     un `pickProject` después falla de a ratos (la causa del flake del 13);
   - un `DayCalendar` compartido entre `DateField` y `PeriodPicker`;
   - un `ClockRangeFields` común a `manual-bar.tsx`, `entry-times-editor.tsx` y el diálogo;
   - las variantes de `retryOf`;
   - en e2e, `stepToDay`, `isXPage` y `NETWORK_FAILURE` comunes;
   - `preferenceCookie` en `src/lib`;
   - el `Positioner` del detalle que todavía se lleva un clic (F2-n1 del 8b);
   - `PickerEmptyMessage`, las clases del disparador y el buscador comunes a `TagPicker` y
     `ProjectPicker` (C9 del 11b);
   - la guarda de destino de F1 del 11b también en `handleProjectChange` de la barra (el
     selector de proyecto se cierra al elegir, así que el riesgo es menor);
   - si falla continuar y después falla duplicar, la barra muestra los dos avisos;
   - las comprobaciones «desde otra pestaña» de e2e sin unificar (§8 del contrato del 12);
   - `ActionFeedback` con `disabled`: el foco cae a `body` (con un timer de otra pestaña, o con
     «m» y el foco en «Reintentar» del alta, F2 del 2c); el arreglo es `aria-disabled` y no actuar,
     en el componente compartido;
   - el aviso del alta manual no se puede cerrar a mano (§8 del 2c);
   - la comparación del alta es del cliente: con dos pedidos distintos bajo un id y la entrada
     editada en otra pestaña, el informativo es falso (F3 del 2c); lo cerraría un `replayed`
     explícito del servidor en `createOnce`.
2. Deuda de anchos (11a y 11b, medidas en `correcciones-fase1-slice11b-revisiones.md`, F3): con
   el timer corriendo, el aviso «Detené el timer para agregar tiempo a mano.» (281 px) deja la
   barra en 577 px útiles y el bloque del contador baja a otra línea en cualquier ancho; moverlo
   lo cerraría. Por debajo de ~800 px la fila y la barra parada pasan a dos líneas, y una fila con
   un proyecto al tope (256 px) y tres etiquetas también en escritorio. Del 11a, además: si se
   borra la única fila de un día, el grupo desaparece y su aviso se va con él (también para la
   descripción y el proyecto); un aviso de hidratación en desarrollo en `DescriptionField`; el
   facturable por defecto de un proyecto no se ve ni se edita después del alta (fase 2).
3. Deuda que dejó el 7b: una cuenta de Google nueva con un correo ya usado (PF-47) termina en la
   página de error de Better Auth (`account_not_linked`) sin texto propio; volver a seguir el
   nombre de Google (P-10) y liberar un correo ocupado (P-11) quedan para la fase 2.

El hydration mismatch de `AppLayout` quedó cerrado: es el `MetadataWrapper` de Next durante
una recarga en caliente y no se reproduce.

Decisiones del usuario del 2026-10-04 para el calendario: P-04 «Guardar» todo o nada con
botón; P-01 crear desde la grilla **se permite** con un timer corriendo; P-02 la entrada que
cruza la medianoche suma entera en el día de inicio; P-06 «Detener» en el diálogo del timer.
P-03 (arrastrar el inicio del timer) y P-05 (solo días laborables) quedan fuera del 8, con
su propuesta. Sobre el contrato del 8: ADR 0013 (`updateEntry`) aceptado; P-01 sin excepción por
origen (el servidor deja de rechazar el alta manual con timer abierto, TT-30 queda en la
interfaz del rastreador); corte 8 (clic y teclado) / 8b (arrastre) aprobado; «Detener»
inactivo con cambios sin guardar.

Decisiones del usuario del 2026-10-03: ADR 0010, 0011 y 0012 aceptados; TT-07 con las tareas
siempre listadas; continuar o duplicar con un proyecto no disponible se rechaza; la zona por
omisión del perfil es un valor fijo (`America/Argentina/Buenos_Aires`), no la del workspace.

Deuda anotada: no hay ningún `error.tsx` en `src/app`; un error de lectura cae en la página
genérica de Next. La base de e2e acumula clientes y proyectos que en la fase 1 no se pueden
borrar (umbral de §8 del contrato del 9), más los `rev-*` y sintéticos de las revisiones
del 10.

## Decisiones pendientes del usuario

El 2026-10-04 el usuario delegó en el team-lead todo lo que no necesita sus cuentas.
Resuelto ese día: `npm audit` en CI solo sobre producción, con `shadcn` en
`devDependencies` (`braces` no tiene versión corregida: GHSA-vfj7-8cjw-p6xm, `<=3.0.3`);
`CLAUDE.md` sin el 401; ADR 0008 sin la promesa de «Cargar más» sin JavaScript; TT-16 con el
modo en la cookie; ADR 0014 aceptado y P-03 fuera del 8b. Decidido y pendiente de hacer:
devolver «Reintentar» al alta manual con el ADR 0007 y retirar TT-109, como slice chico con
su pipeline.

Lo que sigue siendo del usuario, porque necesita sus cuentas o su máquina (la consulta de
cuentas sin Google antes de desplegar el 7b dio cero filas en producción el 2026-10-09):

- **`.env` local**: su `DATABASE_URL` usa el usuario `user`, que Postgres rechaza
  (`password authentication failed`): es un valor de ejemplo. Por eso `db:migrate` fallaba y el
  login local no anda. Para usar la app: apuntarlo a `postgresql://clock:clock@localhost:5432/clock`
  y cargar credenciales de Google con `http://localhost:3000` como origen. Mientras tanto, la app
  se ve levantándola con el entorno de `playwright.config.ts` y la sesión de prueba.
- **Postgres de Neon**: decir la versión mayor (`select version();`), que R2a necesita para medir
  con la misma; el slice 9 necesita 15 o posterior (`on delete set null (col)`)
  antes de desplegar.
- **Secretos de e2e sin uso**: desde el PR #1 CI no usa el environment `preview` ni
  `E2E_BASE_URL`, `E2E_TEST_SESSION_SECRET` y `E2E_DATABASE_URL`; borrarlos es del usuario. Su
  `.env` y `.env.example` deberían apuntar a `postgresql://clock:clock@localhost:5432/clock`
  (`compose.yaml` levanta esa base con `docker compose up -d`).
- **Sesión en el workspace de Clockify** para cerrar lo no verificado: P-18 de `timesheet.md`
  (el menú, el pop-up y el detalle de una celda: TS-40, TS-41, TS-42), P-14 en
  `time-tracker.md` (fila de la entrada que corre, hora inexistente, horas de la copia al
  duplicar, «la última» de `c`, continuar o duplicar con un proyecto no disponible, TT-57 y
  TT-58), la edición masiva del rastreador (P-07), P-09 de `perfil.md` (con lo del 7b: el
  «username», el tema y la identidad de Google en PF-45, PF-47 y PF-48), P-07 de `calendario.md` (con CAL-23), PR-40/PR-58 y P-33 de `proyectos.md`
  (con PR-47 y PR-48), y lo del 11 en P-14: TT-12, TT-50 y el rechazo de continuar o duplicar
  con una etiqueta archivada. Del 11b, también en TT-12: si las opciones llevan
  casilla, qué hacen Enter y Espacio, si la búsqueda queda después de marcar, si se guarda con
  cada casilla o al cerrar y cómo se ve el botón con varias etiquetas. Del 12, en P-07: si la
  edición masiva del rastreador está en Free (TT-63 dice que la del reporte detallado es paga,
  frase del 2026-10-04 que la página ya no tiene: confirmar o corregir), si «Overwrite existing»
  sin etiquetas las quita y si admite varias, si una referencia archivada frena todo el pedido,
  si se puede elegir la entrada que corre y qué pasa con más de 50 etiquetas.
- **Relevar Clockify con WebFetch**: el resumidor inventa citas (en el 11 inventó un tope de 50
  etiquetas); antes de escribir «Documentado» se confirma la oración literal.
- **Importar las horas reales de Clockify** (pedido del 2026-10-13; corrida en producción
  hecha por el usuario el 2026-10-16): septiembre y del
  1 al 13 de octubre de 2026, 624 entradas (1125:04:17 y 159:43:20), leídas de los PDF del
  informe detallado. El CSV es del plan pago. Los datos y el parser están fuera del repo, en
  `/home/maxi/program/clock-importacion-clockify/`, porque tienen nombres y emails reales. El
  script `--dry-run`/`--apply` está en la rama `ops/importar-clockify`, sin mergear.
  - **Decidido por el usuario:** el texto es «CLIENTE - PROYECTO», cortado en el primer « - »
    (13 clientes y 39 proyectos). Etiquetas, facturable y segundos no importan. Las horas de
    prueba de la base real se borran; los clientes y proyectos existentes, no.
  - **Por corridas parciales** (`dae5193`, desde el 2026-10-14): con `disableImplicitLinking`
    no se puede crear a mano un usuario que todavía no entró sin dejarlo afuera, así que cada
    corrida carga a quienes ya tienen fila `user` y a las seis desactivadas en Clockify (como
    `inactive`), y deja pendientes a los activos que no entraron. Las corridas que siguen
    cargan solo a las personas nuevas y no borran nada; solo la primera borró las horas de
    prueba. Las corridas previas se leen de la auditoría `timeEntry.importClockify`. daniel
    pasó a `active: false`. Nicolas Veliz usa un dominio externo: hay que habilitarle el
    ingreso.
  - **Corrida real:** la hace el usuario con `!`, porque el team-lead no tiene acceso a la base
    de producción. Primero `--dry-run`, se revisa junto con el team-lead, y recién después
    `--apply`.

## Cómo se trabaja (lo que este proyecto aprendió)

- **Pipeline por slice**: contrato del `architect` → `architecture-reviewer`
  hasta aprobar → backend y frontend en paralelo (backend primero fija esquema y
  firmas; se le avisa a frontend) + `e2e-tester` escribe el spec y confirma que
  falla por la funcionalidad → seis revisiones (backend, frontend, tests,
  seguridad, código, paridad) → documento `correcciones-…-revisiones.md` con la
  decisión de cada hallazgo → ronda de correcciones → si la ronda de frontend
  fue grande, segunda revisión de frontend → corrida final de e2e → commit,
  merge, push.
- **Cada test nuevo tiene que poder fallar**: se verifica con una mutación sobre
  respaldos, y el árbol queda limpio (diff). Cuando alguien declara un mutante
  «equivalente», se prueba con pedidos inválidos, ids inexistentes, ajenos y
  membresía inactiva: en el slice 3 el argumento no se sostuvo y en el 4 sí.
- **Los agentes comparten el scratchpad**: cada uno trabaja en un subdirectorio
  propio; ya hubo archivos pisados.
- **Los mutantes van en una copia, nunca en el árbol compartido**: en el 8c un mutante
  de prueba entró en un commit del team-lead (`0bd76aa`, corregido en `a5ab4a2`). Antes de
  commitear, `git diff` de cada archivo y confirmar que nadie está mutando.
- **E2E**: horas «de hoy» siempre pasadas (`00:00–00:01`); esperar la respuesta
  del servidor (`withServerAction`) y no un estado ya dibujado; respuesta perdida
  real con `route.fetch()` + `route.abort()`; editores en portal se buscan en
  `page`; esperar el foco del disparador tras cerrar un calendario; 11 s entre
  corridas completas; el 429 del límite por IP lo absorbe `signIn` con `X-Retry-After`.
- **Reloj emulado**: con `page.clock.install()`, `TZDate` no se puede extender y los
  rótulos de fecha del cliente salen un día antes; instalarlo después de sembrar y recargar.
- **Avisos que sobreviven**: si la revalidación puede desmontar el componente que muestra
  un error, el aviso sube a algo que sobrevive (región de la pantalla con foco).
- **Altas con id del cliente**: el caso que distingue el orden de una validación respecto
  de la escritura es el id de una fila ajena (choca con la clave primaria y sale
  `forbidden`); en el 10 un mutante dado por equivalente cayó así. En el 11b pasó otra vez, con
  autor y `backend-reviewer` de acuerdo en que era equivalente porque miraron solo el estado de
  la base: además de las filas, comparar la respuesta y si la llamada espera un bloqueo
  (`outcomeWhileLocked`).
- **Nada de `git stash` en el árbol compartido**: en el 2c un agente lo usó para comparar el
  lint; el `pop` restauró todo, pero con otros agentes escribiendo puede llevarse cambios
  ajenos. Comparar en una copia.
- **Hashes informados**: en el 12 un agente avisó dos commits que no existían; antes de
  pasar un hash a otro agente, verificarlo con `git log` o `git cat-file -t`.
- **Diálogos que crecen**: un `DialogContent` sin alto máximo queda cortado en ventanas bajas
  (1366×657 útiles en una laptop) y no se desplaza; medir con los avisos a la vista.
- **Popups dentro de un `Dialog`** (Base UI): con la lista vacía, el `Escape` pasa al diálogo
  salvo que esté montado `Combobox.Empty`; un ítem resaltado pinta los descendientes con `**:`;
  ignorar un cambio de `inputValue` sin `details.cancel()` deja estado pendiente en la primitiva.
- **Contratos viejos**: antes de implementar un contrato escrito antes de otros slices, una
  ronda corta del `architecture-reviewer` contra el árbol (en el 9 encontró dos mayores).
- **Foco**: un control con foco que pasa a `disabled` lo pierde a `body`; usar
  `aria-disabled` y no actuar.
- **Documentos de correcciones**: son históricos y no se reescriben.
- **Un solo `next dev` por directorio** (Next 16): un agente que levanta el servidor en el árbol
  principal le bloquea el suyo a otro. Cada uno lo levanta desde una copia propia en su
  subdirectorio del scratchpad, con su puerto.
- **Bases propias**: cada agente que corre tests fuera de la suite usa una base propia y la
  borra al terminar; avisar antes de borrar una base ajena.
- **Informes que no llegan**: con la sesión bajo `/remote-control`, los `SendMessage` de los
  agentes a «team-lead» no llegaron; el nombre de la sesión lo da `ListAgents` («clock-cb»). Si un
  agente queda idle sin informe, leerlo del transcript en `subagents/` del directorio de la
  sesión. Un agente quedó más de una hora esperando el permiso de un `docker exec` o un
  `db:migrate`: crear las bases antes de lanzarlo y, si no avanza, pararlo y seguir a mano.
- **Writes bloqueados**: a `parity-analyst` le bloquean escribir `.md` nuevos («Subagents should
  return findings as text»); manda el documento en el mensaje y lo escribe el team-lead.
- **`pkill -f "next dev"`** tira los servidores de los demás agentes: matar por PID.
- **El coordinador delega**: todo cambio de código o de CI, aun chico, va a un subagente (con
  `isolation: "worktree"` si hay otro slice en el árbol principal). El team-lead decide, escribe
  los documentos, mergea y verifica.
- **Índice compartido**: con varios agentes en el mismo checkout, commitear con
  `git commit -- <rutas>` y revisar `git show --stat HEAD`; un `git add` + `git commit` a secas
  se llevó en R2a un `git rm` ajeno y dejó commits que no compilan.
- **Postgres de los tests = el de Neon**: los tests corrían en 17 y Neon es 18; el código de un
  error cambió (`23001`). La medición de rendimiento va en la misma versión mayor que Neon.
- **Reloj y zona de la máquina**: un test que depende de la fecha real o de la zona del proceso
  pasa o falla según el día o la máquina (F2 de R2a, el test de Salta). Fijar `TZ` y el reloj.
- **Writes de `parity-analyst`**: si se lo bloquean, el contenido completo queda en el
  `tool_use` del Write en su transcript; se aplica desde ahí.
- **El texto de `parity-analyst` lo aplica el team-lead**: el arnés le rechaza el Write aunque
  sea un archivo existente (R2b); manda los cambios con su lugar exacto y el team-lead los aplica
  con un script de reemplazos que afirma que cada ancla aparece una sola vez.
- **Avisos duplicados y cruzados**: cada agente manda su informe por SendMessage y además llega su
  `idle_notification` con el mismo texto; y un agente puede preguntar algo ya respondido porque los
  mensajes se cruzan. Antes de responder, mirar `git log` y `git status`: suele estar resuelto.
- **Archivos compartidos entre roles**: cuando un tipo nuevo rompe la compilación de archivos de
  otro rol, el dueño del tipo toca lo mínimo en el mismo commit, después de que los dueños
  commiteen lo pendiente de esos archivos (R2b, pasos 1 y 4).
- **La base de la integración es `TEST_DATABASE_URL`**: `src/test/setup.ts:7` pisa
  `DATABASE_URL` con ella, y por defecto es `clock_test`, compartida. En R5 los encargos decían
  `DATABASE_URL` y varias corridas fueron a `clock_test` sin que nadie lo notara. Para un
  servidor (`next dev`, `next start`, e2e), en cambio, va `DATABASE_URL`.
- **Formato**: `npx prettier --write` sobre los `.md` que escriben agentes sin
  shell; `npx prettier --check .` antes de commitear.

## Índice

- Plan y orden: `fase1-mapa.md`.
- Contratos: `fase1-slice<n>-*.md`; correcciones: `correcciones-fase1-slice<n>*.md`.
- ADR: `docs/adr/0001`–`0021` (todos aceptados).
- Paridad: `docs/parity/` (time-tracker, perfil, proyectos, calendario,
  timesheet).
