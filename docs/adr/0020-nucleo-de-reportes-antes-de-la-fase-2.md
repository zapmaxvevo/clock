# 0020. Núcleo de reportes antes de terminar la fase 2

Fecha: 2026-10-08. Estado: propuesto.
Origen: el relevamiento [`reportes.md`](../parity/reportes.md), su recomendación
(§6) y las decisiones del usuario del 2026-10-08 (§8). Mismo patrón que el
[ADR 0004](0004-nucleo-de-proyectos-en-fase-1.md). Lo aprueba el usuario.

Cómo se calcula un reporte —dónde se agrega y dónde se corta el día— va aparte,
en el [ADR 0021](0021-el-reporte-agrega-en-la-base.md). El orden de los slices
está en [el mapa del núcleo](../slices/nucleo-reportes-mapa.md).

## Contexto

El plan pone los reportes en la fase 3, después de la administración de la fase 2. El usuario pidió ver las horas de todo el equipo antes de terminar la fase 2.

Lo que hay hoy en el árbol:

- **Ninguna pantalla muestra horas de otra persona.** Toda lectura de
  `time_entry` filtra por `user_id` de quien actúa (`inSpan` y las demás del
  repository de `time-entry`), y las acciones sobre entradas son `.own`. El
  comentario de `can()` ya lo anticipa: «Las entradas ajenas son del reporte
  detallado».
- **`workspace_settings.who_sees_all_entries` existe** con `everyone`,
  `managers` y `admins`, arranca en `admins` y nadie lo lee. Lo mismo
  `who_sees_rates`.
- **Borrar una persona borra sus horas.** `time_entry.user_id` apunta a `user`
  con `on delete cascade` desde la migración 0001, y `membership.user_id`
  también. `time_entry` no apunta a la membresía. Hoy ningún camino de la
  aplicación borra usuarios ni membresías —Better Auth no tiene `deleteUser`
  habilitado y `ensureWorkspaceContext` recrea la membresía en el próximo
  ingreso—, pero la consola de Neon o un «quitar del equipo» de la fase 2 sí.
- **`membership.status` tiene `inactive`**, y nada lo escribe hasta que la fase
  2 traiga «desactivar» (RP-60, RP-63).
- **Los roles se asignan solo por base.** `ensureWorkspaceContext` crea al owner
  por `WORKSPACE_OWNER_EMAIL` y al resto como `member`; cambiar un rol es
  `team.manage`, de la fase 2.

Lo que decidió el usuario y este ADR no reabre: solo owner y admin ven las
horas de otros (P-01, divergencia con Clockify Free, donde todos ven todo); el
responsable de proyecto no tiene excepción (P-02); sin el tope de 31 días
(P-06); el timer en curso no se muestra ni se suma (P-07); las personas
inactivas se pueden filtrar, separadas y tachadas (P-08); a una persona con
horas no se la borra, solo se desactiva (P-09); se exporta a PDF, CSV y Excel
(P-10).

## Opciones

1. **Adelantar un núcleo del reporte resumido** como subconjunto estricto de la
   fase 3, con las reglas de acceso que exige y la protección de los datos que
   suma.
2. **Esperar a la fase 3 en orden**, después de toda la administración.
3. **Una vista degenerada**: un selector «ver como» en la planilla o el
   rastreador para que un admin mire la semana de otra persona.
4. **Una herramienta externa de consulta** (Metabase o similar) sobre la base de
   Neon.

## Decisión

La opción 1, con cinco condiciones.

**Primera: qué entra.** El reporte resumido de `reportes.md`: rango con atajos,
rango libre y flechas; agrupación encadenada de hasta tres niveles por persona,
proyecto, cliente, fecha, etiqueta y, si P-05 la confirma, tarea; totales;
filtros de personas, cliente, proyecto y «sin proyecto», con las inactivas
aparte; el gráfico de barras; y la exportación a CSV, Excel y PDF de lo que
muestra la pantalla. Es la lista de la §6 de `reportes.md` más RP-53 y RP-54
(P-10) y RP-62 (P-08).

**Segunda: qué no entra.** El reporte detallado (RP-50) y lo que cuelga de él
(RP-14, RP-51, RP-52); el tablero (RP-40 … RP-43); el reporte semanal (RP-45 …
RP-47); los gráficos partidos y de torta (RP-16, RP-17); el resto de los filtros
(tarea, etiqueta, descripción, facturable); reportes guardados y compartidos
(RP-27, RP-55); redondeo (RP-36) e importes (RP-09). La fase 3 suma pantallas al
núcleo y no lo reescribe.

**Tercera: quién ve qué.** Dos acciones nuevas en `Action`, las dos con el
`WorkspaceResource` común:

| Acción                  | Roles                    | Para qué                                             |
| ----------------------- | ------------------------ | ---------------------------------------------------- |
| `report.view`           | todos (membresía activa) | entrar a los reportes, aunque sea para ver lo propio |
| `timeEntry.others.view` | `owner`, `admin`         | ver horas de otras personas, en cualquier reporte    |

- **El alcance lo arma el servidor.** El service del reporte pregunta una vez
  `timeEntry.others.view`: con permiso, el alcance son todas las personas del
  workspace, activas e inactivas (RP-02, RP-61); sin permiso, la consulta lleva
  `user_id = <quien mira>` en el `where`, no solo la interfaz. Toda puerta de
  entrada del reporte —la página y la ruta de exportación— pasa por la misma
  función.
- **`project_manager` y `team_manager` deciden como `member`** (P-02, RP-05,
  RP-06): no hay modelo de equipo y la marca de responsable no abre nada.
- **RP-03 queda vacío con esta regla y el núcleo no lo implementa.** Quien ve
  horas ajenas es owner o admin, que ven todos los proyectos (PR-61); el resto
  ve solo lo propio, que se ve siempre aunque haya perdido el acceso al proyecto
  (PR-71). Si la visibilidad se abre alguna vez, el filtro por `project.view`
  entra con ella.
- **`who_sees_all_entries` queda congelado en `admins`, sin efecto**, como
  `whoCreatesProjects` con P-18: no es editable, no entra en `can()` y el
  recurso no lo lleva, porque un dato que viaja sin efecto invita a creer que
  tiene uno ([ADR 0009](0009-la-configuracion-del-workspace-viaja-en-el-recurso.md)).
  Su valor por omisión coincide con P-01. `schema.ts` suma un comentario sobre
  la columna que remite a este ADR. Si la fase 2 la vuelve editable,
  `timeEntry.others.view` pasa a declarar un recurso propio con el valor y, para
  `managers`, el dato de quien mira, como dice el ADR 0009. Antes hay que
  resolver el eje (RP-04): nuestro valor dice **quién** ve todo y el de Clockify
  dice **qué** ve el member.
- **RP-07 viene gratis**: `can()` corta por `status` antes que por rol.

**Cuarta: las horas no se borran con la persona (P-09).** Una migración cambia
las claves de `time_entry`:

- `time_entry.user_id` → `user.id` pasa de `cascade` a `restrict`;
- se suma una clave compuesta `(workspace_id, user_id)` →
  `membership(workspace_id, user_id)`, `on delete restrict`, con nombre
  explícito, como las de las tablas de proyectos.

Con las dos, borrar un usuario o una membresía con horas falla en la base, y
desactivar es la única salida, que trae la fase 2. La clave compuesta además
garantiza que toda entrada tiene una membresía en su workspace, así que el
reporte siempre sabe si la persona está activa o inactiva (RP-62). El índice
`time_entry_workspace_user_started_idx` ya empieza por esas dos columnas y sirve
a la comprobación de la clave al borrar una membresía.

**Quinta: el orden.** El núcleo va después del slice 13 y antes del resto de la
fase 2. «Desactivar» no lo bloquea: el núcleo lee el estado que haya, y los
tests siembran membresías inactivas con las fábricas.

## Consecuencias

- **Es la primera pantalla con horas y nombres de otras personas.** La revisión
  de seguridad de cada slice del núcleo verifica que el alcance va en la
  consulta, también en la exportación, y que un `member` con una URL armada a
  mano no ve nada ajeno.
- **Hasta que la fase 2 traiga `team.manage`, solo el owner ve el reporte de
  equipo.** Un admin existe solo si alguien cambia el rol en la base. Es lo que
  pidió P-01; se dice para que no sorprenda.
- `timeEntry.others.view` sirve también al detallado de la fase 3. Editar horas
  ajenas desde ahí (RP-50) es otra acción, `timeEntry.others.update`, que este
  núcleo no agrega.
- **La fase 2 hereda dos reglas.** «Quitar a alguien del equipo» con horas es
  desactivarlo, porque la base rechaza el borrado; y borrar una membresía queda
  para quien no tiene horas, como una invitación. Si alguien habilita
  `deleteUser` en Better Auth, borrar una cuenta con horas falla: es lo buscado.
- **La migración necesita una comprobación previa en producción**: ninguna
  entrada sin membresía en su workspace. Si la hay, la clave compuesta no se
  puede crear. La consulta va en el contrato del primer slice y la corre el
  usuario, como la del 7b.
- **Los tests no cambian su limpieza**: `truncateAll` usa `cascade`, que no pasa
  por las acciones de las claves.
- La divergencia de P-01 queda registrada en la §8 de `reportes.md`. El
  documento de paridad suma una línea por RP-03 vacío y por la clave de P-09
  cuando se cierre el contrato del primer slice.

### Por qué no la opción 2

Ninguna pieza de la fase 2 es precondición del resumido: las entidades que el
reporte agrupa ya existen desde los slices 9 a 11, y «desactivar» solo cambia un
estado que el núcleo ya lee. Esperar demora la vista más pedida sin ganar nada.
Lo que sí hace falta antes —la regla de quién ve qué y que las horas no se
borren con la persona— es chico y lo trae el núcleo.

### Por qué no la opción 3

La planilla y el rastreador escriben: sus acciones son `timeEntry.own.*`. Un
«ver como» obliga a apagar cada control de escritura o a abrir la edición de
horas ajenas, que es de la fase 3. Y no suma entre personas, que es justamente
lo que se pidió.

### Por qué no la opción 4

Una herramienta externa decide el acceso por su cuenta, fuera de `can()` y del
login restringido al dominio, y necesita credenciales de la base de producción
en un tercero. Es un segundo lugar donde se decide quién ve qué, que es lo que
el módulo de permisos prohíbe.
