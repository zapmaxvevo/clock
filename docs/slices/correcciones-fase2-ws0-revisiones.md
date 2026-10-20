# WS0: implementación y revisiones

Rama `fase2/ws0-columnas` desde `main` en `eb2ba2d`, en el worktree
`/home/maxi/program/clock-ws0` (fuera del repositorio). Contrato:
[`fase2-ws0-columnas.md`](fase2-ws0-columnas.md); ADR
[0028](../adr/0028-borrar-columnas-primero-el-codigo-despues-la-migracion.md),
propuesto.

## Commit A

`608a000`, sin nada en `drizzle/`: `src/server/db/schema.ts` (§2.1),
`src/server/permissions/index.ts` (§3) y los tres tests de D-WS0-3.

- **El árbol no está rebasado**: `main` sigue en `eb2ba2d`, sin E2b ni el MCP
  (§0). Las citas del contrato valen sin corrimiento. El rebase, y la búsqueda
  otra vez, van antes de B (D-WS0-4).
- **`project/schema.integration.test.ts`**: sale el `describe` del criterio 11
  del slice 9 entero, y con él los imports que solo usaba —`workspaceSettings`,
  `seedUser` y `workspaceRepository`—. `readFile` y `join` siguen: los usa otro
  test del archivo.

### La búsqueda de D-WS0-3

Antes de A, sobre `eb2ba2d`, la búsqueda encontró cinco archivos de `src/` —los
que lista el contrato, que dice «cuatro» y nombra cinco— y ninguno de `e2e/` ni de `scripts/`:

| Archivo                                                  | Líneas                                          |
| -------------------------------------------------------- | ----------------------------------------------- |
| `src/server/db/schema.ts`                                | `:49-50`, `:73`, `:79`, `:82-87`, `:89`, `:109` |
| `src/server/permissions/index.ts`                        | `:76` (el comentario de `client.create`)        |
| `src/modules/project/schema.integration.test.ts`         | `:485`, `:513`, `:519`, `:535`                  |
| `src/modules/workspace/service.integration.test.ts`      | `:509`                                          |
| `src/modules/time-entry/person-keys.integration.test.ts` | `:356`, `:362`                                  |

Con A: cero coincidencias (`rg` sale con código 1).

### Corridas con A, sin B

| Corrida                                                                       | Resultado                      |
| ----------------------------------------------------------------------------- | ------------------------------ |
| `npm run lint`                                                                | sin errores                    |
| `npm run typecheck`                                                           | sin errores                    |
| `npm test`                                                                    | 2 archivos, 305 tests en verde |
| `TEST_DATABASE_URL=…/clock_ws0_back npm run test:integration` (hasta la 0016) | 30 archivos, 1838 en verde     |

**Criterio 3**, con un test de una vez que no se commitea, contra
`clock_ws0_back` con las columnas: el arranque por `ensureWorkspaceContext`
(owner), una membresía que nace de una invitación `pending` aceptada en el
primer ingreso, y una de `seedMember`. Leídas con SQL: el workspace con
`logo_url` nula y `currency` `ARS`; los ajustes con `admins`, `everyone`, cuatro
`false`, `false`, `true` y `0`; las tres membresías con
`weekly_capacity_minutes` `2400`. El archivo se borró después de la corrida.

La e2e (§9.1) es de `e2e-tester`.

## e2e con A

Commit `608a000` (A), sin B, contra `clock_ws0_e2e`, una base nueva migrada
hasta la `0016`, con las doce columnas presentes. Sin cambios en `e2e/`.

| Corrida                                                        | Resultado              |
| -------------------------------------------------------------- | ---------------------- |
| `DATABASE_URL=…/clock_ws0_e2e npm run test:e2e` (suite entera) | 235 en verde (1,9 min) |

Sin fallos ni flakes: ningún spec se repitió. Ruido sin fallos, el de siempre:
18 `Error: The destination stream closed early.` de Next en el log del servidor.

## Correcciones de las revisiones de A

- `afae472`: sale `roundMinutes` de `src/server/time/index.ts`, con su
  `describe` y su import en `time.test.ts`. Sin `rounding_minutes` quedaba sin
  llamador, y su comentario «Redondeo de reportes» describía algo que no existe
  (menor de clean code; lo decidió el team-lead). `npm run lint`,
  `npm run typecheck` y `npm test` en verde: 95 archivos y 2286 tests, y 2 y 303
  en `TZ=America/Argentina/Buenos_Aires`; los dos tests menos de cada corrida
  son los del `describe`.
