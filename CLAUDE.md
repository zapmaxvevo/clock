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
| `npm run test:e2e`         | Playwright contra `E2E_BASE_URL`     |
| `npm run db:generate`      | Nueva migración a partir del esquema |
| `npm run db:migrate`       | Aplica migraciones pendientes        |
| `npm run auth:schema`      | Regenera las tablas de Better Auth   |

Antes de dar por terminado un cambio: `npm run lint && npm run typecheck && npm run test:all`.

## Estructura

```
src/
  app/                 rutas; solo componen, sin lógica
    (app)/             shell con sesión obligatoria
    login/             pantalla de acceso
    api/auth/[...all]/ handler de Better Auth
    api/cron/daily/    único trabajo programado
  modules/<modulo>/
    schema.ts          esquemas Zod de entrada y salida
    service.ts         reglas de negocio
    repository.ts      consultas Drizzle, único lugar con acceso a datos
    actions.ts         server actions del módulo
    components/        interfaz del módulo
    *.test.ts
  server/
    auth.ts            configuración de Better Auth
    access.ts          regla de dominio e invitados, función pura
    session.ts         sesión y contexto de workspace
    db/                esquema y cliente
    permissions/       can(actor, action, resource)
    time/              zonas horarias, semanas, duración, redondeo
    audit.ts
    env.ts             variables de entorno validadas con Zod
  components/ui/       primitivas compartidas (shadcn/ui)
e2e/                   Playwright
drizzle/               migraciones SQL versionadas
docs/parity/           especificación de paridad por módulo
docs/adr/              decisiones de arquitectura
```

## Recorrido de una mutación

1. La server action obtiene la sesión con `requireSession()`. Sin sesión, 401.
2. Valida la entrada con el esquema Zod del módulo.
3. Consulta `can(actor, action, resource)`. Sin permiso, 403.
4. Llama al service, que aplica las reglas de negocio.
5. El service usa el repository dentro de una transacción y escribe el audit log.
6. La action revalida las rutas afectadas y devuelve un resultado tipado.

Las lecturas van por el service desde Server Components. Un service no importa
de `app/` ni de `components/`; un componente no importa un repository.

## Límites del entorno

El proyecto corre en el plan Hobby de Vercel: una sola corrida de cron por día
(`/api/cron/daily`, 03:00 UTC) y previews públicos, así que la base de cada
preview lleva solo datos sintéticos. El timer activo es una entrada con `end`
nulo y el servidor no guarda estado en memoria.
