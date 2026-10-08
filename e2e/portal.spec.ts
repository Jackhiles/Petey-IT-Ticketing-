import {
  addMessage,
  createCustomField,
  createFirstAdmin,
  createTicket,
  createUser,
  getTicket,
  updateTicket,
  type Actor,
} from "@petey/core";
import { getPrisma } from "@petey/db";
import { resetDatabase } from "@petey/db/testing";
import { expect, test, type Page } from "@playwright/test";

// Phase 3 acceptance: a requester raises and follows a ticket without seeing internal notes
// or anyone else's tickets. Runs at desktop and phone width (see playwright.config.ts).
test.describe.configure({ mode: "serial" });

const PASSWORD = "correct horse battery";
const rex = { name: "Rex Requester", email: "rex@example.test" };
const SUBJECT = "Laptop won't charge";

let tech: Actor;
let ritaTicket = "";
let ticketId = "";

async function signIn(page: Page, email: string, home: RegExp): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(home);
}

async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.beforeAll(async () => {
  await resetDatabase();
  const adminId = await createFirstAdmin({
    name: "Ada Admin",
    email: "ada@example.test",
    password: PASSWORD,
  });
  const admin: Actor = { id: adminId, role: "admin", isActive: true };
  tech = {
    id: await createUser(admin, {
      name: "Tess Tech",
      email: "tess@example.test",
      role: "technician",
      password: PASSWORD,
    }),
    role: "technician",
    isActive: true,
  };
  await createUser(admin, { ...rex, role: "requester", password: PASSWORD });
  const ritaId = await createUser(admin, {
    name: "Rita Requester",
    email: "rita@example.test",
    role: "requester",
    password: PASSWORD,
  });
  await createCustomField(admin, {
    key: "asset_tag",
    label: "Asset tag",
    fieldType: "text",
    required: true,
  });
  await createCustomField(admin, {
    key: "cost_code",
    label: "Cost code",
    fieldType: "text",
    visibleToRequesters: false,
  });
  const laptop = (await getPrisma().category.findFirstOrThrow({ where: { name: "Laptop" } })).id;
  ritaTicket = (
    await createTicket(
      { id: ritaId, role: "requester", isActive: true },
      {
        subject: "Rita's secret project",
        descriptionHtml: "<p>Nobody else should see this</p>",
        categoryId: laptop,
        customFields: { asset_tag: "R-1" },
      },
    )
  ).id;
});

test("a requester raises a ticket, and a missing required field keeps what they typed", async ({
  page,
}) => {
  await signIn(page, rex.email, /\/portal$/);
  await expect(page.getByText("You have no tickets here.")).toBeVisible();
  await expectNoSidewaysScroll(page);

  await page.getByRole("link", { name: "Raise a ticket" }).click();
  await page.getByLabel("Summary *").fill(SUBJECT);
  await page.getByLabel("Category *").selectOption({ label: "Hardware › Laptop" });
  await page
    .getByRole("textbox", { name: "Details *" })
    .fill("The light stays off when plugged in.");
  await expect(page.getByLabel("Cost code")).toHaveCount(0); // technicians only
  await expectNoSidewaysScroll(page);

  // Skip the required asset tag: the server says so and nothing typed is lost.
  await page.getByLabel("Asset tag *").evaluate((el) => el.removeAttribute("required"));
  await page.getByRole("button", { name: "Raise ticket" }).click();
  await expect(page.getByText("This field is required.")).toBeVisible();
  await expect(page.getByLabel("Summary *")).toHaveValue(SUBJECT);

  await page.getByLabel("Asset tag *").fill("LT-0042");
  await page.getByLabel("Attachments").setInputFiles({
    name: "photo.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("charger photo"),
  });
  await page.getByRole("button", { name: "Raise ticket" }).click();

  await expect(page).toHaveURL(/\/portal\/tickets\/[0-9a-f-]{36}$/);
  ticketId = page.url().split("/").pop() ?? "";
  await expect(page.getByRole("heading", { name: SUBJECT })).toBeVisible();
  await expect(page.getByText("LT-0042")).toBeVisible();
  await expect(page.getByRole("link", { name: /photo\.txt/ })).toBeVisible();
  await expectNoSidewaysScroll(page);
});

test("they see only their own tickets, and never another requester's", async ({ page }) => {
  await signIn(page, rex.email, /\/portal$/);
  await expect(page.getByTestId("my-ticket")).toHaveCount(1);
  await expect(page.getByTestId("my-ticket")).toContainText(SUBJECT);
  await expect(page.getByText("Rita's secret project")).toHaveCount(0);

  const response = await page.goto(`/portal/tickets/${ritaTicket}`);
  expect(response?.status()).toBe(404);
  await expect(page.getByText("Nobody else should see this")).toHaveCount(0);

  // The technician area is off limits too.
  await page.goto(`/agent/tickets/${ritaTicket}`);
  await expect(page).toHaveURL(/\/portal$/);
});

test("they see technicians' replies but never internal notes", async ({ page }) => {
  await addMessage(tech, ticketId, {
    bodyHtml: "<p>Which charger are you using?</p>",
    isInternal: false,
  });
  await addMessage(tech, ticketId, {
    bodyHtml: "<p>Probably the battery; order one</p>",
    isInternal: true,
  });

  await signIn(page, rex.email, /\/portal$/);
  await expect(page.getByText("Waiting for your reply")).toBeVisible();
  await page.getByTestId("my-ticket").click();
  await expect(page.getByTestId("portal-message")).toHaveCount(1);
  await expect(page.getByText("Which charger are you using?")).toBeVisible();
  await expect(page.getByText("order one")).toHaveCount(0);
  expect(await page.content()).not.toContain("Probably the battery");
});

test("they reply, mark the ticket solved, and reopen it", async ({ page }) => {
  await signIn(page, rex.email, /\/portal$/);
  await page.goto(`/portal/tickets/${ticketId}`);
  await page.getByRole("textbox", { name: "Reply" }).fill("The one that came with it.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(
    page.getByTestId("portal-message").filter({ hasText: "The one that came with it." }),
  ).toBeVisible();

  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "My issue is solved" }).click();
  await expect(page.getByText("This ticket is resolved.")).toBeVisible();

  await page.getByRole("button", { name: "Reopen ticket" }).click();
  await expect(page.getByRole("button", { name: "My issue is solved" })).toBeVisible();
  expect((await getTicket(tech, ticketId)).status.name).toBe("Open");
});

test("a reply to a resolved ticket reopens it; a closed ticket offers a follow-up instead", async ({
  page,
}) => {
  const statusId = async (name: string) =>
    (await getPrisma().status.findUniqueOrThrow({ where: { name } })).id;
  await updateTicket(tech, ticketId, { statusId: await statusId("Resolved") });

  await signIn(page, rex.email, /\/portal$/);
  await page.goto(`/portal/tickets/${ticketId}`);
  await expect(page.getByText("Replying will reopen this ticket.")).toBeVisible();
  await page.getByRole("textbox", { name: "Reply" }).fill("It stopped again.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("This ticket is resolved.")).toHaveCount(0);
  expect((await getTicket(tech, ticketId)).status.name).toBe("Open");

  await updateTicket(tech, ticketId, { statusId: await statusId("Closed") });
  await page.reload();
  await expect(page.getByText("This ticket is closed and can't be reopened.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Reply" })).toHaveCount(0);
  await page.getByRole("link", { name: "Raise a new ticket about this" }).click();
  await expect(page.getByLabel("Summary *")).toHaveValue(
    new RegExp(`^Follow-up to PTY-\\d+: ${SUBJECT}$`),
  );
});

test("technicians see and edit every custom field, including technician-only ones", async ({
  page,
}) => {
  await signIn(page, "tess@example.test", /\/agent$/);
  await page.goto(`/agent/tickets/${ticketId}`);
  await expect(page.getByLabel("Asset tag *")).toHaveValue("LT-0042");
  await page.getByLabel("Cost code").fill("IT-HW-7");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved.")).toBeVisible();
  await expect(
    page.getByTestId("history-entry").filter({ hasText: "Cost code: none → IT-HW-7" }),
  ).toHaveCount(1);
});
