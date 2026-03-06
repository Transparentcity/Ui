import { request } from "./request";

export interface RedisStatus {
  connected: boolean;
  type: "redis" | "memory" | "unknown";
  error?: string | null;
}

export interface HealthResponse {
  status: string;
  version?: string;
  mcp_tools?: number;
  tool_groups?: number;
  redis?: RedisStatus;
  timestamp?: string;
}

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health");
}
