import { expect, test, type Page } from "@playwright/test";
import * as OTPAuth from "otpauth";

// Phase 1 acceptance: each role signs in and reaches only its own area, and a technician
// enrolls in two-factor and signs in with a code and with a recovery code.
// The steps build on each other, so they run in order against one fresh install.
test.describe.configure({ mode: "serial" });

const PASSWORD = "correct horse battery";
const admin = { name: "Ada Admin", email: "ada@example.test" };
const tech = { name: "Tess Tech", email: "tess@example.test" };
const requester = { name: "Rex Requester", email: "rex@example.test" };

let totpSecret = "";
let recoveryCodes: string[] = [];

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function signOut(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
}

function totpCode(): string {
  return new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(totpSecret) }).generate();
}

test("first-run setup creates the admin and signs them in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup$/);
  await page.getByLabel("Name").fill(admin.name);
  await page.getByLabel("Email").fill(admin.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create admin account" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Administration" })).toBeVisible();

  // Setup cannot be run a second time.
  await page.goto("/setup");
  await expect(page).not.toHaveURL(/\/setup$/);
});

test("the admin creates a technician and a requester", async ({ page }) => {
  await signIn(page, admin.email);
  await expect(page).toHaveURL(/\/admin$/);

  for (const [user, role] of [
    [tech, "Technician"],
    [requester, "Requester"],
  ] as const) {
    await page.goto("/admin/users/new");
    await page.getByLabel("Name").fill(user.name);
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Role").selectOption({ label: role });
    await page.getByLabel("Initial password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText("User created.")).toBeVisible();
  }

  await page.goto("/admin/users");
  await expect(page.getByRole("link", { name: tech.name })).toBeVisible();
  await expect(page.getByRole("link", { name: requester.name })).toBeVisible();
});

test("a requester reaches only the portal", async ({ page }) => {
  await signIn(page, requester.email);
  await expect(page).toHaveURL(/\/portal$/);
  await expect(page.getByRole("link", { name: "Agent" })).toHaveCount(0);

  for (const path of ["/agent", "/admin", "/admin/users"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/portal$/);
  }
});

test("a technician reaches the agent area and portal but not admin", async ({ page }) => {
  await signIn(page, tech.email);
  await expect(page).toHaveURL(/\/agent$/);
  await page.goto("/portal");
  await expect(page).toHaveURL(/\/portal$/);
  for (const path of ["/admin", "/admin/groups"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/agent$/);
  }
});

test("an admin reaches every area", async ({ page }) => {
  await signIn(page, admin.email);
  await expect(page).toHaveURL(/\/admin$/);
  for (const path of ["/admin", "/agent", "/portal"]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  }
});

test("signed-out visitors are sent to sign-in", async ({ page }) => {
  for (const path of ["/portal", "/agent", "/admin", "/account/security"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in$/);
  }
});

test("a technician enrolls in two-factor sign-in", async ({ page }) => {
  await signIn(page, tech.email);
  await expect(page).toHaveURL(/\/agent$/);
  await page.goto("/account/security");
  await page.getByRole("button", { name: "Set up two-factor sign-in" }).click();
  await page.locator("#tf-password").fill(PASSWORD);
  await page.getByRole("button", { name: "Set up two-factor sign-in" }).click();

  await expect(page.getByRole("img", { name: "QR code for your authenticator app" })).toBeVisible();
  totpSecret = (await page.getByTestId("totp-secret").textContent())?.trim() ?? "";
  recoveryCodes = await page.getByTestId("recovery-codes").locator("li").allTextContents();
  expect(totpSecret).not.toBe("");
  expect(recoveryCodes.length).toBeGreaterThan(0);

  await page.getByLabel("Authentication code").fill(totpCode());
  await page.getByRole("button", { name: "Confirm and turn on" }).click();
  await expect(page).toHaveURL(/\/agent$/);
});

test("the technician signs in with an authenticator code", async ({ page }) => {
  await signIn(page, tech.email);
  await expect(page).toHaveURL(/\/sign-in\/two-factor$/);

  await page.getByLabel("Authentication code").fill("000000");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByText("That code didn't work")).toBeVisible();

  await page.getByLabel("Authentication code").fill(totpCode());
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/agent$/);
  await signOut(page);
});

test("the technician signs in with a recovery code", async ({ page }) => {
  await signIn(page, tech.email);
  await expect(page).toHaveURL(/\/sign-in\/two-factor$/);
  await page.getByRole("button", { name: "Use a recovery code instead" }).click();
  await page.getByLabel("Recovery code").fill(recoveryCodes[0] ?? "");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/agent$/);
});

test("a deactivated user is signed out and can no longer sign in", async ({ page, browser }) => {
  const requesterPage = await browser.newPage();
  await signIn(requesterPage, requester.email);
  await expect(requesterPage).toHaveURL(/\/portal$/);

  await signIn(page, admin.email);
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/users");
  await page.getByRole("link", { name: requester.name }).click();
  await page.getByLabel("Account is active").uncheck();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved")).toBeVisible();

  // Their open session no longer works...
  await requesterPage.reload();
  await expect(requesterPage).toHaveURL(/\/sign-in$/);
  // ...and they can't start a new one.
  await signIn(requesterPage, requester.email);
  await expect(requesterPage.getByText("Email or password is incorrect.")).toBeVisible();
  await requesterPage.close();
});

test("when two-factor is required, staff without it must enroll first", async ({ page }) => {
  await signIn(page, admin.email);
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/settings/security");
  await page.getByLabel("Require two-factor sign-in for technicians and admins").check();
  await page.getByRole("button", { name: "Save" }).click();

  // The admin has no two-factor yet, so they are sent to enroll straight away...
  await expect(page).toHaveURL(/\/account\/security\?required=1$/);
  await expect(page.getByText("Your administrator requires two-factor sign-in")).toBeVisible();
  // ...and every area keeps sending them there until they do.
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/account\/security\?required=1$/);
});
