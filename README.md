# Clock

Carga de horas y administración interna con paridad funcional con Clockify.

## Puesta en marcha

```bash
npm install
cp .env.example .env     # completar los valores
npm run db:migrate
npm run dev
```

`GOOGLE_WORKSPACE_DOMAINS` lista los dominios de Google Workspace habilitados.
`WORKSPACE_OWNER_EMAIL` es el correo que arranca el workspace en una base vacía
y queda como su owner. Con el workspace creado, todos entran por invitación
desde `/equipo`, también este correo.

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

Cada corrida suma personas al workspace de los e2e, y en una base que se reusa
se acumulan. Por encima de 1.500 membresías activas, el setup corta antes de
los recorridos: `/equipo` las lista todas y el recorrido que asciende a alguien
no llega a tiempo. Para seguir sin tocar la base de desarrollo, se crea y se
migra una base nueva, y la suite corre con ese `DATABASE_URL`:

```bash
docker compose exec postgres psql -U clock -d postgres -c "CREATE DATABASE clock_e2e_<fecha>"
DATABASE_URL=postgresql://clock:clock@localhost:5432/clock_e2e_<fecha> npm run db:migrate
DATABASE_URL=postgresql://clock:clock@localhost:5432/clock_e2e_<fecha> npm run test:e2e
```

La última línea corre **sin otro servidor en el puerto 3000** (pará el de
desarrollo): en local, Playwright reusa el que encuentre ahí, y uno levantado
contra `clock` haría que el login de prueba cree usuarios, sesiones y
membresías en la base de desarrollo. `E2E_DATABASE_URL` solo cuenta con
`E2E_BASE_URL`, contra un servidor ya levantado; en local alcanza con
`DATABASE_URL`.

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
