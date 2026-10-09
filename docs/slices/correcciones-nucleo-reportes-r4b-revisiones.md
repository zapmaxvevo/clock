# Correcciones de R4b del núcleo de reportes: revisiones

R4b es la parte B del contrato [`nucleo-reportes-r4-filtros.md`](nucleo-reportes-r4-filtros.md):
el filtro de personas, con las inactivas aparte y tachadas y sin las invitadas. Sale de `main` en
`2aff669`, en la rama `nucleo/r4b`, y arranca con C11 de R4a (`af97c04`).

La implementación la cortó el tope de uso a mitad del paso 8, con trabajo a medias de cuatro
agentes en el árbol, y se relanzó de a dos (decisión del usuario): `backend-r4b` y
`frontend-r4b` primero, `test-r4b` y `e2e-r4b` con el hash del paso 8. Los commits son C11
`af97c04`, paso 6 `b47a675`, paso 7 `434fbd6`, paso 8 `5a05990`, paso 9 `dfae352`, criterio 19
`7a5f4ac` y recorridos 15 y 16 `f56e2e8`.

Las seis revisiones corrieron sobre `2aff669..f56e2e8`, también de a dos; la paridad, sobre
`c44a23c`, que suma el merge de `main` con el arreglo del flaky del rastreador.

| Revisión  | Agente                | Veredicto                                       |
| --------- | --------------------- | ----------------------------------------------- |
| Seguridad | `security-auditor`    | aprobado, tres notas                            |
| Backend   | `backend-reviewer`    | aprobado, una nota                              |
| Frontend  | `frontend-reviewer`   | aprobado, cuatro notas                          |
| Código    | `clean-code-reviewer` | aprobado, cinco menores y cuatro notas          |
| Tests     | `test-reviewer`       | aprobado, dos menores y tres notas              |
| Paridad   | `parity-reviewer`     | aprobado, tres notas; el texto de `reportes.md` |

Lo que verificó cada revisión:

- **Seguridad** (completa, §7 paso 11 B): `chosen` solo sale de `everyone` y conserva el
  workspace; un member, un `project_manager` o un `team_manager` con `personas=…` (ids de su
  workspace, de otro, de una invitada, con otras mayúsculas) ve lo propio y no recibe el
  catálogo; `filterOptions.people` lleva solo `id`, `name` e `inactive`; las invitadas no están;
  ningún id de la URL llega a la base sin cruzarse con el catálogo; sin arreglos nuevos como
  parámetro. `npm audit --omit=dev --audit-level=high` sale con 0 (las seis moderadas viejas de
  `uuid` vía `exceljs` siguen).
- **Backend**: capturó el SQL de un pedido Persona → Proyecto: una transacción `repeatable read
read only` con clientes, proyectos, personas y los dos niveles. C11 sin cambios de
  comportamiento. Nueve mutantes propios, todos caídos. Reprodujo §6.3: Q23 3,35 ms, Q24
  0,065 ms y el pedido entero 7,47 ms (backend: 3,41, 0,085 y 7,52; presupuestos 60, 10 y 250),
  sin índices nuevos.
- **Frontend**: la app con 50 personas (6 inactivas, dos «Ana Gómez», un nombre de 62
  caracteres) como owner y member: el orden de «Filtrar por», el tachado solo en «Inactivas»,
  el foco con Esc y tras «Aplicar» también solo con teclado, 1366×657, 320 y 375 px. Frontend
  midió §6.4 con las tres listas llenas: 582 KB de payload RSC y 754 KB de HTML (presupuestos 1
  y 1,5 MB).
- **Código**: C11 de R4a resuelto; no queda ningún `throw` provisional del paso 6.
- **Tests**: cada criterio de 16 a 23 con su test; acepta los dos equivalentes.
- **Paridad**: RP-25, RP-31, RP-32, RP-34, RP-62 y RP-64 con la app y un spec propio de 14
  casos en su copia; los recorridos 15 y 16 pasan.

## Los mutantes equivalentes

`test-r4b` corrió 33 mutantes de §8.1 de B: 31 caídos y 2 equivalentes, comprobados con un
volcado de 396 respuestas enteras (9 actores × 11 juegos de personas × 4 formas), que con el
mutante observable de al lado difiere en 60 líneas.

- **«`scope` en `chosen`» solo en `scopeLineOf`**: `scopeLineOf` recibe el alcance de `scopeOf`,
  nunca el angostado. Lo confirman backend, `backend-reviewer` y `test-reviewer`; la variante que
  lee el alcance angostado cae.
- **La guarda de `narrowedTo` quitada sola**: `narrowedTo` solo se llama con `filters.people` no
  vacío, y eso exige el catálogo, que solo existe con `everyone`. Seguridad juzga aceptable
  apoyarse en esa primera defensa, que sí está probada.
- **La guarda de largo de `narrowedTo`** (`RangeError` fuera de 1 a 50), que `test-reviewer` vio
  fuera de la tabla: inalcanzable por el mismo argumento, porque las personas son un
  subconjunto del catálogo y `checkFilters` corta en 50 antes.

## Frontend (`frontend-r4b`)

| Id  | Origen | Hallazgo                                                                                    |
| --- | ------ | ------------------------------------------------------------------------------------------- |
| C2  | código | `FilterPanel` decide rótulo y tachado por `kind === "people"`; pasa a mapas de `labels.ts`. |
| C3  | código | Tres cadenas de `if` sobre `FilterKind` en `filter-model.ts`; `switch` sin `default`.       |
| T1  | tests  | Atajos, `applySelection`, subniveles y «Quitar filtros» sin `personas` en los fixtures.     |
| F2  | front  | Un test de componente para RP-31: dos homónimas, dos casillas.                              |

## Backend (`backend-r4b`)

| Id    | Origen    | Hallazgo                                                                                   |
| ----- | --------- | ------------------------------------------------------------------------------------------ |
| C1    | código    | Tres comentarios dicen que `Scope` tiene un solo constructor; `narrowedTo` es el segundo.  |
| C7    | código    | `name: "personas"` en plural; los otros van en singular.                                   |
| C8    | código    | `Parameters<typeof listWorkspacePeople>[1]` en lugar del tipo `Actor`.                     |
| C9    | código    | El id inexistente repetido como literal; una constante `unknownId`.                        |
| T2    | tests     | El criterio 18 no distingue el orden por `displayNameOf` del orden por la cuenta.          |
| S1    | seguridad | JSDoc: el catálogo de personas se lee solo con `everyone` (para R6).                       |
| S2/T3 | seguridad | Espiar `listPeople` en `expectForbiddenWithoutReading` y sumar `people` en los no activos. |

## Deuda que queda

- **C4**: cuarta copia de `requestFromUrl` y tercera de `linkedTrees` en
  `scope.integration.test.ts`; una sola `requestOf(searchParams)`.
- **C5**: tercera copia de `renameAccount` (report, workspace y `signInWithGoogleName` en
  session); una sola en `factories.ts`.
- **C6**: `seedUser(undefined, id)` posicional; un objeto de opciones cambia todos los llamadores.
- **F3**: el nombre largo de una opción se corta sin tooltip, como los proyectos de R4a.
- La navegación del shell desborda a 320 y 375 px (deuda previa ya anotada).

## Paridad

El texto de `parity-reviewer` está aplicado en `docs/parity/reportes.md` (`629286e`): la
cabecera, RP-25, RP-31, RP-32, RP-34, RP-62, RP-64, la entrada de R4b en la sección 12, las
divergencias de B en §12.4 y las secciones 12.6 a 12.8.

## Cierre

Ronda de correcciones: frontend `e069399` (C2, C3, T1 y F2; los cuatro mutantes de T1 sobrevivían
con los tests de antes y caen con los nuevos) y backend `4aa6b01` (C1, C7, C8, C9, T2, S1 y
S2/T3; el mutante que ordena por la cuenta y el que lee `listPeople` antes de `report.view`
caen). Corrida final sobre `4aa6b01`, con bases nuevas: lint, typecheck, 1652 de unidad, 277 de
`test:time-ar`, 1397 de integración, `reports.spec.ts` 17/17 ×3 y la suite e2e 201/201 ×2. Sin
comprobación contra Neon (D-R4-11).
