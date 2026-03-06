import { API_BASE } from "../apiBase";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export { API_BASE };

/** Strip HTML tags and collapse whitespace to produce a readable error message. */
function sanitizeErrorText(raw: string): string {
  if (!raw || !raw.includes("<")) return raw;
  // Remove all HTML tags
  let text = raw.replace(/<[^>]*>/g, " ");
  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();
  // Cap length so error banners stay readable
  if (text.length > 200) text = text.slice(0, 200) + "…";
  return text || raw;
}

/** Map common HTTP status codes to human-readable labels. */
function statusLabel(status: number): string {
  switch (status) {
    case 502: return "Bad Gateway — the backend server may be restarting";
    case 503: return "Service Unavailable — the backend is temporarily down";
    case 504: return "Gateway Timeout — the backend took too long to respond";
    default: return "";
  }
}

export async function request<T>(
  path: string,
  method: HttpMethod = "GET",
  body?: unknown,
  token?: string,
  options?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<T> {
  const url = `${API_BASE}${path}`;

  const headers: HeadersInit = {
    "Accept": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (body && method !== "GET") {
    headers["Content-Type"] = "application/json";
  }

  // Support caller-provided signal, auto-timeout, or both
  let signal = options?.signal;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (!signal && options?.timeoutMs) {
    const controller = new AbortController();
    signal = controller.signal;
    timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: "include",
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === "AbortError") {
      const error: Error & { status?: number } = new Error(
        `Request timed out after ${Math.round((options?.timeoutMs ?? 0) / 1000)}s — the server may be overloaded`
      );
      error.status = 504; // treat as gateway timeout for retry logic
      throw error;
    }
    throw err;
  }
  if (timeoutId) clearTimeout(timeoutId);

  if (!res.ok) {
    const rawText = await res.text().catch(() => "");
    const friendly = statusLabel(res.status);
    const detail = sanitizeErrorText(rawText);
    const message = friendly
      ? `${res.status} ${friendly}${detail ? ` (${detail})` : ""}`
      : `${res.status} ${detail || res.statusText}`;
    const error: Error & { status?: number; statusText?: string } = new Error(message);
    error.status = res.status;
    error.statusText = res.statusText;
    throw error;
  }

  return (await res.json()) as T;
}
