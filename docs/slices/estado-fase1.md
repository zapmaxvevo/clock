# Estado de la fase 1

Registro vivo de por dónde va la ejecución. Se actualiza al cerrar cada paso;
quien retome el trabajo empieza acá. Última actualización: 2026-10-10.

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
     el Postgres local; los agentes usan la cadena de `e2e/environment.ts`.

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
- **Formato**: `npx prettier --write` sobre los `.md` que escriben agentes sin
  shell; `npx prettier --check .` antes de commitear.

## Índice

- Plan y orden: `fase1-mapa.md`.
- Contratos: `fase1-slice<n>-*.md`; correcciones: `correcciones-fase1-slice<n>*.md`.
- ADR: `docs/adr/0001`–`0021` (todos aceptados).
- Paridad: `docs/parity/` (time-tracker, perfil, proyectos, calendario,
  timesheet).
