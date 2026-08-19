/**
 * Word-level text diff for auto-correction review.
 *
 * Correction attempts usually change a handful of numbers inside otherwise
 * identical prose, so showing two full paragraphs side by side hides the edit.
 * These helpers reduce a before/after pair to the runs that actually changed.
 */

export type DiffOp = "equal" | "insert" | "delete";

export interface DiffSegment {
  op: DiffOp;
  text: string;
}

/**
 * Split into words while keeping whitespace attached to the preceding word, so
 * joining segments reproduces the original string exactly.
 */
function tokenize(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [];
}

/**
 * Longest common subsequence table over tokens.
 *
 * Guarded by MAX_TOKENS because the table is O(n*m); article bodies are a few
 * hundred words, but a pathological input should degrade to "replaced wholesale"
 * rather than lock up the browser.
 */
const MAX_TOKENS = 1200;

export function diffWords(before: string, after: string): DiffSegment[] {
  if (before === after) {
    return before ? [{ op: "equal", text: before }] : [];
  }

  const a = tokenize(before);
  const b = tokenize(after);

  if (a.length === 0) {
    return after ? [{ op: "insert", text: after }] : [];
  }
  if (b.length === 0) {
    return before ? [{ op: "delete", text: before }] : [];
  }
  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
    return [
      { op: "delete", text: before },
      { op: "insert", text: after },
    ];
  }

  // lcs[i][j] = LCS length of a.slice(i) and b.slice(j)
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i].trim() === b[j].trim()
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const segments: DiffSegment[] = [];
  const push = (op: DiffOp, text: string) => {
    const last = segments[segments.length - 1];
    if (last && last.op === op) {
      last.text += text;
    } else {
      segments.push({ op, text });
    }
  };

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i].trim() === b[j].trim()) {
      push("equal", a[i]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      push("delete", a[i]);
      i++;
    } else {
      push("insert", b[j]);
      j++;
    }
  }
  while (i < a.length) push("delete", a[i++]);
  while (j < b.length) push("insert", b[j++]);

  return segments;
}

/** True when the pair differs at all (ignoring leading/trailing whitespace). */
export function hasTextChange(before: string, after: string): boolean {
  return before.trim() !== after.trim();
}

/**
 * Trim long unchanged runs down to a context window around each edit, replacing
 * the elided middle with an ellipsis. An unchanged run only borders a change on
 * the side facing it, so leading and trailing runs are trimmed from one end only.
 */
export function collapseUnchanged(
  segments: DiffSegment[],
  contextChars = 120
): DiffSegment[] {
  if (!segments.some((s) => s.op !== "equal")) return segments;

  const ellipsis = "\u2026";
  return segments.map((segment, index) => {
    if (segment.op !== "equal" || segment.text.length <= contextChars * 2) {
      return segment;
    }
    const atStart = index === 0;
    const atEnd = index === segments.length - 1;
    let text: string;
    if (atStart) {
      text = ellipsis + segment.text.slice(-contextChars);
    } else if (atEnd) {
      text = segment.text.slice(0, contextChars) + ellipsis;
    } else {
      text =
        segment.text.slice(0, contextChars) +
        ellipsis +
        segment.text.slice(-contextChars);
    }
    return { op: "equal" as const, text };
  });
}
