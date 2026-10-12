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
