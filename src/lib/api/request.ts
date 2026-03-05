import { API_BASE } from "../apiBase";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export { API_BASE };

export async function request<T>(
  path: string,
  method: HttpMethod = "GET",
  body?: any,
  token?: string
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

  const res = await fetch(url, {
    method,
    credentials: "include",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const error = new Error(`API ${method} ${path} failed: ${res.status} ${text}`);
    (error as any).status = res.status;
    (error as any).statusText = res.statusText;
    throw error;
  }

  return (await res.json()) as T;
}
