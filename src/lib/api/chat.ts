import { request, API_BASE } from "./request";

// Chat API
export interface ChatMessageRequest {
  message: string;
  session_id?: string | null;
  model_key?: string;
  tool_groups?: string[];
}

export interface ChatMessageResponse {
  response: string;
  session_id: string;
  tool_calls: any[];
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

export interface SessionDetail {
  session_id: string;
  title: string;
  model_key?: string;
  tool_groups: string[];
  messages: any[];
  tool_calls: any[];
  intermediate_steps: any[];
  total_execution_time_ms: number;
  total_tokens_used: number;
  total_prompt_tokens?: number;
  total_completion_tokens?: number;
  estimated_cost_usd?: number;
  llm_call_count: number;
  message_count: number;
  created_at: string;
  last_message_at?: string;
}

export interface SessionStats {
  session_id: string;
  total_tokens_used: number;
  total_prompt_tokens?: number;
  total_completion_tokens?: number;
  llm_call_count: number;
  total_execution_time_ms: number;
  model_key: string;
  last_message_at: string | null;
  created_at: string;
  estimated_cost_usd?: number;  // Real-time cost estimate from streaming
}

export interface ModelInfo {
  key: string;
  name: string;
  provider: string;
  context_window: number;
  input_price: number;
  output_price: number;
  is_available: boolean;
}

export interface ModelGroupInfo {
  label: string;
  emoji: string;
  models: ModelInfo[];
}

export interface TokenUsageData {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  session_total_tokens: number;
  session_prompt_tokens: number;
  session_completion_tokens: number;
  llm_call_count: number;
  estimated_cost_usd: number;
}

export interface StreamEvent {
  type: string;
  content?: string;
  tool_id?: string;
  tool_name?: string;
  arguments?: any;
  response?: any;
  success?: boolean;
  title?: string;
  // Token usage fields (present when type === "token_usage")
  token_usage?: TokenUsageData;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  session_total_tokens?: number;
  session_prompt_tokens?: number;
  session_completion_tokens?: number;
  llm_call_count?: number;
  estimated_cost_usd?: number;
}

export function sendChatMessage(
  payload: ChatMessageRequest,
  token: string
): Promise<ChatMessageResponse> {
  return request<ChatMessageResponse>(
    "/api/chat/message",
    "POST",
    payload,
    token
  );
}

export function createNewSession(
  model_key: string = "claude-sonnet-4.6",
  tool_groups?: string[],
  token?: string
): Promise<SessionSummary> {
  const params = new URLSearchParams();
  params.append("model_key", model_key);
  if (tool_groups) {
    tool_groups.forEach((g) => params.append("tool_groups", g));
  }
  const query = params.toString();
  const path = `/api/chat/new${query ? `?${query}` : ""}`;
  return request<SessionSummary>(path, "POST", undefined, token);
}

export function listSessions(
  limit: number = 20,
  offset: number = 0,
  token: string
): Promise<SessionSummary[]> {
  const params = new URLSearchParams();
  params.append("limit", limit.toString());
  params.append("offset", offset.toString());
  const query = params.toString();
  const path = `/api/chat/sessions${query ? `?${query}` : ""}`;
  return request<SessionSummary[]>(path, "GET", undefined, token);
}

export function listJobSessions(
  limit: number = 50,
  offset: number = 0,
  token: string
): Promise<SessionSummary[]> {
  const params = new URLSearchParams();
  params.append("limit", limit.toString());
  params.append("offset", offset.toString());
  const query = params.toString();
  const path = `/api/chat/sessions/jobs${query ? `?${query}` : ""}`;
  return request<SessionSummary[]>(path, "GET", undefined, token);
}

export function getSession(
  sessionId: string,
  token: string
): Promise<SessionDetail> {
  return request<SessionDetail>(
    `/api/chat/sessions/${sessionId}`,
    "GET",
    undefined,
    token
  );
}

export function getSessionStats(
  sessionId: string,
  token: string
): Promise<SessionStats> {
  // Use getSession and extract stats from it
  return getSession(sessionId, token).then((session) => ({
    session_id: session.session_id,
    total_tokens_used: session.total_tokens_used,
    total_prompt_tokens: session.total_prompt_tokens ?? 0,
    total_completion_tokens: session.total_completion_tokens ?? 0,
    llm_call_count: session.llm_call_count,
    total_execution_time_ms: session.total_execution_time_ms,
    model_key: session.model_key || "",
    last_message_at: session.last_message_at || null,
    created_at: session.created_at,
    estimated_cost_usd: session.estimated_cost_usd ?? 0,
  }));
}

export function deleteSession(
  sessionId: string,
  token: string
): Promise<{ message: string; session_id: string }> {
  return request<{ message: string; session_id: string }>(
    `/api/chat/sessions/${sessionId}`,
    "DELETE",
    undefined,
    token
  );
}

export function updateSessionTitle(
  sessionId: string,
  title: string,
  token: string
): Promise<{ message: string; session_id: string; title: string }> {
  return request<{ message: string; session_id: string; title: string }>(
    `/api/chat/sessions/${sessionId}/title`,
    "PUT",
    { title },
    token
  );
}

export function toggleSessionPublic(
  sessionId: string,
  isPublic: boolean,
  token: string
): Promise<{ success: boolean; message: string; public_url?: string }> {
  return request<{ success: boolean; message: string; public_url?: string }>(
    `/api/chat/sessions/${sessionId}/toggle-public`,
    "PUT",
    { is_public: isPublic },
    token
  );
}

export function getPublicSession(shortHash: string): Promise<SessionDetail> {
  return request<SessionDetail>(`/api/chat/public/${shortHash}`);
}

export function getAvailableModels(token?: string): Promise<ModelGroupInfo[]> {
  return request<ModelGroupInfo[]>("/api/chat/models", "GET", undefined, token);
}


async function _executeChatStream(
  url: string,
  request: ChatMessageRequest,
  token: string,
  onEvent: (event: StreamEvent) => void,
  abortSignal?: AbortSignal
): Promise<{ eventCount: number }> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Accept: "text/event-stream",
    },
    body: JSON.stringify(request),
    signal: abortSignal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error("❌ Stream request failed:", response.status, text);
    throw new Error(`Stream request failed: ${response.status} ${text}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    console.error("❌ No response body reader available");
    throw new Error("No response body reader available");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let eventCount = 0;
  let lastActivity = Date.now();
  const MAX_IDLE_TIME = 180000; // 3 minutes (backend sends heartbeats every 15s)
  const HEARTBEAT_CHECK_INTERVAL = 30000;

  const heartbeatChecker = setInterval(() => {
    const now = Date.now();
    if (now - lastActivity > MAX_IDLE_TIME) {
      console.warn("⚠️ Stream idle timeout, closing connection");
      clearInterval(heartbeatChecker);
      reader.cancel();
    }
  }, HEARTBEAT_CHECK_INTERVAL);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        clearInterval(heartbeatChecker);
        break;
      }

      lastActivity = Date.now();
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const eventBlock of events) {
        if (eventBlock.trim() === "") continue;

        const lines = eventBlock.split("\n");
        for (const line of lines) {
          if (line.trim() === "") continue;

          if (line.startsWith("data: ")) {
            try {
              const jsonStr = line.slice(6);
              const data = JSON.parse(jsonStr);

              if (data.type === "heartbeat") {
                continue;
              }

              eventCount++;
              onEvent(data);
            } catch (e) {
              console.error("❌ Failed to parse SSE event:", e, "Line:", line);
            }
          }
        }
      }
    }
  } finally {
    clearInterval(heartbeatChecker);
    try {
      reader.releaseLock();
    } catch {
      // Reader may already be released
    }
  }

  return { eventCount };
}

const MAX_STREAM_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1500;

export async function sendChatMessageStream(
  request: ChatMessageRequest,
  token: string,
  onEvent: (event: StreamEvent) => void,
  abortSignal?: AbortSignal
): Promise<void> {
  const url = `${API_BASE}/api/chat/message/stream`;

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= MAX_STREAM_RETRIES; attempt++) {
    if (abortSignal?.aborted) return;

    try {
      const { eventCount } = await _executeChatStream(
        url,
        request,
        token,
        onEvent,
        abortSignal
      );

      // Stream completed normally (reader.read() returned done)
      return;
    } catch (error) {
      lastError = error;

      const isAbortError =
        error instanceof Error &&
        (error.name === "AbortError" ||
          error.message.includes("aborted") ||
          error.message.includes("cancelled"));

      if (isAbortError) {
        return;
      }

      // Only retry on network-level errors (not HTTP 4xx/5xx which are already handled)
      const isNetworkError =
        error instanceof TypeError ||
        (error instanceof Error &&
          (error.message.toLowerCase().includes("network") ||
            error.message.toLowerCase().includes("failed to fetch") ||
            error.message.toLowerCase().includes("load failed") ||
            error.message.toLowerCase().includes("connection") ||
            error.message.toLowerCase().includes("terminated")));

      if (!isNetworkError || attempt >= MAX_STREAM_RETRIES) {
        break;
      }

      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      console.warn(
        `⚠️ Stream network error (attempt ${attempt + 1}/${MAX_STREAM_RETRIES + 1}), retrying in ${delay}ms...`,
        error
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // All retries exhausted -- forward the error
  if (lastError) {
    try {
      onEvent({
        type: "error",
        content:
          lastError instanceof Error
            ? lastError.message
            : String(lastError),
      });
    } catch {
      // Callback may have been cleaned up
    }
    throw lastError;
  }
}


// CHAT JOBS API
// ============================================================================

export interface ChatJobResponse {
  job_id: string;
  status: string;
  message: string;
  session_id: string;
}

export function createChatJob(
  payload: ChatMessageRequest,
  token: string
): Promise<ChatJobResponse> {
  return request<ChatJobResponse>("/api/chat/jobs", "POST", payload, token);
}


