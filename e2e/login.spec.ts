import { expect, test } from "@playwright/test";

test("sin sesión, la aplicación lleva al login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Entrar con Google" })).toBeVisible();
});

test("el cron rechaza una llamada sin el secreto", async ({ request }) => {
  const response = await request.get("/api/cron/daily");
  expect(response.status()).toBe(401);
});
