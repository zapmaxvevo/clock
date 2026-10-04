# 0012. Un solo juego de formatos, en el servidor y en el cliente

Fecha: 2026-10-03. Estado: propuesto.
Origen: el contrato del slice 7
([`fase1-slice7-perfil.md`](../slices/fase1-slice7-perfil.md)), que trae la
zona horaria y los formatos de fecha y de hora por persona (P-13 del
rastreador, PF-11 a PF-14 de `docs/parity/perfil.md`).
Revisado en la ronda 1 de ese contrato
([`correcciones-fase1-slice7.md`](../slices/correcciones-fase1-slice7.md)).

## Contexto

El slice 1 fijó que todo lo que depende de la zona horaria o del formato se
resuelve en el servidor y viaja ya formateado: `startLabel`, `endLabel`,
`durationLabel` y `dayDate` en `TimeEntryView`, y el `label` de los grupos de
día y de semana. Con un solo formato fijo —24 h, `dd/MM`, `h:mm`— la regla
alcanzaba.

En la práctica el cliente ya formatea en varios lugares, porque arma valores
que el servidor nunca vio:

- el total de un grupo con el transcurrido del timer, que sube cada segundo
  (`use-group-total.ts`);
- el trío de una fila mientras se edita o mientras su escritura viaja
  (`entry-row.tsx`);
- los campos de hora, que muestran e interpretan lo que se teclea
  (`manual-bar.tsx`, `entry-times-editor.tsx`, `running-start-editor.tsx`);
- el rótulo del selector de fecha (`date-field.tsx`).

Todos llaman a funciones puras de `src/server/time` con el formato fijo
adentro. Con el perfil, la hora puede ser de 12 h y la fecha tiene cuatro
formas. Si los rótulos del servidor siguen la preferencia y los del cliente no,
la misma fila muestra `1:05 PM` en reposo y `13:05` al editarla.

Hay una segunda trampa: `startLabel` hoy es a la vez rótulo y valor canónico.
El cliente arma el trío de la edición con él (`fromView`), y la action exige
`HH:mm` de 24 h (ADR 0005). Si el rótulo pasa a `1:05 PM`, el trío viaja mal.

Y los slices 8 y 13 —calendario y timesheet— van a formatear en el cliente
tanto o más que el rastreador.

## Opciones

1. **Todo en el servidor.** El cliente recibe cada texto armado. No sirve para
   lo que el cliente calcula en vivo —el total que sube con el contador, un
   borrador que se teclea—, salvo con una ida y vuelta por cada cambio.
2. **Todo en el cliente.** El servidor manda solo valores canónicos y las
   preferencias, y el cliente formatea todo. Rehace todas las vistas y sus
   tests, y las vistas dejan de leerse en un test de integración como lo que
   ve la persona.
3. **Lo que depende de la zona, en el servidor; lo que depende del formato, con
   las mismas funciones puras en los dos lados.** El servidor sigue resolviendo
   el día y la hora canónica de cada instante, y sigue mandando los rótulos que
   ya manda, armados con los formatos de quien mira. El cliente formatea lo que
   arma él con las mismas funciones y los mismos formatos.

Para la opción 3, cómo llegan los formatos al cliente:

- **a. Por props, dentro del estado de cada pantalla.** Cada pantalla los
  repite en su estado y los baja por cada componente hasta el campo que los
  usa.
- **b. Por un contexto de React**, con los formatos que se leen de la sesión.

## Decisión

La opción 3, con los formatos por contexto (b).

- **La zona es del servidor.** De un instante, el servidor resuelve su día y su
  hora canónica (`dayKey`, `formatClock`). El cliente no convierte instantes;
  el único uso de la zona en el cliente sigue siendo el borrador inicial de la
  barra, con la zona que trae el estado del rastreador.
- **El formato es una función pura de `src/server/time`** que recibe un valor
  canónico y el formato: `clockLabel`, `formatDayKey`, `dayKeyLabel`,
  `weekKeyLabel`, y el intérprete `parseClockInput`. Es la única
  implementación de cada formato y la llaman las dos puntas.
- **Toda vista que lleve un rótulo que el cliente pueda tener que rehacer
  lleva también el valor canónico.** `TimeEntryView` suma `startClock` y
  `endClock`; el trío se arma con ellos, nunca con los rótulos.
- **Las preferencias se leen en un solo lugar de cada lado.** En el servidor,
  `timeSettingsOf` de `src/modules/profile/service.ts`, que junta la zona y los
  formatos de la persona con el primer día de la semana de `weekStartOf`. En el
  cliente, `useDisplayFormats`, que lee el `DisplayFormatsProvider` más
  cercano.
- **Dos niveles de proveedor, los dos alimentados por `timeSettingsOf`:**
  - **el del layout del shell** (`src/app/(app)/layout.tsx`), que es la base;
  - **el de cada pantalla que muestra horas o fechas**, con los formatos de su
    propia lectura. El rastreador lo monta en `tracker-screen.tsx` con los
    formatos que ya trae su `TrackerWorkspace`. Gana el más cercano.

  El segundo nivel existe porque Next 16 conserva los layouts compartidos en
  una navegación del cliente: después de cambiar una preferencia, el layout
  puede seguir con los formatos viejos mientras la página llega fresca.

- **El hook lanza fuera del proveedor.** Un valor por omisión escondería que
  falta.
- **Un cambio de preferencia revalida el layout raíz** (PF-33), y cada pantalla
  que muestra horas trae los formatos nuevos en su propia lectura.

## Consecuencias

- **La misma fila dice lo mismo en reposo y en edición**, porque los dos textos
  salen de la misma función con los mismos formatos, y esos formatos son los
  de la misma lectura de la pantalla: el servidor rotula con los de su
  `TrackerWorkspace` y el cliente formatea con el proveedor que la pantalla
  monta con esos mismos formatos. **El proveedor del layout no da esa
  garantía por sí solo**: en una navegación del cliente puede quedar con los
  formatos anteriores a un cambio. Por eso no alcanza con montarlo una vez en
  el shell.
- **El payload de las actions no cambia.** La hora sigue viajando como `HH:mm`
  de 24 h aunque la persona vea 12 h: el cliente interpreta lo tecleado con
  `parseClockInput(texto, formato)` y manda la forma canónica. El ADR 0005 se
  mantiene entero, y el ADR 0006 sigue comparando horas canónicas.
- **`src/server/time` tiene que seguir siendo importable desde el navegador.**
  Las funciones de formato y el intérprete corren en el cliente, así que el
  módulo se mantiene puro: sin `server-only`, sin `db` y sin `env`, y sin
  importar nada que los arrastre. Lo que necesite el servidor y no el cliente
  va en otro módulo. El nombre del directorio dice dónde nació, no dónde corre.
- **Calendario y timesheet no eligen**: su service recibe un `TimeSettings` de
  `timeSettingsOf`, su pantalla monta el proveedor con esos formatos, y sus
  componentes leen `useDisplayFormats`. Ninguna pantalla nueva lee
  `context.preferences`, `membership.weekStart` ni `workspace.timezone` para
  mostrar algo.
- **Un formato nuevo es local.** El formato de duración, cuando sea un ajuste
  del workspace, se suma a `DisplayFormats` y se resuelve en `timeSettingsOf`;
  los consumidores ya reciben el objeto.
- **Un componente que formatea necesita el proveedor.** Los tests de
  componente lo montan; olvidarlo lanza en vez de mostrar un formato
  equivocado.
- **La regla del slice 1 queda reformulada**, no derogada: lo que depende de la
  zona se resuelve en el servidor; lo que depende del formato se resuelve donde
  se arma el valor, con una sola implementación. El comentario de
  `timeEntryView` en `src/modules/time-entry/schema.ts` pasa a decir eso.
- **El precio** es un valor canónico al lado de cada rótulo que el cliente
  pueda rehacer, un proveedor más en cada pantalla que muestra horas, y una
  prop más en los campos de hora para el teclado de 12 h.
- **Por qué no por props**: los formatos tendrían que viajar en el estado de
  cada pantalla y atravesar cada componente intermedio hasta el campo, y cada
  pantalla nueva repetiría el cableado. Con el contexto, cada pantalla monta un
  proveedor una vez, en su raíz, con lo que ya leyó, y el layout cubre lo que
  no pertenece a ninguna.
