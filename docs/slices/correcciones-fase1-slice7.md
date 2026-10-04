# Correcciones al contrato del slice 7 — ronda 1

Salida de `architecture-reviewer` sobre `fase1-slice7-perfil.md` y el ADR 0012: un bloqueante,
dos mayores, nueve menores. Las ocho decisiones de fondo se sostienen, incluida la zona por
omisión como valor fijo. La migración se generó con drizzle-kit y es idéntica a la de §2; se
aplicó sobre las 0000 a 0004 en Postgres 17.11 con sus `check`, la cascada desde `user` y la
reversión. La lista de zonas se comprobó en Node 25.8.1.

**Orden de implementación decidido por el equipo: 10 → 7 → 6.** El 7 entra después del 10 y
antes del 6: lo que el 6 tenga que adaptar a los formatos lo adapta el 6 (su ronda 1, M2 y m5).

## Bloqueante

| ID  | Resolución                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | `Intl.supportedValuesOf("timeZone")` lista nombres canónicos de CLDR y no incluye `America/Argentina/Buenos_Aires` (sí `America/Buenos_Aires`). Se compara por forma canónica: `canonicalTimeZone(v)` con `resolvedOptions().timeZone`, e `isSupportedTimeZone(v)` acepta si la forma canónica de `v` está en la lista. Las opciones del selector son la lista más la zona efectiva (la guardada o la de omisión) si su forma canónica no está, y el valor elegido es la opción equivalente. El valor de omisión sigue siendo `America/Argentina/Buenos_Aires`, igual a `workspace.timezone` y a `DEFAULT_TIMEZONE`. Se corrigen los recorridos 1 y 4 y el criterio 2 suma el valor de omisión contra la lista. |

## Mayores

| ID  | Resolución                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1  | Next 16 conserva los layouts compartidos en una navegación del cliente, así que los formatos del layout pueden quedar viejos frente a una página fresca. `TrackerScreen` monta también `DisplayFormatsProvider` con `workspace.formats`, que ya llegan en `TrackerWorkspace`: gana el proveedor más cercano y el layout queda como base. El ADR corrige la garantía del «mismo render» en ese sentido. |
| M2  | La lista de consumidores de §5.5 deja de ser cerrada: toda pantalla que muestre horas o fechas usa `useDisplayFormats`. Con el orden decidido, el 6 entra después y se adapta él; el §0 del 7 solo lo nombra.                                                                                                                                                                                          |

## Menores

| ID  | Resolución                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| m1  | La migración tiene etiqueta fija y número no fijo (con el 10 primero, el 10 ocupa la 0005 y la 0006). El §0 dice que la deuda de las piezas compartidas ya la paga el 10.                                     |
| m2  | La fila en reposo arma su rango con `clockLabel` sobre `startClock` y `endClock` (o con `startLabel` y `endLabel` de la vista), dicho sin ambigüedad.                                                         |
| m3  | El criterio 3 dice «los mismos rótulos», no «las mismas vistas».                                                                                                                                              |
| m4  | La tabla de 12 h suma «p. m.» y «a. m.» con espacio interno (`1 p. m.`, `9 a. m.`).                                                                                                                           |
| m5  | La zona se valida con `{ error: profileMessages.timeZoneUnknown }` también cuando el valor no es texto.                                                                                                       |
| m6  | El criterio 1 inserta con éxito cada valor de `TIME_FORMATS` y `DATE_FORMATS`, para que una deriva entre la constante y el `check` se vea.                                                                    |
| m7  | La búsqueda por escritura del selector de zonas compara desde el inicio del texto: queda como deuda en §8.                                                                                                    |
| m8  | El slice 7b (nombre editable y tema) se acepta. El mapa suma su fila y el enlace al contrato del 7, y la dependencia real del 7 respecto del 9; lo hace team-lead.                                            |
| m9  | La excepción a «toda consulta filtra por `workspace_id`» (las tablas de la cuenta filtran por el `user_id` de la sesión) entra en `.claude/skills/code-conventions/SKILL.md`, en el commit que crea la tabla. |

## ADR 0012

Se puede aprobar con dos cambios: la garantía del mismo render se corrige con el proveedor del
rastreador (M1), y suma como consecuencia que `src/server/time` tiene que seguir siendo
importable desde el navegador (puro, sin `server-only`, `db` ni `env`). Aprobarlo, y confirmar
la zona por omisión como valor fijo frente a la letra de P-03, es decisión del usuario.
