# 0010. Un módulo consulta las reglas de otro por su service

Fecha: 2026-10-03. Estado: aceptado.
Origen: contrato del slice 10
([`fase1-slice10-selector-de-proyecto.md`](../slices/fase1-slice10-selector-de-proyecto.md)),
corregido por la ronda 1 de `architecture-reviewer`
([`correcciones-fase1-slice10.md`](../slices/correcciones-fase1-slice10.md)).

## Contexto

Hasta el slice 9, cada módulo lee solo sus tablas: `time-entry` lee
`time_entry`, `project` lee `client`, `project`, `task` y `project_member`. La
única dependencia entre módulos es `time-entry` → `workspace`, para la zona
horaria y el primer día de la semana (`weekStartOf`).

El slice 10 es el primero en que un módulo necesita **datos y reglas** de otro.
Una entrada apunta a un proyecto y a una tarea, y `time-entry` tiene que:

1. **Decidir si una entrada puede recibir un proyecto y una tarea.** Es una
   regla del módulo de proyectos: el proyecto está activo, quien actúa puede
   cargar horas en él (`project.track`, TT-08), la tarea está activa y es de
   ese proyecto (PR-74). Mañana suma los asignados de tarea (PR-37, P-23).
2. **Mostrar el proyecto de cada entrada**: nombre, color y tarea, en la misma
   lectura que trae las entradas. Sin filtro: una entrada propia muestra su
   proyecto aunque esté archivado o la persona ya no tenga acceso (TT-104,
   PR-71).

Lo mismo van a necesitar el slice 11 (etiquetas), el 13 (el timesheet agrupa por
proyecto y tarea) y el calendario (el color del bloque).

## Opciones

1. **Cada módulo lee las tablas de otro en su propio repository y decide.**
   `time-entry` arma el `ProjectResource`, mira el archivado y la tarea. Es una
   consulta menos, pero la regla de «se puede cargar horas acá» vive en dos
   lugares —el selector, que arma `project`, y la validación, que arma
   `time-entry`— y la fase 2, que suma los asignados de tarea, tiene que
   acordarse de los dos.
2. **Todo por el service del otro módulo**, también lo que solo se muestra.
   `time-entry` pide a `project` los nombres y colores por id después de leer
   sus entradas. La regla vive en un lugar, pero mostrar una lista son dos
   consultas, la segunda fuera del snapshot de la primera, y una entrada podría
   llegar con un proyecto que la segunda ya no encuentra.
3. **Las reglas por el service del dueño; lo que solo se muestra, en un join del
   repository propio.** La validación la hace una función del service de
   `project`, que recibe la transacción de quien la llama. Lo que la fila
   muestra lo lee el repository de `time-entry` con un `left join`, sin aplicar
   ninguna regla.

## Decisión

La opción 3.

- **Una regla tiene un solo dueño**: el módulo de la entidad sobre la que se
  decide. Otro módulo la consulta llamando a una función exportada del
  `service.ts` del dueño, que lanza el `DomainError` del dueño con su mensaje.
  Ninguna decisión de acceso se copia: la función llama a `can()` como
  cualquier otra lectura del módulo.
- **La función exportada lanza solo códigos de `ActionErrorCode`**
  (`validation`, `not_found`, `forbidden`). Los códigos propios de un módulo
  —`already_stopped`, `timer_running`— no cruzan a otro: quien llama no tendría
  cómo traducirlos sin conocer el módulo del que vienen.
- **La función recibe la transacción de quien la llama** (`tx: Transaction`) y
  **solo lee con ella**: no abre otra transacción, no usa `db` y no escribe.
  Lo que el `tx` da es esto:
  - **un rechazo deshace todo lo anterior** de la operación que llama, por
    ejemplo el cierre del timer que hacen `startTimer` y `continueEntry` antes
    de insertar;
  - **una sola conexión** para la validación y la escritura;
  - **la escritura queda protegida por la clave foránea**, que es la que
    garantiza que la referencia exista al momento de escribir.

  Lo que **no** da es coherencia de snapshot: con `read committed`, cada
  sentencia ve su propio estado, y lo que la validación leyó puede cambiar
  antes de la escritura. Si una operación necesita que no cambie, el bloqueo lo
  decide el contrato de quien llama, no la función exportada. Es la primera
  función de un service que recibe `tx`; las demás siguen abriendo la suya.

- **Lo que solo se muestra se lee en un join**, en el repository del módulo que
  dibuja: las columnas que la vista necesita —nombre, color, nombre de la
  tarea— y ninguna condición de acceso, de archivado ni de estado. Si alguna vez
  lo que se muestra depende de una regla, deja de ser «solo mostrar» y pasa por
  el service del dueño.
- **Las dependencias tienen una sola dirección por par de módulos, y vale para
  el módulo entero**: `service.ts`, `schema.ts` y `components/`. `time-entry`
  importa de `project`; `project` no importa nada de `time-entry`. Un
  componente de `time-entry` puede usar los componentes de `project` —el
  selector de proyecto—, nunca al revés. Un ciclo entre módulos es la señal de
  que una regla o una pieza está en el módulo equivocado.
- **Los catálogos que un módulo ofrece a la pantalla de otro** —el selector de
  proyecto del rastreador— los arma el dueño, con su filtro de `can()`, y los
  pide el Server Component que compone la pantalla, como cualquier lectura.

## Consecuencias

- La regla de «se puede cargar horas en este proyecto y esta tarea» vive en
  `src/modules/project/service.ts` y en ningún otro lado. La fase 2 suma los
  asignados de tarea ahí y en `can()`, sin tocar `time-entry`.
- Los errores de dominio de otro módulo llegan a las actions de `time-entry`.
  Eso exige que `time-entry` traduzca cualquier `DomainError`, no solo el suyo:
  lo resuelve la migración a `src/server/action.ts` que el slice 10 hace (§4.1
  de su contrato). Sin ella, un `ProjectError` saldría como `unexpected`.
- El repository de `time-entry` conoce los nombres de las tablas y columnas de
  `project` y `task` que muestra. Renombrar una de esas columnas toca dos
  repositories. Se acepta: son tres columnas, y la alternativa es una segunda
  consulta por cada lectura de la lista.
- Una función exportada a otro módulo que necesitara escribir, o garantizar que
  lo leído no cambie, no entra en esta regla: se discute en el contrato que la
  pida, con el bloqueo explícito.
- Los tests de integración de `time-entry` siembran proyectos y tareas con las
  fábricas de `src/test/factories.ts`, que ya existen desde el slice 9.
- `CLAUDE.md` suma una línea en «Recorrido de una mutación»: un service puede
  llamar a la función de validación de otro módulo, que solo lee con la
  transacción que recibe.
- El slice 11 (etiquetas), el 13 (timesheet) y el calendario siguen el mismo
  camino: validan contra el service del dueño y muestran con un join.
