# 0029. El formato de duración es del workspace y solo cambia lo que se muestra

Fecha: 2026-10-20. Estado: Propuesto.
Origen: el contrato de WS2a
([`fase2-ws2a-formato.md`](../slices/fase2-ws2a-formato.md)), con el
[mapa de la fase 2](../slices/fase2-mapa.md) («WS2a», §4),
[`workspace.md`](../parity/workspace.md) (WS-14 … WS-17, WS-66 … WS-68, P-07)
y [`perfil.md`](../parity/perfil.md) (PF-20 … PF-22, §10). Extiende el
[ADR 0012](0012-un-solo-juego-de-formatos.md).

## Contexto

El [ADR 0012](0012-un-solo-juego-de-formatos.md) fijó un solo juego de formatos
para el servidor y el navegador: `DisplayFormats`, resuelto en un único lugar
del servidor (`timeSettingsOf`, `src/modules/profile/service.ts:137-146`) y leído
en el navegador con `useDisplayFormats`, con un proveedor en el shell y otro en
cada pantalla que muestra horas. Hasta acá los dos formatos son **de la
persona**: la hora y la fecha salen de `user_preference`. Ese ADR anticipó el
caso: «El formato de duración, cuando sea un ajuste del workspace, se suma a
`DisplayFormats` y se resuelve en `timeSettingsOf`».

El formato de duración es **del workspace** (WS-14, PF-02): lo eligen owner y
admin, y todas las personas lo ven igual. Tiene dos valores en Clock
—compacto `h:mm`, el de hoy, y completo `hh:mm:ss` (WS-15, PF-20)—; el decimal
es de plan pago y queda fuera. El workspace de producción pasa al completo con
WS2b (workspace P-07).

Hoy la duración se formatea con `formatDuration(minutes)`
(`src/server/time/index.ts:63-69`), que fija `h:mm` y recibe minutos. Lo que
hacen sus llamadores ya es una regla, aunque no esté escrita:

- **Cada fila** muestra los segundos exactos de la entrada truncados al minuto
  (`time-entry/service.ts:216`).
- **Cada total** suma los segundos exactos y trunca una sola vez: el del día y
  el de la semana del rastreador (`use-group-total.ts:20-40`, que lo dice en su
  comentario), los de la planilla (`timesheet-model.ts:111-118`, D13-3), los del
  calendario y el reporte, que agrega `entrySeconds` en la base
  (`report/repository.ts`, [ADR 0021](0021-el-reporte-agrega-en-la-base.md)).

Con el compacto, entonces, dos entradas del timer de 1 minuto 40 segundos se
muestran `0:01` cada una y suman `0:03`. Clockify documenta que con el compacto
«Time calculations use compact rounded durations across all modules» y con el
completo «Time calculations use the exact, full duration of tracked time across
all modules», sin decir cuál es el redondeo del compacto (WS-16). La
verificación contra el workspace real es el punto 7 de workspace P-09 y no está
hecha. WS-16 pide que el contrato fije una regla y la escriba; WS-68 pide que la
fila, el total del día y el reporte no muestren totales que no cierran entre sí
**sin una regla escrita**.

Hay una segunda pregunta, que el 0012 no tenía: **dónde vive el dato y cómo
llega**. Las preferencias de la persona se leen una vez por pedido en
`readSession` (`src/server/session.ts:50-81`); el workspace y la membresía, en
`ensureWorkspaceContext` (`workspace/service.ts:165-175`), con
`findFirstWorkspace` (`workspace/repository.ts:65-74`). La fila de
`workspace_settings` nace con el workspace (`repository.ts:89-96`) y hoy nadie
la lee en un pedido.

## Opciones

Sobre la regla del compacto:

1. **El formato solo cambia lo que se muestra.** Las sumas son siempre de
   segundos exactos; cada rótulo trunca una vez, en la unidad de su formato: el
   minuto en compacto, el segundo en completo. Es la regla de hoy, escrita.
2. **El compacto redondea cada entrada antes de sumar.** Cada fila se lleva al
   minuto y los totales suman los minutos de las filas, así que la fila y el
   total siempre cierran. El reporte, que agrega en la base, tendría que
   redondear por entrada en SQL según el formato; la planilla, cuyas reglas de
   escritura comparan minutos de la suma exacta
   ([ADR 0018](0018-lo-que-escribe-una-celda-se-calcula-en-instantes.md),
   `cellMinutes`), dejaría de coincidir con lo que muestra; y cambiar el formato
   cambiaría los totales y la columna «Horas» de las exportaciones.
3. **El compacto no guarda segundos.** Como `trackTimeDownToSecond` en falso de
   la API de Clockify: el timer y toda escritura truncan al minuto. Cambia datos
   según un ajuste de presentación, es irreversible —volver al completo no
   devuelve los segundos— y cambia el instante que guarda el timer.

Sobre dónde vive y cómo llega:

- **a. Una columna de `workspace_settings`, leída con el workspace en la misma
  consulta de cada pedido**, que viaja en el `WorkspaceContext` y entra a
  `DisplayFormats` en `timeSettingsOf`.
- **b. Una consulta propia en `readSession`**, en paralelo con las otras dos.
  Un viaje más a la base por pedido, para una fila que se lee junto con el
  workspace.
- **c. En `user_preference`**, copiada a cada persona. Contradice WS-14: el
  dato es uno y lo cambia un admin para todos.

## Decisión

**La opción 1, con la a.**

1. **El formato es una columna de `workspace_settings`**, `duration_format`, de
   texto con un `check` de los valores conocidos —`compact` y `full`—, `not
null` y con `compact` por omisión (WS-15), como las columnas de formato de
   `user_preference` (`src/server/db/schema.ts:153-160`). Un valor nuevo, como
   el decimal, es un `check` nuevo y no un tipo de Postgres que recrear.
2. **Se lee en cada pedido con el workspace, en la misma consulta**:
   `findFirstWorkspace` suma un `left join` a `workspace_settings`. El
   `WorkspaceContext` lleva `settings: { durationFormat }`, resuelto en un único
   lugar del módulo `workspace`: una fila que falta da el valor por omisión, sin
   crearla ni escribir nada; un valor fuera de la lista lanza, porque el `check`
   lo impide. El arranque arma el mismo dato con lo que devuelve el alta de la
   fila.
3. **`DisplayFormats` suma `duration`**, y `timeSettingsOf` lo toma de
   `context.settings`, no de las preferencias. Sigue siendo la única lectura
   para mostrar: ninguna pantalla lee `context.settings` ni la columna directo.
   Los proveedores del 0012 no cambian: cada pantalla monta el suyo con los
   formatos de su propia lectura, que ya traen la duración.
4. **Una sola función formatea una duración**, `formatDuration(seconds,
format)` de `src/server/time`, en el servidor y en el navegador. Recibe
   segundos y el formato, los dos obligatorios: compacto `h:mm` con los
   segundos truncados, que da para todo valor lo mismo que la función de hoy;
   completo `hh:mm:ss`, con las horas en dos cifras como mínimo.
5. **La regla del compacto** (WS-16, WS-68): toda suma es de segundos exactos y
   cada rótulo trunca una sola vez. Una fila muestra sus segundos truncados; un
   total muestra la suma exacta truncada, y no la suma de las filas truncadas.
   Con el compacto, el total puede pasar la suma de lo que muestran sus filas en
   menos de un minuto por fila. Con el completo no hay diferencia: cada rótulo
   muestra el segundo, y el total es la suma de las filas.
6. **Lo que se teclea no depende del formato** (PF-21, WS-67). El intérprete de
   duraciones acepta lo mismo con los dos, también la forma `h:mm:ss` que muestra
   el completo, porque lo que un campo muestra lo tiene que aceptar. Los campos
   de duración escriben minutos enteros, así que los segundos tecleados se
   truncan, como ya hace `1h30m1s` (TT-19).
7. **El contador del timer corriendo queda afuera**: sigue en `h:mm:ss` con
   `formatElapsed` (PF-22, WS-66). No es una duración que se suma sino un
   transcurrido, y el formato no lo toca.
8. **Ninguna escritura depende del formato.** Lo que guarda el timer, lo que
   escribe una celda de la planilla y lo que agrega el reporte son los mismos
   con los dos valores.

Se descartan la 2, porque mueve la regla a la base del reporte y a la
planilla, y hace que un ajuste de presentación cambie totales y «Horas»; la 3,
porque cambia datos según un ajuste y no se puede deshacer; la b, por el viaje
de más; y la c, por WS-14.

## Consecuencias

- **Cambiar el formato no cambia ningún número.** Los totales, la columna
  «Horas» (decimal siempre, D-R6-9) y lo que agrega el reporte son los mismos;
  cambia cuánto detalle muestra cada rótulo. Producción, que pasa al completo
  con WS2b (P-07), ve filas y totales que cierran al segundo.
- **Con el compacto, una fila y su total pueden no cerrar**, y es la regla
  escrita: dos entradas de `0:01` pueden sumar `0:03`. Queda en WS-16 y WS-68 de
  `workspace.md`. Si la verificación de workspace P-09 muestra que Clockify
  redondea cada entrada en el compacto, cambiarlo es la opción 2 y un ADR nuevo.
- **`DisplayFormats` mezcla dos dueños**: la hora y la fecha son de la persona;
  la duración, del workspace. El comentario del tipo lo dice, y
  `timeSettingsOf` sigue siendo el único lugar que los junta.
- **El `WorkspaceContext` crece con un ajuste que se muestra**, no con uno que
  decide acceso: el
  [ADR 0009](0009-la-configuracion-del-workspace-viaja-en-el-recurso.md) no
  cambia, y un ajuste que entre en `can()` sigue viajando en el recurso de su
  acción.
- **Una fila de ajustes que falta no rompe la sesión**: se ve el compacto. Lo
  que WS-73 describe —el error inesperado de la pantalla de configuración, sin
  crear la fila— es de esa pantalla (WS2b).
- **La firma de `formatDuration` cambia de unidad**, de minutos a segundos. Por
  eso el formato es obligatorio: todo llamador deja de compilar hasta que se lo
  revisa, y los tests de cada uno usan un valor con segundos, así un llamador
  que siga pasando minutos falla.
- **Un rótulo armado en el navegador con minutos enteros** —el borrador de una
  fila o del diálogo mientras se edita el trío, el bloque que se arrastra—
  muestra `hh:mm:00` con el completo hasta que llega la respuesta, que trae los
  segundos de la entrada si el [ADR 0006](0006-conservar-el-extremo-sin-cambios.md)
  conservó un extremo. Es lo que ya pasa con el compacto cuando el extremo
  conservado tiene segundos (TT-97).
- **Un formato nuevo sigue siendo local**: el decimal sería un valor más del
  `check`, una rama de `formatDuration` y, por PF-21, otro intérprete de lo que
  se teclea.
