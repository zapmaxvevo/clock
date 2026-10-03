# Correcciones al contrato del slice 9 — ronda 1

Salida de `architecture-reviewer` sobre `fase1-slice9-nucleo-de-proyectos.md` y
el ADR 0009: un bloqueante, cinco mayores, nueve menores. El esquema se ejecutó
contra Postgres 17: la migración generada y la custom, los rechazos entre
workspaces, las cascadas desde la membresía y la reversión funcionan. Dos
problemas aparecieron solo ejecutando (M-1 y M-2). El ADR 0009 se puede aprobar
con dos agregados. Abajo, la resolución decidida de cada hallazgo.

## Bloqueante

### B-1. Los e2e 1 y 3 no se pueden cumplir en el entorno donde corren

Un solo workspace para todos los tests, en paralelo y sobre la base persistente
del preview: «el workspace sin proyectos» pasa una vez en la vida de esa base y
los nombres fijos chocan en la segunda corrida.

**Resolución.** El vacío de PR-85 se prueba en integración sobre
`getProjectCatalog` con un workspace sembrado vacío y en un test del componente.
Todo nombre del e2e lleva un sufijo único por corrida. El orden «Sin cliente al
final» se afirma solo entre los grupos que creó el propio test.

## Mayores

### M-1. Las claves que §2.3 le fija al slice 10 no funcionan juntas

Borrar un proyecto con tareas y entradas falla con `time_entry_task_needs_project`
(los triggers de la cascada se encolan después de los del proyecto); sin el
`check`, la entrada queda con un `task_id` colgado.

**Resolución.** §2.3 conserva el `check` y la FK de tres columnas como red, pero
deja de prometer que un borrado directo del proyecto funcione: la base lo
rechaza. El borrado de la fase 2 hace `delete task where project_id` y después
`delete project` en la misma transacción. Sumar el criterio para el slice 10 y
corregir el párrafo de PR-67.

### M-2. Borrar un cliente falla si un proyecto suyo se llama igual que uno sin cliente

**Resolución.** La regla se escribe ahora: el borrado del cliente se rechaza y
la fase 2 traduce el 23505 a un mensaje con su PR. El criterio 2 suma el caso
(el borrado se rechaza y nada cambia) y `proyectos.md` suma la fila (tarea de
`parity-analyst`, junto con M-5).

### M-3. Una sola plomería de altas, no dos

**Resolución.** Lo que el ADR 0007 quiere en un solo lugar se escribe en un
lugar neutro desde el primer slice que lo implementa, que es el **2b**:
`src/server/create-once.ts` (`createOnce` con `findOwn`, `attempt`,
`idConstraint` y un gancho opcional `onOtherConflict`, que usa el timer) y
`src/server/db/constraint-error.ts` (`hasConstraint` y los códigos de
Postgres). El contrato del 2b se ajusta en consecuencia; el 4 y el 9 lo
importan.

El 9, como segundo módulo con actions, extrae además `ActionResult`, `failure` y
`handle` a `src/server/`, el `refine` de `noNullCharacter` a un export
compartido, y el hook de acción con reintento a `src/hooks/`. `time-entry`
migra a esas piezas en el próximo slice que toque sus actions; queda como deuda
en el §5 del mapa. El ADR 0007 se enmienda ahora, mientras sigue «propuesto»,
para nombrar las dos ubicaciones.

### M-4. `can()` concede si el recurso no corresponde a la acción

**Resolución.** Las dos cosas: el par tipado,
`can<A extends Action>(actor, action: A, resource: ResourceFor<A>)`, y la
defensa en tiempo de ejecución (las acciones de proyecto devuelven `false` con
un recurso de otra clase). Casos en `permissions.test.ts`.

### M-5. El reparto contra `proyectos.md` §14 está incompleto y sin dueño

El criterio del contrato es el correcto (ADR 0004 y el mapa mandan; §14 está
mal), pero faltan PR-40, PR-61, PR-85, PR-86, PR-31, PR-58, PR-10, PR-70, PR-55,
PR-93, y PR-11 está dentro de un rango que no le corresponde.

**Resolución.** `parity-analyst` rehace la tabla de §14 antes de implementar,
con ese dueño nombrado en el reparto de §6. El contrato cita la tabla corregida.

## Menores

| ID  | Resolución                                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| m-1 | Escribir la reversión en orden (primero lo del slice 10; después las tablas, el tipo, el default y las filas a `admins`) y que pierde todo lo creado.                                           |
| m-2 | El criterio 11 se verifica con un test que siembra `admins` y ejecuta la sentencia de la custom, no con la base vacía de `global-setup`.                                                        |
| m-3 | §5 fija las tres consultas dentro del snapshot y el armado en memoria; el umbral (cientos de proyectos, miles de tareas) va a §8; el slice 10 decide si reusa `getProjectCatalog`.              |
| m-4 | `name:` explícito en cada `foreignKey()` (los nombres por omisión hacia `membership` pasan de 63 caracteres); comentario en las cuatro claves `set null` de `schema.ts` que remite a la custom. |
| m-5 | Índice `task_assignee (workspace_id, user_id)`; los `created_by` se indexan o se acepta por escrito el recorrido al borrar una membresía.                                                       |
| m-6 | La precondición dice que el arnés de `actions.integration.test.ts` llega con el merge del slice 2.                                                                                              |
| m-7 | Crear un cliente confirma en una región `aria-live` («Cliente creado»), con su paso en el e2e 1.                                                                                                |
| m-8 | Definir `ClientView` y `TaskView`; `projects-screen.tsx` es Server Component y solo los diálogos y el hook son `"use client"`.                                                                  |
| m-9 | El ADR 0009 nombra que `managers` necesita un dato relativo a quien actúa (si es responsable de algún proyecto), como `viewer`.                                                                 |

## ADR 0009

Se puede aprobar. Antes: comentario en `schema.ts` sobre la columna sin efecto
en la fase 1 (P-18, ADR 0009); para la fase 2, el campo obligatorio en la
variante `workspace` y lo de m-9.

# Ronda 2

Salida de `architecture-reviewer`: sin bloqueantes, tres mayores, seis menores.
La forma general de `createOnce` se ejecutó contra Postgres con el esquema del 9
(alta, reintento, mismo id simultáneo, nombre repetido, id ajeno, membresía
inactiva, FK) y funciona sin gancho; el paso de relectura ante cualquier 23505
importa, y se midió. El ADR 0009 se puede aprobar con R2-m5. El reviewer validó
contra una firma anterior de `Creation` (con `idTaken`); la vigente es la del
ADR 0007 y el §4 del 2b: `id`, `action`, `findOwn`, `attempt`, `replayed`,
`idConstraint` y `onOtherConflict?`, y el id ajeno sale como
`ForbiddenError(action)`.

## Mayores

| ID    | Resolución                                                                                                                                                                                                                                                                                                                                                                                                |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R2-M1 | §4.4 nombra la firma vigente completa (`id`, `action`, `findOwn`, `attempt`, `replayed`, `idConstraint`, sin `onOtherConflict`) y §0 suma `constraintOf`. `replayed` se define por alta: `findOwnProject` hace `left join project_member` de quien actúa, y el reintento responde `tasks: []` como decisión escrita (la pantalla revalida igual). Pasar los tipos explícitos a `createOnce<Row, Result>`. |
| R2-M2 | Ya resuelto en el ADR 0007 vigente: «el slice 9 no tiene gancho y reconoce el nombre repetido en el error que sale». El contrato no necesita cambio.                                                                                                                                                                                                                                                      |
| R2-M3 | Opción (a): `page.tsx` le pasa las tres actions a `ProjectsScreen` como props y los diálogos las reciben por prop; `projects-screen.test.tsx` usa dobles escritos a mano, sin `vi.mock`. `vitest.config.ts` no cambia: el JSX ya se transforma; lo que fallaba era importar `actions.ts` y con él `env()`.                                                                                                |

## Menores

| ID    | Resolución                                                                                                                                                                                    |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R2-m1 | Citas: PR-38 como «adelanta: solo tareas activas»; PR-31 solo por el orden; «PR-12 … PR-17, PR-19» (sin PR-18); el rango «PR-49 … PR-53» sin PR-52.                                           |
| R2-m2 | Citar PR-30, PR-57, PR-58, PR-93, PR-97, PR-108 y PR-111 en sus criterios. Marcar como hecha la tarea de `parity-analyst` sobre §14 y PR-111.                                                 |
| R2-m3 | El criterio 8 suma al menos un caso de una acción existente con recurso de otra clase (por ejemplo `timeEntry.own.update` con `{ kind: "workspace" }`), que hoy concede y deja de hacerlo.    |
| R2-m4 | El criterio 10 dice que el desenlace es el mismo se crucen o no, como el criterio 2 del 2b; la rama «23505 de otra restricción con fila propia» se cubre en `create-once.test.ts`.            |
| R2-m5 | ADR 0009: el campo y el `viewer` van en el recurso que declaran `project.create` y `client.create` vía `ResourceByAction`, no en la variante `workspace` compartida.                          |
| R2-m6 | El reparto suma actualizar la sección «Estructura» de `CLAUDE.md` con `src/hooks/`, `src/lib/text.ts`, `src/server/action.ts` y `src/server/create-once.ts`, en el mismo commit que los crea. |
