# Correcciones del slice 2c: revisiones

Salida de las seis revisiones del 2c sobre `fase1/slice-2c-reintentar` en `ff8a01d`, con lint,
typecheck, 1096 de unidad, 1121 de integración, `next build` y 147 de 147 e2e en verde, dos
corridas. Veredictos: backend (16 mutantes, todos caen), tests, código y seguridad **aprobado**;
frontend y paridad **cambios requeridos**. El team-lead decide cada hallazgo.

## El diálogo del alta que se cierra

F1 (frontend) y P2 (paridad) son el mismo hueco por dos caminos: cerrar el diálogo del alta del
calendario.

- **F1, mayor.** Con el alta en vuelo y el id pendiente, Esc o «Cancelar» cierran el diálogo; si
  la respuesta es la fila de un intento anterior, el informativo de r2-1 no tiene dónde verse y
  la entrada nueva se pierde sin aviso (reproducido con e2e). En `main` ese «Agregar» la creaba.
- **P2, menor.** Con el aviso de falla a la vista, cerrar el diálogo baja el aviso y renueva el
  id: reabrir el alta y agregar lo mismo deja dos bloques, sin el aviso que antes daba TT-109.

**Decisión del team-lead:**

1. **Mientras el alta viaja, el diálogo no se cierra.** «Cancelar» queda con `aria-disabled` y no
   actúa; Esc y el clic afuera se ignoran (`onOpenChange(false)` no hace nada con
   `create.pending`). Así el informativo siempre tiene el diálogo donde verse.
2. **El id pendiente sobrevive al cierre del diálogo.** `CalendarView` conserva el id del alta y
   sus pedidos registrados (`SentRequests`) mientras el último desenlace fue `unexpected`; el
   próximo alta que se abra los reusa. Si se agrega lo mismo, el servidor responde la fila sin
   duplicar; si se agrega otra cosa, aparece el informativo de r2-1 dentro del diálogo y el
   siguiente «Agregar» la crea. El id se renueva solo con el éxito o con otro código, como en la
   barra (m4). Costo aceptado: después de cancelar un alta fallida, la primera alta distinta
   pide un segundo «Agregar».
3. En la barra, recargar o navegar con el aviso a la vista sigue renovando el id (se pierde el
   estado de la pantalla): límite conocido, a la paridad y a §8.

## Decisiones

| Origen | Hallazgo                                                                                                                                  | Decisión y dueño                                                                                                                                                                                                                                                                                                               |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1, P2 | Cerrar el diálogo del alta (arriba)                                                                                                       | `frontend-dev`: los puntos 1 y 2. `e2e-tester`: Esc y «Cancelar» con el alta retenida dejan el diálogo abierto y, al soltar, aparece el informativo; cancelar con el aviso de falla y reabrir con lo mismo deja un solo bloque; reabrir con otra cosa da el informativo y el siguiente «Agregar» la crea. Los tres fallan hoy. |
| P1     | La paridad todavía describe TT-109 como vigente                                                                                           | `parity-analyst`, con la lista del revisor: TT-89, TT-109 (título, cuerpo y nota `_Corregido_`), sección «Slice 2c», CAL-46, la §13, CAL-86, la nota de `:1427-1430`, «Lo que queda», TS-37; TS-60 y TS-92 conservan su «sin Reintentar» con justificación propia. Suma el límite del punto 3, F3 y la decisión de arriba.     |
| F2     | «m» con el foco en «Reintentar» del alta desactiva el botón y el foco cae en `body`                                                       | Deuda: se suma al punto de §8 sobre `disabled` en `ActionFeedback`. La corrección es del componente compartido (`aria-disabled` y no actuar), fuera del slice.                                                                                                                                                                 |
| F3     | Con dos pedidos distintos bajo el mismo id y la entrada editada en otra pestaña, el informativo es falso y el siguiente «Agregar» duplica | Deuda: costo del desvío aceptado de `SentRequests` (el cliente no sabe cuál pedido se aplicó). Va a §8 junto al caso de la zona horaria; lo cerraría un `replayed` explícito del servidor.                                                                                                                                     |
| C1     | `createManualEntry` y `duplicateEntry` repiten el envoltorio del alta cerrada                                                             | `backend-dev`: `closedEntryOnce(actor, workspace, id, insert)`, como `startEntryOnce`.                                                                                                                                                                                                                                         |
| C2     | `addFromBar` y `requestOf` arman el mismo objeto                                                                                          | `frontend-dev`: `addFromBar` sobre `requestOf`.                                                                                                                                                                                                                                                                                |
| C3     | `isSentEntry` y `sameRequest` repiten las ocho comparaciones                                                                              | `frontend-dev`: `isSentEntry` sobre `sameRequest` con `requestOfView`.                                                                                                                                                                                                                                                         |
| T1     | El último paso del recorrido 1 corre después de recargar y no detecta un id fijo por montaje                                              | `e2e-tester`: el segundo «Agregar» antes de recargar, dos filas, y después de recargar dos.                                                                                                                                                                                                                                    |
| T2     | Dos negativas del recorrido 6 sin esperar `onSuccess`                                                                                     | `e2e-tester`: `expectEmptyBar(bar)` antes.                                                                                                                                                                                                                                                                                     |
| T3     | `sameRequest` no prueba la tarea con otras mayúsculas                                                                                     | `frontend-dev`: el caso en `sent-entry.test.ts`.                                                                                                                                                                                                                                                                               |
| T4     | `typeDraft` y `addButton` repiten `addManualEntry`                                                                                        | `e2e-tester`: `typeManualDraft` y `addButton` exportados de `e2e/tracker-page.ts`, usados por `addManualEntry`.                                                                                                                                                                                                                |

Deuda vista y ya conocida: la barra desborda de 3 a 33 px a 390 px sin ningún aviso (previa al
slice).

## Orden de la ronda

1. `frontend-dev`, `backend-dev` y `e2e-tester` en paralelo; los recorridos nuevos se confirman
   fallando antes del arreglo.
2. `parity-analyst` en paralelo, solo `docs/parity/`.
3. Segunda revisión de frontend sobre F1/P2, porque cambia cuándo se cierra el diálogo y cuándo
   se renueva el id.
4. Corrida final completa y merge.
