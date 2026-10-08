import { describe, expect, it } from "vitest";
import { renderTemplate, TEMPLATE_VARIABLES, templateValues } from "./templates";

const values = templateValues({
  ticket: {
    displayNumber: "PTY-42",
    subject: "Printer <jammed> & smoking",
    status: "Open",
    priority: "High",
  },
  requester: { name: "Rex Q. Requester", email: "rex@example.test" },
  agent: { name: "Tess Tech" },
});

describe("renderTemplate", () => {
  it.each([
    ["Hi {{requester.first_name}},", "Hi Rex,"],
    ["{{ requester.name }}", "Rex Q. Requester"],
    ["{{requester.email}}", "rex@example.test"],
    ["Re {{ticket.number}}: {{ticket.subject}}", "Re PTY-42: Printer &lt;jammed&gt; &amp; smoking"],
    ["Now {{ticket.status}} / {{ticket.priority}}", "Now Open / High"],
    ["— {{agent.first_name}} ({{agent.name}})", "— Tess (Tess Tech)"],
  ])("fills %j", (template, expected) => {
    expect(renderTemplate(template, values)).toBe(expected);
  });

  it("escapes values so a subject can't inject HTML", () => {
    const evil = templateValues({
      ticket: {
        displayNumber: "PTY-1",
        subject: '<img src=x onerror="alert(1)">',
        status: "Open",
        priority: "Low",
      },
      requester: { name: "A", email: "a@example.test" },
      agent: { name: "B" },
    });
    expect(renderTemplate("{{ticket.subject}}", evil)).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
  });

  it("leaves unknown variables visible so the technician notices them", () => {
    expect(renderTemplate("{{ticket.nope}} {{requester}}", values)).toBe(
      "{{ticket.nope}} {{requester}}",
    );
  });

  it("leaves text without variables alone", () => {
    expect(renderTemplate("<p>Plain {text}</p>", values)).toBe("<p>Plain {text}</p>");
  });

  it("documents every variable it fills", () => {
    expect(Object.keys(values).sort()).toEqual([...TEMPLATE_VARIABLES].sort());
  });

  it("uses the whole name as the first name when there is only one word", () => {
    const one = templateValues({
      ticket: { displayNumber: "PTY-1", subject: "x", status: "Open", priority: "Low" },
      requester: { name: "Cher", email: "c@example.test" },
      agent: { name: "Prince" },
    });
    expect(renderTemplate("{{requester.first_name}} {{agent.first_name}}", one)).toBe(
      "Cher Prince",
    );
  });
});
