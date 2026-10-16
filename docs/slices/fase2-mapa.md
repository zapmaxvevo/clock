# Fase 2: mapa de slices

Qué entra en la fase 2 —la administración—, en qué orden va y de qué depende cada
parte. No es un contrato: los contratos se escriben de a uno, en
`docs/slices/fase2-<slice>-<nombre>.md`, cuando llega el turno del slice.

Fuentes: [`equipo.md`](../parity/equipo.md) (EQ-01 … EQ-113),
[`workspace.md`](../parity/workspace.md) (WS-01 … WS-73),
[`proyectos.md`](../parity/proyectos.md) (los 24 identificadores que su §14.1
manda a la fase 2), las deudas que le dejan el
[mapa de la fase 1](fase1-mapa.md) (§5) y el
[del núcleo de reportes](nucleo-reportes-mapa.md) (§4 y §6), y
[`estado-fase1.md`](estado-fase1.md).

Decisiones del usuario del 2026-10-16 que este mapa da por tomadas y no vuelve a
abrir:

- **Equipo**: un member no ve `/equipo` (P-01); todos entran por invitación,
  también el dominio de la empresa (P-02); owner y admin invitan correos de otro
  dominio desde la pantalla (P-03); Clock no manda correo, muestra un texto para
  avisar a mano (P-04); una persona inactiva no entra (P-05); desactivar
  conserva el rol (P-06); solo el owner desactiva o reactiva a un admin (P-07);
  «Quitar del equipo» entra, solo para el owner y solo para quien no tiene horas
  (P-08); capacidad y días laborables, fuera (P-09).
- **Workspace**: sin logo (P-01); entra el primer día de la semana por defecto
  del workspace, solo para las personas nuevas (P-02); «quién crea proyectos y
  clientes» queda fijo (P-03); cualquier miembro crea tareas en los proyectos que
  ve (P-04); se borran las columnas sin efecto, también `logo_url` y
  `who_creates_projects`, que P-01 y P-03 dejan sin efecto (P-05); días
  laborables y capacidad, fuera (P-06); producción arranca con el formato de
  duración completo, `06:00:00` (P-07); se acepta el diseño de `/configuracion`
  (P-08).
- **El orden**: primero E1 y E2 de equipo, después WS1 y WS2 de configuración,
  después el resto de equipo y por último la administración de proyectos,
  clientes, tareas y etiquetas. Grupos, solo si existen en el plan Free (P-10 de
  `equipo.md`, sin verificar).

## 1. Qué entra y qué no

**Entra**:

- **Equipo**: invitar y revocar, el ingreso por invitación, desactivar y
  reactivar (con RP-60 y RP-63, que el núcleo dejó para acá), transferir la
  propiedad, el primer día de la semana de cada persona, búsqueda y filtro por
  rol, quitar a quien no tiene horas y, si P-10 los confirma en Free, los grupos.
- **Configuración del workspace**: la pantalla `/configuracion` con el nombre,
  el formato de duración y el primer día por defecto; y la baja de las columnas
  sin efecto.
- **Proyectos**: editar, archivar, restaurar y borrar proyectos, clientes,
  tareas y etiquetas; la lista completa de proyectos; los proyectos privados con
  sus miembros y responsables; la regla de asignados de tarea; los favoritos; y
  el cambio de `task.create` (WS-40). El «archivado masivo» que entra es el de
  PR-06 —archivar un cliente ofrece archivar sus proyectos—; la edición masiva de
  proyectos es paga (PR-32).
- **Planilla**: las plantillas (TS-62 … TS-66), que timesheet P-09 mandó a la
  fase 2. Ver la pregunta 3 de la §7.

**No entra**:

- Por plan pago o por el documento de paridad: EQ-09, EQ-10, EQ-15, EQ-27,
  EQ-28, EQ-36, EQ-49, EQ-52 … EQ-54, EQ-69, EQ-72 (P-09), EQ-73, EQ-74;
  WS-07, WS-59 y WS-60 (sin logo, workspace P-01), WS-09 (P-06), WS-10,
  WS-19 … WS-25, WS-27 … WS-35, WS-37, WS-38, WS-43 … WS-47; PR-11, PR-28,
  PR-29 (estimaciones, presupuesto, tarifas), PR-32 … PR-34, PR-41; TS-55 …
  TS-61 y TS-67 … TS-74.
- Fase 3: EQ-66 (grupos en los reportes).
- Ya cumplido o sin trabajo nuevo: EQ-02 y EQ-34 (R8, con P-01), EQ-35 (R8,
  ADR 0023); WS-11, WS-12, WS-13, WS-18, WS-36, WS-39 (P-03, queda fijo),
  WS-41, WS-42 (congelado, ADR 0020) y WS-48.

## 2. El problema de orden: el ingreso en producción

Producción tiene personas reales y horas importadas de Clockify por corridas
parciales (`ops/importar-clockify`). Hoy hay cuatro grupos:

1. **Quien ya entró**: tiene `user`, `account` y una membresía `active` que creó
   `ensureWorkspaceContext`. El owner está acá.
2. **Las seis desactivadas en Clockify**: la importación les creó `user` sin
   `account` y una membresía `inactive`, con sus horas.
3. **Las activas en Clockify que todavía no entraron**: sin `user`, sin
   membresía y sin horas cargadas. Sus horas las carga la corrida del script que
   sigue a su primer ingreso. Nicolas Veliz es de otro dominio y hoy necesita
   estar en `EXTERNAL_INVITE_EMAILS`.
4. **Los invitados externos de la variable** `EXTERNAL_INVITE_EMAILS`.

Si el ingreso pasa a exigir invitación en el mismo despliegue que trae la
pantalla de invitar, el grupo 3 queda afuera hasta que alguien lo invite, y en
la ventana entre el despliegue y la invitación no puede entrar. **Por eso E1 se
parte en dos**:

- **E1a trae las invitaciones sin cerrar la puerta**: el dominio sigue entrando
  solo, como hoy, y una invitación abre además la entrada a un correo de otro
  dominio (P-03). Con E1a en producción, el owner invita al grupo 3 —Nicolas
  incluido— y a cada correo de la variable que todavía no tenga membresía.
- **E1b cierra la puerta**: entra quien ya tiene membresía o tiene una
  invitación pendiente; la variable deja de leerse.

Lo que cada grupo vive con eso:

- **Grupo 1**: nada cambia (EQ-31). No hay invitación retroactiva.
- **Grupo 2**: nada cambia mientras sigan inactivas. Si alguna se reactiva, su
  `user` no tiene `account` y no puede entrar: es el caso de EQ-110, que resuelve
  E2.
- **Grupo 3**: invitado en E1a; entra en cualquier momento, antes o después de
  E1b, y en ese momento nace su membresía `active`. La corrida siguiente del
  script la encuentra como `member` y carga sus horas, como con quien ya entró.
  Nadie pierde horas: no hay horas suyas en la base hasta esa corrida.
- **Grupo 4**: invitado en E1a si no tiene membresía; si ya la tiene, entra por
  ella. Después de E1b el usuario saca la variable de Vercel.

**Antes de desplegar E1b**, el usuario corre en producción una consulta
informativa, como la de R1: las membresías con su correo, su estado y sus
horas, y las invitaciones pendientes. La compara con la lista de activas de
Clockify (`personas.json`, fuera del repositorio): nadie activo en Clockify
puede quedar sin membresía y sin invitación. Si la consulta encuentra a alguien
que entró por la deuda y no debía, se desactiva con E2 o se quita con E6.

## 3. El mapa

Cada slice es vertical y se puede desplegar solo, salvo WS0, que es un paso de
esquema sin pantalla, y WS2a, que no cambia nada visible. El orden es el que
pidió el usuario, con las dependencias de la tabla.

| Slice | Nombre                                        | Depende de                               |
| ----- | --------------------------------------------- | ---------------------------------------- |
| E1a   | Invitar y revocar                             | —                                        |
| E1b   | El ingreso exige invitación                   | E1a, y las invitaciones hechas en prod   |
| E2    | Desactivar y reactivar                        | E1b                                      |
| WS0   | Las columnas sin efecto                       | —                                        |
| WS1   | Configuración: la pantalla y el nombre        | — (WS0 antes, por el árbol)              |
| WS2a  | Formato de duración: el dato y sus lectores   | WS0 (el árbol)                           |
| WS2b  | Formato de duración: el selector y el reporte | WS1, WS2a                                |
| E3    | Transferir la propiedad                       | E1b, E2                                  |
| E4    | El primer día de la semana                    | E1b, E2, WS1                             |
| E5    | Búsqueda y filtro por rol                     | E2                                       |
| E6    | Quitar del equipo                             | E1b, E2                                  |
| E7    | Grupos                                        | E2, P-10 verificado (ver §7, pregunta 2) |
| P1    | Editar proyectos y la lista completa          | —                                        |
| P2    | Archivar, restaurar y borrar proyectos        | P1                                       |
| P3    | Clientes                                      | P2                                       |
| P4    | Tareas                                        | P2                                       |
| P5    | Etiquetas                                     | P2                                       |
| P6    | Proyectos privados, miembros y responsables   | P1, E2                                   |
| P7    | Asignados de tarea                            | P4, P6                                   |
| P8    | Favoritos                                     | —                                        |
| P9    | Grupos en proyectos y tareas                  | E7, P6, P7                               |
| T1    | Plantillas de la planilla                     | —                                        |
| T2    | Plantillas con tiempo                         | T1                                       |

E2, E3, E4, E5 y E6 tocan la misma pantalla, el mismo menú de fila y el mismo
service: van en serie. P1 a P7 tocan `/proyectos` y el módulo `project`: van en
serie salvo que el contrato de P1 separe las pantallas (ver P1).

### Lo que vale para todos

- **Toda decisión de acceso nueva entra en `can()`**, en la unión `Action` y en
  sus dos tablas. Una excepción solo del owner es una acción propia, como
  `team.admin.revoke` (ADR 0023), no una regla por rol dentro de `team.manage`.
- **Toda mutación de equipo relee bajo bloqueo** la membresía de quien actúa y
  la de la fila, como `changeRole` (D-R8-7): el `Actor` de la sesión se armó en
  otra transacción.
- **Producción tiene datos reales.** Cada slice que cambia el esquema trae su
  consulta informativa previa, que corre el usuario, y su reversión como
  migración hacia adelante, como R1.
- **Vercel Hobby y Neon**: sin correo (P-04), sin cron nuevo (las invitaciones
  no vencen, EQ-25) y sin estado en memoria: lo que cambia para otra persona se
  ve en su pedido siguiente. Los previews usan la rama `preview` de Neon con
  datos sintéticos; desde E1b, quien prueba un preview necesita una invitación
  o una membresía en esa base.

### E1a — Invitar y revocar

Cubre EQ-04, EQ-12 … EQ-14, EQ-16, EQ-19 … EQ-23, EQ-25, EQ-26 (P-04: el texto
para avisar a mano, con «Copiar»), la parte de EQ-32 que lleva la lista de
externos a la base, EQ-76 … EQ-81, EQ-90, EQ-93, EQ-97, EQ-105 y EQ-106.

**Cambia el esquema**: la tabla de invitaciones por correo. `external_invite` ya
tiene la forma (workspace, correo, quién invitó, revocada) y no la usa nadie;
el contrato decide si se extiende —aceptada, quién revocó— o se reemplaza.
`member.invite` ya existe con owner y admin; revocar es otra acción o la misma,
lo decide el contrato.

**El ingreso cambia solo para los externos**: una invitación vigente habilita un
correo de otro dominio, además de la variable. El dominio sigue entrando sin
invitación hasta E1b. Mientras convivan la tabla y la variable, la regla de
acceso lee las dos, en un solo lugar (`access.ts` o su reemplazo).

**Va primero** porque es lo que permite invitar al grupo 3 de la §2 antes de
cerrar la puerta, y porque Nicolas Veliz entra por acá sin tocar la variable.

Riesgos:

- **El login lee la base**: `mapProfileToUser` y el gancho de sesión pasan a
  consultar invitaciones. Una vez por ingreso o por inicio de sesión, no por
  pedido.
- **Una sola invitación por workspace y correo** (EQ-106), con el correo
  recortado y en minúsculas (EQ-105). El reintento es seguro por el índice único
  (EQ-19), sin id del cliente.
- **Todo o nada** con hasta 50 correos (EQ-14, ADR 0011).
- **El texto para avisar** nombra la dirección de Clock: sale de
  `BETTER_AUTH_URL`, que en un preview puede no ser la del preview.

ADR: **dónde vive una invitación y dónde se corta el ingreso** (EQ-17, EQ-18,
EQ-29). Se escribe con el contrato de E1a porque lo usan E1a y E1b: la tabla por
correo, si `invited` de `membership_status` sigue teniendo uso, en qué punto del
login se corta (`mapProfileToUser`, el gancho de sesión o
`ensureWorkspaceContext`) y la transición con la variable.

### E1b — El ingreso exige invitación

Cubre EQ-17, EQ-18, EQ-24, EQ-29 … EQ-31, el resto de EQ-32 (la variable deja de
leerse), EQ-33, EQ-91, EQ-107 … EQ-109, EQ-111 y EQ-113. **Cierra la deuda de
`ensureWorkspaceContext`** que arrastran el slice 1, el mapa de la fase 1 (§5) y
el del núcleo (§6).

Sin tablas nuevas. Cambia `ensureWorkspaceContext`: la membresía nueva nace solo
de una invitación pendiente, que queda aceptada en la misma transacción, y
`WORKSPACE_OWNER_EMAIL` vale solo para el arranque, cuando no hay workspace
(EQ-30).

Depende de E1a y de una condición operativa: **las invitaciones del grupo 3 y de
la variable hechas en producción**, revisadas con la consulta de la §2. Se
separa de E1a para que esa ventana exista y para que el cambio de mayor riesgo
—quién entra— se despliegue y se revierta solo.

Riesgos:

- **Dejar afuera a alguien**: lo cubre la §2. La reversión de E1b es volver a
  desplegar E1a; las invitaciones quedan.
- **Un ingreso rechazado no debe dejar una fila `user` que otra vía convierta en
  membresía.** El script de importación crea la membresía de cualquier `user`
  sin membresía que esté en `personas.json` (`newMembership`). El ADR de E1a
  elige un corte que no deje esa fila o lo dice como consecuencia.
- **La sesión de los e2e**: el plugin de sesión de prueba crea personas sin
  invitación. El arnés de e2e y el de integración siembran la membresía o la
  invitación; si no, toda la suite cae en E1b.
- **`membership.created_at` es la fecha de activación** (EQ-33): la membresía
  nace al aceptar. El comentario de `WorkspacePerson.joinedAt`
  (`src/modules/workspace/service.ts`) dice que pasaría a ser la de la
  invitación; se corrige, y la decisión de R9 sobre quién entró después del
  período no cambia.
- **WS-08 escribe en la misma función** (el primer día por defecto, E4): E1b
  deja un solo lugar donde nace una membresía, para que E4 lo complete.

### E2 — Desactivar y reactivar

Cubre EQ-03 (el menú de la fila), EQ-05, EQ-06, EQ-11, EQ-37 … EQ-48 (P-05,
P-06, P-07), EQ-82 … EQ-85, EQ-92, EQ-94, EQ-98 … EQ-104 y EQ-110; y RP-60 y
RP-63 de `reportes.md`. **Reemplaza el procedimiento SQL** del mapa del núcleo
(§5).

Sin tablas nuevas. **Acción nueva** solo del owner para desactivar o reactivar
a un admin (P-07), con la forma de `team.admin.revoke` (ADR 0023); el resto con
`team.manage`. El ingreso rechaza a una persona inactiva (P-05) en el mismo
corte de E1b, con EQ-92; TT-92 sigue cubriendo el pedido en vuelo.

Depende de E1b, porque P-05 vive en el corte del ingreso y porque, sin E1b, una
persona quitada o desactivada podía volver a nacer por la deuda.

Riesgos:

- **Escribe en datos de otros módulos**: detiene el timer de la persona
  (`time_entry`, con quien desactiva como actor del audit log, EQ-43) y borra
  sus filas de `session`, que son de Better Auth (EQ-41). El ADR 0010 deja a un
  service llamar a otro solo para validar y leer.
- **EQ-110**: el procedimiento SQL borró `account`, y la importación creó seis
  `user` sin `account`. Reactivada, esa persona no puede entrar. El contrato
  trae una consulta previa —membresías inactivas cuyo `user` no tiene
  `account`— y la salida que fije su ADR.
- **La carrera con la propia persona**: desactivar mientras ella detiene su
  timer. El orden de los bloqueos lo fija el contrato.
- **Dos lecturas de personas**: R4 lee las de `workspace`
  (`listWorkspacePeople`) y R8 las de `team`. Con las inactivas en la lista de
  equipo se unifican, o el contrato dice por qué no.
- **Revalidación**: `/equipo`, el layout y el catálogo de personas del reporte
  (EQ-101).

ADR: **desactivar escribe en otros módulos** (el timer y las sesiones; extiende
el 0010) y **una fila `user` sin cuenta de Google** (la salida de EQ-110, que
cubre también a las seis importadas y toca P-11 de `perfil.md`). Los dos con el
contrato de E2.

### WS0 — Las columnas sin efecto

Cubre la §14 de `workspace.md` con workspace P-05: borra `require_project`,
`require_task`, `require_description`, `require_tag`, `force_timer`,
`timesheet_enabled`, `rounding_minutes`, `who_sees_rates` y
`who_creates_projects` de `workspace_settings`, y `currency` y `logo_url` de
`workspace`. Sin pantalla y sin permisos. Si la pregunta 1 de la §7 lo extiende,
suma `membership.weekly_capacity_minutes`.

No depende de nada. **Va antes de WS1 y de WS2a** porque los tres cambian
`workspace_settings` y sus migraciones chocan en el diario de `drizzle-kit`; es
más barato que el borrado entre primero y solo.

Riesgos:

- **El orden de despliegue es el inverso del habitual**: las lecturas con
  `select()` nombran todas las columnas del esquema, así que una instancia
  vieja falla si la columna ya no está. Primero se despliega el código que ya no
  las nombra; después corre la migración.
- **Lo que las nombra** se ajusta en el mismo slice: diez archivos de `src/`
  además del esquema, entre ellos el test del slice 9 que afirma el valor de
  `who_creates_projects` (criterio 11, PR-59) y el comentario de
  `project.create` y `client.create` en `can()`, que remite a esa columna.
- **`who_creates_projects` sale con su camino previsto**: el ADR 0009 decía
  cómo entraría en `can()` si se volvía editable. Con workspace P-03 queda fijo
  en «cualquiera», que es lo que `can()` ya decide por rol; si alguna vez se
  vuelve editable, la columna vuelve con ese ADR.
- **La reversión** las vuelve a crear con su `default`; no se pierde nada,
  porque no tenían efecto (`logo_url` está vacía).

ADR: **borrar columnas, primero el código y después la migración**, con el
contrato de WS0.

### WS1 — Configuración: la pantalla y el nombre

Cubre WS-01 … WS-06, WS-49 … WS-55, WS-58, WS-61 … WS-63, WS-64 (el nombre),
WS-65 y WS-71 … WS-73. Sin cambios de tablas. `workspace.settings.update` ya
existe con owner y admin, y nadie la usa.

**Va acá por el orden del usuario**; no depende de equipo. Deja armado el módulo
`workspace` con su `schema.ts`, sus actions y sus componentes, que hoy no tiene,
y las dos secciones de la pantalla (WS-03): «General» con el nombre y
«Registro de tiempo», que llena WS2b.

Riesgos:

- **El nombre está en el encabezado del shell**: cambiarlo revalida el layout,
  no solo `/configuracion` (WS-64).
- **WS-73**: la pantalla no crea la fila de ajustes si falta.

### WS2a — Formato de duración: el dato y sus lectores

Cubre WS-16, WS-17, WS-66 … WS-68 y PF-22. **Cambia el esquema**: la columna del
formato en `workspace_settings`, compacta por omisión (WS-15). Sin selector y
sin cambio visible: el workspace de producción sigue en compacto hasta WS2b.

Lleva el formato a `DisplayFormats` y lo resuelve en `timeSettingsOf`, como
anticipa el ADR 0012, y hace que **todos** los consumidores lo respeten, en el
servidor y en el navegador: rastreador, planilla, calendario y sus totales. El
contador del timer sigue en `h:mm:ss`.

**Se parte de WS2b** porque es el único slice de configuración que toca
pantallas ya construidas, y porque así producción no muestra formatos mezclados:
el reporte y las exportaciones se pasan en WS2b, junto con el selector, y nadie
puede elegir el completo antes de que todo lo respete.

Riesgos:

- **Un consumidor que se escapa** muestra `1:30` en una pantalla y `01:30:00` en
  otra. El contrato enumera los consumidores —la tabla de la §10 de
  `perfil.md` y los usos de `formatDuration`— y prueba cada pantalla con los dos
  valores sembrados.
- **La regla del compacto (WS-16, WS-68)**: una entrada con segundos se muestra
  en minutos y el total suma segundos. El ADR fija si el formato solo cambia lo
  que se muestra o también cómo se suma, y la escribe en `workspace.md`.

ADR: **el formato de duración es del workspace**, que extiende el 0012 con un
formato que no es de la persona y fija la regla de WS-16. Con el contrato de
WS2a.

### WS2b — Formato de duración: el selector y el reporte

Cubre WS-14, WS-15, WS-56, WS-62, WS-64 (el formato), WS-69, y PF-02, PF-20 y
PF-31 de `perfil.md` (el perfil muestra el valor del workspace en solo
lectura). Sin cambios de esquema.

Trae el selector de «Registro de tiempo», el reporte y las columnas de duración
de las exportaciones con el formato; «Horas» sigue en decimal (D-R6-9). **Con
WS2b desplegado, el owner pone producción en completo** (P-07); si conviene una
migración de datos en lugar del selector, lo decide el contrato.

Riesgos:

- **El PDF** (R7): `hh:mm:ss` es más ancho que `h:mm`, y los anchos de columna
  de `pdf-layout.ts` están medidos. Se mide de nuevo con el completo.
- **Los e2e** que leen duraciones siguen con el compacto por omisión; los del
  completo siembran el ajuste en una base propia, porque cambiarlo en la base
  común cambia lo que ven los demás specs.

### E3 — Transferir la propiedad

Cubre EQ-55 … EQ-59, EQ-86 y EQ-112. Sin cambios de esquema;
`workspace.transfer` ya existe con `["owner"]`. Una transacción con las dos
membresías y el workspace bloqueados: `workspace.owner_id`, la membresía nueva
en `owner`, la anterior en `admin` y el audit log.

Depende de E1b, que deja `WORKSPACE_OWNER_EMAIL` solo para el arranque (EQ-30,
EQ-113): sin eso, la variable podría crear un segundo owner. Depende de E2 por el
menú de la fila y porque transferir a una inactiva responde EQ-86.

Riesgos: **quién lee `owner_id`**. El script de importación lo usa como autor
del catálogo y exige que tenga membresía; el contrato enumera los lectores.

### E4 — El primer día de la semana

Cubre EQ-70, EQ-71 y EQ-75 (la persona, desde la tabla de equipo, con
`team.manage`, PF-17), y WS-08, WS-57 y WS-70 (el valor por defecto del
workspace en «General» de `/configuracion`, solo para las personas nuevas,
workspace P-02). **Cierra la deuda del primer día sin pantalla** que el slice 5
y el 7 dejaron (mapa de la fase 1, §3 slice 7). **Cambia el esquema**: la
columna del valor por defecto en `workspace_settings`.

Junta las dos caras del mismo dato, como recomienda `workspace.md` §16. Depende
de WS1 (la pantalla), de E1b (el valor por defecto se copia donde nace la
membresía, que E1b deja en un solo lugar) y de E2 (la columna y el menú).

Riesgos: el dato se sigue leyendo solo con `weekStartOf`; cambiarlo a alguien
con la planilla abierta se ve en su pedido siguiente; el texto de PF-31 en
`/perfil` deja de decir que no hay pantalla.

### E5 — Búsqueda y filtro por rol

Cubre EQ-07, EQ-08 (el rol; el grupo llega con E7) y EQ-100. Sin esquema ni
permisos. Chico y sin riesgo: el buscador y los filtros se combinan con el de
estado de E2 y viven en la URL (ADR 0008).

### E6 — Quitar del equipo

Cubre EQ-50, EQ-51 (P-08), EQ-87 y EQ-88. **Acción nueva** solo del owner. Borra
la membresía de una inactiva sin entradas; sus filas de `project_member` y
`task_assignee` caen en cascada, y `user` y `account` quedan (EQ-108).

Depende de E2 (solo se quita a una inactiva) y de E1b (sin E1b, el próximo
ingreso recrea la membresía). Riesgos: la clave `restrict` de `time_entry` hacia
`membership` es la red, pero el service responde EQ-87 antes; el audit log
guarda la fila borrada.

### E7 — Grupos

Cubre EQ-01 (la pestaña «Grupos»), EQ-08 (el filtro por grupo), EQ-60 … EQ-63,
EQ-67, EQ-68, EQ-89, EQ-95 y EQ-96. **Cambia el esquema**: el grupo y sus
personas. Si es `team.manage` o una acción propia lo decide el contrato
(EQ-68).

**Precondición, no decisión**: la sesión del usuario en Clockify muestra la
pestaña «Groups» en el plan Free (P-10 de `equipo.md`). Si no está, E7 y P9
salen de la fase 2.

Riesgo: **en todo el bloque de equipo un grupo no tiene efecto.** Con todos los
proyectos públicos (PR-17) y sin asignados (PR-37), un grupo cambia algo recién
con P6, P7 y P9. Es el «dato sin efecto» del ADR 0009. Ver la pregunta 2 de la
§7.

### P1 — Editar proyectos y la lista completa

Cubre la edición de PR-12 (nombre, cliente, color, nota), PR-21 en un proyecto
ya creado (la deuda del 11a: el facturable por defecto no se ve ni se edita
después del alta), PR-31 (columnas, buscador y filtro de estado), PR-55 y PR-56
en lo que es editar, PR-89 y PR-95. **Acción nueva**: editar un proyecto, para
owner, admin y su responsable, por el `ProjectResource` que ya lleva la marca.

Va primero del bloque porque es la lista sobre la que se archiva, se borra y se
filtra. Lo que una edición le hace a las entradas ya está construido y probado
desde el slice 10 (PR-101 … PR-103).

Riesgos:

- **Dónde vive la administración de un proyecto**: un diálogo en `/proyectos` o
  una pantalla propia (`/proyectos/[id]`) con tareas y acceso. Lo decide el
  contrato de P1, y P4, P6 y P7 cuelgan de esa decisión; con pantallas
  separadas, P3, P4 y P5 pueden ir en paralelo.
- **Cambiar el cliente choca con la unicidad** (PR-50): responde PR-77.
- **Editar el facturable por defecto no toca entradas** (TT-14).

### P2 — Archivar, restaurar y borrar proyectos

Cubre PR-22 (con la opción de marcar sus tareas como hechas), PR-24 … PR-26,
PR-81 y PR-92. **Acciones nuevas**: archivar y borrar, para owner, admin y el
responsable (PR-56).

Depende de P1 (el filtro de estado). Riesgos:

- **El borrado son dos sentencias en una transacción**: primero las tareas,
  después el proyecto (§8 de `proyectos.md`); la base rechaza el borrado
  directo con tareas usadas en entradas.
- **El audit log guarda la copia** de lo borrado.
- **La base de e2e** acumula proyectos que no se podían borrar (deuda del
  slice 9): desde P2 los specs pueden limpiar los suyos.

### P3 — Clientes

Cubre PR-01 en la edición, PR-04 (crear el cliente desde el diálogo de
proyecto), PR-05 … PR-08, PR-86 (la pantalla de clientes vacía) y el mensaje de
PR-111. **Acciones nuevas** de editar, archivar y borrar clientes, para owner y
admin (PR-05, PR-08).

Depende de P2: archivar un cliente ofrece archivar sus proyectos (PR-06), todo o
nada (ADR 0011), con la misma escritura de P2. Riesgo: **PR-111**, el borrado
que choca con un proyecto homónimo sin cliente, se traduce a un mensaje propio
en lugar de un error de Postgres.

### P4 — Tareas

Cubre PR-38, PR-39, PR-40 y PR-58 con el cambio de WS-40 (workspace P-04: crea
tareas toda membresía activa que ve el proyecto), PR-104 y renombrar una tarea.
**Cambia `task.create`** y suma editar y borrar tareas, para owner, admin y el
responsable («Only admins and project managers can delete tasks», PR-40).

Depende de P2 (PR-22 ya marca tareas como hechas). Riesgos: revierte el
criterio 7 del contrato del slice 9, donde un `member` que no es responsable
recibe PR-84, y sus tests; una tarea hecha sale del selector y la entrada que la
tiene la conserva (PR-65, ya construido).

ADR: **crea tareas quien ve el proyecto**, con el contrato de P4: cambia la
regla de PR-40 que el slice 9 adoptó por coherencia y no por producto.

### P5 — Etiquetas

Cubre PR-44 (editar y borrar, solo admins), PR-45, PR-46 y PR-81 para
etiquetas. Reemplaza la sección de solo lectura de PR-112 por la lista con su
filtro y sus acciones, en el módulo `project` (ADR 0016). **Acciones nuevas** de
editar, archivar y borrar etiquetas.

Depende de P2 (la misma forma de archivar y borrar). Riesgo: borrar quita la
etiqueta de las entradas por la cascada de la unión (PR-69, ya construido); la
confirmación dice en cuántas entradas está.

### P6 — Proyectos privados, miembros y responsables

Cubre PR-17 (marcar un proyecto como privado), PR-18, PR-19 (nombrar y quitar
responsables), PR-56 en el acceso, y EQ-45 del lado de los proyectos (una
inactiva conserva su acceso y no se ofrece para altas nuevas). **Acción nueva**
para administrar el acceso de un proyecto.

Depende de P1 (dónde vive la administración del proyecto) y de E2 (el estado de
las personas que se ofrecen). **Es la primera vez que existen proyectos
privados**: hasta acá el filtro de PR-61 no escondía nada.

Riesgos:

- **Filtrar nombres**: todo catálogo de proyectos que vea un `member` pasa por
  `project.view` o `project.track` —el selector, la planilla, el calendario y
  los filtros del reporte, que arma `project` (ADR 0010)—. El contrato lo
  prueba con un privado ajeno en cada pantalla.
- **PR-62 pendiente**: con privados, el selector de cliente del diálogo de
  proyecto mostraría clientes que la persona no ve. Es una decisión de paridad
  del contrato de P6 (§14 de `proyectos.md`).
- **PR-71** (quien sale de un privado ve sus entradas) ya lo construyó el
  slice 10.

### P7 — Asignados de tarea

Cubre PR-36 (los asignados como campo) y PR-37: **la regla de acceso se empieza
a aplicar**. Hasta acá toda tarea es «cualquiera» (P-23). La tabla
`task_assignee` existe vacía desde el slice 9.

Depende de P4 (dónde se administra una tarea) y de P6 (los miembros del
proyecto, entre los que se eligen). Riesgos: el selector, la planilla y la
edición masiva (ADR 0017) validan la tarea también por asignado; una entrada que
ya tiene una tarea de la que la persona dejó de ser asignada la conserva, como
PR-71.

ADR: **los asignados de una tarea en `can()`**, con el contrato de P7: hoy
`can()` no tiene un recurso de tarea.

### P8 — Favoritos

Cubre PR-27 y WS-26: una tabla por persona y proyecto (y tarea, si el contrato
lo confirma), sin interruptor de workspace. Sin dependencias; toca los
selectores del rastreador, la planilla y el calendario, que comparten
`picker-model`.

### P9 — Grupos en proyectos y tareas

Cubre EQ-64, EQ-65 y PR-20: un grupo da acceso a un proyecto privado y puede ser
asignado de una tarea. Depende de E7, P6 y P7.

ADR: **la pertenencia por grupo en el recurso del proyecto** (EQ-64), con el
contrato de P9: el `ProjectResource` lleva hoy solo la fila directa de
`project_member`.

### T1 — Plantillas de la planilla

Cubre TS-62, TS-63, TS-65 y TS-66 sin tiempo: guardar las filas de una semana
como plantilla personal y aplicarlas. **Cambia el esquema**: la plantilla y sus
filas. Las filas sin horas siguen siendo del navegador (TS-19).

### T2 — Plantillas con tiempo

Cubre TS-64 y la casilla de TS-62 que guarda el tiempo. Depende de T1 y de
timesheet P-15, abierto: si la plantilla guarda el total de cada celda o las
entradas, y a qué hora empiezan las entradas que crea. «Reemplazar» es
destructivo: todo o nada (ADR 0011), con las reglas de celda de los ADR 0018 y 0019.

## 4. Los ADR

Ninguno hace falta para decidir este orden, así que no se escriben ahora: cada
uno va con el contrato del slice que lo necesita. Se numeran desde 0024 al
escribirse.

| ADR                                                      | Slice | Qué decide                                                        |
| -------------------------------------------------------- | ----- | ----------------------------------------------------------------- |
| Dónde vive una invitación y dónde se corta el ingreso    | E1a   | La tabla por correo, `invited`, el corte y la transición          |
| Desactivar escribe en otros módulos                      | E2    | El timer y las sesiones desde `team`; extiende el 0010            |
| Una fila `user` sin cuenta de Google                     | E2    | La salida de EQ-110, de las seis importadas y de P-11 de `perfil` |
| Borrar columnas: primero el código, después la migración | WS0   | El orden de despliegue de un borrado                              |
| El formato de duración es del workspace                  | WS2a  | Extiende el 0012 y fija la regla del compacto (WS-16)             |
| Crea tareas quien ve el proyecto                         | P4    | El cambio de `task.create` (WS-40, PR-40, PR-58)                  |
| Los asignados de una tarea en `can()`                    | P7    | El recurso de tarea                                               |
| La pertenencia por grupo en el recurso del proyecto      | P9    | Cómo llega el grupo al `ProjectResource`                          |

No necesitan ADR: la acción del owner para desactivar a un admin (E2) y la de
quitar del equipo (E6) siguen el 0023; transferir (E3) sigue el bloqueo de
D-R8-7.

## 5. Antes del primer contrato

No son slices:

- **Los documentos de paridad con las decisiones del 2026-10-16** entran a
  `main` antes del contrato de E1a.
- **El procedimiento SQL de desactivar deja de borrar `account`** desde ya y
  hasta E2: sin esa fila la persona no vuelve a entrar aunque se la reactive
  (EQ-110). Desactivar a mano pasa a ser membresía `inactive`, timer cerrado y
  filas de `session` borradas; si la persona vuelve a entrar antes de E2, ve sus
  horas en solo lectura (TT-92). La nota del §5 del mapa del núcleo se corrige.
- **La sesión del usuario en Clockify** verifica P-10 de `equipo.md` antes del
  contrato de E7.

## 6. Deudas que el mapa arrastra

- **TT-110** sigue sin slice: una entrada que el trío no puede expresar queda con
  sus horarios en solo lectura (mapa de la fase 1, §5).
- **P-10 y P-11 de `perfil.md`**: volver a seguir el nombre de Google y liberar
  un correo ocupado (EQ-109). El ADR de E2 sobre la fila sin cuenta toca P-11
  pero no lo cierra.
- **`invited` en `membership_status`**: con las invitaciones por correo puede
  quedar sin uso (EQ-18). Quitar un valor de un enum de Postgres pide recrear el
  tipo; si el ADR de E1a lo deja, queda como deuda.
- **`who_sees_all_entries`** sigue congelado y sin efecto (ADR 0020, WS-42): es
  la única columna sin efecto de los ajustes que WS0 no borra, porque la congeló
  una decisión anterior. Lo mismo vale para `membership.weekly_capacity_minutes`
  si la pregunta 1 dice que no.
- **RP-61 y RP-62**: la §15 de `equipo.md` registra que la página de Clockify
  cambió; es una corrección de `reportes.md`, no un slice.
- **`estado-fase1.md` no nombra la fase 2.** Cuando se apruebe el mapa, el
  registro de estado suma sus slices.

## 7. Preguntas para el usuario

1. **¿El borrado de WS0 suma `membership.weekly_capacity_minutes`?** Quedó sin
   destino con equipo P-09 (capacidad fuera) y cae en el mismo criterio del ADR
   0009 que las columnas de workspace P-05. Recomendación: sí.
2. **¿Grupos en el bloque de equipo, como pidió, o justo antes de P9?** En su
   lugar (E7), un grupo existe sin efecto hasta P6, P7 y P9. Recomendación:
   moverlo justo antes de P9, si P-10 confirma que está en Free.
3. **¿Las plantillas de la planilla (T1, T2) entran en esta fase, al final?**
   Timesheet P-09 las mandó a la fase 2 y no estaban en el orden que dio.
   Recomendación: sí, al final, y T2 después de responder timesheet P-15.
4. **¿Entra alguno de TT-110, P-10 o P-11 de `perfil.md`?** Hoy no tienen slice.
   Recomendación: no, salvo P-11 si el ADR de E2 lo resuelve sin costo.
