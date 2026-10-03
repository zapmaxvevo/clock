# 0008. La ventana de la lista vive en la URL

Fecha: 2026-10-03. Estado: aceptado.
Origen: contrato del slice 5
([`fase1-slice5-semana-y-paginacion.md`](../slices/fase1-slice5-semana-y-paginacion.md)).

## Contexto

La lista del rastreador la arma `getTrackerState` en un Server Component, con
una ventana que calcula el servidor: 14 días hacia atrás, extendidos hasta el
día de la última entrada pasada y hasta el del timer activo, y hacia adelante
hasta el día de la entrada más nueva. Todas las mutaciones del módulo terminan
con `revalidatePath("/")`, que vuelve a dibujar la página entera con datos
frescos.

TT-52 pide «Cargar más»: cada clic suma semanas más viejas. Eso es estado de la
persona —cuánto bajó— que tiene que sobrevivir a lo que ya pasa todo el tiempo
en esta pantalla: la revalidación después de cada mutación, la revalidación
periódica de P-11 y la recarga.

Y P-15 decidió que, cuando exista «Cargar más», la entrada creada o movida a un
día que la lista no muestra deja de avisar (TT-108) y la ventana se extiende
hasta su día.

## Opciones

1. **Una action que devuelve las semanas viejas** y un Client Component que las
   acumula. Lo cargado queda fuera del árbol que revalida el servidor: una
   mutación sobre una entrada vieja revalida la página y deja la copia del
   cliente desactualizada, o hay que invalidarla a mano en cada mutación.
2. **Un Route Handler y fetch desde el cliente.** El mismo problema que la
   opción 1, con una ruta pública más.
3. **Un parámetro de búsqueda, `?desde=AAAA-MM-DD`**, que el Server Component
   lee y le pasa a `getTrackerState` como piso pedido de la ventana. «Cargar
   más» es un enlace a la misma página con un `desde` más viejo.
4. **Una cookie con el piso de la ventana**, que el Server Component lee igual
   que el modo de la barra (TT-16). Sobrevive a la revalidación y a la recarga
   como la opción 3, pero la cookie es del navegador y no de la pestaña: cargar
   más en una pestaña extiende la lista de todas las demás, el botón «Atrás» no
   vuelve a la ventana anterior porque la navegación no cambió, y la ventana no
   se puede compartir ni guardar. Además nunca se achica sola: haría falta una
   regla de vencimiento que la URL no necesita.

## Decisión

La opción 3.

- La ventana sigue siendo una sola, calculada por el servidor en el mismo
  snapshot `repeatable read` que el resto del estado; `desde` solo la puede
  **extender** hacia atrás, nunca achicar.
- La revalidación vuelve a dibujar la URL actual con su `desde`, así que lo
  cargado sobrevive a cualquier mutación sin que nadie lo recuerde aparte. La
  recarga también, y el botón «Atrás» vuelve a la ventana anterior.
- P-15 se cumple navegando: toda entrada que devuelve una mutación —creada,
  movida, detenida o cerrada por un arranque— trae la semana a la que
  pertenece, y si es más vieja que el piso que la ventana tendría **sin el
  timer activo**, el cliente reemplaza la URL por una con ese `desde`. Ya no
  hay aviso. El piso se compara sin el timer porque el timer lo extiende solo
  mientras corre: una entrada que hoy se ve gracias a él deja de verse en
  cuanto se detiene, y la URL es lo único que la sostiene después.
- «Cargar más» es un `<Link>`: funciona sin JavaScript y se anuncia como enlace.
  **No lleva `prefetch={true}`**: el prefetch completo guardaría en la caché del
  router del cliente el árbol de una ventana armado antes de la próxima
  mutación, y el clic podría dibujar esa ventana vieja en vez de pedir una
  nueva. Con el prefetch por omisión, el clic va al servidor.

## Consecuencias

- **Lo cargado se ve fresco siempre**, porque no hay copia en el cliente.
- **Cada «Cargar más» es un ida y vuelta al servidor** que vuelve a leer toda la
  ventana, no solo la semana nueva.
- **La ventana no tiene tope.** El límite es la historia propia de la persona:
  `getTrackerState` lee solo sus entradas, y un `desde` anterior a la creación
  del workspace se recorta. El costo es por render, y se paga también en cada
  refresco de P-11 —cada 60 segundos con la pestaña visible—, que vuelve a leer
  la ventana entera que la URL tenga. Con las entradas de una persona —unas
  pocas por día— no pesa. **El umbral que obliga a paginar dentro de la
  ventana** está fijado en el contrato del slice 5 (§8); al pasarlo se pagina
  dentro de la misma ventana sin cambiar esta decisión.
- **P-15 dibuja la página dos veces**: una con la respuesta de la action, que
  trae el árbol revalidado con la ventana de antes, y otra con el `replace` a
  la ventana extendida. Es un ida y vuelta más, solo en las mutaciones que
  devuelven una entrada anterior al piso sin el timer.
- **El servidor da dos pisos.** `windowFrom` es el de la ventana que se dibuja,
  con el timer incluido; `reachFrom` es el mismo cálculo sin el timer, y es
  contra el que compara el cliente. Coinciden salvo cuando el timer activo
  empezó antes que todo lo demás.
- **La URL lleva estado de navegación**, que se puede compartir y guardar. Un
  `desde` inválido se ignora, uno anterior a la creación del workspace se
  recorta, y uno posterior a la ventana por omisión no la achica.
- **El cliente decide cuándo navegar después de una mutación**, con una sola
  regla para todas: compara la semana de cada entrada devuelta con
  `reachFrom`, dos claves de día que le da el servidor. No hace aritmética de
  fechas.
- Las mutaciones de los slices 2 y 3 dejan de calcular `outsideWindow` contra la
  ventana: la semana de la entrada viaja en su vista y no depende de la
  ventana.
