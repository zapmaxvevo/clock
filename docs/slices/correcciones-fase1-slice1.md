# Correcciones al contrato del slice 1 — ronda 1

Salida de `architecture-reviewer` sobre `fase1-slice1-timer.md`: veredicto
**cambios requeridos**, cinco mayores y once menores, ningún bloqueante. Abajo
va cada hallazgo con la resolución ya decidida por el equipo. `architect`
aplica las resoluciones al contrato y al ADR 0003; no hace falta volver a
discutirlas.

## Mayores

### M1. La carrera de TT-37 no tiene forma de resultado

Tras el `23505` la transacción queda abortada y la relectura ocurre fuera de
ella. Si el ganador detuvo el timer en esa ventana, no hay timer activo que
devolver y `running` es no nulable.

**Resolución.** Reintento acotado a una sola vuelta: si la relectura no
encuentra timer activo, se reintenta la transacción completa una vez. Si la
segunda vuelta vuelve a chocar y a no encontrar nada, `unexpected`. Queda
escrito en el ADR 0003 y en la sección de `startTimer`.

### M2. `timeEntry.own.view` no la consulta nadie, y cablearla rompería TT-92

**Resolución.** Se saca `timeEntry.own.view` de la unión `Action`. Leer las
propias entradas es un filtro de datos por `workspace_id` y `user_id`, como lo
describe TT-01, no una decisión de `can()`. El criterio 26 queda como está: con
la membresía desactivada la pantalla se ve en solo lectura. La frase «ninguna
decisión de acceso vive fuera de este archivo» se corrige para hablar de las
mutaciones.

### M3. El redondeo de `durationMinutes` contradice el criterio 4 y TT-101

**Resolución.** La aritmética de pantalla pasa a segundos: `durationSeconds` en
`timeEntryView`, `closedSeconds` en `dayGroupView`, y las etiquetas se formatean
**truncando** a minuto. `durationMinutes` de `src/server/time` queda intacta
para los reportes. No se suma nada ya redondeado.

### M4. `service.test.ts` no tenía dónde correr

Resuelto fuera del slice: el arnés de integración ya existe en `main`.

- `npm run test:integration` corre contra un Postgres real.
- `vitest.integration.config.ts` migra la base antes de la tanda y trunca las
  tablas antes de cada test; `src/test/factories.ts` crea usuarios, workspace y
  membresías.
- `src/server/db/index.ts` elige driver por el host: Neon en Vercel,
  node-postgres en local y en los tests.

**Resolución.** `backend-dev` escribe `src/modules/time-entry/service.integration.test.ts`
contra base real, sin `vi.mock` y sin repository inyectable. Los criterios 7, 8
y 22 se verifican ahí y dejan de depender de la inspección manual. El contrato
agrega ese archivo a la lista de `backend-dev`. `vitest.config.ts`,
`vitest.integration.config.ts` y `src/test/` siguen intocables para los dos
implementadores.

### M5. `days: []` con `hasAnyEntry: true` no tiene estado de pantalla

**Resolución.** Se elimina el caso en vez de dibujarlo: la ventana se extiende
hacia atrás hasta incluir el último día con entradas, de modo que `days` nunca
queda vacío si `hasAnyEntry` es verdadero. No se agrega un segundo estado vacío
ni `hasEntriesBeforeWindow`.

## Menores

| ID  | Resolución                                                                                                                                                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| m1  | Agregar `TT-36` al rótulo del criterio 7. Declarar TT-42, TT-51, TT-86, TT-97 y TT-106 como arrastre explícito en la sección 1, con la línea de por qué entran.                                                                                                                                                            |
| m2  | Dos mensajes: uno neutro para membresía y creación («No tenés permiso para hacer esto.») y el de TT-79 reservado para acciones sobre una entrada identificada. La tabla dice cuál usa cada action.                                                                                                                         |
| m3  | Declarar en esa sección que un id de otro workspace devuelve `not_found` a propósito, para no filtrar existencia entre workspaces.                                                                                                                                                                                         |
| m4  | Decir que para `create` el `Resource` se arma con el propio actor.                                                                                                                                                                                                                                                         |
| m5  | Fijar la convención del audit log: `action` entre `timeEntry.start`, `timeEntry.stop`, `timeEntry.updateDescription` y `timeEntry.delete`; `entity` `"time_entry"`; `entityId` el uuid de la fila. Definir qué va en `previousValue` y `nextValue` en cada mutación, y en el borrado el valor previo lleva la fila entera. |
| m6  | Decir que `day-group.tsx` formatea con `formatDuration` y cómo combina `closedSeconds` con el transcurrido del contador.                                                                                                                                                                                                   |
| m7  | `extraDays` es `0` para la entrada abierta, coherente con `endLabel` nulo.                                                                                                                                                                                                                                                 |
| m8  | `formatElapsed` se queda en `src/server/time`, como manda la convención. Se acepta por escrito el costo de bundle; si crece, se parte más adelante.                                                                                                                                                                        |
| m9  | Asignar `package.json`, `package-lock.json` y `components.json` a `frontend-dev`, y reformular la frase «nadie toca» para que no se lea como lista exhaustiva.                                                                                                                                                             |
| m10 | `TRACKER_WINDOW_DAYS` vive en `src/modules/time-entry/schema.ts` y entra en el handshake del primer commit de `backend-dev`.                                                                                                                                                                                               |
| m11 | El corte usa `now()` de la base dentro de la transacción, no el reloj del proceso. La constante ya existe sin uso en `src/server/db/schema.ts`. `getTrackerState` conserva el `now` de aplicación solo para los tests.                                                                                                     |
