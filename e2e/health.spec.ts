import { expect, test } from "@playwright/test";

test("health page shows the database as operational", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Petey" })).toBeVisible();
  await expect(page.getByTestId("database-status")).toHaveText("Operational");
});

test("health API reports ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { status: string };
  expect(body.status).toBe("ok");
});
