# 0014. Los gestos del calendario son Pointer Events propios, solo con mouse

Fecha: 2026-10-04. Estado: aceptado (2026-10-04, por el team-lead con la delegación del
usuario).
Origen: contrato del slice 8b
([`fase1-slice8b-calendario-arrastre.md`](../slices/fase1-slice8b-calendario-arrastre.md)),
que suma mover, estirar y crear arrastrando sobre la grilla del calendario
(CAL-44, CAL-50 a CAL-63 de [`calendario.md`](../parity/calendario.md)).

## Contexto

El calendario ya escribe por clic y por teclado (slice 8c): un clic en una
franja abre el alta, un bloque es un botón que abre su diálogo, y «Agregar
entrada» crea sin puntero. El 8b suma los gestos de arrastre, que son atajos de
ese diálogo (CAL-74): no hay nada que un gesto haga y el diálogo no.

Lo que la decisión tiene que respetar:

- **El gesto termina en un trío de horas de pared** (ADR 0005, §19 de
  `calendario.md`): el día, el inicio y el fin ajustados al zoom, sin
  aritmética de instantes en el cliente. Lo que el trío no puede expresar, el
  gesto no lo ofrece (CAL-55, CAL-58).
- **La grilla es un contenedor desplazable** con encabezados y eje pegajosos
  (`calendar-grid.tsx:184-188`), columnas por día y franjas de 48 px. Un gesto
  que llegue al borde tiene que desplazarla.
- **El clic ya tiene dueño**: `slotAt` decide el alta de CAL-43
  (`calendar-layout.ts:157-168`) y el bloque abre su diálogo con `onClick`
  (`calendar-block.tsx:158`). Un gesto no puede romper ninguno de los dos.
- **La regla tiene que poder probarse sin navegador.** Los tests de unidad
  corren en Node, sin DOM (`vitest.config.ts:7`): lo que no sea una función pura
  solo lo prueba Playwright.
- **`npm audit` ya está rojo en `main`** (estado de la fase): cada dependencia
  nueva suma superficie a un problema abierto.
- **WCAG 2.2**: 2.5.7 pide un camino con un solo puntero y sin arrastre; 2.1.1,
  que todo se pueda hacer con teclado.

En pantallas táctiles, arrastrar un dedo sobre la grilla ya significa
desplazarla. Un gesto que use el mismo movimiento compite con el
desplazamiento: el navegador decide al apoyar el dedo, según `touch-action`, si
el movimiento es suyo o de la página.

## Opciones

**Mecanismo:**

1. **Una librería de arrastre** (`@dnd-kit/core`, `react-dnd`). Resuelven el
   ciclo del gesto, los sensores de entrada y el teclado. Están pensadas para
   llevar un elemento de un contenedor a otro: el ajuste a la franja, los topes
   de CAL-55 y CAL-56, el estiramiento y la selección de un rango se escriben
   igual, como modificadores.
2. **Pointer Events del navegador**, con captura del puntero sobre la grilla, y
   toda la decisión —de la posición del puntero al trío— en funciones puras.

**Entradas:**

- a. **Solo mouse.** Táctil y lápiz siguen con el toque, que abre el alta o el
  diálogo como hoy, y el desplazamiento nativo.
- b. **Mouse, lápiz y táctil, con `touch-action: none`** en los bloques. Un dedo
  sobre un bloque lo mueve y no desplaza la grilla; crear arrastrando con el
  dedo no se puede ofrecer, porque las franjas libres son la superficie del
  desplazamiento.
- c. **Táctil con pulsación larga**: el gesto empieza después de medio segundo
  quieto, y desde ahí el movimiento se le niega al desplazamiento.

**Teclado:**

- i. **Ningún gesto propio**: el bloque es un botón y su diálogo edita fecha,
  inicio y fin; «Agregar entrada» crea (CAL-74).
- ii. **Atajos sobre el bloque enfocado**, como `Alt` con las flechas, que
  mueven y estiran de a una franja.

## Decisión

La opción 2, con la entrada a y el teclado i.

- **Un gesto empieza con el botón principal del mouse** sobre el cuerpo de un
  bloque, sobre una de sus asas o sobre el fondo de una columna, y deja de ser
  un clic a los 4 px de recorrido. Recién ahí toma la captura del puntero, sobre
  el contenedor de la grilla, que no se desmonta durante el gesto.
- **Toda la regla es pura** (`calendar-gestures.ts`): del punto de la grilla al
  trío candidato, el ajuste, los topes, los minutos que no existen, qué gestos
  ofrece cada segmento y el desplazamiento automático. El hook que escucha los
  eventos solo traduce coordenadas y llama a esas funciones.
- **Táctil y lápiz no arrastran.** Un toque sigue siendo un clic, y deslizar
  desplaza la grilla. No hay `touch-action` propio.
- **No hay atajos de teclado para mover ni estirar.** Las asas no son controles
  ni están en el orden de `Tab`.

## Por qué

- **Contra la 1, el tamaño de lo que resuelve.** De una librería se usaría el
  ciclo del gesto, que con Pointer Events y la captura son pocas líneas, y se
  escribiría igual todo lo que es del dominio. Suma una dependencia y su
  auditoría, y el sensor de teclado que trae sería la opción ii, que no se
  elige. La regla queda en funciones puras con cualquiera de las dos, así que lo
  que la librería aporta no es lo difícil.
- **Contra la b, el desplazamiento.** En un teléfono la grilla mide más que la
  pantalla en los dos ejes, y los bloques ocupan buena parte de ella: con
  `touch-action: none` en los bloques, desplazarse depende de apoyar el dedo en
  un hueco. Crear arrastrando quedaría solo para el mouse igual.
- **Contra la c, el costo de verificarla.** Es la forma conocida de convivir con
  el desplazamiento, pero depende de cómo cada navegador móvil resuelve la
  pulsación larga (menú contextual, selección de texto, vibración), y Playwright
  no la reproduce con fidelidad: quedaría sin e2e. Se puede sumar después sin
  cambiar la regla, porque el hook es el único que mira el tipo de puntero.
- **Contra la ii, que no agrega un camino.** El diálogo ya es la alternativa sin
  arrastre de 2.5.7 —un clic en el bloque, el selector de fecha por clics y los
  campos de hora, que aceptan el teclado en pantalla— y la de teclado de 2.1.1,
  con el bloque como botón. Unos atajos propios serían una segunda forma de
  editar el horario, con su propia regla de topes y sus anuncios para el lector
  de pantalla, para algo que el diálogo hace con los campos de siempre.

## Consecuencias

- **El 8b no tiene dependencias nuevas.** El gesto vive en
  `use-calendar-gesture.ts` y su regla en `calendar-gestures.ts`, con tests de
  unidad; el recorrido entero, en Playwright con el mouse.
- **En pantallas táctiles el calendario se usa con toques**: el alta por la
  franja o por «Agregar entrada», y el horario por el diálogo. Es una
  divergencia si Clockify arrastra con el dedo, y queda en la lista de
  verificación (calendario P-07).
- **Un lápiz se comporta como el dedo.** Si hace falta, se suma `pen` a la
  condición de inicio, con el mismo cuidado por el desplazamiento.
- **Las asas no cuentan como objetivos de 2.5.8** (tamaño mínimo): la misma
  función está en el diálogo, que es la excepción «equivalente» del criterio.
- **Si el equipo quiere arrastrar con el dedo**, la opción c entra en un slice
  propio, que cambia el hook y la condición de inicio y suma su verificación en
  dispositivos reales. La regla pura no cambia.
