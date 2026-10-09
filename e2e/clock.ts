/**
 * El reloj emulado de la página, para los recorridos que no pueden dejar que
 * un timer de la pantalla venza por su cuenta.
 */
import type { Page } from "@playwright/test";

/**
 * Margen entre la hora que lee la página y la pausa: el reloj sigue corriendo
 * hasta que `pauseAt` lo frena, y `pauseAt` no acepta un instante pasado.
 */
const PAUSE_MARGIN_MS = 1_000;

/**
 * Detiene el reloj emulado de una página ya cargada con `clock.install()`.
 * `install` solo emula: el tiempo sigue corriendo a la par del real y los
 * timers de la página, como el rebote de la descripción, vencen solos. Desde
 * acá ninguno corre hasta que el test adelanta el reloj.
 */
export async function stopClock(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + PAUSE_MARGIN_MS);
}
