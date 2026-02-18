
// ============================================================================
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
