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
npm run test:e2e        # requiere E2E_BASE_URL
```

Las convenciones de código están en `.claude/skills/code-conventions/SKILL.md`;
los comandos y la estructura, en `CLAUDE.md`.
