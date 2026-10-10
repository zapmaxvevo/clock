# R10b: texto de paridad pendiente de aplicar

Entregado por `parity-reviewer` el 2026-10-09 (~22:36), veredicto **aprobado**. El team-lead lo aplica en `docs/parity/reportes.md` antes del merge y borra este archivo.

## Informe

Paridad de R10b (`nucleo/r10b`, `75e816e`; HEAD `8cef653` solo suma docs): **aprobado**. Ningún hallazgo contra el código. Hay uno de la especificación, que corrige el texto de abajo.

Cómo lo verifiqué: base `clock_r10b_parity` migrada, `next dev` en el puerto 3417 con el entorno de `playwright.config.ts` y la sesión de prueba, y recorridos con Playwright (scripts en el scratchpad, sin tocar `e2e/`). Al terminar bajé el servidor y borré la base. En el árbol hay cambios sin commitear de otros agentes; en `service.ts` es solo `limit?: number` → `limit: number`, que no cambia el comportamiento. No edité ni commiteé nada.

## Hallazgos

**P1 (menor, de la especificación): `reportes.md` §11.4, corrección de R3b, punto «El primer nivel no tiene tope y se muestra siempre entero…».** D-R10-10 lo deja falso: con 3001 descripciones, el primer nivel no se muestra y en su lugar aparece la fila de `firstLevelLimit`. Corrección: el bloque 8 de abajo.

**Las dos notas de las otras revisiones van como divergencia, no como hallazgo:**
- **«… …», el corte justo después de un espacio:** se ve «yyyy …». Es exactamente D-R10-9: `left(texto, 100)` más «…». Va en la 13.4.
- **Persona → Descripción, un mes de todo el equipo:** con el volumen sintético son 4254 filas en el nivel 2, contra un presupuesto de 2971. Se ve solo el nivel de personas, con la línea del tope de R3b. Lo reproduje con 3001 entradas: Persona → Descripción, Proyecto → Descripción y Etiqueta → Descripción muestran la línea y ningún botón. Es la regla de R3b y no está mal. Va en la 13.4. Sugiero contárselo al usuario junto a la nota 3 de §10, que hoy solo dice que «un mes del equipo sí entra».

**Una divergencia más, encontrada en el recorrido:** hay variantes de un texto que son filas distintas y se ven iguales. Por ejemplo, «Reunión X» con un espacio final, o en NFD, se ve igual que «Reunión X»; y «Reunión  semanal X» con dos espacios se ve igual que la de uno, porque el HTML junta los espacios. Lo confirmé en la captura a 320 px: hay tres «Reunión 0f3754» con 1:30, 0:15 y 0:14. Cumple D-R10-8; va en la 13.4.

## Lo que verifiqué y quedó bien

- **Por descripción:** 18 textos en orden de duración. «Reunión»/«reunión», doble espacio, espacio final y NFD dan una fila cada uno.
- **«Sin descripción»:** va en gris (`text-muted-foreground`, lab 48 contra 2,7) y después de «Empate» con la misma duración. El empate entre textos sigue `compareNames`: «alfa» antes que «Beta».
- **Recorte a 100 caracteres:** el texto de 150 se ve con 100 caracteres y «…». Los dos que comparten los 100 primeros dan dos filas iguales. Con 100 emojis no hay «…»; con 101 se ven 100 y «…».
- **Texto como texto:** `<b>…</b> & "…"` se ve literal, sin un `<b>` en el DOM, y `C:\temp\n` sale bien.
- **Subniveles:** Descripción → Persona da Ana 1:00 y Beto 0:30. Persona → Descripción y los filtros de P2 y `sin-proyecto` también están bien. El intercambio en «Agrupar por» funciona, los nueve enlaces van en orden con `aria-current`, el segundo nivel tiene «Descripción» al final, y Enter abre la fila con `aria-expanded`.
- **Validación de la URL:** se descartan `descripci%C3%B3n`, `Descripcion`, `descripciones`, `description` y el `agrupar` repetido, y la vista queda por persona. También se descarta `subagrupar=descripcion` con `agrupar=descripcion`, y `subagrupar=Descripcion`. `agrupar=Proyecto&subagrupar=descripcion` da Persona / Descripción, y `subagrupar=descripcion` sin `agrupar`, también.
- **Member con `personas=<id ajeno>` armado a mano:** probé las tres combinaciones. Ve solo lo suyo, con «Ves solo tus horas.» y sin el botón «Personas». Ni el DOM ni el HTML crudo traen el texto ni el nombre ajenos.
- **Primer nivel que no entra:** aparece la fila de `firstLevelLimit` y el encabezado dice solo «Descripción», también con `subagrupar=proyecto,persona`. Los botones de los subniveles siguen diciendo lo pedido. El total es 50:01 y el facturable 0:00. No aparecen ni el vacío ni la línea de R3b. Con `proyectos=sin-proyecto` sale la misma fila, no el segundo vacío. Con un proyecto sin horas sale el segundo vacío. Por persona y por proyecto, el total es 50:01.
- **320 y 375 px:** `main` y la tabla miden 320/320 y 270/270 a 320 px, y 375/375 y 325/325 a 375 px. Los textos se recortan con `truncate`, «Agrupar por» ocupa tres renglones y la fila del tope ocupa tres líneas (109 px). El documento mide 531 px de ancho por la navegación del shell, una deuda ya anotada. El único error de consola es el `eval()` de dev, que es F2 y viene de antes.

## Textos para pegar en `docs/parity/reportes.md`

Te los mando en un mensaje aparte, en 10 bloques, cada uno con dónde va.

## Textos

Los textos de R10b para pegar en `docs/parity/reportes.md`, en 10 bloques. Encima de cada bloque dice dónde va. Los bloques 1, 2, 4, 5 y 6 son los que pediste; el 3 (RP-18), el 7 (RP-33), el 8 (§11.4) y el 9 (P-05) son agregados, porque lo que dicen hoy queda viejo con D-R10-10. Si preferís no tocarlos, sacá sus nombres de la nota de cabecera.

**Bloque 1, la nota de cabecera.** Va después del párrafo «_Actualizado el 2026-10-09, contrato de R10, parte A…» (termina en la línea 116) y antes de «## Fuentes y límites del relevamiento».

```markdown
_Actualizado el 2026-10-09, R10b, la parte B del mismo contrato (§7
«parity-analyst»)_: describe lo que hace el código de la rama `nucleo/r10b`,
recorrido con la aplicación: agrupar por descripción y el tope de 3000 filas
en el primer nivel. Cada regla que precisa lleva su corrección fechada; la
sección 13 suma lo de la parte B (secciones 13.6 a 13.9) y la 13.4, sus
divergencias, y la 11.4 corrige lo que decía del primer nivel. Cambian RP-11,
RP-12, RP-18, RP-28, RP-32, RP-33, P-05 y las secciones 11.4 y 13. No hay
citas nuevas de Clockify: «Description» es un ítem de la lista de «Group by»
del relevamiento de R3b, y esta revisión no volvió a buscar en las páginas del
resumido ni de filtros, así que si Clockify distingue mayúsculas al agrupar
por descripción, cómo recorta un texto largo y cómo rotula el grupo sin
descripción siguen _no verificados_.
```

**Bloque 2, RP-11.** Va al final de RP-11, después del párrafo «_Actualizado el 2026-10-09, R10a (D-R10-5, D-R10-6)_…», que termina en «La descripción llega con R10b.» (línea 394), y antes de «**RP-12 Subagrupación encadenada**».

```markdown
_Actualizado el 2026-10-09, R10b (D-R10-5, D-R10-8, D-R10-9, D-R10-10)_: nueve
dimensiones. «Agrupar por» suma «Descripción» al final, después de «Mes», y el
elegido queda marcado. En la URL, `agrupar=…|descripcion`, en ASCII y sin
tilde. `descripción` con tilde, `Descripcion`, `descripciones` o `description`
se descartan y la vista queda por persona (RP-32). **La descripción entra por
la lista documentada de la página de filtros** («Description», corrección de
R3b, arriba) y por la decisión del usuario sobre P-11.

- **La clave es el texto exacto, tal como se guardó**: «Reunión» y «reunión»
  son dos grupos, y también «Reunión semanal» con dos espacios en el medio y
  una «é» escrita con dos puntos de código. La cadena vacía es «Sin
  descripción» (RP-28). Justificación: juntar mayúsculas o espacios en la base
  depende de la colación de cada base y obliga a elegir qué texto muestra el
  grupo; el usuario lo aceptó así el 2026-10-09 (pregunta 2 de §10 del
  contrato).
- **Cada fila muestra los primeros 100 caracteres** del texto, contados como
  puntos de código (un emoji es uno), con «…» si sigue. El texto entero no se
  ve en el reporte. Justificación: una descripción llega a 3000 caracteres y
  un nivel, a 3000 grupos.
- **El tope de 3000 filas alcanza al primer nivel**, de cualquier dimensión:
  entra entero o no se muestra (sección 13.7). Solo la descripción lo pasa en
  la práctica: «Descripción» de todo el equipo en un año no se muestra, y un
  mes sí. Para las otras ocho no cambia nada visible.

Si Clockify distingue mayúsculas y cómo recorta el texto siguen _no
verificados_ (P-05).
```

**Bloque 3, RP-18 (agregado).** Va al final de RP-18, después de la corrección de R3b que termina en «…y P2 0:45.» (línea 606), y antes de «**RP-19 Formato de duración**».

```markdown
_Actualizado el 2026-10-09, R10b (D-R10-10)_: **con el primer nivel que no
entra, «Total» y «Facturable» se leen aparte**, de las entradas, como por
etiqueta, en la misma foto: son los reales aunque la tabla no muestre ninguna
fila. Por descripción cada entrada está en exactamente un grupo, así que con
el primer nivel a la vista el total es la suma de las filas, como en R2a.
```

**Bloque 4, RP-12.** Va al final de RP-12, después del párrafo «_Actualizado el 2026-10-09, R10a (D-R10-3, D-R10-5, D-R10-6)_…», que termina en «(P-05).» (línea 478), y antes de «**RP-13 Expandir un grupo**».

```markdown
_Actualizado el 2026-10-09, R10b (D-R10-6, D-R10-10)_: **por descripción, el
orden de R2a**: duración descendente; en el empate, `compareNames` sobre el
texto que se muestra, sin distinguir mayúsculas («alfa» antes que «Beta»), y
entre dos que muestran el mismo texto recortado, por su clave. «Sin
descripción» va después de las descripciones de su misma duración. La
descripción se combina con las otras ocho en cualquiera de los tres niveles,
sin repetir: debajo de una descripción, sus personas o sus proyectos; debajo
de una persona, sus textos. El intercambio de «Agrupar por» vale igual: desde
Persona → Descripción, «Descripción» da Descripción → Persona. **El tope del
primer nivel cambia D-R3-6**: el primer nivel también entra entero o no entra
(sección 13.7). _No verificado_: el orden de Clockify por descripción (P-05).
```

**Bloque 5, RP-28.** Va al final de RP-28, después de «_No verificado_: el rótulo de Clockify; «Without task»… (NOT FOUND el 2026-10-09).» (línea 909), y antes de «**RP-29 …**».

```markdown
_Actualizado el 2026-10-09, R10b (D-R10-8)_: agrupando por descripción,
**«Sin descripción» es una sola fila con las entradas cuya descripción es la
cadena vacía**, la única forma de «sin descripción»: la aplicación guarda la
descripción sin espacios en los bordes. Va en gris, con el rótulo del
rastreador (TT-50), y con la misma duración va después de las descripciones
(RP-12). Una entrada con texto, aunque sea de un carácter, nunca está ahí. _No
verificado_: el rótulo de Clockify (P-05).
```

**Bloque 6, RP-32.** Va al final de RP-32, después del párrafo «_Actualizado el 2026-10-09, R10a_: `agrupar=semana|mes`…», que termina en «…los conserva.» (línea 1096), y antes de «**RP-33 Vacíos**».

```markdown
_Actualizado el 2026-10-09, R10b_: `agrupar=descripcion` y `descripcion` en
`subagrupar` se validan como los otros valores (RP-11): con tilde
(`descripci%C3%B3n`), con mayúscula, en plural o en inglés se descartan;
`subagrupar=descripcion` con `agrupar=descripcion` se descarta entero, y
`agrupar=Proyecto&subagrupar=descripcion` da Persona → Descripción. Todo
enlace del reporte la conserva. **Ningún parámetro lleva el texto de una
descripción ni su clave**: lo abierto sigue sin ir en la URL, y filtrar por
descripción es de la fase 3 (RP-25). **Un member, un `project_manager` o un
`team_manager` con `agrupar=descripcion` y `personas=…` armados a mano** ve
solo sus textos en todos los niveles, con «Ves solo tus horas.» y sin el
botón «Personas»; la página no trae ningún texto ni nombre ajeno.
```

**Bloque 7, RP-33 (agregado).** Va al final de RP-33, después del párrafo «_Actualizado el 2026-10-09, contrato de R4, parte A (D-R4-7; R4a)_…», que termina en «…el vacío es el primero.» (línea 1117), y antes de «**RP-34 Errores de validación**».

```markdown
_Actualizado el 2026-10-09, R10b (D-R10-10)_: **con el primer nivel que no
entra no hay vacío**: hay horas que no se muestran. La tabla dice «El primer
nivel pasa de 3000 filas y no se muestra. Acortá el período, filtrá o agrupá
por otra cosa.», también con filtros, y sin «Quitar filtros». Un filtro que
deja el primer nivel dentro del tope lo muestra, y uno que no deja nada da el
segundo vacío.
```

**Bloque 8, §11.4 (agregado, corrige P1).** Va al final de la lista «_Actualizado el 2026-10-09, R3b_:» de la sección 11.4, después del punto «**«Ninguno» y el intercambio**…» (línea 1825), y antes de «### 11.5 R3b: la barra».

```markdown
_Corregido el 2026-10-09, R10b (D-R10-10)_: el punto «El primer nivel no tiene
tope» dejó de valer. **El primer nivel también entra entero o no entra**: si
pasa de 3000 filas no se muestra ningún nivel, y la tabla lo dice en lugar de
las filas (sección 13.7). La línea del tope de arriba queda para cuando el
primer nivel entra y uno de abajo no. Con las ocho dimensiones de R3 a R10a no
se ve: ninguna pasa de 3000 en el primer nivel en un período de hasta 366
días.
```

**Bloque 9, P-05 (agregado).** Va en la sección 7, después del párrafo «_Actualizado el 2026-10-09, R10a_: P-05 suma cómo rotula Clockify una semana…», que termina en «No bloquea.» (línea 1477), y antes de «_Agregado el 2026-10-09, relevamiento de R3b_: **P-11**…».

```markdown
_Actualizado el 2026-10-09, R10b_: P-05 suma si «Description» distingue
mayúsculas y espacios, cómo recorta Clockify un texto largo, cómo rotula el
grupo sin descripción, en qué orden pone las descripciones y si el resumido
tiene un tope de filas en el primer nivel. Mientras tanto vale lo de R10b
(secciones 13.6 a 13.9). No bloquea.
```

**Bloque 10, la sección 13.** Tiene cuatro partes.

**10a.** Va después del párrafo «**Queda para después:** agrupar por descripción…», que termina en «…las semanas o los meses sin horas.» (línea 2093), y antes de «### 13.1 La barra».

```markdown
_Actualizado el 2026-10-09, R10b_: la parte B quedó en la rama `nucleo/r10b`,
con este mismo contrato. Las secciones 13.6 a 13.9 juntan su pantalla y la
13.4 suma sus divergencias. **Cubre:** RP-11 (descripción, nueve dimensiones,
y el tope en el primer nivel), RP-12 (el orden por descripción y sus
combinaciones), RP-18 (el total con el primer nivel cortado), RP-28 («Sin
descripción»), RP-32 (`descripcion` en `agrupar` y `subagrupar`) y RP-33 (sin
vacío con el primer nivel cortado). Los permisos y el alcance no cambian: no
hay acción nueva. **Es la primera pantalla que muestra texto escrito por otra
persona**: solo owner y admin ven los textos ajenos (`timeEntry.others.view`);
un member, un `project_manager` o un `team_manager` ve solo los suyos en cada
nivel, también con el enlace de un admin que trae `personas`, y la página no
trae ningún texto ajeno. El texto se muestra como texto, nunca como HTML. El
largo, la clave del grupo y el tope los fija el servidor; de la URL solo
llegan los valores de `agrupar` y `subagrupar`. **Queda para después:**
filtrar por descripción y «Sin descripción» como filtro (RP-25 y RP-26 en el
resto, fase 3); qué exportan R6 y R7 cuando el primer nivel no entra; gráfico
(R5); personas sin horas (R9). No tienen slice: el texto entero de una
descripción en el reporte (un tooltip o un detalle) y juntar las variantes de
un texto.
```

**10b.** Va al final de la 13.4, después del punto «**Dos personas que comparan semanas**…» (línea 2185), y antes de «### 13.5 Qué puede hacer cada rol».

```markdown
_Actualizado el 2026-10-09, R10b_:

- **«Reunión» y «reunión» son dos filas**, y también «Reunión semanal» con dos
  espacios en el medio (D-R10-8). Lo de Clockify, _no verificado_ (P-05).
- **Dos variantes de un texto pueden verse iguales y ser dos filas**: «Reunión
  semanal» con dos espacios se ve como la de uno, porque la pantalla junta los
  espacios; «Reunión» con un espacio al final, o con la «é» en dos puntos de
  código, se ve como «Reunión». Cada una lleva su duración y se abre por
  separado. Como dos personas con el mismo nombre (RP-31), la fila no dice cuál
  es cuál. El rastreador permite el doble espacio; el espacio de borde solo
  llega con SQL escrito a mano, porque la aplicación recorta.
- **100 caracteres y «…», sin el texto entero**: no hay tooltip; se lee en el
  rastreador o en la planilla. Un emoji cuenta como un carácter. **Si el corte
  cae justo después de un espacio, la fila termina en «palabra …»**, con un
  espacio antes de «…»: es el texto guardado, recortado (D-R10-9). Dos textos
  que comparten los 100 primeros caracteres son dos filas con el mismo texto,
  cada una con su duración.
- **En pantallas angostas la columna corta antes**, con el «…» del navegador:
  a 320 y 375 px, dos textos que empiezan igual pueden verse iguales. La tabla
  no se ensancha.
- **El primer nivel que no entra no se muestra entero ni en parte**: con más de
  3000 descripciones no se ve ninguna fila ni los niveles de abajo, solo los
  totales y la fila que lo dice (D-R10-10). No hay «Otras descripciones» ni las
  primeras por duración.
- **Persona → Descripción de un mes de todo el equipo puede mostrar solo las
  personas**: el segundo nivel cuenta cada texto de cada persona, y con el
  volumen de §6 del contrato son unas 4250 filas, más que las que le deja el
  tope; se ve la línea del tope de R3b (sección 11.4). «Descripción» sola en
  ese mes sí entra (unas 1180). Para ver los textos, acortar el período o
  elegir personas.
- **«Descripción» va al final de «Agrupar por»**, después de «Mes»; el orden
  de Clockify en pantalla está _no verificado_ (P-05).
```

**10c.** Va al final de la sección 13, después de la tabla de la 13.5.

```markdown
### 13.6 R10b: la barra

- **«Agrupar por»** con nueve enlaces, en este orden: «Persona», «Proyecto»,
  «Cliente», «Tarea», «Etiqueta», «Fecha», «Semana», «Mes» y «Descripción». El
  elegido lleva `aria-current`; todos conservan el rango, los subniveles y los
  filtros (RP-11, RP-32). A 320 y 375 px el grupo se parte en tres renglones,
  sin ensanchar la página más allá de la navegación del shell.
- **«Segundo nivel» y «Tercer nivel»** ofrecen «Descripción» al final, salvo
  que ya esté arriba. Elegir en «Agrupar por» una dimensión que está en un
  subnivel las intercambia: desde Persona → Descripción, «Descripción» da
  Descripción → Persona (RP-12).
- **No hay filtro por descripción** (RP-25, fase 3).

### 13.7 R10b: la tabla

- **Columnas**: «Descripción» y «Duración»; con subniveles, «Descripción /
  Persona», «Persona / Descripción» y las demás combinaciones.
- **La fila de una descripción**: el texto tal como se guardó, hasta 100
  caracteres, con «…» si sigue, en un renglón; lo que no entra en la columna
  se corta con el «…» del navegador. Se muestra como texto: `<b>` y `&` se
  ven tal cual. El nombre del botón de expandir es el texto de la fila.
- **«Sin descripción»** en gris, como los otros «Sin …» (RP-28).
- **El orden**: duración descendente, empate por el texto sin distinguir
  mayúsculas y «Sin descripción» después de los de su misma duración (RP-12).
- **Los totales**: cada entrada está en exactamente una descripción, así que
  el total es la suma de las filas (RP-18).
- Con las entradas del recorrido 19 del contrato: «Reunión {sufijo}» 1:30,
  «reunión {sufijo}» 0:20, «Sin descripción» 0:15 y los 100 primeros
  caracteres del texto largo con «…» 0:10; total 2:15. Con «Proyecto» debajo,
  «Reunión {sufijo}» abre P1 1:00 y P2 0:30. Con el filtro de P2, «Reunión
  {sufijo}» 0:30 y el largo 0:10; total 0:40.
- **El primer nivel que no entra** (D-R10-10): si el primer nivel pasa de 3000
  filas, de cualquier dimensión, el encabezado nombra solo el primer nivel
  pedido («Descripción», también con `subagrupar=proyecto,persona`), y el
  cuerpo es una fila de dos columnas: «El primer nivel pasa de 3000 filas y no
  se muestra. Acortá el período, filtrá o agrupá por otra cosa.». Sin filas de
  grupos, sin la línea del tope de R3b y sin vacío. «Total» y «Facturable»,
  los reales (RP-18). Los botones de los subniveles siguen diciendo lo pedido.
  Con las 3001 entradas de un minuto del recorrido 20: total 50:01; por
  proyecto, «Sin proyecto» 50:01; Proyecto → Descripción, «Sin proyecto» sin
  botón y la línea del tope de R3b.

### 13.8 R10b: estados y casos borde

- **Vacío por descripción**: el de RP-33, con el encabezado de todos los
  niveles pedidos.
- **El primer nivel que no entra, con filtros**: la misma fila, no el segundo
  vacío (RP-33). Un filtro que no deja nada da el segundo vacío; uno que deja
  3000 o menos muestra las filas. Con exactamente 3000 el nivel entra.
- **Al recargar o con «Atrás»**: la misma URL y todo contraído (RP-13, RP-32).
  Un `agrupar` o un `subagrupar` con `descripción` o `Descripcion` se descarta
  sin aviso.
- **Dos textos que comparten los 100 primeros caracteres** son dos filas con
  el mismo texto y «…», cada una con lo suyo, que se abren por separado.
- **Etiqueta → Descripción** muestra la línea de la etiqueta y, si el segundo
  nivel no entra, también la del tope (RP-18).
- **Cargando, error de lectura y sin `report.view`**: como en la sección 9.3,
  con cualquier combinación de niveles.

### 13.9 R10b: qué puede hacer cada rol

| Membresía                                           | Ve                                                                                                                                       | Acciones                                                          |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `owner`, `admin` activas                            | Las descripciones de todas las personas del workspace con horas, en cada nivel, también las de las inactivas                            | Las de 13.5, con «Descripción» en «Agrupar por» y los subniveles |
| `project_manager`, `team_manager`, `member` activas | Solo sus descripciones, en cada nivel y en el total, también con el enlace de un admin con `agrupar=descripcion&personas=…`; ningún texto ajeno | Las mismas, sin filtro de personas                               |
| Cualquiera no activa (`inactive`, `invited`)        | El aviso de RP-07                                                                                                                        | Ninguna                                                           |
```

La tabla de la 13.9 queda con columnas desparejas; `npm run format` la alinea.
