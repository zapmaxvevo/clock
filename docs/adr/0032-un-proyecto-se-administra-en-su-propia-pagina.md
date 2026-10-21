# 0032. Un proyecto se administra en su propia página

Fecha: 2026-10-21. Estado: Propuesto.
Origen: el contrato de P1
([`fase2-p1-proyectos.md`](../slices/fase2-p1-proyectos.md), D-P1-1), con el
[mapa de la fase 2](../slices/fase2-mapa.md) («P1», riesgo «Dónde vive la
administración de un proyecto», y §3) y
[`proyectos.md`](../parity/proyectos.md) (PR-31, PR-112, §14).

## Contexto

`/proyectos` es hoy la única pantalla del módulo `project`
(`src/modules/project/components/projects-screen.tsx:30-67`): los proyectos
agrupados por cliente, cada uno con sus tareas activas debajo y su «Nueva
tarea»; la sección de etiquetas de solo lectura (PR-112); y en la cabecera las
tres altas, «Nuevo cliente», «Nuevo proyecto» y «Nueva etiqueta». Lo dejó así la
fase 1, que no administra nada (§14 de `proyectos.md`).

La fase 2 le suma, en siete slices, editar, archivar, restaurar y borrar
proyectos (P1, P2), clientes (P3), tareas (P4) y etiquetas (P5), el acceso de
un proyecto privado con sus miembros y responsables (P6) y los asignados de una
tarea (P7). El mapa deja a P1 decidir dónde vive la administración de un
proyecto y dice que P4, P6 y P7 cuelgan de esa decisión; con pantallas
separadas, P3, P4 y P5 pueden ir en paralelo (§3 del mapa).

Lo relevado de Clockify: la lista de proyectos tiene buscador, filtro de estado
y un menú por fila (PR-31); un proyecto se abre en su página, con pestañas para
las tareas, el acceso y la configuración, y el facturable por defecto se cambia
en la pestaña **Settings** de un proyecto ya creado (PR-21); las etiquetas
tienen su página en el menú lateral (PR-112), y los clientes su lista con el
filtro de archivados (PR-07).

## Opciones

1. **Todo en `/proyectos`, con diálogos.** Editar abre un diálogo desde la fila;
   las tareas y el acceso son pestañas del mismo diálogo; clientes y etiquetas
   siguen como secciones de la misma pantalla. Es lo que hay, crecido. Un solo
   componente de pantalla y un solo diálogo que tocan P1 a P7: van en serie, y
   el diálogo junta un formulario, dos listas con sus acciones y sus avisos.
   Un proyecto no tiene una dirección que se pueda compartir ni volver atrás.
2. **Una página por proyecto, `/proyectos/[id]`, y pantallas propias para
   clientes y etiquetas.** `/proyectos` queda como la lista (PR-31), con el
   menú de fila de P2. La página del proyecto tiene una sección por tema, en el
   orden de las pestañas de Clockify: «Tareas», «Acceso» y «Configuración».
   Clientes y etiquetas pasan a `/clientes` (P3) y `/etiquetas` (P5).
3. **Un panel lateral sobre la lista**, abierto con `?proyecto=<id>` en la URL.
   Tiene dirección propia, pero vive dentro de la pantalla de la lista: el
   mismo árbol de componentes, la revalidación de la lista en cada cambio del
   panel y el foco entre dos regiones abiertas a la vez.

## Decisión

La opción 2.

- **`/proyectos` es la lista** de los proyectos que `project.view` deja ver,
  activos y archivados, con sus columnas, el buscador y el filtro de estado
  (PR-31, PR-89, PR-95). El nombre de cada fila lleva a la página del proyecto.
  La lista no dibuja tareas; muestra cuántas activas tiene cada proyecto.
- **`/proyectos/[id]` es un proyecto**: un encabezado con su punto, su nombre y
  su cliente, y secciones apiladas en este orden. Cada una tiene un slice
  dueño:

  | Sección         | Llega con | Lo que suma después                        |
  | --------------- | --------- | ------------------------------------------ |
  | «Tareas»        | P1        | P4 (editar, hecha, borrar), P7 (asignados) |
  | «Acceso»        | P6        | P9 (grupos)                                |
  | «Configuración» | P1        | —                                          |

  Las acciones del proyecto entero —archivar, restaurar, borrar (P2)— van en el
  encabezado de la página y en el menú de la fila de la lista.

- **Un proyecto que la persona no ve responde como uno que no existe**: la
  página es un 404 propio con «Ese proyecto ya no está disponible.» (PR-72), la
  misma respuesta para un id que no es un UUID, uno de otro workspace o un
  privado ajeno.
- **Clientes y etiquetas salen de `/proyectos`** a `/clientes` y `/etiquetas`,
  cada una con su entrada en el menú, cuando llegan sus slices (P3 y P5). Hasta
  entonces, «Nuevo cliente», «Nueva etiqueta» y la sección de etiquetas siguen
  donde están. Las dos son del módulo `project` (ADR 0016 para las etiquetas).
- **Las secciones son secciones, no pestañas.** Con tres, la página se lee de
  arriba abajo y cada una tiene su `<h2>`; si alguna vez pesa, pasar a pestañas
  con la pestaña en la URL (ADR 0008) no cambia el modelo.

## Consecuencias

- **El orden de la fase 2 se abre.** Con P1 en `main`: P2, P6 y P8 pueden ir en
  paralelo (la lista y el encabezado; la sección «Acceso» y los catálogos; los
  selectores). Con P2 en `main`: P3, P4 y P5 (tres pantallas distintas). P7
  sigue esperando a P4 y a P6.
- **Lo que siguen compartiendo** son los archivos del módulo —`schema.ts`,
  `repository.ts`, `service.ts`, `actions.ts`, `components/labels.ts`— y la
  unión `Action` de `src/server/permissions/index.ts`. Cada contrato suma al
  final de cada uno, y el segundo en mergear rebasa: conflictos de líneas
  vecinas, no de diseño.
- **La dirección de un proyecto se comparte** y el botón de volver funciona.
- **P1 mueve «Nueva tarea»** de la fila de `/proyectos` a la sección «Tareas»
  de la página, y deja la lista sin las tareas en línea: los e2e del slice 9
  que crean tareas desde la lista cambian de pantalla.
- **El menú gana dos entradas** con P3 y P5. Sus contratos deciden quién ve cada
  pantalla y el texto de la entrada.
- **«Proyectos» se marca en el menú** también dentro de `/proyectos/[id]`: el
  menú pasa a comparar por prefijo para esa entrada.
- **Una pantalla más que se arma en el servidor** (PR-93): la página del
  proyecto lee su fila con el filtro de `can()`, como la lista.
