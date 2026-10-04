# Estado de la fase 1

Registro vivo de por dónde va la ejecución. Se actualiza al cerrar cada paso;
quien retome el trabajo empieza acá. Última actualización: 2026-10-03 (noche).

## Dónde estamos

| Slice                                      | Estado                                                           |
| ------------------------------------------ | ---------------------------------------------------------------- |
| 1 — Timer sin proyecto                     | En `main`                                                        |
| 2 — Modo manual                            | En `main`                                                        |
| 2b — Reintento de «Iniciar»                | En `main`                                                        |
| 3 — Corregir horas y fecha                 | En `main`                                                        |
| 4 — Continuar, duplicar, descartar, atajos | En `main`                                                        |
| 5 — Semana y paginación                    | En `main`                                                        |
| 9 — Núcleo de proyectos                    | En `main`                                                        |
| 10 — Selector de proyecto y tarea          | Implementado en `fase1/slice-10-selector`; faltan las revisiones |
| 7 — Perfil                                 | Contrato con ronda 1 aplicada; va después del 10                 |
| 6 — Selección y acciones en masa           | Contrato con ronda 1 aplicada; va después del 7                  |
| 7b — Perfil: nombre editable y tema        | Sin contrato                                                     |
| 8, 11–13                                   | Sin contrato                                                     |

Los slices 1 a 5 y 9 están en `main`, local: **falta `git push origin main`**. El slice
10 está **implementado y commiteado** en `fase1/slice-10-selector` (sin mergear), en verde:
503 de unidad, 629 de integración y 81 de 81 en e2e. En esa rama viajan también los
contratos del 6 y del 7 y los ADR 0010 a 0012, aceptados. No quedan agentes corriendo ni
trabajo sin commitear.

## Lo primero de la sesión siguiente

1. **Terminar el slice 10** en `fase1/slice-10-selector`: lanzar las seis revisiones
   (backend, frontend, seguridad, código, tests, paridad), escribir
   `correcciones-fase1-slice10-revisiones.md`, ronda de correcciones, segunda revisión de
   frontend si hace falta, corrida final y merge a `main`. Commits del slice: `6551d98`,
   `f3313c7`, `b13575b`, `b429e54`, `8712732`. Datos para los revisores:
   - desvíos del backend: el commit de firmas trae toda la implementación; `samePair`,
     `isTaskWithoutProject` y `ProjectPair` que el contrato no nombra; las vistas tras una
     escritura se releen con el join en la misma transacción (sin CTE); tocó
     `entry-week.test.ts`. Mutantes equivalentes declarados: `startTimer` validando
     después de cerrar el timer, y los joins sin workspace.
   - desvíos del frontend: `input-group.tsx` copiado de la salida de shadcn (el CLI pisaba
     `button.tsx`); `triggerRef` y `onOpenChange` en el selector; bloqueo del typeahead
     sobre el disparador cerrado; «Sin proyecto» se ofrece con el catálogo vacío; región
     de vacíos propia.
   - `e2e/tracker.spec.ts:48` cambió a «Proyecto» por TT-06 (autorizado).
   - el log de dev muestra un hydration mismatch en `AppLayout`
     (`src/app/(app)/layout.tsx`): sin investigar.
2. **Orden decidido: 10 → 7 → 6.** Antes de implementar el 7 y el 6, una ronda corta del
   `architecture-reviewer` contra el árbol con el 10 adentro (sus contratos lo piden en §0).
3. El contrato del **8** (calendario), cuando el 7 esté en `main`; después el 7b, 11, 12, 13.

Decisiones del usuario del 2026-10-03: ADR 0010, 0011 y 0012 aceptados; TT-07 con las tareas
siempre listadas; continuar o duplicar con un proyecto no disponible se rechaza; la zona por
omisión del perfil es un valor fijo (`America/Argentina/Buenos_Aires`), no la del workspace.

Deuda anotada: no hay ningún `error.tsx` en `src/app`; un error de lectura cae en la página
genérica de Next. La base de e2e acumula clientes y proyectos que en la fase 1 no se pueden
borrar (umbral de §8 del contrato del 9).

## Decisiones pendientes del usuario

- **`npm audit` en CI**: rojo también en `main`, por `braces` vía `shadcn`
  (en `dependencies` solo por su CSS). Recomendación: pasar `shadcn` a
  `devDependencies` y auditar con `--omit=dev`. Mientras siga rojo, el job de e2e
  de CI no corre.
- **ADR 0008, línea 61**: dice que «Cargar más» funciona sin JavaScript y no es así
  (sin JS `/` queda en el esqueleto). Propuesta: corregirla como TT-52.
- **`.env` local**: `npm run db:migrate` falla en silencio con el `DATABASE_URL` del
  `.env`; la base de e2e se migró con la URL de `e2e/environment.ts`.
- **Postgres de Neon**: el slice 9, ya en `main`, necesita 15 o posterior (`on delete set
null (col)`) antes de desplegar.
- **Sesión en el workspace de Clockify** para cerrar lo no verificado: P-14 en
  `time-tracker.md` (fila de la entrada que corre, hora inexistente, horas de la
  copia al duplicar, «la última» de `c`), P-12 de `timesheet.md`, P-07 de
  `calendario.md`, y PR-40/PR-58 de `proyectos.md` (quién crea tareas).
- **«Reintentar» en el alta manual**: con el ADR 0007 se le podría devolver y
  retirar TT-109. Es un cambio de paridad chico; queda propuesto.
- **Rol de Neon para e2e**: `E2E_DATABASE_URL` en el environment `preview` de
  GitHub, con un rol que solo lea `workspace` y actualice su `created_at`.

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
- **E2E**: horas «de hoy» siempre pasadas (`00:00–00:01`); esperar la respuesta
  del servidor (`withServerAction`) y no un estado ya dibujado; respuesta perdida
  real con `route.fetch()` + `route.abort()`; editores en portal se buscan en
  `page`; esperar el foco del disparador tras cerrar un calendario; 11 s entre
  corridas completas.
- **Reloj emulado**: con `page.clock.install()`, `TZDate` no se puede extender y los
  rótulos de fecha del cliente salen un día antes; instalarlo después de sembrar y recargar.
- **Avisos que sobreviven**: si la revalidación puede desmontar el componente que muestra
  un error, el aviso sube a algo que sobrevive (región de la pantalla con foco).
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
