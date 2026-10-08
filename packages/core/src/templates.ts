// {{variables}} in canned responses and macro replies. Notification templates (Phase 4)
// will reuse the same names.

export const TEMPLATE_VARIABLES = [
  "ticket.number",
  "ticket.subject",
  "ticket.status",
  "ticket.priority",
  "requester.name",
  "requester.first_name",
  "requester.email",
  "agent.name",
  "agent.first_name",
] as const;

export type TemplateValues = Record<(typeof TEMPLATE_VARIABLES)[number], string>;

export interface TemplateContext {
  ticket: { displayNumber: string; subject: string; status: string; priority: string };
  requester: { name: string; email: string };
  /** The technician inserting the text or running the macro. */
  agent: { name: string };
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export function templateValues(ctx: TemplateContext): TemplateValues {
  return {
    "ticket.number": ctx.ticket.displayNumber,
    "ticket.subject": ctx.ticket.subject,
    "ticket.status": ctx.ticket.status,
    "ticket.priority": ctx.ticket.priority,
    "requester.name": ctx.requester.name,
    "requester.first_name": firstName(ctx.requester.name),
    "requester.email": ctx.requester.email,
    "agent.name": ctx.agent.name,
    "agent.first_name": firstName(ctx.agent.name),
  };
}

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * Fills {{variables}} in an HTML template. Values are HTML-escaped; unknown variables are
 * left as written so the technician sees them before sending.
 */
export function renderTemplate(template: string, values: TemplateValues): string {
  return template.replace(/\{\{\s*([a-z_.]+)\s*\}\}/g, (match, name: string) => {
    const value = (values as Record<string, string>)[name];
    return value === undefined ? match : escapeHtml(value);
  });
}
