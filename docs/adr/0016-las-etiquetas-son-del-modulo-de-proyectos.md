# 0016. Las etiquetas son del módulo de proyectos

Fecha: 2026-10-04. Estado: aceptado (2026-10-05, por el team-lead con la delegación del
usuario).
Origen: contrato del slice 11
([`fase1-slice11-etiquetas-y-facturable.md`](../slices/fase1-slice11-etiquetas-y-facturable.md)),
revisado en la ronda 1 de ese contrato
([`correcciones-fase1-slice11.md`](../slices/correcciones-fase1-slice11.md), m8).

## Contexto

El slice 11 trae la tabla `tag`, su unión con `time_entry`, el alta de una
etiqueta y el selector de etiquetas del rastreador y del calendario. Hasta acá
hay dos módulos con datos propios que importan para esto:

- `project` (`src/modules/project/`), dueño de `client`, `project`, `task`,
  `project_member` y `task_assignee`. Arma el catálogo del selector de proyecto
  (`getTrackingCatalog`), valida la asignación de un proyecto a una entrada
  (`assertTrackable`, ADR 0010) y es la única pantalla de alta de la fase 1,
  `/proyectos` (PR-04).
- `time-entry`, que importa de `project` y nunca al revés (ADR 0010).

El ADR 0010 fija que una regla tiene un solo dueño —el módulo de la entidad
sobre la que se decide— y que otro módulo la consulta por el service del dueño.
No dice cuál es el dueño de la etiqueta. Hace falta decirlo antes de escribir
`assertTaggable` y el catálogo de etiquetas, porque de eso depende qué importa
quién.

La paridad trata las cuatro entidades juntas: `docs/parity/proyectos.md` se
titula «clientes, proyectos, tareas y etiquetas», y sus reglas de unicidad,
largo, archivado y borrado en dos pasos son las mismas para las cuatro
(PR-49 … PR-54, PR-08, PR-25, PR-46).

## Opciones

1. **Las etiquetas en `project`.** `project` suma la tabla, el alta, la
   validación y las etiquetas activas a los dos catálogos que ya arma. La
   dirección `time-entry` → `project` ya existe.
2. **Un módulo nuevo, `tag`.** Con su `schema.ts`, `service.ts`,
   `repository.ts`, `actions.ts` y componentes. `time-entry` importa de `tag`, y
   `tag` de nadie.
3. **Las etiquetas en `time-entry`.** La tabla de unión es de la entrada; la
   etiqueta podría vivir con ella.

## Decisión

La opción 1.

- **`project` es el dueño de la etiqueta**: su tabla, su alta (`createTag`),
  la regla de asignación (`assertTaggable`, con la forma de `assertTrackable`) y
  su lugar en los catálogos (`getTrackingCatalog` y `getProjectCatalog`).
- **La tabla de unión `time_entry_tag` la escribe `time-entry`**, igual que
  escribe `time_entry.project_id`: es un dato de la entrada que apunta a una
  entidad de otro módulo. La valida llamando a `assertTaggable` con su
  transacción.
- **Lo que una entrada muestra de sus etiquetas lo lee el repository de
  `time-entry`**, sin filtro, como el proyecto (ADR 0010).

## Por qué

- **Contra la 2, el snapshot y la duplicación.** El rastreador y el calendario
  ya piden un catálogo por pantalla, en una transacción `repeatable read` con
  tres consultas. Con un módulo aparte serían dos catálogos, dos proveedores de
  contexto y dos lecturas sin snapshot común. Y el alta de una etiqueta es la del
  cliente con un campo menos: el mismo esquema de nombre, la misma traducción del
  índice de unicidad (PR-91), el mismo diálogo de alta y la misma región de
  avisos, que hoy son privados de `project` o tendrían que moverse a
  `src/components/` para que `tag` los use. Suma una dirección nueva,
  `time-entry` → `tag`, sin ganar ninguna regla.
- **Contra la 3, el dueño de la regla.** Quién crea una etiqueta (PR-44) y cuál
  se puede elegir (PR-45, PR-47) no son reglas de una entrada. Con la etiqueta
  en `time-entry`, la pantalla de alta de `project` importaría de `time-entry`,
  que es el ciclo que el ADR 0010 prohíbe.

## Consecuencias

- **El nombre del módulo queda corto**: `project` es el catálogo de clientes,
  proyectos, tareas y etiquetas. Renombrarlo a `catalog` no cambia ninguna
  regla y no se hace ahora.
- **`time-entry` no gana dependencias nuevas**: sigue importando solo de
  `project` (y de `profile` y `workspace`, como hoy).
- **La pantalla de administración de etiquetas de la fase 2** (PR-45, PR-46)
  vive en los componentes de `project`, esté en `/proyectos` o en una ruta
  propia. La ruta es una decisión de producto, no de este ADR.
- **Si la fase 2 limita quién crea etiquetas** (PR-44: «you can limit creation
  to Admins only»), la configuración viaja en el recurso de `tag.create`, como
  manda el ADR 0009, y no cambia este reparto.
- **La fila y la barra del rastreador guardan el facturable y las etiquetas con
  `updateEntry`**, con un solo grupo por pedido, y no con una mutación de un
  campo (§4 del contrato del 11). Matiza «Dos caminos a las mismas reglas» del
  ADR 0013, que dice que la fila guarda campo por campo con las mutaciones de
  hoy: la descripción, el par y el horario lo siguen haciendo, y los dos campos
  nuevos van por `updateEntry`. El 0013 no se reescribe.
