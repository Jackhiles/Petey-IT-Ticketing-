import { createFirstAdmin, createUser } from "@petey/core";
import { resetDatabase } from "@petey/db/testing";
import { expect, test, type Locator, type Page } from "@playwright/test";

// Phase 2a acceptance: a technician takes a ticket from new to closed, and every change
// appears in its history. The steps build on each other on one fresh install.
test.describe.configure({ mode: "serial" });

const PASSWORD = "correct horse battery";
const admin = { name: "Ada Admin", email: "ada@example.test" };
const tech = { name: "Tess Tech", email: "tess@example.test" };
const requester = { name: "Rex Requester", email: "rex@example.test" };
const SUBJECT = "Laptop will not charge";

let ticketUrl = "";

async function signIn(page: Page, email: string, home: RegExp): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(home);
}

/**
 * Drags with real mouse steps. Chromium only starts a native HTML drag after the pointer
 * moves a little with the button held, which locator.dragTo() does not always do.
 */
async function dragCard(page: Page, card: Locator, column: Locator): Promise<void> {
  const from = await card.boundingBox();
  const to = await column.boundingBox();
  if (!from || !to) throw new Error("card or column not visible");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 - 20, from.y + from.height / 2, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
  await page.mouse.up();
}

const boardReady = (page: Page) =>
  expect(page.locator("[data-testid=ticket-board][data-ready]")).toBeVisible();

function history(page: Page) {
  return page.getByTestId("history-entry");
}

test.beforeAll(async () => {
  await resetDatabase();
  const adminId = await createFirstAdmin({ ...admin, password: PASSWORD });
  const actor = { id: adminId, role: "admin" as const, isActive: true };
  await createUser(actor, { ...tech, role: "technician", password: PASSWORD });
  await createUser(actor, { ...requester, role: "requester", password: PASSWORD });
});

test("a technician logs a new ticket for a requester", async ({ page }) => {
  await signIn(page, tech.email, /\/agent$/);
  await expect(page.getByText("No tickets match these filters.")).toBeVisible();

  await page.getByRole("link", { name: "New ticket" }).click();
  await page
    .getByLabel("Requester")
    .selectOption({ label: `${requester.name} (${requester.email})` });
  await page.getByLabel("Subject").fill(SUBJECT);
  await page.getByRole("textbox", { name: "Description" }).fill("The charging light stays off.");
  await page.getByLabel("Priority").selectOption({ label: "High" });
  await page.getByLabel("Category").selectOption({ label: "Hardware › Laptop" });
  await page.getByRole("button", { name: "New ticket" }).click();

  await expect(page).toHaveURL(/\/agent\/tickets\/[0-9a-f-]{36}$/);
  ticketUrl = page.url();
  await expect(page.getByRole("heading", { name: SUBJECT })).toBeVisible();
  await expect(page.getByTestId("ticket-number")).toHaveText(/^PTY-\d+$/);
  await expect(history(page).first()).toContainText("Tess Tech created the ticket");
});

test("they take the ticket and start work, and history records each change", async ({ page }) => {
  await signIn(page, tech.email, /\/agent$/);
  await page.goto(ticketUrl);
  await page.getByLabel("Assignee").selectOption({ label: tech.name });
  await page.getByLabel("Status", { exact: true }).selectOption({ label: "In progress" });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved.")).toBeVisible();

  const change = history(page).filter({ hasText: "changed" });
  await expect(change).toContainText("Status: Open → In progress");
  await expect(change).toContainText("Assignee: none → Tess Tech");
});

test("they add an internal note and a public reply with an attachment, resolving the ticket", async ({
  page,
}) => {
  await signIn(page, tech.email, /\/agent$/);
  await page.goto(ticketUrl);

  await page.getByText("Internal note", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "Message" })
    .fill("Battery is swollen; ordering a replacement.");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByTestId("internal-note")).toContainText("Battery is swollen");
  await expect(page.getByTestId("internal-note")).toContainText("Internal");

  await page.getByText("Reply", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "Message" })
    .fill("Your new battery is fitted. Receipt attached.");
  await page.getByLabel("Attach files").setInputFiles({
    name: "receipt.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Battery, 1 x"),
  });
  await page.getByLabel("and set status to").selectOption({ label: "Resolved" });
  await page.getByRole("button", { name: "Send reply" }).click();

  const reply = page.getByTestId("public-reply");
  await expect(reply).toContainText("Your new battery is fitted.");
  await expect(history(page).filter({ hasText: "In progress → Resolved" })).toHaveCount(1);

  const download = page.waitForEvent("download");
  await reply.getByRole("link", { name: /receipt\.txt/ }).click();
  expect((await download).suggestedFilename()).toBe("receipt.txt");
});

test("search finds the ticket by reply text and by number", async ({ page }) => {
  await signIn(page, tech.email, /\/agent$/);
  const number = await (async () => {
    await page.goto(ticketUrl);
    return (await page.getByTestId("ticket-number").textContent()) ?? "";
  })();

  for (const q of ["battery", number]) {
    await page.goto("/agent?all=1");
    await page.getByRole("textbox", { name: "Search" }).fill(q);
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByTestId("ticket-row")).toHaveCount(1);
    await expect(page.getByTestId("ticket-row")).toContainText(SUBJECT);
  }

  await page.getByRole("textbox", { name: "Search" }).fill("printer");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByTestId("ticket-row")).toHaveCount(0);
});

test("a saved view keeps its filters", async ({ page }) => {
  await signIn(page, tech.email, /\/agent$/);
  await page.goto("/agent?statusType=resolved&sort=priority");
  await page.getByRole("button", { name: "+ Save view" }).click();
  await page.getByLabel("View name").fill("Resolved by priority");
  await page.getByRole("button", { name: "Save view" }).click();

  await expect(page).toHaveURL(/\/agent\?view=/);
  await expect(page.getByRole("heading", { name: "Resolved by priority" })).toBeVisible();
  await expect(page.getByTestId("ticket-row")).toContainText(SUBJECT);
});

test("bulk close takes the ticket to closed, and history shows it", async ({ page }) => {
  await signIn(page, tech.email, /\/agent$/);
  await page.goto("/agent?all=1");
  await page.getByRole("checkbox", { name: /^Select PTY-\d+$/ }).check();
  await page.getByRole("button", { name: "Close selected" }).click();
  await expect(page.getByText("1 ticket updated.")).toBeVisible();
  await expect(page.getByTestId("ticket-row")).toContainText("Closed");

  await page.goto(ticketUrl);
  await expect(history(page).filter({ hasText: "Resolved → Closed" })).toHaveCount(1);
  // Created, started, resolved, closed: the whole lifecycle is in the history.
  await expect(history(page)).toHaveCount(4);
});

test("the board shows a column per status, and dragging a card changes its status", async ({
  page,
}) => {
  // Wide enough for every column at once, like the desktop screens a board is used on.
  await page.setViewportSize({ width: 1920, height: 1080 });
  await signIn(page, tech.email, /\/agent$/);
  await page.getByRole("link", { name: "All tickets" }).click();
  await page.getByRole("link", { name: "Board" }).click();
  await expect(page).toHaveURL(/layout=board/);
  await boardReady(page);

  const closed = page.getByTestId("board-column-Closed");
  const open = page.getByTestId("board-column-Open");
  await expect(closed.getByTestId("board-card")).toContainText(SUBJECT);
  await expect(closed.getByTestId("column-count")).toHaveText("1");

  // The card moves at once; wait for the save before reloading, or the reload cancels it.
  const dragSaved = page.waitForResponse((r) => r.request().method() === "POST" && r.ok());
  await dragCard(page, closed.getByTestId("board-card"), open);
  await expect(open.getByTestId("board-card")).toContainText(SUBJECT);
  await dragSaved;
  await expect(closed.getByTestId("column-count")).toHaveText("0");

  // The move was saved: it survives a reload and shows in the ticket's history.
  await page.reload();
  await boardReady(page);
  await expect(open.getByTestId("board-card")).toContainText(SUBJECT);

  // The card's status menu is the keyboard-friendly way to do the same.
  const saved = page.waitForResponse((r) => r.request().method() === "POST" && r.ok());
  await open
    .getByRole("combobox", { name: `Status: ${SUBJECT}` })
    .selectOption({ label: "Closed" });
  await saved;
  await expect(closed.getByTestId("board-card")).toContainText(SUBJECT);
  await page.reload();
  await boardReady(page);
  await expect(closed.getByTestId("board-card")).toContainText(SUBJECT);
  await page.goto(ticketUrl);
  await expect(history(page).filter({ hasText: "Closed → Open" })).toHaveCount(1);
  await expect(history(page).filter({ hasText: "Open → Closed" })).toHaveCount(1);
});

test("an admin's new status and ticket prefix show up for technicians", async ({
  page,
  browser,
}) => {
  await signIn(page, admin.email, /\/admin$/);
  await page.goto("/admin/statuses");
  await page.locator("#new-status-name").fill("Waiting on vendor");
  await page.locator("#new-status-type").selectOption({ label: "On hold" });
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByTestId("status-Waiting on vendor")).toBeVisible();

  await page.goto("/admin/settings/tickets");
  await page.getByLabel("Prefix").fill("help-");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Tickets will look like HELP-1234")).toBeVisible();

  const techPage = await browser.newPage();
  await signIn(techPage, tech.email, /\/agent$/);
  await techPage.goto(ticketUrl);
  await expect(techPage.getByTestId("ticket-number")).toHaveText(/^HELP-\d+$/);
  await expect(
    techPage
      .getByLabel("Status", { exact: true })
      .locator("option", { hasText: "Waiting on vendor" }),
  ).toHaveCount(1);
  await techPage.close();
});

test("technicians cannot reach the ticket admin screens, and requesters cannot reach tickets", async ({
  page,
}) => {
  await signIn(page, tech.email, /\/agent$/);
  for (const path of [
    "/admin/statuses",
    "/admin/priorities",
    "/admin/categories",
    "/admin/settings/tickets",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/agent$/);
  }
  await page.getByRole("button", { name: "Sign out" }).click();

  await signIn(page, requester.email, /\/portal$/);
  await page.goto(ticketUrl);
  await expect(page).toHaveURL(/\/portal$/);
});
