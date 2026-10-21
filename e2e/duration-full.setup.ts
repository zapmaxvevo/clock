import { expect, test as setup } from "@playwright/test";

import { durationFormatOf, setDurationFormat } from "./database";

/**
 * Pone el workspace de los e2e en el completo para los `*.full.spec.ts`
 * (D-WS2a-12 de WS2a). Corre cuando terminó toda la suite de `chromium`, que
 * afirma el compacto; su teardown lo vuelve a `compact`, también después de
 * `duration-switch`. Va por la base: el selector de `/configuracion` lo prueba
 * `duration-switch`, y el completo no depende de él (D-WS2b-12 de WS2b).
 */
setup("el workspace muestra las duraciones en el completo", async () => {
  await setDurationFormat("full");
  expect(await durationFormatOf()).toBe("full");
});
