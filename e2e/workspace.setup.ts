import { expect, test as setup } from "@playwright/test";

import { activeMembershipCount, renewWorkspace, setDurationFormat } from "./database";
import { OWNER_EMAIL } from "./environment";
import { signIn } from "./session";

/**
 * Tope de membresías activas del workspace de los e2e. `/equipo` las lista
 * todas, y por encima de esto el recorrido que asciende a alguien no llega a
 * tiempo (§8 del contrato de R8): se corta acá, con su causa, en vez de
 * aparecer como un recorrido inestable.
 */
const MAX_ACTIVE_MEMBERSHIPS = 1500;

/**
 * El workspace lo crea la primera sesión que entra. Si eso pasara dentro de
 * los tests, dos que arrancan a la vez crearían uno cada uno y la lectura del
 * workspace dejaría de ser determinista. Entrar una vez acá, antes de que
 * arranque el paralelo, deja uno solo.
 *
 * Después se renueva: en una base que se reusa, el workspace es de una
 * corrida anterior, y los recorridos tienen que probar el de una base nueva,
 * creado hoy. Se hace acá, una vez y antes del paralelo, porque el workspace
 * es de todos los tests y ninguno debería tocarlo.
 */
setup("el workspace existe antes de los tests", async ({ page }) => {
  await signIn(page.context(), OWNER_EMAIL);
  await page.goto("/");

  await expect(page.getByRole("region", { name: "Rastreador" })).toBeVisible();

  await renewWorkspace();
  // Los specs de `chromium` afirman el compacto. Una corrida cortada en medio
  // del proyecto del completo, o su receta a mano, dejan el workspace en
  // `full`: se vuelve acá, antes del paralelo (D-WS2a-12 de WS2a).
  await setDurationFormat("compact");

  const active = await activeMembershipCount();
  if (active > MAX_ACTIVE_MEMBERSHIPS) {
    throw new Error(
      [
        `El workspace de los e2e tiene ${active} membresías activas y el tope es ${MAX_ACTIVE_MEMBERSHIPS}.`,
        "Cada corrida suma las suyas en una base que se reusa, y /equipo las lista todas: por encima del tope, el recorrido que asciende a alguien no llega a tiempo.",
        "Seguí en una base nueva, sin tocar la de desarrollo (clock), que es la de los e2e por omisión:",
        '  1. docker compose exec postgres psql -U clock -d postgres -c "CREATE DATABASE clock_e2e_<fecha>"',
        "  2. DATABASE_URL=postgresql://clock:clock@localhost:5432/clock_e2e_<fecha> npm run db:migrate",
        "  3. DATABASE_URL=postgresql://clock:clock@localhost:5432/clock_e2e_<fecha> npm run test:e2e, sin otro servidor en :3000 (pará el de desarrollo): Playwright reusa el que encuentre, y uno contra clock escribiría ahí.",
        "E2E_DATABASE_URL solo cuenta con E2E_BASE_URL, contra un servidor ya levantado; en local alcanza con DATABASE_URL.",
      ].join("\n"),
    );
  }
});
