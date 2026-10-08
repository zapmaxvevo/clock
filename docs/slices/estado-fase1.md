# Estado de la fase 1

Registro vivo de por dónde va la ejecución. Se actualiza al cerrar cada paso;
quien retome el trabajo empieza acá. Última actualización: 2026-10-08.

## Dónde estamos

| Slice                                       | Estado            |
| ------------------------------------------- | ----------------- |
| 1 — Timer sin proyecto                      | En `main`         |
| 2 — Modo manual                             | En `main`         |
| 2b — Reintento de «Iniciar»                 | En `main`         |
| 3 — Corregir horas y fecha                  | En `main`         |
| 4 — Continuar, duplicar, descartar, atajos  | En `main`         |
| 5 — Semana y paginación                     | En `main`         |
| 9 — Núcleo de proyectos                     | En `main`         |
| 10 — Selector de proyecto y tarea           | En `main`         |
| 7 — Perfil                                  | En `main`         |
| 6 — Selección y acciones en masa            | En `main`         |
| 7b — Perfil: nombre editable y tema         | En `main`         |
| 8 — Calendario: lectura                     | En `main`         |
| 8c — Calendario: escritura                  | En `main`         |
| 8b — Calendario: arrastre                   | En `main`         |
| 11a — Facturable                            | En `main`         |
| 11b — Etiquetas                             | En `main`         |
| 12 — Edición masiva de proyecto y etiquetas | En `main`         |
| 2c — «Reintentar» en el alta manual         | En `main`         |
| Arreglo: piso de fechas fijo (2000-01-01)   | En `main`         |
| 13 — Planilla de horarios semanal           | Contrato aprobado |

Los slices 1 a 12 (con 2b, 2c, 7b, 8b, 8c, 11a y 11b) están en `main`: el rastreador queda
cubierto salvo lo fuera de alcance, y el alta manual ya ofrece «Reintentar» (TT-109 dejó de ser
excepción). El 2c se mergeó el 2026-10-07 con lint, typecheck, 1098 de unidad, 1121 de
integración, `next build` y 153 de 153 e2e en verde, dos corridas. El arreglo del piso fijo
(`fase1-fix-piso-fijo.md`, después del primer deploy) se mergeó el mismo día con 1098 de unidad,
1142 de integración, `next build` y 155 de 155 e2e dos veces; con el deploy, el `update` provisorio
de `created_at` en Neon queda sin efecto práctico. Todo está pusheado hasta `07674bc`. No quedan
agentes con trabajo pendiente ni cambios sin commitear. Postgres local: `docker start clock-pg`;
los e2e corren contra una base nueva (`DATABASE_URL=…/clock_e2e_piso`), porque `clock` tiene un
segundo workspace vacío del owner y `renewWorkspace` se corta.

## Lo primero de la sesión siguiente

0. **Lo que sigue**: el **13** (planilla de horarios), en la rama `fase1/slice-13-contrato`.
   El contrato `fase1-slice13-planilla.md` quedó **aprobado** el 2026-10-08 tras tres rondas
   de `architecture-reviewer` (`correcciones-fase1-slice13.md`, `-ronda2.md`, `-ronda3.md`),
   con `timesheet.md` alineado. Corte 13 (grilla, escritura de celdas, quitar fila; todo el
   backend) / 13b (menú y detalle de la celda, sin backend nuevo). Los ADR **0018** (lo que escribe una celda se calcula en instantes) y
   **0019** (escribir una celda fija su valor, sin id del cliente) los aceptó el usuario el
   2026-10-08, con las notas de 0005, 0006 y 0007. En curso: pipeline del 13 en la rama `fase1/slice-13-planilla`
   (backend y frontend en paralelo, `e2e-tester`, seis revisiones).
1. Deuda chica sin slice:
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

Lo que sigue siendo del usuario, porque necesita sus cuentas o su máquina:

- **Push**: `git push origin main` después de cada merge.
- **Antes de desplegar el 7b**: correr en la base de producción
  `select u.id, u.email from "user" u where not exists (select 1 from account a where a.user_id = u.id and a.provider_id = 'google');`.
  Tiene que dar cero filas: con `disableImplicitLinking`, una fila `user` sin cuenta de Google
  ya no puede entrar.
- **`.env` local**: su `DATABASE_URL` usa el usuario `user`, que Postgres rechaza
  (`password authentication failed`): es un valor de ejemplo. Por eso `db:migrate` fallaba y el
  login local no anda. Para usar la app: apuntarlo a `postgresql://clock:clock@localhost:5432/clock`
  y cargar credenciales de Google con `http://localhost:3000` como origen. Mientras tanto, la app
  se ve levantándola con el entorno de `playwright.config.ts` y la sesión de prueba.
- **Postgres de Neon**: el slice 9 necesita 15 o posterior (`on delete set null (col)`)
  antes de desplegar.
- **Rol de Neon para e2e**: `E2E_DATABASE_URL` en el environment `preview` de GitHub, con
  un rol que solo lea `workspace` y actualice su `created_at`.
- **Sesión en el workspace de Clockify** para cerrar lo no verificado: P-14 en
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
- **Formato**: `npx prettier --write` sobre los `.md` que escriben agentes sin
  shell; `npx prettier --check .` antes de commitear.

## Índice

- Plan y orden: `fase1-mapa.md`.
- Contratos: `fase1-slice<n>-*.md`; correcciones: `correcciones-fase1-slice<n>*.md`.
- ADR: `docs/adr/0001`–`0019` (todos aceptados).
- Paridad: `docs/parity/` (time-tracker, perfil, proyectos, calendario,
  timesheet).
