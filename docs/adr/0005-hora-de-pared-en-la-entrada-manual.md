# 0005. La hora de pared viaja como hora de pared

Fecha: 2026-10-02. Estado: aceptado.
Correcciones aplicadas: ronda 1 de `architecture-reviewer`
(`../slices/correcciones-fase1-slice2.md`), hallazgos B-1, B-2, M-10 y M-11,
más la decisión P-10 del equipo.

## Contexto

El slice 1 fijó que los instantes de una entrada los escribe la base con `now()`
dentro de la transacción: el cliente no manda ningún instante y el desfase de
reloj de TT-32 nunca entra al modelo.

Desde el slice 2 eso deja de alcanzar. El modo manual (TT-18), la edición en
línea de horas y fecha (TT-54, TT-56), la corrección del inicio de un timer
activo (TT-28) y, más adelante, las celdas del timesheet y el arrastre del
calendario escriben instantes que no son «ahora»: los elige una persona
tecleando una hora de reloj y un día de calendario. Hay que decidir quién
convierte esa hora local en el `timestamptz` que guarda la base.

Las reglas que ya existen y que la decisión no puede romper:

- La zona horaria que resuelve días y horas sale del workspace, no del navegador
  (TT-02, P-13), y pasa a salir del perfil cuando el perfil exista.
- Fechas, zonas horarias y duraciones solo a través de `src/server/time`.
- TT-72: un fin anterior al inicio significa el día siguiente, que es una regla
  sobre horas de pared y no sobre instantes.
- TT-81 y el `check time_entry_end_after_start`: no existe una entrada cuyo fin
  sea anterior a su inicio. La conversión tiene que conservar el orden de los
  dos extremos.
- P-10: **las fechas futuras se aceptan.** El equipo verificó que Clockify
  agrega la entrada esté la fecha en el pasado o en el futuro, así que el
  rechazo que se había propuesto era una divergencia nuestra. El futuro no está
  acotado y la conversión no tiene que decidir nada sobre él.

## Opciones

1. **El cliente manda instantes ISO en UTC.** El navegador combina el día, la
   hora y la zona horaria del workspace y manda `2026-10-02T11:00:00.000Z`.
2. **El cliente manda hora de pared.** `date: "2026-10-02"`, `start: "08:00"`,
   `end: "10:30"` como cadenas canónicas, y el servidor construye los dos
   instantes con la zona horaria que corresponda.
3. **El cliente manda hora de pared más su desplazamiento.**
   `2026-10-02T08:00:00-03:00`, calculado por el navegador.

## Decisión

La opción 2.

La action recibe el día local y las dos horas de pared en formato canónico
(`yyyy-MM-dd` y `HH:mm` en 24 h). El service las convierte con la zona horaria
del workspace usando una función nueva de `src/server/time`:

```ts
instantFromLocal(dayKey: string, clock: string, timeZone: string): Date | null;
```

El instante se construye con el **constructor de componentes** de `TZDate`, no
con una cadena:

```ts
new TZDate(year, month - 1, day, hour, minute, 0, 0, timeZone);
```

Pasarle una cadena como `"2026-10-02T08:00"` la interpretaría en la zona del
proceso antes de reubicarla, que es un error que no se nota en un servidor en
UTC y sí en una máquina de desarrollo. La función devuelve un `Date` plano
—`new Date(instant.getTime())`— como ya hacen `dayBounds` y `startOfLocalDay`:
un `TZDate` que se escapa del módulo arrastra su zona a cualquier operación que
alguien le haga después.

Los formatos tolerantes que la persona teclea —`0345`, `9.45`, `2,75`,
`1h30m`— se normalizan en el cliente con los intérpretes de `src/server/time`
antes de llamar a la action. La action revalida la forma canónica y rechaza
cualquier otra cosa como error de validación: no hay dos lugares que
interpreten texto libre.

### Horas de pared que no existen y horas que existen dos veces

En un cambio de horario hay una hora local que no ocurre y otra que ocurre dos
veces. Los dos casos tienen regla explícita, y las dos están comprobadas
ejecutando la librería, no deducidas del texto de su documentación.

**La hora ambigua se acepta y se resuelve con el segundo instante**, el del
desplazamiento posterior al cambio:

```
Madrid, 2026-10-25 02:30     → 2026-10-25T01:30:00.000Z
New York, 2026-11-01 01:30   → 2026-11-01T06:30:00.000Z
```

El 25 de octubre de 2026 Madrid pasa de +02:00 a +01:00 a las 03:00 locales, así
que las 02:30 ocurren dos veces: a las 00:30Z y a las 01:30Z, y se toma la
segunda. Cualquiera de las dos sería defendible, porque nadie puede
distinguirlas desde la interfaz; lo que importa es que la regla sea una sola.

`instantFromLocal` no delega esta decisión en el constructor de `TZDate`. Una
primera versión lo hacía, apoyada en una comprobación hecha solo con Madrid, y
la revisión de backend del slice 2 mostró que el constructor aplica el
desplazamiento vigente en «la hora de pared leída como UTC»: con el proceso en
UTC toma el primer instante en las zonas al oeste de Greenwich, y su resultado
cambia con `process.env.TZ`. La función prueba los desplazamientos candidatos
de la zona, se queda con los instantes cuya hora de pared coincide con la
pedida y devuelve el más tardío, o `null` si no hay ninguno. No depende de la
zona del proceso, y `time.test.ts` lo comprueba con el proceso en otra zona.

**La hora inexistente se rechaza**: `instantFromLocal` devuelve `null` y el
service lo traduce a un error de validación con «Esa hora no existe por el
cambio de horario.» No se desplaza hacia adelante, que era la regla anterior de
este ADR, porque desplazar rompe el orden de los dos extremos:

```
Madrid, 2026-03-29, el reloj salta de 02:00 a 03:00.
inicio 02:30 → desplazado a 2026-03-29T01:30:00.000Z
fin    03:00 →                 2026-03-29T01:00:00.000Z
```

El fin queda antes que el inicio y la fila la rechaza el `check` de la base, con
un error que la persona lee como «No se pudo guardar. Revisá la conexión.»
—que es falso y no le dice qué corregir—. El par 02:00 a 03:00 es peor todavía:
los dos extremos se desplazan al mismo instante y la entrada se guarda con
duración cero, habiendo pasado todas las validaciones de hora de pared.

Rechazar conserva el orden de los extremos sin excepciones, es honesto con lo
que la persona tecleó —esa hora no existió— y le da significado al `null`, que
con la regla anterior era una rama inalcanzable.

### Qué puede falsear un cliente

Un cliente que no sea la interfaz puede mandar cualquier par de horas y
cualquier día. No puede elegir nada más: el workspace, el usuario y la zona
horaria salen de la sesión, y el instante final lo construye el servidor. Lo
que queda abierto es el rango de días, y con P-10 el futuro ya no tiene tope.

El piso sí lo tiene: **se rechaza una fecha anterior al día de creación del
workspace**, con «No se pueden cargar horas anteriores a la creación del
workspace.» Es un dato que el service recibe de la sesión, no una consulta
nueva, y acota el daño de un payload inventado —una fecha del año 1800— sin
tocar ningún caso de uso real. El futuro queda sin tope por decisión de producto
(P-10), no por descuido.

## Consecuencias

- Toda la aritmética de zonas horarias queda del lado del servidor y dentro de
  `src/server/time`. El cliente no necesita datos de husos ni saber en qué zona
  está el workspace.
- Dos personas en husos distintos que tecleen `08:00` para el mismo día obtienen
  el mismo instante, que es el que corresponde a la zona del workspace. Con la
  opción 1 obtendrían dos instantes distintos según dónde esté el navegador, en
  contra de TT-02.
- Cuando exista el perfil (P-13) solo cambia qué zona horaria recibe
  `instantFromLocal`. El contrato del payload no cambia, y ningún cliente tiene
  que enterarse.
- Hay un caso en que la persona teclea algo válido a la vista y el servidor lo
  rechaza: la hora que no existe. Es el precio de conservar el orden de los
  extremos, y el mensaje nombra la causa real.
- TT-97 se vuelve visible: en un día con cambio de horario, la duración guardada
  es la real y puede no coincidir con la resta de las dos horas tecleadas. Lo
  que se respeta son las horas de pared, porque son lo que la persona escribió;
  la duración es derivada y nunca se almacena.
- El payload es legible en un log y en un test: `{"date":"2026-10-02",
"start":"08:00","end":"10:30"}` dice qué pidió la persona, cosa que un
  instante UTC ya convertido no dice.
- Los tres casos de Madrid —la ambigua, las dos inexistentes y el 03:00 que sí
  existe— son casos de `time.test.ts` con su valor UTC esperado escrito. Se
  prueban contra un número, no contra una frase de este documento.
  `America/Argentina/Buenos_Aires` no tiene cambio de horario y no sirve para
  probarlos.
- La excepción a «los instantes los pone la base» queda acotada y nombrada: las
  escrituras que nacen de un `now()` siguen usando `now()`, y solo las que nacen
  de una hora tecleada usan `instantFromLocal`. No hay un tercer camino.
- La opción 3 queda descartada porque mezcla lo peor de las dos: el cliente
  igual necesita resolver el desplazamiento, y el servidor igual tiene que
  decidir qué hacer cuando el desplazamiento que llega no es el que corresponde
  a esa fecha en esa zona.
- Al editar una entrada que ya existe, el extremo cuya hora de pared no cambió
  conserva su instante en vez de recalcularse: es el
  [ADR 0006](0006-conservar-el-extremo-sin-cambios.md).
