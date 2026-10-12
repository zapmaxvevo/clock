# R9: implementación y revisiones (2026-10-12)

Rama `nucleo/r9-sin-horas` desde `main` en `6be71a7`. Contrato:
[`nucleo-reportes-r9-personas-sin-horas.md`](nucleo-reportes-r9-personas-sin-horas.md).

## Implementación

- `backend-dev`:
  - `1f5750f`: paso 1, las formas.
  - `72394f2`: paso 3, el service y la fila de la cabecera.
- `frontend-dev`: `6bfe807`, la pantalla.
- `test-engineer`: `6d46143`, el criterio 14.
- `e2e-tester`: `23a8d7a`, los recorridos 26 y 27.
- Paridad: `98099f8`, el texto de `parity-analyst` aplicado por el team-lead, y `db3db82`, las precisiones de `parity-reviewer`.

Desvíos aceptados por el team-lead:

- `joinedAt` se lee y se copia desde el paso 1, porque sin eso no compila.
- Los pedidos armados a mano en `scope.integration.test.ts` llevan `peopleWithoutTime: false`.
- El criterio 12 compara span, filtro y dimensiones sin el `limit`. El del nivel 2 cambia a propósito (D-R9-8).
- En el criterio 5, la admin que mira es A1.
- Un `throw` de invariante extra: la opción sin el catálogo de personas.
- Los helpers `expectReport` y `openReport` de e2e reciben la opción.
- El `href` de «CSV» se compara por su query.

**Q24 (D-R9-13)**, sobre `seed.sql` de R4, con 30 personas y 169 016 entradas:

- El plan es el mismo: Hash Join y Seq Scan, sin índices, con 31 filas.
- La mediana de cinco corridas pasa de 0,083 a 0,081 ms, contra un presupuesto de 10 ms.

Mutantes, todos muertos:

| Quién corrió                      | Cantidad |
| --------------------------------- | -------- |
| `backend-dev`                     | 10       |
| `frontend-dev` (criterios 3 y 16) | 16       |
| `test-engineer` (criterio 14)     | 6        |
| `e2e-tester` (§8.2)               | 9        |

## Revisiones

- **Backend:** aprobado, sin hallazgos.
- **Seguridad:** aprobado, sin hallazgos.
  - La opción aplica solo con `everyone`.
  - Las candidatas salen del catálogo propio, leído con el `tx` de la foto.
  - Ningún nombre ajeno llega a member, project_manager ni team_manager, en la página ni en el archivo.
  - `joinedAt` no sale del service.
  - El tope no se puede inflar.
- **Paridad:** aprobado, sin hallazgos. Cerró los dos puntos que había dejado abiertos `parity-analyst`, y sus precisiones están en `db3db82`:
  - La fila sin horas sale en el Excel con celdas con tipo: el nivel es el entero 1, y «Duración» y «Horas» son 0 con su formato.
  - Un archivo con solo filas sin horas lleva la fila de encabezados del resumen.
- **Frontend:** aprobado con menores. Un menor: ningún test mata «`peopleWithoutTime` fuera del `requestKey`» (`report-view.tsx:42`). Corrección: el recorrido 26 expande B antes de «Ocultar» y afirma `aria-expanded="false"`.
- **Clean code:** aprobado con menores.
  1. `peopleWithoutTimeOf` repite el nombre visible, `inactive` y el orden de `toPersonOptions`. **Queda como deuda**: las firmas de §4.4 fijan esta forma. Se junta la próxima vez que se toque el código, recorriendo las `PersonOptions`.
  2. `SHOW_WITHOUT_TIME` y `HIDE_WITHOUT_TIME` pasan al bloque de constantes de `e2e/reports-page.ts`.
- **Tests:** aprobado con menores, con un mayor.
  - **Qué pasa:** el recorrido 26 falla con una base de e2e reusada. Sin filtro de personas, entran todas las activas acumuladas, el primer nivel pasa de 3000 filas y aparece la fila del tope. En esa base sobreviven los mutantes de la inactiva y la invitada.
  - **Dónde no se ve:** en CI no pasa, porque la base es nueva en cada corrida. Sí pasa en el preview y en las bases locales reusadas.
  - **Decisión del team-lead:** el recorrido usa un período fijo en el pasado, antes del ingreso de cualquier otra persona de la base, y conserva todas sus afirmaciones.

## Correcciones

`e2e-tester`, `fd3f8e9`:

- **Recorrido 26:** usa la semana fija del 01/10 al 07/10/2001. `parseDayKey` acepta cualquier día real, así que no hay un piso de fechas. Conserva todas las afirmaciones.
- **El árbol:** con B abierto, «Ocultar» y «Mostrar» lo dejan contraído.
- **Las constantes:** pasan al bloque de textos.
- **§8.2 del contrato:** actualizado por el team-lead con el texto del recorrido y el mutante nuevo.

Verificación:

- **Base grande** (copia de `clock`, con 9128 activas):
  - El 26 viejo falla en la fila de Eva.
  - El 26 nuevo y el 27 pasan, también con `--repeat-each 3`.
  - Caen los diez mutantes de §8.2, entre ellos el del `requestKey`.
- **`clock_r9_e2e`:** la suite completa pasa 212/212.
