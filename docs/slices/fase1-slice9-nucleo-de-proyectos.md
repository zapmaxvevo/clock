# Fase 1, slice 9: núcleo de proyectos, clientes y tareas

Contrato del noveno slice vertical de la fase 1. Crea el módulo `project` en
`src/modules/project/` y la pantalla `/proyectos`.

- **Fuente de los comportamientos:** `docs/parity/proyectos.md` (PR-nn).
- **Lugar en el plan:** [mapa de la fase 1](fase1-mapa.md).
- **Correcciones aplicadas:** rondas 1, 2 y 3,
  [`correcciones-fase1-slice9.md`](correcciones-fase1-slice9.md).
- **Decisiones de arquitectura asociadas:**
  - [ADR 0004, núcleo de proyectos en la fase 1](../adr/0004-nucleo-de-proyectos-en-fase-1.md): fija el borde del slice.
  - [ADR 0007, el cliente elige el id de la entrada que crea](../adr/0007-el-cliente-elige-el-id-de-las-altas.md): este slice lo aplica a sus tres altas, con la plomería que deja el slice 2b.
  - [ADR 0009, la configuración del workspace viaja en el recurso](../adr/0009-la-configuracion-del-workspace-viaja-en-el-recurso.md): nace acá y cierra la decisión que el mapa dejaba abierta.

El contrato da por tomadas estas decisiones del equipo (`proyectos.md`, §15):

- Todo proyecto se crea público (P-17).
- `whoCreatesProjects` queda congelado en `everyone` y fuera de `can()` durante
  la fase 1 (P-18).
- La unicidad no distingue mayúsculas y cuenta los archivados (P-19).
- Los nombres tienen hasta 100 caracteres (P-20).
- Un cliente borrado deja a sus proyectos sin cliente (P-21).
- Los asignados de tarea se modelan ahora; su regla se aplica en la fase 2
  (P-23).
- La marca de responsable va en la tabla de miembros y viaja en el recurso
  (P-24).
- La paleta de colores es propia y fija (P-30).
- La nota y la dirección son texto sin formato (P-31).

## 0. Precondición de arranque

**No usa nada funcional de los slices 2 a 5**: ni la barra, ni la lista, ni la
ventana, ni `src/server/time`, ni ninguna mutación de `time-entry`. Pero
arranca con dos slices mergeados:

- **El slice 2.** El arnés de `actions.integration.test.ts`, que registra las
  revalidaciones y que este slice copia en su módulo, llega con el merge del
  slice 2.
- **El slice 2b.** Es el primero que implementa el ADR 0007, y lo deja en dos
  lugares neutros que este slice importa y no reescribe:
  - `src/server/create-once.ts`: `createOnce` y su tipo `Creation<Row, Result>`;
  - `src/server/db/constraint-error.ts`: `constraintOf`, `hasConstraint` y los
    códigos de Postgres.

  Las firmas que usa y lo que supone de `createOnce` están en §4.4.

**La tabla §14 de `proyectos.md` ya está rehecha** por `parity-analyst`, con
PR-111 incluido (corregida el 2026-10-03). El reparto por identificador de este
slice es su §14.1.

Y dos condiciones de entorno:

- **El orden de las migraciones.** Las del 9 son la 0003 y la 0004, sobre
  `main`, que ya trae la 0002 del slice 5. Los nombres están en §2. El diario
  `drizzle/meta/_journal.json` no se edita a mano.
- **Postgres 15 o posterior** en todos los entornos, por la cláusula
  `on delete set null (columna)` de §2.2. CI corre Postgres 17. Antes del merge,
  el equipo verifica la versión del proyecto de Neon.

## 1. Alcance

Entran:

- **Las tablas** `client`, `project`, `task`, `project_member` y `task_assignee`.
  Llevan desde ahora todas las columnas que la fase 2 va a necesitar de las
  entidades relevadas, aunque todavía no tengan pantalla:
  - lo relevado en PR-01, PR-12 y PR-36;
  - la nota y la dirección (P-31, PR-30);
  - la visibilidad (P-17);
  - el facturable por defecto (PR-21, P-16), que el slice 11 suma al alta;
  - la marca de responsable (P-24);
  - los asignados de tarea (P-23);
  - el archivado como estado.
- **Las reglas de la base:**
  - la unicidad (PR-49, PR-50, PR-51, PR-53);
  - los largos (PR-54);
  - el aislamiento por workspace (§2.2);
  - lo que hacen las claves foráneas al borrar (PR-09, PR-35), incluidos los dos
    borrados que la base rechaza (§2.2 y §2.3).
- **Las acciones de permiso** de §3, con el par acción y recurso tipado, y el
  filtro de lectura de PR-61, que es el mismo de TT-08 visto desde la lista.
- **Un solo camino de creación por entidad** (PR-04), en una sola pantalla:
  «Nuevo cliente», «Nuevo proyecto» y «Nueva tarea» en `/proyectos` (§6).
- **Quien crea un proyecto queda como su responsable** (PR-19).
- **`whoCreatesProjects` pasa a `everyone`**, en el valor por omisión y en las
  filas que ya existen (P-18, PR-59).
- **Las piezas compartidas de las actions** que hoy viven dentro de
  `time-entry` (§4): este es el segundo módulo con actions, y no las copia.

### El reparto por identificador

El reparto es el §14.1 de `proyectos.md`. Los identificadores del slice 9 son
los de esa lista, y los criterios de §7 los citan. Dos se adelantan desde la
fase 2, solo en parte y como dice su §14.3:

- **De PR-31, el orden alfabético** de la pantalla. Las columnas, el buscador y
  el filtro de estado son de la fase 2.
- **De PR-38, que solo hay tareas activas.** El 9 crea tareas activas y su
  catálogo muestra solo las activas; marcar una tarea como hecha es de la
  fase 2.

### Queda afuera

- Todo lo que administra la fase 2: asignar personas, marcar responsables, hacer
  privado un proyecto, archivar, editar, borrar, y buscar y filtrar la lista.
- Lo pago, que nunca entra (P-32).
- Los grupos (P-25).
- El selector del rastreador, que es del slice 10.
- Migrar `time-entry` a las piezas compartidas de §4, que queda como deuda del
  mapa.

### Consecuencias sobre código ya entregado

| Archivo                             | Qué cambia                                                                                  | Qué hay que volver a probar         |
| ----------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------- |
| `src/server/db/schema.ts`           | Cinco tablas nuevas, un enum, el valor por omisión de `whoCreatesProjects` y su comentario. | La creación del workspace (slice 1) |
| `src/server/permissions/index.ts`   | Cinco acciones nuevas, una variante de `Resource` y `can` con el par tipado (§3).           | `permissions.test.ts` entero        |
| `src/components/layout/app-nav.tsx` | Suma «Proyectos».                                                                           | La navegación del slice 1           |
| `CLAUDE.md`                         | La sección «Estructura» suma los archivos compartidos nuevos (§6).                          | —                                   |

`time-entry` no cambia: sigue con sus copias de `ActionResult`, `failure`,
`handle`, el `refine` del carácter nulo, `useEntryAction` y `useNewEntryId`
hasta que un slice toque sus actions. Los llamados de `time-entry` a `can()` ya
cumplen el par tipado de §3.

## 2. Cambios de esquema

Dos migraciones, en este orden y con estos nombres:

1. **`0003_projects`, la generada**, con
   `npm run db:generate -- --name=projects` a partir de `schema.ts`.
2. **`0004_projects_set_null_backfill`, escrita a mano**, creada con
   `npm run db:generate -- --custom --name=projects_set_null_backfill`, para lo
   que drizzle-kit no puede expresar: las cuatro claves con `set null (columna)`
   de §2.2 y el relleno de `whoCreatesProjects` de §2.5.

Los nombres son fijos porque el test del criterio 11 busca la segunda por su
etiqueta en `drizzle/meta/_journal.json`.

Las dos son solo de expansión:

- crean tablas y restricciones nuevas;
- cambian un valor por omisión;
- escriben una fila que ninguna pantalla pudo haber cambiado.

No reescriben ninguna tabla con datos y se aplican antes del despliegue.

### 2.1 Las tablas

Columnas comunes a todas las tablas:

- **`workspace_id uuid not null`**, con clave foránea a `workspace` y
  `on delete cascade`, como el resto del modelo.
- **`created_at` y `updated_at`.**

Convenciones:

- Los textos opcionales son `not null default ''`, como la descripción de una
  entrada (PR-02).
- El archivado es `archived_at timestamptz null`: nulo es activo, y la fecha
  queda guardada para cuando la fase 2 la muestre.
- **`created_by text null`** es el usuario que creó la fila. Lo usa el reintento
  de §4.4 para reconocer la fila como «propia». Es nulable porque se anula si la
  membresía se borra (§2.2).

| Tabla            | Columnas propias                                                                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client`         | `id`, `name`, `address`, `note`, `archived_at`, `created_by`                                                                                             |
| `project`        | `id`, `client_id` (nulable), `name`, `color`, `is_public` (`default true`), `billable_by_default` (`default false`), `note`, `archived_at`, `created_by` |
| `task`           | `id`, `project_id`, `name`, `status` (enum `task_status` con `active` y `done`, `default 'active'`), `created_by`                                        |
| `project_member` | `project_id`, `user_id`, `is_manager` (`default false`). Clave primaria `(project_id, user_id)`                                                          |
| `task_assignee`  | `task_id`, `user_id`. Clave primaria `(task_id, user_id)`                                                                                                |

Las claves primarias de `client`, `project` y `task` son `id uuid`. Llevan el
nombre por omisión `<tabla>_pkey`, que es el `idConstraint` del reintento.

Los `checks` son estos:

- **`name`, en las tres entidades:** `char_length(name) between 1 and 100` y
  `name = btrim(name)` (PR-54, PR-109). El esquema Zod ya recorta; la base no
  deja pasar lo que se le escape.
- **`address` y `note`:** `char_length(...) <= 3000`.
- **`project.color`:** tiene que ser una de las claves de la paleta de §2.4.

Los índices de unicidad (PR-49 … PR-51, PR-53) cuentan también las filas
archivadas, porque no tienen condición:

| Nombre             | Tabla     | Columnas                                                                                   |
| ------------------ | --------- | ------------------------------------------------------------------------------------------ |
| `client_name_unq`  | `client`  | `(workspace_id, lower(name))`                                                              |
| `project_name_unq` | `project` | `(workspace_id, coalesce(client_id, '00000000-0000-0000-0000-000000000000'), lower(name))` |
| `task_name_unq`    | `task`    | `(workspace_id, project_id, lower(name))`                                                  |

- **El `coalesce` del proyecto** hace que los proyectos sin cliente compitan
  entre sí, como pide PR-50. Tiene una consecuencia sobre el borrado de un
  cliente, que §2.2 escribe como regla.
- **El UUID nulo no choca con ningún cliente**, porque los ids que se aceptan son
  v4 (§4).

Índices de consulta:

- `project_member (workspace_id, user_id)`, para leer las pertenencias de quien
  pide y para la cascada desde la membresía.
- `task_assignee (workspace_id, user_id)`, para la cascada desde la membresía.
- `project (workspace_id, client_id)`, para que el `set null` de §2.2 no recorra
  la tabla entera.
- **`created_by` no se indexa**, por decisión. Lo recorre solo el `set null` al
  borrar una membresía, que en la fase 1 no tiene pantalla y en la fase 2 es una
  operación de administración rara, sobre tablas del tamaño de §8. Un índice por
  tabla lo pagaría cada alta. Si el borrado de membresías se vuelve frecuente o
  las tablas pasan el umbral de §8, se indexa.

### 2.2 Aislamiento por workspace, en la base

**Ninguna clave foránea entre estas tablas puede cruzar workspaces.** Eso no
depende del service: las claves son **compuestas con `workspace_id`**.

Destinos que las claves compuestas necesitan:

| Nombre                          | Tabla     | Columnas                                                  |
| ------------------------------- | --------- | --------------------------------------------------------- |
| `client_workspace_id_unq`       | `client`  | `(workspace_id, id)`                                      |
| `project_workspace_id_unq`      | `project` | `(workspace_id, id)`                                      |
| `task_workspace_id_unq`         | `task`    | `(workspace_id, id)`                                      |
| `task_workspace_project_id_unq` | `task`    | `(workspace_id, project_id, id)`, para el slice 10 (§2.3) |

Las claves. **Cada `foreignKey()` de `schema.ts` lleva `name:` explícito**: los
nombres por omisión hacia `membership` pasan de los 63 caracteres de Postgres,
que los trunca, y la migración escrita a mano tiene que poder nombrar las que
reemplaza.

| Nombre                         | Desde                                       | Hacia                                | Al borrar el destino       |
| ------------------------------ | ------------------------------------------- | ------------------------------------ | -------------------------- |
| `client_workspace_fk`          | `client (workspace_id)`                     | `workspace (id)`                     | `cascade`                  |
| `project_workspace_fk`         | `project (workspace_id)`                    | `workspace (id)`                     | `cascade`                  |
| `task_workspace_fk`            | `task (workspace_id)`                       | `workspace (id)`                     | `cascade`                  |
| `project_member_workspace_fk`  | `project_member (workspace_id)`             | `workspace (id)`                     | `cascade`                  |
| `task_assignee_workspace_fk`   | `task_assignee (workspace_id)`              | `workspace (id)`                     | `cascade`                  |
| `project_client_fk`            | `project (workspace_id, client_id)`         | `client (workspace_id, id)`          | `set null (client_id)` \*  |
| `task_project_fk`              | `task (workspace_id, project_id)`           | `project (workspace_id, id)`         | `cascade`                  |
| `project_member_project_fk`    | `project_member (workspace_id, project_id)` | `project (workspace_id, id)`         | `cascade`                  |
| `project_member_membership_fk` | `project_member (workspace_id, user_id)`    | `membership (workspace_id, user_id)` | `cascade`                  |
| `task_assignee_task_fk`        | `task_assignee (workspace_id, task_id)`     | `task (workspace_id, id)`            | `cascade`                  |
| `task_assignee_membership_fk`  | `task_assignee (workspace_id, user_id)`     | `membership (workspace_id, user_id)` | `cascade`                  |
| `client_created_by_fk`         | `client (workspace_id, created_by)`         | `membership (workspace_id, user_id)` | `set null (created_by)` \* |
| `project_created_by_fk`        | `project (workspace_id, created_by)`        | `membership (workspace_id, user_id)` | `set null (created_by)` \* |
| `task_created_by_fk`           | `task (workspace_id, created_by)`           | `membership (workspace_id, user_id)` | `set null (created_by)` \* |

\* **Las cuatro claves con `set null (columna)`** usan sintaxis de Postgres 15.
Un `set null` sin lista intentaría anular también `workspace_id`, que no admite
nulos. Drizzle-kit 0.31 no genera esa forma:

- `schema.ts` las declara con `onDelete("set null")` y un comentario sobre cada
  una que remite a la migración escrita a mano;
- la migración escrita a mano las reemplaza por la versión con lista, con el
  mismo nombre, para que el próximo `db:generate` no vea diferencias.

Por qué así:

- **`project_client_fk`** es PR-09: un cliente borrado deja a sus proyectos sin
  cliente.
- **`task_project_fk`**: una tarea no existe sin su proyecto (PR-35).
- **Las claves hacia `membership`** apuntan a la restricción
  `membership_workspace_user_unq`, que ya existe. Apuntar a la membresía y no al
  usuario impide que alguien sea miembro de un proyecto, o figure como creador,
  en un workspace al que no pertenece; y es lo que evita empeorar la deuda de
  seguridad del slice 1 (§3.3).

Con esto, la base rechaza un `client_id` de otro workspace en un proyecto aunque
el service se equivoque, porque no encuentra la fila destino.

**Regla de borrado de un cliente (PR-111).** Si un proyecto del cliente se llama
igual, sin distinguir mayúsculas, que un proyecto sin cliente del mismo
workspace, `project_client_fk` lo dejaría sin cliente y `project_name_unq`
choca. **El borrado del cliente se rechaza entero y nada cambia.** Es la regla,
no un accidente:

- quedarse con dos proyectos sin cliente con el mismo nombre rompería PR-50;
- renombrar uno solo por borrar el cliente sería un efecto que nadie pidió.

La fase 2, que trae el borrado desde la interfaz (PR-08), traduce ese `23505`
sobre `project_name_unq` al mensaje de PR-111.

### 2.3 Lo que el slice 10 necesita y este deja listo

El slice 10 agrega `time_entry.project_id` y `task_id`. Este contrato le deja
fijadas estas restricciones:

- **`time_entry (workspace_id, project_id) → project (workspace_id, id)`**, con
  `on delete set null (project_id)` (PR-64).
- **`time_entry (workspace_id, project_id, task_id) → task (workspace_id,
project_id, id)`**, con `on delete set null (task_id)` (PR-66). Por
  construcción, la tarea de una entrada es del proyecto de la entrada (PR-105).
- **`check (task_id is null or project_id is not null)`** (PR-35).

**Borrar un proyecto con tareas usadas en entradas: la base lo rechaza.** La
cascada a `task` dispara sus acciones después de las del proyecto, así que el
`set null (project_id)` llega a la entrada mientras su `task_id` todavía apunta
a la tarea, y el `check` corta. Sin el `check`, la entrada quedaría con un
`task_id` colgado. El `check` y la clave de tres columnas se quedan como red: lo
que cambia es cómo se borra.

**El borrado de un proyecto, que llega con la fase 2, son dos sentencias en una
transacción:** primero `delete` de las tareas del proyecto, que anula el
`task_id` de sus entradas; después `delete` del proyecto, que anula el
`project_id`. La entrada queda sin proyecto, sin tarea y con sus horas (PR-67).

**Criterio que el slice 10 hereda**, con las claves ya en su lugar y una entrada
con proyecto y tarea:

- borrar el proyecto directamente falla y nada cambia;
- borrar las tareas y después el proyecto, en una transacción, deja la entrada
  sin proyecto, sin tarea y con su duración;
- borrar el workspace entero funciona. Ahí las cascadas desde `workspace` y los
  `set null` desde `project` corren en la misma sentencia, y el orden en que se
  disparan no es algo que este contrato pueda garantizar sin probarlo.

### 2.4 La paleta (P-30)

Doce colores. Se guardan por **clave** y no por valor, para poder ajustar la
paleta sin migrar datos. Los valores son tonos 600, que se distinguen en un
punto de ocho píxeles tanto sobre fondo claro como oscuro.

| Clave    | Nombre accesible | Valor     |
| -------- | ---------------- | --------- |
| `red`    | Rojo             | `#DC2626` |
| `orange` | Naranja          | `#EA580C` |
| `amber`  | Ámbar            | `#D97706` |
| `lime`   | Lima             | `#65A30D` |
| `green`  | Verde            | `#16A34A` |
| `teal`   | Verde azulado    | `#0D9488` |
| `cyan`   | Cian             | `#0891B2` |
| `blue`   | Azul             | `#2563EB` |
| `indigo` | Índigo           | `#4F46E5` |
| `violet` | Violeta          | `#7C3AED` |
| `pink`   | Rosa             | `#DB2777` |
| `slate`  | Pizarra          | `#475569` |

- La lista vive en `src/modules/project/palette.ts`, y el `check` de la base
  repite las claves.
- Si no se elige color, se asigna **el que sigue en la paleta según cuántos
  proyectos tiene el workspace** (PR-15).
  - Es determinista y reparte los colores sin consultar cuáles se usan.
  - Dos altas simultáneas pueden recibir el mismo color, y no pasa nada.

### 2.5 `whoCreatesProjects`

- **En el esquema generado**, el valor por omisión pasa de `admins` a
  `everyone`.
- **En la migración escrita a mano**, las filas que ya existen pasan a
  `everyone` (P-18, PR-59), con una sola sentencia `update`.
- **`schema.ts` lleva un comentario sobre la columna**: en la fase 1 no tiene
  efecto (P-18) y, cuando lo tenga, entra en `can()` por el recurso (ADR 0009).

Ninguna pantalla pudo haber cambiado el valor. El `admins` de hoy es el valor
por omisión anterior, no la elección de alguien.

### 2.6 Reversión

Si hay que volver atrás, en este orden, y **se pierde todo lo creado**:
clientes, proyectos, tareas, pertenencias y asignados. El audit log conserva sus
registros, que no tienen clave foránea hacia estas tablas.

1. **Lo del slice 10, si ya está desplegado**: el `check` y las dos claves de
   `time_entry` hacia `project` y `task`, y después las columnas `project_id` y
   `task_id`. Sin este paso, las tablas de abajo no se pueden borrar.
2. Las tablas, de las que dependen hacia las que no: `task_assignee`,
   `project_member`, `task`, `project`, `client`.
3. El tipo `task_status`.
4. El valor por omisión de `whoCreatesProjects`, de vuelta a `admins`.
5. Las filas de `workspace_settings`, de vuelta a `admins`. Nadie pudo haberlas
   cambiado en la fase 1, así que es el valor que tenían.

## 3. Permisos

### 3.1 Acciones nuevas en la unión `Action`

| Acción           | Recurso     | Roles en la tabla | Regla además del rol                                                         |
| ---------------- | ----------- | ----------------- | ---------------------------------------------------------------------------- |
| `client.create`  | `workspace` | los cinco         | —                                                                            |
| `project.create` | `workspace` | los cinco         | —                                                                            |
| `project.view`   | `project`   | los cinco         | proyecto público, o quien actúa es miembro, o es owner o admin (PR-61)       |
| `project.track`  | `project`   | los cinco         | proyecto público, o quien actúa es miembro; el rol no alcanza (PR-17, TT-08) |
| `task.create`    | `project`   | los cinco         | quien actúa es owner o admin, o responsable de ese proyecto (PR-40)          |

- **`team_manager` decide como `member`** en las cinco (PR-57). **También
  `project_manager`**: lo que da algo sobre un proyecto es la marca de
  responsable de ese proyecto, no el rol del workspace.
- **`project.track` no tiene consumidor en este slice.** Es la regla de TT-08,
  que el mapa pone acá, y la usa el selector del slice 10. Entra con sus tests.

### 3.2 La variante de `Resource` y el par tipado

```ts
type ProjectResource = {
  readonly kind: "project";
  readonly workspaceId: string;
  readonly isPublic: boolean;
  /** La fila de `project_member` de quien actúa, o `null` si no es miembro. */
  readonly viewer: { readonly isManager: boolean } | null;
};
```

**Cada acción declara la clase de recurso que recibe**, y `can()` lo exige en
el tipo y lo comprueba en tiempo de ejecución. Sin eso, `task.create` con un
recurso `workspace` saltea la regla del responsable y concede por rol.

```ts
type ResourceByAction = {
  "workspace.settings.update": WorkspaceResource;
  "workspace.transfer": WorkspaceResource;
  "workspace.delete": WorkspaceResource;
  "team.view": WorkspaceResource;
  "team.manage": WorkspaceResource | MembershipResource;
  "member.invite": WorkspaceResource;
  "timeEntry.own.create": TimeEntryResource;
  "timeEntry.own.update": TimeEntryResource;
  "timeEntry.own.delete": TimeEntryResource;
  "client.create": WorkspaceResource;
  "project.create": WorkspaceResource;
  "project.view": ProjectResource;
  "project.track": ProjectResource;
  "task.create": ProjectResource;
};

export type Action = keyof ResourceByAction;
export type ResourceFor<A extends Action> = ResourceByAction[A];
export type Resource = ResourceByAction[Action];

export function can<A extends Action>(
  actor: Actor,
  action: A,
  resource: ResourceFor<A>,
): boolean;
export function assertCan<A extends Action>(
  actor: Actor,
  action: A,
  resource: ResourceFor<A>,
): void;
```

- **Las clases de las acciones existentes salen de cómo se llaman hoy**, tests
  incluidos: `team.manage` se usa con `workspace` y con `membership`. Ningún
  llamado actual deja de compilar.
- **La comprobación en tiempo de ejecución** es una tabla
  `resourceKinds: { [A in Action]: readonly ResourceFor<A>["kind"][] }`,
  declarada con `satisfies` contra ese tipo para que las dos no se separen. Con
  un recurso de otra clase, `can()` devuelve `false` antes de mirar el rol.
  Cubre lo que el tipo no ve: un `as`, un valor armado en un test, un `Resource`
  ancho. **Cambia la conducta de una acción existente**: hoy
  `timeEntry.own.update` con un recurso `workspace` concede, porque la regla del
  dueño solo mira recursos `timeEntry`; desde este slice, no (criterio 8).
- **`can()` sigue siendo pura.** El service lee el proyecto y la fila de miembro
  de quien actúa, arma el recurso y recién entonces llama a `can()`, igual que
  `time-entry` arma el suyo a partir de la fila de la entrada.
- `can()` corta primero por el estado de la membresía (PR-60) y por workspace,
  como hoy.

**El ADR 0009 resuelve la decisión que el mapa dejaba abierta:**

- En la fase 1, `whoCreatesProjects` no entra en `can()` (P-18), y
  `project.create` y `client.create` declaran el `WorkspaceResource` común.
- Cuando la fase 2 lo vuelva editable, esas dos acciones pasan a declarar en
  `ResourceByAction` un recurso propio, de otra clase, con el campo obligatorio
  y el dato de quien actúa que necesita el valor `managers`. La variante
  `workspace` que comparten las demás acciones no cambia.
- No se parte la acción, porque media decisión quedaría fuera de `can()`. Tampoco
  crece `Actor`.

### 3.3 La deuda de seguridad del slice 1

La deuda: `ensureWorkspaceContext` crea una membresía `member` para cualquiera
que pase el login. Borrar la membresía no revoca nada, porque se vuelve a crear
en el pedido siguiente.

**Con proyectos, la deuda podía empeorar:**

- Si la tabla de miembros de proyecto apuntara a `user`, las pertenencias no se
  enterarían de que la membresía se borró.
- La persona a la que se quiso revocar volvería a entrar como `member` y se
  encontraría con sus proyectos privados y sus marcas de responsable intactos.

**Este slice no la empeora:**

- `project_member` y `task_assignee` apuntan a la membresía con
  `on delete cascade` (§2.2).
- Borrar la membresía borra las pertenencias, y la membresía que se vuelve a
  crear no las recupera.
- `created_by` se anula, así que el reintento de §4.4 tampoco reconoce como
  propia una fila creada con la membresía anterior.

Queda la deuda original: volver a entrar como `member`. Con este slice, eso da
lo mismo que un `member` del plan Free: crear clientes y proyectos, y ver los
públicos. Arreglarla sigue siendo condición del slice que traiga `team.manage`.

## 4. Contrato de las server actions

Tres actions en `src/modules/project/actions.ts`. Siguen el recorrido de
siempre:

1. sesión;
2. Zod;
3. `can()`;
4. service en una transacción, con audit log;
5. revalidación de `/proyectos`, también cuando hay un error de dominio.

**Ningún archivo de `components/` importa `actions.ts`.** Las actions llegan a la
pantalla como props desde `page.tsx` (§6). `actions.ts` arrastra la sesión, la
base y `env()`; un componente que lo importe no se puede renderizar en un test
de unidad.

### Las piezas compartidas

Este es el segundo módulo con actions. Lo que `time-entry` tiene dentro y no
depende del módulo se extrae ahora, y el 9 lo usa desde el primer commit:

| Pieza                               | Dónde                     | Qué es                                                                                                                        |
| ----------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `ActionResult<T, Code>`             | `src/server/action.ts`    | El resultado tipado. `Code` por omisión es `"validation" \| "not_found" \| "forbidden" \| "unexpected"`; un módulo lo amplía. |
| `DomainError<Code>`                 | `src/server/action.ts`    | La clase base de los errores de dominio, con `code` y mensaje. `ProjectError` la extiende.                                    |
| `failure(error, messages)`          | `src/server/action.ts`    | La traducción de hoy: `DomainError` tal cual, `ForbiddenError` y `ZodError` con su mensaje, el resto a `unexpected` con log.  |
| `handle(work, { paths, messages })` | `src/server/action.ts`    | `requireSession`, el trabajo, `failure`, y `revalidatePath` de cada ruta en el `finally`.                                     |
| `noNullCharacter(value)`            | `src/lib/text.ts`         | El predicado del `refine` del carácter nulo. Va en `src/lib` porque lo importan esquemas que también carga el navegador.      |
| `useAction(action, options)`        | `src/hooks/use-action.ts` | El hook con transición, aviso y reintento, con el último pedido guardado entero; recibe el mensaje de red caída por opción.   |
| `retryHandlerOf(handle)`            | `src/hooks/use-action.ts` | «Reintentar» solo con `unexpected` (TT-89).                                                                                   |
| `useNewId(failure)`                 | `src/hooks/use-new-id.ts` | El equivalente de `useNewEntryId`: con el aviso `unexpected` visible, la misma clave reusa el id pendiente; si no, uno nuevo. |

- `messages` es `{ forbidden, unexpected }` del módulo. Los textos son los
  mismos en los dos módulos por la regla de una redacción por causa, pero cada
  módulo los declara.
- El hook importa `ActionResult` como tipo y nada más de `src/server/`.
- **`useNewId` tiene la firma y la regla de `useNewEntryId`**: recibe el aviso
  de `useAction` y devuelve `(key) => id`. El id se pide en el manejador, antes
  de `run`, que baja el aviso: el que se ve es el que dice si hay un pedido
  pendiente. Cómo lo usan los diálogos está en §6.
- `time-entry` migra a estas piezas en el próximo slice que toque sus actions.
  Hasta entonces conviven las dos versiones; es deuda del mapa (§5).

### Los tipos

```ts
const name = z
  .string()
  .trim()
  .min(1, projectMessages.nameRequired)
  .max(100, projectMessages.nameTooLong)
  .refine(noNullCharacter, projectMessages.nullCharacter);
const longText = (tooLong: string) =>
  z
    .string()
    .trim()
    .max(3000, tooLong)
    .refine(noNullCharacter, projectMessages.nullCharacter);

export const createClientInput = z.object({
  /** ADR 0007: lo genera el cliente, uno por acción de la persona. */
  id: z.uuidv4(),
  name,
  address: longText(projectMessages.addressTooLong).default(""),
  note: longText(projectMessages.noteTooLong).default(""),
});

export const createProjectInput = z.object({
  id: z.uuidv4(),
  name,
  clientId: z.uuid().nullable(),
  /** Una clave de la paleta, o `null` para que la asigne el servidor. */
  color: z.enum(PALETTE_KEYS).nullable(),
  note: longText(projectMessages.noteTooLong).default(""),
});

export const createTaskInput = z.object({
  id: z.uuidv4(),
  projectId: z.uuid(),
  name,
});

export type ClientView = { readonly id: string; readonly name: string };
export type TaskView = { readonly id: string; readonly name: string };

export type CreateClientResult = { readonly client: ClientView };
export type CreateProjectResult = { readonly project: ProjectView };
export type CreateTaskResult = { readonly task: TaskView };

/** Las tres actions, como las recibe la pantalla por props desde `page.tsx`. */
export type ProjectActions = {
  readonly createClient: (
    input: CreateClientInput,
  ) => Promise<ActionResult<CreateClientResult>>;
  readonly createProject: (
    input: CreateProjectInput,
  ) => Promise<ActionResult<CreateProjectResult>>;
  readonly createTask: (
    input: CreateTaskInput,
  ) => Promise<ActionResult<CreateTaskResult>>;
};
```

- **`ClientView`** es lo que necesitan el encabezado de grupo y el `select` del
  diálogo de proyecto. La dirección y la nota no se muestran en la fase 1.
- **`TaskView`** no lleva estado: la lectura solo devuelve tareas activas (§5).
- **`ProjectView`** está en §5. Un proyecto recién creado la devuelve con `tasks`
  vacío.
- **`ProjectActions`** vive en `schema.ts`, que no importa nada del servidor
  salvo el tipo `ActionResult`. Es el tipo de la prop de `ProjectsScreen` y de
  los dobles del test de componente.

### Los mensajes

`projectMessages` vive en `src/modules/project/schema.ts` y usa los textos de
`proyectos.md` §9. Por la regla de una sola redacción por causa, los que ya
existen en el rastreador se repiten con el mismo texto.

| Clave                | Texto                                                        | Origen       |
| -------------------- | ------------------------------------------------------------ | ------------ |
| `projectUnavailable` | «Ese proyecto ya no está disponible.»                        | PR-72, TT-77 |
| `clientUnavailable`  | «Ese cliente ya no está disponible.»                         | PR-83        |
| `nameRequired`       | «El nombre no puede estar vacío.»                            | PR-75        |
| `nameTooLong`        | «El nombre no puede superar los 100 caracteres.»             | PR-76        |
| `projectNameTaken`   | «Ya hay un proyecto con ese nombre para ese cliente.»        | PR-77        |
| `clientNameTaken`    | «Ya hay un cliente con ese nombre.»                          | PR-78        |
| `taskNameTaken`      | «Ya hay una tarea con ese nombre en el proyecto.»            | PR-79        |
| `forbidden`          | «No tenés permiso para hacer esto.»                          | PR-84, TT-79 |
| `addressTooLong`     | «La dirección no puede superar los 3000 caracteres.»         | PR-54        |
| `noteTooLong`        | «La nota no puede superar los 3000 caracteres.»              | PR-54        |
| `nullCharacter`      | «El texto tiene un carácter que no se puede guardar.»        | como TT-113  |
| `unexpected`         | «No se pudo guardar. Revisá la conexión y volvé a intentar.» | TT-89        |

Los códigos son `validation`, `not_found`, `forbidden` y `unexpected`.
`not_found` cubre «ya no está disponible», que es como lo dicen PR-72 y PR-83.

### 4.1 `createClient`: PR-01, PR-02, PR-03, PR-49

1. Comprueba `can(actor, "client.create", { kind: "workspace", workspaceId })`.
2. Llama a `createOnce` (§4.4).
3. `attempt`: inserta con los textos ya recortados y `created_by` = quien
   actúa, y escribe `recordAudit` con `client.create` y la fila como
   `nextValue`.
4. Si `createOnce` deja salir un choque con `client_name_unq`, responde
   `validation` con `clientNameTaken` (PR-91).

### 4.2 `createProject`: PR-12 … PR-17, PR-19, PR-30, PR-50, PR-59

1. Comprueba `can(actor, "project.create", { kind: "workspace", workspaceId })`.
2. Llama a `createOnce` (§4.4).
3. `attempt`, en una transacción:
   1. si `clientId` no es nulo, lee el cliente **en el workspace de la sesión**;
      si no está o está archivado, `not_found` con `clientUnavailable` (PR-83);
   2. usa `color ?? nextPaletteColor(cantidad de proyectos del workspace)`;
   3. inserta con la nota (PR-30), `is_public = true` (P-17),
      `billable_by_default = false` y `created_by` = quien actúa;
   4. inserta en `project_member` a quien actúa, con `is_manager = true`
      (PR-19);
   5. escribe `recordAudit` con `project.create`, la fila y el miembro creado.
4. Si `createOnce` deja salir un choque con `project_name_unq`, responde
   `validation` con `projectNameTaken`.

### 4.3 `createTask`: PR-35, PR-36, PR-40, PR-51

1. Lee el proyecto **en el workspace de la sesión**, junto con la fila de
   `project_member` de quien actúa, y arma el `ProjectResource`.
2. Responde `not_found` con `projectUnavailable` si el proyecto no está, si
   `can(actor, "project.view", recurso)` es falso o si está archivado. Un
   proyecto que la persona no puede ver responde lo mismo que uno que no
   existe: cualquier otra respuesta revelaría que existe.
3. Comprueba `can(actor, "task.create", recurso)`. Si no, `forbidden`.
4. Llama a `createOnce` (§4.4).
5. `attempt`: inserta con `status = 'active'` (adelanta de PR-38 que solo hay
   tareas activas) y `created_by` = quien actúa, y escribe `recordAudit` con
   `task.create`. No hay asignados: la tabla existe y queda vacía, que significa
   «cualquiera» (P-23).
6. Si `createOnce` deja salir un choque con `task_name_unq`, responde
   `validation` con `taskNameTaken`.

**Una membresía no activa responde PR-72, no PR-84.** `can()` corta primero por
el estado de la membresía (§3.2), así que quien no está activo no ve ningún
proyecto, y el paso 2 responde antes de llegar al 3. Es la decisión, no un
accidente del orden: `forbidden` diría que el proyecto existe, que es lo que el
paso 2 evita. Vale también con el `id` de una tarea propia, porque el paso 2
corre antes de `createOnce`. `createClient` y `createProject`, que no leen nada
antes del permiso, responden `forbidden` (criterios 10 y 15).

### 4.4 Reintentar

Las tres actions ofrecen «Reintentar» con `unexpected` (TT-89, PR-90). Usan la
regla del ADR 0007 a través de `createOnce` de `src/server/create-once.ts`, que
deja el slice 2b; no la reescriben. La firma es la del §4 del 2b:

```ts
export async function createOnce<Row, Result>(
  creation: Creation<Row, Result>,
): Promise<Result>;

// Creation<Row, Result>: id, action, findOwn, attempt, replayed, idConstraint,
// y onOtherConflict opcional, que el 9 no pasa.
```

Cada alta la llama **con los tipos explícitos**, para que un `replayed` que no
devuelve lo mismo que `attempt` no compile:

| Alta            | Llamado                                          | `action`         | `idConstraint` | `findOwn`        | `replayed`                                   |
| --------------- | ------------------------------------------------ | ---------------- | -------------- | ---------------- | -------------------------------------------- |
| `createClient`  | `createOnce<ClientRow, CreateClientResult>`      | `client.create`  | `client_pkey`  | `findOwnClient`  | `{ client: toClientView(row) }`              |
| `createProject` | `createOnce<OwnProjectRow, CreateProjectResult>` | `project.create` | `project_pkey` | `findOwnProject` | `{ project: toProjectView(actor, row, []) }` |
| `createTask`    | `createOnce<TaskRow, CreateTaskResult>`          | `task.create`    | `task_pkey`    | `findOwnTask`    | `{ task: toTaskView(row) }`                  |

- **`id`** es el `input.id` validado.
- **`action` es la misma acción que el alta pasó a `can()`** antes de llamar a
  `createOnce`: `client.create` en el paso 1 de §4.1, `project.create` en el
  paso 1 de §4.2 y `task.create` en el paso 3 de §4.3. Así el `ForbiddenError`
  del id ajeno nombra la acción que se estaba intentando.
- **`findOwn`** va en el repository del módulo: la fila de la misma tabla, del
  mismo workspace, con ese id y con `created_by` igual a quien actúa, leída sin
  bloqueo y fuera de toda transacción.
- **`replayed` arma la vista a partir de la fila propia:**
  - `ClientView` y `TaskView` salen directo de la fila, sin otra consulta.
  - `ProjectView` necesita además la fila de `project_member` de quien actúa, y
    por eso `findOwnProject` hace `left join` de esa fila y devuelve
    `OwnProjectRow`: las columnas del proyecto más
    `viewer: { isManager } | null`. Con eso `toProjectView` calcula
    `canCreateTask` con `can(actor, "task.create", recurso)`, igual que la
    lectura de §5. La revisión lo probó así contra Postgres.
- **El reintento de un proyecto responde `tasks: []`**, por decisión: aunque el
  proyecto haya sumado tareas entre el primer intento y el reintento, el
  diálogo solo usa la respuesta para cerrarse, y la pantalla revalida
  `/proyectos` igual, que trae las tareas reales. Leerlas costaría una consulta
  para un dato que nadie muestra.
- **`attempt`** es la transacción de §4.1, §4.2 o §4.3, que deja salir el error
  de la base tal cual.
- **Los nombres de las restricciones** —las tres `_pkey` y los tres índices de
  nombre— viven en el repository del módulo. El service reconoce el índice de
  nombre con `hasConstraint(error, UNIQUE_VIOLATION, …)`.
- **Sin `onOtherConflict`**: ninguna de estas tablas tiene un índice como el del
  timer abierto, y el nombre repetido se reconoce en el error que sale (ADR
  0007).

**Lo que el 9 supone de `createOnce`** es la lista «Lo que cualquier módulo
puede suponer de `createOnce`» del ADR 0007, que es la misma que «Los cinco
supuestos» del §4 del 2b:

1. Lee la fila propia antes de escribir; si existe, la responde sin llamar a
   `attempt`.
2. **Ante cualquier `23505`, vuelve a leer la fila propia antes de mirar qué
   restricción saltó**, y si existe, la responde.
3. Sin fila propia, un choque con `idConstraint` sale como
   `ForbiddenError(action)`, que `failure` traduce al mensaje neutro.
4. Sin fila propia y sin `onOtherConflict`, cualquier otro `23505` sale tal
   cual, y el service lo reconoce como nombre repetido.
5. No comprueba el permiso: cada alta lo hace antes de llamarla (§4.1 a §4.3),
   así un actor inactivo no recibe éxito por mandar el id de una fila propia.

El punto 2 es el que importa acá, y la revisión lo midió contra Postgres con
este esquema. Dos intentos simultáneos del mismo pedido chocan a la vez con la
clave primaria y con el índice de nombre, y la base informa una sola. Si informa
el de nombre y no se relee, el reintento muestra «Ya hay un proyecto con ese
nombre…» sobre el proyecto que la persona acaba de crear.

Un pedido resuelto por `findOwn` no deja registro de auditoría: no escribió
nada.

## 5. Contrato de lectura

```ts
export async function getProjectCatalog(actor: Actor): Promise<ProjectCatalog>;

export type ProjectCatalog = {
  readonly canCreateClient: boolean;
  readonly canCreateProject: boolean;
  /** Clientes activos del workspace, para el diálogo de proyecto. Orden alfabético. */
  readonly clients: readonly ClientView[];
  /** Proyectos que quien pide puede ver, agrupados por cliente. «Sin cliente» al final. */
  readonly groups: readonly ProjectGroupView[];
};

export type ProjectGroupView = {
  readonly client: ClientView | null;
  readonly projects: readonly ProjectView[];
};

export type ProjectView = {
  readonly id: string;
  readonly name: string;
  readonly color: PaletteKey;
  readonly isPublic: boolean;
  readonly canCreateTask: boolean;
  /** Tareas activas, en orden alfabético. */
  readonly tasks: readonly TaskView[];
};
```

**Tres consultas, dentro de un snapshot `repeatable read`**, como
`getTrackerState`:

1. los clientes activos del workspace;
2. los proyectos activos del workspace, con la fila de `project_member` de quien
   pide (`left join`);
3. las tareas activas de los proyectos activos del workspace (adelanta de PR-38
   que solo se muestran las activas).

**El armado es en memoria**, en el service, y la página se dibuja en el
servidor con el filtro ya aplicado (PR-93):

- **El filtro de acceso es `can()`.** Por cada proyecto se arma su
  `ProjectResource` y se conservan los que acepta `can(actor, "project.view",
recurso)`. No existe una segunda versión del filtro en SQL que pueda
  desalinearse.
- **Las tareas de un proyecto descartado se descartan con él**, sin salir del
  service.
- **El orden es alfabético** para los grupos y para los proyectos, sin
  distinguir mayúsculas: lo que se adelanta de PR-31. Los proyectos sin
  cliente forman el grupo «Sin cliente», al final (PR-14, PR-97).
- **Un cliente sin proyectos visibles no forma grupo** (PR-62). Aparece en la
  lista del diálogo de proyecto, que es donde hace falta elegirlo.
- **Sin proyectos visibles**, `groups` es vacío y la pantalla muestra el vacío
  de PR-85.

Hasta dónde vale traer todo el workspace está en §8. **El slice 10 decide si
reusa `getProjectCatalog`** para el selector o lee con su propia consulta; si
lee con la suya, el filtro sigue siendo `can()`.

## 6. Reparto de archivos

Rutas absolutas. **(nuevo)** marca lo que crea el slice.

### parity-analyst — hecho

`docs/parity/proyectos.md`: la tabla de §14 rehecha con todo identificador en un
solo destino, y PR-111 para el borrado de cliente rechazado. Corregido el
2026-10-03. No queda trabajo de paridad para este slice.

### backend-dev

```
/home/maxi/program/clock/src/server/db/schema.ts
/home/maxi/program/clock/drizzle/                                   (0003 y 0004, nuevas, §2)
/home/maxi/program/clock/src/server/permissions/index.ts
/home/maxi/program/clock/src/server/permissions/permissions.test.ts
/home/maxi/program/clock/src/server/action.ts                                 (nuevo)
/home/maxi/program/clock/src/lib/text.ts                                      (nuevo)
/home/maxi/program/clock/src/modules/project/palette.ts                       (nuevo)
/home/maxi/program/clock/src/modules/project/schema.ts                        (nuevo)
/home/maxi/program/clock/src/modules/project/schema.test.ts                   (nuevo)
/home/maxi/program/clock/src/modules/project/repository.ts                    (nuevo)
/home/maxi/program/clock/src/modules/project/service.ts                       (nuevo)
/home/maxi/program/clock/src/modules/project/actions.ts                       (nuevo)
/home/maxi/program/clock/src/modules/project/service.integration.test.ts      (nuevo)
/home/maxi/program/clock/src/modules/project/actions.integration.test.ts      (nuevo)
/home/maxi/program/clock/src/modules/project/schema.integration.test.ts       (nuevo)
/home/maxi/program/clock/src/test/factories.ts
/home/maxi/program/clock/CLAUDE.md
```

- **`schema.integration.test.ts`** prueba la base de forma directa, sin pasar
  por el service: las claves compuestas, los `set null` y los `cascade`, el
  borrado de cliente rechazado, los `checks`, los índices de unicidad y el
  relleno de `whoCreatesProjects`.
- **`src/test/factories.ts`** suma `seedClient`, `seedProject` y `seedTask`, con
  el archivado y la membresía de proyecto como opciones, para este slice y para
  el 10.
- **`CLAUDE.md`**: la sección «Estructura» suma `src/server/action.ts`,
  `src/lib/text.ts` y `src/server/create-once.ts` **en el mismo commit que crea
  los dos primeros**. El slice 2b no sumó el tercero.
- `src/server/create-once.ts` y `src/server/db/constraint-error.ts` son del
  slice 2b: se importan y no se tocan.

### frontend-dev

```
/home/maxi/program/clock/src/app/(app)/proyectos/page.tsx                        (nuevo)
/home/maxi/program/clock/src/components/layout/app-nav.tsx
/home/maxi/program/clock/src/hooks/use-action.ts                                 (nuevo)
/home/maxi/program/clock/src/hooks/use-new-id.ts                                 (nuevo)
/home/maxi/program/clock/src/modules/project/components/projects-screen.tsx      (nuevo)
/home/maxi/program/clock/src/modules/project/components/projects-screen.test.tsx (nuevo)
/home/maxi/program/clock/src/modules/project/components/new-client-dialog.tsx    (nuevo)
/home/maxi/program/clock/src/modules/project/components/new-project-dialog.tsx   (nuevo)
/home/maxi/program/clock/src/modules/project/components/new-task-dialog.tsx      (nuevo)
/home/maxi/program/clock/src/modules/project/components/color-field.tsx          (nuevo)
/home/maxi/program/clock/src/modules/project/components/labels.ts                (nuevo)
/home/maxi/program/clock/CLAUDE.md
```

Faltan cuatro primitivas en `src/components/ui/`: `label`, `textarea`, `select` y
`radio-group`.

- Se generan con el CLI de shadcn, tal como está configurado en
  `components.json`.
- Si el generador suma dependencias, `package.json` y `package-lock.json` entran
  en la lista de `frontend-dev` solo para ese cambio.

**`CLAUDE.md`**: la sección «Estructura» suma `src/hooks/` en el mismo commit
que crea `use-action.ts`.

**`projects-screen.test.tsx`** es el primer test de componente del repositorio:

- renderiza con `renderToStaticMarkup` de `react-dom/server`, en el entorno
  `node` que ya usa Vitest, sin agregar dependencias;
- le pasa a `ProjectsScreen` un catálogo armado a mano y un `ProjectActions` con
  **dobles escritos a mano**, funciones que devuelven un `ActionResult`, **sin
  `vi.mock`**;
- `vitest.config.ts` no cambia: el JSX ya se transforma. Lo que no se puede es
  importar `actions.ts`, que arrastra `env()`, y por eso las actions entran por
  props.

### tests-slice9

```
/home/maxi/program/clock/e2e/projects.spec.ts                                 (nuevo)
```

### Lo que no toca nadie

- `src/modules/time-entry/`
- `src/server/time/`
- `src/server/session.ts`
- `src/modules/workspace/`
- `src/server/create-once.ts` y `src/server/db/constraint-error.ts`, del slice
  2b.
- `vitest.config.ts`.
- Los documentos de slices anteriores y de correcciones, que son históricos.

### Handshake de orden

1. **Primer commit de `backend-dev`:**
   - `palette.ts`;
   - `src/server/action.ts` y `src/lib/text.ts`, con sus líneas y la de
     `src/server/create-once.ts` en `CLAUDE.md`;
   - los esquemas, tipos, vistas y `ProjectActions` de `schema.ts`;
   - las firmas de las tres actions y de `getProjectCatalog`;
   - las acciones nuevas, `ProjectResource` y el par tipado en `permissions`.
2. **`frontend-dev` arranca en paralelo** con:
   - las cuatro primitivas;
   - `color-field.tsx`, contra `palette.ts`;
   - `labels.ts`;
   - el ítem de navegación.
3. Con el primer commit en la rama, `frontend-dev` sigue con `use-action.ts`,
   `use-new-id.ts`, la pantalla, los diálogos y su test.

### Responsabilidades que no se leen en el nombre del archivo

- **`page.tsx`** solo compone:
  - la sesión;
  - `getProjectCatalog`;
  - las tres actions, importadas de `actions.ts`;
  - `<ProjectsScreen catalog={…} actions={{ createClient, createProject,
createTask }} />`.

  Es el único archivo de la pantalla que importa `actions.ts`.

- **`app-nav.tsx`** suma «Proyectos» → `/proyectos`.
- **`projects-screen.tsx` es un Server Component**: recibe `catalog` y
  `actions: ProjectActions` por props, sin estado ni efectos, y no importa
  `actions.ts` ni nada que llegue a la sesión o a la base. Dibuja:
  - el título «Proyectos»;
  - en la cabecera, el diálogo de cliente y el de proyecto, cada uno solo si su
    `canCreate…` es verdadero. **Hay una sola instancia de cada uno**: dos
    darían dos botones con el mismo nombre accesible y dos ids pendientes;
  - un encabezado por cliente;
  - por cada proyecto, su punto de color, su nombre, sus tareas y el diálogo de
    tarea si `canCreateTask`;
  - sin proyectos, el texto «Todavía no hay proyectos» (PR-85). El botón de
    crear es el «Nuevo proyecto» de la cabecera; el vacío no suma otro.
- **Solo los diálogos y los hooks son `"use client"`.** Cada diálogo recibe su
  action por prop, desde `ProjectsScreen`, y trae su propio botón de apertura.
- **`use-action.ts`** sigue el patrón de `useEntryAction`, sin importarlo:
  - guarda el último pedido entero, así «Reintentar» reenvía el mismo `id`;
  - expone el estado pendiente, el aviso y `clear`, que lo baja.
- **Los tres diálogos** son formularios con su action:
  - piden el `id` a `useNewId` en el manejador de «Guardar», antes de `run`,
    con una clave fija por diálogo (ADR 0007). **Mientras el aviso
    `unexpected` está visible, «Guardar» reusa el id pendiente**, igual que
    «Reintentar». El id se renueva con éxito, al cerrar el diálogo, que baja el
    aviso con `clear`, o cuando el aviso baja por otra causa;
  - si la persona cambió los campos antes de apretar «Guardar» otra vez, el
    servidor responde la fila del primer intento, con los datos de entonces, y
    la revalidación de `/proyectos` muestra el nombre real. Es la consecuencia
    que el ADR 0007 acepta para «Iniciar»;
  - con éxito, se cierran y devuelven el foco al botón que los abrió;
  - con error, quedan abiertos y muestran el aviso arriba del botón de guardar,
    con «Reintentar» si el error es `unexpected`.
- **Los campos de cada diálogo:**
  - **Nuevo cliente:** «Nombre», «Dirección» y «Nota».
  - **Nuevo proyecto:** «Nombre», «Cliente» (un `select` con «Sin cliente» y los
    clientes activos), «Color» y «Nota». Dejarlo sin cliente es válido (PR-14,
    PR-86, PR-97).
  - **Nueva tarea:** «Nombre». El proyecto viene fijo.
- **Crear un cliente confirma en una región `aria-live`**, con el nombre:
  «Cliente «Acme» creado». Un cliente sin proyectos no aparece en la lista
  (PR-62), y sin la confirmación el éxito no se ve ni se anuncia. La región vive
  en `new-client-dialog.tsx`, junto a su botón de apertura, y sobrevive al
  cierre del diálogo.
- **`color-field.tsx`** es un grupo de opciones con los doce colores, cada uno
  con su nombre accesible de §2.4. Si no se elige ninguno, el servidor asigna
  uno, y la ayuda del campo lo explica: «Si no elegís uno, se asigna
  automáticamente.»
- **`labels.ts`** guarda los textos de la pantalla: «Proyectos», «Nuevo
  cliente», «Nuevo proyecto», «Nueva tarea», «Sin cliente», «Todavía no hay
  proyectos», el anuncio de alta como función del nombre («Cliente «…»
  creado»), los nombres de los campos y la ayuda del color.

## 7. Criterios de aceptación

1. **Aislamiento en la base.** La base rechaza, aunque se escriba sin pasar por
   el service:
   - un proyecto con un `client_id` de otro workspace;
   - una tarea con un `project_id` de otro workspace;
   - un miembro de proyecto sin membresía en ese workspace;
   - un `created_by` sin membresía en ese workspace.
2. **Borrados en la base.**
   - Borrar un cliente deja a sus proyectos sin cliente y con su `workspace_id`
     intacto (PR-09).
   - **Borrar un cliente que tiene un proyecto con el mismo nombre que un
     proyecto sin cliente se rechaza, y nada cambia**: ni el cliente, ni sus
     proyectos (PR-111).
   - Borrar un proyecto borra sus tareas, sus miembros y sus asignados (PR-35).
   - Borrar una membresía borra sus pertenencias a proyectos y a tareas, y anula
     su `created_by` sin tocar el `workspace_id` de las filas (§3.3).
3. **Unicidad** (PR-49 … PR-51, PR-53). Los archivados cuentan.
   - Dos clientes con el mismo nombre chocan, aunque cambien las mayúsculas.
   - Dos proyectos con el mismo nombre chocan si son del mismo cliente o si
     ninguno tiene cliente. Con clientes distintos conviven.
   - Dos tareas del mismo proyecto con el mismo nombre chocan.
4. **Largos y recortes** (PR-54, PR-109).
   - En la base no entra un nombre vacío, de más de 100 caracteres o con espacios
     en los extremos sin recortar.
   - El esquema Zod recorta y rechaza con PR-75 y PR-76.
   - La dirección y la nota llegan hasta 3000 caracteres.
5. **Crear un cliente** (PR-01 … PR-03, PR-58).
   - Cualquier membresía activa, `member` incluido, crea un cliente con nombre,
     dirección y nota.
   - Un nombre repetido responde PR-78.
6. **Crear un proyecto** (PR-12 … PR-17, PR-19, PR-30, PR-58, PR-86, PR-97).
   - Cualquier membresía activa, `member` incluido, crea un proyecto público,
     sin facturable por defecto, con su nota y con o sin cliente, y queda como
     su responsable.
   - Sin cliente es válido, también en un workspace que no tiene ningún cliente
     (PR-86).
   - Sin color elegido, recibe el siguiente de la paleta.
   - Con un cliente archivado o de otro workspace, responde PR-83.
   - Con un nombre repetido para ese cliente, responde PR-77.
7. **Crear una tarea** (PR-35, PR-36, PR-40, PR-58).
   - Crean tareas el responsable del proyecto, un admin y el owner.
   - Un `member` que no es responsable recibe PR-84.
   - Un proyecto archivado, invisible o inexistente responde PR-72.
   - Un nombre repetido responde PR-79.
8. **`can()`** (PR-57, PR-60).
   - `project.view`, `project.track` y `task.create` deciden como dice §3.1, para
     los cinco roles, con proyecto público y privado, y con quien actúa como
     miembro, responsable o ninguna de las dos.
   - `team_manager` (PR-57) y `project_manager`, sin marca de responsable,
     deciden igual que `member` en las cinco.
   - Una membresía `inactive` o `invited` no puede hacer ninguna de las cinco
     acciones (PR-60).
   - **Con un recurso de otra clase, las cinco devuelven `false`**: por ejemplo,
     `task.create` y `project.view` con un recurso `workspace`, aunque quien
     actúa sea owner.
   - **Y una acción existente también**: `timeEntry.own.update` con
     `{ kind: "workspace" }`, que hoy concede, deja de hacerlo.
   - El par incorrecto no compila; el test lo fuerza con un `as` comentado.
9. **El filtro de lectura** (PR-61, PR-62, PR-93).
   - `getProjectCatalog` devuelve exactamente los proyectos que acepta
     `can(…, "project.view", …)`.
   - Con un proyecto privado sembrado, un `member` que no es miembro no lo ve, ni
     ve sus tareas, y un admin sí.
   - Un cliente cuyo único proyecto es ese privado no forma grupo para ese
     `member`, y para el admin sí (PR-62).
10. **Reintentar** (§4.4, PR-90, PR-91, PR-108).
    - Repetir un alta con el mismo `id` devuelve la misma fila sin escribir.
    - Un `id` de una fila de otra persona responde `forbidden`.
    - En `createClient` y `createProject`, una membresía `inactive` con el `id`
      de una fila propia responde `forbidden`. En `createTask` responde PR-72,
      como cualquier proyecto que no ve (§4.3).
    - Dos intentos simultáneos del mismo pedido dejan una fila, y los dos la
      responden sin el error de nombre repetido. **El desenlace es el mismo se
      crucen o no en la base**: si no se cruzan, el segundo encuentra la fila
      propia en la primera lectura.
    - Dos personas que crean a la vez el mismo nombre, con distinto `id`, dejan
      una fila; la otra recibe el mensaje de nombre repetido (PR-108).
    - **«Guardar» apretado otra vez con el aviso `unexpected` visible reusa el
      id pendiente**: deja una sola fila y no muestra el aviso de nombre
      repetido, igual que «Reintentar».
11. **`whoCreatesProjects`** (PR-59).
    - Una fila sembrada con `admins` pasa a `everyone` al ejecutar la sentencia
      de relleno de la migración escrita a mano.
    - Un workspace nuevo nace con `everyone`.
12. **La pantalla** (PR-04, PR-14, PR-97, y el orden de PR-31).
    - «Proyectos» en la navegación lleva a `/proyectos`.
    - Cada entidad se crea desde un solo lugar: «Nuevo cliente» y «Nuevo
      proyecto» en la cabecera, una vez cada uno, y «Nueva tarea» en cada
      proyecto (PR-04).
    - La pantalla muestra los grupos por cliente en orden alfabético, con «Sin
      cliente» al final.
    - Cada proyecto muestra su punto de color y sus tareas.
    - Crear un cliente anuncia «Cliente «…» creado», con el nombre del que se
      acaba de crear.
13. **El vacío** (PR-85).
    - Con un workspace sin proyectos visibles, `getProjectCatalog` devuelve
      `groups` vacío.
    - Con `groups` vacío, la pantalla muestra «Todavía no hay proyectos», y el
      botón de crear es el «Nuevo proyecto» de la cabecera, el único.
14. **Auditoría.**
    - Cada alta deja `client.create`, `project.create` o `task.create` con la
      fila creada.
    - Un reintento que se resuelve leyendo la fila propia no deja registro.
15. **La capa de action.** Las tres actions:
    - traducen el `ZodError` con su mensaje;
    - conservan el código y el mensaje del error de dominio;
    - responden PR-84 cuando falta el permiso: `createClient` y `createProject`
      con una membresía inactiva, y `createTask` con un `member` que no es
      responsable;
    - con una membresía inactiva, `createTask` responde PR-72 (§4.3);
    - revalidan `/proyectos`, también con error.

### Con qué se verifica cada criterio

| Criterio | Tipo                 | Archivo                                                   | Qué afirma                                                                                                          |
| -------- | -------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1        | integración          | `schema.integration.test.ts`                              | los cuatro rechazos de clave foránea, con inserts directos                                                          |
| 2        | integración          | `schema.integration.test.ts`                              | los dos `set null` con `workspace_id` intacto, el borrado de cliente rechazado sin cambios y las cascadas           |
| 3        | integración          | `schema.integration.test.ts`                              | cada índice con mayúsculas distintas, con y sin cliente, y con una fila archivada                                   |
| 4        | unidad + integración | `schema.test.ts`; `schema.integration.test.ts`            | los esquemas Zod; los `checks` de la base, con inserts directos                                                     |
| 5        | integración          | `service.integration.test.ts`                             | la fila creada por un `member` y el rechazo por nombre                                                              |
| 6        | integración          | `service.integration.test.ts`                             | la fila con su nota, el responsable, el color asignado, el alta en un workspace sin clientes y los dos rechazos     |
| 7        | integración          | `service.integration.test.ts`                             | los cuatro desenlaces, por rol y por estado del proyecto                                                            |
| 8        | unidad               | `permissions.test.ts`                                     | la tabla completa de las cinco acciones, los recursos de otra clase y el caso de `timeEntry.own.update`             |
| 9        | integración          | `service.integration.test.ts`                             | el catálogo contra `can()` sobre los mismos proyectos sembrados, y el cliente sin grupo de PR-62                    |
| 10       | integración + e2e    | `service.integration.test.ts`; `e2e/projects.spec.ts`     | cada caso; los simultáneos con `raceThroughBarrier`; una respuesta perdida, con «Reintentar» y con «Guardar»        |
| 11       | integración          | `schema.integration.test.ts`                              | la sentencia de relleno sobre una fila sembrada con `admins`, y el valor de un workspace nuevo                      |
| 12       | e2e                  | `e2e/projects.spec.ts`                                    | la navegación, los botones de crear, los grupos, el orden y el anuncio con el nombre                                |
| 13       | integración + unidad | `service.integration.test.ts`; `projects-screen.test.tsx` | el catálogo de un workspace sembrado sin proyectos; el marcado del vacío con `groups` vacío y dobles de las actions |
| 14       | integración          | `service.integration.test.ts`                             | los tres registros, y ninguno en el reintento                                                                       |
| 15       | integración          | `actions.integration.test.ts`                             | las traducciones, los desenlaces de la membresía inactiva y la revalidación de `/proyectos`                         |

**El criterio 10 no prueba las ramas de `createOnce`.** La rama «`23505` de otra
restricción con fila propia», que con dos intentos reales depende de qué
restricción informe la base, está cubierta en `src/server/create-once.test.ts`
del slice 2b. Acá se prueba el desenlace observable con la base de verdad.

**Los simultáneos del criterio 10 se cruzan con `raceThroughBarrier`** de
`src/test/concurrency.ts`, para el mismo `id` y para PR-108. Un `Promise.all`
suelto casi nunca cruza las transacciones. El `hold` toma la fila de
`workspace` con `for update`. Los dos intentos quedan trabados antes de terminar
su insert —uno en la comprobación de la clave hacia `workspace`, que pide esa
fila con `for key share`; el otro detrás del primero, en el índice único— y la
barrera los suelta recién entonces.

**El criterio 11 no se prueba con la base de `global-setup`**, que ya nace
migrada y sin filas viejas. El test siembra una fila de `workspace_settings` con
`admins` y ejecuta la sentencia `update` de la migración escrita a mano, leída
del archivo: la que encuentra por su etiqueta, `0004_projects_set_null_backfill`,
en `drizzle/meta/_journal.json`, y separa por `--> statement-breakpoint`.

**El vacío y el criterio 12 no dependen de la base del preview.** El e2e corre
sobre un solo workspace compartido por todos los tests, en paralelo y sobre una
base que persiste entre corridas: «un workspace sin proyectos» existe una sola
vez en la vida de esa base. Por eso el vacío se prueba en integración, con un
workspace sembrado vacío, y en el test del componente.

### Recorridos obligatorios de `e2e/projects.spec.ts`

Dueño: `tests-slice9`. Cada recorrido usa una persona propia.

**Todo nombre que crea un recorrido lleva un sufijo único por corrida**, para
que una segunda corrida sobre la misma base no choque con la primera. Las
afirmaciones de orden comparan solo los grupos y los proyectos que creó el
propio recorrido, nunca la lista entera.

1. **Criterio 12.**
   1. Entrar por «Proyectos» en la navegación, y ver un solo «Nuevo cliente» y
      un solo «Nuevo proyecto» (PR-04).
   2. Crear dos clientes, `B <sufijo>` y `A <sufijo>`, y ver el anuncio después
      de cada uno. El segundo tiene que nombrar a `A <sufijo>`: así un anuncio
      que quedó del primero no hace pasar el paso.
   3. Crear un proyecto con cada cliente y uno sin cliente.
   4. Ver que el grupo de `A <sufijo>` está antes que el de `B <sufijo>`, que los
      dos están antes que «Sin cliente», y que el proyecto sin cliente está en
      ese grupo, con su punto de color.
2. **Criterio 7.**
   1. Crear un proyecto y una tarea en él, y ver la tarea debajo del proyecto.
   2. Con otra persona `member`, ver que ese proyecto no ofrece «Nueva tarea».
3. **Criterio 6.** Crear un proyecto con un nombre que ya existe para ese
   cliente, y ver PR-77 con el diálogo todavía abierto.
4. **Criterio 10.**
   1. Perder de verdad la respuesta de «Nuevo proyecto», con `route.fetch()` y
      después `route.abort()`.
   2. Comprobar desde otra pestaña de la misma persona que el primer intento se
      aplicó, como `expectAppliedElsewhere` de `e2e/start-retry.spec.ts`. Sin
      eso, un pedido que no llegó al servidor haría pasar el recorrido sin
      probar nada: el reintento sería la primera alta.
   3. Reintentar.
   4. Ver un solo proyecto con ese nombre, sin el aviso de nombre repetido.

   **Una variante, con su propia persona**, hace los mismos pasos, pero en el 3
   aprieta «Guardar» con el aviso todavía visible, en vez de «Reintentar». Si
   el id no se reusara, el segundo pedido chocaría con el primero y mostraría
   PR-77.

## 8. Deuda conocida del slice

- **Nada de lo creado se puede corregir** hasta la fase 2: ni renombrar, ni
  archivar, ni borrar. Un error de tipeo queda hasta que llegue la
  administración.
  - Es el borde del ADR 0004, y el equipo puede moverlo si le pesa.
  - Lo más barato de adelantar es renombrar, que no toca ninguna regla de
    borrado.
- **La lectura trae todo el workspace y filtra con `can()` en memoria.** Es lo
  que mantiene una sola decisión de acceso. Vale mientras el workspace tenga
  **cientos de proyectos y miles de tareas**, no más. Pasado ese umbral, un
  filtro en SQL entra con un test que lo compare contra `can()` sobre los mismos
  datos.
- **`project.track` no tiene consumidor** hasta el slice 10.
- **La regla de los asignados de tarea no se aplica** hasta la fase 2 (P-23). La
  tabla existe vacía, y toda tarea se comporta como «cualquiera».
- **PR-40 está sin verificar** (P-33), y con él la parte de PR-58 sobre tareas.
  Este contrato decide que crean tareas el owner, los admins y el responsable
  del proyecto, en línea con PR-56. Si el workspace del equipo muestra que
  cualquier miembro crea tareas, cambian una fila de `can()` y un criterio.
- **Dos borrados que la base rechaza** esperan a la fase 2: el de un proyecto
  con tareas usadas en entradas, que se hace en dos sentencias (§2.3), y el de
  un cliente con un nombre de proyecto repetido, que se traduce al mensaje de
  PR-111 (§2.2).
- **`time-entry` sigue con sus copias** de `ActionResult`, `failure`, `handle`,
  el `refine` del carácter nulo, `useEntryAction` y `useNewEntryId` hasta el
  próximo slice que toque sus actions (mapa, §5).
- **La versión de Postgres de Neon** tiene que ser 15 o posterior (§0).
