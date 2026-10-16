# R8: implementación y revisiones (2026-10-13)

Rama `nucleo/r8-cambiar-rol` desde `main` en `af04f91`, en el worktree
`/home/maxi/program/clock-r8` (fuera del repositorio, para no romper el lint),
en paralelo a R7b. Contrato:
[`nucleo-reportes-r8-cambiar-rol.md`](nucleo-reportes-r8-cambiar-rol.md). ADR:
[0023](../adr/0023-quitar-el-rol-de-admin-es-una-accion-propia.md), aceptado el 2026-10-16.

## Contrato antes de implementar

- **Tercera ronda de `architecture-reviewer`**, contra `10b8af0` (el contrato
  era de `d5765ea`): aprobado con retoques (§6.6 con R7b en lugar de R4, las
  descargas en D-R8-8, citas corridas, `listWorkspacePeople` ya existente,
  helpers reusables). Los aplicó `architect` (`e88fb8f`).

## Primera ronda de implementación

- `backend-dev`: `22493ed` (formas) y `5f62b76` (repository, service y tests);
  25 mutantes caídos.
- `frontend-dev`: `ba4d7a5` (pantalla, diálogo de bajarse a sí mismo,
  navegación); 14 mutantes caídos. Desvíos aceptados: `TEAM_HEADING_ID` en el
  modelo (lo importa un componente de servidor), `finalFocus` por `id`,
  «Reintentar» que baja el aviso, sin vista optimista (el contrato exige el
  botón visible mientras viaja), sin `loading.tsx`.
- `test-engineer`: `d9f3e37` (criterio 2) y `00e2eb6` (concurrencia, 11 a 13).
- `e2e-tester`: `9f4cb9f` y `827a5e4`; los tres recorridos fallaban por la
  funcionalidad; después, 3/3 y suite 216/216.

## Primera ronda de revisiones

| Revisión  | Veredicto                                                      |
| --------- | -------------------------------------------------------------- |
| Backend   | Aprobado con menores                                           |
| Frontend  | Aprobado, un menor opcional                                    |
| Seguridad | Aprobado, sin hallazgos del slice                              |
| Código    | Pide cambios: un mayor, seis menores                           |
| Tests     | Pide cambios: un mayor, un menor                               |
| Paridad   | Aprobado, dos observaciones; y un hallazgo de `parity-analyst` |

Decisiones del team-lead:

- **B1 (backend):** el `can()` dentro de la transacción usaba el workspace de la
  sesión; sin el filtro del bloqueo, el mutante 8 daba un éxito falso con una
  auditoría en A sobre una membresía de B (el informe de backend decía mal que
  moría por `not_found`). Se corrige: `workspaceId` en `LockedMembership`,
  `can()` con el de la fila, `freshActorOf` filtra por workspace (`0d48375`);
  el mutante responde `forbidden`.
- **B2 (backend):** el mutante «regla del owner quitada» muere por el texto
  (`roleLocked` en lugar de `ownerLocked`). Se acepta; anotado en §7.1.
- **K1 (código, mayor):** el test de concurrencia copiaba `outcomeWhileLocked`
  y `holdBarrier`: `outcomeWhileHeld` pasa a `src/test/concurrency.ts`
  (`f641c85`), y también la copia de `timesheet.integration.test.ts`
  (`363a5c0`). **K2, K3:** `actorIn`, `teamMessages.forbidden`,
  `membershipOf`/`membershipById` en `src/test/queries.ts` (`f641c85`). **K4 a
  K7 y F1:** `textOf`/`buttonsOf` en `src/test/markup.ts`, el guard inalcanzable
  de `onRetry` fuera, `targetName`, `TeamPageError` (`7f81486`). Las otras
  copias de `textOf` y la tercera copia de `signInAs` quedan como deuda.
- **T1 (tests, mayor):** `/equipo` lista todas las membresías activas del
  workspace común de e2e y en una base reusada crece hasta fallar (5.233 filas:
  3 de 3). Opción (a): el setup corta por encima de 1.500 con el procedimiento
  para seguir en una base nueva.
- **Paridad:** el aviso de `unexpected` repetía «No se pudo cambiar el rol»: se
  corrige con `unexpectedBody`. Los homónimos con el mismo nombre accesible
  quedan como deuda.
- **Hallazgo de `parity-analyst`:** en Clockify **solo el owner quita el rol de
  admin** («Only the Workspace owner can remove an admin role from someone…»;
  «Manage users | Yes (except removing Admin role – Owner only)», FOUND dos
  veces). **El usuario decidió replicarlo** el 2026-10-13.

## La corrección del 2026-10-13

- **Contrato:** `architect` lo llevó a `can()` como acción propia,
  `team.admin.revoke`, y no dentro de `team.manage` (que rompía el reintento de
  un ascenso y le cerraba a un admin todo lo demás sobre otro admin). Sale el
  diálogo de bajarse a sí mismo; el foco pasa al encabezado de fila cuando se
  queda sin botón. `1379b29`; la revisión de `architecture-reviewer` lo aprobó
  con siete retoques (un mutante sobreviviente en el criterio 4, el foco sin
  suponer el orden, citas, el procedimiento del tope sin tocar `clock`,
  mutantes equivalentes declarados). **El usuario decidió abrir el ADR 0023**,
  propuesto (`3df9b48`). Antes se mergeó `main` con R7b (`ed87784`).
- **Implementación:** backend `0ae8ec9` y `995bc84` (32 mutantes); tests
  `2775dad` y `4d71f19` (todos los de §7.1 que cambian; los dos equivalentes
  dejan vistas idénticas); frontend `e09215f` (16 mutantes; desvíos aceptados:
  la marca del foco con un ref por `react-hooks/set-state-in-effect`, y
  `onRetry` sigue siendo el envoltorio de K5); e2e `87a70f0` (el tope) y
  `d7a3807` (recorridos; el 1 fallaba por un botón de más).
- **Segunda pasada de seguridad:** aprobado. S1: la receta del tope podía
  escribir en `clock` si había un servidor de desarrollo en :3000
  (`reuseExistingServer`). Corregido en `c1e0e55`.
- **Segunda pasada de código:** aprobado con menores: K8 `it.each` para los tres
  casos de `adminOwnerOnly` (`f6c6629`); K9 `OWNER_EMAIL` en
  `e2e/environment.ts` (`c1e0e55`, que también sacó una cuarta copia de
  `playwright.config.ts`).
- **Paridad:** `parity-analyst` rehízo el texto con RP-68 en `replicar`; lo
  aplicó el team-lead (`502d2b9`).

## Corrida final

Sobre `c1e0e55`: lint, typecheck, 2050 de unidad, 305 de `test:time-ar`, 1642
de integración y `prettier --check .`, en verde. E2E con build nuevo,
`next start -p 3201`, base nueva `clock_r8_e2e2`: `team.spec.ts` 4/4 y la
suite 217/217 dos veces, sin flaky.

## Pendiente del usuario

- ~~Aprobar el ADR 0023.~~ Aprobado el 2026-10-16.
- P-12 en el workspace de Clockify (si un admin da el rol de admin con «+Role»,
  si quitar pide confirmación, nombres en español, columnas de la página de
  equipo).
- Las bases de e2e locales con más de 1.500 membresías activas cortan en el
  setup desde R8: crear una nueva con el procedimiento del README.
