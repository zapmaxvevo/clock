# Estado de la fase 1

Registro vivo de por dónde va la ejecución. Se actualiza al cerrar cada paso;
quien retome el trabajo empieza acá. Última actualización: 2026-10-03.

## Dónde estamos

| Slice                                      | Estado                                             |
| ------------------------------------------ | -------------------------------------------------- |
| 1 — Timer sin proyecto                     | En `main`                                          |
| 2 — Modo manual                            | En `main`                                          |
| 2b — Reintento de «Iniciar»                | En `main`                                          |
| 3 — Corregir horas y fecha                 | En `main`                                          |
| 4 — Continuar, duplicar, descartar, atajos | En `main`                                          |
| 5 — Semana y paginación                    | Contrato cerrado tras dos rondas; sin implementar  |
| 9 — Núcleo de proyectos                    | Contrato con dos rondas aplicadas; sin implementar |
| 6, 7, 8, 10–13                             | Sin contrato                                       |

Los merges de 2b, 3 y 4 son locales: **hay que correr `git push origin main`**
(el sistema de permisos de Claude lo bloquea; lo corre el usuario). No quedan
agentes corriendo ni trabajo sin commitear.

## Lo primero de la sesión siguiente

1. **Dos menores del slice 4**, ya decididos en
   `correcciones-fase1-slice4-revisiones.md`, sección «Segunda revisión de
   frontend — pendiente para la sesión siguiente»: lo tecleado durante un
   descarte que se pierde si se sale del campo antes de la respuesta, y el
   diálogo de descarte que se desmonta sin devolver el foco con el modo manual
   forzado. Un `frontend-dev`, después la suite e2e, y un commit `fix` sobre
   `main` en una rama propia.
2. **Implementar el slice 5** (`fase1-slice5-semana-y-paginacion.md`) con el
   pipeline de abajo. Trae la única migración del tramo
   (`membership.week_start`) y el ADR 0008. El contrato se escribió antes de
   implementar 3 y 4: avisar a los agentes que el árbol es posterior y que el
   código manda en los detalles de forma.
3. Después, el **slice 9** y los contratos del 6, 7 y 8 (`fase1-mapa.md`).

## Decisiones pendientes del usuario

- **`npm audit` en CI**: rojo también en `main`, por `braces` vía `shadcn`
  (en `dependencies` solo por su CSS). Recomendación: pasar `shadcn` a
  `devDependencies` y auditar con `--omit=dev`. Mientras siga rojo, el job de e2e
  de CI no corre.
- **Postgres de Neon**: el slice 9 necesita 15 o posterior (`on delete set null
(col)`).
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
- **Foco**: un control con foco que pasa a `disabled` lo pierde a `body`; usar
  `aria-disabled` y no actuar.
- **Documentos de correcciones**: son históricos y no se reescriben.
- **Formato**: `npx prettier --write` sobre los `.md` que escriben agentes sin
  shell; `npx prettier --check .` antes de commitear.

## Índice

- Plan y orden: `fase1-mapa.md`.
- Contratos: `fase1-slice<n>-*.md`; correcciones: `correcciones-fase1-slice<n>*.md`.
- ADR: `docs/adr/0001`–`0009` (todos aceptados).
- Paridad: `docs/parity/` (time-tracker, perfil, proyectos, calendario,
  timesheet).
