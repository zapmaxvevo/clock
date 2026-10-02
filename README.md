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
  -e POSTGRES_DB=clock -p 5432:5432 postgres:17-alpine
docker exec clock-pg psql -U clock -d postgres -c "CREATE DATABASE clock_test"
```

Los e2e entran por un fixture de sesión que evita el login de Google:
`POST /api/auth/test-session/sign-in` con la cabecera `x-test-session`. El
endpoint solo se registra cuando `E2E_TEST_SESSION_SECRET` está cargada y
`VERCEL_ENV` no es `production`, así que existe en local y en preview y nunca
en producción. Esa variable va al entorno de preview de Vercel y al secreto
`E2E_TEST_SESSION_SECRET` del repositorio para que el job de CI la use.

Las convenciones de código están en `.claude/skills/code-conventions/SKILL.md`;
los comandos y la estructura, en `CLAUDE.md`.
