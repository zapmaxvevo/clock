# Paridad: perfil

Alcance de este documento: los ajustes de la persona que cambian cómo se ve y
cómo se calcula el resto de la aplicación —zona horaria, formato de fecha,
formato de hora, primer día de la semana, formato de duración, tema, nombre y
foto—, y la pantalla desde la que se tocan. No cubre la administración del
equipo, los objetivos semanales ni las notificaciones por correo, salvo para
nombrar dónde terminan.

Cada comportamiento lleva un identificador `PF-nn` y una marca `replicar`,
`adaptar` o `fuera de alcance`. Las dos últimas llevan una línea de
justificación. Las referencias `TT-nn` apuntan a
[la paridad del rastreador](time-tracker.md).

## Fuentes y límites del relevamiento

- https://clockify.me/help/users/profile-settings
- https://clockify.me/help/users/user-settings
- https://clockify.me/help/track-time-and-expenses/duration-format
- https://clockify.me/help/billing/updates-to-clockify-free-plan
- https://docs.clockify.me/ (endpoint de perfil de miembro: `weekStart`,
  `workingDays`)

**No pude entrar al workspace real del equipo**: no tengo credenciales de
Clockify en este entorno. Lo marcado como _no verificado_ hay que confirmarlo
abriendo el workspace antes de implementarlo, y está todo junto en P-09.

**Ningún valor predeterminado está documentado.** La documentación enumera los
ajustes y sus opciones, pero no dice con qué valor arranca ninguno. Los
predeterminados que usa este documento los **fijó el equipo el 2026-10-02**
(P-03): son una decisión nuestra, no un relevamiento, y no se leen como
paridad verificada. Si una cuenta nueva de Clockify arranca con otros, se
cambian, que es una línea por valor.

## Vocabulario

| Clockify          | Clock (interfaz en español) |
| ----------------- | --------------------------- |
| Profile settings  | Perfil                      |
| Preferences       | Preferencias                |
| Time zone         | Zona horaria                |
| Date format       | Formato de fecha            |
| Time format       | Formato de hora             |
| Week start        | Primer día de la semana     |
| Duration format   | Formato de duración         |
| Theme / Dark mode | Tema                        |
| Start of day      | Inicio del día              |
| Profile picture   | Foto                        |

## 1. Dónde vive cada ajuste y qué gana

Esta es la pregunta de la precedencia, y la respuesta del relevamiento es que
**en Clockify no hay precedencia que resolver: cada valor vive en un solo
lugar**. No existe ningún ajuste que esté a la vez en el perfil y en el
workspace, así que nunca hay dos candidatos para el mismo dato.

| Ajuste                   | Dónde vive en Clockify                                 | Quién lo cambia |
| ------------------------ | ------------------------------------------------------ | --------------- |
| Nombre, foto, email      | Cuenta centralizada de CAKE.com, fuera de Clockify     | La persona      |
| Zona horaria             | Perfil                                                 | La persona      |
| Formato de fecha         | Perfil                                                 | La persona      |
| Formato de hora          | Perfil                                                 | La persona      |
| Inicio del día           | Perfil                                                 | La persona      |
| Tema                     | Perfil                                                 | La persona      |
| Idioma                   | Perfil                                                 | La persona      |
| Agrupar entradas         | Perfil                                                 | La persona      |
| **Primer día de semana** | Perfil de la persona, pero **escrito desde el equipo** | Admin u owner   |
| **Formato de duración**  | Ajustes del workspace, pestaña General                 | Workspace       |

Las dos filas en negrita son las que rompen la intuición de «todo lo del perfil
lo decide la persona»:

**PF-01 El primer día de la semana es por persona pero lo fija un admin** —
`replicar`
Documentado y literal: «You cannot change the start of the week from your
personal Profile Settings. The 'Week start' is an administrative setting», y un
admin lo edita desde el perfil de esa persona en la pantalla de equipo. En la
API es un campo del perfil de miembro, con los valores `MONDAY`, `TUESDAY`,
`WEDNESDAY`, `THURSDAY`, `FRIDAY`, `SATURDAY`, `SUNDAY`. Es decir: el dato es
por persona y por workspace, y la escritura es del admin. La pantalla de perfil
lo muestra en solo lectura.
Decidido por el equipo el 2026-10-02: el campo va en `membership`, que es la
tabla por persona y por workspace, y lo edita un admin.

**PF-02 El formato de duración es del workspace** — `replicar`
Documentado: vive en los ajustes del workspace, pestaña General, y no en el
perfil. Una persona no puede ver las duraciones en otro formato que el resto
del equipo.
_No verificado_: la documentación no dice qué rol puede cambiarlo. Suponer
admin y owner, como el resto de los ajustes de workspace, y confirmarlo.

**PF-03 Los ajustes del perfil son de la cuenta, no del workspace** —
`adaptar`
En Clockify el perfil es de la cuenta y vale en todos los workspaces a los que
la persona pertenezca; solo el primer día de la semana es por membresía.
Justificación: el proyecto tiene un solo workspace, así que la distinción no se
puede observar. Igual conviene modelarla como en Clockify —preferencias
colgando de la persona, primer día de la semana colgando de la membresía—
porque cuesta lo mismo ahora y evita una migración si algún día hay dos.
Decidido por el equipo el 2026-10-02: las preferencias van en una tabla propia,
**nunca como columnas de `user`**, porque esa tabla la regenera
`npm run auth:schema` y cualquier columna nuestra se perdería.

**PF-04 Un cambio del perfil solo afecta a quien lo hace** — `replicar`
Documentado: «Changes in the Profile settings will only affect your individual
view and will not alter the workspace for your team members or managers», y
sobre la zona horaria, que no altera «the workspace view or reports for your
colleagues or workspace owners». Dos personas en husos distintos ven la misma
entrada con horas distintas, y cada una la agrupa en el día que le corresponde
a su huso.

**PF-05 Clockify no tiene zona horaria de workspace** — `adaptar`
No encontré ningún ajuste de zona horaria a nivel de workspace en la
documentación: la zona horaria es siempre de la persona. Nuestro
`workspace.timezone` no tiene equivalente y hoy cumple dos papeles distintos:
decidir el día de los trabajos de cron y, provisoriamente, formatear la
interfaz de todo el mundo (P-13 del rastreador, TT-02).

Decidido por el equipo el 2026-10-02: **`workspace.timezone` se queda, con un
solo trabajo.** Cuando llegue el perfil, la zona horaria de la interfaz sale de
la persona y la del workspace queda **solo** para fijar el día de los trabajos
de cron. No sobra y no se borra: el cron corre sin nadie conectado y necesita
una zona horaria que no dependa de ninguna persona. Es una necesidad nuestra,
no un comportamiento de Clockify, y por eso no tiene paridad que cumplir.

Justificación del `adaptar`: el ajuste no existe en Clockify y nosotros lo
conservamos para una restricción propia.
_No verificado_: que no exista el ajuste es una ausencia en la documentación,
no una afirmación de la documentación. Confirmar en el workspace.

## 2. Identidad: nombre, foto, correo

**PF-06 El correo y la contraseña se administran fuera de la aplicación** —
`adaptar`
Clockify delega la identidad entera en el portal de cuenta de CAKE.com y el
perfil solo tiene un botón que lleva ahí. Acá la identidad la da el login con
Google: el correo no se puede cambiar porque es la identidad y no hay
contraseña que administrar. Justificación: el proveedor de identidad es el
equivalente del portal de cuenta.

**PF-07 El nombre se edita dentro de la aplicación** — `replicar`
Clockify deja cambiar el nombre, aunque sea desde el portal de cuenta. Acá se
edita en la pantalla de perfil, con un campo de texto que guarda como el resto
(PF-32). El valor inicial es el que llegó de Google.
Decidido por el equipo el 2026-10-02.
**No se implementa sin resolver antes PF-08.**

**PF-08 El nombre editado no lo pisa Google** — `adaptar`
Si alguien edita su nombre y después vuelve a iniciar sesión, gana el nombre
editado: el que llega de Google se usa al crear la cuenta y no después.
Justificación: Clockify no tiene este problema porque el nombre vive en un solo
lugar; acá hay dos orígenes y hace falta decir cuál manda.

**Esto es una condición para implementar PF-07, no una observación.** Hoy
`src/server/auth.ts` mapea `{ name: profile.name, image: profile.picture }`
desde el perfil de Google. Antes de escribir una sola línea del nombre
editable hay que comprobar **cuándo corre ese mapeo**. Si corre en cada inicio
de sesión, el nombre editado se pisa solo con volver a entrar, sin que nadie
toque nada y sin ninguna forma de que la persona entienda por qué: no es una
duda de diseño, es un defecto que se activa el primer lunes a la mañana. La
corrección, si ese es el caso, es que el mapeo escriba el nombre **solo al
crear la cuenta**.

**PF-09 La foto sale de Google y no se puede cambiar** — `adaptar`
Clockify permite cambiar la foto desde el portal de cuenta. Acá la foto es la
de Google, en solo lectura, con una nota de dónde sale.
Justificación, decidida por el equipo el 2026-10-02: es una **divergencia
deliberada**, y el motivo es el costo, no el comportamiento. Editar el nombre
es un campo de texto y una action; cambiar la foto necesita subida de archivos
a Blob, que no tiene ninguna otra necesidad en la fase 1 y arrastra validación
de tipo y de tamaño. La divergencia se levanta cuando exista otra necesidad de
subir archivos: el logo del workspace, que es de la fase 2.

**PF-10 La foto se muestra donde hoy solo hay nombre** — `adaptar`
El menú de usuario del encabezado muestra hoy el nombre y el correo como
atributo `title`. Con el perfil pasa a mostrar la foto, y el nombre y el correo
dentro del menú desplegable, con el enlace al perfil. Justificación: la foto ya
llega en la sesión (`image`) y no se usa en ningún lado.

## 3. Preferencias de tiempo

**PF-11 Zona horaria** — `replicar`
Un selector con las zonas horarias, bajo «Hora y fecha». Afecta a cómo se
muestran todas las horas y a dónde cae el corte de cada día y de cada semana.
Predeterminado decidido por el equipo el 2026-10-02, **como decisión nuestra y
no como relevamiento**: la zona horaria del workspace
(`America/Argentina/Buenos_Aires`), para que activar el perfil no mueva ningún
día de lugar. Nadie se encuentra con sus entradas cambiadas de día el día que
la pantalla de perfil se despliega.
_No verificado_: si Clockify la detecta del navegador al crear la cuenta.

**PF-12 Formato de fecha** — `replicar`
Un selector bajo «Hora y fecha». La documentación lo nombra pero **no enumera
las opciones**, así que la lista no se pudo relevar. Lista propuesta, que cubre
lo que la aplicación necesita: `dd/MM/yyyy`, `dd-MM-yyyy`, `yyyy-MM-dd` y
`MM/DD/YYYY`.
Predeterminado decidido por el equipo el 2026-10-02: `dd/MM/yyyy`.
_No verificado_: qué opciones ofrece Clockify y con cuál arranca.

**PF-13 Formato de hora** — `replicar`
Dos valores documentados: 12 horas y 24 horas.
Predeterminado decidido por el equipo el 2026-10-02: 24 horas, que es lo que
hoy hace `formatClock` y lo que asume TT-20 al rechazar `1pm`.

**PF-14 Con 12 horas, los campos de hora aceptan `am` y `pm`** — `adaptar`
TT-20 rechaza `1pm` justificándose en que la interfaz es de 24 horas. Esa
justificación se cae en cuanto el formato sea elegible: con 12 horas
seleccionadas hay que aceptar `1pm` → 13:00, como Clockify, y seguir
rechazándolo con 24 horas. Justificación: es la regla de Clockify condicionada
a un ajuste que hoy no existe; cuando exista, TT-20 hay que reescribirlo.

**PF-15 Inicio del día** — `fuera de alcance`
La documentación nombra el ajuste —«the start of your day»— y **no explica qué
hace**. No lo releva nadie a partir de un nombre.
Justificación: no se puede implementar lo que no se entendió. Queda apuntado al
slice del calendario, que es el que lo va a necesitar si resulta ser un ajuste
de esa vista (P-02).
_No verificado_: qué cambia este ajuste.

## 4. Primer día de la semana

**PF-16 Valores** — `replicar`
Los siete días, con los nombres de la API (`MONDAY` … `SUNDAY`). Nuestro tipo
`WeekStart` de `src/server/time` ya es `0 | 1 | … | 6` con domingo en cero, que
es la misma información en otra forma.
Predeterminado decidido por el equipo el 2026-10-02: lunes.
_No verificado_: cuál es el predeterminado de Clockify.

**PF-17 Quién lo edita** — `replicar`
Owner y admin, sobre el perfil de cualquier miembro, desde la pantalla de
equipo. La persona lo ve en su perfil y no lo puede cambiar. Es la misma
decisión de acceso que `team.manage`, que ya existe.

**PF-18 Sobre qué impacta** — `replicar`
Sobre todo lo que agrupa por semana: el encabezado y el total de la semana del
rastreador (TT-47, TT-48), el timesheet semanal y los rangos predefinidos de
los reportes. No mueve ninguna entrada: solo cambia dónde corta la semana.

**PF-19 Días laborables y capacidad semanal** — `fuera de alcance`
El mismo endpoint de perfil de miembro acepta `workingDays` con el mismo enum
de días, y `membership.weeklyCapacityMinutes` ya existe en nuestro esquema sin
ningún uso. Justificación, decidida por el equipo el 2026-10-02: alimentan
objetivos, capacidad y planificación, y Clockify los administra desde la
pantalla de equipo, igual que el primer día de la semana. Van a la fase 2 con
el resto de la administración de equipo, no a la pantalla de perfil. Se nombran
acá solo porque viajan en el mismo payload que PF-16.

## 5. Formato de duración

**PF-20 Tres formatos, de los que entran dos** — `adaptar`
Documentados, con el ejemplo de la propia documentación para el valor `2`:

| Formato  | Muestra    | `2` se lee como        |
| -------- | ---------- | ---------------------- |
| Completo | `hh:mm:ss` | 2 minutos → `00:02:00` |
| Compacto | `h:mm`     | 2 minutos → `0:02`     |
| Decimal  | `h.hh`     | 2 horas → `2.00`       |

El decimal **requiere plan pago**: no se puede relevar en el workspace del
equipo y queda `fuera de alcance` por decisión del equipo del 2026-10-02.
Quedan completo y compacto, con **compacto como predeterminado**, que es lo que
hoy devuelve `formatDuration`. Justificación del `adaptar`: se implementan dos
de los tres formatos.

**PF-21 El formato decide también cómo se interpreta lo que se teclea** —
`replicar`
El ejemplo de la documentación no es de visualización sino de interpretación:
con formato completo o compacto, `2` son dos minutos; con decimal, dos horas.

De acá sale una consecuencia que conviene tener escrita: **la tabla de
`parseDurationInput` del contrato del slice 2 del rastreador está atada al
formato de duración, no es una regla universal.** Dice que `30` son treinta
minutos y que `2` son dos minutos, y eso vale para los formatos completo y
compacto. Con el decimal, los mismos textos significan horas. Como el decimal
queda fuera de alcance (PF-20), hoy no hay nada que cambiar; lo que no puede
pasar es que alguien lea esa tabla como una propiedad del intérprete y la dé
por válida pase lo que pase.

**PF-22 Alcance del formato** — `replicar`
Se aplica «across all modules», con las facturas y los proyectos siempre en
decimal. Para lo construido significa: la duración de cada fila, el total del
día y, más adelante, el total de la semana y los reportes.

Decidido por el equipo el 2026-10-02: **el contador del timer corriendo sigue
en `h:mm:ss`** y el ajuste manda en los totales y en las filas. Es lo que la
herramienta hace hoy y es lo que ya está construido.
_No verificado_: si el contador de Clockify respeta el formato de duración o es
siempre `h:mm:ss`. Queda anotado como suposición de esa decisión, para que
quien lo compruebe sepa qué se había asumido antes de tocar `formatElapsed`.

## 6. Tema

**PF-23 Claro, oscuro y seguir al sistema** — `adaptar`
Clockify documenta dos valores: claro y oscuro. Acá hay tres, y **«seguir al
sistema» es el predeterminado**, decidido por el equipo el 2026-10-02.
Justificación: es una **divergencia deliberada** si resulta que Clockify solo
tiene dos. Cuesta nada y es la única manera de no imponerle un tema claro a
quien tiene el sistema en oscuro. La hoja de estilos ya define la variante
`dark`; falta quién la encienda.
_No verificado_: si Clockify ofrece «seguir al sistema».

**PF-24 El tema se aplica sin recargar y antes del primer dibujo** — `adaptar`
Clockify no documenta el mecanismo. Acá el tema tiene que estar resuelto antes
del primer pintado, o se ve un destello claro en cada carga. Justificación: es
una restricción de nuestro renderizado en servidor, no un comportamiento de
Clockify.

## 7. Idioma

**PF-25 Idioma** — `fuera de alcance`
Clockify ofrece inglés, francés, alemán, español y portugués, solo en la
aplicación web. Justificación: la interfaz de Clock es en español y no hay
segundo idioma; el ajuste no tendría qué ofrecer.

## 8. Otras preferencias del perfil de Clockify

Están en la misma pantalla y conviene saber qué son, aunque ninguna entre
ahora.

**PF-26 Agrupar entradas similares** — `fuera de alcance`
Es un interruptor del perfil, y es el que gobierna TT-53, que yo había dejado
como pendiente P-09 del rastreador sin saber dónde se configuraba. Cuando se
decida TT-53, el interruptor va acá.
_No verificado_: si viene encendido o apagado.

**PF-27 Colapsar la lista de proyectos y filtro de tareas** —
`fuera de alcance`
Dos interruptores de presentación de los selectores. Justificación: dependen
del módulo de proyectos, que todavía no existe.

**PF-28 Notificaciones por correo** — `fuera de alcance`
Cuatro casillas: sistema y novedades, alertas de seguimiento, reportes y
aprobaciones, equipo y planificación. Justificación: no hay envío de correo en
el proyecto y el único cron disponible corre una vez por día; es una decisión
de producto entera, no un ajuste.

**PF-29 Claves de API y webhooks** — `fuera de alcance`
Justificación: no hay API pública ni webhooks en el alcance del clon.

## 9. La pantalla de perfil

**PF-30 Dónde está** — `adaptar`
Ruta `/perfil`, dentro del shell con sesión, y un enlace desde el menú de
usuario del encabezado. En Clockify se llega desde el menú de la cuenta.
Justificación: ruta y rótulo en español.

**PF-31 Contenido** — `replicar`
Dos bloques, como Clockify: identidad arriba —nombre editable (PF-07), foto y
correo en solo lectura (PF-06, PF-09)— y preferencias abajo, con los ajustes de
hora y fecha agrupados, y el tema. El primer día de la semana aparece entre las
preferencias, en solo lectura, con una nota de que lo administra el equipo
(PF-01), y el formato de duración también, con la nota de que es del workspace
(PF-02).

**PF-32 Cada cambio se guarda solo** — `adaptar`
No hay botón de guardar: cada control guarda al cambiar, y el nombre al perder
el foco o con Enter, como el resto de la aplicación (TT-04, TT-55). Si falla,
el control vuelve al valor anterior y aparece el aviso de dos partes de TT-90.
Justificación: Clockify no documenta el mecanismo; esta es la convención que el
rastreador ya fijó.

**PF-33 El cambio se ve en toda la aplicación de inmediato** — `replicar`
Al cambiar la zona horaria o un formato, el rastreador y cualquier otra
pantalla abierta pasan a mostrar el valor nuevo. Para nosotros eso significa
revalidar las rutas que formatean en el servidor, no solo la de perfil. El
nombre, además, se ve en el encabezado.

**PF-34 Permisos** — `replicar`
Los cinco roles editan su propio perfil. Una membresía que no está activa no
edita nada, por la regla de `can`, igual que en TT-66. Editar el perfil de otra
persona es de la pantalla de equipo y solo para owner y admin (PF-17).

**PF-35 Validaciones** — `adaptar`
Clockify no documenta ninguna. Las que hacen falta, con los textos propios:

| Caso                                         | Mensaje                                          |
| -------------------------------------------- | ------------------------------------------------ |
| Nombre vacío                                 | «Escribí un nombre.»                             |
| Nombre de más de 100 caracteres              | «El nombre no puede superar los 100 caracteres.» |
| Zona horaria que no está en la lista de IANA | «Esa zona horaria no existe.»                    |
| Formato de fecha o de hora desconocido       | «Ese formato no está disponible.»                |
| Día de la semana fuera de los siete          | «Ese día no existe.»                             |
| Sin permiso para cambiar el primer día       | «No tenés permiso para hacer esto.» (TT-79)      |

Justificación: son validaciones de un payload cerrado, no reglas de producto.
La lista de zonas horarias sale del entorno, no de una tabla nuestra.
**Los dos límites del nombre —no vacío y 100 caracteres— son decisión del
equipo del 2026-10-02, no relevamiento**: Clockify no documenta ninguno, igual
que pasa con los predeterminados.

**PF-36 Estado de error y recarga** — `replicar`
Al recargar, la pantalla muestra los valores guardados; no hay borrador que
perder porque cada control guarda solo. Con la red caída vale TT-89: el control
vuelve, el aviso ofrece «Reintentar».

**PF-37 No hay estado vacío** — `replicar`
Todos los ajustes tienen valor siempre, así que la pantalla nunca está vacía.
Una persona que nunca tocó nada ve los predeterminados.

## 10. Impacto sobre lo ya construido

Lo que hay que volver a tocar cuando el perfil llegue. Es la sección que
importa para planificar el slice.

**Una propiedad que juega a favor.** El slice 1 decidió que todo lo que depende
de zona horaria o de formato se resuelve en el servidor y viaja ya formateado
en `TimeEntryView` —`startLabel`, `endLabel`, `durationLabel`, `dayDate`— y en
`DayGroupView.label`. Eso quiere decir que cambiar los formatos **no toca los
componentes**, salvo el que formatea en el cliente. El cambio es casi todo en
`src/server/time` y en el service.

| Qué                                                     | Por qué lo mueve el perfil                                                                                                                                                             |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/server/db/schema.ts` y una migración               | Preferencias por persona en **tabla propia** y `week_start` en `membership`. **La tabla `user` es de Better Auth** y se regenera con `npm run auth:schema`: no se le agregan columnas. |
| `src/server/auth.ts`                                    | El mapeo `{ name: profile.name, image: profile.picture }` no puede pisar el nombre editado en cada inicio de sesión. Es condición previa de PF-07; el detalle está en PF-08.           |
| `src/server/session.ts`                                 | `SessionContext` tiene que traer las preferencias, para que ninguna action las vuelva a buscar.                                                                                        |
| `src/app/(app)/page.tsx`                                | Hoy pasa `session.workspace.timezone`; pasa a pasar la de la persona.                                                                                                                  |
| `src/modules/time-entry/actions.ts`                     | Las cuatro actions pasan `session.workspace.timezone` al service. Mismo cambio, cuatro veces.                                                                                          |
| `src/server/time/index.ts` · `formatClock`              | Hoy fija `HH:mm`. Pasa a depender del formato de hora (PF-13).                                                                                                                         |
| `src/server/time/index.ts` · `dayLabel` y `dayKeyLabel` | Hoy fijan `EEE, dd/MM`. Pasan a depender del formato de fecha (PF-12).                                                                                                                 |
| `src/server/time/index.ts` · `formatDuration`           | Hoy fija `h:mm`. Pasa a depender del formato de duración (PF-20).                                                                                                                      |
| `src/server/time/index.ts` · `formatElapsed`            | **No se toca**: el contador sigue en `h:mm:ss` (PF-22).                                                                                                                                |
| `src/server/time/index.ts` · `weekBounds`               | Recibe `weekStartsOn` por parámetro y hoy **nadie se lo puede dar**. Es el bloqueo que el perfil levanta.                                                                              |
| `src/server/time/index.ts` · `parseClockInput`          | Hoy rechaza `1pm` siempre. Con formato de 12 horas tiene que aceptarlo (PF-14).                                                                                                        |
| `src/modules/time-entry/components/day-group.tsx`       | Llama a `formatDuration` en el cliente para el total del día.                                                                                                                          |
| `src/components/layout/user-menu.tsx`                   | Foto, menú desplegable y enlace al perfil (PF-10, PF-30).                                                                                                                              |
| `src/app/(app)/layout.tsx` y `src/app/globals.css`      | El tema: la clase `dark` ya existe, falta encenderla antes del primer pintado (PF-23, PF-24).                                                                                          |
| `src/server/permissions/index.ts`                       | Una acción nueva para el perfil propio. El primer día de la semana puede reusar `team.manage` (PF-17).                                                                                 |
| `src/server/time/time.test.ts`                          | Los casos de formato dan por sentados los formatos fijos de hoy.                                                                                                                       |
| `docs/parity/time-tracker.md`                           | TT-02, TT-20, TT-44, TT-48 y P-13 se reabren por diseño: dicen «del workspace» y pasan a decir «de la persona».                                                                        |

**Lo que no se toca.** La base sigue guardando instantes en UTC, así que ningún
dato se migra. `workspace.timezone` se queda para el cron (PF-05).
`elapsed-counter.tsx` se queda como está (PF-22). El ADR 0005 tampoco cambia:
la hora de pared seguirá viajando como hora de pared, y lo único distinto es
qué zona horaria recibe `instantFromLocal`, que es justo lo que ese ADR
anticipó.

## 11. Casos borde

| ID    | Caso                                             | Comportamiento esperado                                                                                                    |
| ----- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| PF-38 | Cambiar la zona horaria con entradas ya cargadas | Ningún instante se toca. Los grupos de día se recalculan y una entrada puede cambiar de día, igual que TT-106.             |
| PF-39 | Cambiar la zona horaria con un timer corriendo   | El timer sigue corriendo y el transcurrido no cambia: se mide entre instantes. Lo que puede cambiar es en qué día aparece. |
| PF-40 | Cambiar el primer día de la semana               | Ninguna entrada se mueve; los totales de la semana se recalculan y una entrada puede pasar de una semana a otra.           |
| PF-41 | Un admin cambia el primer día de otra persona    | Esa persona lo ve al recargar. No hay aviso, igual que cualquier otro cambio hecho desde otro dispositivo (TT-40).         |
| PF-42 | Cambiar el formato de duración                   | Es del workspace: lo ve todo el equipo. Ninguna duración guardada cambia, solo cómo se escribe.                            |
| PF-43 | Zona horaria con cambio de horario de verano     | Vale lo mismo que TT-97 y el ADR 0005: la duración es la real y puede no coincidir con la resta visual de las dos horas.   |
| PF-44 | Persona sin foto en Google                       | Se muestran las iniciales del nombre. `image` ya es nulable en la sesión.                                                  |
| PF-45 | El nombre cambia en Google                       | Si la persona nunca lo editó, llega el de Google en el siguiente inicio de sesión. Si lo editó, gana el editado (PF-08).   |
| PF-46 | Membresía desactivada                            | La pantalla de perfil queda en solo lectura con el aviso de TT-92. Los valores se siguen viendo.                           |

## Pendientes de definición del equipo

Numeración propia de este documento. Para no confundirla con la del rastreador,
se cita como `perfil P-nn`.

### Abiertos

| ID   | Punto                                                                                                                                                                                                       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-02 | «Inicio del día» (PF-15): la documentación lo nombra y no lo explica. Queda apuntado al slice del calendario, que es quien lo va a necesitar. Si ahí resulta que no toca nada de la fase 1, se cierra solo. |
| P-09 | La lista de verificación contra el workspace real. Está abajo, entera, para resolverla en una sentada.                                                                                                      |

### P-09, la lista de verificación

Todo lo marcado como _no verificado_ en este documento, junto y con qué hay que
mirar en cada caso. Es lo único que necesita una cuenta de Clockify a mano.

- **PF-02** — Qué rol puede cambiar el formato de duración del workspace.
- **PF-05** — Que no exista ningún ajuste de zona horaria a nivel de workspace.
  Es una ausencia, no una afirmación de la documentación.
- **PF-11** — Si la zona horaria se detecta del navegador al crear la cuenta.
- **PF-12** — Qué opciones de formato de fecha ofrece y cuál viene puesta.
- **PF-11, PF-12, PF-13, PF-16, PF-23** — Con qué valores arrancan la zona
  horaria, el formato de fecha, el de hora, el primer día de la semana y el
  tema. Los predeterminados nuestros ya están decididos (P-03); esto es para
  saber si coinciden.
- **PF-15** — Qué hace «inicio del día». Es lo que destraba P-02.
- **PF-22** — Si el contador del timer corriendo respeta el formato de duración
  o es siempre `h:mm:ss`. Es la suposición de una decisión ya tomada.
- **PF-23** — Si existe «seguir al sistema» como tercera opción de tema.
- **PF-26** — Si «agrupar entradas similares» viene encendido o apagado.

### Cerrados

Se dejan con su identificador porque el documento y los contratos los citan.

| ID   | Decisión                                                                                                                                                                                                                                             |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-01 | Formato de duración: compacto `h:mm` como predeterminado, completo `hh:mm:ss` como la otra opción, decimal `fuera de alcance` por ser de plan pago (PF-20). Decidido el 2026-10-02.                                                                  |
| P-03 | Predeterminados fijados el 2026-10-02, **como decisión del equipo y no como relevamiento**: zona horaria la del workspace (PF-11), fecha `dd/MM/yyyy`, hora de 24 horas, primer día de la semana lunes, tema «seguir al sistema», duración compacta. |
| P-04 | El tema «seguir al sistema» entra y es el predeterminado, anotado como divergencia si Clockify no lo tiene (PF-23). Decidido el 2026-10-02.                                                                                                          |
| P-05 | El nombre es editable dentro de la aplicación (PF-07) y la foto sale de Google en solo lectura (PF-09), por el costo de la subida de archivos. Decidido el 2026-10-02.                                                                               |
| P-06 | El contador del timer sigue en `h:mm:ss`; el formato manda en los totales y en las filas (PF-22). Decidido el 2026-10-02, con la suposición anotada porque no se pudo verificar.                                                                     |
| P-07 | Días laborables y capacidad semanal quedan fuera del perfil y van a la pantalla de equipo, en la fase 2 (PF-19). Decidido el 2026-10-02.                                                                                                             |
| P-08 | `workspace.timezone` se queda y pasa a tener un solo trabajo: fijar el día de los trabajos de cron. La zona horaria de la interfaz sale de la persona (PF-05). Decidido el 2026-10-02.                                                               |
