@AGENTS.md

# Clock

Carga de horas y administración interna, con paridad funcional con Clockify.
Next.js en Vercel, Postgres en Neon, login con Google restringido al dominio de
la empresa.

El plan y las decisiones del proyecto viven en el documento del equipo. Las
convenciones de código están en `.claude/skills/code-conventions/SKILL.md` y se
precargan en todos los subagentes: no se repiten acá.

## Comandos

| Comando                    | Para qué                             |
| -------------------------- | ------------------------------------ |
| `npm run dev`              | Servidor de desarrollo               |
| `npm run build`            | Build de producción                  |
| `npm run lint`             | ESLint                               |
| `npm run format`           | Prettier sobre todo el repositorio   |
| `npm run typecheck`        | `next typegen` y `tsc --noEmit`      |
| `npm test`                 | Vitest, solo unidad                  |
| `npm run test:integration` | Vitest contra un Postgres real       |
| `npm run test:all`         | Unidad e integración                 |
| `npm run test:e2e`         | Playwright contra un servidor local  |
| `npm run db:generate`      | Nueva migración a partir del esquema |
| `npm run db:migrate`       | Aplica migraciones pendientes        |
| `npm run auth:schema`      | Regenera las tablas de Better Auth   |

La base local es el Postgres de `compose.yaml` (`docker compose up -d`), en
`postgresql://clock:clock@localhost:5432/clock`.

Antes de dar por terminado un cambio: `npm run lint && npm run typecheck && npm run test:all`.

## Estructura

```
src/
  app/                 rutas; solo componen, sin lógica
    (app)/             shell con sesión obligatoria; un route.ts no lo hereda
      reportes/exportar/ descargas, una carpeta por formato (Route Handlers)
    login/             pantalla de acceso
    conectar/          consentimiento de un asistente (ADR 0026)
    api/auth/[...all]/ handler de Better Auth
    api/cron/daily/    único trabajo programado
    api/mcp/           servidor MCP sin estado; autentica por token (ADR 0026)
    .well-known/       metadatos OAuth del recurso y del servidor de autorización
  modules/<modulo>/
    schema.ts          esquemas Zod de entrada y salida
    service.ts         reglas de negocio
    repository.ts      consultas Drizzle, único lugar con acceso a datos
    actions.ts         server actions del módulo
    operations.ts      Zod, can() y service de la operación de una herramienta MCP, compartida con la action si la hay
    components/        interfaz del módulo
    *.test.ts
  server/
    auth.ts            configuración de Better Auth
    auth-records.ts    lo que se lee y escribe de las tablas de Better Auth fuera del login (ADR 0025)
    access.ts          regla de dominio e invitados, función pura
    entry.ts           el ingreso: arma access.ts con la política y los hechos de la base (ADR 0024)
    session.ts         sesión, contexto de workspace y preferencias
    user-context.ts    el armado de un pedido desde la persona, para la sesión y el token
    mcp-auth.ts        servidor de autorización de los asistentes: plugins, rutas cerradas y gancho
    mcp-context.ts     del token del MCP al actor, y el consentimiento de /conectar
    oauth-records.ts   lo que la aplicación lee y borra de las tablas OAuth (ADR 0025)
    db/                esquema y cliente
    permissions/       can(actor, action, resource)
    time/              zonas horarias, semanas, duración, formatos, redondeo
    audit.ts
    errors.ts          DomainError, RejectedError, Rejection y ActionErrorCode (ADR 0011)
    action.ts          ActionResult y handle de las actions
    failure.ts         failureOf: la traducción de errores de las actions y las herramientas
    create-once.ts     altas idempotentes con el id que elige el cliente (ADR 0007)
    env.ts             variables de entorno validadas con Zod
  components/          piezas de interfaz que comparten los módulos; `ui/` es la salida de shadcn
  hooks/               hooks de cliente que comparten los módulos: useAction, useNewId
  lib/                 utilidades puras que comparten servidor y navegador; `email.ts` normaliza y valida correos; `oauth.ts`, las redirecciones y consultas de una autorización
scripts/               operaciones de una vez que corre el usuario con `--dry-run` y `--apply`
e2e/                   Playwright
drizzle/               migraciones SQL versionadas
docs/parity/           especificación de paridad por módulo
docs/adr/              decisiones de arquitectura
```

## Recorrido de una mutación

1. La server action obtiene la sesión con `requireSession()`. Sin sesión, redirige a `/login`.
2. Valida la entrada con el esquema Zod del módulo.
3. Consulta `can(actor, action, resource)`. Sin permiso, 403. En un alta con
   `createOnce`, lo consulta el service antes de llamarla (ADR 0007).
4. Llama al service, que aplica las reglas de negocio.
5. El service usa el repository dentro de una transacción y escribe el audit log.
6. La action revalida las rutas afectadas y devuelve un resultado tipado.

Una herramienta del MCP sigue el mismo recorrido: el token reemplaza a la
sesión (`readMcpContext`) y la operación compartida de `operations.ts` hace el
resto.

Las lecturas van por el service desde Server Components. Una descarga es
un Route Handler de `(app)/reportes/exportar/<formato>/`, que no hereda el
shell de `(app)`: pide su sesión con `requireSession()` fuera del `try`
(sin sesión, 307 a `/login`), arma el pedido con el mismo parseo que la
página, lee por el mismo service y responde con `Cache-Control: no-store`.
Un service no importa de `app/` ni de `components/`; un componente no
importa un repository.

Un service puede llamar a la función de validación que exporta el service de
otro módulo, que solo lee con la transacción que recibe; lo que solo se muestra
de otro módulo se lee con un `join` en el repository propio (ADR 0010). Un
service escribe en las tablas de otro módulo solo por una función exportada del
service dueño, que recibe la transacción (ADR 0025).

## Límites del entorno

El proyecto corre en el plan Hobby de Vercel: una sola corrida de cron por día
(`/api/cron/daily`, 03:00 UTC) y previews públicos, así que la base de cada
preview lleva solo datos sintéticos. El timer activo es una entrada con `end`
nulo y el servidor no guarda estado en memoria.
