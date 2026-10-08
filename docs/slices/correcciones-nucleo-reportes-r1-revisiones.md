# Correcciones de R1 del núcleo de reportes: revisiones

Salida de las revisiones sobre `4555e55..f44f0dd`. Backend (`backend-reviewer`): aprobado, tres
notas. Seguridad (`security-auditor`): aprobado, dos menores. Tests (`test-reviewer`): aprobado,
sin hallazgos. Código (`clean-code-reviewer`): aprobado, cuatro menores. Sin revisión de frontend
ni de paridad: no hay pantalla. El team-lead acepta todo lo que sigue.

El desvío que declaró `backend-dev` se acepta: el arreglo del test del diario va en el commit de
la 0013, para que cada commit quede en verde.

`test-reviewer` confirmó con mutantes, no solo leyendo, que los criterios 1 a 9 matan toda la
tabla del contrato. El de `ON CONFLICT DO UPDATE` es equivalente con una sola conexión, como dice
el contrato; con dos no lo es (una membresía activa confirmada mientras corre la 0013 quedaría
inactiva, con una constancia falsa). Un test de esa carrera necesita DDL confirmado fuera de un
`rollback` y rompería el aislamiento del criterio 8, así que queda sin test.

## Hallazgos

| Origen | Hallazgo                                                                                                                                      | Resolución                                                                                                                                             |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B1     | La 0013 y la 0014 corren en una transacción que bloquea `"user"` y `time_entry` hasta el commit, con dos recorridos de `time_entry`           | §2.3 del contrato lo dice y pide desplegar fuera del horario de uso. Sin cambio de código.                                                             |
| B2     | Una persona con un timer abierto y sin membresía queda inactiva y ya no puede pararlo                                                         | La consulta informativa de §2.3 suma `abiertas`, con la instrucción de cerrarlo a mano antes de desplegar.                                             |
| B3     | El mapa dice que todas las membresías que faltan nacen `member`/`inactive`; el contrato (R1-D3) y la 0013 le dan `owner`/`active` al owner    | El mapa se corrige.                                                                                                                                    |
| S1     | Con R1 el usuario con horas no se puede borrar; inactivar la membresía no corta su sesión abierta, y sus tokens de Google quedan en `account` | El procedimiento de desactivación del mapa (decisión 2, opción a) borra también las filas de `session` y `account` de la persona.                      |
| S2     | La 0013 decide el owner por `workspace.owner_id`; `ensureWorkspaceContext` también por `WORKSPACE_OWNER_EMAIL`                                | La consulta informativa suma `es_owner_por_env`, con la instrucción de crear antes la membresía si no coincide con `es_owner`. La migración no cambia. |
| C1     | `rejection` va por su cuarta copia y la lectura del diario de migraciones repite la del 9                                                     | Deuda: un `refactor(test)` aparte las lleva a `src/test/`. El contrato solo deja tocar `src/test/` para un parámetro de fábrica.                       |
| C2     | `TransactionRollbackError` se importa de `drizzle-orm/errors`; el resto del repo, de `drizzle-orm`                                            | Se importa de `drizzle-orm`.                                                                                                                           |
| C3     | `of` y `find` no dicen nada del dominio                                                                                                       | `workspaceId` y `membershipIn`.                                                                                                                        |
| C4     | En TT-92 queda una llamada a `updateDescription` que ya no cumple función: la membresía la crea `signInOn`                                    | Se borra con su comentario.                                                                                                                            |

## Cierre

Con las correcciones (`31dd83a` y el commit de este documento): lint, typecheck, 1279 de unidad y
1233 de integración en verde. Criterio 11: la suite e2e entera, 171 de 171, sobre una base nueva y
sobre una copia de la base e2e acumulada (`clock_e2e13final`). Las migraciones también se
aplicaron sobre una copia de la base de desarrollo, con 17 430 entradas. En las tres, la consulta
de verificación de §2.3 da las dos claves con `convalidated = true` y `confdeltype = 'r'`, y cero
filas de `membership.backfill`: ninguna de esas bases tenía entradas sin membresía.
