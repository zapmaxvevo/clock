# 0030. El asistente lee horas ajenas por el alcance del reporte

Fecha: 2026-10-21. Estado: **Propuesto.**
Origen: el contrato de
[`mejoras-mcp-equipo.md`](../slices/mejoras-mcp-equipo.md), mejora 5 de
[`mejoras-pedidas.md`](../mejoras-pedidas.md). Acota D-MCP-11, la última viñeta
de D-MCP-3 y la línea «cualquier dato de otra persona» de §12 de
[`mejoras-mcp.md`](../slices/mejoras-mcp.md). No cambia ninguna decisión del
[ADR 0026](0026-el-servidor-mcp-autoriza-con-oauth-de-better-auth-y-atiende-sin-estado.md)
y se apoya en el [ADR 0020](0020-nucleo-de-reportes-antes-de-la-fase-2.md).

## Contexto

El servidor MCP está en producción con ocho herramientas, todas sobre lo propio:
ninguna recibe `userId`, y `list_entries` y `get_context` leen solo las filas de
la persona del token (D-MCP-11). El usuario lo probó y pidió el 2026-10-21 que
un owner o un admin puedan consultar desde el asistente las horas de las demás
personas del workspace, como ya lo hacen en la aplicación. Solo ver: editar,
crear o parar horas ajenas sigue fuera.

Lo que ya está fijado:

- **Quién ve horas ajenas** es una sola acción, `timeEntry.others.view`, de
  owner y admin (P-01, P-02 de `reportes.md`); `project_manager` y
  `team_manager` deciden como `member`. El ADR 0020 la consulta en un único
  lugar, `scopeOf` del service de `report`, que arma un `ReportScope` nominal;
  **toda función del repository de `report` lo recibe**, y toda puerta de
  entrada —la página y las exportaciones— pasa por ese service. El comentario
  de `can()` lo dice: «Las entradas ajenas son del reporte detallado».
- **Las lecturas de `time-entry` filtran por `actor.userId`** y no conocen el
  alcance. `listClosedStartingIn(workspaceId, userId, …)` acepta cualquier
  persona: su aislamiento es que quien llama pase la del actor.
- **El reporte ignora en silencio** un id de persona, de proyecto o de cliente
  que no está en su catálogo (D-R4-5): la URL armada a mano no rompe la
  página. Con el filtro de personas vacío, el alcance `everyone` lee a todo el
  equipo.
- **El token da lo mismo que una sesión** (ADR 0026, decisión 4): las
  herramientas son un subconjunto de lo que la pantalla deja hacer, por el
  mismo `can()` y los mismos services.
- **El alcance OAuth es uno**, `clock`, y la pantalla de consentimiento dice
  «ver, cargar, editar y borrar tus horas, y leer tus proyectos, tareas y
  etiquetas». Un alcance de solo lectura y el consentimiento con elección
  quedaron fuera (D-MCP-2, §12).

Hay que decidir por dónde lee el asistente las horas ajenas, cómo se protege de
un id que no corresponde, y si una autorización existente alcanza.

## Opciones

### Por dónde se leen las horas ajenas

1. **Un filtro `userId` en `list_entries`**, resuelto en `time-entry`: la
   operación consulta `timeEntry.others.view` y llama a `listClosedStartingIn`
   con la persona pedida. Una herramienta conocida y la forma de entrada de
   siempre. Abre un segundo lugar que decide quién lee horas ajenas, fuera del
   `ReportScope`, en un repository que no lo exige; y la salida trae ids de
   entradas y el timer que corre, que la aplicación no muestra de otra persona
   (P-07).
2. **Herramientas nuevas sobre el service de `report`**: el resumido de la
   página, con sus niveles, sus filtros y su alcance, y el catálogo de personas
   que ofrece el filtro. Ninguna lectura nueva de la base: el mismo `scopeOf`,
   el mismo `narrowedTo` y las mismas funciones del repository. El detalle por
   entrada (inicio y fin de cada una) no entra, como no entra en la página
   (RP-50 es de la fase 3); por descripción y por día sí.
3. **Las dos**: la 2 y, para el detalle, un listado de entradas ajenas por el
   `ReportScope` (`entryList`, que ya usa la exportación).

### Qué pasa con un id que no corresponde

1. **Lo mismo que la página**: se ignora. Para un modelo es peligroso: pide las
   horas de una persona de otro workspace, o un id mal copiado, y recibe las de
   todo el equipo sin aviso.
2. **Se rechaza**: en el modo del asistente, cada id de persona, proyecto o
   cliente tiene que estar en el catálogo de la misma foto, o la herramienta
   responde `not_found`; una persona ajena pedida por quien no tiene
   `timeEntry.others.view` responde `forbidden`.

### El alcance OAuth

1. **El mismo `clock`**, con la pantalla de consentimiento diciendo, a quien
   tiene `timeEntry.others.view`, que el asistente también va a ver las horas
   del equipo. Las autorizaciones existentes siguen sirviendo.
2. **Un alcance nuevo** (`clock.team`), pedido por el 401 y exigido por las
   herramientas nuevas. Cada owner y admin vuelve a autorizar; un alcance por
   herramienta es la granularidad que D-MCP-2 dejó fuera.

### Quién ve las herramientas nuevas

1. **Todas las personas**, como la página de reportes: `report.view` es de
   todos, y sin `timeEntry.others.view` el resumido es de lo propio.
2. **Solo quien tiene el permiso**, registrándolas por rol en cada pedido. Un
   cliente guarda la lista de herramientas: un cambio de rol deja herramientas
   que responden «no existe» o que no aparecen hasta reconectar.

## Decisión

1. **Las horas ajenas se leen solo por el service de `report`** (opción 2 de la
   primera lista). Dos herramientas nuevas, `list_people` y `summarize_hours`,
   sobre dos funciones nuevas del service de `report` que usan `scopeOf`,
   `narrowedTo` y el repository de siempre. `list_entries` no cambia y sigue
   leyendo solo lo propio. **La regla del ADR 0020 se mantiene: ninguna lectura
   de horas ajenas existe fuera del `ReportScope`.** Ninguna herramienta recibe
   `workspaceId`; `userIds` llega solo a `summarize_hours` y solo como filtro de
   un alcance que el servidor ya armó.
2. **Sin permiso nuevo**: `report.view` para entrar y `timeEntry.others.view`
   para ver a los demás, consultados donde ya se consultan.
3. **En el modo del asistente, los filtros son estrictos** (opción 2 de la
   segunda lista): un id que no está en su catálogo responde `not_found`, en la
   misma foto que la lectura; una persona ajena sin `timeEntry.others.view`,
   `forbidden`. La página y las exportaciones siguen ignorando lo que no está.
4. **El mismo alcance `clock`** (opción 1 de la tercera lista). La pantalla de
   consentimiento suma una oración para quien tiene `timeEntry.others.view`.
5. **Las herramientas se registran para todos** (opción 1 de la cuarta lista):
   la respuesta depende del permiso en cada pedido, como la página.
6. **Una lectura no deja constancia**, como hoy en la aplicación y en el MCP
   (D-MCP-12).

## Consecuencias

- **D-MCP-11 queda acotada**: «Ninguna herramienta recibe `userId`» pasa a ser
  «ninguna recibe `workspaceId`, y solo `summarize_hours` recibe ids de
  persona, como filtro del `ReportScope`». La última viñeta de D-MCP-3 y la
  línea de §12 de `mejoras-mcp.md` se leen con esta excepción. La revisión de
  seguridad de cada herramienta nueva sobre datos ajenos verifica que pase por
  el `ReportScope`, como pide el ADR 0020 para cada puerta de entrada.
- **El service de `report` suma un modo**: filtros estrictos y un tope de filas
  propio (500, contra 3000 de la página), que la página y las exportaciones no
  usan. Sus tests no cambian.
- **`WorkspacePerson` suma el correo**, que el catálogo del asistente muestra
  (nulo si se liberó, como en `/equipo`); la pantalla del reporte no lo recibe,
  porque `toPersonOptions` copia campo por campo.
- **El asistente de un owner o un admin autorizado antes de este cambio** ve las
  horas del equipo sin haber leído la oración nueva del consentimiento. Es lo
  que esa persona ya ve en la aplicación; el usuario lo confirma (pregunta
  abierta del contrato).
- **Sin el detalle por entrada de otra persona**: el resumido por persona, día
  y descripción cubre «qué hizo»; las horas de inicio y fin de cada entrada
  ajena son una herramienta más por el mismo `ReportScope` (opción 3), si el
  usuario la pide.
- **Si `who_sees_all_entries` se vuelve editable** (ADR 0020), cambia
  `timeEntry.others.view` y con él las dos herramientas, sin tocarlas.

### Por qué no la opción 1

Es la más cómoda para el modelo y la más corta de escribir, pero es justamente
lo que el ADR 0020 evita: un segundo lugar que decide quién lee horas ajenas,
sobre un repository que acepta cualquier persona. Además devuelve el timer que
corre de otra persona, que la aplicación no muestra (P-07), e ids de entradas
que invitan a editar lo que no se puede.

### Por qué no un alcance nuevo

Obliga a cada owner y admin a reconectar por una lectura que ya tienen en la
aplicación, y abre la granularidad por herramienta que D-MCP-2 descartó. El
token sigue sin dar más que una sesión, con o sin alcance nuevo.
