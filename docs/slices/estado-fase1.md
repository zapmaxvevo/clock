# Estado de la fase 1

Registro vivo de por dónde va la ejecución. Se actualiza al cerrar cada paso;
quien retome el trabajo empieza acá. Última actualización: 2026-10-05.

## Dónde estamos

| Slice                                      | Estado            |
| ------------------------------------------ | ----------------- |
| 1 — Timer sin proyecto                     | En `main`         |
| 2 — Modo manual                            | En `main`         |
| 2b — Reintento de «Iniciar»                | En `main`         |
| 3 — Corregir horas y fecha                 | En `main`         |
| 4 — Continuar, duplicar, descartar, atajos | En `main`         |
| 5 — Semana y paginación                    | En `main`         |
| 9 — Núcleo de proyectos                    | En `main`         |
| 10 — Selector de proyecto y tarea          | En `main`         |
| 7 — Perfil                                 | En `main`         |
| 6 — Selección y acciones en masa           | En `main`         |
| 7b — Perfil: nombre editable y tema        | En `main`         |
| 8 — Calendario: lectura                    | En `main`         |
| 8c — Calendario: escritura                 | En `main`         |
| 8b — Calendario: arrastre                  | En `main`         |
| 11 — Etiquetas y facturable (11a, 11b)     | Contrato aprobado |
| 12–13                                      | Sin contrato      |

Los slices 1 a 10, 7b, 8c y 8b están en `main`. El 7b se mergeó el 2026-10-05 (`ccf09b2`) con
lint, typecheck, 889 de unidad, 924 de integración y 117 de 117 e2e en verde; de paso arregló la
fuente (`--font-sans` se apuntaba a sí misma desde la fase 0 y la interfaz salía en serif)
(**falta `git push origin main`**). El contrato del 11 está aprobado en dos rondas, partido en
11a (facturable) y 11b (etiquetas), con el ADR 0016 aceptado.

## Lo primero de la sesión siguiente

0. **Lo que sigue (2026-10-05)**: el **11a** sobre `main` en `ccf09b2`, primero con una ronda
   corta del `architecture-reviewer` contra el árbol (entró el 7b). Su migración sale como
   `0009`. Después el 11b, con el 11a en `main`.
1. **Después**: los contratos de los slices **12 y 13** (ver `fase1-mapa.md`), y el slice chico de «Reintentar» en el alta manual
   (ADR 0007, retirar TT-109), ya decidido. Deuda chica sin slice:
   - un `DayCalendar` compartido entre `DateField` y `PeriodPicker`;
   - un `ClockRangeFields` común a `manual-bar.tsx`, `entry-times-editor.tsx` y el diálogo;
   - las variantes de `retryOf`;
   - en e2e, `stepToDay`, `isXPage` y `NETWORK_FAILURE` comunes;
   - `preferenceCookie` en `src/lib`;
   - el `Positioner` del detalle que todavía se lleva un clic (F2-n1 del 8b).
2. Deuda que dejó el 7b: una cuenta de Google nueva con un correo ya usado (PF-47) termina en la
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

- **Push**: `git push origin main`.
- **Antes de desplegar el 7b**: correr en la base de producción
  `select u.id, u.email from "user" u where not exists (select 1 from account a where a.user_id = u.id and a.provider_id = 'google');`.
  Tiene que dar cero filas: con `disableImplicitLinking`, una fila `user` sin cuenta de Google
  ya no puede entrar.
- **`.env` local**: `npm run db:migrate` falla en silencio con el `DATABASE_URL` del
  `.env`; la base de e2e se migró con la URL de `e2e/environment.ts`. El `.env` no se
  puede leer desde la sesión.
- **Postgres de Neon**: el slice 9 necesita 15 o posterior (`on delete set null (col)`)
  antes de desplegar.
- **Rol de Neon para e2e**: `E2E_DATABASE_URL` en el environment `preview` de GitHub, con
  un rol que solo lea `workspace` y actualice su `created_at`.
- **Sesión en el workspace de Clockify** para cerrar lo no verificado: P-14 en
  `time-tracker.md` (fila de la entrada que corre, hora inexistente, horas de la copia al
  duplicar, «la última» de `c`, continuar o duplicar con un proyecto no disponible, TT-57 y
  TT-58), la edición masiva del rastreador (P-07), P-09 de `perfil.md` (con lo del 7b: el
  «username», el tema y la identidad de Google en PF-45, PF-47 y PF-48), P-12 de
  `timesheet.md`, P-07 de `calendario.md` (con CAL-23), PR-40/PR-58 y P-33 de `proyectos.md`
  (con PR-47 y PR-48), y lo del 11 en P-14: TT-12, TT-50 y el rechazo de continuar o duplicar
  con una etiqueta archivada.
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
  `forbidden`); en el 10 un mutante dado por equivalente cayó así.
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
- ADR: `docs/adr/0001`–`0016` (todos aceptados).
- Paridad: `docs/parity/` (time-tracker, perfil, proyectos, calendario,
  timesheet).
