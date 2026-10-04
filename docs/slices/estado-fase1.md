# Estado de la fase 1

Registro vivo de por dónde va la ejecución. Se actualiza al cerrar cada paso;
quien retome el trabajo empieza acá. Última actualización: 2026-10-04.

## Dónde estamos

| Slice                                      | Estado                                          |
| ------------------------------------------ | ----------------------------------------------- |
| 1 — Timer sin proyecto                     | En `main`                                       |
| 2 — Modo manual                            | En `main`                                       |
| 2b — Reintento de «Iniciar»                | En `main`                                       |
| 3 — Corregir horas y fecha                 | En `main`                                       |
| 4 — Continuar, duplicar, descartar, atajos | En `main`                                       |
| 5 — Semana y paginación                    | En `main`                                       |
| 9 — Núcleo de proyectos                    | En `main`                                       |
| 10 — Selector de proyecto y tarea          | En `main`                                       |
| 7 — Perfil                                 | En `main`                                       |
| 6 — Selección y acciones en masa           | En `main` (local): falta `git push origin main` |
| 7b — Perfil: nombre editable y tema        | Sin contrato                                    |
| 8 — Calendario                             | Contrato en curso en `fase1/slice-8-calendario` |
| 11–13                                      | Sin contrato                                    |

Los slices 1 a 5, 7, 9 y 10 están en `origin/main`. El
slice 6 pasó las seis revisiones (`correcciones-fase1-slice6-revisiones.md`) y su ronda de
correcciones, y está mergeado en `main` local: **falta `git push origin main`**. Corrida
final: 657 de unidad, 779 de integración y 99 de 99 en e2e (16 fallas por el 429 del
endpoint de sesión, que pasan con `--last-failed`). No quedan agentes corriendo ni trabajo
sin commitear.

## Lo primero de la sesión siguiente

1. **El contrato del 8** (calendario): `parity-analyst` ya tiene `docs/parity/calendario.md`;
   sigue el `architect`. Después el 7b, 11, 12, 13.
2. **Decisión del usuario sobre el 429** (ver «Decisiones pendientes»): ya son 16 fallas por
   corrida completa y crece con cada slice.
3. Para el contrato del **7b**: TT-16 justifica guardar el modo timer/manual en una cookie
   porque «no hay perfil todavía»; el perfil existe y no lo incluye. Decidir si entra al 7b o
   se reescribe la justificación. El 7b edita el nombre con su propia action:
   `/api/auth/update-user` quedó cerrado en el 7 (`disabledPaths`).
4. Pendientes chicos de paridad que dejó el 10: PR-85 sigue diciendo «si el rol lo
   permite» (TT-87 ya dice `project.create`), y TT-104 no menciona que el proyecto
   archivado se quita con «Sin proyecto».

El hydration mismatch de `AppLayout` quedó cerrado: es el `MetadataWrapper` de Next durante
una recarga en caliente y no se reproduce.

Decisiones del usuario del 2026-10-04 para el calendario: P-04 «Guardar» todo o nada con
botón; P-01 crear desde la grilla **se permite** con un timer corriendo; P-02 la entrada que
cruza la medianoche suma entera en el día de inicio; P-06 «Detener» en el diálogo del timer.
P-03 (arrastrar el inicio del timer) y P-05 (solo días laborables) quedan fuera del 8, con
su propuesta.

Decisiones del usuario del 2026-10-03: ADR 0010, 0011 y 0012 aceptados; TT-07 con las tareas
siempre listadas; continuar o duplicar con un proyecto no disponible se rechaza; la zona por
omisión del perfil es un valor fijo (`America/Argentina/Buenos_Aires`), no la del workspace.

Deuda anotada: no hay ningún `error.tsx` en `src/app`; un error de lectura cae en la página
genérica de Next. La base de e2e acumula clientes y proyectos que en la fase 1 no se pueden
borrar (umbral de §8 del contrato del 9), más los `rev-*` y sintéticos de las revisiones
del 10.

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
  copia al duplicar, «la última» de `c`, continuar o duplicar con un proyecto no
  disponible, TT-57 y TT-58), la edición masiva del rastreador (P-07: si está en Free; si limita la selección
  a un día; qué cambia «Time»; si aplica en parte; «DELETE» y mayúsculas), P-09 de `perfil.md` (formas de 12 h y de fecha, búsqueda de zonas, `UTC`), P-12 de
  `timesheet.md`, P-07 de
  `calendario.md`, y PR-40/PR-58 de `proyectos.md` (quién crea tareas).
- **El 429 del endpoint de sesión de prueba crece con la suite**: seis fallas en la corrida
  del 7 (88 tests) y dieciséis en la del 6 (99 tests), que pasan al repetir. Opciones: subir el límite solo con
  `ALLOW_TEST_SESSION`, o que cada worker reuse su sesión. Toca un control de seguridad.
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
