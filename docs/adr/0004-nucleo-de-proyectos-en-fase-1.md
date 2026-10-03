# 0004. Núcleo de proyectos en la fase 1

Fecha: 2026-10-02. Estado: aceptado.

## Contexto

El plan pone en la fase 1 el rastreador completo, el timesheet semanal, el
calendario y el perfil, y en la fase 2 las entidades `project`, `task`, `client`
y `tag`. Las dos cosas no pueden ser ciertas a la vez.

El documento de paridad del rastreador tiene en su alcance el selector de
proyecto y tarea (TT-06 … TT-11), las etiquetas (TT-12) y el facturable (TT-14,
TT-15), que no existen sin esas entidades. El facturable, además, no es un
booleano independiente: su valor por defecto lo decide el proyecto elegido
(TT-14). El timesheet depende más fuerte todavía: su grilla es una fila por
proyecto y tarea, así que sin proyectos no es una versión reducida de la
pantalla sino otra pantalla.

Hoy existe un solo relevamiento, `docs/parity/time-tracker.md`. No hay
`docs/parity/proyectos.md`: la entidad no está relevada en ningún lado.

El slice 1 ya está desplegado y entrega el timer con una entrada sin proyecto.
`time_entry` no tiene ninguna columna de proyecto, tarea ni etiqueta.

## Opciones

1. **Adelantar un núcleo mínimo de `client`, `project`, `task` y `tag` al final
   de la fase 1.** Las tablas, las reglas de acceso de lectura y un solo camino
   de creación. La administración completa —asignaciones, estimaciones, estados,
   archivado masivo, tarifas, pantallas de cliente— queda en la fase 2.
2. **Reordenar: dejar todo lo que depende de proyectos para después de la fase 2.** La fase 1 entrega el rastreador sin proyectos, el calendario y el
   perfil; el selector, las etiquetas, el facturable, el resto de TT-63 y el
   timesheet entero pasan a un tramo posterior a la fase 2.
3. **Un proyecto degenerado.** Que la entrada guarde un `project_name` de texto
   libre, o que los proyectos sean una lista fija en la configuración del
   workspace, para que el selector exista en la fase 1 sin crear el módulo.

## Decisión

La opción 1, con tres condiciones.

**Primera: el relevamiento va antes.** `parity-analyst` escribe
`docs/parity/proyectos.md` al menos a nivel de entidad y de reglas de acceso
—qué campos tiene un proyecto, qué es un proyecto público, qué significa
archivado, qué relación tiene con el cliente y con la tarea— antes de que se
cierre el contrato del slice del núcleo. Diseñar las tablas contra una entidad
sin relevar es la forma más cara de equivocarse, y es el riesgo que hace
atractiva a la opción 2.

**Segunda: el núcleo es un subconjunto estricto de la fase 2.** Entra lo que el
rastreador necesita para cumplir TT-06 … TT-12: las tablas, el filtro de acceso
de TT-08, el archivado como estado —que TT-104 y TT-77 ya exigen— y un camino
para crear un proyecto, un cliente y una etiqueta. No entra ninguna pantalla de
administración más allá de eso. La fase 2 no reescribe el núcleo: le agrega la
superficie.

**Tercera: los slices del núcleo van al final de la fase 1.** Primero todo lo que
no depende de proyectos —modo manual, corrección de horas, continuar y duplicar,
semana y paginación, acciones en masa, perfil, calendario—; después el núcleo, el
selector, las etiquetas y el facturable; último el timesheet. El orden completo
está en [el mapa de la fase 1](../slices/fase1-mapa.md).

## Consecuencias

- La fase 1 cumple lo que el plan dice que entrega: el rastreador queda completo
  salvo lo marcado como fuera de alcance, y el timesheet tiene de qué estar
  hecho.
- `time_entry` recibe `project_id` y `task_id` nulables y una columna `billable`
  en dos migraciones aditivas. Ninguna toca las filas existentes: una entrada sin
  proyecto sigue siendo válida en todo el recorrido (TT-93), que es justamente lo
  que el slice 1 dejó probado.
- La fase 2 arranca con las tablas creadas. Su primer slice ya no es «crear las
  entidades» sino administrarlas, que es trabajo distinto y no superpuesto.
- El riesgo que queda es que el relevamiento a nivel de entidad se quede corto y
  la fase 2 tenga que agregar columnas o cambiar una relación. Se acepta porque
  los campos que el selector necesita —nombre, color, cliente, archivado,
  facturable por defecto, asignación— salen del producto relevado y no de una
  decisión nuestra, así que no son los candidatos a cambiar.
- `parity-analyst` tiene que relevar proyectos antes de lo que el plan preveía.
  Es trabajo de la fase 2 adelantado, no trabajo nuevo.
- El contrato del slice del núcleo hereda una decisión abierta:
  `workspace_settings.whoCreatesProjects` ya existe y es una configuración por
  workspace, mientras que `can()` decide por rol y por estado de la membresía. O
  la configuración entra como un dato del actor, o la acción se parte. Este ADR
  no la resuelve; la nombra para que no aparezca de sorpresa.

### Por qué no la opción 2

Deja aproximadamente la mitad del alcance de la fase 1 después de la fase 2, con
lo que la numeración de fases deja de describir el orden real de entrega. Y
obliga a volver a abrir, en un tramo posterior, cuatro piezas que ya habrían
quedado terminadas: la barra del rastreador, la fila de la lista, el diálogo de
edición masiva y el modelo de lectura de la pantalla. El trabajo no desaparece,
se hace dos veces.

El argumento fuerte a su favor —no hay relevamiento de proyectos— lo cubre la
primera condición de la decisión.

### Por qué no la opción 3

Un `project_name` de texto libre produce datos que después hay que migrar a mano
a filas reales, con nombres repetidos, con mayúsculas distintas y sin forma de
saber cuáles eran el mismo proyecto. Y no cumple el alcance que dice cumplir:
TT-08 filtra por acceso, TT-77 distingue un proyecto archivado de uno
inexistente y TT-104 exige que una entrada conserve un proyecto archivado.
Ninguna de las tres se puede expresar sobre un texto libre ni sobre una lista en
la configuración.
