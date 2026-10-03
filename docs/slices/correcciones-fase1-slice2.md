# Correcciones al contrato del slice 2 — ronda 1

Salida de `architecture-reviewer` sobre `fase1-slice2-modo-manual.md` y el ADR
0005: tres bloqueantes, cuatro mayores, siete menores. Abajo va cada uno con la
resolución ya decidida. `architect` las aplica; no hace falta volver a
discutirlas.

Antes que nada, una decisión del equipo que cambia parte del contrato y que no
salió de la revisión.

## P-10 — se aceptan las fechas futuras

`parity-analyst` verificó en la documentación de Clockify que el modo manual
agrega la entrada «whether the date is in the past or the future». Rechazar el
futuro no era paridad: era una divergencia nuestra colada como si lo fuera. Se
revierte y seguimos la paridad.

Consecuencias sobre el contrato:

- **Desaparece toda la validación de futuro**: el paso 6 del service, los
  códigos `futureDate` y `futureTime`, y el criterio 10. TT-76 y TT-99 pasan a
  `replicar`.
- **M-4 y M-12 se disuelven**: el caso de madrugada sin rama y la
  contradicción del criterio 8 con el 10 existían solo por esa validación.
- Lo que **no** cambia: TT-81 y el `check time_entry_end_after_start` siguen
  valiendo. Aceptar una fecha futura no habilita un fin anterior al inicio.
- El ADR 0005 pierde la premisa de que el futuro está acotado, lo que hace más
  necesaria la resolución de M-11.

## Bloqueantes

### B-1. El ADR enuncia la regla de ambigüedad al revés

`TZDate` toma el **segundo** instante, el del desplazamiento posterior al
cambio, no el primero. Está comprobado ejecutando la librería:
`new TZDate(2026, 9, 25, 2, 30, 0, 0, "Europe/Madrid")` da
`2026-10-25T01:30:00.000Z`.

**Resolución.** Corregir el texto del ADR y agregar el caso de Madrid con su
valor UTC esperado, para que el test se escriba contra un número y no contra
una frase.

### B-2. La hora de pared inexistente produce un fin anterior al inicio

Desplazar hacia adelante rompe la monotonía: en Madrid el 2026-03-29, inicio
02:30 y fin 03:00 dan `startedAt` 01:30Z y `endedAt` 01:00Z, que la base
rechaza con un error que la persona lee como «revisá la conexión». Y 02:00 a
03:00 produce una entrada de duración cero que pasó la validación de pared.

**Resolución.** `instantFromLocal` **rechaza** la hora de pared que no existe y
devuelve `null`. El service lo traduce a `validation` con un mensaje propio:
«Esa hora no existe por el cambio de horario.». Conserva la monotonía, es
honesto con lo que la persona tecleó, y le da contenido al `null` que hoy es
rama muerta (resuelve también M-8). Los dos pares de horas del hallazgo entran
como casos de `time.test.ts`.

### B-3. El aviso de entrada fuera de la ventana da falsos positivos

`visibleDays` se arma con los grupos que la lista dibuja, y los días sin
entradas no tienen grupo (TT-86), mientras la ventana es un rango continuo. Y
la visibilidad depende del estado **posterior** a la inserción, que el cliente
no tiene.

**Resolución.** La decisión sale del cliente. El service la calcula después del
`insert`, reusando `windowStart`, y el resultado pasa a
`ActionResult<{ created: TimeEntryView; outsideWindow: boolean }>`. `visibleDays`
desaparece del contrato. El criterio 12 deja de hablar de «los últimos 14 días»
—la ventana se extiende hacia atrás— y nombra el día que quedó fuera del tramo
que la lista muestra.

## Mayores

### M-5. Cada criterio dice con qué test se verifica

Es el hueco del slice 1: cuatro conductas se dieron por cubiertas y ningún test
las atrapaba.

**Resolución.** Tabla en el §7 con una fila por criterio y tres columnas: tipo
de test, archivo y qué afirma. Más la lista explícita de recorridos
obligatorios de `e2e/manual-entry.spec.ts`, con dueño nombrado. Un criterio sin
test posible va al §8 como hueco conocido, nunca en silencio.

### M-6. El CLI de shadcn escribe fuera de las listas

`components.json` apunta a `src/app/globals.css`, que no está en ninguna lista,
y `calendar` depende de `button`, que el slice 1 ya usa.

**Resolución.** `src/app/globals.css` entra en la lista de `frontend-dev`.
Sobre `src/components/ui/button.tsx`: entra también, con la instrucción
explícita de revisar el diff y no perder la variante `success` que usa la barra
del slice 1.

### M-7. Dos conductas viven donde ningún test las alcanza

**Resolución.** `manual-draft.ts` declara una transición
`reset(serverNow, timeZone)`, la misma del montaje, y `manual-bar.tsx` solo la
invoca. El criterio 7 pasa a tener test de unidad; en e2e queda únicamente «no
se limpia si la action falla».

## Menores

| ID   | Resolución                                                                                                                                                                                                                                                                                                                                         |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M-8  | Resuelto por B-2: el `null` pasa a significar «hora de pared inexistente», que sí es alcanzable.                                                                                                                                                                                                                                                   |
| M-9  | `dayKeyLabel` parsea la clave como fecha civil, nunca con `new Date("YYYY-MM-DD")`. Un caso de `time.test.ts` corre con `TZ` distinto de UTC.                                                                                                                                                                                                      |
| M-10 | El ADR dice que el instante se construye con el constructor de componentes, `new TZDate(y, m-1, d, h, min, 0, 0, tz)`, y no con la cadena, que se interpreta en la zona del proceso. `instantFromLocal` devuelve un `Date` plano, como ya hacen `dayBounds` y `startOfLocalDay`.                                                                   |
| M-11 | El ADR enumera qué puede falsear el cliente: solo el día y las dos horas de pared. Con P-10 el futuro ya no está acotado, así que el piso se vuelve necesario: se rechaza una fecha anterior al día de creación del workspace, con «No se pueden cargar horas anteriores a la creación del workspace.». Es un dato que el service ya tiene a mano. |
| M-12 | Se disuelve con P-10. Igual, el criterio 8 nombra un día pasado para que el caso sea el de TT-72 y no otro.                                                                                                                                                                                                                                        |
| M-13 | El aviso del criterio 12 baja con la misma regla del slice 1: cualquier operación nueva de la barra limpia los avisos.                                                                                                                                                                                                                             |
| M-14 | `timer-bar.tsx` pasa a `tracker-bar.tsx`, con `timer-bar.tsx` y `manual-bar.tsx` adentro. Es renombre dentro de la lista de `frontend-dev`.                                                                                                                                                                                                        |

## P-10 arrastra un cambio en código ya implementado

`parity-analyst` encontró la consecuencia al revisar la reversión, y es real:
`getTrackerState` lee `listClosedBetween(windowStart, now)`, con el extremo
superior en «ahora». Aceptando fechas futuras, **una entrada futura no se ve
nunca**, y «Cargar más» tampoco la va a alcanzar porque solo extiende hacia
atrás. Es exactamente la clase de bug que B-3 acaba de cerrar: una entrada que
se guarda y no aparece.

**Resolución.** El extremo superior de la ventana pasa a ser el día de la
entrada más nueva, que puede ser posterior a hoy, con la misma forma con la que
el extremo inferior ya se extiende hasta el último día con entradas. Entra en
el alcance del slice 2, porque es consecuencia directa de P-10, y toca el
contrato de lectura del slice 1: hay que nombrarlo en la sección de alcance
como cambio sobre lo ya entregado, y cubrirlo con un test de integración.

Dos cosas que **no** cambian, y conviene dejarlas escritas para que nadie las
«corrija» por coherencia aparente:

- TT-29 y TT-75 siguen en `adaptar`: un timer activo no puede empezar en el
  futuro. Una entrada cerrada en el futuro se puede dibujar; un contador que
  corre hacia atrás, no. `futureTime` sobrevive para ese caso, que es del
  slice 3.
- TT-81 y el `check` de la base siguen igual.
