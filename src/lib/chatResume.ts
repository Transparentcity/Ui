/**
 * Context for continuing a Seymour reply whose stream was cut off.
 *
 * When the connection drops mid-reply, the backend may not have saved the
 * tool calls and partial answer from that turn, so a follow-up "continue"
 * reaches a model that has no record of the work. The browser still holds
 * everything it streamed, so it replays that work at the top of the next
 * message.
 */

export interface InterruptedToolCall {
  tool_name: string;
  arguments?: unknown;
  response?: unknown;
  success?: boolean | null;
}

export interface InterruptedTurn {
  /** The user message whose reply was cut off. */
  request: string;
  /** Answer text streamed before the cut. */
  partialText: string;
  /** Tool calls that finished before the cut, in order. */
  completedToolCalls: InterruptedToolCall[];
  /** Names of tool calls that had started but not finished. */
  pendingToolNames: string[];
}

const MAX_ARGS_CHARS = 600;
const MAX_RESULT_CHARS = 1500;
const MAX_PARTIAL_TEXT_CHARS = 4000;
const MAX_CONTEXT_CHARS = 16000;

function stringify(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}… [truncated, ${text.length - max} more chars]`;
}

function truncateStart(text: string, max: number): string {
  if (text.length <= max) return text;
  return `[…${text.length - max} earlier chars omitted] ${text.slice(-max)}`;
}

function formatToolCall(call: InterruptedToolCall, index: number): string {
  const args = truncate(stringify(call.arguments), MAX_ARGS_CHARS);
  const result = truncate(stringify(call.response), MAX_RESULT_CHARS);
  const status = call.success === false ? " (failed)" : "";
  return [
    `${index + 1}. ${call.tool_name}${status}`,
    args ? `   arguments: ${args}` : null,
    result ? `   result: ${result}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Build the message sent to the backend for the turn after an interruption:
 * a context block describing the interrupted work, followed by what the user
 * typed. When the tool log is too long, the oldest calls are dropped first.
 */
export function buildResumeMessage(turn: InterruptedTurn, userText: string): string {
  const header =
    "[Context added by the Transparent City app: your previous reply was cut off " +
    "by a connection timeout before it finished, and that work may not be in " +
    "your history. Below is what you had done for that request. Use it and do " +
    "not repeat tool calls that already succeeded.]";

  const sections: string[] = [header, `Request you were working on:\n${truncate(turn.request, 2000)}`];

  if (turn.pendingToolNames.length > 0) {
    sections.push(
      `Tool calls that were running when the connection dropped (no result received): ${turn.pendingToolNames.join(", ")}`
    );
  }

  if (turn.partialText.trim()) {
    sections.push(
      `Answer text you had written so far:\n"""\n${truncateStart(turn.partialText.trim(), MAX_PARTIAL_TEXT_CHARS)}\n"""`
    );
  }

  const footer = "[End of context]";
  const fixedLength =
    sections.join("\n\n").length + footer.length + userText.length + 64;
  const budget = Math.max(0, MAX_CONTEXT_CHARS - fixedLength);

  const formatted = turn.completedToolCalls.map(formatToolCall);
  const kept: string[] = [];
  let used = 0;
  for (let i = formatted.length - 1; i >= 0; i--) {
    const cost = formatted[i].length + 1;
    if (used + cost > budget) break;
    kept.unshift(formatted[i]);
    used += cost;
  }

  if (formatted.length > 0) {
    const dropped = formatted.length - kept.length;
    const title = `Tool calls completed (${formatted.length})${
      dropped > 0 ? `, oldest ${dropped} omitted for length` : ""
    }:`;
    // Tool results go right after the request so the order reads the same
    // way the work happened.
    sections.splice(2, 0, [title, ...kept].join("\n"));
  }

  return `${sections.join("\n\n")}\n${footer}\n\n${userText}`;
}
