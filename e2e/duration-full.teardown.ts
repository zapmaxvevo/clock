import { expect, test as teardown } from "@playwright/test";

import { durationFormatOf, setDurationFormat } from "./database";

/**
 * Vuelve el workspace de los e2e al compacto cuando terminaron los
 * `*.full.spec.ts` y los `*.switch.spec.ts`, pasen o no (D-WS2a-12 de WS2a,
 * D-WS2b-12 de WS2b): una base que se reusa queda como la deja el arranque.
 * Si la corrida se corta antes, lo vuelve el setup de la siguiente.
 */
teardown("el workspace vuelve al compacto", async () => {
  await setDurationFormat("compact");
  expect(await durationFormatOf()).toBe("compact");
});
