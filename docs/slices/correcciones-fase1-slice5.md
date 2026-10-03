# Correcciones al contrato del slice 5 — ronda 1

Salida de `architecture-reviewer` sobre `fase1-slice5-semana-y-paginacion.md`,
el ADR 0008 y el mapa: sin bloqueantes, cinco mayores, nueve menores. La
migración se verificó generándola con drizzle-kit y las funciones de semana con
22 995 comprobaciones; el `weekBounds` actual falla 21 veces en Santiago, lo que
confirma el motivo del cambio. El ADR 0008 se sostiene contra Next 16.3.8:
`?desde` sobrevive a la revalidación de las actions y a `router.refresh()`.
Abajo, la resolución decidida de cada hallazgo.

## Mayores

### M1. Detener un timer cuyo inicio se movió atrás la deja invisible

**Resolución.** `weekStart` entra en `TimeEntryView`, derivado igual que
`dayDate`. Todo resultado que devuelve una entrada lo trae (`created`, `entry`,
`stopped`, y lo que cierre `startTimer` o `continueEntry`), y el cliente aplica
una sola regla después de cualquier mutación. El criterio correspondiente suma
el caso: timer con inicio movido a hace semanas, se detiene, la lista se
extiende hasta su semana.

### M2. La mutación de una fila está en el componente equivocado

**Resolución.** Según el contrato del 3, `day-group.tsx` es dueño de la mutación
de horas. El callback pasa a `onEntryWeek(result.weekStart)` hacia
`entry-list.tsx`. `day-group.tsx` entra a la tabla de consecuencias con ese
cambio, y `tracker-bar.tsx` recibe `windowFrom` como prop.

### M3. Dos archivos que el slice rompe no tienen dueño

**Resolución.** `permissions.integration.test.ts` y `audit.integration.test.ts`
entran a la lista de `backend-dev`.

### M4. El inicio de semana va en `membership`, no en `workspace`

PF-01 (decisión del equipo del 2026-10-02) ya dice que el campo va en
`membership`, y Clockify no tiene un nivel de workspace: un
`workspace.week_start` sería un respaldo que ninguna pantalla edita nunca.

**Resolución.** `membership.week_start smallint not null default 1`, con el
mismo `check` 0..6, desde este slice. `weekStartOf(context)` lee la membresía.
Desaparece la semántica de «nulo = el del workspace». El slice 7 se reduce a la
pantalla. Cambiar el valor de todos sigue siendo un `update`. Ajustar el mapa
(la restricción para el slice 7 y la sección del 5) y la migración.

### M5. Nada limita el tamaño de la ventana

**Resolución.** Opción (b): sin tope. Se registra en §8 y en las consecuencias
del ADR 0008: el límite es la historia propia de la persona, el costo por render
más el refresco de P-11, y el umbral que obliga a paginar dentro de la ventana.

## Menores

| ID  | Resolución                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| m-1 | Escribir la reversión de la migración y que solo es segura con el código anterior desplegado.                                                                                                                                        |
| m-2 | §3: `workspace.settings.update` la tienen owner y admin (`permissions/index.ts:49`).                                                                                                                                                 |
| m-3 | `trackerSearchParams` no lanza: `safeParse` sobre `string \| string[] \| undefined`; un arreglo se ignora.                                                                                                                           |
| m-4 | `startOfDayKey` lanza cuando `instantFromLocal(d, "12:00")` da `null`, con su caso de test; nombrar los siete casos históricos y que ninguno es posterior al piso.                                                                   |
| m-5 | `weekKeyLabel` con semana que cruza el año: año en los dos extremos si alguno no es el año actual.                                                                                                                                   |
| m-6 | El criterio 11 usa «hace 60 días», dentro de `WORKSPACE_HISTORY_DAYS`.                                                                                                                                                               |
| m-7 | El registro de paridad lo hace `parity-analyst` antes del merge: ventana en semanas enteras, «Cargar más» como enlace que salta semanas vacías, retiro de TT-108, rótulo de semana futura; y la fila de `weekBounds` en `perfil.md`. |
| m-8 | El contrato del 4 nombra `outsideWindow` en `duplicateTimes` y §8: se coordina con el architect del 4 para que diga «la semana de la entrada».                                                                                       |
| m-9 | Si la semana pedida no llega, el foco va al encabezado de la semana más vieja.                                                                                                                                                       |

## ADR 0008

Se suman, antes de pedir la aprobación: el costo sin tope (M5); que P-15 dibuja
la página dos veces, una con la respuesta y otra con el `replace`; que «Cargar
más» no lleva `prefetch={true}`, porque guardaría una ventana vieja en la caché
del cliente; y la cookie como opción descartada.

# Ronda 2

Salida de `architecture-reviewer`: sin bloqueantes, un mayor nuevo y tres
menores. La migración de `membership.week_start`, su relleno, el `check` y la
reversión se verificaron ejecutando; las 10 actions de la tabla de §4.2 están
completas y `weekStartOf` no suma consultas. El ADR 0008 se puede aprobar
corregido N1.

## N1 (mayor). Detener un timer que ya estaba atrás al cargar la página

El piso de la ventana incluye el día del timer activo, así que `weekToReach`
compara contra una ventana que ya contiene la semana del timer y no navega; al
detenerlo, la revalidación lo saca de la lista. El recorrido 5 pasa solo porque
mueve y detiene en la misma pestaña.

**Resolución.** `TrackerState` suma `reachFrom`: el piso de §5.2 sin el aporte
del timer activo (`weekStartKey(min(13 días atrás, día de latestPast, desde))`,
recortado a `minDayKey`). `weekToReach` compara contra `reachFrom`; `windowFrom`
sigue siendo lo que se dibuja. Reescribir el párrafo que dice que el timer
«deja su semana fijada en la URL» y el ADR 0008 donde nombra el piso. El
recorrido 5 hace `goto("/")` sin `desde` entre mover el inicio y detener. §8
suma el borde: el `replayed` del ADR 0007 devuelve `stopped: null`, así que un
«Iniciar» o «Continuar» cuya respuesta se perdió no informa el timer que cerró
el primer intento.

## Menores

| ID  | Resolución                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N2  | §5.4 nombra `startOfLocalDay` y quita «no depende de cómo una librería ubique una medianoche»; §8 suma los 31 días históricos (Australia 1990-1993, Argentina 1991-1992), anteriores a todo piso. |
| N3  | El criterio 1 queda en «una membresía nace con 1 y el `check` rechaza 7 y -1»; el relleno de las existentes va a la viñeta de §8 que se argumenta y no se prueba.                                 |
| N4  | El mapa dice que el slice 7 cambia `trackerWorkspaceOf` (lo corrige el team-lead) y m-7 suma a las tareas de `parity-analyst` las dos filas de `perfil.md` sobre dónde se lee la zona.            |
