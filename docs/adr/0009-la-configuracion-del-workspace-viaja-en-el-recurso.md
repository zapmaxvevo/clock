# 0009. La configuración del workspace viaja en el recurso

Fecha: 2026-10-03. Estado: propuesto.
Origen: la decisión abierta que el
[ADR 0004](0004-nucleo-de-proyectos-en-fase-1.md) y el
[mapa de la fase 1](../slices/fase1-mapa.md) le dejan al contrato del slice 9
([`fase1-slice9-nucleo-de-proyectos.md`](../slices/fase1-slice9-nucleo-de-proyectos.md)).
Revisado en las rondas 1 y 2 de ese contrato
([`correcciones-fase1-slice9.md`](../slices/correcciones-fase1-slice9.md)).

## Contexto

`can(actor, action, resource)` es la única decisión de acceso del servidor y es
una función pura: decide con el rol y el estado de la membresía, y con lo que el
recurso trae. Cada acción tiene una fila con los roles que la habilitan, y desde
el slice 9 cada acción declara también qué recurso recibe, en
`ResourceByAction`, y `can()` lo exige en el tipo (`ResourceFor<A>`) y lo
comprueba por su clase en tiempo de ejecución.

`workspace_settings.whoCreatesProjects` es una configuración del workspace con
tres valores —`everyone`, `managers`, `admins`— que en Clockify decide quién
crea proyectos y clientes (PR-03, PR-59). No es un dato del rol: el mismo
`member` puede o no crear según cómo esté configurado su workspace.

Para la fase 1 el equipo ya decidió (P-18): el valor queda congelado en
`everyone`, la configuración no es editable y no entra en `can()`; la acción la
habilita el rol y la tienen todos. Lo que queda abierto es **cómo entra cuando
la fase 2 la vuelva editable**, para que el slice 9 no deje armado algo que la
fase 2 tenga que deshacer.

Las configuraciones de este tipo no son una sola: `whoSeesAllEntries` y
`whoSeesRates` tienen la misma forma y van a pedir lo mismo en los reportes.

## Opciones

1. **La configuración entra como dato del actor.** `Actor` suma
   `whoCreatesProjects`. Es puro, pero mezcla en la identidad de quien actúa una
   propiedad de otra cosa, y cada configuración nueva agranda el tipo que viaja
   en toda la aplicación, aunque la acción en curso no la use.
2. **La acción se parte en dos.** `project.create` decide por rol, y el service
   lee la configuración y corta por su cuenta. La segunda mitad de la decisión
   vive fuera de `can()`, que es justo lo que el módulo de permisos prohíbe.
3. **La configuración viaja en el recurso.** Crear un proyecto es una acción
   sobre el workspace, y el recurso de esa acción lleva la configuración que la
   acción necesita. `can()` la lee como lee hoy el dueño de una entrada
   (`timeEntry`) o la marca de responsable de un proyecto (P-24).

## Decisión

La opción 3.

- **El campo va en el recurso que declaran `project.create` y `client.create`**
  en `ResourceByAction`, no en la variante `workspace` que comparten las demás
  acciones sobre el workspace. En la fase 1 esas dos acciones declaran el
  `WorkspaceResource` común; cuando la configuración se vuelva editable, pasan a
  declarar un recurso propio con `workspaceId`, `whoCreatesProjects` y el
  `viewer` de abajo, y la fila de las dos en `can()` combina rol y valor.
  `team.view`, `member.invite` y las demás siguen con el recurso común, sin
  leer una configuración que no consultan.
- **El recurso nuevo tiene una clase propia**, distinta de `workspace`. Así la
  comprobación en tiempo de ejecución de `can()` rechaza un recurso `workspace`
  común pasado a `project.create`, y no solo el tipo.
- **El campo entra obligatorio, no opcional.** Un campo opcional deja compilar
  un recurso armado sin leer la configuración, y `can()` tendría que elegir qué
  hacer con el hueco: conceder abre la acción a quien la configuración excluye;
  negar la cierra a quien la incluye. Obligatorio, olvidarlo no compila.
- **`managers` necesita además un dato relativo a quien actúa**: si es
  responsable de algún proyecto del workspace. Con ese valor, crear depende de
  la configuración y de una fila de `project_member`, y ninguna de las dos es
  del rol. El dato viaja en el mismo recurso, como el `viewer` del recurso
  `project` del slice 9 —`viewer: { managesAnyProject: boolean }`—, y no en
  `Actor`, por la misma razón que la configuración: es un dato de la relación
  entre quien actúa y el workspace, que solo algunas acciones consultan.
- **Quien arma el recurso lo lee de la base** antes de llamar a `can()`, igual
  que el service de `time-entry` lee la fila de la entrada antes de armar el
  suyo. `can()` sigue siendo pura: no consulta nada, recibe todo.
- **En la fase 1 el recurso no lleva el campo** (P-18). El slice 9 no agrega un
  campo que `can()` ignore, porque un dato que viaja sin efecto es una invitación
  a creer que tiene uno. La columna sí existe y no tiene efecto; `schema.ts` lo
  dice en un comentario sobre ella, que remite a P-18 y a este ADR.

## Consecuencias

- La fase 2 hace el cambio en cuatro lugares, todos chicos: el recurso de
  `project.create` y `client.create` en `ResourceByAction`, su fila en `can()`,
  la función que arma ese recurso y, para `managers`, la consulta de
  `project_member` que alimenta el `viewer`. Ninguna action cambia su firma.
- Como el campo es obligatorio y el recurso es propio de esas dos acciones,
  todo llamado a `can()` con `project.create` o `client.create` pasa por la
  función que lo arma; armarlo a mano deja de compilar. Las demás acciones sobre
  el workspace no cambian.
- El tipo `Actor` no crece con cada configuración del workspace ni con cada
  relación de quien actúa.
- `whoSeesAllEntries` y `whoSeesRates` siguen el mismo camino cuando lleguen
  los reportes: viajan en el recurso que declara la acción que las consulta.
- El precio es que las dos altas leen la configuración y una fila de
  `project_member` antes de decidir. Es una fila por workspace y una consulta
  acotada por persona, que la sesión puede traer cuando haga falta.
