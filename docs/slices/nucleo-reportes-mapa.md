# Núcleo de reportes: mapa de slices

Qué entra en el núcleo de reportes, en qué orden va y de qué depende cada parte.
No es un contrato: los contratos se escriben de a uno, en
`docs/slices/reportes-slice<n>-<nombre>.md`, cuando llega el turno del slice.

Fuentes: [`docs/parity/reportes.md`](../parity/reportes.md), con su
recomendación (§6) y las decisiones del usuario del 2026-10-08 (§8). Decisiones
de arquitectura asociadas, las dos **propuestas**:
[ADR 0020, núcleo de reportes antes de la fase 2](../adr/0020-nucleo-de-reportes-antes-de-la-fase-2.md)
y [ADR 0021, el reporte agrega en la base](../adr/0021-el-reporte-agrega-en-la-base.md).
Revisado en [`correcciones-nucleo-reportes.md`](correcciones-nucleo-reportes.md).

Decisiones que este mapa da por tomadas y no vuelve a abrir: solo owner y admin
ven horas ajenas (P-01), sin excepción para el responsable de proyecto (P-02);
sin el tope de 31 días (P-06), con el de 366 que fija el ADR 0021; el timer en
curso no se muestra ni se suma (P-07); las inactivas se filtran aparte y
tachadas (P-08); una persona con horas no se borra (P-09); se exporta a PDF, CSV
y Excel (P-10).

## 1. Qué es el núcleo

El reporte resumido de `reportes.md`, con lo que necesita para ser la vista de
las horas de todo el equipo: rango, agrupación encadenada, filtros, gráfico de
barras y exportación. Es un subconjunto estricto de la fase 3: el detallado, el
tablero y el semanal la completan sin reescribirlo (ADR 0020, condición
segunda).

Precondiciones que **no** son slices: `reportes.md` está en la rama
`plan/nucleo-reportes` y entra a `main` antes del primer contrato; y el usuario
aprueba los ADR 0020 y 0021 y responde la §5.

## 2. El problema de orden

El plan pone los reportes en la fase 3, después de la administración. El
usuario los pidió antes. **La decisión es adelantar un núcleo después del slice
13 y antes del resto de la fase 2**, con el razonamiento del ADR 0020. En este
mapa se usa así:

- **R1 no depende de nada y puede salir ya**, aun antes de que termine el 13:
  es un paso de esquema que protege datos que existen hoy. Si el 13 también
  genera una migración, la segunda en mergearse se regenera después del rebase.
- **Funcionalmente, los slices con pantalla dependen de lo que ya está en
  `main`**: proyectos, clientes y tareas (9, 10), etiquetas y facturable (11),
  la zona de la persona (7) y su primer día de la semana (5).
- **Del slice 13 dependen solo por el árbol**: el 13 está tocando el módulo
  `time-entry` y la planilla, que el núcleo usa como referencia de totales
  (ADR 0021). Arrancar R2a con el 13 mergeado evita un rebase sobre esos
  archivos.
- **De la fase 2 no dependen.** «Desactivar» (RP-60, RP-63) cambia un estado
  que el núcleo ya lee, y los tests siembran membresías inactivas. Cómo se
  nombra un admin y cómo se desactiva a alguien antes de la fase 2 es la
  decisión 2 de la §5.

## 3. El mapa

Cada slice es vertical y se puede desplegar solo, salvo R1, que es un paso de
esquema sin pantalla. El orden es de dependencia y de valor.

| Slice | Nombre                                           | Depende de                |
| ----- | ------------------------------------------------ | ------------------------- |
| R1    | Las horas no se borran con la persona            | —                         |
| R2a   | Resumido por persona y proyecto                  | R1, 13 (el árbol)         |
| R2b   | Los demás atajos, cliente y fecha                | R2a                       |
| R3    | Subgrupos, tarea y etiqueta                      | R2b                       |
| R4    | Filtros: personas, cliente, proyecto e inactivas | R2a                       |
| R5    | Gráfico de barras                                | R2b                       |
| R6    | Exportar a CSV y Excel                           | R3, R4                    |
| R7    | Exportar a PDF                                   | R6 (R5 si va con gráfico) |
| R8    | Cambiar el rol entre member y admin (si §5.2 b)  | R2a                       |
| R9    | Mostrar personas sin horas (si §5.7 lo pide)     | R4                        |

R3, R4 y R5 tocan la misma pantalla y la misma consulta. Van en serie, en el
orden de la tabla; si se paralelizan, el segundo arranca con el primero
mergeado.

### Lo que vale para todos

- **Es la primera pantalla con horas y nombres de otras personas.** Toda
  función del repository de `report` recibe el `ReportScope` que solo arma el
  service, con el `workspace_id` del actor (ADR 0020); una lectura que se lo
  saltee no compila. Toda puerta de entrada —la página, la ruta de exportación—
  pasa por el service, y **toda función nueva del repository suma su test de
  integración donde un `member` no ve nada ajeno**, también con una URL armada a
  mano.
- **La regla de los e2e del reporte**, que el contrato de R2a fija y los demás
  heredan. Los e2e comparten base y workspace, todas las personas sembradas se
  llaman igual y nada se borra, así que el total del workspace no es
  reproducible:
  - cada test siembra sus propias personas con un nombre único en
    `user_preference.display_name`;
  - el rol `admin` lo da un helper SQL nuevo en `e2e/database.ts`, como los que
    ya archivan proyectos o revocan responsables; si la sesión de e2e es común
    a varios specs, el test que necesita un admin usa una persona propia y no
    cambia el rol de la sesión común;
  - las afirmaciones son solo sobre las filas de las personas del test, o sobre
    un rango de fechas propio del test; **nunca sobre el total del
    workspace**.
- **La zona de quien mira cambia los días** (RP-22): el reporte de un admin en
  Buenos Aires y la planilla de una persona en Madrid pueden poner la misma
  entrada en días distintos, y es correcto. La pantalla y cada exportación
  dicen en qué zona están cortados los días.

### R1 — Las horas no se borran con la persona

Cubre RP-65 (P-09) y la precondición de RP-60 y RP-61. **Cambia el esquema**
(ADR 0020, condición cuarta):

1. inserta una membresía `inactive`, rol `member`, para cada par
   `(workspace_id, user_id)` de `time_entry` sin membresía, con una fila en
   `audit_log` por cada una (acción propia, sin actor);
2. pasa `time_entry.user_id` → `user` de `cascade` a `restrict`;
3. crea la clave compuesta `(workspace_id, user_id)` → `membership`, `on delete
restrict`, **validada**. No hay variante `not valid`.

Sin acciones de permiso nuevas y sin pantalla. **R2a no se despliega sin la
clave validada**: lee el estado de la persona con un `join` interno, y una
entrada sin membresía quedaría fuera de los totales sin aviso.

**Va primero y puede salir ya** porque protege datos que existen desde el
slice 1: hoy borrar una cuenta desde la consola borra sus horas.

**La reversión de R1** es una migración nueva hacia adelante —`drizzle-kit` no
tiene migraciones de bajada— que hace lo inverso en orden inverso: borra la
clave compuesta, devuelve `time_entry.user_id` a `cascade` y borra las
membresías que insertó el paso 1, que encuentra por sus filas de `audit_log`.
Mientras R2a esté desplegado, R1 no se revierte: primero se retira R2a.

Riesgos:

- **La consulta previa en producción es informativa**: lista los pares que van
  a recibir una membresía inactiva. Esas personas, si vuelven a entrar, quedan
  sin acceso; es lo correcto, porque una entrada sin membresía solo existe si
  alguien borró la membresía a mano. La corre el usuario antes de desplegar,
  como la del 7b.
- **`drizzle-kit` y los nombres**: cambiar la acción de la clave existente
  (`time_entry_user_id_user_id_fk`) es borrarla y crearla; la compuesta lleva
  nombre explícito para no pasar de 63 caracteres, como las de proyectos. El
  paso 1 es SQL escrito a mano en la misma migración, antes de la clave.
- **Los tests existentes no deberían cambiar** (ADR 0020, consecuencias):
  `truncateAll` usa `cascade`; los tests de esquema que borran un usuario o una
  membresía lo hacen con personas sin entradas; ningún e2e borra personas; las
  siembras de entradas usan personas con membresía. El contrato lo confirma con
  la suite completa.
- **Tests nuevos del contrato**: borrar un usuario con horas y una membresía con
  horas falla con 23503, sin fijar el nombre de la clave; borrar el workspace
  con horas sigue borrando todo, y si falla por el orden de las cascadas la
  clave compuesta pasa a `no action`; la migración, corrida sobre una base con
  una entrada sin membresía, deja una membresía inactiva y su fila de
  auditoría.

### R2a — Resumido por persona y proyecto

Cubre RP-01 (con P-01), RP-02, RP-03 (vacío, ADR 0020), RP-05 y RP-06 (deciden
como `member`), RP-07, RP-10, RP-11 con persona y proyecto en un nivel, RP-18
(total y total facturable), RP-19, RP-20 con «Esta semana», las flechas y el
rango libre, RP-21 (tope de 366 días), RP-22, RP-23, RP-24 para «Esta semana»,
RP-28 («Sin proyecto»), RP-29, RP-30 (P-07), RP-31, RP-32, RP-33 (el primer
vacío), RP-34, RP-35, RP-61 y RP-64.

**Sin cambios de tablas**; suma el índice parcial del ADR 0021 si el `explain`
lo justifica. **Acciones nuevas**: `report.view` y `timeEntry.others.view`
(ADR 0020). Trae el módulo `src/modules/report/` con el `ReportScope`, la
pantalla `/reportes` con su entrada en la navegación y la regla de los e2e de
arriba. No trae los cortes por tramo: con persona y proyecto, el rango es un
solo intervalo, que ya sale de `weekBounds` y de `startOfDayKey`.

**Va acá porque es la vista que pidió el usuario**: con persona o proyecto en
un nivel ya se ven las horas de todo el equipo en un rango. Se separó de R2b
para que el slice que trae los permisos, el alcance, el módulo y la primera
medición de rendimiento no traiga además la pieza técnica nueva de los cortes.

Riesgos:

- **Rendimiento de la agregación.** Sin un prefijo selectivo, la consulta de
  todas las personas recorre `time_entry` entera. El contrato fija un volumen
  sintético —30 personas, tres años, 8 entradas por día hábil— y un presupuesto
  de tiempo, y decide el índice con `explain (analyze)` en Postgres de la misma
  versión que Neon.
- **Que el reporte y la planilla sumen lo mismo.** Microsegundos en Postgres y
  milisegundos en JS, y `sum()` como `numeric` (ADR 0021): el test compara los
  dos totales con entradas sembradas con microsegundos.
- **Los nombres de otras personas** salen de `user` y `user_preference` con
  `displayNameOf`. Solo los ve quien tiene `timeEntry.others.view`; un `member`
  que agrupa por persona se ve a sí mismo.
- **Un enlace de un admin abierto por un member** (RP-32 contra RP-34): la
  recomendación es descartar el parámetro de personas, como cualquier parámetro
  inválido, y decir en la pantalla que muestra solo lo propio. Es la decisión 5
  de la §5.
- **El error de lectura** necesita su `error.tsx` con «Reintentar» (RP-35), como
  `calendario` y `planilla`.
- **Sin caché compartida**: la página es dinámica por sesión. Ninguna lectura
  del reporte puede ir a una caché que cruce personas.

### R2b — Los demás atajos, cliente y fecha

Cubre RP-11 con cliente y fecha en un nivel, RP-20 con Hoy, Ayer, Semana
pasada, Últimas dos semanas, Este mes, Mes pasado, Este año y Año pasado, RP-24
para la agrupación por fecha y RP-28 («Sin cliente»). Sin cambios de esquema ni
de permisos.

Trae el mecanismo del ADR 0021: los cortes por tramo y la aritmética de meses
en `src/server/time`, y `width_bucket` con el arreglo de cortes en la consulta.
Depende de R2a. **Va inmediatamente después** porque R3 y R5 se apoyan en los
cortes.

Riesgos:

- **El arreglo de `timestamptz` como parámetro.** Los tests de integración usan
  `pg` y producción `neon-serverless`: el contrato suma una comprobación en un
  preview contra Neon antes de mergear. La alternativa, si un driver no lo pasa
  bien, es `unnest` (ADR 0021).
- **Cortes repetidos por un día que falta entero**: test con Samoa, 2011-12-30
  (ADR 0021).
- **Meses y cambios de horario**: «Este mes» se arma con claves de día, nunca
  sumando milisegundos.

### R3 — Subgrupos, tarea y etiqueta

Cubre RP-11 en el resto (etiqueta; tarea si P-05 la confirma), RP-12 (hasta
tres niveles, sin repetir), RP-13 (expandir un grupo), RP-18 (la suma por
etiqueta puede superar el total) y RP-28 («Sin tarea», «Sin etiqueta»). Sin
cambios de esquema ni de permisos.

Depende de R2b, porque la fecha puede ser un subnivel. **Va primero de los que
agregan superficie** porque «persona → proyecto» es la pregunta que sigue a
«cuánto cargó cada uno».

Riesgos:

- **El tamaño del árbol.** Persona × proyecto × día en 366 días puede pasar de
  cientos de miles de filas. El contrato elige entre traer el árbol entero con
  un tope de filas o expandir pidiendo al servidor el nivel siguiente, con lo
  abierto en la URL. Lo que no puede pasar es mandar al navegador un árbol que
  no se puede dibujar.
- **La suma por etiqueta** tiene que verse como lo que es: la cabecera sigue con
  el total real y la pantalla avisa que una entrada con varias etiquetas suma en
  cada una.

### R4 — Filtros: personas, cliente, proyecto e inactivas

Cubre RP-25 reducido a personas, cliente y proyecto, RP-26 solo «sin proyecto»,
RP-33 (el segundo vacío, con «Quitar filtros»), RP-34 (lo que nombra algo que ya
no existe se ignora) y RP-62 (P-08: las inactivas aparte y tachadas). Sin
cambios de esquema ni de permisos: el filtro de personas existe solo con
`timeEntry.others.view`.

Depende de R2a. **Va después de R3** porque filtrar sin poder abrir los grupos
responde menos preguntas que agrupar sin filtrar.

Riesgos:

- **Los catálogos de los filtros son de otros módulos** (ADR 0010): proyectos y
  clientes los arma `project`, también los archivados (RP-29); las personas, con
  su estado, `workspace`. Ninguno los lee el repository del reporte por su
  cuenta.
- **Las inactivas no se pueden producir desde la pantalla hasta la fase 2.** Los
  tests y los e2e siembran membresías inactivas por base.
- **Las invitadas no aparecen** (RP-64) y no tienen entradas; la consulta de
  personas las excluye por estado, no por no tener horas.
- **El filtro de personas pasa por el `ReportScope`**: un `member` que manda ids
  de personas en la URL recibe lo propio (o lo que decida la §5), nunca horas
  ajenas.

### R5 — Gráfico de barras

Cubre RP-15, con la granularidad por largo del rango del ADR 0021. Sin cambios
de esquema ni de permisos. RP-16 y RP-17 quedan fuera del núcleo.

Depende de R2b, que trae los cortes. **Va después de los filtros** porque es
lectura de la misma consulta con otro corte, y suma menos respuestas que filtrar
o subagrupar.

Riesgos:

- **Sin biblioteca de gráficos.** No hay ninguna en las dependencias y no hace
  falta: barras en SVG o CSS armadas en el servidor, sin JavaScript de cliente
  más que el de mostrar el valor al pasar. Una biblioteca de gráficos pesa más
  que el resto de la pantalla.
- **Accesibilidad**: el gráfico lleva su equivalente en tabla o un resumen
  legible; un lector de pantalla no lee barras.
- **Los tramos por semana y mes** salen de los cortes del ADR 0021, con el
  primer día de la semana de quien mira; los cambios de horario no afectan
  porque la base solo compara instantes.

### R6 — Exportar a CSV y Excel

Cubre RP-54 (P-10) para lo que muestra la pantalla: los grupos, los subgrupos y
sus totales, con el rango, los filtros y la zona en la cabecera. Sin cambios de
esquema; usa `report.view` y el mismo `ReportScope` que la página.

Depende de R3 y R4: lo que se exporta es la forma del reporte, y esa forma la
terminan de fijar los subgrupos y los filtros. **Va antes del PDF** porque es
lo más útil para administración (RP-54) y lo más barato.

Riesgos:

- **La primera ruta propia fuera de `api/auth` y `api/cron`.** Un Route Handler
  `GET` con la misma query string que la página: llama a `requireSession()` y al
  service, y no repite ninguna decisión de acceso.
- **Sin caché**: la respuesta lleva `Cache-Control: no-store`, con un test que
  lo afirma. Vale también para el PDF de R7.
- **Inyección de fórmulas en CSV**: un campo que empieza con `=`, `+`, `-`, `@`,
  tabulación o retorno de carro se escribe con un `'` adelante, y todos los
  campos van entre comillas, con las comillas internas duplicadas. En Excel, las
  celdas de texto se escriben como texto, nunca como fórmula.
- **CSV y Excel en español.** Excel con configuración regional en español
  espera `;` como separador y coma decimal; el archivo lleva BOM UTF-8 para los
  acentos. El contrato fija el separador y el formato del número de horas
  —decimal con coma o con punto, cuántos decimales— y lo prueba abriendo el
  archivo. En Excel, las duraciones van como número con formato `[h]:mm` o como
  horas decimales, para que se puedan sumar; `h:mm` como texto no se suma.
- **`exceljs` ya está en `dependencies`, sin uso**: la 4.4.0 da hoy una
  advertencia moderada en `npm audit --omit=dev`, que es lo que CI audita, y no
  publica versión desde 2023. Criterio: si se usa, es solo para escribir, nunca
  para leer archivos que suba alguien; el contrato de R6 decide si acepta la
  moderada con su análisis o cambia de biblioteca. No quedan dos.
- **Tope de filas**: el mismo del árbol de R3.

### R7 — Exportar a PDF

Cubre RP-53. Sin cambios de esquema; usa la misma ruta y el mismo modelo de
exportación que R6.

Depende de R6 y, si el PDF lleva el gráfico, de R5. **Va último** porque es el
de mayor riesgo técnico y Clockify Free ya lo ofrece igual que el resumido en
pantalla.

Riesgos:

- **Cómo se arma el PDF en Vercel Hobby.** `@react-pdf/renderer` ya está en
  `dependencies` sin uso, y Next ya lo trata como paquete externo del servidor:
  está en la lista por defecto de `serverExternalPackages`. Lo que queda por
  medir antes del contrato es cuánto pesa la función, cuánto tarda en frío y
  qué fuentes necesita. La alternativa sin dependencias es una hoja de estilos
  de impresión y «Guardar como PDF» del navegador, que no es un archivo que
  genera el servidor. Si hay que elegir, va un ADR.
- **Las fuentes**: las estándar del PDF cubren el español, pero no cualquier
  nombre; incrustar una fuente con cobertura amplia suma peso a la función.
- **Tope de filas**, como el de 3000 de Clockify (RP-53), alineado con R3.

### R8 — Cambiar el rol entre member y admin

Solo si el usuario elige la opción (b) de la decisión 2 de la §5. Un control
mínimo para pasar una membresía de `member` a `admin` y de vuelta, con
`team.manage` sobre el `MembershipResource` que ya existe, la protección de la
membresía del owner que `can()` ya tiene y una fila de `audit_log` por cambio.
Sin esquema nuevo. No es la pantalla de equipo de la fase 2: no invita, no
desactiva, no cambia otros roles.

Depende de R2a, que es lo que hace que el rol importe. Riesgo: la deuda de
`ensureWorkspaceContext` (§6) sigue; el slice no la agrava porque solo cambia
el rol de membresías que ya existen.

### R9 — Mostrar personas sin horas

Solo si el usuario lo pide (decisión 7 de la §5). RP-47, del semanal, llevado al
resumido agrupado por persona. Depende de R4, porque la lista de personas con su
estado es la del filtro.

## 4. Lo que no entra en el núcleo

Queda para la fase 3, por el ADR 0020: RP-14 (del resumido al detallado), RP-16
y RP-17 (barras partidas y torta), RP-25 y RP-26 en el resto (tarea, etiqueta,
descripción, facturable), RP-40 … RP-43 (tablero), RP-45 … RP-47 (semanal,
salvo R9), RP-50 (detallado).

Fuera de alcance por `reportes.md`: RP-04, RP-08, RP-09, RP-27, RP-36, RP-37,
RP-48, RP-49, RP-51, RP-52, RP-55, RP-56, RP-66.

Queda para la fase 2: RP-60 y RP-63 (desactivar desde la pantalla, y que eso
detenga el timer).

## 5. Decisiones del usuario

El 2026-10-08 el usuario aceptó los ADR 0020 y 0021, y con ellos lo que fijan: las dos claves
en `restrict` con las membresías que falten creadas inactivas (P-09), `who_sees_all_entries`
congelado en `admins` y sin efecto, y el tope de 366 días. Los pendientes de P-05 se resuelven
con la propuesta del núcleo: tarea como dimensión (RP-11), «Esta semana» por defecto (RP-20) y
los rótulos «Sin …» (RP-28).

Siguen abiertas:

1. **Aprobar los ADR 0020 y 0021**, que están en «propuesto».
2. **Cómo se nombra un admin y cómo se desactiva a alguien antes de la fase 2.** Sin nada, solo el owner ve el reporte de equipo, y desactivar (la única
   salida para una persona con horas, P-09) solo se puede por base. Dos
   opciones; ninguna usa una variable de entorno de admins:
   - **(a) Procedimiento SQL documentado**, para cambiar el rol y para pasar una
     membresía a `status = 'inactive'`. Cada uso escribe su fila en
     `audit_log`, y desactivar cierra en la misma transacción el timer que
     corra (RP-63). Lo corre el usuario. Sin slice.
   - **(b) El slice R8**, después de R2a: cambiar el rol entre `member` y
     `admin` desde la aplicación, con `team.manage`, la protección del owner y
     auditoría. Desactivar sigue por el procedimiento de (a) hasta la fase 2.
3. **La forma de P-09.** Lo propuesto son las dos claves en `restrict`, la del
   usuario y una compuesta hacia la membresía, con las membresías que falten
   creadas inactivas. La alternativa mínima es solo la del usuario; deja borrar
   una membresía con horas y el reporte no sabría el estado de esa persona.
4. **`who_sees_all_entries`**: congelado en `admins` y sin efecto (propuesto), o
   borrar la columna. Si la fase 2 la vuelve editable, hay que elegir el eje
   (RP-04).
5. **Un member con un enlace que nombra a otras personas**: descartar el
   parámetro y mostrar lo propio (propuesto, RP-32), o responder «No tenés
   permiso para hacer esto.» (RP-34).
6. **Qué se exporta**: lo que muestra el resumido (propuesto, RP-53), o además
   las entradas una por una en CSV y Excel, que es el uso típico para
   administración y en Clockify sale del detallado, que no entra en el núcleo.
7. **«Mostrar personas sin horas»** (RP-47, del semanal): responde «quién no
   cargó» y no entra en el núcleo. Si se quiere ya, entra como R9, después de
   R4.
8. **El tope de 366 días** lo fijó el ADR 0021 por delegación de P-06. Si el
   usuario quiere rangos más largos desde el principio, se mide en R2a.
9. **Pendientes de P-05** que el núcleo resuelve con su propuesta y no bloquean:
   tarea como dimensión (RP-11), rango por defecto «Esta semana» (RP-20),
   rótulos de «Sin …» (RP-28).

## 6. Deudas que el mapa arrastra

- **`ensureWorkspaceContext` sigue creando la membresía** de cualquiera que
  pase el login. El núcleo no la agrava —un `member` nuevo ve solo lo propio—,
  y con R1 la revocación borrando la membresía, que ya no funcionaba, pasa a
  fallar en la base para quien tiene horas.
- **`estado-fase1.md` y `fase1-mapa.md` no nombran el núcleo.** Cuando se
  apruebe, el registro de estado suma sus slices.
