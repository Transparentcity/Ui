// Barrel file: re-exports all API client functions and types from domain modules.
// All existing `import { X } from "@/lib/apiClient"` statements continue to work.

export { API_BASE } from "./apiBase";
export { request } from "./api/request";
export type { HttpMethod } from "./api/request";

export * from "./api/health";
export * from "./api/cities";
export * from "./api/metrics";
export * from "./api/chat";
export * from "./api/jobs";
export * from "./api/user";
export * from "./api/datasets";
export * from "./api/anomalies";
export * from "./api/feed";
export * from "./api/research";
export * from "./api/maps";
export * from "./api/waste";
