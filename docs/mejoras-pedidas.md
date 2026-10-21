# Mejoras pedidas por el usuario

Pedidos que quedan anotados para después. No están en el mapa de la fase 2 ni
se arrancan solos: cuando el usuario elija uno, pasa por el pipeline de siempre
(paridad si aplica, contrato, revisiones).

## Anotadas el 2026-10-16

1. **Calendario: arrastrar cada 15 minutos.** Hoy, al arrastrar en el
   calendario, el inicio y el fin saltan de a una marca del zoom
   (`calendar-gestures.ts:153`, `Math.round(x / zoom) * zoom`), así que con el
   zoom de una hora solo se puede elegir la hora en punto. El pedido: que el
   arrastre ajuste a 15 minutos sea cual sea el zoom. **El usuario pidió hacerlo
   como slice chico** (2026-10-16).
2. **Crear un proyecto desde el selector.** Al cargar una entrada, si el
   proyecto no existe o la búsqueda no lo encuentra, ofrecer un botón «Crear
   proyecto» que abra un diálogo para crearlo ahí mismo y dejarlo elegido. Es
   TT-09 de `docs/parity/time-tracker.md`, hoy `fuera de alcance`; Clockify lo
   ofrece al final del buscador cuando el permiso lo habilita. **Sumada a P1 de
   la fase 2** por decisión del usuario del 2026-10-16 (`fase2-mapa.md`).
   _Corregido el 2026-10-21, P1_: **hecha con P1**
   ([contrato de P1](slices/fase2-p1-proyectos.md), D-P1-10 y D-P1-11). TT-09
   pasó a `adaptar`: «Crear proyecto» es la última opción de la lista del
   selector, para quien tiene `project.create`, en el rastreador, el
   calendario, la planilla y la edición masiva; abre el alta en un diálogo con
   el nombre de la búsqueda y deja elegido el proyecto nuevo. En el selector
   vacío reemplaza a «Ir a Proyectos» (TT-87, TS-88).
3. **Un servidor MCP para cargar horas.** Que un asistente (Claude u otro
   cliente MCP) pueda cargar, ver y editar entradas en Clock con la cuenta de
   quien lo usa. Pide decidir la autenticación (tokens personales o OAuth), qué
   herramientas expone y cómo respeta `can()` y el aislamiento por workspace.

## Anotadas el 2026-10-20

4. **MCP: cargar varias entradas en un lote.** Hoy el servidor MCP solo tiene
   `create_entry`, de a una; cargar una semana a partir de un resumen son N
   llamadas, N aprobaciones en el cliente y, si una falla a mitad, las
   anteriores ya quedaron. El pedido: una herramienta `create_entries` que
   reciba hasta unas 50 entradas con la misma forma de `create_entry` (cada una
   con su `id`, así que reintentar el lote no duplica) y las cargue todas o
   ninguna en una sola transacción. Si alguna no pasa, el error dice el índice y
   el motivo de cada una. Queda por decidir el tope, qué pasa con un `id`
   repetido dentro del lote y si las superposiciones entre entradas del mismo
   lote se validan igual que contra las ya cargadas. Va después del merge de
   `mejoras/mcp`; `create_entry` queda para las cargas sueltas.

## Anotadas el 2026-10-21

5. **MCP: que owner y admin vean las horas de los demás.** Hoy ninguna
   herramienta recibe `userId` y todas filtran por la persona del token
   (D-MCP-11 de `docs/slices/mejoras-mcp.md`), así que un administrador solo ve
   sus propias entradas desde el asistente. El pedido, del usuario después de
   probar el MCP en producción: que un owner o admin pueda consultar las horas
   de otras personas del workspace, como ya puede hacerlo en la aplicación. Por
   ahora solo ver, no editar. Queda por decidir qué regla de `can()` se reusa
   (la de los reportes de equipo), si es un filtro de `list_entries` o una
   herramienta nueva de resumen, y cómo se nombra a la persona (correo o id).
