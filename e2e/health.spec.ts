import { expect, test } from "@playwright/test";

test("status page shows the database as operational", async ({ page }) => {
  await page.goto("/status");
  await expect(page.getByRole("heading", { name: "Petey" })).toBeVisible();
  await expect(page.getByTestId("database-status")).toHaveText("Operational");
});

test("health API reports ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { status: string };
  expect(body.status).toBe("ok");
});

test("sign-in page fits a phone screen without sideways scrolling", async ({ page }) => {
  await page.goto("/sign-in");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
