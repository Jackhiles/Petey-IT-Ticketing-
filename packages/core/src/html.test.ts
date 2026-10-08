import { describe, expect, it } from "vitest";
import { htmlToText, isBlankHtml, sanitizeHtml } from "./html";

describe("sanitizeHtml", () => {
  it.each([
    ["<p>Hello <script>alert(1)</script>world</p>", "<p>Hello world</p>"],
    ['<p onclick="x()">Hi</p>', "<p>Hi</p>"],
    [
      '<a href="javascript:alert(1)">x</a>',
      '<a target="_blank" rel="noopener noreferrer nofollow">x</a>',
    ],
    ['<img src="data:image/png;base64,AAAA" onerror="x()">', "<img />"],
    ["<iframe src=https://evil.example></iframe><p>ok</p>", "<p>ok</p>"],
    ["<style>body{display:none}</style><p>ok</p>", "<p>ok</p>"],
    ['<p style="position:fixed">ok</p>', "<p>ok</p>"],
    ['<svg onload="x()"><p>ok</p></svg>', "<p>ok</p>"],
    ["<form action=/steal><input name=p></form>", ""],
  ])("cleans %s", (input, expected) => {
    expect(sanitizeHtml(input)).toBe(expected);
  });

  it("keeps formatting and safe links, forcing them to a new tab", () => {
    expect(
      sanitizeHtml(
        '<p><strong>Bold</strong> <a href="https://example.com">link</a></p><ul><li>one</li></ul>',
      ),
    ).toBe(
      '<p><strong>Bold</strong> <a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">link</a></p><ul><li>one</li></ul>',
    );
  });
});

describe("htmlToText", () => {
  it("turns blocks into lines and decodes entities", () => {
    expect(htmlToText("<p>Tom &amp; Jerry &lt;3</p><p>Line&nbsp;two<br>three</p>")).toBe(
      "Tom & Jerry <3\nLine two\nthree",
    );
  });

  it("collapses runs of blank lines", () => {
    expect(htmlToText("<p>a</p><p></p><p></p><p>b</p>")).toBe("a\n\nb");
  });

  it("decodes numeric entities", () => {
    expect(htmlToText("<p>&#8364;5 &#x2713;</p>")).toBe("€5 ✓");
  });
});

describe("isBlankHtml", () => {
  it.each([
    ["", true],
    ["<p></p>", true],
    ["<p> &nbsp; </p><br>", true],
    ["<p>x</p>", false],
    ['<img src="https://example.com/a.png">', false],
  ])("%j is blank: %s", (html, blank) => {
    expect(isBlankHtml(html)).toBe(blank);
  });
});
