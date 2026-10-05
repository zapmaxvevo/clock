# 0015. El tema se resuelve en el servidor, y «seguir al sistema» en la hoja de estilos

Fecha: 2026-10-04. Estado: aceptado (2026-10-05, por el team-lead con la delegación del
usuario).
Origen: contrato del slice 7b
([`fase1-slice7b-perfil-nombre-y-tema.md`](../slices/fase1-slice7b-perfil-nombre-y-tema.md)),
que suma el tema al perfil (PF-23, PF-24 de [`perfil.md`](../parity/perfil.md)).

## Contexto

El tema tiene tres valores —claro, oscuro y seguir al sistema, que es el
predeterminado (PF-23, P-03, P-04)— y tiene que estar aplicado **antes del
primer dibujo** y cambiar **sin recargar** (PF-24). La hoja de estilos ya trae
la variante oscura: `.dark` con sus variables (`src/app/globals.css:93-128`) y
la variante `dark:` de Tailwind atada a esa clase (`globals.css:5`), que usan
los componentes de `components/ui`. Falta quién la encienda.

Lo que la decisión tiene que respetar:

- **El tema es de la cuenta.** En Clockify vive en el perfil (§1 de
  `perfil.md`), las preferencias de la persona son de la cuenta y valen en
  cualquier dispositivo (PF-03), y el contrato del slice 7 ya le fijó al 7b una
  columna `theme` en `user_preference` (§2.4 de ese contrato).
- **La clase tiene que ir en `<html>`.** Los menús, los selectores y los
  diálogos de Base UI se dibujan en un portal colgado de `<body>`: una clase en
  un contenedor del shell dejaría claros los emergentes y el fondo del cuerpo.
  `<html>` lo dibuja el layout raíz, `src/app/layout.tsx`, que hoy no lee la
  sesión.
- **Todas las pantallas ya son dinámicas.** El shell lee la sesión en cada
  pedido (`src/app/(app)/layout.tsx:8`) y `/login` también
  (`src/app/login/page.tsx:7`). No hay ninguna página estática que proteger.
- **La CSP admite `unsafe-inline` en `script-src` solo hasta que exista el
  nonce** (`next.config.ts:4-10`, ADR 0002). Un script en línea nuevo es una
  pieza más que mover el día que se saque.
- **El servidor no conoce la preferencia del sistema.** Solo el navegador sabe
  si el sistema está en oscuro, y la puede cambiar en cualquier momento (un
  cambio automático al atardecer, por ejemplo).
- **La sesión se lee hoy dos veces por pantalla**, en el layout y en la página,
  y el slice 7 dejó anotado como deuda envolver `currentSession` en `cache` de
  React si hacía falta.

## Opciones

**Dónde vive:**

- a. **En `user_preference.theme`**, de la cuenta, como el resto del perfil.
- b. **En una cookie del navegador**, como el modo del rastreador (TT-16,
  `src/modules/time-entry/components/tracker-mode.ts:1-6`).
- c. **En la base, con una copia en una cookie** que el layout raíz lee sin
  consultar nada.

**Cómo se aplica:**

- i. **El servidor dibuja la clase en `<html>`**: `dark` para oscuro, `light`
  para claro y ninguna para seguir al sistema. Seguir al sistema lo resuelve la
  hoja de estilos con `prefers-color-scheme`.
- ii. **Un script en línea en `<head>`** que lee la cookie o `localStorage` y
  pone la clase antes de pintar, como propone la guía de Next
  (`node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md`).
- iii. **Un efecto del cliente** después de hidratar.
- iv. **La pista del cliente `Sec-CH-Prefers-Color-Scheme`**, para que el
  servidor sepa también la preferencia del sistema.

**Cómo llega el valor a `<html>`:**

- α. **El layout raíz lee la sesión** con `currentSession`, envuelta en `cache`
  de React para que el layout raíz, el del shell y la página compartan una sola
  lectura por pedido.
- β. **Varios layouts raíz**: el shell `(app)` dibuja su propio `<html>` con la
  sesión que ya lee, y `/login` el suyo.

## Decisión

La a, con la i y la α.

- **`user_preference.theme`** guarda `system`, `light` o `dark`; nulo es «sin
  elegir» y vale `system`, como el resto de las columnas del perfil.
- **El layout raíz** llama a `currentSession()` y pone en `<html>` la clase que
  devuelve `themeClassOf` del módulo `profile`: `dark`, `light` o ninguna. Sin
  sesión no hay clase.
- **`currentSession` pasa a estar envuelta en `cache`** de React.
- **La hoja de estilos escribe una sola vez los valores oscuros**, y los
  selecciona la clase `dark` o, sin clase `light`, `prefers-color-scheme: dark`.
  La variante `dark:` de Tailwind sigue la misma regla. `color-scheme` acompaña
  a cada variante, para que las barras de desplazamiento y los controles nativos
  también cambien.
- **No hay script**: ni en línea ni en un efecto.

## Por qué

- **Contra la b, la paridad y lo ya decidido.** El modo del rastreador quedó en
  una cookie porque es cómo se carga en ese navegador; el tema es un ajuste del
  perfil en Clockify y PF-03 lo hace de la cuenta. Con una cookie, la pantalla de
  perfil mostraría un valor que no es del perfil, y otro dispositivo de la misma
  persona vería otro tema.
- **Contra la c, las dos fuentes.** Una copia en una cookie necesita una regla
  de quién gana cuando la persona cambia el tema desde otro dispositivo, y un
  lugar que vuelva a escribir la copia. Ahorraría una lectura que `cache` ya
  absorbe.
- **Contra la ii, que resuelve un problema que no tenemos.** La guía de Next lo
  propone para páginas estáticas, que no conocen al usuario. Las nuestras ya
  tienen el valor en el servidor. Además suma un script en línea a la CSP que se
  quiere cerrar, y en desarrollo el modo estricto de React borra los atributos
  que el script puso en `<html>` (la misma guía, línea 484), así que pide un
  efecto más para reponerlos.
- **Contra la iii, el destello** que PF-24 prohíbe.
- **Contra la iv, el alcance.** Solo la implementan los navegadores basados en
  Chromium, y la primera respuesta llega sin ella porque el servidor tiene que
  pedirla antes. La media query resuelve seguir al sistema sin que el servidor
  sepa nada, y además sigue el cambio del sistema en vivo, sin recargar.
- **Contra la β, el costo de partir el documento.** Sin un layout raíz común,
  la página 404 de las rutas que no existen necesita `global-not-found`, que en
  esta versión es experimental
  (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md:47-57`),
  y las fuentes y la hoja de estilos se repiten en cada raíz. Lo único que gana
  es no leer la sesión en el layout raíz, que con `cache` no cuesta una lectura
  más.

## Consecuencias

- **Una sola lectura de la sesión por pedido, y no tres.** Con `cache`, el
  layout raíz, el del shell y la página comparten la misma `currentSession`. Hoy
  son dos lecturas por pantalla; con este ADR, una. La deuda que dejó el slice 7
  queda pagada.
- **Las actions no usan esa memoria.** `cache` solo memoriza dentro de una
  pasada de render, y una server action corre fuera de ella: la action lee la
  sesión de nuevo y el render que sigue a la revalidación arranca con una
  memoria limpia, con lo que la action acaba de escribir. Los recorridos de e2e
  que cambian una preferencia y la ven aplicada sin recargar son los que lo
  sostienen.
- **El layout raíz depende de la base.** Si la sesión no se puede leer, no se
  dibuja ninguna pantalla, `/login` incluida. Ya pasaba: `/login` lee la sesión
  para saber si redirigir, y no hay `global-error`.
- **Seguir al sistema cambia en vivo**, sin pedido y sin recargar, cuando cambia
  el sistema.
- **El tema elegido se ve después de la respuesta del servidor**, cuando la
  revalidación trae `<html>` con la clase nueva. El selector muestra el valor
  nuevo al instante, como los otros controles del perfil; la pantalla cambia de
  colores con la respuesta.
- **Sin sesión, la pantalla sigue al sistema.** Es el caso de `/login` y de lo
  que se dibuje antes de entrar.
- **Una pantalla estática** no podría tener tema propio sin volver a esta
  decisión. Hoy no existe ninguna, y todas están detrás del login.
- **Cuando se saque `unsafe-inline` de la CSP**, el tema no tiene nada que
  mover.
