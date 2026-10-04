# Fase 1, slice 7: perfil

Contrato del séptimo slice vertical de la fase 1. Crea el módulo `profile` en
`src/modules/profile/` y la pantalla `/perfil`, y cambia de dónde leen la zona
horaria y los formatos el módulo `time-entry` y la pantalla `/`.

- **Fuente de los comportamientos:** `docs/parity/perfil.md` (PF-nn) y, en
  `docs/parity/time-tracker.md`, TT-02, TT-20 y TT-44, que el perfil reabre.
- **Lugar en el plan:** [mapa de la fase 1](fase1-mapa.md), slice 7. Cierra
  P-13 del rastreador.
- **Decisiones de arquitectura asociadas:**
  - [ADR propuesto, un solo juego de formatos en el servidor y en el cliente](../adr/XXXX-un-solo-juego-de-formatos.md):
    nace acá. Fija cómo llegan las preferencias a lo que se formatea en el
    cliente.
  - [ADR 0005, la hora de pared viaja como hora de pared](../adr/0005-hora-de-pared-en-la-entrada-manual.md):
    no cambia. La hora sigue viajando como `HH:mm` de 24 h aunque la persona
    vea 12 h; lo único distinto es qué zona recibe `instantFromLocal`, que es lo
    que ese ADR anticipó.
  - [ADR 0006](../adr/0006-conservar-el-extremo-sin-cambios.md): no cambia. La
    conservación compara horas canónicas, no rótulos.

El contrato da por tomadas estas decisiones del equipo (`perfil.md`):

- Los predeterminados de P-03: zona `America/Argentina/Buenos_Aires`, fecha
  `dd/MM/yyyy`, hora de 24 h, semana desde el lunes, duración compacta.
- El primer día de la semana es por persona, va en `membership` y lo edita un
  admin desde la pantalla de equipo (PF-01, PF-17).
- Las preferencias van en una tabla propia, nunca como columnas de `user`
  (PF-03).
- `workspace.timezone` se queda con un solo trabajo: el día de los trabajos de
  cron (PF-05, P-08).
- El contador del timer sigue en `h:mm:ss` (PF-22, P-06).
- El formato de duración es del workspace; el decimal queda fuera (PF-02,
  PF-20, P-01).
- La foto sale de Google en solo lectura (PF-09, P-05).

## 0. Precondición de arranque

**Arranca con los slices 5 y 9 mergeados.** Los dos están en `main`.

- **Del 5:** `weekStartOf` de `src/modules/workspace/service.ts`,
  `TrackerWorkspace` y `trackerWorkspaceOf` de `src/modules/time-entry/service.ts`,
  y `weekKeyLabel` de `src/server/time`. El §2 de su contrato le fija a este
  slice tres restricciones, que se cumplen tal cual: `membership.week_start` no
  cambia, se lee solo con `weekStartOf`, y la zona entra al rastreador solo por
  `trackerWorkspaceOf`.
- **Del 9:** las piezas compartidas de las actions —`handle`, `ActionResult` y
  `DomainError` de `src/server/action.ts`, `useAction` y `retryHandlerOf` de
  `src/hooks/use-action.ts`—, las primitivas `select`, `label` y `radio-group`
  de `src/components/ui/`, y el test de componente con `renderToStaticMarkup`
  de `projects-screen.test.tsx`. El módulo `profile` nace usándolas.

**Los contratos del 6 y del 10 se escriben en paralelo con este.** Lo que se
cruza:

- **La migración.** La de este slice es la `0005` sobre `main`. El 10 también
  trae una. La que mergee segunda se genera de nuevo después del rebase, y
  `drizzle/meta/_journal.json` no se edita a mano.
- **Las firmas que este slice cambia y que el 6 y el 10 usan**: `toView` y
  `TimeEntryView` (§5.4), `parseClockInput`, `dayKeyLabel` y `weekKeyLabel`
  (§5.1), y `withStart`, `withEnd` y `fromView` de `time-draft.ts` (§6). El
  slice que mergee segundo se adapta a las del primero; los contratos ya
  escritos no se reescriben.
- **Los archivos compartidos**: `entry-row.tsx`, `entry-times-editor.tsx`,
  `manual-bar.tsx`, `time-draft.ts` y `time-entry/service.ts`.

**Este slice no toca `src/modules/time-entry/actions.ts`.** Las actions ya
pasan `trackerWorkspaceOf(session)` desde el slice 5, y `SessionContext` sigue
cumpliendo el tipo que la función pide (§5.3). Por eso no hereda la deuda del
mapa (§5) de migrar `time-entry` a las piezas compartidas: la hereda el próximo
slice que toque ese archivo.

## 1. Alcance

Entran:

- **Las preferencias de hora y fecha de la persona**: zona horaria (PF-11),
  formato de fecha (PF-12) y formato de hora (PF-13), en una tabla propia
  colgada del usuario (PF-03), con los predeterminados de P-03 (§2).
- **Los campos de hora en 12 h** (PF-14): con 12 h aceptan `am` y `pm`, y
  muestran lo que aceptan. TT-20 pasa a depender del formato.
- **Un solo punto de lectura** de la zona, los formatos y el primer día de la
  semana: `timeSettingsOf` en el servidor y `useDisplayFormats` en el cliente
  (§5), del que `trackerWorkspaceOf` pasa a ser un consumidor más.
- **La pantalla `/perfil`** (PF-30, PF-31, PF-37):
  - identidad en solo lectura: nombre, foto y correo (PF-06, PF-09);
  - los tres controles, que guardan al cambiar (PF-32, PF-36);
  - el primer día de la semana en solo lectura, con la nota de que lo
    administra el equipo (PF-01, PF-16);
  - el formato de duración en solo lectura, con la nota de que es del
    workspace (PF-02);
  - solo lectura con el aviso de TT-92 para una membresía no activa (PF-46).
- **El menú de usuario** con la foto o las iniciales y el enlace al perfil
  (PF-10, PF-30, PF-44).
- **Una acción de permiso nueva**, `profile.own.update` (PF-34, §3).

Entran por arrastre, verificándose por el camino nuevo:

- **PF-04**: un cambio solo afecta a quien lo hace. Dos personas en zonas
  distintas ven la misma entrada en horas y días distintos.
- **PF-33**: el cambio se ve en toda la aplicación sin recargar.
- **PF-38 y PF-39**: cambiar la zona no toca ningún instante; una entrada puede
  cambiar de día, y un timer corriendo sigue con el mismo transcurrido.
- **PF-43**: con la zona de la persona vale lo mismo que TT-97 y el ADR 0005.
- **TT-02 y TT-44**: la zona, la hora y la fecha de la lista pasan a ser las de
  la persona.

### Lo que el slice decide y que la paridad tiene que registrar

- **Los predeterminados no se guardan: se resuelven.** Una persona que nunca
  tocó una preferencia no tiene fila, o tiene la columna en nulo, y ve el
  predeterminado de P-03 (§2). El de la zona es el **valor**
  `America/Argentina/Buenos_Aires`, no un vínculo con `workspace.timezone`: si
  la zona del workspace cambia por el cron, nadie se mueve de día (PF-05).
- **El formato de hora en 12 h se muestra `h:mm AM` / `h:mm PM`**: `1:05 PM`,
  `12:00 AM`. Lista de entradas aceptadas en §5.1.
- **Cada formato de fecha tiene una forma corta sin año**, que es la que usan
  los rótulos de día y de semana del año en curso (§5.1).
- **El aviso de PF-46** usa el título de TT-92 y una línea propia del perfil
  (§6, `labels.ts`).
- **La zona guardada que el entorno deja de listar sigue valiendo** mientras el
  entorno la sepa convertir, y aparece entre las opciones (§5.6).

**Lo registra `parity-analyst` antes del merge** (§6), junto con las
correcciones de §10 de `perfil.md` que lista la tabla de consecuencias.

### Queda afuera

- **El nombre editable (PF-07, PF-08, PF-45) y el tema (PF-23, PF-24).** Se
  proponen como un slice 7b, «Nombre y tema», que no bloquea al 8 ni al 13: el
  calendario y el timesheet esperan la zona y los formatos, no el nombre ni el
  tema. El 7b agrega sus columnas a `user_preference` con su propia migración
  de expansión (§2.4). Mientras tanto la pantalla muestra el nombre que llegó
  de Google, en solo lectura. **Decisión abierta para el equipo**: si se
  prefiere un solo slice, el 7b se suma a este contrato sin cambiar nada de lo
  escrito acá.
- **El formato de duración como dato** (PF-20, PF-21). Es un ajuste del
  workspace sin pantalla hasta la de ajustes de la fase 2, y hoy existe un solo
  valor, el compacto. `formatDuration` no cambia, y la pantalla lo muestra como
  texto fijo. Cuando exista el ajuste, entra por `DisplayFormats` y por el
  mismo punto de lectura (§5.2, §8).
- **Cambiar el primer día de la semana** (PF-17): es de la pantalla de equipo,
  con `team.manage`, que espera la deuda de `ensureWorkspaceContext` del mapa
  (§5).
- **Lo que `perfil.md` marca `fuera de alcance`**: PF-15, PF-19 y PF-25 a
  PF-29.
- **El primer día de la semana en el calendario emergente del selector de
  fecha**, que hoy sale del idioma (§8).

### Consecuencias sobre código ya entregado

| Archivo                                                 | Qué cambia                                                                                                                         | Qué hay que volver a probar                                       |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `src/server/db/schema.ts`                               | La tabla `user_preference` (§2).                                                                                                   | —                                                                 |
| `src/server/time/index.ts`                              | Los tipos de formato, `clockLabel`, `formatDayKey`, las zonas; `dayKeyLabel`, `dayLabel`, `weekKeyLabel` y `parseClockInput` reciben el formato (§5.1). `formatClock` no cambia. | `time.test.ts` entero                                             |
| `src/server/session.ts`                                 | `SessionContext` suma `preferences` (§5.3).                                                                                        | Toda action, por los arneses de `actions.integration.test.ts`     |
| `src/server/action.ts`                                  | `handle` acepta un destino de revalidación de layout (§4.3).                                                                       | Los `actions.integration.test.ts` de `project` y `time-entry`     |
| `src/server/permissions/index.ts`                       | `profile.own.update` y `ProfileResource` (§3).                                                                                     | `permissions.test.ts` entero                                      |
| `src/modules/time-entry/service.ts`                     | `trackerWorkspaceOf` sale de `timeSettingsOf`; `TrackerWorkspace` suma `formats`; `toView`, `buildDays` y `buildWeeks` rotulan con los formatos (§5.4). | `service.integration.test.ts` entero                              |
| `src/modules/time-entry/schema.ts`                      | `timeEntryView` suma `startClock` y `endClock`; los comentarios que dicen «del workspace» pasan a «de la persona».                | `schema.test.ts`                                                  |
| Los tests de integración de `time-entry`                | Los `TrackerWorkspace` armados a mano suman `formats`; los casos que siembran un workspace en Madrid pasan a sembrar la zona de la persona (§6). | Los cuatro archivos                                               |
| `src/modules/time-entry/components/time-draft.ts`       | `fromView` lee `startClock` y `endClock`; `withStart` y `withEnd` reciben el `TimeFormat`.                                         | `time-draft.test.ts`                                              |
| `entry-row.tsx`                                         | El rótulo del trío en edición o en vuelo sale de `clockLabel`.                                                                     | TT-54, TT-55, TT-110                                              |
| `entry-times-editor.tsx`, `manual-bar.tsx`, `running-start-editor.tsx` | Los campos de hora muestran `clockLabel` y aceptan según el formato.                                                               | TT-18 a TT-21, TT-28                                              |
| `clock-field.tsx`                                       | Con 12 h, el teclado del campo deja escribir letras.                                                                               | TT-21                                                             |
| `date-field.tsx`                                        | El rótulo sale de `dayKeyLabel` con el formato de `useDisplayFormats`.                                                             | TT-44, TT-56                                                      |
| `src/app/(app)/layout.tsx`                              | El proveedor de formatos; `UserMenu` recibe la foto.                                                                               | —                                                                 |
| `src/components/layout/user-menu.tsx`                   | Foto o iniciales, desplegable y enlace al perfil.                                                                                  | Salir                                                             |
| `docs/parity/perfil.md` y `docs/parity/time-tracker.md` | Lo de «Lo que el slice decide»; las filas de §10 de `perfil.md` que este contrato corrige (§6).                                    | —                                                                 |

**El slice 9 no tiene nada que adaptar.** `/proyectos` no muestra ninguna
fecha, hora ni duración: dibuja nombres, colores y tareas. Lo único sensible al
idioma es el orden alfabético (`Intl.Collator("es")` en
`src/modules/project/service.ts`), que no es una preferencia.

**Lo que no se toca.** La base guarda instantes en UTC y ningún dato se migra.
`workspace.timezone` se queda para el cron, que no cambia (PF-05).
`formatElapsed` y `elapsed-counter.tsx` se quedan (PF-22). `formatDuration`,
`use-group-total.ts`, `day-group.tsx` y `week-group.tsx` no cambian: los
totales dependen del formato de duración, que no entra (§1, «Queda afuera»).
`time-entry/actions.ts` no cambia (§0).

## 2. Cambios de esquema

**Una tabla nueva, `user_preference`**, en una migración generada con
`npm run db:generate -- --name=user_preference`, que queda como
`drizzle/0005_user_preference.sql` con su snapshot.

```ts
// src/server/db/schema.ts
/**
 * Preferencias de la persona, de la cuenta y no del workspace (PF-03). Nunca
 * columnas de `user`: esa tabla la regenera `npm run auth:schema`. Una fila
 * que falta, o una columna en nulo, es «sin elegir»: vale el predeterminado,
 * que resuelve `resolvePreferences` de `src/modules/profile/service.ts`.
 */
export const userPreference = pgTable(
  "user_preference",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Zona IANA. La lista válida es la del entorno, no una tabla (PF-35). */
    timezone: text("timezone"),
    timeFormat: text("time_format"),
    dateFormat: text("date_format"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check("user_preference_timezone_len", sql`char_length(${table.timezone}) between 1 and 64`),
    check("user_preference_time_format_known", sql`${table.timeFormat} in ('24h', '12h')`),
    check(
      "user_preference_date_format_known",
      sql`${table.dateFormat} in ('dd/MM/yyyy', 'dd-MM-yyyy', 'yyyy-MM-dd', 'MM/dd/yyyy')`,
    ),
  ],
);
```

El SQL que tiene que salir del generador, en sustancia, y contra el que se
revisa:

```sql
CREATE TABLE "user_preference" (
	"user_id" text PRIMARY KEY NOT NULL,
	"timezone" text,
	"time_format" text,
	"date_format" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preference_timezone_len" CHECK (char_length("user_preference"."timezone") between 1 and 64),
	CONSTRAINT "user_preference_time_format_known" CHECK ("user_preference"."time_format" in ('24h', '12h')),
	CONSTRAINT "user_preference_date_format_known" CHECK ("user_preference"."date_format" in ('dd/MM/yyyy', 'dd-MM-yyyy', 'yyyy-MM-dd', 'MM/dd/yyyy'))
);
--> statement-breakpoint
ALTER TABLE "user_preference" ADD CONSTRAINT "…" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
```

Las listas de los dos `check` repiten `TIME_FORMATS` y `DATE_FORMATS` de
`src/server/time` (§5.1), como el `check` de `project.color` repite la paleta.

### 2.1 Por qué así

- **Colgada del usuario y no de la membresía.** PF-03: las preferencias son de
  la cuenta y valen en cualquier workspace; solo el primer día de la semana es
  por membresía, y ya vive en `membership` (slice 5). Cuesta lo mismo ahora y
  evita una migración si algún día hay dos workspaces.
- **Sin `workspace_id`, y es la excepción a la regla de las consultas.** La
  convención pide que toda consulta filtre por el `workspace_id` de la sesión.
  Esta tabla no tiene workspace, por PF-03: el repository filtra por el
  `user_id` de la sesión, nunca por uno que llegue en la entrada. Ninguna
  firma del repository recibe un `userId` que no salga de `actor.userId`.
- **Columnas nulas y fila opcional, con los predeterminados en el código.**
  Las alternativas eran dos:
  - **Columnas `not null` con valor por omisión en la base y una fila por
    persona.** Obliga a rellenar las cuentas que ya existen y a crear la fila
    en el primer ingreso. En la ventana entre aplicar la migración y desplegar,
    el código viejo crea membresías sin fila, así que el lector igual tendría
    que tolerar la fila que falta: los predeterminados vivirían en dos lugares.
  - **Lo elegido**: la fila nace con el primer cambio, cada columna en nulo es
    «sin elegir», y **un solo lugar** aplica los predeterminados,
    `resolvePreferences` (§5.2). No hay relleno ni carrera de despliegue.
- **El predeterminado de la zona es un valor, no `workspace.timezone`.** P-03
  dice «la del workspace» y PF-11 nombra el valor entre paréntesis. Leerlo como
  vínculo le devolvería a `workspace.timezone` el segundo trabajo que PF-05 le
  sacó: cambiar la zona del cron movería de día a todo el que no eligió. Hoy
  los dos coinciden en `America/Argentina/Buenos_Aires`, así que desplegar no
  mueve a nadie (criterio 3). **Queda para confirmar por el equipo** (§8).
- **`text` con `check`, y no un enum de Postgres**, como `project.color`: los
  valores se usan tal cual en el código, y sumar un formato es cambiar un
  `check` y no migrar un tipo.
- **La zona no tiene `check` de lista.** La lista válida es la del entorno
  (`Intl.supportedValuesOf("timeZone")`, PF-35), que cambia con la versión de
  Node; la base solo acota el largo. El nombre IANA más largo tiene 32
  caracteres.

### 2.2 Sin tiempo de caída

La migración solo crea una tabla. El código viejo no la nombra, así que se
aplica antes del despliegue sin coordinar nada. Ninguna fila existente se toca.

### 2.3 La reversión

drizzle-kit no genera migraciones de bajada. La reversión es este SQL, a mano:

```sql
DROP TABLE "user_preference";
DELETE FROM "drizzle"."__drizzle_migrations"
  WHERE "created_at" = <el `when` de 0005 en drizzle/meta/_journal.json>;
```

**Solo es segura con el código anterior a este slice ya desplegado**: el de
este slice lee la tabla en cada pedido con sesión (§5.3), así que borrarla con
ese código en producción hace fallar todas las pantallas. Se pierden las
preferencias guardadas; nadie pierde horas. La segunda sentencia es la misma
que en los slices 5 y 9: sin ella, un despliegue posterior no reaplicaría la
migración.

### 2.4 Restricción para el slice 7b

- **El nombre editado va en `user_preference`, no en `user.name`.** Una columna
  `display_name text null`: nulo es «usa el de Google». Así el 7b cumple PF-08
  y PF-45 a la vez: Better Auth sigue escribiendo `user.name` y, si se le activa
  `overrideUserInfoOnSignIn`, lo actualiza en cada ingreso, sin pisar nunca el
  editado. Hoy esa opción no está puesta (`src/server/auth.ts`), y por eso un
  cambio de nombre o de foto en Google no llega nunca (§8).
- **El tema va en `user_preference`**, `theme text null` con `check`, nulo es
  «seguir al sistema» (PF-23).
- Las dos columnas entran con la migración del 7b, nulas, sin relleno. Las
  resuelve `resolvePreferences`, como las de este slice.

## 3. Permisos

### 3.1 La acción nueva

| Acción               | Recurso   | Roles en la tabla | Regla además del rol                                 |
| -------------------- | --------- | ----------------- | ---------------------------------------------------- |
| `profile.own.update` | `profile` | los cinco         | el `userId` del recurso es quien actúa (PF-34)       |

```ts
// src/server/permissions/index.ts
export type ProfileResource = {
  readonly kind: "profile";
  readonly workspaceId: string;
  /** El dueño del perfil, no quien actúa. */
  readonly userId: string;
};

// en ResourceByAction
"profile.own.update": ProfileResource;
// en resourceKinds
"profile.own.update": ["profile"],
// en allowedRoles
"profile.own.update": everyone,
```

- **La regla del dueño es la de las acciones `.own`**, extendida a la clase
  nueva: `can()` niega cuando `resource.kind` es `timeEntry` o `profile` y
  `resource.userId` no es `actor.userId`. Editar el perfil de otra persona es
  de la pantalla de equipo, con `team.manage` (PF-17), y no entra.
- **El recurso lleva `workspaceId` aunque las preferencias sean de la cuenta.**
  La decisión pasa por la membresía con que se actúa: `can()` corta primero por
  su estado, y una membresía no activa no edita nada (PF-34, PF-46). Es la
  misma razón por la que `timeEntry` lleva el workspace.
- **El recurso lo arma una sola función**,
  `ownProfileResource(actor)` de `src/modules/profile/service.ts`, como
  `ownTimeEntryResource` en `time-entry`.
- **Leer el perfil no tiene acción**: cualquier sesión ve el suyo, y la
  pantalla usa `can(actor, "profile.own.update", …)` para decidir si los
  controles editan (`canEdit`, §5.5).
- **El primer día de la semana no suma ninguna acción**: se muestra, no se
  edita (§1).

## 4. Contrato de las server actions

Una action en `src/modules/profile/actions.ts`, con el recorrido de siempre:
sesión, Zod, `can()`, service en una transacción con audit log, y revalidación.

**Ningún archivo de `components/` importa `actions.ts`.** La action llega a la
pantalla por props desde `page.tsx`, como en el slice 9.

### 4.1 Los tipos

```ts
// src/modules/profile/schema.ts
export const profileMessages = {
  timeZoneUnknown: "Esa zona horaria no existe.",
  formatUnavailable: "Ese formato no está disponible.",
  forbidden: "No tenés permiso para hacer esto.",
  unexpected: "No se pudo guardar. Revisá la conexión y volvé a intentar.",
} as const;

/** Las preferencias ya resueltas: nunca hay un nulo (PF-37). */
export type Preferences = {
  readonly timezone: string;
  readonly timeFormat: TimeFormat;
  readonly dateFormat: DateFormat;
};

/** Una preferencia por pedido: cada control guarda solo (PF-32). */
export const updatePreferenceInput = z.discriminatedUnion(
  "key",
  [
    z.object({
      key: z.literal("timezone"),
      value: z.string().refine(isSupportedTimeZone, profileMessages.timeZoneUnknown),
    }),
    z.object({
      key: z.literal("timeFormat"),
      value: z.enum(TIME_FORMATS, { error: profileMessages.formatUnavailable }),
    }),
    z.object({
      key: z.literal("dateFormat"),
      value: z.enum(DATE_FORMATS, { error: profileMessages.formatUnavailable }),
    }),
  ],
  { error: profileMessages.formatUnavailable },
);

export type UpdatePreferenceInput = z.infer<typeof updatePreferenceInput>;
export type UpdatePreferenceResult = { readonly preferences: Preferences };

/** La action, como la recibe la pantalla por props desde `page.tsx`. */
export type ProfileActions = {
  readonly updatePreference: (
    input: UpdatePreferenceInput,
  ) => Promise<ActionResult<UpdatePreferenceResult>>;
};
```

- **Una clave por pedido, y no el formulario entero.** Cada control guarda al
  cambiar (PF-32). Con el formulario entero, dos controles cambiados seguidos
  desde dos pestañas se pisarían; con una clave, cada pedido escribe solo su
  columna.
- **Una clave desconocida responde `formatUnavailable`.** Solo la produce un
  pedido armado a mano, y es el mensaje que más se le acerca: lo pedido no
  está disponible.
- `schema.ts` no importa nada del servidor salvo el tipo `ActionResult`; los
  tipos de formato y `isSupportedTimeZone` vienen de `src/server/time`, que el
  navegador ya carga.

Los códigos son `validation`, `forbidden` y `unexpected`. No hay `not_found`:
la fila que falta es «sin elegir», no un error.

### 4.2 `updatePreference`: PF-11 a PF-13, PF-32, PF-34, PF-35

```ts
// src/modules/profile/service.ts
export async function updatePreference(
  actor: Actor,
  input: UpdatePreferenceInput,
): Promise<UpdatePreferenceResult>;
```

1. `assertCan(actor, "profile.own.update", ownProfileResource(actor))`. Sin
   permiso, `ForbiddenError`, que `failure` traduce a `forbidden` con el texto
   de TT-79.
2. En una transacción:
   1. lee la fila de `actor.userId` con `for update`; si no hay, el valor
      anterior es nulo;
   2. **si el valor guardado es el pedido, no escribe ni deja registro**:
      reintentar un cambio que ya se aplicó es un éxito sin efecto (TT-89). Un
      nulo no es igual a su predeterminado: elegir explícitamente el valor por
      omisión sí escribe, porque deja de seguir al predeterminado;
   3. si no, `insert … on conflict (user_id) do update` **solo de la columna
      de la clave**: las otras dos no se nombran en el `set`;
   4. `recordAudit` con `profile.updatePreference`, entidad `user_preference`,
      `entityId` igual a `actor.userId`, `workspaceId` igual a
      `actor.workspaceId`, y `previousValue` / `nextValue` con la clave y los
      valores crudos (`{ timezone: null }` → `{ timezone: "Asia/Tokyo" }`).
3. Devuelve `{ preferences: resolvePreferences(fila) }` (§5.2).

**Es seguro de reintentar sin el ADR 0007**: no es un alta con id, y escribir
dos veces el mismo valor deja el mismo estado. Dos pedidos simultáneos de la
misma persona con claves distintas dejan las dos columnas escritas: el `for
update` y el `on conflict` los ponen en fila sobre la misma clave primaria.

### 4.3 La revalidación y `handle`

**La action revalida todo el árbol**, `revalidatePath("/", "layout")`, también
con error. PF-33 pide que el rastreador y cualquier otra pantalla pasen al
valor nuevo, y los formatos llegan al cliente por el layout (§5.5): revalidar
solo `/perfil` dejaría el layout con los formatos viejos.

`handle` de `src/server/action.ts` hoy recibe rutas sueltas. Pasa a aceptar
también el destino con tipo, sin cambiar ningún llamado existente:

```ts
// src/server/action.ts
export type RevalidationTarget =
  | string
  | { readonly path: string; readonly type: "layout" | "page" };

// handle(work, { paths: readonly RevalidationTarget[], messages })
```

Una cadena sigue llamando a `revalidatePath(path)`; un objeto llama a
`revalidatePath(path, type)`. Los arneses de `actions.integration.test.ts`
registran el par.

```ts
// src/modules/profile/actions.ts
const options = {
  paths: [{ path: "/", type: "layout" }],
  messages: { forbidden: profileMessages.forbidden, unexpected: profileMessages.unexpected },
} as const;

export async function updatePreference(
  input: UpdatePreferenceInput,
): Promise<ActionResult<UpdatePreferenceResult>> {
  return handle(
    async (session) =>
      service.updatePreference(session.actor, updatePreferenceInput.parse(input)),
    options,
  );
}
```

## 5. Contrato de lectura

La regla de fondo, que el ADR propuesto fija y este slice aplica por primera
vez:

- **Lo que depende de la zona se resuelve en el servidor**: de un instante, su
  día (`dayKey`) y su hora canónica (`formatClock`, `HH:mm` de 24 h). Como hasta
  ahora.
- **Lo que depende del formato es una función pura de `src/server/time`** que
  recibe un valor canónico y los formatos de quien mira. La llama el servidor
  para los rótulos que viajan en las vistas, y el cliente para lo que arma él:
  un borrador, un campo de hora, el rótulo del selector de fecha. Las dos
  puntas usan la misma función, así que no hay dos implementaciones de un
  formato.
- **Las preferencias se leen en un solo lugar**: `timeSettingsOf` en el
  servidor; `useDisplayFormats` en el cliente, alimentado por el layout desde
  `timeSettingsOf`. Ningún consumidor lee `context.preferences`,
  `membership.weekStart` ni `workspace.timezone` para mostrar algo.

### 5.1 Los formatos en `src/server/time`

```ts
// src/server/time/index.ts
export const TIME_FORMATS = ["24h", "12h"] as const;
export type TimeFormat = (typeof TIME_FORMATS)[number];

export const DATE_FORMATS = ["dd/MM/yyyy", "dd-MM-yyyy", "yyyy-MM-dd", "MM/dd/yyyy"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

/** Cómo ve las horas quien mira (PF-12, PF-13). */
export type DisplayFormats = { readonly time: TimeFormat; readonly date: DateFormat };

/** Todo lo que hace falta para cortar y rotular el tiempo de una persona. */
export type TimeSettings = {
  readonly timezone: string;
  readonly weekStart: WeekStart;
  readonly formats: DisplayFormats;
};

/** Una hora canónica "HH:mm" como se muestra: "13:05" o "1:05 PM". */
export function clockLabel(clock: string, format: TimeFormat): string;

/** Una fecha civil en el formato de la persona: "03/10/2026", o "03/10" sin año. */
export function formatDayKey(dayKey: string, format: DateFormat, withYear: boolean): string;

// Cambian de firma: suman el formato al final.
export function dayKeyLabel(dayKey: string, todayKey: string, format: DateFormat): string;
export function dayLabel(instant: Date, now: Date, timeZone: string, format: DateFormat): string;
export function weekKeyLabel(
  weekStart: string,
  todayKey: string,
  weekStartsOn: WeekStart,
  format: DateFormat,
): string;
export function parseClockInput(text: string, format: TimeFormat): string | null;

/** Las zonas IANA que ofrece el entorno, en orden alfabético. */
export function supportedTimeZones(): readonly string[];
/** La zona está en esa lista. Es la validación de la entrada (PF-35). */
export function isSupportedTimeZone(value: string): boolean;
/** El entorno sabe convertir con esa zona, esté o no en la lista. */
export function isUsableTimeZone(value: string): boolean;
/** El desplazamiento de la zona en ese instante: "UTC−03:00", "UTC+05:45". */
export function utcOffsetLabel(timeZone: string, at: Date): string;
```

**`formatClock` no cambia.** Es la hora canónica: la usan el trío de una fila,
la conservación del ADR 0006 (`labelOf`, `sameLabel`, `hasEditableTimes`) y el
borrador de la barra (`reset`). Si pasara a depender del formato, el trío
viajaría como `1:05 PM` y la action lo rechazaría. La hora que se muestra es
`clockLabel(formatClock(instant, zona), formato)`. La fila de `formatClock` en
§10 de `perfil.md` se corrige (§6).

**La hora en 12 h** (PF-13). Decisión nuestra, sin verificar:

| Canónica | 24 h    | 12 h       |
| -------- | ------- | ---------- |
| `00:00`  | `00:00` | `12:00 AM` |
| `00:59`  | `00:59` | `12:59 AM` |
| `09:05`  | `09:05` | `9:05 AM`  |
| `12:00`  | `12:00` | `12:00 PM` |
| `13:05`  | `13:05` | `1:05 PM`  |
| `23:59`  | `23:59` | `11:59 PM` |

**Lo que aceptan los campos** (PF-14, TT-20). Sin sufijo, la regla de hoy en
los dos formatos. Con sufijo —`a`, `am`, `p`, `pm`, en mayúsculas o
minúsculas, con o sin puntos y con o sin espacio antes— solo con 12 h, y la
hora tiene que estar entre 1 y 12:

| Texto     | 24 h    | 12 h    |
| --------- | ------- | ------- |
| `1`       | `01:00` | `01:00` |
| `0345`    | `03:45` | `03:45` |
| `9.45`    | `09:45` | `09:45` |
| `13:00`   | `13:00` | `13:00` |
| `1pm`     | `null`  | `13:00` |
| `1 PM`    | `null`  | `13:00` |
| `1p`      | `null`  | `13:00` |
| `1 p.m.`  | `null`  | `13:00` |
| `1:30pm`  | `null`  | `13:30` |
| `130pm`   | `null`  | `13:30` |
| `1:05 PM` | `null`  | `13:05` |
| `12am`    | `null`  | `00:00` |
| `12pm`    | `null`  | `12:00` |
| `9am`     | `null`  | `09:00` |
| `13pm`    | `null`  | `null`  |
| `0am`     | `null`  | `null`  |

**Lo que el campo muestra, el campo lo acepta**: para los 1440 minutos del
día y los dos formatos, `parseClockInput(clockLabel(c, f), f) === c`. Sin esa
propiedad, salir de un campo de 12 h sin tocarlo, o tocando un dígito,
rechazaría su propio valor.

**Las fechas** (PF-12). La forma corta, sin año, es la que usan los rótulos del
año en curso; la larga, los de otro año, igual que hoy. Decisión nuestra, sin
verificar:

| Formato      | Con año      | Sin año |
| ------------ | ------------ | ------- |
| `dd/MM/yyyy` | `03/10/2026` | `03/10` |
| `dd-MM-yyyy` | `03-10-2026` | `03-10` |
| `yyyy-MM-dd` | `2026-10-03` | `10-03` |
| `MM/dd/yyyy` | `10/03/2026` | `10/03` |

`dayKeyLabel` sigue dando «Hoy» y «Ayer», y para el resto el día de la semana
abreviado y la fecha: `sáb, 03/10`, `sáb, 10-03`. `weekKeyLabel` sigue dando
«Esta semana» y «Semana anterior», y el rango con las dos puntas en la misma
forma: `28/09 – 04/10`, y las dos con año si alguna es de otro año.

**Con los predeterminados, todo rótulo sale idéntico al de hoy** (criterio 3):
`dd/MM/yyyy` y `24h` reproducen `EEE, dd/MM`, `dd/MM` y `HH:mm`. Es lo que hace
que desplegar el slice no cambie nada para quien no toque su perfil.

### 5.2 Las preferencias resueltas

```ts
// src/modules/profile/service.ts
/** Lo que pide quien muestra horas: la sesión, con las preferencias resueltas. */
export type ProfileContext = WorkspaceContext & { readonly preferences: Preferences };

/** Los predeterminados de P-03. El de la zona es un valor, no `workspace.timezone` (§2.1). */
export const PREFERENCE_DEFAULTS: Preferences = {
  timezone: "America/Argentina/Buenos_Aires",
  timeFormat: "24h",
  dateFormat: "dd/MM/yyyy",
};

/** Único lugar que aplica los predeterminados. */
export function resolvePreferences(row: UserPreferenceRow | undefined): Preferences;

/** Las preferencias de quien pide, ya resueltas. Una consulta por clave primaria. */
export async function preferencesOf(userId: string): Promise<Preferences>;
```

`resolvePreferences`, columna por columna:

- **Nulo, o fila que falta**: el predeterminado.
- **Una zona que el entorno no sabe convertir** (`!isUsableTimeZone`): el
  predeterminado. No es un dato corrupto sino un cambio del entorno —una
  versión de Node sin esa zona—, y lanzar dejaría a la persona sin ninguna
  pantalla.
- **Una zona que el entorno convierte aunque ya no la liste** —una zona
  renombrada, que queda como alias—: se usa tal cual. Caer al predeterminado
  movería a la persona de día sin que haya hecho nada.
- **Un formato fuera de `TIME_FORMATS` o de `DATE_FORMATS`**: lanza. El `check`
  de la base lo impide, y la función no lo da por sentado, igual que
  `weekStartOf` con el primer día.

### 5.3 La sesión trae las preferencias

```ts
// src/server/session.ts
export type SessionContext = ProfileContext & { readonly user: CurrentUser };
```

`currentSession` lee el contexto del workspace y las preferencias **en
paralelo**, con `Promise.all` sobre `ensureWorkspaceContext` y `preferencesOf`:
son dos lecturas independientes, fuera de toda transacción común. Así ninguna
action vuelve a buscar las preferencias (§10 de `perfil.md`).

El módulo `workspace` no se entera: `ensureWorkspaceContext` no cambia, y quien
compone es `session.ts`. La dependencia queda `time-entry → profile →
workspace`, sin ciclos.

### 5.4 El único punto de lectura en el servidor

```ts
// src/modules/profile/service.ts
/**
 * Zona, formatos y primer día de la semana con que quien pide ve el tiempo.
 * Única lectura de `context.preferences` para mostrar, y el primer día sale de
 * `weekStartOf`, nunca de la membresía directo.
 */
export function timeSettingsOf(context: ProfileContext): TimeSettings;

// src/modules/time-entry/service.ts
export type TrackerWorkspace = TimeSettings & { readonly createdAt: Date };

export function trackerWorkspaceOf(context: ProfileContext): TrackerWorkspace;
```

- `timeSettingsOf` arma `{ timezone: preferences.timezone, weekStart:
  weekStartOf(context), formats: { time: preferences.timeFormat, date:
  preferences.dateFormat } }`.
- `trackerWorkspaceOf` es `{ ...timeSettingsOf(context), createdAt:
  context.workspace.createdAt }`. Deja de leer `context.workspace.timezone`, y
  su comentario deja de anunciar el cambio que este slice hace.
- **`TrackerWorkspace` conserva su nombre y su campo `timezone`**: renombrarlos
  tocaría una docena de lugares de `service.ts` sin cambiar nada. Su
  comentario pasa a decir que la zona y los formatos son de la persona.
- **El piso del workspace** (`workspaceFloorDayKey`) pasa a ser el día de
  creación en la zona de la persona. Es la misma zona con que se convierte la
  hora tecleada, así que la validación y el calendario de la barra siguen
  diciendo lo mismo.

En `time-entry/service.ts`:

- **`toView`** rotula con `workspace.formats`, y la vista suma las dos horas
  canónicas:

  ```ts
  // timeEntryView, en src/modules/time-entry/schema.ts
  /** Hora canónica del inicio, "HH:mm" de 24 h: la del trío (ADR 0005). */
  startClock: z.string(),
  /** Hora canónica del fin, o `null` mientras corre. */
  endClock: z.string().nullable(),
  ```

  `startLabel = clockLabel(formatClock(startedAt, zona), formats.time)`, y lo
  mismo el fin. `startClock = formatClock(startedAt, zona)`. **El cliente arma
  el trío con `startClock` y `endClock`, nunca con los rótulos**: `fromView` y
  el editor del inicio del timer pasan a leerlos (§6).
- **`buildDays`** llama a `dayLabel(…, formats.date)`; **`buildWeeks`**, a
  `weekKeyLabel(…, formats.date)`.
- `durationLabel` no cambia: sale de `formatDuration`, que no depende de la
  persona (§1).

### 5.5 El único punto de lectura en el cliente

```tsx
// src/components/layout/display-formats.tsx
"use client";

export function DisplayFormatsProvider(props: {
  readonly formats: DisplayFormats;
  readonly children: ReactNode;
}): ReactNode;

/** Los formatos de quien mira. Lanza fuera del proveedor. */
export function useDisplayFormats(): DisplayFormats;
```

- **El proveedor vive en `src/app/(app)/layout.tsx`**, alrededor de
  `children`, con `timeSettingsOf(session).formats`. Toda pantalla del shell lo
  tiene sin pasar nada por props, y la revalidación del layout (§4.3) le da el
  valor nuevo.
- **El hook lanza sin proveedor**, en vez de devolver los predeterminados: un
  valor por omisión escondería que falta, y la persona con 12 h vería 24 h en
  una pantalla nueva sin que ningún test lo note.
- **Lo usan los componentes que formatean en el cliente** y ningún otro:
  `date-field.tsx`, `entry-row.tsx`, los tres que dibujan campos de hora
  (`manual-bar.tsx`, `entry-times-editor.tsx`, `running-start-editor.tsx`) y
  la pantalla de perfil. La tabla de §6 dice qué hace cada uno.
- **La zona no viaja por el contexto.** El cliente no convierte instantes: el
  único que usa la zona es `reset` de `time-draft.ts`, con el
  `TrackerState.timeZone` que ya recibe y que desde este slice es el de la
  persona.

### 5.6 La pantalla de perfil

```ts
// src/modules/profile/service.ts
export type ProfileUser = {
  readonly name: string;
  readonly email: string;
  readonly image: string | null;
};

/** Sin consultas: todo está en la sesión o en el entorno. */
export function getProfileView(
  context: ProfileContext,
  user: ProfileUser,
  now: Date = new Date(),
): ProfileView;

type Choice<Value extends string> = {
  readonly value: Value;
  /** Lo que el control muestra al lado: el desplazamiento o el ejemplo. */
  readonly example: string;
};

export type ProfileView = {
  readonly identity: ProfileUser & { readonly initials: string };
  readonly preferences: Preferences;
  /** Sale de `weekStartOf` (PF-01). Solo lectura. */
  readonly weekStart: WeekStart;
  /** `can(actor, "profile.own.update", ownProfileResource(actor))`. */
  readonly canEdit: boolean;
  readonly options: {
    readonly timezones: readonly Choice<string>[];
    readonly timeFormats: readonly Choice<TimeFormat>[];
    readonly dateFormats: readonly Choice<DateFormat>[];
  };
};
```

- **Las zonas** son `supportedTimeZones()`, más la guardada si no está en la
  lista (§5.2), en orden alfabético. Cada una con `utcOffsetLabel(zona, now)`.
  La lista sale del servidor y no del navegador, para que lo que se ofrece sea
  lo que la action acepta.
- **Los formatos de hora** traen de ejemplo `clockLabel("13:00", formato)`:
  `13:00` y `1:00 PM`.
- **Los formatos de fecha** traen de ejemplo el día de hoy en la zona de la
  persona, con año: `03/10/2026`, `2026-10-03`.
- **Las iniciales** salen de `initialsOf(name)` de `src/lib/text.ts` (PF-44):
  las primeras letras de las dos primeras palabras, en mayúsculas, o la
  primera del correo si el nombre está vacío.

### 5.7 Lo que reciben el calendario y el timesheet

Los slices 8 y 13 leen la zona, los formatos y el primer día de la semana de
estos dos lugares, y de ningún otro:

- **Su service recibe un `TimeSettings`**, de `timeSettingsOf(session)`, o un
  tipo propio que lo extienda, como `TrackerWorkspace`. Si el calendario vive en
  `time-entry`, usa `TrackerWorkspace` tal cual.
- **Sus rótulos salen de las funciones de §5.1** con `settings.formats`.
- **Sus componentes cliente leen `useDisplayFormats()`**, que ya tienen por el
  layout.
- **Ninguno lee `context.preferences`, `membership.weekStart` ni
  `workspace.timezone`** para mostrar algo.

Cuando entre el formato de duración, se suma a `DisplayFormats` y se resuelve
en `timeSettingsOf`; los consumidores ya reciben el objeto.

## 6. Reparto de archivos

Rutas absolutas. **(nuevo)** marca lo que crea el slice.

### backend-dev

```
/home/maxi/program/clock/src/server/db/schema.ts
/home/maxi/program/clock/drizzle/0005_user_preference.sql                          (nuevo, generado)
/home/maxi/program/clock/drizzle/meta/0005_snapshot.json                           (nuevo, generado)
/home/maxi/program/clock/drizzle/meta/_journal.json
/home/maxi/program/clock/src/server/time/index.ts
/home/maxi/program/clock/src/server/time/time.test.ts
/home/maxi/program/clock/src/server/permissions/index.ts
/home/maxi/program/clock/src/server/permissions/permissions.test.ts
/home/maxi/program/clock/src/server/action.ts
/home/maxi/program/clock/src/server/session.ts
/home/maxi/program/clock/src/lib/text.ts
/home/maxi/program/clock/src/lib/text.test.ts                                       (nuevo)
/home/maxi/program/clock/src/modules/profile/schema.ts                              (nuevo)
/home/maxi/program/clock/src/modules/profile/schema.test.ts                         (nuevo)
/home/maxi/program/clock/src/modules/profile/repository.ts                          (nuevo)
/home/maxi/program/clock/src/modules/profile/service.ts                             (nuevo)
/home/maxi/program/clock/src/modules/profile/actions.ts                             (nuevo)
/home/maxi/program/clock/src/modules/profile/schema.integration.test.ts             (nuevo)
/home/maxi/program/clock/src/modules/profile/service.integration.test.ts            (nuevo)
/home/maxi/program/clock/src/modules/profile/actions.integration.test.ts            (nuevo)
/home/maxi/program/clock/src/modules/time-entry/schema.ts
/home/maxi/program/clock/src/modules/time-entry/schema.test.ts
/home/maxi/program/clock/src/modules/time-entry/service.ts
/home/maxi/program/clock/src/modules/time-entry/service.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/actions.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/permissions.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/audit.integration.test.ts
/home/maxi/program/clock/src/modules/project/actions.integration.test.ts
/home/maxi/program/clock/src/test/factories.ts
```

- Los tres archivos de `drizzle/` salen del generador y no se editan a mano.
- **`src/test/factories.ts`** suma `seedPreferences(userId, valores)`, que
  escribe la fila con las columnas que se le pasen.
- **Los tests de `time-entry` que hoy siembran un workspace en Madrid** para
  ejercitar el cambio de horario a través de la sesión pasan a sembrar el
  workspace en Buenos Aires y la persona en Madrid con `seedPreferences`. Así
  prueban lo que el slice cambia: manda la zona de la persona, no la del
  workspace. Los que arman un `TrackerWorkspace` a mano suman `formats`.
- **Los arneses de `actions.integration.test.ts`** de `time-entry` y de
  `project` registran el par de `revalidatePath`; sus afirmaciones sobre rutas
  sueltas no cambian.
- `src/modules/workspace/` no cambia.

### frontend-dev

```
/home/maxi/program/clock/src/app/(app)/layout.tsx
/home/maxi/program/clock/src/app/(app)/perfil/page.tsx                                (nuevo)
/home/maxi/program/clock/src/components/layout/display-formats.tsx                    (nuevo)
/home/maxi/program/clock/src/components/layout/display-formats.test.tsx               (nuevo)
/home/maxi/program/clock/src/components/layout/user-menu.tsx
/home/maxi/program/clock/src/components/ui/avatar.tsx                                 (nuevo, generado)
/home/maxi/program/clock/src/modules/profile/components/profile-screen.tsx            (nuevo)
/home/maxi/program/clock/src/modules/profile/components/profile-screen.test.tsx       (nuevo)
/home/maxi/program/clock/src/modules/profile/components/preference-field.tsx          (nuevo)
/home/maxi/program/clock/src/modules/profile/components/labels.ts                     (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/time-draft.ts
/home/maxi/program/clock/src/modules/time-entry/components/time-draft.test.ts
/home/maxi/program/clock/src/modules/time-entry/components/entry-row.tsx
/home/maxi/program/clock/src/modules/time-entry/components/entry-times-editor.tsx
/home/maxi/program/clock/src/modules/time-entry/components/manual-bar.tsx
/home/maxi/program/clock/src/modules/time-entry/components/running-start-editor.tsx
/home/maxi/program/clock/src/modules/time-entry/components/clock-field.tsx
/home/maxi/program/clock/src/modules/time-entry/components/date-field.tsx
/home/maxi/program/clock/src/modules/time-entry/components/entry-week.test.ts
```

- **`avatar.tsx`** se genera con el CLI de shadcn, tal como está configurado
  en `components.json`. Si suma dependencias, `package.json` y
  `package-lock.json` entran en esta lista solo para ese cambio.
- **`entry-week.test.ts`** solo ajusta su vista de prueba a los dos campos
  nuevos de `TimeEntryView`.

### tests-slice7

```
/home/maxi/program/clock/e2e/profile.spec.ts                                         (nuevo)
/home/maxi/program/clock/e2e/tracker-page.ts
```

`tracker-page.ts` solo suma los ayudantes que el spec necesite para la pantalla
de perfil y el menú; los existentes no cambian.

### parity-analyst

```
/home/maxi/program/clock/docs/parity/perfil.md
/home/maxi/program/clock/docs/parity/time-tracker.md
```

Antes del merge:

- **En `time-tracker.md`**: TT-02, TT-20, TT-44 y P-13 pasan a decir «de la
  persona», con la tabla de entradas de 12 h de §5.1 en TT-20 y las formas
  cortas de fecha en TT-44.
- **En `perfil.md`**, lo de «Lo que el slice decide» de §1, y estas filas de
  §10:
  - `formatClock` **no cambia**: es la hora canónica; la que se muestra sale de
    `clockLabel`.
  - `parseClockInput` recibe el formato.
  - `day-group.tsx` y `week-group.tsx` no llaman a `formatDuration`: el total
    lo arma `use-group-total.ts`. Los tres esperan el formato de duración, que
    no entró.
  - Faltaban los que formatean en el cliente con la hora o la fecha:
    `date-field.tsx`, `entry-row.tsx`, `time-draft.ts` y los tres campos de
    hora (`manual-bar.tsx`, `entry-times-editor.tsx`,
    `running-start-editor.tsx`).
  - `session.ts`: las preferencias entran en `SessionContext` por
    `preferencesOf`; la fila de `auth.ts` queda para el 7b.
- **El texto de PF-46**, con el aviso de §6 (`labels.ts`).

### Lo que no toca nadie

- `src/modules/time-entry/actions.ts` (§0).
- `src/modules/workspace/`.
- `src/server/auth.ts` y `src/server/db/auth-schema.ts`.
- `src/server/time` fuera de lo que lista §5.1: `formatClock`,
  `formatDuration`, `formatElapsed`, `instantFromLocal` y las funciones de
  semana no cambian.
- `use-group-total.ts`, `day-group.tsx`, `week-group.tsx`,
  `elapsed-counter.tsx`.
- `src/app/globals.css`: el tema es del 7b.
- Los documentos de slices anteriores y de correcciones, que son históricos.

### Handshake de orden

1. **Primer commit de `backend-dev`:**
   - la tabla y su migración;
   - los tipos de formato, `DisplayFormats`, `TimeSettings` y las firmas de
     §5.1 en `src/server/time`;
   - `schema.ts` de `profile`: `Preferences`, `updatePreferenceInput`,
     `profileMessages`, `ProfileActions`;
   - las firmas de `ProfileContext`, `timeSettingsOf`, `getProfileView` y
     `ProfileView`;
   - `startClock` y `endClock` en `timeEntryView`;
   - `initialsOf`;
   - la acción nueva en `permissions`.
2. **`frontend-dev` arranca en paralelo** con `avatar.tsx`,
   `display-formats.tsx` y su test, `labels.ts` y el menú de usuario.
3. Con el primer commit en la rama, el resto: la pantalla, los campos de hora,
   `time-draft.ts` y `date-field.tsx`.

### Responsabilidades que no se leen en el nombre del archivo

- **`src/app/(app)/layout.tsx`** envuelve `children` en
  `DisplayFormatsProvider` con `timeSettingsOf(session).formats`, y le pasa a
  `UserMenu` el nombre, el correo y la foto de la sesión. No arma ningún
  formato.
- **`src/app/(app)/perfil/page.tsx`** solo compone: la sesión,
  `getProfileView(session, session.user)` y
  `<ProfileScreen view={…} actions={{ updatePreference }} />`. Es el único
  archivo de la pantalla que importa `actions.ts`.
- **`profile-screen.tsx` es un Server Component.** Dibuja:
  - el título «Perfil»;
  - **Datos de la cuenta**: la foto, o las iniciales si no hay (PF-44), el
    nombre y el correo, en solo lectura, con la nota de que salen de Google;
  - **Preferencias**, con el grupo «Hora y fecha»: zona horaria, formato de
    fecha y formato de hora, cada uno un `PreferenceField`;
  - **el primer día de la semana** como texto, con el nombre del día y la nota
    «Lo administra el equipo.» (PF-01);
  - **el formato de duración** como texto fijo, con la nota «Lo define el
    workspace.» (PF-02);
  - con `canEdit` en falso, el aviso de PF-46 arriba de las preferencias.
- **`preference-field.tsx`** es el único `"use client"` de la pantalla: un
  `Select` de `components/ui` con su rótulo, las opciones con su ejemplo y
  `useAction(actions.updatePreference, …)`.
  - **Guarda al cambiar** (PF-32), con el valor nuevo como vista optimista.
  - **Si falla, vuelve al valor anterior** —lo hace la transición de
    `useAction` al descartar la vista optimista— y muestra el aviso de dos
    partes de TT-90 debajo del control, con el título de su clave y
    «Reintentar» solo con `unexpected` (`retryHandlerOf`).
  - **No usa `disabled`** mientras guarda ni cuando `canEdit` es falso: un
    control con foco que pasa a `disabled` pierde el foco a `body`. Con
    `canEdit` en falso lleva `aria-disabled` y no abre. Pasa en la práctica: una
    membresía desactivada que intenta un cambio recibe `forbidden`, y la
    revalidación trae `canEdit` en falso con el foco todavía en el control.
  - El selector de zona lleva unas cuatrocientas opciones; la búsqueda por
    escritura de `Select` alcanza, porque cada opción empieza por el nombre de
    la zona.
- **`display-formats.tsx`** tiene el proveedor y el hook (§5.5), y nada más.
- **`user-menu.tsx`** (PF-10, PF-30): el disparador es la foto o las
  iniciales, con el nombre accesible «Menú de la cuenta». Dentro de un
  `DropdownMenu`: el nombre y el correo como texto, «Perfil» como enlace a
  `/perfil` y «Salir». La foto es un `<img>` con `referrerPolicy="no-referrer"`
  y no `next/image`: el CSP ya admite `lh3.googleusercontent.com`, y
  `next/image` pediría configurar `remotePatterns`.
- **`time-draft.ts`**: `fromView` recibe y lee `startClock` y `endClock`;
  `withStart(draft, text, format)` y `withEnd(draft, text, format)` llaman a
  `parseClockInput(text, format)`. Las tres cadenas del borrador siguen siendo
  canónicas: el formato entra solo al interpretar y al mostrar.
- **Los tres componentes con campos de hora** pasan a `ClockField` el rótulo,
  `clockLabel(canónica, formats.time)`, y devuelven desde `onCommit` el rótulo
  del valor aceptado. El borrador sigue guardando la canónica. El campo de
  duración no cambia.
- **`running-start-editor.tsx`** arma su par inicial con `running.startClock`,
  no con `startLabel`.
- **`clock-field.tsx`** recibe por prop el modo de teclado: con 12 h, uno que
  deje escribir `am` y `pm` en un teléfono; con 24 h y en la duración, el
  numérico de hoy.
- **`entry-row.tsx`**: el rótulo del trío en edición o en vuelo es
  `clockLabel` de sus dos horas; el de la vista ya llega del servidor.
- **`date-field.tsx`**: `dayKeyLabel(value, todayKey, formats.date)`.
- **`labels.ts`** del perfil:

  | Clave                | Texto                                                                                                            |
  | -------------------- | ---------------------------------------------------------------------------------------------------------------- |
  | `title`              | «Perfil»                                                                                                         |
  | `identity`           | «Datos de la cuenta»                                                                                             |
  | `identityNote`       | «El nombre, la foto y el correo salen de tu cuenta de Google.»                                                   |
  | `name`, `email`      | «Nombre», «Correo»                                                                                               |
  | `preferences`        | «Preferencias»                                                                                                   |
  | `timeAndDate`        | «Hora y fecha»                                                                                                   |
  | `timezone`           | «Zona horaria»                                                                                                   |
  | `dateFormat`         | «Formato de fecha»                                                                                               |
  | `timeFormat`         | «Formato de hora»                                                                                                |
  | `timeFormatNames`    | `24h` → «24 horas», `12h` → «12 horas»                                                                           |
  | `weekStart`          | «Primer día de la semana»                                                                                        |
  | `weekStartNote`      | «Lo administra el equipo.»                                                                                       |
  | `dayNames`           | «Domingo» … «Sábado», con domingo en 0 como `WeekStart`                                                          |
  | `durationFormat`     | «Formato de duración»                                                                                            |
  | `durationValue`      | «Compacto (h:mm)»                                                                                                |
  | `durationNote`       | «Lo define el workspace.»                                                                                        |
  | `failureTitles`      | «No se pudo cambiar la zona horaria.», «No se pudo cambiar el formato de fecha.», «No se pudo cambiar el formato de hora.» |
  | `inactiveTitle`      | «Tu acceso al workspace está desactivado.» (TT-92)                                                               |
  | `inactiveMessage`    | «Podés ver tu perfil, pero no cambiarlo. Pedile a quien administra el workspace que vuelva a activar tu membresía.» |
  | `menu`, `menuLabel`  | «Perfil», «Salir»; «Menú de la cuenta»                                                                            |

## 7. Criterios de aceptación

1. **La migración** — La tabla acepta una fila con las tres columnas en nulo y
   rechaza `time_format = '25h'`, `date_format = 'd/M/y'` y una zona vacía.
   Borrar el usuario borra su fila.
2. **Los predeterminados** (PF-11, PF-12, PF-13, PF-37) — Sin fila, las
   preferencias son `America/Argentina/Buenos_Aires`, `24h` y `dd/MM/yyyy`. Con
   solo `time_format` guardado, las otras dos son las predeterminadas. Una zona
   guardada que el entorno no convierte cae al predeterminado; una que convierte
   sin estar en la lista se usa. Un formato fuera de lista lanza.
3. **Desplegar no cambia nada visible** — Con los predeterminados,
   `dayKeyLabel`, `weekKeyLabel` y `clockLabel` dan los mismos textos que los
   casos de hoy de `time.test.ts`, y `getTrackerState` de una persona sin fila
   devuelve las mismas vistas que antes del slice con el workspace en Buenos
   Aires.
4. **El formato de hora** (PF-13) — `clockLabel` da la tabla de §5.1. Con 12 h,
   `startLabel` y `endLabel` vienen en 12 h y `startClock` y `endClock` siguen
   canónicos. Las filas, el editor de una fila y los campos de la barra
   muestran 12 h.
5. **Los campos en 12 h** (PF-14, TT-20) — `parseClockInput` da la tabla de
   §5.1; con 24 h rechaza todo sufijo. La ida y vuelta de §5.1 vale para los
   1440 minutos en los dos formatos. Con 12 h, corregir una fila tecleando
   `12:02 am` guarda `00:02`.
6. **El formato de fecha** (PF-12, TT-44, TT-47) — `formatDayKey` da la tabla de
   §5.1 con y sin año. `dayKeyLabel` sigue dando «Hoy» y «Ayer», y
   `weekKeyLabel` lleva el año en las dos puntas cuando alguna es de otro año,
   en los cuatro formatos. El botón del selector de fecha muestra el mismo
   rótulo que el encabezado de ese día.
7. **La zona de la persona** (PF-04, PF-11, PF-38, TT-02) — Con el workspace en
   Buenos Aires:
   - dos personas, una en Buenos Aires y otra en `Asia/Tokyo`, ven una entrada
     de las 00:00 de Buenos Aires a las 00:00 y a las 12:00, cada una en el día
     de su zona;
   - una persona en `Europe/Madrid` carga en modo manual y la entrada se
     convierte con Madrid (ADR 0005);
   - el piso es el día de creación del workspace en la zona de la persona;
   - cambiar `workspace.timezone` no cambia ninguna vista.
8. **El timer corriendo** (PF-39) — Cambiar la zona con un timer corriendo no
   cambia su `startedAt`; cambia su `dayDate` cuando el inicio cae en otro día
   de la zona nueva.
9. **Guardar una preferencia** (PF-32) — Cada clave escribe solo su columna: dos
   cambios seguidos de claves distintas conservan los dos. El primer cambio crea
   la fila. Pedir el valor ya guardado no escribe ni deja registro. Dos pedidos
   simultáneos de claves distintas dejan las dos columnas escritas. La respuesta
   trae las preferencias resueltas.
10. **Las validaciones** (PF-35) — Una zona fuera de la lista responde «Esa zona
    horaria no existe.»; un formato desconocido o una clave desconocida, «Ese
    formato no está disponible.».
11. **`can()`** (PF-34) — `profile.own.update` concede a los cinco roles sobre
    el perfil propio; niega sobre el de otra persona; niega a una membresía
    `inactive` o `invited`; niega con un recurso de otra clase, también un
    `workspace` de un owner.
12. **La capa de action** — `updatePreference` traduce el `ZodError` con su
    mensaje, responde `forbidden` con una membresía inactiva y revalida
    `{ path: "/", type: "layout" }`, también con error. Las actions de
    `time-entry` y `project` siguen revalidando las mismas rutas.
13. **Auditoría** — Cada cambio deja `profile.updatePreference` con la clave, el
    valor anterior crudo —nulo si no había— y el nuevo. Un pedido sin cambio no
    deja registro.
14. **El cambio se ve en toda la aplicación** (PF-33) — Cambiar el formato de
    hora en `/perfil` y navegar a `/` sin recargar muestra las horas en el
    formato nuevo.
15. **La pantalla** (PF-01, PF-02, PF-06, PF-09, PF-30, PF-31, PF-37) —
    `/perfil` muestra la identidad en solo lectura, los tres controles con el
    valor guardado o el predeterminado, el primer día de la semana de la
    membresía con su nota y el formato de duración con su nota. Las zonas son
    las del entorno más la guardada si falta, cada una con su desplazamiento;
    los formatos, con su ejemplo.
16. **Una falla al guardar** (PF-32, PF-36) — El control vuelve al valor
    anterior y aparece el aviso de dos partes con «Reintentar». Reintentar
    guarda. Recargar muestra lo guardado.
17. **La membresía no activa** (PF-46) — Los valores se ven, los controles no
    abren y no usan `disabled`, y está el aviso.
18. **El menú de usuario** (PF-10, PF-30, PF-44) — El disparador muestra la foto
    o las iniciales; adentro están el nombre, el correo, «Perfil» y «Salir».
    `initialsOf` da dos letras con dos palabras, una con una, y la del correo
    con el nombre vacío.
19. **Un solo punto de lectura** — `trackerWorkspaceOf` devuelve
    `timeSettingsOf` más `createdAt`; el primer día de `timeSettingsOf` es el de
    `weekStartOf`; `useDisplayFormats` lanza sin proveedor; ningún archivo fuera
    de `profile/service.ts` lee `context.preferences`, y ninguno fuera del cron
    lee `workspace.timezone`.

### Con qué se verifica cada criterio

| Criterio | Tipo                       | Archivo                                                                                       | Qué afirma                                                                                                                         |
| -------- | -------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1        | integración                | `profile/schema.integration.test.ts`                                                          | los tres rechazos del `check`, los nulos y la cascada, con inserts directos                                                        |
| 2        | integración                | `profile/service.integration.test.ts`                                                         | `preferencesOf` sin fila y con fila parcial; `resolvePreferences` con una zona inventada, con un alias y con un formato fuera de lista |
| 3        | unidad + integración       | `time.test.ts`; `time-entry/service.integration.test.ts`                                      | los casos de rótulos de hoy con los predeterminados; las vistas de una persona sin fila                                            |
| 4        | unidad + integración + e2e | `time.test.ts`; `time-entry/service.integration.test.ts`; `e2e/profile.spec.ts`               | la tabla de `clockLabel`; las vistas con 12 h; el recorrido 2                                                                      |
| 5        | unidad + e2e               | `time.test.ts`; `time-draft.test.ts`; `e2e/profile.spec.ts`                                   | la tabla y la ida y vuelta; `withStart` y `withEnd` con 12 h; el recorrido 2                                                       |
| 6        | unidad + e2e               | `time.test.ts`; `e2e/profile.spec.ts`                                                         | las tablas de fecha y de rangos en los cuatro formatos; el recorrido 3                                                             |
| 7        | integración + e2e          | `time-entry/service.integration.test.ts`; `time-entry/actions.integration.test.ts`; `e2e/profile.spec.ts` | las dos personas, el piso y el `workspace.timezone` cambiado; el alta en Madrid por la action; el recorrido 4                       |
| 8        | integración                | `time-entry/service.integration.test.ts`                                                      | la vista del timer antes y después de cambiar la zona                                                                              |
| 9        | integración                | `profile/service.integration.test.ts`                                                         | cada caso; los simultáneos con `raceThroughBarrier`                                                                                |
| 10       | unidad + integración       | `profile/schema.test.ts`; `profile/actions.integration.test.ts`                               | el esquema con cada rechazo; los mensajes por la action                                                                            |
| 11       | unidad + integración       | `permissions.test.ts`; `profile/service.integration.test.ts`                                  | la tabla de la acción; `forbidden` con una membresía inactiva                                                                      |
| 12       | integración                | `profile/actions.integration.test.ts`; los de `time-entry` y `project`                        | las traducciones y el par revalidado; las rutas de siempre en los otros dos                                                        |
| 13       | integración                | `profile/service.integration.test.ts`                                                         | el registro de cada clave, y ninguno sin cambio                                                                                    |
| 14       | e2e                        | `e2e/profile.spec.ts`                                                                         | el recorrido 2                                                                                                                     |
| 15       | integración + unidad + e2e | `profile/service.integration.test.ts`; `profile-screen.test.tsx`; `e2e/profile.spec.ts`       | `getProfileView`; el marcado con una vista armada a mano; el recorrido 1                                                           |
| 16       | e2e                        | `e2e/profile.spec.ts`                                                                         | el recorrido 5                                                                                                                     |
| 17       | integración + unidad       | `profile/service.integration.test.ts`; `profile-screen.test.tsx`                              | `canEdit` en falso; el aviso y los controles sin `disabled`                                                                        |
| 18       | unidad + e2e               | `src/lib/text.test.ts`; `e2e/profile.spec.ts`                                                 | `initialsOf`; el recorrido 1                                                                                                       |
| 19       | integración + unidad + revisión | `time-entry/service.integration.test.ts`; `display-formats.test.tsx`; revisión de código | `trackerWorkspaceOf` contra `timeSettingsOf`; el hook sin proveedor; la búsqueda de lecturas directas                              |

**La membresía no activa no se prueba en e2e.** El rol de la base de e2e no
puede cambiar el estado de una membresía; se cubre en integración y en el test
del componente, como el vacío del slice 9.

**El test de componente** sigue el patrón de `projects-screen.test.tsx`:
`renderToStaticMarkup`, una vista armada a mano y un `ProfileActions` con
dobles escritos a mano, sin `vi.mock`. Como `PreferenceField` usa
`useDisplayFormats` indirectamente, el test envuelve en
`DisplayFormatsProvider`.

### Recorridos obligatorios de `e2e/profile.spec.ts`

Dueño: `tests-slice7`. Cada recorrido usa una persona propia, que nace con los
predeterminados. Las horas «de hoy» son siempre pasadas (`00:00–00:01` en la
zona de Buenos Aires); toda espera es por la respuesta del servidor
(`withServerAction`), no por un estado ya dibujado; las opciones de un `Select`
se buscan en `page`, porque se dibujan en un portal.

1. **Criterios 15 y 18.** Abrir el menú de la cuenta, ver el nombre y el
   correo, entrar por «Perfil». Ver la zona `America/Argentina/Buenos_Aires`,
   `dd/MM/yyyy`, 24 horas, «Lunes» con «Lo administra el equipo.» y el formato
   de duración con su nota.
2. **Criterios 4, 5 y 14.**
   1. Cargar en modo manual una entrada de hoy, `00:00` a `00:01`.
   2. En `/perfil`, elegir 12 horas.
   3. Volver a `/` por la navegación, sin recargar, y ver la fila como
      `12:00 AM – 12:01 AM`.
   4. Abrir el editor de la fila, teclear `12:02 am` en el fin, confirmar, y
      ver `12:00 AM – 12:02 AM` con `0:02`.
   5. Recargar y ver lo mismo.
3. **Criterio 6.** Cargar una entrada de hace tres días. Elegir `yyyy-MM-dd` y
   ver su encabezado con el día abreviado y `MM-dd`. Elegir ese día en el
   selector de fecha de la barra manual y ver el mismo rótulo en el botón. Los
   rótulos esperados los calcula el test a partir del día civil, con los
   ayudantes de `e2e/days.ts`.
4. **Criterio 7, PF-38.** Cargar una entrada de hoy, `00:00` a `00:01`. Elegir
   `Asia/Tokyo` y ver la fila como `12:00 – 12:01`. **El grupo donde aparece
   lo calcula el test**: es el mismo día civil, que en Tokio puede ser «Hoy» o
   «Ayer» según la hora a la que corra (`todayIn("Asia/Tokyo")`). Volver a
   Buenos Aires y ver la fila como al principio. Tokio y Buenos Aires no tienen
   cambio de horario, así que las horas esperadas son fijas.
5. **Criterio 16.**
   1. Cortar el pedido del cambio de formato de fecha **antes** de que llegue
      al servidor, con `route.abort()` sin `route.fetch()`.
   2. Ver el control de vuelta en `dd/MM/yyyy` y el aviso «No se pudo cambiar
      el formato de fecha.» con «Reintentar».
   3. Quitar la ruta, reintentar, y ver el formato nuevo.
   4. Recargar y verlo guardado.

   A diferencia del slice 9, el pedido se corta antes del servidor: lo que se
   prueba es que el control vuelve y que «Reintentar» guarda, no la
   idempotencia, que ya cubre el criterio 9.

## 8. Deuda conocida del slice

- **El nombre editable y el tema** quedan para el 7b (§1). Hasta entonces el
  nombre es el de Google y el tema sigue al CSS de hoy.
- **Un cambio de nombre o de foto en Google no llega nunca**:
  `overrideUserInfoOnSignIn` no está puesto en `src/server/auth.ts`, así que
  Better Auth escribe `user.name` e `image` solo al crear la cuenta. Cumple
  PF-08 por omisión y no cumple PF-45. Lo resuelve el 7b con la columna de
  §2.4.
- **El formato de duración no es un dato** (PF-20): `formatDuration` da siempre
  `h:mm`, y la pantalla lo muestra como texto fijo. Entra con la pantalla de
  ajustes del workspace de la fase 2, por `DisplayFormats` y `timeSettingsOf`
  (§5.7). **Decisión abierta para el equipo**: si se lo quiere antes, es una
  columna en `workspace_settings` sin pantalla, como `week_start` en el slice 5.
- **El predeterminado de la zona es un valor y no un vínculo** con
  `workspace.timezone` (§2.1). Es la lectura de P-03 que respeta PF-05;
  **queda para que el equipo lo confirme**. Si prefiere el vínculo, cambia una
  línea de `resolvePreferences` y el criterio 7 deja de afirmar que
  `workspace.timezone` no influye.
- **Las formas de 12 h y las cortas de fecha son decisiones nuestras** (§5.1),
  sin verificar contra Clockify. Se suman a la lista P-09 de `perfil.md`.
- **El calendario emergente del selector de fecha arranca la semana por el
  idioma** (lunes), no por el primer día de la persona. El slice 8 va a
  necesitar el primer día en el cliente; cuando lo traiga, el selector lo usa.
- **El borrador de la barra manual conserva el día y la hora que tenía** si la
  persona cambia de zona con la barra abierta: `reset` corre al montarse y
  después de agregar (TT-25). Al agregar, el servidor interpreta el borrador en
  la zona nueva, que es la regla del ADR 0005: la hora de pared es la que se
  tecleó.
- **`requireSession` corre dos veces por pantalla**, en el layout y en la
  página, y ahora con una consulta más cada vez. Son lecturas por clave
  primaria. Si la latencia de la sesión se vuelve visible, se envuelve
  `currentSession` en `cache` de React, que la comparte dentro del mismo
  render.
- **`workspaceTimeZone()` de `e2e/database.ts`** devuelve la zona del
  workspace, que coincide con el predeterminado de la persona. Los specs
  existentes la usan para calcular «hoy» y siguen siendo correctos mientras
  las dos coincidan; si el predeterminado cambia, ese ayudante cambia con él.
- **La lista de zonas depende del ICU de Node**: una versión nueva puede sumar
  o renombrar zonas. La guardada que deja de listarse sigue valiendo si el
  entorno la convierte (§5.2) y aparece entre las opciones.
