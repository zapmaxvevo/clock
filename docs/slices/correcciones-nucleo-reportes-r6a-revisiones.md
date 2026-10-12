# Correcciones de R6a — revisiones (2026-10-12)

Seis revisiones sobre `098ff93` (rama `nucleo/r6a-csv`, diff `c19d04c..098ff93`). Contrato:
[`nucleo-reportes-r6-exportar-csv-y-excel.md`](nucleo-reportes-r6-exportar-csv-y-excel.md).

| Revisión  | Veredicto    | Hallazgos            |
| --------- | ------------ | -------------------- |
| Backend   | Aprobado     | 1 menor              |
| Seguridad | Aprobado     | 1 menor              |
| Frontend  | Aprobado     | 2 menores            |
| Tests     | Pide cambios | 2 mayores, 2 menores |
| Código    | Aprobado     | 5 menores            |
| Paridad   | Aprobado     | ninguno              |

Antes de las revisiones, `test-engineer` encontró que el mutante «las etiquetas sin ordenar»
caía 6 de 8 veces (`json_agg` en el orden de uuid aleatorios); `backend-dev` lo arregló en
`098ff93` con ids fijos (8 de 8).

## Hallazgos y decisión del team-lead

### Backend

- **B1 (menor)**, `export/csv.ts:11`: el BOM está escrito como U+FEFF literal y se ve `""`.
  **Se corrige**: `"﻿"`. → `backend-dev`.

### Seguridad

- **S1 (menor)**, `service.ts:776-780`, `repository.ts:837`, `handler.ts:66-70`: el tope de 4 MB
  acota la respuesta, no la lectura. Un member con 50 etiquetas largas y 10 000 entradas con
  descripciones de 3000 emojis hace leer ~300 MB por pedido (RSS de 117 a 703 MB en local).
  **Se corrige en R6a**: antes de `entryList`, en la misma transacción y con el mismo
  `inScope`, `closedIn` y `matchesFilter`, una suma de la cantidad de entradas y de una cota
  inferior de los bytes (`octet_length` de descripción y de los nombres de etiqueta). Si pasa
  `REPORT_EXPORT_MAX_ENTRIES` o `REPORT_EXPORT_MAX_BYTES`, `tooMany` sin listar. Como la cota
  nunca supera el tamaño real del archivo, no corta un archivo que habría entrado (sigue
  siendo todo o nada). La guarda después de escribir queda como respaldo. Medir el costo
  agregado sobre Q40–Q43. → `backend-dev`.

### Frontend

- **F1 (menor)**, `export/document.ts:186-189`: en «Proyectos» de la cabecera, dos proyectos
  del mismo nombre en clientes distintos se leen «Web, Web». **Se corrige**: con su cliente
  entre paréntesis, como `groupTextOf`; «Sin proyecto» al final; un caso nuevo. →
  `frontend-dev`.
- **F2 (menor)**, `export/labels.ts:32-33`: «10000» pasa a «10 000» con U+00A0 (la RAE agrupa
  desde cinco cifras; «3000» queda). **Se corrige**, sin `Intl.NumberFormat`. → `frontend-dev`;
  el team-lead ajusta `docs/parity/reportes.md` (el texto citado y la diferencia conocida de
  15.4).

### Tests

- **T1 (mayor)**, `handler.integration.test.ts:220-237`: con `desde` repetido, un handler que
  se queda con el primer valor pasa, porque el primer `desde` cae en la semana del reloj
  falso (reproducido). **Se corrige**: `desde=2026-09-21&desde=2026-09-14&hasta=2026-10-04`. →
  `backend-dev`.
- **T2 (mayor)**, `handler.integration.test.ts:215`: compara dos archivos con «Generado» del
  reloj real. **Se corrige**: `vi.useFakeTimers({ toFake: ["Date"], now })`. → `backend-dev`.
- **T3 (menor)**, `schema.test.ts:1366-1372`: faltan los casos de `endDay` y `startClock`.
  **Se corrige**. → `backend-dev`.
- **T4 (menor)**, `document.test.ts:73-91`: copia el `cellText` privado de `csv.ts`. **Se
  corrige** leyendo las filas con `csvBytesOf`. → `frontend-dev`.

### Código

- **C1 (menor)**: `listTags` copia `entryTags` de `time-entry`. **Deuda**, junto al `Executor`
  común en `src/server/db/` (ADR 0010 impide importarlo hoy).
- **C2 (menor)**: `[groupBy, ...subgroups]` en cuatro lugares. **Se corrige**: `reportLevelsOf`
  exportada en `schema.ts` (`backend-dev`, primer commit de la ronda, y la usa en
  `handler.ts`); `frontend-dev` la usa en `document.ts`, `report-view.tsx` y
  `grouping-model.ts`.
- **C3 (menor)**: `entriesOf`/`entryRowOf` repetidas en `service.ts` y `document.ts`. **Se
  corrige**: en `document.ts`, `entriesSectionOf` y `entryCellsOf`. → `frontend-dev`.
- **C4 (menor)**: `headerOf` formatea además de armar. **Se corrige**: `periodText` y
  `generatedText` privadas. → `frontend-dev`.
- **C5 (menor, opcional)**: el `throw` inalcanzable de `getReportExport`. **Se corrige** con dos
  sobrecargas de `readReportState`. → `backend-dev`.

### Paridad

Sin hallazgos. No verificado: el 500 (no se provoca desde afuera) y el enlace sin JavaScript
(la página queda en el `Suspense`, deuda ya anotada en R5).

### Desacuerdos de `parity-analyst` entre contrato y código

- D-R6-6 generaliza de más con etiquetas en un subnivel: alcanza con la salvedad en RP-18.
- El CSV de un período vacío trae «Entradas» con encabezados: la paridad describe el código.
- «10000»: F2.

## Criterio 13 (abrir el archivo)

LibreOffice 24 (headless, `CSV:59,34,76`, es-AR) sobre el `member.csv` descargado por la
revisión de paridad: columnas separadas, acentos bien, «Horas» como número (5,85, 1,48),
`'=1+1`, `a=b` y ` =espacio` como texto. LibreOffice pide el separador al abrir; un Excel en
español usa «;» por defecto. La prueba con Excel queda para el usuario (§10, nota).

## Primera ronda de correcciones

`backend-dev`: `7d1bab8` (C2), `23b5275` (B1, T1–T3), `c4701d4` (S1, C5), `37a3fda` (Q44–Q47) y
`96f923c` (la última copia de los niveles, en `service.ts`). `frontend-dev`: `b641288` (F1, F2,
T4, C3, C4) y `092eb5b` (C2). Paridad con «10 000»: `27d2ce5`. S1 se mide así: Q44–Q47 de 17 a
73 ms; E1 387 ms, E2 609 ms, E3 314 ms (antes 455), E4 215 ms (antes 373). La cota del CSV no
vale tal cual para el `.xlsx` comprimido: **R6b tiene que revisarla**.

## Segundas pasadas

- **Tests**: aprobado, sin hallazgos. Seis mutantes de S1 caen, uno más que los del autor
  (las etiquetas fuera de la cota).
- **Seguridad**: aprobado; el escenario de S1 ya no lee (RSS de 116 a 124 MB). Dos menores
  nuevos:
  - **S2**: la cota cuenta solo descripción y etiquetas; con nombres largos de proyecto y
    cliente todavía se leen ~50 MB. **Se corrige**: nombres de persona, proyecto, cliente y
    tarea, el separador de etiquetas y una constante por fila, sin dejar de ser cota inferior.
    No se saca el `id` de `listTags` (el desempate de `compareNames` puede hacer falta). →
    `backend-dev`.
  - **S3**: una vez, sin poder reproducirlo, `entryListSize` quedó activa más de 10 minutos.
    **Se corrige** con `set local statement_timeout` de 8 s en la transacción de la exportación.
    → `backend-dev`.
- **Backend**: aprobado. **B2 (menor)**: la suma de etiquetas como `select` propio con uniones
  en lugar de nombres escritos como texto. **Se corrige**. El hash join con Seq Scan es mejor
  que forzar el índice en el año (59 frente a 87 ms): sin cambio.
