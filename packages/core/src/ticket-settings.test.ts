import { describe, expect, it } from "vitest";
import { formatTicketNumber, parseTicketNumber, ticketSettingsSchema } from "./ticket-settings";

describe("ticket numbers", () => {
  it("formats with the prefix", () => {
    expect(formatTicketNumber(1234, "PTY-")).toBe("PTY-1234");
    expect(formatTicketNumber(7, "IT")).toBe("IT7");
  });

  it.each([
    ["1234", 1234],
    [" 42 ", 42],
    ["#42", 42],
    ["PTY-42", 42],
    ["pty-42", 42],
    ["HELP-9", 9],
    ["IT9", 9],
  ])("parses %j as %i", (text, expected) => {
    expect(parseTicketNumber(text)).toBe(expected);
  });

  it.each(["", "printer", "PTY-", "12 printers", "-12", "PTY--12", "1234567890"])(
    "does not treat %j as a ticket number",
    (text) => {
      expect(parseTicketNumber(text)).toBeNull();
    },
  );
});

describe("ticket settings", () => {
  it("upper-cases a valid prefix", () => {
    expect(ticketSettingsSchema.parse({ prefix: "help-" })).toEqual({ prefix: "HELP-" });
  });

  it.each(["", "-PTY", "PT Y", "TOOLONGPREFIX", "P_T"])("rejects prefix %j", (prefix) => {
    expect(ticketSettingsSchema.safeParse({ prefix }).success).toBe(false);
  });
});
