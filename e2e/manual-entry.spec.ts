import { workspaceTimeZone } from "./database";
import { addDays, calendarDayName, dayLabel, todayIn } from "./days";
import { expect, test } from "./session";
import {
  chooseMode,
  clockField,
  dateButton,
  dayTotal,
  descriptionInput,
  entryRow,
  modeSwitch,
  openSecondTab,
  pickDate,
  setClock,
  startTimer,
  todayGroup,
  trackerBar,
  withServerAction,
} from "./tracker-page";

/** El motivo de TT-30, que acompaña al conmutador inactivo. */
const TIMER_RUNNING_HELP = "Detené el timer para agregar tiempo a mano.";

test("cargar una entrada manual de hoy la deja en la lista", async ({ page }) => {
  await page.goto("/");
  await chooseMode(page, "manual");

  // Criterio 3: los cuatro controles de la barra manual y el botón «Agregar»,
  // con la fecha en hoy.
  const bar = trackerBar(page);
  await expect(clockField(bar, "Hora de inicio")).toBeVisible();
  await expect(clockField(bar, "Hora de fin")).toBeVisible();
  await expect(clockField(bar, "Duración")).toBeVisible();
  await expect(dateButton(bar)).toHaveText("Hoy");

  await descriptionInput(bar).fill("reunión de equipo");
  await setClock(bar, "Hora de inicio", "09:00");
  await setClock(bar, "Hora de fin", "10:30");
  // TT-18: mover las horas recalcula la duración.
  await expect(clockField(bar, "Duración")).toHaveValue("1:30");

  const add = bar.getByRole("button", { name: "Agregar" });
  await withServerAction(page, () => add.click());

  // Criterio 7: la entrada aparece en el grupo de su día, con su horario y su
  // duración, y mueve el total.
  const row = entryRow(todayGroup(page), "reunión de equipo");
  await expect(row).toContainText(/09:00 – 10:30\s*1:30/);
  await expect(dayTotal(todayGroup(page))).toHaveText("Total 1:30");

  // Y la barra vuelve al borrador inicial.
  await expect(descriptionInput(bar)).toHaveValue("");
  await expect(dateButton(bar)).toHaveText("Hoy");
  await expect(clockField(bar, "Duración")).toHaveValue("0:00");
});

test("el modo elegido vuelve dibujado desde el servidor", async ({ page }) => {
  await page.goto("/");
  await chooseMode(page, "manual");

  // Criterio 1: la respuesta del servidor ya trae la barra manual, así que al
  // volver a entrar la pantalla no pasa por el modo anterior. Se mira el HTML
  // y no el DOM ya hidratado, que es donde el salto no se vería.
  const response = await page.request.get("/");
  expect(response.ok(), `la pantalla respondió ${response.status()}`).toBeTruthy();
  const html = await response.text();
  expect(html).toContain("Hora de inicio");
  expect(html).not.toContain("Tiempo transcurrido");

  await page.reload();
  const bar = trackerBar(page);
  await expect(bar.getByRole("button", { name: "Agregar" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Iniciar" })).toHaveCount(0);
});

test("con el timer corriendo el conmutador está inactivo, dice por qué y la barra queda en timer", async ({
  page,
}) => {
  await page.goto("/");
  await startTimer(page, "timer en curso");

  // TT-30: no se puede conmutar, y el motivo es un texto visible asociado al
  // control, no un tooltip que un control inactivo no podría mostrar.
  await expect(page.getByRole("button", { name: "Modo manual" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Modo timer" })).toBeDisabled();
  await expect(modeSwitch(page)).toHaveAccessibleDescription(TIMER_RUNNING_HELP);
  await expect(page.getByText(TIMER_RUNNING_HELP)).toBeVisible();

  /*
   * Criterio 2: la barra queda en timer aunque el modo recordado sea manual,
   * como cuando se eligió manual en otra pestaña con el timer ya corriendo. La
   * cookie es la que escribe el conmutador y la recarga la hace llegar al
   * servidor. El conmutador muestra el modo que se ve, no el recordado.
   */
  await page
    .context()
    .addCookies([{ name: "clock.tracker-mode", value: "manual", url: page.url() }]);
  await page.reload();
  const bar = trackerBar(page);
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Agregar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Modo manual" })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Modo manual", pressed: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Modo timer", pressed: true }),
  ).toBeVisible();

  // Al detener vuelve el modo recordado, y el conmutador queda usable: la
  // fase optimista de la parada no lo deja inhabilitado.
  await bar.getByRole("button", { name: "Detener" }).click();
  await expect(bar.getByRole("button", { name: "Agregar" })).toBeVisible();
  await expect(entryRow(todayGroup(page), "timer en curso")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Modo manual", pressed: true }),
  ).toBeEnabled();
  await expect(page.getByText(TIMER_RUNNING_HELP)).toHaveCount(0);

  // Y de vuelta en el modo timer, «Iniciar» también está habilitado.
  await chooseMode(page, "timer");
  await expect(bar.getByRole("button", { name: "Iniciar" })).toBeEnabled();
});

test("con el fin igual al inicio, Agregar está inactivo", async ({ page }) => {
  await page.goto("/");
  await chooseMode(page, "manual");

  const bar = trackerBar(page);
  const add = bar.getByRole("button", { name: "Agregar" });

  // El borrador arranca con las dos horas en la hora actual, así que la
  // duración es cero desde el principio (TT-73).
  await expect(add).toBeDisabled();
  await expect(add).toHaveAccessibleDescription(
    "La entrada tiene que durar al menos un minuto.",
  );

  await setClock(bar, "Hora de inicio", "09:00");
  await setClock(bar, "Hora de fin", "10:00");
  await expect(add).toBeEnabled();

  // Volver a igualar las dos horas lo apaga otra vez.
  await setClock(bar, "Hora de fin", "09:00");
  await expect(clockField(bar, "Duración")).toHaveValue("0:00");
  await expect(add).toBeDisabled();
  await expect(
    page.getByText("La entrada tiene que durar al menos un minuto."),
  ).toBeVisible();
});

test("una entrada de hace treinta días se guarda y avisa que no se ve", async ({
  page,
}) => {
  // El hoy que importa es el del workspace, que es el que dibuja la barra.
  const today = todayIn(await workspaceTimeZone());
  const monthAgo = addDays(today, -30);

  await page.goto("/");
  await chooseMode(page, "manual");
  const bar = trackerBar(page);
  const add = bar.getByRole("button", { name: "Agregar" });

  /*
   * La ventana de la lista se estira hacia atrás hasta el día de la entrada
   * cerrada más nueva que ya empezó, así que si la vieja fuera la única, la
   * ventana la alcanzaría y no habría aviso. Una entrada de hoy, del mismo
   * usuario del test, la deja afuera. Va de 00:00 a 00:01 porque una entrada
   * que todavía no empezó no cuenta para la ventana, y esas son las primeras
   * horas del día: a cualquier hora de la corrida ya pasaron, salvo durante
   * el primer minuto del día del workspace. Se carga por la interfaz: es lo que
   * haría la persona y no toca nada que otro test lea.
   */
  await descriptionInput(bar).fill("entrada de hoy");
  await setClock(bar, "Hora de inicio", "00:00");
  await setClock(bar, "Hora de fin", "00:01");
  await withServerAction(page, () => add.click());
  await expect(entryRow(todayGroup(page), "entrada de hoy")).toBeVisible();

  await descriptionInput(bar).fill("entrada de hace un mes");
  await pickDate(page, bar, monthAgo, today);
  await setClock(bar, "Hora de inicio", "09:00");
  await setClock(bar, "Hora de fin", "10:00");
  await withServerAction(page, () => add.click());

  // Criterio 11: la entrada se creó —la barra volvió al borrador inicial— y
  // el aviso informativo nombra el día en que quedó.
  const notice = page
    .getByRole("status")
    .filter({ hasText: "La entrada se guardó, pero todavía no se ve en la lista." });
  await expect(notice).toContainText(
    `Quedó en el día ${dayLabel(monthAgo, today)}, anterior al tramo que la lista muestra.`,
  );
  await expect(notice.getByRole("button", { name: "Reintentar" })).toHaveCount(0);
  await expect(descriptionInput(bar)).toHaveValue("");
  await expect(dateButton(bar)).toHaveText("Hoy");
  await expect(
    page.getByRole("listitem").filter({ hasText: "entrada de hace un mes" }),
  ).toHaveCount(0);
});

test("con la red caída, el alta manual no ofrece Reintentar: es la única operación del módulo sin reintento", async ({
  page,
}) => {
  await page.goto("/");
  await chooseMode(page, "manual");

  const bar = trackerBar(page);
  await descriptionInput(bar).fill("entrada que no viaja");
  await setClock(bar, "Hora de inicio", "08:00");
  await setClock(bar, "Hora de fin", "09:15");

  await page.route(
    (url) => url.pathname === "/",
    async (route) => {
      if (route.request().headers()["next-action"] !== undefined) {
        await route.abort();
        return;
      }
      await route.continue();
    },
  );

  const add = bar.getByRole("button", { name: "Agregar" });
  await add.click();

  /*
   * TT-109: las otras cinco operaciones del módulo —arrancar, detener, la
   * descripción desde la barra y desde la fila, y borrar— ofrecen «Reintentar»
   * ante una falla de red; esta no. Agregar solo crea, así que si lo que se perdió
   * fue la respuesta, la fila puede estar creada y reintentar la duplicaría
   * sin que nada lo frene, porque TT-82 acepta la superposición.
   */
  const notice = page
    .getByRole("alert")
    .filter({ hasText: "No sabemos si la entrada se guardó." });
  await expect(notice).toContainText(
    "Se perdió la respuesta del servidor. Antes de volver a agregarla, fijate en la lista: puede haberse creado.",
  );
  await expect(page.getByRole("button", { name: "Reintentar" })).toHaveCount(0);

  // Criterio 17: el botón vuelve a su estado anterior y lo tecleado sigue en
  // la barra para poder decidir qué hacer.
  await expect(add).toBeEnabled();
  await expect(descriptionInput(bar)).toHaveValue("entrada que no viaja");
  await expect(clockField(bar, "Hora de inicio")).toHaveValue("08:00");
  await expect(clockField(bar, "Hora de fin")).toHaveValue("09:15");
  await expect(clockField(bar, "Duración")).toHaveValue("1:15");
});

test("teclear el fin y hacer clic en Agregar sin salir del campo crea la entrada con un solo clic", async ({
  page,
}) => {
  await page.goto("/");
  await chooseMode(page, "manual");

  const bar = trackerBar(page);
  const add = bar.getByRole("button", { name: "Agregar" });
  await descriptionInput(bar).fill("un solo clic");
  await setClock(bar, "Hora de inicio", "09:00");
  await setClock(bar, "Hora de fin", "09:00");
  await expect(add).toBeDisabled();

  /*
   * Lo tecleado en el fin todavía no se interpretó: el campo lo hace al
   * salir, y lo que lo hace salir es el mismo clic. Hasta ese momento el
   * borrador dura cero y «Agregar» se ve inactivo. `force` hace el clic que
   * haría una persona, sin esperar a que el botón se vea activo, cosa que sin
   * salir del campo no pasa nunca. Hay un solo clic: si se pierde, la fila no
   * aparece.
   */
  await clockField(bar, "Hora de fin").fill("10:30");
  await add.click({ force: true });

  await expect(entryRow(todayGroup(page), "un solo clic")).toContainText(
    /09:00 – 10:30\s*1:30/,
  );
  await expect(descriptionInput(bar)).toHaveValue("");
});

test("la fecha de la entrada se elige en el calendario solo con el teclado", async ({
  page,
}) => {
  const today = todayIn(await workspaceTimeZone());
  // Una semana atrás y un día adelante: el día que dejan las flechas.
  const target = addDays(today, -6);

  await page.goto("/");
  await chooseMode(page, "manual");
  const bar = trackerBar(page);
  await descriptionInput(bar).fill("fecha con el teclado");
  await setClock(bar, "Hora de inicio", "09:00");
  await setClock(bar, "Hora de fin", "10:00");

  // El calendario abre con el foco en el día elegido, que es hoy.
  await dateButton(bar).focus();
  await page.keyboard.press("Enter");
  const calendar = page.getByRole("grid");
  await expect(
    calendar.getByRole("button", { name: calendarDayName(today) }),
  ).toBeFocused();

  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowRight");
  await expect(
    calendar.getByRole("button", { name: calendarDayName(target) }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dateButton(bar)).toHaveText(dayLabel(target, today));

  await withServerAction(page, () =>
    bar.getByRole("button", { name: "Agregar" }).click(),
  );

  // La entrada quedó en el día elegido y no en hoy.
  const group = page.getByRole("region", { name: dayLabel(target, today), exact: true });
  await expect(entryRow(group, "fecha con el teclado")).toContainText(
    /09:00 – 10:00\s*1:00/,
  );
  await expect(todayGroup(page)).toHaveCount(0);
});

test("después de agregar, el foco vuelve a la descripción para cargar la siguiente", async ({
  page,
}) => {
  await page.goto("/");
  await chooseMode(page, "manual");

  const bar = trackerBar(page);
  await descriptionInput(bar).fill("la primera");
  await setClock(bar, "Hora de inicio", "09:00");
  await setClock(bar, "Hora de fin", "09:30");
  await withServerAction(page, () =>
    bar.getByRole("button", { name: "Agregar" }).click(),
  );
  await expect(entryRow(todayGroup(page), "la primera")).toBeVisible();

  // El clic dejó el foco en «Agregar», y el borrador nuevo lo devuelve a
  // la descripción. Lo que se teclea después ya es la entrada siguiente.
  await expect(descriptionInput(bar)).toBeFocused();
  await page.keyboard.type("la segunda");
  await expect(descriptionInput(bar)).toHaveValue("la segunda");
});

test("un timer que llega con la descripción manual enfocada muestra la suya y no la pisa al salir", async ({
  page,
  email,
  browser,
}) => {
  await page.goto("/");
  await chooseMode(page, "manual");

  const bar = trackerBar(page);
  const field = descriptionInput(bar);
  await field.fill("la agregada");
  await setClock(bar, "Hora de inicio", "09:00");
  await setClock(bar, "Hora de fin", "09:30");
  await withServerAction(page, () =>
    bar.getByRole("button", { name: "Agregar" }).click(),
  );
  await expect(entryRow(todayGroup(page), "la agregada")).toBeVisible();

  // Agregar deja el foco en la descripción, y ahí se empieza la siguiente.
  await expect(field).toBeFocused();
  await page.keyboard.type("a medio escribir");

  // Otro dispositivo de la misma persona arranca un timer. Esta pestaña sigue
  // en manual y con el foco en el campo hasta que se pone al día. El grupo de
  // hoy ya está dibujado, así que se espera la respuesta del arranque: sin
  // eso, el refresco de abajo podría leer el estado de antes del timer.
  const otherPage = await openSecondTab(browser, email);
  await withServerAction(otherPage, () =>
    startTimer(otherPage, "timer del otro dispositivo"),
  );
  await expect(bar.getByRole("button", { name: "Agregar" })).toBeVisible();
  await expect(field).toBeFocused();

  // El refresco sin recarga, el de recuperar el foco. En headless
  // `bringToFront()` no dispara el evento, así que se despacha.
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  // TT-30: la barra pasa a timer, y el campo muestra la descripción del timer
  // y no lo que se escribía para la entrada manual.
  await expect(bar.getByRole("button", { name: "Detener" })).toBeVisible();
  await expect(field).toHaveValue("timer del otro dispositivo");

  /*
   * Salir del campo no escribe nada: el texto es el del servidor. Si saliera
   * una escritura, sería lo de la entrada manual encima del timer. El cambio
   * de barra puede haberse llevado el foco, así que se entra al campo antes
   * de salir con Tab. Se cuentan los pedidos de action desde acá, y la
   * recarga confirma lo que quedó.
   */
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.headers()["next-action"] !== undefined) {
      writes.push(request.postData() ?? "");
    }
  });
  await field.focus();
  await page.keyboard.press("Tab");
  await expect(field).not.toBeFocused();
  expect(writes).toEqual([]);

  await page.reload();
  await expect(descriptionInput(trackerBar(page))).toHaveValue(
    "timer del otro dispositivo",
  );

  await otherPage.context().close();
});
