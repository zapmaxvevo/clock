# Correcciones al contrato del slice 4 — ronda 1

Salida de `architecture-reviewer` sobre `fase1-slice4-continuar-duplicar.md` y
el ADR 0007: un bloqueante, tres mayores, once menores. El diagnóstico que
motiva el ADR 0007 quedó confirmado: reintentar un «Iniciar» cuya respuesta se
perdió cierra el timer que creó el primer intento y abre otro
(`service.ts:173-184`, `use-entry-action.ts:68-81`). La opción elegida es la
correcta; lo que hay que cambiar es el texto. Abajo, la resolución decidida de
cada hallazgo.

## Bloqueante

### B-1. El reintento de `continueEntry` contradice al ADR 0003

Volver al paso 1 ante un choque del índice único hace que la pestaña perdedora
cierre el timer del ganador y deje una entrada de 0 s, y un choque de PK
termina en `unexpected`.

**Resolución.** Un único algoritmo, escrito en el ADR 0007 y citado por
`startTimer`, `continueEntry` y `duplicateEntry`:

```
vuelta (máx. 2):
  replayedEntry(id) → si existe, responderla
  transacción → si ok, responder
  choque PK: replayedEntry(id) ?? forbidden   (sin otra vuelta)
  choque índice único: replayedEntry(id) → si existe, responderla
                       findRunning → si existe, responder el ganador (ADR 0003)
                       si no, otra vuelta
unexpected
```

El criterio que corresponda suma: continuar en paralelo con un arranque de otro
id deja un solo timer y ninguna entrada de 0 s, probado con `Promise.all`.

## Mayores

### M-1. Nadie es dueño del interruptor de atajos

**Resolución.** `useSyncExternalStore` con `subscribe` a `storage` y a un evento
propio en `window` (`clock:tracker-shortcuts`) que despacha el setter;
`getServerSnapshot` en «activos»; lectura y escritura en `try/catch`, con
«activos» si fallan. Sin estado de módulo. E2E: con el interruptor apagado y sin
recargar, la fila pierde `aria-keyshortcuts` y `c` no hace nada.

### M-2. Cambiar la regla de TT-58 no es «una función y un criterio»

**Resolución.** El criterio 7 y el e2e 4 afirman solo «una fila más con esa
descripción en la lista, y la original intacta», sin grupo ni total. El
razonamiento sobre la ventana y el piso pasa al comentario de `duplicateTimes`.
Revisar si con eso `outsideWindow` sigue haciendo falta y acotar la deuda.

### M-3. El arreglo de «Iniciar» se separa del slice 4

Es un defecto de `main` y no depende del slice 3 ni de las operaciones nuevas.

**Resolución.** Un contrato propio y chico,
`docs/slices/fase1-slice2b-reintento-de-iniciar.md`, que va **después del merge
del slice 2 y antes de implementar el 3**. Trae `startTimerInput.id`,
`findOwnById`, `isDuplicateId`, el id en `insertRunning`, el algoritmo de B-1,
el id generado en `tracker-bar.tsx`, el criterio de reintento para «Iniciar» en
integración y en e2e con respuesta perdida de verdad (`route.fetch()` y después
`route.abort()`), y la corrección del párrafo de TT-109. El slice 4 lo pone en
su §0 y lo reusa. El ADR 0007 se acepta probado sobre ese caso.

## Menores

| ID   | Resolución                                                                                                                                                                                                                                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| m-1  | `can(actor, "timeEntry.own.create", …)` antes de `replayedEntry`: un actor inactivo no recibe éxito por mandar el id de una fila propia.                                                                                                                                                                      |
| m-2  | `refine` que rechaza `id === sourceId` con `validation`; caso en `schema.test.ts`.                                                                                                                                                                                                                            |
| m-3  | `z.uuidv4()` en lugar de `z.uuid()`.                                                                                                                                                                                                                                                                          |
| m-4  | `isDuplicateId` mira `23505` sobre `time_entry_pkey`, como `isRunningConflict`; test directo del repository.                                                                                                                                                                                                  |
| m-5  | Documentar en el ADR 0007 que el reintento puede recrear una fila descartada o borrada entre medio, y que devuelve la fila en el estado en que esté. Bajar el aviso de `start` cuando cambia `serverState.id`. Caso de integración: el reintento sobre una fila ya detenida la devuelve cerrada y no escribe. |
| m-6  | `validation` entre los errores de `continueEntry`, por la traducción de `isEndBeforeStart` del slice 3; el criterio 2 admite esa excepción.                                                                                                                                                                   |
| m-7  | Desempate por `asc(timeEntry.id)` en `findLatestClosedBefore`, como la lista; caso en el criterio 16.                                                                                                                                                                                                         |
| m-8  | Foco después de descartar: a la descripción, como el borrado en `day-group.tsx`.                                                                                                                                                                                                                              |
| m-9  | `switch.tsx` de Base UI en `src/components/ui/`, pedido en el handshake.                                                                                                                                                                                                                                      |
| m-10 | Reescribir el primer motivo de la precondición: la carrera de `greatest` la crea el slice 3; la precondición vale por los archivos compartidos y los editores.                                                                                                                                                |
| m-11 | El ADR 0007 enmienda `0003:82-86`: la no idempotencia queda superada para el reintento, no para un doble clic que genera dos ids. Nota en el 0003 que remite al 0007.                                                                                                                                         |

## Estado del ADR 0007

Queda «propuesto» hasta que el equipo lo apruebe. El texto se corrige ahora (B-1,
m-3, m-5, m-11), así que la aprobación no espera otra ronda de redacción.

# Ronda 2

Salida de `architecture-reviewer` sobre el slice 4, el slice 2b y el ADR 0007:
sin bloqueantes, dos mayores, seis menores. El algoritmo `createOnce` se
reprodujo contra Postgres 17 con conexiones concurrentes en read committed: los
seis escenarios del ADR y uno que la tabla no lista dan lo que dice el ADR. La
decisión se puede aprobar con los agregados de abajo.

## Mayores

### R2-M1. Los criterios 3 del 2b y 21 del 4 no son deterministas

`Promise.all` con ids distintos solo cruza las transacciones a veces (0/150
sin espera, 149/150 con 5 ms): el test sería intermitente sobre una
implementación correcta.

**Resolución.** Forzar el cruce con una tercera conexión que hace de barrera,
sin `vi.mock`: con timer previo, `SELECT … FOR UPDATE` sobre la fila previa;
sin timer previo, un timer abierto del mismo usuario sin commitear. Se espera a
que haya dos sesiones con `wait_event_type = 'Lock'` y se suelta. El resultado
esperado es «created + winner» con el mismo id en las dos respuestas.

### R2-M2. «Iniciar» después de una respuesta perdida sigue cerrando el timer

Con el aviso de `unexpected` arriba, apretar «Iniciar» en vez de «Reintentar»
manda un id nuevo y deja una entrada de segundos.

**Resolución.** Mientras el aviso de «Iniciar» con `unexpected` está visible,
`handleToggle` reusa el id pendiente; se renueva con un éxito o cuando el aviso
baja. Criterio y recorrido e2e que aprietan «Iniciar» después de la respuesta
perdida.

## Menores

| ID    | Resolución                                                                                                                                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R2-m1 | Continuar y duplicar leen la fuente **sin bloqueo**: no escriben sobre ella y su `user_id` no cambia. Con `FOR UPDATE`, dos «Continuar» de la misma fuente dejan una entrada de 0 s. Verificarlo ejecutando. |
| R2-m2 | Criterio y recorrido para el aviso de continuar que baja cuando cambia el id del timer, como el criterio 10 del 2b.                                                                                          |
| R2-m3 | Borrar o actualizar la frase del §0 del 2b que dice que el §0 del 3 solo nombra al slice 2.                                                                                                                  |
| R2-m4 | Completar la nota del ADR 0003: la clave primaria también es señal de carrera, y el perdedor sí espera el bloqueo de la fila previa o el commit de la tupla en conflicto.                                    |
| R2-m5 | Sumar a las tareas de `parity-analyst` del 4 la otra frase de TT-109: el alta manual deja de ser «la única operación del módulo que solo crea» con duplicar.                                                 |
| R2-m6 | El ADR 0007 dice que vale para las altas de cualquier módulo (el slice 9 lo adopta).                                                                                                                         |

## Arrastre del slice 9 (M-3 de su ronda 1)

`createOnce` y `hasConstraint` se escriben en un lugar neutro desde el 2b, que
es el primero que los implementa: `src/server/create-once.ts` (con `findOwn`,
`attempt`, `idConstraint` y un gancho opcional `onOtherConflict`, que usa el
timer) y `src/server/db/constraint-error.ts`. El ADR 0007 nombra las dos
ubicaciones; el 2b, el 4 y el 9 las importan.
