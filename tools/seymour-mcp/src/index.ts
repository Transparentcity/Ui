#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { loadConfig } from "./config.js";
import { AuthError, TokenProvider, decodeJwtPayload } from "./auth.js";
import { SeymourApiError, SeymourClient } from "./seymour.js";

const config = loadConfig();
const tokens = new TokenProvider(config);
const seymour = new SeymourClient(config, tokens);

const server = new McpServer({
  name: "seymour",
  version: "0.1.0",
});

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function ok(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

function fail(err: unknown): ToolResult {
  let text: string;
  if (err instanceof AuthError) {
    text = err.message;
  } else if (err instanceof SeymourApiError) {
    text = err.message;
  } else if (err instanceof Error && err.name === "TimeoutError") {
    text = `Seymour did not answer within ${Math.round(config.requestTimeoutMs / 1000)}s. Try a narrower question or raise SEYMOUR_REQUEST_TIMEOUT_MS.`;
  } else if (err instanceof Error) {
    text = `${err.name}: ${err.message}`;
  } else {
    text = String(err);
  }
  return { content: [{ type: "text", text }], isError: true };
}

const toolGroupsSchema = z
  .array(z.string().min(1))
  .optional()
  .describe(
    "Seymour tool groups to enable for a NEW session. Defaults to core, research, web_search. " +
      "Add \"email\" or \"foia\" only when the user explicitly wants Seymour to read or send email or work FOIA requests. " +
      "Ignored when session_id is given."
  );

server.registerTool(
  "seymour_ask",
  {
    title: "Ask Seymour",
    description:
      "Send a message to Seymour, Transparent City's data agent, and get the full answer. " +
      "Pass session_id to continue a conversation; omit it to start a new one. " +
      "Seymour can search datasets, fetch portal data, detect anomalies and do web research. " +
      "Responses can take a minute or more when Seymour runs tools.",
    inputSchema: {
      message: z.string().min(1).describe("The question or instruction for Seymour."),
      session_id: z
        .string()
        .optional()
        .describe("Existing Seymour session to continue. Omit to start a new session."),
      model_key: z
        .string()
        .optional()
        .describe("Model key from Seymour's model list. Omit for the default."),
      tool_groups: toolGroupsSchema,
    },
    annotations: { readOnlyHint: false, openWorldHint: true },
  },
  async ({ message, session_id, model_key, tool_groups }) => {
    try {
      const r = await seymour.ask({
        message,
        sessionId: session_id,
        modelKey: model_key,
        toolGroups: tool_groups,
      });
      const toolNames = (r.tool_calls ?? [])
        .map((t) => {
          const o = t as { tool_name?: string; name?: string };
          return o.tool_name ?? o.name ?? null;
        })
        .filter((n): n is string => Boolean(n));
      const meta = [
        `session_id: ${r.session_id}${r.created_session ? " (new)" : ""}`,
        `tool_groups: ${r.tool_groups.join(", ")}`,
        toolNames.length ? `tools used: ${toolNames.join(", ")}` : "tools used: none",
        `execution_time: ${Math.round((r.execution_time_ms ?? 0) / 1000)}s`,
      ].join("\n");
      return ok(`${r.response}\n\n---\n${meta}`);
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  "seymour_list_sessions",
  {
    title: "List Seymour sessions",
    description: "List your recent Seymour chat sessions, newest first, with their ids and titles.",
    inputSchema: {
      limit: z.number().int().min(1).max(100).optional().describe("Max sessions to return (default 20)."),
      offset: z.number().int().min(0).optional().describe("Pagination offset (default 0)."),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ limit, offset }) => {
    try {
      const sessions = await seymour.listSessions(limit ?? 20, offset ?? 0);
      if (!sessions.length) return ok("No sessions found.");
      const lines = sessions.map(
        (s) =>
          `${s.session_id}  |  ${s.title || "(untitled)"}  |  ${s.message_count} msgs  |  ${s.last_message_at ?? s.created_at}`
      );
      return ok(lines.join("\n"));
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  "seymour_get_session",
  {
    title: "Get Seymour session",
    description: "Fetch the transcript and stats of one Seymour session by id.",
    inputSchema: {
      session_id: z.string().min(1).describe("Session id from seymour_ask or seymour_list_sessions."),
      max_messages: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Only return the last N messages (default 40)."),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ session_id, max_messages }) => {
    try {
      const s = await seymour.getSession(session_id);
      const n = max_messages ?? 40;
      const msgs = (s.messages ?? []).slice(-n).map((m) => {
        const o = m as { role?: string; content?: unknown };
        const content = typeof o.content === "string" ? o.content : JSON.stringify(o.content);
        return `[${o.role ?? "?"}] ${content}`;
      });
      const header = [
        `title: ${s.title || "(untitled)"}`,
        `session_id: ${s.session_id}`,
        `model: ${s.model_key ?? "default"}`,
        `tool_groups: ${(s.tool_groups ?? []).join(", ")}`,
        `messages: ${s.message_count}  llm_calls: ${s.llm_call_count}  tokens: ${s.total_tokens_used}` +
          (s.estimated_cost_usd != null ? `  est_cost_usd: ${s.estimated_cost_usd.toFixed(4)}` : ""),
      ].join("\n");
      return ok(`${header}\n\n${msgs.join("\n\n")}`);
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  "seymour_auth_status",
  {
    title: "Seymour auth status",
    description: "Show whether this MCP server is logged in to Transparent City, as which user, and when the token expires.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => {
    try {
      const t = await tokens.getTokens();
      const claims = decodeJwtPayload(t.access_token) ?? {};
      const who =
        (claims["https://transparent.city/email"] as string | undefined) ??
        (claims.email as string | undefined) ??
        (claims.sub as string | undefined) ??
        "unknown";
      return ok(
        [
          `logged_in: true`,
          `user: ${who}`,
          `audience: ${t.audience}`,
          `api_base: ${config.apiBase}`,
          `access_token_expires: ${new Date(t.expires_at).toISOString()}`,
          `refresh_token: ${t.refresh_token ? "present" : "missing"}`,
          `token_file: ${config.tokenPath}`,
        ].join("\n")
      );
    } catch (err) {
      return fail(err);
    }
  }
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is the MCP channel; only ever log to stderr.
  process.stderr.write(`seymour-mcp ready (api: ${config.apiBase}, tokens: ${config.tokenPath})\n`);
}

main().catch((err) => {
  process.stderr.write(`seymour-mcp failed to start: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
