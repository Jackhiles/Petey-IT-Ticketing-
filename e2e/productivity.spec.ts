import {
  addMessage,
  createCannedResponse,
  createFirstAdmin,
  createTag,
  createTicket,
  createUser,
  type Actor,
} from "@petey/core";
import { resetDatabase } from "@petey/db/testing";
import { expect, test, type Browser, type Page } from "@playwright/test";

// Phase 2b acceptance: two duplicates merge without losing a message; a macro applies its
// actions in one click; a second technician opening the same ticket sees the first one's
// presence. Also covers canned responses, collision warnings, tags, time and split.
test.describe.configure({ mode: "serial" });

const PASSWORD = "correct horse battery";
const tess = { name: "Tess Tech", email: "tess@example.test" };
const tom = { name: "Tom Tech", email: "tom@example.test" };
const rex = { name: "Rex Requester", email: "rex@example.test" };

let tessActor: Actor;
let tomActor: Actor;
const tickets: Record<string, { id: string; number: number }> = {};

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/agent$/);
}

async function openAs(browser: Browser, email: string, ticket: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, email);
  await page.goto(`/agent/tickets/${tickets[ticket]?.id}`);
  return page;
}

test.beforeAll(async () => {
  await resetDatabase();
  const adminId = await createFirstAdmin({
    name: "Ada Admin",
    email: "ada@example.test",
    password: PASSWORD,
  });
  const admin: Actor = { id: adminId, role: "admin", isActive: true };
  tessActor = {
    id: await createUser(admin, { ...tess, role: "technician", password: PASSWORD }),
    role: "technician",
    isActive: true,
  };
  tomActor = {
    id: await createUser(admin, { ...tom, role: "technician", password: PASSWORD }),
    role: "technician",
    isActive: true,
  };
  const rexId = await createUser(admin, { ...rex, role: "requester", password: PASSWORD });
  await createTag(admin, { name: "VIP", color: "#dc2626" });

  const make = async (key: string, subject: string, description: string) => {
    tickets[key] = await createTicket(tessActor, {
      subject,
      descriptionHtml: `<p>${description}</p>`,
      requesterId: rexId,
    });
  };
  await make("original", "Printer on floor 3 jammed", "Paper stuck in tray 2");
  await make("duplicate", "Floor 3 printer still broken", "It is making a grinding noise");
  await make("macro", "Please reset my password", "Locked out since this morning");
  await make("busy", "VPN drops every hour", "Happens on home Wi-Fi");
  await make("twoIssues", "Laptop slow", "Takes ages to boot");

  await addMessage(tessActor, tickets.duplicate?.id ?? "", {
    bodyHtml: "<p>Have you tried turning it off?</p>",
    isInternal: false,
  });
  await addMessage(tessActor, tickets.duplicate?.id ?? "", {
    bodyHtml: "<p>Toner order raised</p>",
    isInternal: true,
  });
  await addMessage(tessActor, tickets.twoIssues?.id ?? "", {
    bodyHtml: "<p>Also my monitor flickers</p>",
    isInternal: false,
  });
  await createCannedResponse(tessActor, {
    title: "Greeting",
    body: "<p>Hi {{requester.first_name}}, thanks for raising {{ticket.number}}.</p>",
  });
});

test("two duplicates merge without losing a message", async ({ page }) => {
  await signIn(page, tess.email);
  await page.goto(`/agent/tickets/${tickets.duplicate?.id}`);
  await page.getByText("Merge into another ticket").click();
  page.once("dialog", (d) => void d.accept());
  await page.getByLabel("Merge this ticket into").fill(`PTY-${tickets.original?.number}`);
  await page.getByRole("button", { name: "Merge", exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/agent/tickets/${tickets.original?.id}$`));
  const timeline = page.getByTestId("timeline");
  await expect(timeline).toContainText(`Merged from PTY-${tickets.duplicate?.number}`);
  await expect(timeline).toContainText("It is making a grinding noise");
  await expect(timeline).toContainText("Have you tried turning it off?");
  await expect(page.getByTestId("internal-note")).toContainText("Toner order raised");
  await expect(page.getByTestId("links-panel")).toContainText(
    `Merged from · PTY-${tickets.duplicate?.number}`,
  );

  await page.goto(`/agent/tickets/${tickets.duplicate?.id}`);
  await expect(page.getByTestId("links-panel")).toContainText(
    `Merged into · PTY-${tickets.original?.number}`,
  );
  await expect(page.getByText("Merge into another ticket")).toHaveCount(0);
});

test("a macro applies its actions in one click", async ({ page }) => {
  await signIn(page, tess.email);
  await page.goto("/agent/responses");
  await page.getByLabel("Name", { exact: true }).fill("Password reset done");
  await page
    .getByRole("textbox", { name: "Reply text (optional)" })
    .fill("Your password has been reset.");
  await page.getByLabel("Set status").selectOption({ label: "Resolved" });
  await page.getByLabel("Assign to").selectOption({ label: "Whoever runs it" });
  await page.getByLabel("VIP").first().check();
  await page.getByRole("button", { name: "Create" }).last().click();
  await expect(page.getByText("Saved")).toBeVisible();

  await page.goto(`/agent/tickets/${tickets.macro?.id}`);
  await page.getByRole("button", { name: "Run: Password reset done" }).click();
  await expect(page.getByText("Macro applied.")).toBeVisible();
  await expect(page.getByTestId("public-reply")).toContainText("Your password has been reset.");
  await expect(page.getByLabel("Status", { exact: true })).toHaveValue(/.+/);
  await expect(page.getByLabel("Status", { exact: true }).locator("option:checked")).toHaveText(
    "Resolved",
  );
  await expect(page.getByLabel("Assignee").locator("option:checked")).toHaveText(tess.name);
  await expect(page.getByTestId("tags-panel")).toContainText("VIP");
  await expect(
    page.getByTestId("history-entry").filter({ hasText: 'ran the macro "Password reset done"' }),
  ).toHaveCount(1);
});

test("a second technician sees the first one viewing and typing", async ({ browser }) => {
  const tessPage = await openAs(browser, tess.email, "busy");
  const tomPage = await openAs(browser, tom.email, "busy");

  await expect(tomPage.getByTestId("presence-viewing")).toContainText(`${tess.name} also viewing`, {
    timeout: 15_000,
  });
  await expect(tessPage.getByTestId("presence-viewing")).toContainText(`${tom.name} also viewing`, {
    timeout: 15_000,
  });

  await tessPage.getByRole("textbox", { name: "Message" }).pressSequentially("Looking into it");
  await expect(tomPage.getByTestId("presence-typing")).toContainText(
    `${tess.name} typing a reply`,
    { timeout: 15_000 },
  );

  await tessPage.context().close();
  await tomPage.context().close();
});

test("posting warns when the ticket changed since it was opened, then sends anyway", async ({
  browser,
}) => {
  const page = await openAs(browser, tess.email, "busy");
  await expect(page.getByRole("heading", { name: "VPN drops every hour" })).toBeVisible();
  await addMessage(tomActor, tickets.busy?.id ?? "", {
    bodyHtml: "<p>Tom replied first</p>",
    isInternal: false,
  });

  await page.getByRole("textbox", { name: "Message" }).fill("Please try the new client.");
  await page.getByRole("button", { name: "Send reply" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "changed this ticket after you opened it" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Send anyway" }).click();

  await expect(
    page.getByTestId("public-reply").filter({ hasText: "Please try the new client." }),
  ).toHaveCount(1);
  await expect(
    page.getByTestId("public-reply").filter({ hasText: "Tom replied first" }),
  ).toHaveCount(1);
  await page.context().close();
});

test("a canned response is inserted with its variables filled in", async ({ page }) => {
  await signIn(page, tess.email);
  await page.goto(`/agent/tickets/${tickets.busy?.id}`);
  await page.getByRole("button", { name: "Insert canned response" }).click();
  await page.getByRole("textbox", { name: "Search canned responses" }).fill("greet");
  await page.getByRole("option", { name: /Greeting/ }).click();
  const editor = page.getByRole("textbox", { name: "Message" });
  await expect(editor).toContainText(`Hi Rex, thanks for raising PTY-${tickets.busy?.number}.`);
  await page.getByRole("button", { name: "Send reply" }).click();
  await expect(
    page.getByTestId("public-reply").filter({ hasText: "Hi Rex, thanks for raising" }),
  ).toHaveCount(1);
});

test("time is logged and totalled, and tags filter the list", async ({ page }) => {
  await signIn(page, tess.email);
  await page.goto(`/agent/tickets/${tickets.busy?.id}`);
  const time = page.getByTestId("time-panel");
  await time.getByLabel("Minutes").fill("45");
  await time.getByLabel("Note").fill("Remote session");
  await time.getByRole("button", { name: "Log time" }).click();
  await expect(page.getByTestId("time-total")).toHaveText("Total: 45 min");

  const tags = page.getByTestId("tags-panel");
  await tags.getByRole("button", { name: "Edit tags" }).click();
  await tags.getByLabel("VIP").check();
  await tags.getByRole("button", { name: "Save" }).click();
  await expect(tags).toContainText("VIP");

  await page.goto("/agent?all=1");
  await page.getByLabel("Tags").selectOption({ label: "VIP" });
  await page.getByRole("button", { name: "Apply" }).click();
  const rows = page.getByTestId("ticket-row");
  await expect(rows).toHaveCount(2); // this ticket and the one the macro tagged
  await expect(rows.filter({ hasText: "VPN drops every hour" })).toHaveCount(1);
});

test("a message is split out into its own ticket", async ({ page }) => {
  await signIn(page, tess.email);
  await page.goto(`/agent/tickets/${tickets.twoIssues?.id}`);
  const reply = page.getByTestId("public-reply").filter({ hasText: "Also my monitor flickers" });
  await reply.getByText("Split into new ticket").click();
  await reply.getByLabel("New ticket subject").fill("Monitor flickers");
  await reply.getByRole("button", { name: "Create ticket" }).click();

  await expect(page.getByRole("heading", { name: "Monitor flickers" })).toBeVisible();
  await expect(page.getByText("Also my monitor flickers")).toBeVisible();
  await expect(page.getByTestId("links-panel")).toContainText(
    `Related · PTY-${tickets.twoIssues?.number}`,
  );
});
