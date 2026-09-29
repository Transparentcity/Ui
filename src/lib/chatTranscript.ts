/**
 * Plain-text export of a Seymour conversation.
 *
 * Used by the "Copy conversation" button so a chat can be pasted into a new
 * Seymour chat (or anywhere else) with everything the browser knows: every
 * message, the tools each reply used, and, when the last reply was cut off,
 * the work Seymour had finished before the connection dropped.
 */
import { formatInterruptedWork, type InterruptedTurn } from "./chatResume";

export interface TranscriptMessage {
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
  tool_calls?: Array<{ tool_name?: string; success?: boolean | null }>;
  intermediate_events?: Array<{ type: string; content?: string; tool_name?: string }>;
}

export interface TranscriptOptions {
  title?: string | null;
  /** Public link to the conversation, when one exists. */
  link?: string | null;
  sessionId?: string | null;
  interruptedTurn?: InterruptedTurn | null;
  now?: Date;
}

/** The reply text, preferring streamed text events (which exclude tool output). */
export function transcriptAnswerText(msg: TranscriptMessage): string {
  const fromEvents = (msg.intermediate_events || [])
    .filter((e) => e.type === "text_response" && e.content)
    .map((e) => e.content)
    .join("");
  return (fromEvents.trim() ? fromEvents : msg.content || "").trim();
}

function toolNamesFor(msg: TranscriptMessage): string[] {
  const names: string[] = [];
  for (const call of msg.tool_calls || []) {
    if (call.tool_name) names.push(call.tool_name);
  }
  if (names.length === 0) {
    for (const e of msg.intermediate_events || []) {
      if (e.type === "tool_call_start" && e.tool_name) names.push(e.tool_name);
    }
  }
  return names;
}

function cleanTitle(title: string | null | undefined): string {
  // Session titles sometimes arrive wrapped in markdown bold.
  return (title || "").replace(/^\*+|\*+$/g, "").trim();
}

export function buildConversationTranscript(
  messages: TranscriptMessage[],
  opts: TranscriptOptions = {}
): string {
  const now = opts.now ?? new Date();
  const title = cleanTitle(opts.title) || "Seymour conversation";
  const turns = messages.filter((m) => m.role === "user" || transcriptAnswerText(m) || m.isError);

  const header: string[] = [`# ${title}`];
  header.push(`Copied from Transparent City on ${now.toISOString().slice(0, 16).replace("T", " ")} UTC.`);
  if (opts.link) header.push(`Link: ${opts.link}`);
  else if (opts.sessionId) header.push(`Session: ${opts.sessionId}`);
  if (opts.interruptedTurn) {
    header.push(
      "The last reply was cut off by a connection timeout before it finished. " +
        "The work Seymour completed before the cut is listed after the transcript."
    );
  }

  const body = turns.map((m) => {
    if (m.role === "user") return `## You\n${m.content.trim()}`;
    if (m.isError) return `## Seymour (error)\n${m.content.trim()}`;
    const tools = toolNamesFor(m);
    const lines = ["## Seymour"];
    if (tools.length > 0) lines.push(`Tools used: ${tools.join(", ")}`);
    lines.push(transcriptAnswerText(m));
    return lines.join("\n");
  });

  const parts = [header.join("\n"), ...body];

  if (opts.interruptedTurn) {
    parts.push(
      [
        "## Work from the cut-off reply",
        formatInterruptedWork(opts.interruptedTurn),
        "",
        'To continue in a new chat, paste this whole transcript and add: "Continue where this left off. Do not repeat tool calls that already succeeded."',
      ].join("\n")
    );
  }

  return parts.join("\n\n---\n\n");
}
