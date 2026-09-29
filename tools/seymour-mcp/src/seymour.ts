import type { Config } from "./config.js";
import { AuthError, TokenProvider } from "./auth.js";

/** Shapes mirror src/lib/api/chat.ts in the UI. */
export interface ChatMessageRequest {
  message: string;
  session_id?: string | null;
  model_key?: string;
  tool_groups?: string[];
}

export interface ChatMessageResponse {
  response: string;
  session_id: string;
  tool_calls: unknown[];
  execution_time_ms: number;
  success: boolean;
}

export interface SessionSummary {
  session_id: string;
  title: string;
  model_key?: string;
  message_count: number;
  last_message_at?: string;
  created_at: string;
  is_active: boolean;
}

export interface SessionDetail extends Omit<SessionSummary, "is_active"> {
  tool_groups: string[];
  messages: unknown[];
  tool_calls: unknown[];
  total_execution_time_ms: number;
  total_tokens_used: number;
  estimated_cost_usd?: number;
  llm_call_count: number;
}

export class SeymourApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "SeymourApiError";
  }
}

export class SeymourClient {
  constructor(
    private readonly config: Config,
    private readonly tokens: TokenProvider,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  private async request<T>(
    path: string,
    method: "GET" | "POST",
    body?: unknown,
    retryOn401 = true
  ): Promise<T> {
    const token = await this.tokens.getAccessToken();
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const res = await this.fetchImpl(`${this.config.apiBase}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.requestTimeoutMs),
    });

    if (res.status === 401 && retryOn401) {
      // Token may have been revoked or rotated elsewhere; re-read disk once.
      this.tokens.invalidate();
      return this.request<T>(path, method, body, false);
    }
    if (!res.ok) {
      const text = (await res.text()).slice(0, 500);
      if (res.status === 401) {
        throw new AuthError(`Seymour API rejected the token (401). ${text}`, "unauthorized");
      }
      throw new SeymourApiError(`Seymour API ${method} ${path} failed with ${res.status}: ${text}`, res.status);
    }
    return (await res.json()) as T;
  }

  async createSession(modelKey: string, toolGroups: string[]): Promise<SessionSummary> {
    const params = new URLSearchParams({ model_key: modelKey });
    for (const g of toolGroups) params.append("tool_groups", g);
    return this.request<SessionSummary>(`/api/chat/new?${params.toString()}`, "POST");
  }

  async sendMessage(payload: ChatMessageRequest): Promise<ChatMessageResponse> {
    return this.request<ChatMessageResponse>("/api/chat/message", "POST", payload);
  }

  async listSessions(limit = 20, offset = 0): Promise<SessionSummary[]> {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    return this.request<SessionSummary[]>(`/api/chat/sessions?${params.toString()}`, "GET");
  }

  async getSession(sessionId: string): Promise<SessionDetail> {
    return this.request<SessionDetail>(`/api/chat/sessions/${encodeURIComponent(sessionId)}`, "GET");
  }

  /**
   * Ask Seymour. Creates a session first when none is given, matching how the
   * web UI does it so tool groups are honored.
   */
  async ask(opts: {
    message: string;
    sessionId?: string;
    modelKey?: string;
    toolGroups?: string[];
  }): Promise<ChatMessageResponse & { created_session: boolean; tool_groups: string[] }> {
    const modelKey = opts.modelKey ?? this.config.defaultModelKey;
    const toolGroups = opts.toolGroups?.length ? opts.toolGroups : this.config.defaultToolGroups;
    let sessionId = opts.sessionId;
    let created = false;
    if (!sessionId) {
      const s = await this.createSession(modelKey, toolGroups);
      sessionId = s.session_id;
      created = true;
    }
    const result = await this.sendMessage({
      message: opts.message,
      session_id: sessionId,
      model_key: modelKey,
      tool_groups: toolGroups,
    });
    return { ...result, created_session: created, tool_groups: toolGroups };
  }
}
