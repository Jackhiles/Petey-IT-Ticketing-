import sanitize from "sanitize-html";

// Every piece of HTML Petey stores or renders passes through sanitizeHtml(): ticket
// descriptions, replies and notes now, inbound email bodies in Phase 4.

const OPTIONS: sanitize.IOptions = {
  allowedTags: [
    "p",
    "br",
    "hr",
    "b",
    "strong",
    "i",
    "em",
    "u",
    "s",
    "code",
    "pre",
    "blockquote",
    "ul",
    "ol",
    "li",
    "h2",
    "h3",
    "h4",
    "a",
    "img",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
  ],
  allowedAttributes: {
    a: ["href", "title"],
    img: ["src", "alt", "title", "width", "height"],
    th: ["colspan", "rowspan"],
    td: ["colspan", "rowspan"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["http", "https"] },
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  // Links open in a new tab and never hand the opener or referrer to the target.
  transformTags: {
    a: sanitize.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer nofollow" }),
  },
};

// transformTags adds target/rel after filtering, so they must be allowed for output.
OPTIONS.allowedAttributes = {
  ...(OPTIONS.allowedAttributes as Record<string, string[]>),
  a: ["href", "title", "target", "rel"],
};

export function sanitizeHtml(html: string): string {
  return sanitize(html, OPTIONS).trim();
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  apos: "'",
  nbsp: " ",
};

/** Plain text for search and previews: block elements become line breaks, tags are dropped. */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote|pre|tr)>/gi, "\n");
  const stripped = sanitize(withBreaks, { allowedTags: [], allowedAttributes: {} });
  return stripped
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z0-9]+);/gi, (match, name: string) => {
      const lower = name.toLowerCase();
      if (lower.startsWith("#x")) return String.fromCodePoint(parseInt(lower.slice(2), 16));
      if (lower.startsWith("#") && lower !== "#39")
        return String.fromCodePoint(parseInt(lower.slice(1), 10));
      return ENTITIES[lower] ?? match;
    })
    .split("\n")
    .map((line) => line.replace(/[ \t\u00a0]+/g, " ").trim())
    .filter((line, i, lines) => line !== "" || (i > 0 && lines[i - 1] !== ""))
    .join("\n")
    .trim();
}

/** True when sanitized HTML has no visible text and no image. */
export function isBlankHtml(html: string): boolean {
  return htmlToText(html) === "" && !/<img\b/i.test(html);
}
