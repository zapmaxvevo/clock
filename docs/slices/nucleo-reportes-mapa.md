# Núcleo de reportes: mapa de slices

Qué entra en el núcleo de reportes, en qué orden va y de qué depende cada parte.
No es un contrato: los contratos se escriben de a uno, en
`docs/slices/reportes-slice<n>-<nombre>.md`, cuando llega el turno del slice.

Fuentes: [`docs/parity/reportes.md`](../parity/reportes.md), con su
recomendación (§6) y las decisiones del usuario del 2026-10-08 (§8). Decisiones
de arquitectura asociadas, las dos **propuestas**:
[ADR 0020, núcleo de reportes antes de la fase 2](../adr/0020-nucleo-de-reportes-antes-de-la-fase-2.md)
y [ADR 0021, el reporte agrega en la base](../adr/0021-el-reporte-agrega-en-la-base.md).

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
aprueba los ADR 0020 y 0021.

## 2. El problema de orden

El plan pone los reportes en la fase 3, después de la administración. El
usuario los pidió antes. **La decisión es adelantar un núcleo después del slice
13 y antes del resto de la fase 2**, con el razonamiento del ADR 0020. En este
mapa se usa así:

- **Funcionalmente, el núcleo depende de lo que ya está en `main`**: proyectos,
  clientes y tareas (9, 10), etiquetas y facturable (11), la zona de la persona
  (7) y su primer día de la semana (5).
- **Del slice 13 depende solo por el árbol**: el 13 está tocando el módulo
  `time-entry` y la planilla, que el núcleo usa como referencia de totales
  (ADR 0021). Arrancar con el 13 mergeado evita un rebase sobre esos archivos.
- **De la fase 2 no depende.** «Desactivar» (RP-60, RP-63) cambia un estado que
  el núcleo ya lee, y los tests siembran membresías inactivas. Mientras la fase
  2 no traiga `team.manage`, el único que ve el reporte de equipo en producción
  es el owner.

## 3. El mapa

Cada slice es vertical y se puede desplegar solo, salvo R1, que es un paso de
esquema sin pantalla: protege datos que existen hoy y no espera a ninguna. El
orden es de dependencia y de valor.

| Slice | Nombre                                           | Depende de                |
| ----- | ------------------------------------------------ | ------------------------- |
| R1    | Las horas no se borran con la persona            | 13 (el árbol)             |
| R2    | Reporte resumido de un nivel                     | R1                        |
| R3    | Subgrupos, tarea y etiqueta                      | R2                        |
| R4    | Filtros: personas, cliente, proyecto e inactivas | R2                        |
| R5    | Gráfico de barras                                | R2                        |
| R6    | Exportar a CSV y Excel                           | R3, R4                    |
| R7    | Exportar a PDF                                   | R6 (R5 si va con gráfico) |

R3, R4 y R5 dependen solo de R2, pero tocan la misma pantalla y la misma
consulta. Van en serie, en el orden de la tabla; si se paralelizan, el segundo
arranca con el primero mergeado.

Riesgos que valen para todos:

- **Es la primera pantalla con horas y nombres de otras personas.** Toda puerta
  de entrada —la página, la ruta de exportación— arma el alcance con la misma
  función del service, y cada slice suma un test de integración donde un
  `member` con una URL armada a mano no ve nada ajeno.
- **E2E necesita dos sesiones**: una owner o admin y una member, con horas de
  terceros sembradas. Antes del contrato de R2 hay que confirmar que el arnés de
  sesión de prueba permite elegir el rol.
- **La zona de quien mira cambia los días** (RP-22): el reporte de un admin en
  Buenos Aires y la planilla de una persona en Madrid pueden poner la misma
  entrada en días distintos, y es correcto. La pantalla y cada exportación
  dicen en qué zona están cortados los días.

### R1 — Las horas no se borran con la persona

Cubre RP-65 (P-09) y la precondición de RP-60 y RP-61. **Cambia el esquema**:
`time_entry.user_id` → `user` pasa de `cascade` a `restrict`, y se suma la
clave compuesta `(workspace_id, user_id)` → `membership`, `on delete restrict`
(ADR 0020, condición cuarta). Sin acciones de permiso nuevas y sin pantalla.

**Va primero** porque protege datos que existen desde el slice 1: hoy borrar una
cuenta desde la consola borra sus horas. Y porque R2 se apoya en que toda
entrada tiene membresía para mostrar el estado de la persona con un `join`
interno.

Riesgos:

- **La clave compuesta valida las filas existentes.** Si en producción hay una
  entrada sin membresía en su workspace, la migración falla. El contrato trae
  la consulta de comprobación, que corre el usuario antes de desplegar, como la
  del 7b. Si hiciera falta, la clave se crea `not valid` y se valida aparte.
- **`drizzle-kit` y los nombres**: cambiar la acción de la clave existente
  (`time_entry_user_id_user_id_fk`) es borrarla y crearla; la compuesta lleva
  nombre explícito para no pasar de 63 caracteres, como las de proyectos.
- **Lo que deja de funcionar es a propósito**: borrar un usuario o una membresía
  con horas falla. Ningún camino de la aplicación lo hace hoy; los tests limpian
  con `truncate … cascade`, que no pasa por las acciones de las claves.

### R2 — Reporte resumido de un nivel

Cubre RP-01 (con P-01), RP-02, RP-03 (vacío, ADR 0020), RP-05 y RP-06 (deciden
como `member`), RP-07, RP-10, RP-11 con persona, proyecto, cliente y fecha en un
nivel, RP-18 (total y total facturable), RP-19, RP-20, RP-21 (tope de 366
días), RP-22, RP-23, RP-24, RP-28 («Sin proyecto», «Sin cliente»), RP-29, RP-30
(P-07), RP-31, RP-32, RP-33 (el primer vacío), RP-34, RP-35, RP-61 y RP-64.

**Sin cambios de tablas**; suma el índice parcial del ADR 0021 si el `explain`
lo justifica. **Acciones nuevas**: `report.view` y `timeEntry.others.view`
(ADR 0020). Trae el módulo `src/modules/report/`, los cortes de tramo de
`src/server/time` y la pantalla `/reportes` con su entrada en la navegación.

**Va acá porque es la vista que pidió el usuario**: con un nivel por persona ya
se ven las horas de todo el equipo en un rango. Todo lo demás le agrega
superficie a esta pantalla y a esta consulta.

Riesgos:

- **Rendimiento de la agregación.** Sin un prefijo selectivo, la consulta de
  todas las personas recorre `time_entry` entera. El contrato fija un volumen
  sintético —30 personas, tres años, 8 entradas por día hábil— y un presupuesto
  de tiempo, y decide el índice con `explain (analyze)` en Postgres de la misma
  versión que Neon.
- **Que el reporte y la planilla sumen lo mismo.** Microsegundos en Postgres y
  milisegundos en JS (ADR 0021): el test compara los dos totales con entradas
  sembradas con microsegundos.
- **El arreglo de cortes como parámetro** con Drizzle y el driver de Neon; la
  alternativa es `unnest` (ADR 0021).
- **Los nombres de otras personas** salen de `user` y `user_preference` con
  `displayNameOf`. Solo los ve quien tiene `timeEntry.others.view`; el contrato
  dice qué ve un `member` cuando agrupa por persona (él solo).
- **Un enlace de un admin abierto por un member** (RP-32 contra RP-34): la
  recomendación es descartar el parámetro de personas, como cualquier parámetro
  inválido, y decir en la pantalla que muestra solo lo propio. Queda para el
  usuario (§5).
- **El error de lectura** necesita su `error.tsx` con «Reintentar» (RP-35), como
  `calendario` y `planilla`.
- **Sin caché compartida**: la página es dinámica por sesión. Ninguna lectura
  del reporte puede ir a una caché que cruce personas.

### R3 — Subgrupos, tarea y etiqueta

Cubre RP-11 en el resto (etiqueta; tarea si P-05 la confirma), RP-12 (hasta
tres niveles, sin repetir), RP-13 (expandir un grupo), RP-18 (la suma por
etiqueta puede superar el total) y RP-28 («Sin tarea», «Sin etiqueta»). Sin
cambios de esquema ni de permisos.

Depende de R2. **Va primero de los tres que agregan superficie** porque «persona
→ proyecto» es la pregunta que sigue a «cuánto cargó cada uno».

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

Depende de R2. **Va después de R3** porque filtrar sin poder abrir los grupos
responde menos preguntas que agrupar sin filtrar.

Riesgos:

- **Los catálogos de los filtros son de otros módulos** (ADR 0010): proyectos y
  clientes los arma `project`, también los archivados (RP-29); las personas, con
  su estado, `workspace`. Ninguno los lee el repository del reporte por su
  cuenta.
- **Las inactivas no se pueden producir hasta la fase 2.** Los tests y e2e
  siembran membresías inactivas por base; la pantalla no tiene cómo crearlas.
- **Las invitadas no aparecen** (RP-64) y no tienen entradas; la consulta de
  personas las excluye por estado, no por no tener horas.
- **El enforcement es del servidor**: un `member` que manda ids de personas en
  la URL recibe lo propio (o lo que decida §5), nunca horas ajenas.

### R5 — Gráfico de barras

Cubre RP-15, con la granularidad por largo del rango del ADR 0021. Sin cambios
de esquema ni de permisos. RP-16 y RP-17 quedan fuera del núcleo.

Depende de R2. **Va después de los filtros** porque es lectura de la misma
consulta con otro corte, y suma menos respuestas que filtrar o subagrupar.

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
esquema; usa `report.view` y el mismo alcance que la página.

Depende de R3 y R4: lo que se exporta es la forma del reporte, y esa forma la
terminan de fijar los subgrupos y los filtros. **Va antes del PDF** porque es
lo más útil para administración (RP-54) y lo más barato.

Riesgos:

- **La primera ruta propia fuera de `api/auth` y `api/cron`.** Un Route Handler
  `GET` con la misma query string que la página: llama a `requireSession()` y al
  service, y no repite ninguna decisión de acceso.
- **CSV y Excel en español.** Excel con configuración regional en español
  espera `;` como separador y no abre bien un CSV con `,`; el archivo lleva BOM
  UTF-8 para los acentos. Las duraciones van como número de horas o con formato
  `[h]:mm` en Excel, para que se puedan sumar; `h:mm` como texto no se suma.
- **Inyección de fórmulas en CSV**: una descripción o un nombre que empieza con
  `=`, `+`, `-` o `@` se escapa. En Excel, las celdas de texto se escriben como
  texto, nunca como fórmula.
- **`exceljs` ya está en `dependencies` y nadie la usa.** Se usa o se saca, pero
  no queda una segunda. Antes del contrato, `npm audit --omit=dev` sobre ella,
  porque CI audita producción, y el peso del Route Handler contra el límite de
  Vercel.
- **Tope de filas**: el mismo del árbol de R3.

### R7 — Exportar a PDF

Cubre RP-53. Sin cambios de esquema; usa la misma ruta y el mismo modelo de
exportación que R6.

Depende de R6 y, si el PDF lleva el gráfico, de R5. **Va último** porque es el
de mayor riesgo técnico y Clockify Free ya lo ofrece igual que el resumido en
pantalla.

Riesgos:

- **Cómo se arma el PDF en Vercel Hobby.** `@react-pdf/renderer` ya está en
  `dependencies` sin uso. Hay que probar antes del contrato que renderiza en un
  Route Handler de Next 16 (puede pedir `serverExternalPackages`), cuánto pesa
  la función y cuánto tarda en frío. La alternativa sin dependencias es una
  hoja de estilos de impresión y «Guardar como PDF» del navegador, que no es un
  archivo que genera el servidor. Si hay que elegir, va un ADR.
- **Las fuentes**: las estándar del PDF cubren el español, pero no cualquier
  nombre; incrustar una fuente con cobertura amplia suma peso a la función.
- **Tope de filas**, como el de 3000 de Clockify (RP-53), alineado con R3.

## 4. Lo que no entra en el núcleo

Queda para la fase 3, por el ADR 0020: RP-14 (del resumido al detallado), RP-16
y RP-17 (barras partidas y torta), RP-25 y RP-26 en el resto (tarea, etiqueta,
descripción, facturable), RP-40 … RP-43 (tablero), RP-45 … RP-47 (semanal),
RP-50 (detallado).

Fuera de alcance por `reportes.md`: RP-04, RP-08, RP-09, RP-27, RP-36, RP-37,
RP-48, RP-49, RP-51, RP-52, RP-55, RP-56, RP-66.

Queda para la fase 2: RP-60 y RP-63 (desactivar, y que eso detenga el timer).

## 5. Decisiones abiertas para el usuario

1. **Aprobar los ADR 0020 y 0021**, que están en «propuesto».
2. **La forma de P-09.** Lo propuesto son las dos claves en `restrict`, la del
   usuario y una compuesta hacia la membresía. La alternativa mínima es solo la
   del usuario; deja borrar una membresía con horas y el reporte no sabría el
   estado de esa persona.
3. **`who_sees_all_entries`**: congelado en `admins` y sin efecto (propuesto), o
   borrar la columna. Si la fase 2 la vuelve editable, hay que elegir el eje
   (RP-04).
4. **El tope de 366 días** lo fijó el ADR 0021 por delegación de P-06. Si el
   usuario quiere rangos más largos desde el principio, se mide en R2.
5. **Un member con un enlace que nombra a otras personas**: descartar el
   parámetro y mostrar lo propio (propuesto, RP-32), o responder «No tenés
   permiso para hacer esto.» (RP-34).
6. **Qué se exporta**: lo que muestra el resumido (propuesto, RP-53), o además
   las entradas una por una en CSV y Excel, que es el uso típico para
   administración y en Clockify sale del detallado, que no entra en el núcleo.
7. **«Mostrar personas sin horas»** (RP-47, del semanal): responde «quién no
   cargó» y no entra en el núcleo. Si se quiere ya, entra como R8, después de
   R4.
8. **Pendientes de P-05** que el núcleo resuelve con su propuesta y no bloquean:
   tarea como dimensión (RP-11), rango por defecto «Esta semana» (RP-20),
   rótulos de «Sin …» (RP-28).

## 6. Deudas que el mapa arrastra

- **Solo el owner ve el reporte de equipo** hasta que la fase 2 traiga
  `team.manage`; un admin existe solo cambiando el rol en la base.
- **`ensureWorkspaceContext` sigue creando la membresía** de cualquiera que
  pase el login. El núcleo no la agrava —un `member` nuevo ve solo lo propio—,
  pero con R1 la revocación borrando la membresía, que ya no funcionaba, pasa a
  fallar en la base para quien tiene horas.
- **`estado-fase1.md` y `fase1-mapa.md` no nombran el núcleo.** Cuando se
  apruebe, el registro de estado suma sus slices.
