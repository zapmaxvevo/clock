# Clock

Carga de horas y administración interna con paridad funcional con Clockify.

## Puesta en marcha

```bash
npm install
cp .env.example .env     # completar los valores
npm run db:migrate
npm run dev
```

`GOOGLE_WORKSPACE_DOMAINS` lista los dominios de Google Workspace habilitados y
`EXTERNAL_INVITE_EMAILS` los invitados externos. `WORKSPACE_OWNER_EMAIL` define
qué cuenta queda como owner del workspace la primera vez que entra.

## Verificación

```bash
npm run lint
npm run typecheck
npm test
npm run test:integration   # Postgres real; levanta con docker start clock-pg
npm run test:e2e           # usa E2E_BASE_URL si hay un servidor corriendo
```

Los tests de integración corren contra la base `clock_test` de un Postgres
local:

```bash
docker run -d --name clock-pg -e POSTGRES_USER=clock -e POSTGRES_PASSWORD=clock \
  -e POSTGRES_DB=clock -p 5432:5432 postgres:18-alpine
docker exec clock-pg psql -U clock -d postgres -c "CREATE DATABASE clock_test"
```

Los e2e entran por un fixture de sesión que evita el login de Google:
`POST /api/auth/test-session/sign-in` con la cabecera `x-test-session`. El
endpoint se registra solo con tres condiciones: `ALLOW_TEST_SESSION=true`, un
`E2E_TEST_SESSION_SECRET` de al menos 32 caracteres, y `VERCEL_ENV` distinto de
`production`. Es opt-in explícito: un entorno que no declara la primera no lo
habilita, así que no se enciende solo en un host donde `VERCEL_ENV` no exista.
Si alguna de esas dos variables llega al entorno de producción, el arranque
falla diciendo cuál sacar, en vez de apagarse en silencio.

Las dos van al entorno de **preview** de Vercel —nunca al de producción— y al
secreto `E2E_TEST_SESSION_SECRET` del repositorio para el job de CI. El preview
tiene que apuntar a su propia rama de base de datos: el endpoint fabrica una
sesión para cualquier email del dominio y, en el plan Hobby, los previews son
públicos.

Las convenciones de código están en `.claude/skills/code-conventions/SKILL.md`;
los comandos y la estructura, en `CLAUDE.md`.
