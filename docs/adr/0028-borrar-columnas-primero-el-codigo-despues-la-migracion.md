# 0028. Borrar columnas: primero el código, después la migración

Fecha: 2026-10-20. Estado: Propuesto.
Origen: el contrato de WS0
([`fase2-ws0-columnas.md`](../slices/fase2-ws0-columnas.md)), con el
[mapa de la fase 2](../slices/fase2-mapa.md) (WS0, §4 y §7) y
[`workspace.md`](../parity/workspace.md) (§14, P-05).

## Contexto

Vercel despliega `main` a producción en cada push, y el build no corre
migraciones: las corre el usuario con `npm run db:migrate`. Hasta WS0 todas las
migraciones agregaron columnas, tablas o restricciones que el código anterior no
nombra, así que la regla fue **migrar antes del push**: la versión vieja sigue
atendiendo con la base nueva, y la versión nueva encuentra lo que necesita. El
2026-10-16 E1a llegó a producción antes que su migración `0015` y el ingreso de
una persona nueva falló hasta migrar.

Borrar es el caso inverso, por cómo arma Drizzle las sentencias (`drizzle-orm`
0.45.3):

- **Un `select()` sin argumentos y un `returning()` sin argumentos nombran todas
  las columnas del esquema**, no `*`.
- **Un `insert` nombra todas las columnas del esquema**, con `default` en las
  que el valor no trae (`node_modules/drizzle-orm/pg-core/dialect.js:356-404`).
- La aplicación hace las dos cosas en cada pedido con sesión:
  `ensureWorkspaceContext` lee el workspace con `findFirstWorkspace` y la
  membresía con `findMembership`, los dos con `select()`
  (`src/modules/workspace/service.ts:160-170`, `:83-91`;
  `src/modules/workspace/repository.ts:65-87`), y el gancho
  `session.create.after` vuelve a leer el workspace (`service.ts:414-425`).

Una columna que la base tiene y el código no conoce no molesta: ni se lee ni se
escribe, y un `insert` la llena con su `default`. Una columna que el código
conoce y la base no tiene es el error `42703` en esas sentencias: **con la
columna borrada, una versión que todavía la nombra no arma ninguna sesión**.

La versión que todavía la nombra no es solo el deployment anterior:

- **El deployment anterior** atiende hasta que Vercel promueve el nuevo, y sus
  invocaciones en curso terminan en él.
- **Un deployment anterior promovido de nuevo** con Instant Rollback.
- **Un lector fuera de la aplicación**: el script de importación de Clockify
  vive en una rama sin mergear (`ops/importar-clockify`) con su propia copia de
  `src/server/db/schema.ts`.
- **Las bases compartidas**: la rama `preview` de Neon, que usan los previews de
  todas las ramas, y las bases locales `clock` y `clock_test`, que usan todos
  los worktrees.

Y `drizzle-kit migrate` aplica una migración solo si su `when` del diario es
mayor que el `created_at` de la última aplicada
(`node_modules/drizzle-orm/pg-core/dialect.js:59-67`): una migración generada
antes que otra que ya corrió se saltea sin aviso.

## Opciones

1. **Migrar antes del push, como una que agrega.** Entre la migración y la
   promoción del deployment nuevo, todo pedido con sesión falla.
2. **Un solo merge con el código y la migración, y migrar cuando el deployment
   nuevo atiende.** Es seguro si se respeta el orden, pero el archivo de la
   migración está en `main` antes de que el código atienda, y la regla de
   siempre dice correrla antes del push. Y CI prueba solo el estado final: el
   código nuevo contra la base con las columnas, que es lo que atiende durante
   la ventana, no lo prueba nadie.
3. **Dos pasos.** Un commit con el código que ya no nombra las columnas, que
   llega solo a `main` y se despliega; cuando atiende, un commit con la
   migración, que llega a `main` y recién entonces se corre.
4. **Código que tolere las dos bases**: nombrar las columnas en cada lectura y
   escribir con SQL propio. No alcanza con Drizzle, que nombra todas las
   columnas en cada `insert`, y obliga a abandonar `select()` en todo el código
   por una migración.
5. **No borrar**: dejar las columnas con un comentario «sin efecto». Es lo que
   el [ADR 0009](0009-la-configuracion-del-workspace-viaja-en-el-recurso.md)
   descarta («un dato que viaja sin efecto es una invitación a creer que tiene
   uno») y lo que workspace P-05 decidió no hacer.
6. **Apagar el despliegue automático y promover a mano.** Da control total del
   orden, pero cambia la operación de todos los slices por uno.

## Decisión

**La opción 3**, con estas reglas:

1. **Dos commits en la rama del slice.** El primero, **el código**: el esquema
   sin las columnas, los lectores que las nombran y sus tests, sin migración. El
   segundo, **la migración**: lo que genera `npm run db:generate` desde ese
   esquema, y el test que comprueba su resultado. Nada más.
2. **Dos merges a `main`.** El del código primero. El de la migración, solo
   cuando el deployment del primero es el actual de producción y pasaron diez
   minutos desde que lo es, para que terminen las invocaciones del anterior.
   **Entre los dos merges no entra a `main` ninguna otra migración**: el esquema
   ya no tiene las columnas y la última instantánea de `drizzle/meta/` sí, así
   que un `db:generate` en ese intervalo volvería a generar el borrado.
3. **La migración se corre después del push de su merge**, desde `main`: es el
   orden inverso al de una que agrega, que se corre antes. Así `main` tiene la
   migración antes que cualquier base, y una base nunca tiene una migración que
   `main` no conoce.
4. **Antes de migrar, todo lector de fuera de la aplicación** que use el esquema
   viejo se pasa al nuevo y se prueba contra una base migrada. Mientras no está,
   no se migra.
5. **Una base compartida recibe la migración** solo cuando todos los árboles que
   la usan tienen el commit del código: la rama `preview` de Neon, cuando las
   ramas con preview están rebasadas; las bases locales comunes, nunca desde la
   rama del slice, que prueba con bases propias.
6. **La migración se genera después de rebasar** sobre el último `main`, para
   que su `when` supere el de toda migración aplicada, y **se revisa a mano**:
   solo `DROP COLUMN` de las columnas pedidas, sin tipos ni restricciones de
   más. `drizzle-kit` pregunta por un renombre solo cuando una tabla pierde y
   gana columnas en el mismo diff; si pregunta, el diff trae algo que no es el
   borrado, y se para.
7. **La reversión** depende de si la migración corrió:
   - **antes**, se revierte el merge del código; la base todavía tiene las
     columnas;
   - **después**, una migración hacia adelante vuelve a crear las columnas con
     su tipo y su `default`, y se corre **antes** de desplegar cualquier código
     que las nombre, como toda migración que agrega. Nunca se revierte el commit
     de la migración —el diario y la base dejarían de coincidir— ni se promueve
     un deployment anterior al commit del código.
8. **Vale para todo borrado**: una columna, una tabla o un valor que el código
   deja de escribir. **Renombrar** es agregar la nueva, pasar el código y borrar
   la vieja, y la última parte sigue este ADR.

Se descartan la 1 porque deja la aplicación caída en la ventana; la 2 porque
deja el orden librado a la memoria de quien migra y no prueba la ventana; la 4
porque Drizzle no la permite sin abandonar sus lecturas; la 5 por el ADR 0009 y
P-05; y la 6 por costo.

## Consecuencias

- **Un borrado son dos despliegues**; el segundo no cambia código que se
  ejecute.
- **La regla de operación tiene dos formas**: una migración que agrega se corre
  antes del push; una que borra, después del push de su merge y con el código
  ya atendiendo. Cada contrato que borra dice cuál es la suya.
- **CI prueba la ventana sin trabajo extra**: el push del commit del código
  corre la integración y la e2e contra una base nueva migrada con las
  migraciones de ese árbol, que todavía tienen las columnas (CI, jobs
  `integration` y `e2e`). Es la versión que atiende mientras la base no migró.
- **Hay un intervalo con el esquema y la instantánea desparejos** en `main`,
  entre los dos merges. Lo acota la regla 2.
- **Después de migrar, Instant Rollback a un deployment anterior al código deja
  la aplicación caída.** La salida es la reversión de la regla 7.
- **Un lector de fuera de la aplicación tiene que seguir al esquema**: el script
  de importación se rebasa antes de migrar. Uno viejo falla en su primera
  sentencia y, si corre en una transacción, no escribe nada.
- **La reversión no devuelve los valores**: las columnas vuelven con su
  `default`. Si guardaban algo, la consulta previa del contrato es la única
  copia.
- **Una columna nueva `not null` sin `default`** tampoco es compatible con el
  código anterior, que no la nombra en sus `insert`. Va con `default`, o en dos
  pasos como este.
- **El camino del ADR 0009 no cambia**: si `who_creates_projects` o la
  capacidad vuelven a tener un consumidor, la columna vuelve con una migración
  que agrega.
