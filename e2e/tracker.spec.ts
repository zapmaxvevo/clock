import type { Request } from "@playwright/test";

import { expect, test } from "./session";
import {
  backgroundRgb,
  dayTotal,
  deleteEntry,
  deleteEntryAndSettle,
  descriptionInput,
  editDescriptionButton,
  elapsedCounter,
  elapsedOf,
  entryRow,
  openSecondTab,
  startTimer,
  stopTimer,
  todayGroup,
  trackerBar,
  withServerAction,
} from "./tracker-page";

/** Cuánto se le da al contador para llegar a un valor, sin esperas fijas. */
const COUNTER_TIMEOUT_MS = 15_000;

test("sin entradas ni timer, la pantalla invita a empezar", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Todavía no cargaste horas")).toBeVisible();
  await expect(
    page.getByText("Escribí en qué estás trabajando y tocá Iniciar."),
  ).toBeVisible();

  const bar = trackerBar(page);
  await expect(bar.getByRole("button", { name: "Iniciar" })).toBeVisible();
  await expect(elapsedCounter(bar)).toHaveText("0:00:00");
  await expect(descriptionInput(bar)).toHaveAttribute(
    "placeholder",
    "¿En qué estás trabajando?",
  );
});

test("el timer arranca sin proyecto, cuenta sola y sobrevive a la recarga", async ({
  page,
}) => {
  await page.goto("/");
  await startTimer(page, "revisar la paridad");

  const bar = trackerBar(page);
  await expect(bar.getByText("Sin proyecto")).toBeVisible();

  // TT-24: con el timer corriendo, el botón de detener es rojo. El color
  // llega por una transición, así que se espera a que el rojo domine en vez
  // de medir el primer cuadro.
  await expect
    .poll(async () => {
      const { red, green, blue } = await backgroundRgb(
        bar.getByRole("button", { name: "Detener" }),
      );
      return red > green && red > blue;
    })
    .toBe(true);

  const counter = elapsedCounter(bar);
  await expect
    .poll(() => elapsedOf(counter), { timeout: COUNTER_TIMEOUT_MS })
    .toBeGreaterThanOrEqual(2);

  // TT-31: el contador avanza sin pedirle nada al servidor. Se empieza a
  // contar peticiones con la pantalla ya asentada, para no contar las de la
  // carga.
  const beforeCount = await elapsedOf(counter);
  const requests: string[] = [];
  const record = (request: Request): void => {
    requests.push(request.url());
  };
  page.on("request", record);
  await expect
    .poll(() => elapsedOf(counter), { timeout: COUNTER_TIMEOUT_MS })
    .toBeGreaterThanOrEqual(beforeCount + 2);
  page.off("request", record);
  expect(requests).toEqual([]);

  const beforeReload = await elapsedOf(counter);

  // TT-38 y criterio 9: la barra vuelve ya con la descripción y el contador en
  // su valor, sin pasar por 0:00:00. Una sola lectura, apenas vuelve la
  // recarga: una que reintentara se cumpliría igual con el contador en cero.
  await page.reload();
  const reloaded = elapsedCounter(trackerBar(page));
  expect(await elapsedOf(reloaded)).toBeGreaterThanOrEqual(beforeReload);
  await expect(trackerBar(page).getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(descriptionInput(trackerBar(page))).toHaveValue("revisar la paridad");
});

test("el total del día sube junto con el contador", async ({ page }) => {
  // El total se muestra en h:mm, así que el primer cambio visible llega al
  // minuto de transcurrido. El reloj emulado lo adelanta: el test no espera
  // ese minuto y tampoco lo simula con una pausa.
  await page.clock.install();
  await page.goto("/");
  await startTimer(page, "timer que suma al total");

  const today = todayGroup(page);
  await expect(dayTotal(today)).toHaveText("Total 0:00");

  // El salto del reloj dispara también la revalidación de los 60 segundos,
  // que traería un `serverNow` nuevo y devolvería el contador a cero. Se la
  // retiene para que lo observado sea el transcurrido del cliente; de esa
  // revalidación se ocupa su propio recorrido.
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    (url) => url.pathname === "/",
    async (route) => {
      await held;
      await route.continue();
    },
  );

  await page.clock.fastForward(61_000);

  // TT-46: el total del día del timer activo incluye el transcurrido y sube
  // junto con el contador, y se queda ahí.
  await expect(dayTotal(today)).toHaveText("Total 0:01");
  await expect(elapsedCounter(trackerBar(page))).toHaveText(/^0:01:\d{2}$/);
  await expect(dayTotal(today)).toHaveText("Total 0:01");
  release();
});

test("una entrada sin descripción se muestra como «Sin descripción»", async ({
  page,
}) => {
  await page.goto("/");

  const bar = trackerBar(page);
  await bar.getByRole("button", { name: "Iniciar" }).click();
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await stopTimer(page, "Sin descripción");

  // TT-50, TT-93 y TT-94: la fila nombra lo que falta y sigue siendo normal.
  const row = entryRow(todayGroup(page), "Sin descripción");
  await expect(editDescriptionButton(todayGroup(page), "Sin descripción")).toBeVisible();
  await expect(row).toContainText("Sin proyecto");
  await expect(row).toContainText(/\d{1,2}:\d{2} – \d{1,2}:\d{2}\s*0:00/);
});

test("detener el timer deja la entrada en el día con su duración", async ({ page }) => {
  await page.goto("/");
  await startTimer(page, "escribir el informe");
  await stopTimer(page, "escribir el informe");

  const row = entryRow(todayGroup(page), "escribir el informe");
  await expect(row).toBeVisible();
  // TT-49: hora de inicio, hora de fin y duración, en ese orden. TT-101:
  // detenida dentro del mismo minuto, la duración se muestra 0:00.
  await expect(row).toContainText(/\d{1,2}:\d{2} – \d{1,2}:\d{2}\s*0:00/);

  await expect(elapsedCounter(trackerBar(page))).toHaveText("0:00:00");
  await expect(page.getByText("Todavía no cargaste horas")).toBeHidden();
});

test("la descripción de una entrada se edita en la fila y queda guardada", async ({
  page,
}) => {
  await page.goto("/");
  await startTimer(page, "borrador del informe");
  await stopTimer(page, "borrador del informe");

  // La escritura se retiene hasta haber visto la fila atenuada. Sin eso el
  // estado en vuelo dura lo que tarde el servidor y la afirmación quedaría
  // atada a esa carrera (TT-54).
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    (url) => url.pathname === "/",
    async (route) => {
      if (route.request().headers()["next-action"] !== undefined) {
        await held;
      }
      await route.continue();
    },
  );

  const today = todayGroup(page);
  await editDescriptionButton(today, "borrador del informe").click();

  // Con la fila en edición la descripción vive en el valor del campo, así que
  // el filtro por texto ya no la encuentra: el campo se busca en el grupo.
  const field = descriptionInput(today);
  await field.fill("informe corregido");
  await field.press("Enter");

  const row = entryRow(today, "informe corregido");
  await expect(row).toHaveAttribute("aria-busy", "true");
  release();

  await expect(editDescriptionButton(today, "informe corregido")).toBeVisible();
  // Cuando la fila deja de estar atenuada el servidor ya respondió, y la
  // recarga lee el estado guardado.
  await expect(row).toHaveAttribute("aria-busy", "false");

  await page.reload();
  await expect(
    editDescriptionButton(todayGroup(page), "informe corregido"),
  ).toBeVisible();
  await expect(
    editDescriptionButton(todayGroup(page), "borrador del informe"),
  ).toBeHidden();
});

test("Esc descarta la edición de la descripción", async ({ page }) => {
  await page.goto("/");
  await startTimer(page, "texto original");
  await stopTimer(page, "texto original");

  const today = todayGroup(page);
  await editDescriptionButton(today, "texto original").click();

  const field = descriptionInput(today);
  await field.fill("texto descartado");
  await field.press("Escape");

  await expect(editDescriptionButton(today, "texto original")).toBeVisible();

  await page.reload();
  await expect(editDescriptionButton(todayGroup(page), "texto original")).toBeVisible();
});

test("borrar una entrada pide confirmación y no se puede deshacer", async ({ page }) => {
  await page.goto("/");
  await startTimer(page, "entrada a borrar");
  await stopTimer(page, "entrada a borrar");

  const today = todayGroup(page);
  await today
    .getByRole("button", { name: "Acciones de la entrada «entrada a borrar»" })
    .click();
  await page.getByRole("menuitem", { name: "Borrar" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("¿Borrar esta entrada?");
  await expect(dialog).toContainText("entrada a borrar");

  // Cancelar deja la entrada donde estaba (TT-60).
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toBeHidden();
  await expect(entryRow(todayGroup(page), "entrada a borrar")).toBeVisible();

  await deleteEntry(page, "entrada a borrar");

  // TT-61: la fila se va y al volver a cargar sigue sin estar. El estado vacío
  // lo dibuja el servidor, así que esperarlo es esperar a que el borrado esté
  // escrito.
  await expect(page.getByText("entrada a borrar")).toBeHidden();
  await expect(page.getByText("Todavía no cargaste horas")).toBeVisible();

  await page.reload();
  await expect(page.getByText("entrada a borrar")).toBeHidden();
  await expect(page.getByText("Todavía no cargaste horas")).toBeVisible();
});

test("arrancar un segundo timer cierra el primero", async ({ page, email, browser }) => {
  // La barra alterna entre «Iniciar» y «Detener», así que el segundo arranque
  // solo llega desde una pestaña que todavía no vio el timer.
  await page.goto("/");
  await expect(trackerBar(page).getByRole("button", { name: "Iniciar" })).toBeVisible();

  const otherPage = await openSecondTab(browser, email);
  await startTimer(otherPage, "primer timer");

  await startTimer(page, "segundo timer");

  // TT-35: la vieja queda cerrada en la lista y la nueva es la única abierta.
  await expect(entryRow(todayGroup(page), "primer timer")).toBeVisible();
  await expect(descriptionInput(trackerBar(page))).toHaveValue("segundo timer");

  await otherPage.reload();
  await expect(
    trackerBar(otherPage).getByRole("button", { name: "Detener" }),
  ).toBeVisible();
  await expect(descriptionInput(trackerBar(otherPage))).toHaveValue("segundo timer");
  await expect(entryRow(todayGroup(otherPage), "primer timer")).toHaveCount(1);
  await expect(entryRow(todayGroup(otherPage), "segundo timer")).toHaveCount(0);

  await otherPage.context().close();
});

test("detener un timer ya detenido avisa y deja la pantalla al día", async ({
  page,
  email,
  browser,
}) => {
  await page.goto("/");
  await startTimer(page, "timer a detener");

  const otherPage = await openSecondTab(browser, email);
  await stopTimer(otherPage, "timer a detener");

  // Esta pestaña todavía lo muestra corriendo: es el caso de TT-41.
  const bar = trackerBar(page);
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await bar.getByRole("button", { name: "Detener" }).click();

  await expect(page.getByText("No se pudo detener el timer.")).toBeVisible();
  await expect(page.getByText("Este timer ya había sido detenido.")).toBeVisible();

  // La action revalida `/` también al fallar: sin eso la barra volvería a
  // mostrar el timer corriendo al deshacerse la vista optimista.
  await expect(bar.getByRole("button", { name: "Iniciar" })).toBeVisible();
  await expect(elapsedCounter(bar)).toHaveText("0:00:00");
  await expect(entryRow(todayGroup(page), "timer a detener")).toBeVisible();

  await otherPage.context().close();
});

test("borrar una entrada ya borrada avisa y deja la lista al día", async ({
  page,
  email,
  browser,
}) => {
  await page.goto("/");
  await startTimer(page, "entrada que sobrevive");
  await stopTimer(page, "entrada que sobrevive");
  await startTimer(page, "entrada ya borrada");
  await stopTimer(page, "entrada ya borrada");

  const otherPage = await openSecondTab(browser, email);
  await deleteEntryAndSettle(otherPage, "entrada ya borrada");

  // Esta pestaña todavía tiene la fila: es el caso de TT-103.
  await deleteEntry(page, "entrada ya borrada");

  await expect(page.getByText("No se pudo borrar la entrada.")).toBeVisible();
  await expect(page.getByText("Esa entrada ya no existe.")).toBeVisible();

  // La action revalida `/` también al fallar: sin eso la fila volvería a
  // aparecer al deshacerse la vista optimista. La que quedaba sigue en su
  // lugar, y es la que mantiene el grupo —y el aviso— en pantalla.
  await expect(entryRow(todayGroup(page), "entrada ya borrada")).toHaveCount(0);
  await expect(entryRow(todayGroup(page), "entrada que sobrevive")).toBeVisible();

  await otherPage.context().close();
});

test("editar una entrada borrada avisa y la saca de la lista", async ({
  page,
  email,
  browser,
}) => {
  await page.goto("/");
  await startTimer(page, "entrada que sobrevive");
  await stopTimer(page, "entrada que sobrevive");
  await startTimer(page, "entrada fantasma");
  await stopTimer(page, "entrada fantasma");

  const otherPage = await openSecondTab(browser, email);
  await deleteEntryAndSettle(otherPage, "entrada fantasma");

  // Esta pestaña todavía tiene la fila: es el caso de TT-103.
  const today = todayGroup(page);
  await editDescriptionButton(today, "entrada fantasma").click();
  const field = descriptionInput(today);
  await field.fill("nombre nuevo");
  await field.press("Enter");

  await expect(page.getByText("No se pudo guardar la descripción.")).toBeVisible();
  await expect(page.getByText("Esa entrada ya no existe.")).toBeVisible();

  // La action revalida `/` también al fallar: sin eso la fila volvería con su
  // descripción vieja al deshacerse la vista optimista.
  await expect(entryRow(today, "entrada fantasma")).toHaveCount(0);
  await expect(entryRow(today, "nombre nuevo")).toHaveCount(0);
  await expect(entryRow(today, "entrada que sobrevive")).toBeVisible();

  await otherPage.context().close();
});

test("el rebote guarda la descripción del timer sin tocar nada más", async ({ page }) => {
  // Con el reloj emulado el rebote corre solo cuando el test lo adelanta, así
  // que el guardado no puede venir de ningún otro disparo.
  await page.clock.install();
  await page.goto("/");
  await startTimer(page, "texto inicial");

  const field = descriptionInput(trackerBar(page));
  await field.fill("guardado por rebote");

  // TT-04: 500 ms después de la última tecla, sin salir del campo ni Enter.
  await withServerAction(page, () => page.clock.fastForward(600));

  await page.reload();
  const bar = trackerBar(page);
  await expect(descriptionInput(bar)).toHaveValue("guardado por rebote");
  // El guardado no detiene el timer (TT-27).
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
});

test("Enter y salir del campo también guardan la descripción", async ({ page }) => {
  // El reloj queda detenido: el rebote nunca corre, así que lo que guarde
  // tiene que venir de Enter o de la salida del campo.
  await page.clock.install();
  await page.goto("/");
  await startTimer(page, "texto inicial");

  const field = descriptionInput(trackerBar(page));

  await field.fill("guardado con enter");
  await withServerAction(page, () => field.press("Enter"));

  await field.fill("guardado al salir");
  await withServerAction(page, () => field.blur());

  await page.reload();
  await expect(descriptionInput(trackerBar(page))).toHaveValue("guardado al salir");
});

test("el otro dispositivo se pone al día al recuperar el foco", async ({
  page,
  email,
  browser,
}) => {
  await page.goto("/");
  await startTimer(page, "texto inicial");

  // TT-39: el segundo dispositivo muestra el mismo timer corriendo.
  const otherPage = await openSecondTab(browser, email);
  const otherBar = trackerBar(otherPage);
  await expect(otherBar.getByRole("button", { name: "Detener" })).toBeVisible();
  const otherField = descriptionInput(otherBar);
  await expect(otherField).toHaveValue("texto inicial");

  await otherField.fill("editado en el otro");
  await withServerAction(otherPage, () => otherField.press("Enter"));

  // Esta pestaña sigue con el texto viejo hasta que recupera el foco. En
  // headless `bringToFront()` no dispara el evento, así que se despacha.
  const field = descriptionInput(trackerBar(page));
  await expect(field).toHaveValue("texto inicial");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  // TT-40: se pone al día sin que nadie recargue.
  await expect(field).toHaveValue("editado en el otro");

  await otherPage.context().close();
});

test("la pantalla se pone al día sola dentro de los 60 segundos", async ({
  page,
  email,
  browser,
}) => {
  await page.clock.install();
  await page.goto("/");
  await startTimer(page, "texto inicial");

  const otherPage = await openSecondTab(browser, email);
  const otherField = descriptionInput(trackerBar(otherPage));
  await expect(otherField).toHaveValue("texto inicial");
  await otherField.fill("editado en el otro");
  await withServerAction(otherPage, () => otherField.press("Enter"));

  const field = descriptionInput(trackerBar(page));
  await expect(field).toHaveValue("texto inicial");

  // TT-40: sin foco y sin recarga, la revalidación periódica la pone al día.
  await page.clock.fastForward(61_000);
  await expect(field).toHaveValue("editado en el otro");

  await otherPage.context().close();
});

test("lo tecleado con el foco puesto sobrevive a una revalidación", async ({
  page,
  email,
  browser,
}) => {
  // El reloj detenido saca del medio el rebote: si el campo conserva lo
  // tecleado no es porque una escritura lo haya fijado.
  await page.clock.install();
  await page.goto("/");
  await startTimer(page, "entrada previa");
  await stopTimer(page, "entrada previa");
  await startTimer(page, "texto inicial");

  // El otro dispositivo cambia dos cosas: la descripción del timer y la
  // lista. La lista es la que deja ver que la revalidación llegó y se aplicó.
  const otherPage = await openSecondTab(browser, email);
  await deleteEntryAndSettle(otherPage, "entrada previa");
  const otherField = descriptionInput(trackerBar(otherPage));
  await expect(otherField).toHaveValue("texto inicial");
  await otherField.fill("editado en el otro");
  await withServerAction(otherPage, () => otherField.press("Enter"));

  const field = descriptionInput(trackerBar(page));
  await field.fill("lo que estoy escribiendo");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  await expect(entryRow(todayGroup(page), "entrada previa")).toHaveCount(0);
  await expect(field).toHaveValue("lo que estoy escribiendo");

  // Y al salir del campo tampoco lo pisa: el valor que llegó ya quedó dado
  // por visto.
  await withServerAction(page, () => field.blur());
  await expect(field).toHaveValue("lo que estoy escribiendo");

  await otherPage.context().close();
});

test("reescribir el mismo texto después de un fallo de red lo guarda", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  await startTimer(page, "texto inicial");

  // La red se cae solo para la escritura, y solo la primera vez.
  let failing = true;
  await page.route(
    (url) => url.pathname === "/",
    async (route) => {
      if (failing && route.request().headers()["next-action"] !== undefined) {
        await route.abort();
        return;
      }
      await route.continue();
    },
  );

  const field = descriptionInput(trackerBar(page));
  await field.fill("mismo texto");
  await field.press("Enter");

  // TT-89 y TT-90: el campo vuelve al valor del servidor y aparece el aviso.
  await expect(page.getByText("No se pudo guardar la descripción.")).toBeVisible();
  await expect(
    page.getByText("No se pudo guardar. Revisá la conexión y volvé a intentar."),
  ).toBeVisible();
  await expect(field).toHaveValue("texto inicial");

  // El mismo texto otra vez sí se manda: nada lo recuerda como ya enviado.
  failing = false;
  await field.fill("mismo texto");
  await withServerAction(page, () => field.press("Enter"));

  await page.reload();
  await expect(descriptionInput(trackerBar(page))).toHaveValue("mismo texto");
});
