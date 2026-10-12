# Núcleo de reportes, R9: mostrar personas sin horas

Contrato del slice que suma «Mostrar personas sin horas» al reporte resumido
agrupado por persona. Extiende la pantalla `/reportes`, el módulo
`src/modules/report/` y el catálogo de personas de `workspace` que trajo R4b:
con la opción encendida, el primer nivel suma una fila en «0:00» por cada
persona que no cargó nada en el período. Sin cambios de tablas, de índices ni
de permisos, y sin consultas nuevas.

- **Fuente de los comportamientos:** `docs/parity/reportes.md`, RP-47
  (`reportes.md:1553-1557`): «To see who hasn't tracked any time in a given
  week, group the report by user and click on Show users without time.» y
  «Owners, Admins and Team managers can see this option.». Se apoya en RP-01,
  RP-12, RP-13, RP-31, RP-32, RP-33, RP-34, RP-54, RP-61, RP-62 y RP-64 tal como
  los dejaron R2a a R6, y en lo que ya anunciaban: RP-64 («RP-47 —mostrar
  personas sin horas— la excluye también», `:1800-1814`) y la sección 12.4
  («Una persona activa sin horas está en el filtro», `:2482-2484`).
- **Lugar en el plan:** [mapa del núcleo](nucleo-reportes-mapa.md), §3 «R9»
  (`:359-363`) y la decisión del usuario del 2026-10-08 (§5, `:408-409`): «R9
  entra: "Mostrar personas sin horas" (RP-47, del semanal), para ver quién no
  cargó en el período. Va después de R4.». Depende de R4, que está entero en
  `main`, porque la lista de personas con su estado es la del filtro
  (`listWorkspacePeople`).
- **Un solo slice** (D-R9-1). **Va antes que R7a**, por decisión del team-lead
  (§0, §10).
- **Revisión del contrato:** aprobado en la primera pasada de
  `architecture-reviewer`, con cuatro menores aplicados
  ([correcciones](correcciones-nucleo-reportes-r9-contrato.md)): los archivos
  que comparte con R7 y el orden (§0, §10), la fecha de ingreso de las 3001
  personas del criterio 11, `setJoinedAt` con el email (§7) y lo que
  `joinedAt` va a dejar de ser con las invitaciones (D-R9-2, §4.5, §9).
- **Decisiones de arquitectura asociadas**, todas aceptadas:
  - [ADR 0020](../adr/0020-nucleo-de-reportes-antes-de-la-fase-2.md): toda
    lectura recibe el `ReportScope`, que solo arma el service; toda puerta de
    entrada —la página y la ruta de exportación— pasa por el mismo service.
  - [ADR 0021](../adr/0021-el-reporte-agrega-en-la-base.md): una sola foto en
    una transacción de solo lectura `repeatable read`; el nombre de una persona
    lo arma `displayNameOf` en el service; `report` importa de `workspace` el
    catálogo de personas.
  - [ADR 0010](../adr/0010-un-modulo-consulta-las-reglas-de-otro-por-su-service.md):
    la regla de quién está en el workspace la tiene `workspace`; la función
    exportada recibe el `tx` de quien llama y solo lee con él.

  **Este contrato no abre ningún ADR y no contradice ninguno aceptado.** Las
  filas sin horas no agregan nada: son la diferencia entre un catálogo que el
  reporte ya lee en la misma foto y las personas del primer nivel, que ya
  agregó la base (D-R9-6). Lo que queda para el usuario está en §10.

Decisiones que el contrato da por tomadas (R2a a R6, mapa §5, `reportes.md` §8):
solo owner y admin ven horas ajenas (P-01), y `team_manager` decide como
`member` (P-03, RP-06); un member con un enlace que nombra a otras personas ve
lo propio y el parámetro se descarta; las inactivas se filtran aparte y
tachadas (P-08); las invitadas no están en el filtro (RP-64); el timer en curso
no se muestra ni se suma (P-07); el tope de 366 días; el árbol de 3000 filas
que entra entero o no se muestra, también el primer nivel (D-R3-6, D-R10-10);
sin horas no hay gráfico (D-R5-6) ni grupo «Exportar» (D-R6-10); la regla de
los e2e de §8.3 de R2a; ninguna exportación va al `audit_log`.

## Decisiones del contrato

**D-R9-1 — Un solo slice.** Opciones: (1) un slice; (2) dos partes, la lectura
y la pantalla. **(1).** No hay lectura nueva (D-R9-6): el trabajo es una opción
en la URL que todo enlace conserva, una función pura en el service, una columna
más en el catálogo de `workspace` y un enlace en la barra. Partirlo dejaría una
parte sin nada que mostrar. El riesgo principal es uno solo: que una persona
aparezca donde no debe —una invitada, una inactiva que nadie eligió, una de
otro workspace, o cualquiera para un member—.

**D-R9-2 — Quién es una persona sin horas.** Una **candidata** que no tiene
ninguna entrada cerrada con el inicio en el período, dentro del alcance y de los
filtros efectivos: la misma condición que la deja fuera del primer nivel. Las
candidatas salen del catálogo de personas de R4b (`listWorkspacePeople`), que ya
deja afuera a las invitadas por su estado:

| Persona del catálogo                                                 | Sin el filtro de personas | Con el filtro de personas |
| -------------------------------------------------------------------- | ------------------------- | ------------------------- |
| Activa                                                               | candidata                 | candidata si está elegida |
| Inactiva                                                             | no                        | candidata si está elegida |
| Cualquiera con la membresía creada en el fin del período o después   | no                        | no                        |
| Invitada, de otro workspace o que no existe (no está en el catálogo) | no                        | no (se ignora, RP-34)     |

- **Las activas, y las inactivas solo si se eligen.** Opciones: (1) solo las
  activas; (2) **las activas y, con el filtro de personas, las elegidas, también
  inactivas**; (3) activas e inactivas siempre. **(2).** Una inactiva es alguien
  que ya no está (RP-60): en «quién no cargó esta semana» sería ruido en cada
  período posterior a su salida. Pero quien la elige en «Personas» pregunta por
  ella, y con (1) la vería desaparecer sin explicación. Es la pregunta 1 de §10;
  el contrato implementa la recomendación.
- **Quien entró después del período no está.** Una candidata cuya
  `membership.created_at` es igual o posterior al fin del período (`span.to`,
  el inicio del día siguiente al último en la zona de quien mira) no aparece.
  Hoy `ensureWorkspaceContext` crea la membresía en el primer ingreso
  (`workspace/service.ts:57-74`) y nada crea membresías `invited`, así que
  `created_at` es el primer ingreso, y nadie carga horas antes de entrar: la
  fila de alguien que todavía no estaba diría «no cargó» de un período en que
  no podía. Con las invitaciones de la fase 2 deja de ser cierto (§9). Es la
  pregunta 2 de §10; el contrato implementa la recomendación.
- **El estado es el de hoy.** La base no guarda cuándo se desactivó una persona:
  alguien activo durante el período y desactivado después no aparece sin horas
  salvo que se lo elija. Va en §9.
- **«Sin horas» es sin entradas cerradas que pasen los filtros**:
  - una persona con solo un timer en curso aparece sin horas (P-07);
  - una persona con entradas que suman menos de un segundo (`entrySeconds` las
    trunca) **tiene horas**: su fila es la de siempre, en «0:00», con sus hijos;
  - con un filtro de cliente o de proyecto, una persona que cargó solo en otros
    proyectos aparece sin horas: no cargó en lo filtrado. Es la pregunta «quién
    no cargó en P1», y la cabecera ya dice el filtro.

**D-R9-3 — Dónde aparecen: en el primer nivel, solo si es la persona.** Opciones:
(1) **solo con «Persona» en «Agrupar por»**; (2) también con la persona en un
subnivel (Proyecto → Persona). **(1).** RP-47 es «group the report by user»; con
la persona debajo de otra dimensión, cada grupo mostraría a todas las personas
que no cargaron en él, un producto cruzado (30 personas por 300 tareas son
9000 filas en «0:00») que no responde «quién no cargó» y se come el tope.

- **Con cualquier cantidad de niveles**: en Persona → Proyecto → Fecha, las
  personas sin horas son filas del primer nivel **sin hijos**. Las que tienen
  horas tienen sus niveles como siempre.
- **Una fila sin horas no tiene botón de expandir**: el árbol ya dibuja así a
  un grupo sin `children` (`report-tree-model.ts:69`) y, si hay alguna fila con
  botón, deja el espacio del chevrón para alinear (`report-tree.tsx:47`,
  `:77-83`). Si ninguna fila tiene hijos —un período sin horas—, la tabla se ve
  como la de un nivel, con el encabezado de todos los pedidos (sección 11.7 de
  `reportes.md`).
- **Su duración es «0:00»**, con `durationLabel`, como cualquier fila. Su nombre
  es el de su fila de siempre: `displayNameOf` y, si su membresía no está
  activa, «(inactiva)» (RP-31).

**D-R9-4 — Una opción de la agrupación, en la URL como `sin-horas=1`.** Opciones:
(1) un filtro más, dentro de `ReportFilters`; (2) **una opción de la agrupación,
en `ReportGrouping`**; (3) un campo aparte que cada componente recibe como
prop. **(2).**

- No es un filtro: no deja nada afuera, suma filas. Dentro de `ReportFilters`
  tendría que quedar fuera de `hasReportFilters`, de la invariante, de los
  filtros efectivos y de la fila «Personas» del archivo, y «Quitar filtros» la
  borraría.
- Es de la agrupación: RP-47 la ofrece «grouping by user», y aplica según el
  primer nivel. Todo enlace del reporte ya recibe la agrupación entera y la
  esparce (`...grouping` en `report-toolbar.tsx:55-82`, `:167`,
  `range-picker-model.ts:60`, `range-picker.tsx:174`, `subgroup-picker.tsx:97`,
  `filter-model.ts:203-205`), así que la opción viaja sin props nuevas. Con (3)
  serían cinco componentes más con una prop que hay que pasar a mano.
- **En la URL**: `sin-horas=1`, después de `subagrupar` y antes de `personas`. El
  orden de los parámetros pasa a ser `desde`, `hasta`, `agrupar`, `subagrupar`,
  `sin-horas`, `personas`, `clientes`, `proyectos`. Sin la opción, la URL es la
  de R6.
- **Se valida por su lado y se descarta sin aviso** (RP-32): solo `1` vale;
  `0`, `true`, `si`, un valor vacío, un espacio o el parámetro repetido la
  apagan, sin arrastrar a ningún otro parámetro.
- **El esquema no decide si aplica**, como no decide quién usa `personas`
  (D-R4-4): `ReportRequest.peopleWithoutTime` es lo de la URL. El service
  decide (D-R9-5), y el estado lleva la opción **efectiva**: encendida solo si
  aplica. Los enlaces escriben solo la efectiva, así que una que no aplica
  desaparece de la URL en la navegación siguiente, como un id ignorado.

**D-R9-5 — Quién la tiene: quien ve horas de otros.** La opción aplica si y
solo si se pidió, el primer nivel efectivo es la persona —el de `agrupar` o,
sin un `agrupar` válido, la persona (D-R2a-3)— y el alcance de `scopeOf` es
`everyone`, el único con el que se lee el catálogo de personas
(`service.ts:760-764`).

- **Sin acción nueva.** Que alguien no cargó es información sobre sus horas: la
  cubre `timeEntry.others.view` (owner y admin, `permissions/index.ts:131`), que
  ya decide el filtro de personas. Clockify la da también al team manager, que
  acá decide como member (P-03). La pregunta la hace `scopeOf` una vez, como en
  R4.
- **Un member, un `project_manager` o un `team_manager`** no tiene el enlace;
  con `sin-horas=1` en la URL ve lo mismo que sin él y el parámetro se pierde en
  la navegación siguiente. **Tampoco ve su propia fila en «0:00»**: sin horas
  propias, el primer vacío, como hoy. Opción descartada: la fila propia para
  `self`, que no responde ninguna pregunta que la línea «Ves solo tus horas.» y
  el vacío no respondan ya.
- **La línea del alcance no cambia.**

**D-R9-6 — De dónde salen: el catálogo de R4b, en la misma foto, sin consulta
nueva.** Opciones: (1) **en el service, de `listWorkspacePeople`, que el reporte
ya lee con el alcance `everyone`**; (2) un `left join` de `membership` contra los
totales en el repository del reporte; (3) una lectura nueva en `workspace`.
**(1).**

- Con (2), el repository del reporte leería `membership` por su cuenta y la
  regla de quién está en el workspace (las invitadas no, D-R4-5) quedaría
  escrita dos veces: es la opción que R4 ya descartó para el catálogo. Además
  cambiaría la sentencia de todas las agrupaciones por persona.
- Con (3), una sentencia más por pedido para traer lo que ya está en la
  transacción.
- **El catálogo suma una columna**: `WorkspacePerson.joinedAt`, de
  `membership.created_at` (`db/schema.ts:112`), para D-R9-2. **No llega a la
  pantalla**: `toPersonOptions` copia `id`, `name` e `inactive` y nada más
  (`service.ts:462-470`), y el criterio 18 de R4 ya lo afirma.
- **Las personas del primer nivel** son los `userId` de sus filas, ya leídas con
  el alcance angostado y los filtros. Una candidata que no está entre ellas es
  una fila sin horas. Es una diferencia de conjuntos sobre el catálogo, en
  memoria: no agrega horas, así que no choca con el ADR 0021.

**D-R9-7 — El orden: después de todas las que tienen horas, por nombre.** Las
filas con horas siguen en el orden de D-R2a-3 (duración descendente,
`compareNames` en el empate). **Las sin horas van después de todas ellas**,
también de una con entradas que suman «0:00», en el orden de `compareNames`
sobre el nombre que se muestra, que desempata por id. Es la regla de los «Sin
…» de RP-12 —después de los de su misma duración— aplicada a quien no tiene
entradas: así una fila con botón nunca queda entre dos sin botón.

**D-R9-8 — Cuentan para el tope de 3000 filas.** Son filas del primer nivel:

- el primer nivel entra si sus filas con horas **más las sin horas** son 3000 o
  menos; si no, no entra (D-R10-10) y no hay filas sin horas;
- el presupuesto de los niveles de abajo es 3000 menos las dos.

En la práctica no se ve —haría falta un workspace de miles de personas—, salvo
que el segundo nivel esté cerca del tope: Persona → Descripción de un mes de
todo el equipo puede pasar a mostrar solo las personas al encender la opción.
Opción descartada: dejarlas fuera del conteo, que rompería «el árbol no pasa de
3000 filas», del que dependen el peso de la página y el de la exportación.

**D-R9-9 — Los vacíos, el gráfico y «Exportar».** Las filas sin horas son
grupos: con alguna, no hay vacío. El gráfico y «Exportar» siguen mirando las
entradas (D-R5-6, D-R6-10), no los grupos.

| Situación                                 | Sin la opción                                  | Con la opción                                                       |
| ----------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------- |
| Período sin horas, sin filtros            | «No hay horas en este período»                 | una fila en «0:00» por candidata; sin gráfico ni «Exportar»         |
| Filtros que no dejan nada                 | «Ninguna entrada coincide…» y «Quitar filtros» | una fila en «0:00» por candidata, sin «Quitar filtros»; sin gráfico |
| Ninguna candidata y ninguna hora (D-R9-2) | el vacío que corresponda                       | el mismo vacío; «Quitar filtros» conserva la opción                 |
| Primer nivel que no entra                 | la fila del tope                               | la misma; las sin horas contaron para el tope (D-R9-8)              |

- «Total» y «Facturable» no cambian: una fila sin horas suma cero.
- **Sin gráfico y sin «Exportar» con solo filas sin horas**: es la regla de
  D-R6-10 sin excepción. Una excepción haría que la ruta exporte un período sin
  entradas solo por esta opción. Va en §9.

**D-R9-10 — El archivo: las filas sin horas en el resumen y una fila en la
cabecera.** La exportación es el estado de la página para la misma URL
(D-R6-2), así que las filas sin horas llegan solas al resumen, una por persona,
nivel 1, con su nombre, las columnas de abajo vacías, «0:00» y «0,00», y sin
filas hijas (`summaryOf`, `document.ts:220-255`, no cambia).

- **La cabecera suma una fila**, solo con la opción efectiva: «Personas sin
  horas» y «Sí», inmediatamente después de «Agrupado por» y antes de las de los
  filtros. Opción descartada: nada en la cabecera, con lo que un archivo con la
  opción y uno sin ella no se distinguen sin mirar las filas, y la cabecera
  nombra todo lo demás que cambia el resumen (D-R6-8).
- **«Entradas» no cambia**: una persona sin horas no tiene entradas.
- **El PDF de R7, que va después, lo hereda sin cambios** si lee el mismo
  documento, como dice su contrato.
- Los topes de R6 no cambian: el resumen sigue acotado por las 3000 filas.

**D-R9-11 — El control: un enlace que dice lo que hace.** Después del grupo de
«Agrupar por», en el mismo bloque, solo con `groupBy` en `person` y
`filterOptions.people` distinto de `null`: un `Link` con el estilo de contorno
chico que dice «Mostrar personas sin horas» con la opción apagada y «Ocultar
personas sin horas» con la opción encendida, y lleva a la misma URL con la
opción cambiada. El texto es su nombre accesible.

Opciones descartadas: una casilla de cliente que navega al cambiar, que no anda
antes de hidratar y no tiene precedente en la barra; un enlace con
`aria-pressed`, que no es un atributo de un enlace. «Agrupar por» y «Exportar»
ya son enlaces comunes (D-R2a-3, D-R6-10).

**D-R9-12 — Todo enlace conserva la opción.** `ReportLocation.peopleWithoutTime`
es **obligatorio**, como `filters` (D-R4-10): una URL del reporte que la olvide
no compila. Lo que cambia la opción:

- **el enlace del control**, que la invierte;
- **`withLevel`** (`grouping-model.ts:23-50`), que la conserva si y solo si el
  primer nivel que resulta es la persona: cambiar el segundo o el tercer nivel,
  o «Ninguno», la conservan; «Proyecto» en «Agrupar por» —también el
  intercambio desde Persona → Proyecto— la apaga, y volver a «Persona» la deja
  apagada.

Lo demás la conserva: las flechas, «Esta semana», los atajos, «Aplicar» del
período y de cada filtro, «Quitar filtros», los enlaces de «Exportar» y el
`key` de `ReportTree` y del gráfico, así que encenderla o apagarla vuelve a
contraer el árbol (D-R3-9).

**D-R9-13 — Sin comprobación contra Neon y sin medición nueva.** El repository
del reporte no cambia. `listPeople` suma una columna de la misma tabla, sin
condición nueva ni parámetro de otra forma. Lo que viaja de más es una fila por
persona sin horas, a lo sumo las del catálogo, que ya viaja entero en
`filterOptions.people`. Si `backend-dev` ve que el plan de `listPeople` cambia,
vuelve a correr Q24 (§6.3 de R4) y lo avisa.

**D-R9-14 — Los e2e de R9.** Heredan §8.3 de R2a con D-R4-13. Las personas del
test se siembran con su `joinedAt` antes del período (`setJoinedAt`, §7), salvo
la que prueba que quien entró después no está; la persona de la sesión también,
porque su membresía puede ser de la misma corrida. El filtro de personas hace
reproducible la lista: las afirmaciones de orden y de total van con personas
elegidas, todas del test; sin filtro, el recorrido solo afirma que una fila del
test está o no está, nunca la lista entera, porque el workspace de los e2e
acumula las personas de todas las corridas.

**D-R9-15 — Lo que se prueba en unidad y lo que no.** Como D-R4-14. En unidad:
el esquema, `reportHref`, `withLevel`, la barra, la vista, el árbol con una fila
sin hijos y el documento. Lo que depende de la base —quiénes son, el orden, el
tope, el alcance— es de integración. La navegación del enlace y que los enlaces
de los popovers la conserven al usarlos, de e2e.

## 0. Precondición de arranque

- **`main` en `31a83b3`**, con R6 entero. Las citas de abajo son de ese árbol
  (la rama `nucleo/r7-contrato` solo suma documentos). Los tests de integración
  usan `postgres:18-alpine`; todo test de tiempo fija reloj y zona.
- **R9 va antes que R7a, y no en paralelo** (decisión del team-lead, §10). Los
  dos tocan:
  - `report/schema.ts`;
  - `report/service.ts`: R7, `ReadPlan.exporting` y las firmas de
    `readReportState` y `getReportExport`; R9, `ReadPlan`, `readReport`,
    `readLevelsWithinLimit` y el estado;
  - `export/document.ts` (R7, `exportDocumentOf`; R9, `headerOf`) y
    `export/labels.ts`;
  - `components/labels.ts` y `report-toolbar.test.tsx` (R7,
    `exportFormatLabels.pdf`; R9, los textos y el enlace);
  - `service.integration.test.ts`, `scope.integration.test.ts` y
    `handler.integration.test.ts`, que los dos editan en su paso 1 (R7 por la
    firma de `getReportExport`, R9 por `ReportRequest`);
  - `export/document.test.ts`;
  - `e2e/reports-page.ts` y `e2e/reports.spec.ts`.

  R7a arranca con R9 mergeado y escribe sus casos nuevos con
  `peopleWithoutTime`.

- **Sin pendientes del usuario para arrancar.** Las preguntas de §10 no
  bloquean: el contrato implementa sus recomendaciones.
- **Las membresías no activas y la fecha de ingreso se siembran por base**:
  `seedMember(workspaceId, role, status, id?)` y un `update` de
  `membership.created_at` en integración; `seedPerson({ status })` y
  `setJoinedAt(email, instant)` (nuevo, §7) en e2e.

### Supuestos sobre el árbol, con archivo y línea en `31a83b3`

| Supuesto                                                                                                                                                                        | Dónde                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ReportGrouping` es `groupBy` y `subgroups`; `reportLevelsOf` recibe un `ReportGrouping` y la llaman con el estado y con un literal del service                                 | `src/modules/report/schema.ts:145-153`; `service.ts:913`; `components/report-view.tsx:31`; `export/document.ts:132`, `:221`; `export/handler.ts:56` |
| `reportFiltersOf` valida cada filtro por su lado; `reportPeopleParams` distingue mayúsculas                                                                                     | `schema.ts:271-294`                                                                                                                                 |
| `reportPersonGroup` lleva `userId`, `name`, `inactive`, `seconds` y `children` opcional con al menos uno                                                                        | `schema.ts:374-395`                                                                                                                                 |
| `reportReadyState` lleva `filters`, `filterOptions` (con `people` `null` sin el permiso) y `chart`; dos `refine`                                                                | `schema.ts:524-577`                                                                                                                                 |
| `reportRequestOf` arma `range`, `groupBy`, `subgroups` y `filters`; la página y el handler lo usan                                                                              | `src/modules/report/request.ts:29-42`; `src/app/(app)/reportes/page.tsx:10`; `export/handler.ts:109`                                                |
| `ReportRequest` tiene `range`, `groupBy`, `subgroups` y `filters`, todos obligatorios                                                                                           | `src/modules/report/service.ts:103-112`                                                                                                             |
| `scopeOf` pregunta `timeEntry.others.view` una vez; `narrowedTo` solo sale de `everyone`                                                                                        | `service.ts:119-145`                                                                                                                                |
| `sortKeyOf` y `compareGroups`: duración descendente, `compareNames` en el empate y los «Sin …» después                                                                          | `service.ts:338-373`                                                                                                                                |
| `toPersonOptions` copia `id`, `name` (con `displayNameOf`) e `inactive`, en el orden de `compareNames`; `effectiveFiltersOf` cruza `people` con esas opciones                   | `service.ts:462-496`                                                                                                                                |
| `treeOf` cuelga cada fila de su camino y `groupsOf` lanza si un grupo de un nivel que se muestra no tiene hijos                                                                 | `service.ts:568-618` (`:612-614`)                                                                                                                   |
| `readLevelsWithinLimit` lee cada nivel con lo que queda del tope más uno, devuelve vacío si no entra el primero y no lee más abajo de un primer nivel sin filas                 | `service.ts:627-649`                                                                                                                                |
| `levelsShownOf`: 0 sin primer nivel; todos los pedidos con el primero vacío; si no, los leídos                                                                                  | `service.ts:656-665`                                                                                                                                |
| `ReadPlan` lleva `levels`, `span`, `buckets`, `filters`, `chartPlan` y `entries`                                                                                                | `service.ts:668-679`                                                                                                                                |
| `readReport` lee el catálogo de personas solo con `everyone`, angosta el alcance, lee los niveles, el total, el gráfico y, si se piden, las entradas                            | `service.ts:749-796` (`:760-768`)                                                                                                                   |
| El estado se arma en `readReportState`, con `groups: treeOf(...)`                                                                                                               | `service.ts:969-989`                                                                                                                                |
| `WorkspacePerson` es `userId`, `accountName`, `displayName` y `status`; `listWorkspacePeople` pide `team.view` y llama a `workspaceRepository.listPeople` por el objeto         | `src/modules/workspace/service.ts:90-131`                                                                                                           |
| `listPeople` lee `membership` con `user` y `user_preference`, con `active` e `inactive`                                                                                         | `src/modules/workspace/repository.ts:17-25`, `:102-119`                                                                                             |
| `ensureWorkspaceContext` crea la membresía en el primer ingreso                                                                                                                 | `workspace/service.ts:57-74`                                                                                                                        |
| `membership.created_at` existe, no nulo, con `defaultNow()`                                                                                                                     | `src/server/db/schema.ts:97-123` (`:112`)                                                                                                           |
| `timeEntry.others.view` es de owner y admin; `team.view` y `report.view`, de todos los roles activos                                                                            | `src/server/permissions/index.ts:125`, `:131-132`                                                                                                   |
| `ReportLocation` tiene `filters` obligatorio y `subgroups` opcional; `reportQuery` escribe `subagrupar` y después las listas                                                    | `src/modules/report/components/report-href.ts:11-16`, `:41-75`                                                                                      |
| `groupingOf` y `withLevel` arman la agrupación de un enlace de «Agrupar por» y de los subniveles                                                                                | `components/grouping-model.ts:8-50`                                                                                                                 |
| La barra arma `grouping` del estado y lo esparce en las flechas, «Esta semana», los selectores, los filtros y «Exportar»; el filtro de personas solo con `filterOptions.people` | `components/report-toolbar.tsx:47`, `:55-82`, `:88-107`, `:137-140`, `:152-176`, `:185-209`                                                         |
| `applySelection`, los atajos, los subniveles y `applyFilter` esparcen la agrupación                                                                                             | `range-picker-model.ts:39`, `:60`; `range-picker.tsx:174`; `subgroup-picker.tsx:97`; `filter-model.ts:186`, `:203-205`                              |
| `ReportView` arma el `key` del pedido y «Quitar filtros» con `groupBy` y `subgroups` sueltos                                                                                    | `components/report-view.tsx:38-43`, `:139-144`                                                                                                      |
| El árbol: `expandable` es tener `children`; con alguna fila expandible, las demás dejan el espacio del chevrón                                                                  | `components/report-tree-model.ts:69`; `components/report-tree.tsx:47`, `:77-83`                                                                     |
| El documento: «Agrupado por» después de «Alcance» y antes de las filas de filtros; el resumen recorre `groups` y solo baja si hay `children`                                    | `export/document.ts:127-165` (`:147-151`), `:220-255` (`:248`)                                                                                      |
| `exportLabels.yes` es «Sí»                                                                                                                                                      | `export/labels.ts:28`                                                                                                                               |
| `readyState(actor, Partial<ReportRequest>)` completa el pedido con valores por omisión                                                                                          | `src/modules/report/service.integration.test.ts:132-152`                                                                                            |
| e2e: `reportsQuery`, `reportsUrl`, `exportUrl` y `reportsUrlOf` conocen `subagrupar` y los filtros, y `reportsUrlOf` afirma que no hay filtros que no se pidieron               | `e2e/reports-page.ts:230-329`                                                                                                                       |
| e2e: los helpers que cambian a una persona (`setRole`, `setDisplayName`, `setWeekStart`) reciben su email                                                                       | `e2e/database.ts:433-490`                                                                                                                           |
| `compareNames` compara `{ id, name }` y desempata por id                                                                                                                        | `src/lib/text.ts:27-39`                                                                                                                             |

## 1. Alcance

Entra:

- **El módulo `report`**: `sin-horas` en la URL; `peopleWithoutTime` en
  `ReportGrouping`, en `ReportRequest` y en el estado; las candidatas, las filas
  sin horas y su lugar en el tope y en el orden; la fila de la cabecera del
  archivo.
- **El módulo `workspace`**: `joinedAt` en `WorkspacePerson` y en `listPeople`.
- **La pantalla**: el enlace «Mostrar personas sin horas» / «Ocultar personas
  sin horas»; todo enlace conserva la opción.

Queda afuera: ver §11.

### Consecuencias sobre código ya entregado

| Archivo                                                                                                                     | Qué cambia                                                                                                                                                                                                                                                                                                                                                                                   | Qué hay que volver a probar                                |
| --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `src/modules/report/schema.ts`                                                                                              | `peopleWithoutTime` en `ReportGrouping` y en el estado, con su `refine`; `reportLevelsOf` recibe solo `groupBy` y `subgroups`; `reportPeopleWithoutTimeParams`                                                                                                                                                                                                                               | `schema.test.ts`                                           |
| `src/modules/report/request.ts`                                                                                             | `peopleWithoutTime` en el pedido                                                                                                                                                                                                                                                                                                                                                             | `request.test.ts`                                          |
| `src/modules/report/service.ts`                                                                                             | `ReportRequest.peopleWithoutTime`; las candidatas y las filas sin horas en `readReport`; el tope; el estado                                                                                                                                                                                                                                                                                  | `service.integration.test.ts`, `scope.integration.test.ts` |
| `src/modules/report/export/document.ts`, `export/labels.ts`                                                                 | la fila «Personas sin horas» de la cabecera                                                                                                                                                                                                                                                                                                                                                  | `document.test.ts`, `handler.integration.test.ts`          |
| `src/modules/workspace/service.ts`, `repository.ts`                                                                         | `joinedAt` en `WorkspacePerson` y `PersonRow`                                                                                                                                                                                                                                                                                                                                                | `workspace/service.integration.test.ts`                    |
| `components/report-href.ts`                                                                                                 | `peopleWithoutTime` obligatorio en `ReportLocation`; `sin-horas=1`                                                                                                                                                                                                                                                                                                                           | `report-href.test.ts`                                      |
| `components/grouping-model.ts`                                                                                              | `groupingOf` y `withLevel` arman y conservan la opción (D-R9-12)                                                                                                                                                                                                                                                                                                                             | `grouping-model.test.ts`                                   |
| `components/report-toolbar.tsx`, `report-view.tsx`, `labels.ts`                                                             | el enlace; `grouping` con la opción; el `key` y «Quitar filtros» con la opción                                                                                                                                                                                                                                                                                                               | `report-toolbar.test.tsx`, `report-view.test.tsx`          |
| **Edición mecánica, paso 1** (`backend-dev`): los fixtures de componentes y de exportación                                  | `peopleWithoutTime: false` en cada literal de `ReportGrouping` y de `ReportReadyState` (`report-href.test.ts`, `grouping-model.test.ts`, `range-picker.test.tsx`, `subgroup-picker.test.tsx`, `filter-model.test.ts`, `report-toolbar.test.tsx`, `report-view.test.tsx`, `report-chart.test.tsx` si arma un estado, `document.test.ts`), con una constante común por archivo donde ya la hay | —                                                          |
| **Edición mecánica, paso 1** (`backend-dev`): `report-toolbar.tsx:47` y `grouping-model.ts:8-13`                            | `peopleWithoutTime: state.peopleWithoutTime` en la barra y `false` en `groupingOf`, para que compile; `frontend-dev` pone la regla de D-R9-12 en el paso 2                                                                                                                                                                                                                                   | —                                                          |
| **Edición mecánica, paso 1** (`backend-dev`): `scope.integration.test.ts`, `request.test.ts`, `handler.integration.test.ts` | `peopleWithoutTime: false` en los constructores de pedidos y en los dos lados de cada `toStrictEqual` que compara un `ReportRequest`                                                                                                                                                                                                                                                         | —                                                          |
| `e2e/reports-page.ts`, `e2e/database.ts`                                                                                    | `sin-horas` en las URL y `reportsUrlOf` que afirma que no está si no se pide; `setJoinedAt`                                                                                                                                                                                                                                                                                                  | `reports.spec.ts` entero                                   |

- **Una URL sin `sin-horas` no cambia**, y los tests de R2a a R6 siguen
  afirmando lo mismo. Cambian las firmas que arman pedidos, agrupaciones y
  estados. Si algún valor afirmado de R2a a R6 cambia, es un error del slice, no
  del test.
- **Las ediciones mecánicas fuera del reparto** siguen la regla de R3 y R4: las
  hace `backend-dev` para que su commit compile y pase, con el aviso al
  team-lead, y espera a que el dueño de cada archivo commitee lo que tenga
  pendiente en él.

## 2. Esquema e índices

**Ninguna tabla ni índice cambia.** `membership.created_at` ya existe
(`db/schema.ts:112`). Sin migración.

## 3. Permisos

**Ninguna acción nueva**; `src/server/permissions/` no cambia. Deciden las que
ya existen:

- `report.view` (todos los roles activos): ver el reporte.
- `timeEntry.others.view` (owner y admin): que la opción exista y aplique, a
  través del alcance `everyone` que deja `scopeOf` (D-R9-5). Ningún otro lugar
  pregunta por roles: el service mira `scope.people.kind`, como en R4.
- `team.view` (todos los roles activos): `listWorkspacePeople` devuelve la lista
  vacía sin él, como hoy; con la lista vacía no hay candidatas.

**La transacción y el catálogo no se abren ni se leen sin `report.view`**, como
hoy.

## 4. Contrato de lectura

### 4.1 Los tipos (`report/schema.ts`)

```ts
/** Los niveles de un reporte: el primero y, debajo, hasta dos más, sin repetir (RP-12). */
export type ReportGrouping = {
  readonly groupBy: ReportGroupBy;
  readonly subgroups: readonly ReportGroupBy[];
  /**
   * RP-47, D-R9-4: con la persona en el primer nivel, también las personas sin
   * horas. En un enlace, solo la efectiva (D-R9-12).
   */
  readonly peopleWithoutTime: boolean;
};

/** Los niveles de un reporte en orden: el primero y los de abajo. */
export function reportLevelsOf(
  grouping: Pick<ReportGrouping, "groupBy" | "subgroups">,
): readonly ReportGroupBy[];

/**
 * `?sin-horas=1` con `safeParse` (D-R9-4): cualquier otro valor, uno vacío o el
 * parámetro repetido se descartan. No decide si aplica: eso es del service.
 */
export const reportPeopleWithoutTimeParams; // { "sin-horas": "1" } → true

// reportReadyState suma, dentro de su `z.object` (en zod 4 un esquema ya
// refinado no se extiende):
//   /**
//    * D-R9-4, D-R9-5: la opción efectiva. Las personas sin horas, si hay, están
//    * en `groups`, al final del primer nivel y sin `children`.
//    */
//   peopleWithoutTime: z.boolean(),
// y un `refine` más:
//   ({ peopleWithoutTime, groupBy, filterOptions }) =>
//     !peopleWithoutTime || (groupBy === "person" && filterOptions.people !== null)
```

- **La URL dice `sin-horas=1`**; el código, `peopleWithoutTime`.
- `reportPersonGroup` **no cambia**: una fila sin horas es una persona con
  `seconds: 0` y sin `children`. Lo que la distingue de una con entradas de
  menos de un segundo es que no tiene hijos con más de un nivel y su lugar en el
  orden (D-R9-7); ninguna pantalla ni archivo necesita más.

### 4.2 El pedido (`report/request.ts`)

`reportRequestOf` suma `peopleWithoutTime:
reportPeopleWithoutTimeParams.safeParse(params).success`. Sigue siendo la única
lectura de la URL de la página y de la ruta de exportación.

### 4.3 `src/server/time` y el repository del reporte

**No cambian.** `report/repository.ts` sigue sin leer `membership` para el
catálogo.

### 4.4 Service (`report/service.ts`)

```ts
export type ReportRequest = {
  readonly range: ReportRange | null;
  readonly groupBy: ReportGroupBy | null;
  readonly subgroups: readonly ReportGroupBy[];
  readonly filters: ReportFilters;
  /** El de `reportPeopleWithoutTimeParams`, sin decidir si aplica (D-R9-5). */
  readonly peopleWithoutTime: boolean;
};
```

`getReportState` y `getReportExport` conservan su firma. En `readReportState`:

1. **`report.view`, `scopeOf`, el período, las invariantes**, sin cambios.
2. **La opción efectiva** (D-R9-5): `request.peopleWithoutTime`, el primer nivel
   efectivo es `person` y `scope.people.kind` es `everyone`. Va en `ReadPlan`
   como `peopleWithoutTime`.

En `readReport`, dentro de la transacción:

3. **El catálogo de personas**, como hoy, solo con `everyone`. Se guarda la
   lista de `WorkspacePerson` además de las opciones del filtro.
4. **Las candidatas** (D-R9-2), solo con la opción efectiva, con una función
   privada:

   ```ts
   /**
    * D-R9-2: quiénes pueden aparecer sin horas: las elegidas en el filtro de
    * personas, si hay, activas o inactivas; si no, las activas. En los dos casos,
    * con la membresía creada antes de `until`, el fin del período.
    */
   function withoutTimeCandidates(
     people: readonly WorkspacePerson[],
     chosen: readonly string[],
     until: Date,
   ): readonly WorkspacePerson[];
   ```

   `chosen` son las personas de los filtros efectivos (D-R4-5), comparadas tal
   cual. `until` es `plan.span.to`; la comparación es estricta
   (`joinedAt < until`).

5. **Las filas sin horas**, con otra función privada, la única que dice quiénes
   son:

   ```ts
   /**
    * D-R9-3, D-R9-7: las candidatas que no tienen fila en el primer nivel, como
    * grupos de persona en cero y sin hijos, en el orden de `compareNames` sobre
    * el nombre de `displayNameOf`. Lanza si una fila del primer nivel no es de
    * persona.
    */
   function peopleWithoutTimeOf(
     firstLevel: readonly LevelTotalRow[],
     candidates: readonly WorkspacePerson[],
   ): ReportPersonGroup[];
   ```

   Cada grupo: `kind: "person"`, `userId`, `name` con `displayNameOf`,
   `inactive` si el estado es `inactive`, `seconds: 0`, sin `children`.

6. **El tope** (D-R9-8): `readLevelsWithinLimit` recibe un tercer argumento,
   obligatorio:

   ```ts
   /** D-R9-8: cuántas filas suma el primer nivel una vez leído; 0 sin la opción. */
   firstLevelExtra: (rows: readonly LevelTotalRow[]) => number,
   ```

   Después de leer el primer nivel dentro de su presupuesto, suma
   `firstLevelExtra(rows)` a sus filas: si pasan de `REPORT_MAX_ROWS`, devuelve
   la lista vacía, como cuando no entra el primero; si no, ese total es lo que
   ya se leyó para el presupuesto de los de abajo. Con la opción,
   `firstLevelExtra` es `(rows) => peopleWithoutTimeOf(rows, candidates).length`;
   sin ella, `() => 0`.

7. **El estado**: `groups` es `[...treeOf(levels, time), ...withoutTime]`, con
   `withoutTime` de `peopleWithoutTimeOf(levels[0], candidates)` si se leyó el
   primer nivel y la opción es efectiva, y vacío si no. `treeOf` y `groupsOf` no
   cambian: las filas sin horas no pasan por ellos. `levelsShown`, el total, el
   gráfico y las entradas no cambian. `peopleWithoutTime` es la opción efectiva.

- **Ninguna lectura nueva**: con la opción, `listPeople` se llama una vez y
  `totalsByLevels` las mismas veces que sin ella.
- **`joinedAt` no sale del service**: ni las opciones del filtro ni los grupos lo
  llevan.

### 4.5 La función del dueño (`workspace/service.ts` y `repository.ts`)

```ts
/** Una persona del workspace con su estado, para un catálogo de otra pantalla. */
export type WorkspacePerson = {
  readonly userId: string;
  readonly accountName: string;
  readonly displayName: string | null;
  readonly status: "active" | "inactive";
  /**
   * `membership.created_at`: desde cuándo existe la membresía; hoy, el primer
   * ingreso (D-R9-2). Con las invitaciones de la fase 2 pasa a ser la fecha de
   * la invitación (§9). Para decidir, no para mostrar.
   */
  readonly joinedAt: Date;
};
```

- `PersonRow` suma `joinedAt`, y `listPeople` lo selecciona de
  `membership.createdAt`. La condición, las uniones y la firma no cambian.
- `toWorkspacePerson` lo copia, campo por campo como hoy.
- `listWorkspacePeople` no cambia de firma ni de permiso.

### 4.6 El documento (`export/document.ts` y `export/labels.ts`)

- `exportLabels.peopleWithoutTime`: «Personas sin horas».
- `headerOf`: con `report.peopleWithoutTime`, la fila
  `[text(exportLabels.peopleWithoutTime), text(exportLabels.yes)]`
  inmediatamente después de «Agrupado por». Sin la opción, ninguna fila.
- `summaryOf` y `entriesSectionOf` no cambian.

### 4.7 Costo

- **Ninguna sentencia nueva por pedido.** Con la opción y sin ella, las mismas.
- **`listPeople`**: una columna más de la misma fila.
- **En memoria**: un conjunto con los `userId` del primer nivel y un recorrido
  del catálogo, a lo sumo las personas del workspace.
- **Lo que viaja**: una fila de persona por cada sin horas en la página y en el
  archivo; el parámetro `sin-horas=1` en cada `href`, unos diez bytes más.

## 5. Pantalla

### 5.1 La URL (`report-href.ts`)

```ts
type ReportLocation = {
  readonly range: ReportRange;
  readonly groupBy: ReportGroupBy;
  readonly subgroups?: readonly ReportGroupBy[];
  /** D-R9-12: obligatorio, como `filters`; un enlace que la olvide no compila. */
  readonly peopleWithoutTime: boolean;
  readonly filters: ReportFilters;
};
```

`reportQuery` escribe `sin-horas=1` después de `subagrupar` y antes de
`personas` si `peopleWithoutTime` es `true` **y** `groupBy` es `person`; si no,
nada. `reportHref` y `reportExportHref` siguen dando la misma query para los
mismos argumentos.

### 5.2 La agrupación (`grouping-model.ts`)

- `groupingOf` recibe la opción y la pone solo si el primer nivel es `person`.
- `withLevel(grouping, level, dimension)` devuelve
  `peopleWithoutTime: grouping.peopleWithoutTime && resultado.groupBy === "person"`
  (D-R9-12). `levelOptions` no cambia.

### 5.3 La barra (`report-toolbar.tsx`)

- `grouping` se arma del estado con `peopleWithoutTime: state.peopleWithoutTime`.
- **El enlace** (D-R9-11), dentro del bloque de «Agrupar por», después del
  `role="group"`, solo con `state.groupBy === "person"` y
  `state.filterOptions.people !== null`:
  `href={reportHref({ range, ...grouping, peopleWithoutTime: !grouping.peopleWithoutTime, filters })}`,
  `className={buttonVariants({ variant: "outline", size: "sm" })}`, con el texto
  de §5.5 según la opción.
- Los demás enlaces no cambian: ya esparcen `grouping`.

### 5.4 La tabla (`report-view.tsx`)

- El `key` del pedido y «Quitar filtros» pasan `peopleWithoutTime:
state.peopleWithoutTime`.
- `ReportTree`, `ReportTreeRows` y `GroupHeading` no cambian: una persona sin
  `children` ya se dibuja sin botón y, en un árbol con filas expandibles, con el
  espacio del chevrón.

### 5.5 Textos (`components/labels.ts`)

| Clave                   | Texto                        |
| ----------------------- | ---------------------------- |
| `showPeopleWithoutTime` | «Mostrar personas sin horas» |
| `hidePeopleWithoutTime` | «Ocultar personas sin horas» |

La fila de la cabecera del archivo es `exportLabels.peopleWithoutTime` (§4.6).

## 6. Volumen y peso

**Sin medición** (D-R9-13). No hay sentencia nueva ni forma de parámetro nueva;
el peso de una fila de persona ya está en las mediciones de R3b y R4 (3000
grupos y el catálogo). Si el plan de `listPeople` cambia con la columna nueva,
`backend-dev` vuelve a correr Q24 y lo informa.

## 7. Reparto de archivos

Rutas absolutas. **El team-lead crea y migra la base de test de cada agente que
corre integración, y la de e2e, antes de lanzarlo, y las borra al terminar**;
cada agente usa solo la suya, por `TEST_DATABASE_URL` en integración y
`DATABASE_URL` para un servidor. Las corridas van en primer plano.

### backend-dev

```
/home/maxi/program/clock/src/modules/report/schema.ts
/home/maxi/program/clock/src/modules/report/schema.test.ts
/home/maxi/program/clock/src/modules/report/request.ts
/home/maxi/program/clock/src/modules/report/request.test.ts
/home/maxi/program/clock/src/modules/report/service.ts
/home/maxi/program/clock/src/modules/report/service.integration.test.ts
/home/maxi/program/clock/src/modules/report/export/document.ts
/home/maxi/program/clock/src/modules/report/export/labels.ts
/home/maxi/program/clock/src/modules/report/export/document.test.ts
/home/maxi/program/clock/src/modules/report/export/handler.integration.test.ts
/home/maxi/program/clock/src/modules/workspace/service.ts
/home/maxi/program/clock/src/modules/workspace/repository.ts
/home/maxi/program/clock/src/modules/workspace/service.integration.test.ts
```

Más las ediciones mecánicas del paso 1 (§1, «Consecuencias»).

### frontend-dev

```
/home/maxi/program/clock/src/modules/report/components/labels.ts
/home/maxi/program/clock/src/modules/report/components/report-href.ts
/home/maxi/program/clock/src/modules/report/components/report-href.test.ts
/home/maxi/program/clock/src/modules/report/components/grouping-model.ts
/home/maxi/program/clock/src/modules/report/components/grouping-model.test.ts
/home/maxi/program/clock/src/modules/report/components/report-toolbar.tsx
/home/maxi/program/clock/src/modules/report/components/report-toolbar.test.tsx
/home/maxi/program/clock/src/modules/report/components/report-view.tsx
/home/maxi/program/clock/src/modules/report/components/report-view.test.tsx
/home/maxi/program/clock/src/modules/report/components/report-tree.test.tsx
/home/maxi/program/clock/src/modules/report/components/range-picker.test.tsx
/home/maxi/program/clock/src/modules/report/components/subgroup-picker.test.tsx
/home/maxi/program/clock/src/modules/report/components/filter-model.test.ts
```

`range-picker.tsx`, `range-picker-model.ts`, `subgroup-picker.tsx`,
`filter-model.ts`, `filter-picker.tsx` y `report-tree.tsx` no cambian: sus
tests afirman que conservan la opción.

### test-engineer

```
/home/maxi/program/clock/src/modules/report/scope.integration.test.ts
```

Suma los casos del criterio 14 contra las firmas publicadas, sin mirar
`withoutTimeCandidates` ni `peopleWithoutTimeOf`, y corre las tablas de
mutantes de §8.1 en una copia propia, con su base.

### e2e-tester

```
/home/maxi/program/clock/e2e/reports.spec.ts       (recorridos 26 y 27)
/home/maxi/program/clock/e2e/reports-page.ts
/home/maxi/program/clock/e2e/database.ts
```

- `database.ts`: `setJoinedAt(email, instant)`, como `setRole`: cambia
  `membership.created_at` de esa persona en el workspace de los e2e, con la
  misma guarda de exactamente una fila.
- `reports-page.ts`: `reportsUrl`, `exportUrl` y `reportsUrlOf` reciben la
  opción (`{ peopleWithoutTime?: boolean }`, después de los filtros) y la
  escriben como `sin-horas=1` después de `subagrupar`; **`reportsUrlOf` afirma
  que no hay `sin-horas` cuando no se pide**. `withoutTimeToggle(page, shown)`
  por su nombre exacto, `SHOW_WITHOUT_TIME` y `HIDE_WITHOUT_TIME`. Ningún export
  existente se renombra.

### parity-analyst

```
/home/maxi/program/clock/docs/parity/reportes.md
```

No escribe archivos: entrega el texto y **lo aplica el team-lead**, antes del
merge, con su corrección fechada y una sección «16. Núcleo, R9»:

- **RP-47**: pasa del semanal al resumido, de `replicar` a `adaptar`, con la
  justificación: solo owner y admin (P-01, P-03); las activas y las elegidas;
  quien entró después del período no está; el enlace y `sin-horas`.
- **RP-12**: las sin horas, después de todas las que tienen horas, por nombre.
- **RP-13**: una fila sin horas no tiene botón, en cualquier cantidad de niveles.
- **RP-32**: `sin-horas=1`, validado por su lado; los enlaces llevan solo la
  efectiva; un member con `sin-horas` ve lo mismo.
- **RP-33**: con la opción, las filas sin horas reemplazan a los vacíos (tabla de
  D-R9-9); sin gráfico ni «Exportar» con solo filas sin horas.
- **RP-54** y la sección 15.2: la fila «Personas sin horas» de la cabecera y las
  filas sin horas del resumen.
- **RP-62 y RP-64**: la inactiva aparece sin horas solo si se la elige; la
  invitada, nunca.
- **Sección 6**: RP-47 entra en el núcleo.
- **Divergencias que el reviewer no marca** (§9 de este contrato, las que se
  ven).

### Lo que no toca nadie

`src/server/permissions/`, `src/server/db/`, `drizzle/`, `src/server/time/`,
`src/components/`, `src/lib/`, `report/repository.ts`, `report/chart.ts`,
`report/period.ts`, `report-tree.tsx` y `report-tree-model.ts`,
`group-heading.tsx`, `report-chart.tsx`, `chart-*`, `filter-picker.tsx`,
`range-picker.tsx`, `range-picker-model.ts`, `subgroup-picker.tsx`,
`export/csv.ts`, `export/xlsx.ts`, `export/handler.ts`, las rutas, `page.tsx`,
`profile/`, `project/`, `team/`, `scripts/report-volume/`, los ADR. El mapa y el
estado los actualiza el team-lead.

### Orden

1. **Primer commit de `backend-dev`**: en `schema.ts`, `peopleWithoutTime` en
   `ReportGrouping` y en `reportReadyState` con su `refine`, `reportLevelsOf`
   con `Pick`, `reportPeopleWithoutTimeParams`, con `schema.test.ts`;
   `request.ts` con `request.test.ts`; `ReportRequest.peopleWithoutTime`; el
   estado lleva **`peopleWithoutTime: false` siempre** hasta el paso 3;
   `WorkspacePerson.joinedAt` y `PersonRow.joinedAt` en los tipos. **Ediciones
   mecánicas** del §1 para que compile y pase. **Avisa a `frontend-dev`,
   `test-engineer` y `e2e-tester`**: desde acá las formas son las finales.
2. **Los otros tres arrancan con el paso 1.** `frontend-dev`: `labels.ts`,
   `ReportLocation` y `reportQuery`, `groupingOf` y `withLevel`, el enlace, la
   vista y los tests del criterio 16. `test-engineer`: los casos del criterio
   14, sin commitear hasta el paso 3. `e2e-tester`: los helpers y los
   recorridos 26 y 27, confirmando que fallan por la funcionalidad y no por el
   arnés.
3. **`backend-dev`**: `listPeople` con `joinedAt` y su test; las candidatas, las
   filas sin horas, el tope y el estado en el service; la fila de la cabecera;
   los criterios 4 a 13 y 15.
4. **`test-engineer`, después del paso 3**: commitea los casos del criterio 14;
   los mutantes de §8.1.
5. **Cierre**: el texto de `parity-analyst`, aplicado por el team-lead, antes
   del merge, y la revisión de seguridad: que la opción solo aplica con
   `everyone`; que las candidatas salen solo del catálogo del workspace de
   quien mira, leído con el `tx` de la foto; que un member, un
   `project_manager` o un `team_manager` con `sin-horas=1`, con o sin
   `personas`, no recibe ningún nombre ajeno, ni en la página ni en el archivo;
   que `joinedAt` no llega al estado ni al archivo.

## 8. Criterios de aceptación

**Las personas de los criterios de integración se siembran con `joinedAt`
anterior al período** (un `update` de `membership.created_at`, o el valor en el
mismo `insert`), el owner del `beforeEach` incluido, salvo las que prueban lo
contrario. Los espías van sobre los métodos de los repositories, como en R4
(§8 de R4).

1. **Los esquemas** (unidad, `schema.test.ts`) — `reportPeopleWithoutTimeParams`
   pasa con `sin-horas=1`; no pasa con `0`, `true`, `si`, `""`, `" 1"`, `"1 "` ni
   con `["1", "1"]`. `reportReadyState` rechaza `peopleWithoutTime: true` con
   `groupBy: "project"` y con `filterOptions.people: null`, y lo acepta con
   `person` y el catálogo. `reportLevelsOf` con `{ groupBy, subgroups }` sin la
   opción da los niveles.
2. **El pedido** (unidad, `request.test.ts`) — `sin-horas=1` da `true`, también
   con un `agrupar` inválido o con `agrupar=proyecto` (el esquema no decide);
   un `sin-horas` inválido da `false` y no cambia el rango, la agrupación, los
   subniveles ni los filtros; sin el parámetro, `false`.
3. **La URL** (unidad, `report-href.test.ts`) — con la opción y `person`,
   `sin-horas=1` va después de `subagrupar` y antes de `personas`; con `false`,
   no está; con `true` y `groupBy: "project"`, no está; leída con
   `reportRequestOf`, la misma opción; `reportExportHref` da la misma query. Un
   `ReportLocation` sin `peopleWithoutTime` no compila (`@ts-expect-error`).
4. **Lo existente sin la opción** (integración) — los tests de
   `service.integration.test.ts`, `scope.integration.test.ts`,
   `handler.integration.test.ts` y `workspace/service.integration.test.ts`
   pasan con los mismos valores.
5. **Quiénes son** (integración, service) — en el workspace A: el owner O y A1,
   activos con horas; B, activa sin horas; C, inactiva sin horas; I, invitada
   sin horas; N, activa sin horas, con la membresía creada **exactamente** en
   `span.to`; K, activa sin horas, creada 1 ms antes de `span.to`; y X, activa
   sin horas, del workspace B. Un admin de A, por persona, con la opción: O y
   A1 por duración, después B y K por nombre; ni C, ni I, ni N, ni X.
   `peopleWithoutTime: true`; B y K con `seconds: 0`, sin `children` e
   `inactive: false`. «Total», «Facturable», `chart` y `filterOptions` son los
   de sin la opción. Sin la opción, solo O y A1, y `peopleWithoutTime: false`.
6. **El orden** (integración) — «Zeta», con una sola entrada de 0,4 s, y
   «Beta», sin horas: Zeta va antes que Beta. Dos personas sin horas con el
   mismo nombre van por id. Una con horas nunca queda después de una sin horas.
7. **Con el filtro de personas** (integración) — `[A1, B, C]`: A1, después B y
   C con «inactiva» por nombre; O no está. `[C]`: una sola fila, C en cero; no
   hay vacío. `[N]`: `groups` vacío y `filters.people` con N (el segundo
   vacío). `[id de I]`: se ignora (RP-34) y la lista es la de sin filtro.
8. **Con cliente y proyecto** (integración) — A1 cargó solo en P2 y O en P1;
   con `[P1]` y la opción: O con sus horas y A1 sin horas, en cero, junto a B y
   K.
9. **En el árbol** (integración) — Persona → Proyecto con la opción: O y A1 con
   `children`, B y K sin; `levelsShown: 2`. Persona → Proyecto → Fecha, igual,
   con `levelsShown: 3`. Un período sin horas con la opción: `groups` son las
   candidatas, todas sin `children`; `levelsShown: 2`; `chart: null`; los
   totales en cero.
10. **Cuándo no aplica** (integración) — `groupBy: "project"` con la opción:
    `peopleWithoutTime: false` y los mismos grupos que sin ella;
    Proyecto → Persona con la opción: `false`, y debajo de cada proyecto solo
    las personas con horas en él. **`groupBy: null` con la opción aplica**: el
    primer nivel efectivo es la persona.
11. **El tope** (integración) — A1 con tantas entradas de descripciones
    distintas en el período que Persona → Descripción con la opción da
    exactamente 3000 filas: la de A1, sus descripciones y una por cada activa
    sin horas del workspace del test, el owner incluido. Con la opción,
    `levelsShown: 2`. Con D, una activa sin horas más: `levelsShown: 1`, y
    `groups` son A1 y después las sin horas por nombre, D entre ellas, todas
    sin `children`. Sin la opción, con D, `levelsShown: 2`. **El primer
    nivel**: con 3001 personas activas sin horas más, sembradas con una sola
    sentencia (`insert … select generate_series`) en `user` y `membership`,
    **con `created_at` anterior al período en el mismo `insert`**, por persona
    con la opción: `levelsShown: 0`, `groups` vacío y los totales de
    `entryTotals`.
12. **Una foto, sin lectura nueva** (integración) — con la opción,
    `workspaceRepository.listPeople` se llama **una vez**, con el mismo
    `Executor` que `reportRepository.totalsByLevels`, que no es `db`; y
    `totalsByLevels` se llama las mismas veces que sin la opción.
13. **El catálogo con la fecha de ingreso** (integración,
    `workspace/service.integration.test.ts`) — `joinedAt` es
    `membership.created_at` de cada persona, sembrado distinto de
    `updated_at` (la membresía se actualiza después de crearse).
14. **El alcance** (`scope.integration.test.ts`) — `member`,
    `project_manager` y `team_manager` con la opción, también con `personas` de
    otras personas de A y desde la URL con `reportRequestOf`: solo su fila,
    `peopleWithoutTime: false`, `filterOptions.people` en `null` y
    `workspaceRepository.listPeople` sin llamar. Uno de ellos sin horas en el
    período: `groups` vacío, el primer vacío, sin su fila en cero. El owner de
    B con la opción no ve a nadie de A. Owner y admin de A con la opción: las
    sin horas son de A.
15. **La exportación** (unidad, `document.test.ts`; integración,
    `handler.integration.test.ts`) —
    - el documento con `peopleWithoutTime: true`: la fila «Personas sin horas»
      y «Sí» inmediatamente después de «Agrupado por», antes de «Personas»;
      sin la opción, ninguna; una fila sin horas del resumen es nivel 1, su
      nombre, vacías las columnas de abajo, «0:00» y «0,00», sin filas hijas;
    - por la ruta, el CSV de un admin con `sin-horas=1` trae esa fila de
      cabecera y las filas sin horas en el resumen, y «Entradas» igual que sin
      la opción; el Excel, las mismas filas en «Resumen»; un member con
      `sin-horas=1&personas=<otra>` baja el mismo archivo que sin esos
      parámetros, sin la fila ni el nombre de la otra persona.

    El caso del PDF lo suma R7a, que va después (§10).

16. **La pantalla** (unidad) —
    - `grouping-model.test.ts`: con la opción, cambiar el nivel 1 o el 2, o
      «Ninguno», la conserva; «Persona» en el nivel 0 la conserva; «Proyecto»
      en el nivel 0, también desde Persona → Proyecto, la apaga; sin la opción,
      ninguna transición la enciende.
    - `report-toolbar.test.tsx`: el enlace está con `person` y el catálogo de
      personas, y dice «Mostrar personas sin horas» con `false` y «Ocultar
      personas sin horas» con `true`, con el `href` invertido; no está con
      `project` ni con `filterOptions.people` en `null`; con la opción, las
      flechas, «Esta semana», el enlace «Persona» de «Agrupar por» y los
      enlaces de «Exportar» llevan `sin-horas=1`, y «Proyecto» no. El conteo
      de grupos con rótulo no cambia.
    - `range-picker.test.tsx`, `subgroup-picker.test.tsx` y
      `filter-model.test.ts`: los atajos, `applySelection`, los enlaces de
      `SubgroupPanel` y `applyFilter` conservan la opción.
    - `report-view.test.tsx`: «Quitar filtros» con la opción la conserva; con
      las filas sin horas y sin horas cerradas, no hay vacío.
    - `report-tree.test.tsx`: en un árbol de dos niveles, una persona sin
      `children` no tiene botón y tiene el espacio del chevrón, y la de al lado
      tiene botón.
17. **De punta a punta** — los recorridos 26 y 27 de §8.2.
18. **Lo existente sigue verde** — lint, typecheck, `format:check`,
    `npm run test:all`, `next build` y la suite e2e entera. Ninguna afirmación
    existente cambia de valor.

### 8.1 Con qué se verifica cada criterio, y qué mutante mata

| Criterio | Tipo                | Archivo                                                                                                                                                                          | Mutante que tiene que caer                                                                                                                                                                                                                                                            |
| -------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | unidad              | `schema.test.ts`                                                                                                                                                                 | `z.coerce.boolean()` o `z.string()` en lugar del literal (pasan `0`, `true`); el `refine` del estado quitado o sin mirar `filterOptions.people`                                                                                                                                       |
| 2        | unidad              | `request.test.ts`                                                                                                                                                                | el pedido que mira `agrupar` para decidir; un `sin-horas` inválido que vacía otro parámetro                                                                                                                                                                                           |
| 3        | unidad              | `report-href.test.ts`                                                                                                                                                            | `sin-horas` después de los filtros o antes de `subagrupar`; escrito con `project`; `sin-horas=true`; `peopleWithoutTime` opcional en `ReportLocation` (cae el `@ts-expect-error`)                                                                                                     |
| 4        | integración         | las suites existentes                                                                                                                                                            | —                                                                                                                                                                                                                                                                                     |
| 5        | integración         | `service.integration.test.ts`                                                                                                                                                    | las candidatas sin la condición de estado (C aparece); `joinedAt` ignorado (N aparece); `<=` en lugar de `<` (N aparece); una lectura propia de `membership` sin estado (I aparece); la fila con horas repetida como sin horas (O dos veces); `seconds` o `children` en las sin horas |
| 6        | integración         | `service.integration.test.ts`                                                                                                                                                    | las sin horas ordenadas con `compareGroups` entre las de su duración (Beta antes que Zeta); sin desempate por id                                                                                                                                                                      |
| 7        | integración         | `service.integration.test.ts`                                                                                                                                                    | las candidatas siempre activas (C falta con `[C]`, O aparece con `[A1, B, C]`); las elegidas sin la regla de ingreso (N con `[N]`)                                                                                                                                                    |
| 8        | integración         | `service.integration.test.ts`                                                                                                                                                    | las personas con horas leídas sin los filtros (A1 no aparece con `[P1]`)                                                                                                                                                                                                              |
| 9        | integración         | `service.integration.test.ts`                                                                                                                                                    | las sin horas por `treeOf` (lanza «sin hijos»); `children: []`; las sin horas solo con un nivel                                                                                                                                                                                       |
| 10       | integración         | `service.integration.test.ts`                                                                                                                                                    | la opción efectiva sin mirar el primer nivel (filas sin horas por proyecto, o debajo de proyectos); el primer nivel tomado de `request.groupBy` sin el valor por omisión (falla con `null`)                                                                                           |
| 11       | integración         | `service.integration.test.ts`                                                                                                                                                    | las sin horas fuera del conteo (`levelsShown: 2` con D); contadas en el primer nivel y no en el presupuesto de abajo, o al revés; sin el corte del primer nivel por ellas (las 3001); las 3001 con `created_at` por omisión (quedan fuera de las candidatas y `levelsShown` no da 0)  |
| 12       | integración         | `service.integration.test.ts`                                                                                                                                                    | una segunda lectura del catálogo, o con `db`; una lectura del primer nivel sin filtros para saber quién tiene horas                                                                                                                                                                   |
| 13       | integración         | `workspace/service.integration.test.ts`                                                                                                                                          | `updatedAt` en lugar de `createdAt`; `joinedAt` sin copiar en `toWorkspacePerson`                                                                                                                                                                                                     |
| 14       | integración         | `scope.integration.test.ts`                                                                                                                                                      | la opción efectiva sin mirar el alcance (el catálogo leído con `self`: nombres ajenos); la fila propia en cero para `self`; las candidatas de todos los workspaces                                                                                                                    |
| 15       | unidad, integración | `document.test.ts`; `handler.integration.test.ts`                                                                                                                                | la fila de la cabecera siempre, o después de los filtros; la ruta con otro parseo (sin `sin-horas`); un member que recibe la fila o el nombre                                                                                                                                         |
| 16       | componente          | `grouping-model.test.ts`; `report-toolbar.test.tsx`; `range-picker.test.tsx`; `subgroup-picker.test.tsx`; `filter-model.test.ts`; `report-view.test.tsx`; `report-tree.test.tsx` | `withLevel` que siempre la conserva o siempre la apaga; el enlace para un member o con `project`; el texto que no cambia; un enlace que la pierde; «Quitar filtros» que la pierde; la fila sin hijos con botón                                                                        |
| 17       | e2e                 | `e2e/reports.spec.ts`                                                                                                                                                            | los del final de §8.2                                                                                                                                                                                                                                                                 |
| 18       | todas               | las suites existentes                                                                                                                                                            | —                                                                                                                                                                                                                                                                                     |

**Cualquier mutante declarado equivalente** se prueba antes con pedidos de una
membresía inactiva, de otro workspace y de un member con horas ajenas en el
rango.

### 8.2 Recorridos de `e2e/reports.spec.ts`

Dueño: `e2e-tester`. Los veinticinco de R2a a R6 no cambian, salvo que
`reportsUrlOf` ahora afirma que no hay `sin-horas`. Se suman dos, con la regla
de §8.3 de R2a y D-R9-14; las entradas van en la semana anterior a la de hoy,
en la zona de la persona, y se siembran antes de abrir la pantalla. R7a, que va
después, numera los suyos a continuación.

26. **Un admin ve quién no cargó, con las inactivas solo elegidas** (RP-47;
    D-R9-2 a D-R9-5, D-R9-7, D-R9-11, D-R9-12). La persona del test pasa a
    admin y se llama A. Se siembran B (activa), C (inactiva), D (invitada) y E
    (activa), y a las cuatro y a A se les pone `setJoinedAt` un mes antes de la
    semana anterior; N (activa) se siembra sin `setJoinedAt`: entró hoy. El
    martes de la semana anterior, A de 09:00 a 10:00 en P y B de 09:00 a 11:00
    en P. Desde la semana anterior por «Persona»:
    - Con «Personas» en A, B, C, E y N: B 2:00 y A 1:00; está el enlace
      «Mostrar personas sin horas».
    - Clic en el enlace: la URL lleva `sin-horas=1` después de `agrupar` y antes
      de `personas`; las filas son B 2:00, A 1:00, C 0:00 con «(inactiva)» y E
      0:00, en ese orden; N no está; total 3:00. El enlace dice «Ocultar
      personas sin horas».
    - «Segundo nivel: Proyecto»: la URL conserva `sin-horas`; B y A tienen
      botón de expandir, C y E no.
    - «Período anterior»: la URL conserva `sin-horas`; A, B, C y E en 0:00, por
      nombre, sin «No hay horas en este período» ni «Ninguna entrada coincide»,
      sin gráfico y sin «Exportar». «Período siguiente»: como antes.
    - El `href` de «CSV» lleva `sin-horas=1`.
    - Al recargar: lo mismo.
    - «Personas: todas» (destildar todas y «Aplicar»): la fila de E está con
      0:00; las de C, D y N, no. No se afirma nada más de la lista.
    - «Proyecto» en «Agrupar por»: la URL no lleva `sin-horas` y el enlace no
      está. «Persona» de nuevo: el enlace dice «Mostrar personas sin horas» y E
      no tiene fila.
27. **Un member no tiene la opción** (D-R9-5). Member M con P1 de 1:00; otra
    persona O, activa y sin horas. La URL de la semana anterior por «Persona»
    con `sin-horas=1` y `personas=<id de O>`: «Ves solo tus horas.»; no hay
    enlace «Mostrar personas sin horas» ni «Ocultar…»; una fila, la suya, con
    1:00; O no está. «Proyecto» en «Agrupar por» y «Persona» otra vez: la URL
    no lleva `sin-horas` ni `personas`.

Los mutantes que tienen que caer en e2e, en una copia con puerto propio: un
enlace que pierde la opción (el subnivel y la flecha del 26); la inactiva que
nadie eligió o la invitada en la lista (26, sin filtro); N en la lista (26);
una fila sin horas con botón (26); el enlace que no cambia de texto (26); un
member que ve el enlace o a O (27).

### 8.3 La regla de los e2e

La de §8.3 de R2a, con D-R4-13 y D-R9-14. El 26 afirma el orden y el total con
personas elegidas, todas del test; sin filtro, solo que una fila del test está
o no. El 27 es de alcance propio.

### 8.4 Lo que no se prueba en e2e

- **El tope de 3000 con las sin horas**: criterio 11.
- **Otro workspace**: criterios 5 y 14.
- **El borde de `joinedAt`** (igual a `span.to`): criterio 5.
- **El contenido del archivo**: criterio 15; el e2e mira solo el `href`.
- **El orden contra una persona con entradas de menos de un segundo**:
  criterio 6.

## 9. Riesgos y deuda conocida

- **Que aparezca quien no debe.** Lo mitigan una sola fuente de candidatas (el
  catálogo de R4b, que ya deja afuera a las invitadas y a otros workspaces), una
  sola función que dice quiénes son (`peopleWithoutTimeOf`, para el tope y para
  el estado) y la opción efectiva solo con `everyone`; los criterios 5, 7 y 14.
- **`membership.created_at` es hoy el primer ingreso a Clock, no la fecha de
  alta en la empresa.** Para «quién no cargó» es la correcta: antes de entrar
  no se podía cargar. Las membresías que creó la migración de R1 tienen la fecha
  de la migración; son inactivas con horas, y solo aparecerían sin horas si
  alguien las elige para un período anterior a la migración en que no tienen
  entradas: no aparecen.
- **Deuda para la fase 2: con invitaciones, `created_at` deja de ser el primer
  ingreso.** La membresía se va a crear al invitar, con `created_at` en la fecha
  de la invitación, y una invitada que entra semanas después aparecería sin
  horas en los períodos del medio. Ese slice tiene que darle a la candidata la
  fecha de activación, no la de creación (una columna nueva o la primera fila
  de auditoría de la activación), y cambiar `joinedAt` en
  `listPeople`.
- **El estado es el de hoy**: quien estaba activo en el período y se desactivó
  después no aparece sin horas salvo que se lo elija (D-R9-2). Guardar la
  historia del estado es de la fase 2.
- **Una persona con entradas de menos de un segundo** se ve en «0:00» como una
  sin horas, pero va antes y, con más de un nivel, se puede abrir (D-R9-7).
- **Con solo filas sin horas no hay gráfico ni «Exportar»** (D-R9-9): el archivo
  de «nadie cargó esta semana» no se puede bajar desde la pantalla. La ruta
  pedida a mano responde con esas filas.
- **El segundo nivel puede quedar cortado al encender la opción** (D-R9-8), con
  la línea del tope de siempre, que no nombra la opción.
- **El workspace de los e2e acumula personas activas**: el 26 sin filtro solo
  afirma filas del test. Con más de 3000 activas en una base vieja, el primer
  nivel no entraría; los e2e corren sobre base nueva.
- **Las ediciones mecánicas del paso 1** tocan muchos fixtures (`ReportGrouping`
  y `ReportReadyState`); van en un commit, con la regla de R3.
- **El foco después del enlace** queda donde lo deje el navegador, como en
  «Agrupar por»: el enlace sigue en el mismo lugar con el otro texto.
- **Lo de Clockify sin verificar** (P-05): si el semanal muestra a las inactivas
  o a quien entró después, y cómo se ve el control.

## 10. Decisiones del usuario, notas y pendientes

### Preguntas para el usuario

Ninguna bloquea: el contrato implementa la recomendación, y cambiarla es un
cambio chico en `withoutTimeCandidates` y en los criterios que se nombran.

1. **¿Las personas inactivas aparecen sin horas?** Opciones: (a) **solo si se
   las elige en «Personas»** (recomendación); (b) nunca; (c) siempre.
   Recomendación (a): una inactiva es alguien que ya no está, y en cada semana
   posterior a su salida sería una fila de más; quien la elige pregunta por
   ella. Si elige (b) o (c), cambian los criterios 5 y 7 y el recorrido 26.
2. **¿Aparece quien entró después del período?** Opciones: (a) **no**
   (recomendación), con la fecha en que se creó su membresía, que hoy es su
   primer ingreso a Clock; (b) sí, toda activa de hoy. Recomendación (a): en
   «Mes pasado», alguien que entró este mes aparecería como que no cargó. Si
   elige (b), sale `joinedAt` del catálogo, y se van los casos de N y K del
   criterio 5, el de N del 7, el criterio 13 y `setJoinedAt`.
3. **P-05, en la sesión del workspace de Clockify** (no es decisión): en el
   semanal con «Show users without time», si aparecen las inactivas, quien
   entró después de la semana, y si es una casilla o un interruptor. Mientras
   tanto vale este contrato.

### Decisiones del usuario que este contrato hereda

R9 entra (2026-10-08, mapa §5); P-01 y P-03; P-07; P-08; RP-64; ninguna
exportación va al `audit_log` (2026-10-12).

### Para el team-lead

- **R9 va primero y R7a después** (decisión del team-lead, 2026-10-12): R7 está
  rehaciendo su contrato para `pdfkit`, y así su PDF hereda «Personas sin
  horas» sin cambios (D-R9-10). R7a arranca con R9 mergeado: rebasa sobre los
  archivos de §0, escribe sus casos nuevos (los pedidos del PDF en
  `handler.integration.test.ts`) con `peopleWithoutTime`, suma el caso del PDF
  al criterio 15 de este contrato en el suyo y numera sus recorridos después
  del 27.
- **Sin ADR.** Nada de este contrato contradice un ADR aceptado ni deja una
  regla que otro slice tenga que seguir fuera del reporte.
- **CLAUDE.md no cambia.**

## 11. Fuera de alcance

- Personas sin horas debajo de otra dimensión (Proyecto → Persona) (D-R9-3).
- Proyectos, clientes, tareas, etiquetas o días sin horas: la opción es de las
  personas, como RP-47; los días sin horas siguen sin fila (sección 10.4 de
  `reportes.md`).
- La fila propia en cero para quien ve solo lo suyo (D-R9-5).
- La opción para `team_manager` (P-03, RP-06).
- La historia del estado de una membresía y la fecha de activación de una
  invitada (fase 2, §9).
- El reporte semanal (RP-45, RP-46): fase 3.
- Una marca visual propia de la fila sin horas, más allá de «0:00» y la falta de
  botón.
- «Exportar» con solo filas sin horas (D-R9-9).
