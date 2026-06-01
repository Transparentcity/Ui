"use client";

import { useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { getSession } from "@/lib/apiClient";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  tool_calls?: any[];
  intermediate_events?: Array<{
    type: string;
    content?: string;
    tool_id?: string;
    timestamp?: string;
  }>;
}

interface Session {
  session_id: string;
  title: string;
  messages: Message[];
  tool_calls?: any[];
  model_key?: string;
  message_count: number;
  created_at: string;
  last_message_at?: string;
  total_tokens_used?: number;
  llm_call_count?: number;
  total_execution_time_ms?: number;
  estimated_cost_usd?: number;
  intermediate_steps?: Array<{
    type: string;
    content?: string;
    tool_id?: string;
    timestamp?: string;
  }>;
}

interface ChatSessionLoaderProps {
  sessionId: string | null;
  onMessagesLoaded: (messages: Message[]) => void;
  onSessionLoaded: (session: Session) => void;
  onLoadingChange?: (loading: boolean) => void;
}

export default function ChatSessionLoader({
  sessionId,
  onMessagesLoaded,
  onSessionLoaded,
  onLoadingChange,
}: ChatSessionLoaderProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      // Reset to welcome message
      onMessagesLoaded([]);
      onLoadingChange?.(false);
      return;
    }

    let cancelled = false;

    const loadSession = async () => {
      try {
        setLoading(true);
        onLoadingChange?.(true);
        const token = await getAccessTokenSilently();
        const session = await getSession(sessionId, token) as Session;
        
        // Only update if not cancelled
        if (!cancelled) {
          onSessionLoaded(session);
          
          // Convert session messages to the format expected by ChatView
          // Messages from API are Dict[str, Any] with 'role' and 'content' fields
          const sessionToolCalls = session.tool_calls || [];
          const messages: Message[] = (session.messages || []).map((msg: any, index: number) => ({
            id: msg.id || msg.message_id || `msg-${index}`,
            role: msg.role || (msg.type === 'user' ? 'user' : 'assistant'),
            content: msg.content || msg.text || '',
            timestamp: msg.timestamp || msg.created_at,
            tool_calls: msg.tool_calls || [],
            intermediate_events: msg.intermediate_events || [],
          }));
          // Job sessions (e.g. template instantiation) store tool_calls at session level; attach to last assistant message so they render
          if (sessionToolCalls.length > 0) {
            const lastAssistantIdx = messages.map((m, i) => (m.role === 'assistant' ? i : -1)).filter((i) => i >= 0).pop();
            if (lastAssistantIdx !== undefined && (!messages[lastAssistantIdx].tool_calls || messages[lastAssistantIdx].tool_calls!.length === 0)) {
              messages[lastAssistantIdx] = { ...messages[lastAssistantIdx], tool_calls: sessionToolCalls };
            }
          }
          onMessagesLoaded(messages);
        }
      } catch (error) {
        console.error("Error loading session:", error);
        if (!cancelled) {
          onMessagesLoaded([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          onLoadingChange?.(false);
        }
      }
    };

    loadSession();

    // Cleanup function to prevent state updates after unmount or session change
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, getAccessTokenSilently]);

  return null; // This component doesn't render anything
}

