# Correcciones de R10b del núcleo de reportes: revisiones

R10b es la parte B del contrato
[`nucleo-reportes-r10-descripcion-mes-y-semana.md`](nucleo-reportes-r10-descripcion-mes-y-semana.md):
agrupar por descripción y el tope del primer nivel. Sale de `main` en `d691e40` (R10a mergeado),
en la rama `nucleo/r10b`.

Commits: frontend `d137911` (F1 de R10a: la tabla de ancho fijo) y `f49a419` (paso 11); backend
`88dd429` (paso 10), `fdd0105` (paso 12) y `d32b376` (paso 13, `seed.sql` y la medición).

## Implementación

- **F1 de R10a** (`d137911`): `table-fixed` y «Duración» en `w-24`; `NamedHeading` con
  `block truncate`. Con nombres de 100 caracteres, la tabla pasa de hasta 1404 px a 270/270 y
  325/325 a 320 y 375 px en todas las agrupaciones medidas. **N1 de paridad de R10a queda como
  deuda**: una semana con «solo …» en el tercer nivel ocupa hasta siete renglones a 320 px; la
  única salida en los archivos de frontend ata la pantalla al formato de `dayRangeLabel` y cambia
  el texto que leen los e2e.
- **Paso 11** (`f49a419`): `DescriptionHeading` propio (el `NamedHeading` del paso 10 no ponía
  «…»); los diez mutantes de frontend de §8.1 caen.
- **Paso 12** (`fdd0105`): los 21 mutantes de backend de §8.1 caen (criterios 15 a 17);
  integración 1437/1437.
- **§6.3** (`d32b376`), medianas de cinco: Q31 42,3 ms (≤ 200), Q32 5,7 (≤ 60), Q33 18,9
  (≤ 100), Q34 2,5 (≤ 40); pedidos enteros 62,3 ms (≤ 500) y 20,3 ms (≤ 250). Sin índices.
  Q2, Q5 y Q11 con el `limit` del primer nivel, dentro de 150 ms. `explain.sql` lleva el `limit`
  como parámetro solo en Q2, Q5 y Q11; las demás consultas de primer nivel siguen sin él en el
  script (nota para la deuda del script).
- **§6.4 y §5.1** (frontend, en su copia, sin commit): RSC 676 KiB y 655 KiB (≤ 1 MB); HTML
  1,69 MiB y 1,99 MiB (≤ 2,5 MB, el segundo al 83 %); la barra con nueve enlaces en tres
  renglones a 320 y 375 px, sin desborde en `main`.

## Revisiones

| Revisión  | Agente                | Veredicto |
| --------- | --------------------- | --------- |
| Backend   | `backend-reviewer`    | pendiente |
| Seguridad | `security-auditor`    | pendiente |
| Frontend  | `frontend-reviewer`   | pendiente |
| Tests     | `test-reviewer`       | pendiente |
| Código    | `clean-code-reviewer` | pendiente |
| Paridad   | `parity-reviewer`     | pendiente |
