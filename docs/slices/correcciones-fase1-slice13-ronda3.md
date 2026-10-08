# Correcciones del slice 13: revisión del contrato, ronda 3

Salida de la ronda 3 de `architecture-reviewer` sobre `95979f0` (contrato) y `6aed751`
(paridad). Veredicto: **cambios requeridos**, dos menores de redacción; el diseño de M1 de la
ronda 2 cumple. El revisor no pide ronda 4: el team-lead aplica y comprueba las dos correcciones.

## Hallazgos

| Origen | Hallazgo                                                                                                                                                                                                                                                                                                                                                                                                                           | Resolución                                                                                                                                                                                                                                                                                                                            |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| m1     | TS-31 y la viñeta «Los instantes» de la paridad decían que el rechazo de un día sin ningún minuto desde las 09:00 se alcanza desde la interfaz. Lo afirmó la ronda 2 y es falso: `isNavigable` (`time-entry/service.ts`) descarta toda semana con un día que falta entero y la hace caer a la actual (CAL-17), así que la columna del 2011-12-30 en `Pacific/Apia` o `Pacific/Fakaofo` nunca se dibuja. Lo objetó `parity-analyst` | La paridad dice que no se llega navegando: solo desde una pestaña abierta antes de cambiar la zona (TS-111), hasta que se revalida, o con un pedido armado. El contrato no decía «alcanzable». La nota de `correcciones-fase1-slice13-ronda2.md` queda corregida acá: la cobertura de ese rechazo son los criterios 2 y 12, no el 24. |
| m2     | §5.6, «otra foto del servidor»: la razón de que la foto nueva traiga lo asentado estaba incompleta, faltaba la excepción de la navegación y no decía que `state` no se deriva en el cliente                                                                                                                                                                                                                                        | La razón pasa a la cola secuencial y el enredo de las actualizaciones del router; la navegación a la misma semana (`ACTION_NAVIGATE`, `ACTION_RESTORE`) queda como excepción aceptada, corregida por el refresco de Next al vaciarse la cola; `state` es el prop tal cual llega de `TimesheetScreen`. Sin código ni test nuevo.       |

Además, sin hallazgo: el mecanismo del criterio 16 que escribió el `architect` es correcto
(`queueBehindBarrier` falla con «Un corredor terminó sin trabarse en la barrera.» si el mutante
responde `unchanged` sin esperar); la nota de la ronda 2 («si no, el mutante no cae») era
inexacta. Llamar a la action fuera de `startTransition` sigue revalidando: `callServer` despacha
en su propia transición.

## Lo que sigue

1. El usuario aprueba los ADR 0018 y 0019 (y las notas de 0005, 0006 y 0007).
2. Pipeline del 13: backend, frontend y e2e.
