# Estado de la fase 1

Registro vivo de por dónde va la ejecución. Se actualiza al cerrar cada paso;
quien retome el trabajo empieza acá. Última actualización: 2026-10-04.

## Dónde estamos

| Slice                                      | Estado                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| 1 — Timer sin proyecto                     | En `main`                                                                           |
| 2 — Modo manual                            | En `main`                                                                           |
| 2b — Reintento de «Iniciar»                | En `main`                                                                           |
| 3 — Corregir horas y fecha                 | En `main`                                                                           |
| 4 — Continuar, duplicar, descartar, atajos | En `main`                                                                           |
| 5 — Semana y paginación                    | En `main`                                                                           |
| 9 — Núcleo de proyectos                    | En `main`                                                                           |
| 10 — Selector de proyecto y tarea          | En `main`                                                                           |
| 7 — Perfil                                 | En `main`                                                                           |
| 6 — Selección y acciones en masa           | En `main`                                                                           |
| 7b — Perfil: nombre editable y tema        | Sin contrato                                                                        |
| 8 — Calendario: lectura                    | En `main`                                                                           |
| 8c — Calendario: escritura                 | En `main`                                                                           |
| 8b — Calendario: arrastre                  | Contrato escrito, ADR 0014 aceptado; revisión en curso en `fase1/slice-8b-arrastre` |
| 11–13                                      | Sin contrato                                                                        |

Los slices 1 a 10 y el 8c están en `main`. El 8c (calendario, escritura) se mergeó el
2026-10-04 con lint, typecheck, 810 de unidad, 873 de integración y 107 de 107 e2e en verde
(**falta `git push origin main`**). No quedan agentes con trabajo pendiente ni cambios sin
commitear.

## Lo primero de la sesión siguiente

1. **El 8b** (arrastre): sin contrato; el esbozo está en §8 del contrato del 8c. Lo
   arranca el `architect` contra `main`, seguido de una ronda del `architecture-reviewer`.
   Ojo con lo que dejó el 8c: la guarda de `focusBlock` en `calendar-grid.tsx` es la que hoy
   impide un detalle detrás de la confirmación de «Borrar» (T-n6 de
   `correcciones-fase1-slice8c-revisiones.md`), y `slotAt` decide el clic en una franja.
   Deuda chica sin slice: un `DayCalendar` compartido entre `DateField` y `PeriodPicker`; un
   `ClockRangeFields` común a `manual-bar.tsx`, `entry-times-editor.tsx` y el diálogo; las
   variantes de `retryOf`; y en e2e, `stepToDay`, `isXPage` y `NETWORK_FAILURE` comunes;
   `preferenceCookie` en `src/lib`.
2. Para el contrato del **7b**: el modo timer/manual queda en la cookie (TT-16
   corregido el 2026-10-04) y no entra al 7b. El 7b edita el nombre con su propia
   action: `/api/auth/update-user` quedó cerrado en el 7 (`disabledPaths`).

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
  TT-58), la edición masiva del rastreador (P-07), P-09 de `perfil.md`, P-12 de
  `timesheet.md`, P-07 de `calendario.md`, y PR-40/PR-58 de `proyectos.md`.

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
- **Formato**: `npx prettier --write` sobre los `.md` que escriben agentes sin
  shell; `npx prettier --check .` antes de commitear.

## Índice

- Plan y orden: `fase1-mapa.md`.
- Contratos: `fase1-slice<n>-*.md`; correcciones: `correcciones-fase1-slice<n>*.md`.
- ADR: `docs/adr/0001`–`0012` (todos aceptados).
- Paridad: `docs/parity/` (time-tracker, perfil, proyectos, calendario,
  timesheet).
