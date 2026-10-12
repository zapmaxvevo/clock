# Correcciones del contrato de R6 — primera pasada (2026-10-12)

Revisión de `architecture-reviewer` sobre
`docs/slices/nucleo-reportes-r6-exportar-csv-y-excel.md` (rama
`nucleo/r6-contrato`, commit `48af8a6`), contra el árbol de ese commit. Las
líneas citadas sin archivo son del contrato.

## Veredicto

**Cambios requeridos.** Sin bloqueantes; tres mayores (dos de R6a y uno de
R6b) y seis menores, todos resolubles en el texto del contrato.

## Decisiones del usuario

Comunicadas por el team-lead el 2026-10-12:

- **(a) `exceljs` se acepta** con la alerta de `uuid <11.1.1`
  (GHSA-w5hq-g745-h8pq), a confirmar por `security-auditor` en R6b. La opción
  (b) de §10, pregunta 1 (escritor propio), queda descartada, y la (c) también.
- **(b) Las exportaciones no van al `audit_log`.**

Con estas respuestas, R6a no depende de nada pendiente del usuario y R6b queda
desbloqueada, sujeta a la confirmación de `security-auditor`. Los hallazgos 3 y
8 ya están ajustados a ellas.

## Hallazgos

### Mayores

**1. Las firmas de bytes no compilan donde se usan.**

- **Dónde:** `:853` (`csvBytesOf`), `:888-893` (`exportBodyOf`), `:916`
  (`write` de `EXPORT_WRITERS`) y `:935` (`xlsxBytesOf`).
- **Regla:** la firma publicada tiene que compilar donde se usa, y es la que
  usan `frontend-dev` y `test-engineer`.
- **Qué pasa:** `Uint8Array` a secas es `Uint8Array<ArrayBufferLike>`. Lo probé
  con TypeScript 5.9.3 y la `lib` del `tsconfig.json` (`dom`, `dom.iterable`,
  `esnext`): `new Response(x)` con ese tipo da TS2345 («Argument of type
  'Uint8Array<ArrayBufferLike>' is not assignable to parameter of type
  'BodyInit | null | undefined'»). Con `Uint8Array<ArrayBuffer>` compila, y
  `TextEncoder.encode` ya devuelve ese tipo; es la anotación de retorno la que
  lo ensancha. Así como está, quien implemente tiene que meter un `as` o cambiar
  por su cuenta una firma publicada.
- **Cambio:** declarar `Uint8Array<ArrayBuffer>` en las cuatro firmas y en
  `ExportWriter` (hallazgo 6). La conversión del `Buffer` de `exceljs`
  (`writeBuffer(): Promise<Buffer>`, `node_modules/exceljs/index.d.ts:1495`), si
  hace falta, va dentro de `xlsx.ts`.

**2. Redondear «Horas» rompe el invariante que el contrato afirma.**

- **Dónde:** D-R6-6 `:250-253`; D-R6-9 `:327-334`; §4.2 `:634-640`; criterio 1
  `:1307-1310`; §8.1, fila 1 `:1458`; §9 `:1575-1576`.
- **Regla:** coherencia interna del contrato y D-R2a-7 (la suma de las filas
  queda en el total o por debajo).
- **Qué pasa:** D-R6-6 dice que la suma de una columna «queda en o debajo del
  total». Para «Duración» es cierto (minutos truncados), pero «Horas» redondea
  al centésimo (`formatDecimalHours`). Ejemplo: tres entradas de 1 minuto dan
  «0,02» cada una, que suman 0,06, mientras el total de 3 minutos dice «0,05».
  La suma queda **arriba** del total, cosa que la pantalla nunca hace. Lo mismo
  pasa entre los hijos y su grupo en el resumen. §9 solo prevé que quede debajo,
  y `parity-analyst` copiaría la afirmación a RP-18. En el `.xlsx` de R6b no
  pasa (minutos / 60 sin redondear).
- **Cambio:** elegir una de dos y escribirla.
  - **(A, recomendada):** truncar al centésimo, `Math.floor(minutes * 5 / 3)`,
    coherente con el truncado al minuto. El criterio 1 pasa a 1 → «0,01» y
    2 → «0,03»; 0, 30, 89, 90, 1439, 120 000 y −5 no cambian. El mutante de
    §8.1 pasa a ser «`round` en lugar de truncar (cae con 1)». El comentario de
    §4.2 deja de hablar de «,5».
  - **(B):** mantener el redondeo y corregir D-R6-6 y §9: en el CSV, la columna
    «Horas» puede sumar hasta 0,01 por fila por encima del total. Así lo copia
    `parity-analyst`.

**3. (R6b) La regla de ESLint de `exceljs` choca con los tests que leen el
archivo.**

- **Dónde:** D-R6-12 `:416-421`; §4.9; criterio 16 `:1437-1443`; criterio 19
  `:1447-1448`; recorrido 25 `:1531-1536`; §7, R6b `:1241` (`readXlsx`).
- **Regla:** los criterios de aceptación no pueden contradecirse.
- **Qué pasa:** la regla permite importar `exceljs` solo en
  `report/export/xlsx.ts`, y el criterio 19 exige que `npm run lint` falle con
  cualquier otro import. Pero `xlsx.test.ts` (criterio 16) y `readXlsx` en
  `e2e/reports-page.ts` (recorrido 25) leen el archivo con la biblioteca, y con
  esa regla `lint` falla en los dos. Con la decisión (a) del usuario, `exceljs`
  queda en `dependencies` y los tests tienen lector; la contradicción de la
  regla sigue.
- **Cambio:** que la excepción de `no-restricted-imports` cubra
  `src/modules/report/export/xlsx.ts`, `**/*.test.ts` y `e2e/**`, y que el
  criterio 19 lo diga (falla con un import en otro archivo de producción del
  módulo, no en un test). D-R6-12 suma que los tests, y solo ellos, usan las
  funciones de lectura (`xlsx.load`) sobre archivos que escribió el propio
  test. Las ramas «si no se acepta» y «con la alternativa» (`:420-421`, `:954`,
  §7 R6b `:1237`) se borran.

### Menores

**4. `reportEntryRow` no está exportado en el fragmento.**

- **Dónde:** `:598` frente a `:628` y al criterio 2 (`:1311-1315`).
- **Qué pasa:** el fragmento dice `const reportEntryRow`; el texto y el
  criterio 2 piden que se exporte.
- **Cambio:** `export const reportEntryRow`.

**5. El texto sobre `workspace_id` en las uniones de `entryList` es inexacto.**

- **Dónde:** §4.3 `:690-699`.
- **Regla:** toda tabla de negocio lleva `workspace_id`, y el aislamiento tiene
  que quedar dicho con precisión; las tablas de la cuenta son la excepción
  (`.claude/skills/code-conventions/SKILL.md`, «Capas»).
- **Qué pasa:** el texto pone `user` y `user_preference` entre las uniones «con
  el `workspace_id` en la condición». Ninguna de las dos tiene esa columna
  (`src/server/db/schema.ts:134-176`): son de la cuenta y se unen por
  `user_id`, como en `src/modules/report/repository.ts:368-369`. La condición de
  workspace de la subconsulta de etiquetas queda implícita en «como
  `entryTags`».
- **Cambio:** corregir la lista: `membership` (por `workspace_id` y
  `user_id`), proyecto, cliente y tarea por `workspace_id` e id; `user` y
  `user_preference` por `user_id`. Escribir que la subconsulta lleva
  `tag.workspace_id = time_entry_tag.workspace_id` y
  `time_entry_tag.workspace_id = time_entry.workspace_id`, como `entryTags`
  (`src/modules/time-entry/repository.ts:188-193`), y que el mutante «sin la
  condición de workspace de la subconsulta» cae en el criterio 6 con una
  etiqueta de B sobre una entrada de A sembrada a mano.

**6. `ExportWriter` se usa pero no se define.**

- **Dónde:** §4.8 `:913-918`.
- **Cambio:** definirlo en `export/types.ts` o en `handler.ts`:
  `type ExportWriter = { readonly contentType: string; readonly write: (document: ExportDocument) => Promise<Uint8Array<ArrayBuffer>> }`.

**7. Faltan detalles de forma en la cabecera.**

- **Dónde:** D-R6-8 `:295-301`; §4.6 `:820-822`.
- **Qué pasa:** no se dice si «Personas», «Clientes» y «Proyectos» van en una
  celda o en una por nombre, ni con qué separador; tampoco qué pasa cuando
  aplican las dos notas (etiqueta y tope) a la vez. `document.test.ts` y el CSV
  necesitan los bytes exactos, y el `.xlsx` de R6b hereda la forma.
- **Cambio:** fijarlo. Por ejemplo: una celda con los nombres unidos por «, »;
  una fila «Nota» por nota, la de etiquetas primero; y sumar el caso de las dos
  notas al criterio 9.

**8. Registrar en el contrato las decisiones del usuario.**

- **Dónde:** encabezado `:25-29`; §0 `:455-456`; D-R6-1 `:97-102`; D-R6-12
  `:414-421`; §4.9 `:954`; §7 «Orden» `:1294`; §9 `:1590-1591`; §10 `:1597-1639`.
- **Qué pasa:** la pregunta 1 (`exceljs`) y la 2 (`audit_log`) ya tienen
  respuesta, pero el contrato las sigue tratando como pendientes, y en varios
  lugares dice «R6b espera» o «si no se acepta».
- **Cambio:** en §10, pasar las dos preguntas a «Decisiones del usuario
  (2026-10-12)»: (a) `exceljs` 4.4.0 aceptada con la alerta de `uuid`, con las
  condiciones de la opción (a) (solo en `xlsx.ts`, solo escritura, sin formato
  condicional, `import()` dinámico), y la confirmación de `security-auditor`
  como paso de R6b antes del merge; (b) ninguna exportación va al `audit_log`.
  Que §0, D-R6-1, D-R6-12, el «Orden» y §9 digan que R6b ya no espera al
  usuario sino a esa confirmación. El ADR 0022 sobre la aceptación, si el
  usuario lo quiere, sigue siendo suyo.

**9. CLAUDE.md queda desactualizado con la nueva ruta.**

- **Dónde:** §10, «Para el team-lead» (`:1646-1664`).
- **Qué pasa:** CLAUDE.md describe `(app)/` como «shell con sesión obligatoria»
  y dice que las lecturas van «desde Server Components». Un Route Handler en
  `(app)` no hereda el shell
  (`node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md:150-155`).
  No pide ADR: el ADR 0020 ya nombra «la ruta de exportación» como puerta de
  entrada que pasa por el mismo service.
- **Cambio:** sumar una nota para que el team-lead actualice «Estructura» y
  «Recorrido» de CLAUDE.md, por ejemplo: `(app)/reportes/exportar/<formato>/`,
  descargas (Route Handlers) que piden su propia sesión con `requireSession()`
  y leen por el service.

## Lo que se verificó y quedó bien

- **Citas:** `service.ts`, `repository.ts`, `schema.ts`, `session.ts`,
  `src/server/time`, `group-heading.tsx`, `labels.ts`, `report-href.ts`,
  `report-toolbar.tsx`, `report-view.tsx`, `next.config.ts`, `eslint.config.mjs`,
  `ci.yml`, `src/test/setup.ts`, `e2e/` y `seed.sql` existen con esas firmas y
  en esas líneas; las etiquetas que importa `document.ts` no arrastran React.
- **Next 16.3.8** (`node_modules/next/dist/docs`): Route Handlers sin caché por
  omisión, fuera de los layouts, sin conflicto con `page.tsx`; `redirect` da
  307 y va fuera del `try`.
- **Recorrido de CLAUDE.md:** `requireSession`, Zod con `reportRequestOf`,
  `can` en el service, repository con `join` propio (ADR 0010). El shell de
  `(app)` solo llama a `requireSession`; la regla de dominio vive en los hooks
  de Better Auth, así que la ruta no se salta nada.
- **Alcance:** `readScope` y el filtro efectivo en la misma transacción
  `repeatable read`, `read only`; un member con `personas=` ajenas exporta lo
  propio. Membresía inactiva o invitada: 403 por `can`.
- **Zona y formatos** desde `src/server/time`; fechas canónicas en las
  entradas, coherentes con el ADR 0012.
- **Topes:** 3000 filas solo para el resumen; 10 000 entradas o 4 MB, todo o
  nada. Las cifras de volumen salen de `seed.sql`.
- **Cabeceras:** `Content-Disposition` en ASCII por construcción, sin RFC 5987;
  `no-store` en 200, 403 y 500; cabeceras de seguridad por `/:path*`.
- **Pantalla:** `<a>` sin `Link` (que prefetchearía la ruta) y sin `download`.
- **Base y permisos:** sin migraciones ni índices nuevos; ninguna acción nueva
  en `Action`.
- **Slices:** R6a se despliega sola; R6b es un escritor, una ruta y un enlace.
- **Criterios:** cada uno con su test y su mutante; los de integración y e2e son
  ejecutables con los helpers y mocks que ya existen.

## Respuesta del architect

Aplicada el 2026-10-12. Las secciones son del contrato corregido.

1. `Uint8Array<ArrayBuffer>` en `csvBytesOf` (§4.7), `exportBodyOf` (§4.8),
   `ExportWriter` (§4.6) y `xlsxBytesOf` (§4.9, partida en tres líneas porque
   pasa de 90 columnas); §4.8 suma el motivo con las líneas de `lib.dom.d.ts`, y
   §4.9, la conversión del `Buffer` dentro de `xlsx.ts`
   (`new Uint8Array(await workbook.xlsx.writeBuffer())`). Verificado leyendo los
   tipos (`lib.dom.d.ts:31824`, `:39167-39168`, `:39235`;
   `lib.es5.d.ts:2411-2412`; `exceljs/index.d.ts:1`, `:1495`), **sin
   compilar**: el architect no tuvo shell en esta corrida.
2. Opción (A): D-R6-6 (la regla para las dos columnas, con el ejemplo y el
   `.xlsx`), D-R6-9 (las duraciones), §4.2 (comentario sin «,5»), criterio 1
   (1 → «0,01»), §8.1 fila 1 («`round` en lugar de truncar (cae con 1)»), §9
   (las dos columnas, con el caso de cien entradas de 1 minuto) y el texto de
   RP-18 para `parity-analyst` (§7).
3. D-R6-12 (la biblioteca y la regla con la excepción de `xlsx.ts`,
   `**/*.test.ts` y `e2e/**`; solo los tests leen), §1 (fila de
   `eslint.config.mjs`), §4.9 (sin la rama de la alternativa), criterios 16 y
   19, §8.1 fila 19 (suma «la excepción ampliada a `src/**`»), recorrido 25 y
   §7 R6b (sin «si va `exceljs`» ni cambios de `package.json`).
4. `export const reportEntryRow` (§4.1).
5. §4.3: las uniones por clave (`membership` por `workspace_id` y `user_id`;
   proyecto, cliente y tarea por `workspace_id` e id; `user` y
   `user_preference` por `user_id`) y las dos condiciones de workspace de la
   subconsulta. **Desvío:** el mutante no se puede matar sembrando a mano una
   etiqueta de B sobre una entrada de A, porque `time_entry_tag_entry_fk` y
   `time_entry_tag_tag_fk` (`src/server/db/schema.ts:499-516`) lo impiden y los
   ids son únicos. Queda como mutante declarado equivalente en §8.1, con la
   prueba previa de `test-engineer` (criterios 4 y 6), como el del `exists` del
   cliente en R4; §7 lo suma al encargo de `test-engineer` y al paso 6.
6. `ExportWriter` definido en `export/types.ts` (§4.6); §4.8 lo usa.
7. D-R6-8, «La forma de cada fila» (los nombres de cada filtro en una celda,
   unidos con «, »; una fila «Nota» por nota, la de etiquetas primero; la del
   tope solo si el primer nivel entró, como `report-view.tsx:73`); §4.6 (la
   cabecera); criterio 9 (las dos notas, la celda única y sin nota de tope con
   el primer nivel cortado); §8.1 fila 9 (dos mutantes más).
8. Encabezado y nota del ADR 0022, D-R6-1, D-R6-6, D-R6-12, §0, §1, §6.5, §7
   (R6b, «Lo que no toca nadie» y el «Orden», con `security-auditor` en el paso
   15), §9 (dos riesgos nuevos en lugar del «depende del usuario») y §10
   («Decisiones del usuario (2026-10-12)» con (a) y (b); las preguntas 1 y 2
   salen; la nota del criterio 13 queda como «Nota para el usuario»). El texto
   de §15.x para `parity-analyst` suma que nada va al `audit_log`.
9. §10, «Para el team-lead», punto 6: el texto para «Estructura» y para
   «Recorrido de una mutación» de CLAUDE.md. CLAUDE.md no se tocó.

## Segunda pasada

Revisión de `architecture-reviewer` sobre el commit `49f41fd`, con
`git diff 14d6ac4 49f41fd -- docs/slices/nucleo-reportes-r6-exportar-csv-y-excel.md`.

**Veredicto: aprobado.** Sin hallazgos nuevos.

- **El diff:** todos los hunks caen en las secciones de los nueve hallazgos o en
  las que nombran las decisiones del usuario: el encabezado, D-R6-1, D-R6-6,
  D-R6-8, D-R6-9, D-R6-12, §0, §1, §4.1, §4.2, §4.3, §4.6 a §4.9, §6.5, §7,
  §8, §9 y §10. No se perdió ni cambió texto fuera de eso; §11 y el resto de
  las decisiones quedan iguales a `14d6ac4`.
- **Hallazgos 1, 4 y 6, compilados.** Un archivo temporal con las firmas
  literales del contrato, compilado con el `tsc` del repo (5.9.3), `lib` y
  `strict` del `tsconfig.json`, y `zod` y `exceljs` del repo, termina sin
  errores. Contenía `export const reportEntryRow`, `ExportWriter`,
  `csvBytesOf` con `TextEncoder.encode`, `xlsxBytesOf` con
  `new Uint8Array(await workbook.xlsx.writeBuffer())`, `EXPORT_WRITERS`
  `satisfies Record<ReportExportFormat, ExportWriter>`, `exportBodyOf` y
  `new Response(body)`. En la primera pasada, la misma llamada con `Uint8Array`
  a secas dio TS2345. El archivo se borró.
- **Hallazgo 2 (opción A):** con `Math.floor(minutes * 5 / 3)`, los valores
  del criterio 1 dan 0,00, 0,01, 0,03, 0,50, 1,48, 1,50, 23,98, 2000,00 y 0,00;
  los de la cabecera (3599 s → «0:59», «0,98») y los del recorrido 23 (2,25,
  1,50 y 0,50) no cambian. El ejemplo de §9 es correcto: cien entradas de
  1 minuto dan «1,00» contra «1,66». La suma de truncados no pasa el truncado
  de la suma, así que el invariante de D-R6-6 vale para las dos columnas.
- **Hallazgo 3:** la regla con la excepción de `xlsx.ts`, `**/*.test.ts` y
  `e2e/**`, el criterio 19 con su mutante «excepción ampliada a `src/**`» y el
  recorrido 25 ya no se contradicen.
- **Hallazgo 5, desvío aceptado.** `time_entry_tag_entry_fk`
  (`workspace_id`, `time_entry_id`) → `time_entry` (`workspace_id`, `id`) y
  `time_entry_tag_tag_fk` (`workspace_id`, `tag_id`) → `tag` (`workspace_id`,
  `id`) existen en la base (`drizzle/0011_tags.sql`), no son diferibles, y
  `time_entry.id` y `tag.id` son claves primarias. Toda fila de
  `time_entry_tag` comparte el workspace de su entrada y de su etiqueta, así
  que, con las condiciones por id, quitar las de workspace no cambia ninguna
  respuesta: el mutante es equivalente. Que las condiciones queden escritas,
  como en `entryTags`, y la prueba previa de `test-engineer` (§8.1) alcanzan.
- **Hallazgos 7, 8 y 9:** resueltos. La nota de tope de la cabecera sigue la
  condición de la pantalla (`report-view.tsx:73`: sin el primer nivel cortado y
  con menos niveles mostrados que pedidos). §10 registra las decisiones (a) y
  (b) del usuario. R6b espera solo a `security-auditor` (§7, paso 15). El texto
  para CLAUDE.md queda en «Para el team-lead», punto 6.
