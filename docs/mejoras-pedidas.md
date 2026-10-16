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
3. **Un servidor MCP para cargar horas.** Que un asistente (Claude u otro
   cliente MCP) pueda cargar, ver y editar entradas en Clock con la cuenta de
   quien lo usa. Pide decidir la autenticación (tokens personales o OAuth), qué
   herramientas expone y cómo respeta `can()` y el aislamiento por workspace.
