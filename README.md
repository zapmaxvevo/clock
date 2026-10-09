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
npm run test:integration   # Postgres real, base clock_test
npm run test:e2e           # compila y levanta la app contra la base local
```

El Postgres local está en `compose.yaml`: usuario, contraseña y base `clock`
en el puerto 5432, o sea `postgresql://clock:clock@localhost:5432/clock`. Los
tests de integración usan además la base `clock_test`, que se crea una vez:

```bash
docker compose up -d
docker compose exec postgres psql -U clock -d postgres -c "CREATE DATABASE clock_test"
```

Los e2e, sin `E2E_BASE_URL`, compilan la aplicación y la levantan contra
`DATABASE_URL` (por defecto, la base `clock` de arriba, ya migrada). Así corren
también en CI, con un Postgres de servicio. Con `E2E_BASE_URL` y
`E2E_DATABASE_URL` corren a mano contra un servidor ya levantado, por ejemplo un
preview.

Los e2e entran por un fixture de sesión que evita el login de Google:
`POST /api/auth/test-session/sign-in` con la cabecera `x-test-session`. El
endpoint se registra solo con tres condiciones: `ALLOW_TEST_SESSION=true`, un
`E2E_TEST_SESSION_SECRET` de al menos 32 caracteres, y `VERCEL_ENV` distinto de
`production`. Es opt-in explícito: un entorno que no declara la primera no lo
habilita, así que no se enciende solo en un host donde `VERCEL_ENV` no exista.
Si alguna de esas dos variables llega al entorno de producción, el arranque
falla diciendo cuál sacar, en vez de apagarse en silencio.

Contra el servidor local, la configuración de Playwright las carga sola y
genera un secreto nuevo por corrida, así que CI no necesita ningún secreto. Para
correr contra un preview van a su entorno de Vercel —nunca al de producción—, y
el preview tiene que apuntar a su propia rama de base de datos: el endpoint
fabrica una sesión para cualquier email del dominio y, en el plan Hobby, los
previews son públicos.

Las convenciones de código están en `.claude/skills/code-conventions/SKILL.md`;
los comandos y la estructura, en `CLAUDE.md`.
