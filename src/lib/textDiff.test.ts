import { describe, expect, it } from "vitest";

import { collapseUnchanged, diffWords, hasTextChange } from "./textDiff";

/** Reconstruct the "before" text from a diff (equal + delete segments). */
function beforeOf(segments: { op: string; text: string }[]): string {
  return segments
    .filter((s) => s.op !== "insert")
    .map((s) => s.text)
    .join("");
}

/** Reconstruct the "after" text from a diff (equal + insert segments). */
function afterOf(segments: { op: string; text: string }[]): string {
  return segments
    .filter((s) => s.op !== "delete")
    .map((s) => s.text)
    .join("");
}

describe("diffWords", () => {
  it("returns a single equal segment for identical text", () => {
    const out = diffWords("same words here", "same words here");
    expect(out).toEqual([{ op: "equal", text: "same words here" }]);
  });

  it("returns nothing for two empty strings", () => {
    expect(diffWords("", "")).toEqual([]);
  });

  it("treats an empty before as a pure insertion", () => {
    expect(diffWords("", "new text")).toEqual([{ op: "insert", text: "new text" }]);
  });

  it("treats an empty after as a pure deletion", () => {
    expect(diffWords("gone", "")).toEqual([{ op: "delete", text: "gone" }]);
  });

  it("isolates a single changed number", () => {
    const before = "Residents submitted 450 complaints through July.";
    const after = "Residents submitted 419 complaints through July.";
    const out = diffWords(before, after);

    const deleted = out.filter((s) => s.op === "delete").map((s) => s.text.trim());
    const inserted = out.filter((s) => s.op === "insert").map((s) => s.text.trim());
    expect(deleted).toEqual(["450"]);
    expect(inserted).toEqual(["419"]);
  });

  it("is lossless: segments rebuild both inputs exactly", () => {
    const before = "up 226 percent from 138 in the same period of 2025";
    const after = "up 204 percent from 138 in the same period of 2025";
    const out = diffWords(before, after);
    expect(beforeOf(out)).toBe(before);
    expect(afterOf(out)).toBe(after);
  });

  it("handles a removed clause", () => {
    const before = "419 complaints, up 226 percent from 138 last year.";
    const after = "419 complaints, up from 138 last year.";
    const out = diffWords(before, after);
    expect(beforeOf(out)).toBe(before);
    expect(afterOf(out)).toBe(after);
    expect(out.some((s) => s.op === "delete")).toBe(true);
    expect(out.some((s) => s.op === "insert")).toBe(false);
  });

  it("merges adjacent segments of the same kind", () => {
    const out = diffWords("a b c d", "a x y d");
    const ops = out.map((s) => s.op);
    // No two neighbours share an op.
    ops.forEach((op, i) => {
      if (i > 0) expect(op).not.toBe(ops[i - 1]);
    });
  });

  it("falls back to whole-text replacement beyond the token limit", () => {
    const before = Array.from({ length: 1300 }, (_, i) => `w${i}`).join(" ");
    const after = `${before} tail`;
    const out = diffWords(before, after);
    expect(out).toEqual([
      { op: "delete", text: before },
      { op: "insert", text: after },
    ]);
  });

  it("is lossless across a multi-paragraph article edit", () => {
    const before =
      "<p>Residents submitted 450 complaints through July, up 226 percent.</p>\n\n" +
      "<p>Incident reports account for 364 of the 450 filings (81 percent).</p>";
    const after =
      "<p>Residents submitted 419 complaints through July, up 204 percent.</p>\n\n" +
      "<p>Incident reports account for 364 of the 419 filings (87 percent).</p>";
    const out = diffWords(before, after);
    expect(beforeOf(out)).toBe(before);
    expect(afterOf(out)).toBe(after);
  });
});

describe("hasTextChange", () => {
  it("ignores surrounding whitespace", () => {
    expect(hasTextChange("  same  ", "same")).toBe(false);
    expect(hasTextChange("a", "b")).toBe(true);
  });
});

describe("collapseUnchanged", () => {
  const long = (n: number) => "word ".repeat(n).trim();

  it("returns the input untouched when nothing changed", () => {
    const segments = diffWords("identical text", "identical text");
    expect(collapseUnchanged(segments)).toBe(segments);
  });

  it("shortens a long unchanged run around an edit", () => {
    const before = `${long(120)} 450 ${long(120)}`;
    const after = `${long(120)} 419 ${long(120)}`;
    const segments = diffWords(before, after);
    const collapsed = collapseUnchanged(segments, 40);

    const fullLen = segments.reduce((n, s) => n + s.text.length, 0);
    const collapsedLen = collapsed.reduce((n, s) => n + s.text.length, 0);
    expect(collapsedLen).toBeLessThan(fullLen);
  });

  it("keeps the changed segments intact", () => {
    const before = `${long(120)} 450 ${long(120)}`;
    const after = `${long(120)} 419 ${long(120)}`;
    const collapsed = collapseUnchanged(diffWords(before, after), 40);

    expect(collapsed.filter((s) => s.op === "delete").map((s) => s.text.trim())).toEqual(
      ["450"]
    );
    expect(collapsed.filter((s) => s.op === "insert").map((s) => s.text.trim())).toEqual(
      ["419"]
    );
  });

  it("marks elided text with an ellipsis", () => {
    const before = `${long(120)} 450 ${long(120)}`;
    const after = `${long(120)} 419 ${long(120)}`;
    const collapsed = collapseUnchanged(diffWords(before, after), 40);
    expect(collapsed.some((s) => s.text.includes("\u2026"))).toBe(true);
  });

  it("leaves short unchanged runs alone", () => {
    const segments = diffWords("a 450 b", "a 419 b");
    expect(collapseUnchanged(segments, 40)).toEqual(segments);
  });
});
