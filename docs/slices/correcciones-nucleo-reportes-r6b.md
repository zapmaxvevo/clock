# R6b — arranque y decisiones (2026-10-12)

Rama `nucleo/r6b-excel` desde `main` en `92ec4fc` (merge de R6a). Contrato:
[`nucleo-reportes-r6-exportar-csv-y-excel.md`](nucleo-reportes-r6-exportar-csv-y-excel.md), §4.9,
§6.5, §7 «R6b» y pasos 12 a 15.

## B4 de R6a: la cota de las entradas con dos formatos

`entriesFit` decide con `csvEntriesMinBytes`, y un `.xlsx` comprimido puede pesar menos que esa
cota (B4 de [las revisiones de R6a](correcciones-nucleo-reportes-r6a-revisiones.md)). Para el
`.xlsx` no hay una cota inferior útil del archivo comprimido, y sin una lectura acotada se pierde
lo que arreglaron S1 y S2.

**Decisión del team-lead**: el tope de las entradas es **del documento, medido como CSV**, igual
para los dos formatos: si las entradas no entran en el CSV, tampoco van en el Excel. CSV y Excel
deciden lo mismo con el mismo pedido, la lectura sigue acotada antes de `entryList`, y la guarda
después de escribir sigue mirando el peso de cada archivo (4 MB) como respaldo. El aviso de las
entradas no cambia. Consecuencia: un Excel que habría pesado menos de 4 MB comprimido puede
salir sin entradas; se acepta a cambio de una sola regla. La medida deja de ser «del CSV» en el
código: vive como medida del documento y no la importa el service desde `csv.ts`.

## Implementación

`backend-dev`: `abc204e` (`"xlsx"` en los formatos; no compila hasta `dda1265`) y `25033f6` (paso
12 y B4: la cota pasa a `export/entry-size.ts`). `frontend-dev`: `dda1265` («Excel»). Medición
de §6.5: E1 en Excel 697 ms, 322 KB, pico de `heapUsed` 142 MB; E2 1077 ms, 538 KB, 254 MB;
`exceljs` en un chunk aparte que el CSV no carga; sin `serverExternalPackages`.

**Regla rota otra vez**: `backend-dev` creó dos veces en el árbol compartido un archivo de
prueba (`export/zz-probe.test.ts`, la lectura de `exceljs`), además de uno de la regla de
ESLint; `frontend-dev` lo vio en una corrida. Es la segunda vez en R6 (la primera, los mutantes
del paso 3 de R6a). Los encargos que siguen lo repiten: toda prueba descartable, en el
worktree.

## Revisiones y correcciones

- **Seguridad** (paso 15): aprobado. GHSA-w5hq-g745-h8pq afecta solo a `v3`/`v5`/`v6` con `buf`
  propio; `exceljs` llama a `v4()` sin argumentos y solo en el formato condicional, que no
  escribimos (confirmado envolviendo `uuid`: ninguna llamada). Dos menores: U+FFFF rompe el
  `.xlsx`, y la regla de ESLint no ve `import()` ni subrutas.
- **Backend**: pidió cambios. Mayor: U+FFFF (el mismo de seguridad; LibreOffice pierde los
  textos compartidos). Menores: CSV y Excel deciden distinto si el CSV escrito pasa 4 MB con la
  cota debajo (recomendaba documentarlo; **el team-lead eligió medir el documento como CSV** para
  los dos formatos, con la guarda propia del formato como respaldo) y la regla de ESLint.
- **Código**: aprobado; comentarios viejos y un docblock suelto se corrigen; `EntryTexts` queda
  como copia de `EntryListSize` para que `export/` no dependa del repository.
- **`parity-analyst`**: además de B4, «Horas» del Excel iba sin truncar con `0.00` (se veía más
  que el total): **se trunca al centésimo**, como en el CSV. Fechas anteriores a 1900 no
  aplican (piso 2000-01-01). El contrato (D-R6-6, D-R6-12, §4.9, criterio 16) sigue diciendo
  «minutos / 60 sin cortar»: lo reemplaza esta decisión.

Correcciones: `0aff6c6` (B4 medido como CSV, horas truncadas) y `b817148` (U+FFFD, ESLint,
comentarios). E1 en `.xlsx` 320 KB y 710 ms; E2 535 KB y 1094 ms. Recorrido 25: `88c7333`.
Paridad aplicada en `4871b4b`, con una nota de U+FFFD sumada por el team-lead.
