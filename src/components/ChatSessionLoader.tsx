"use client";

import { useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";

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
  model_key?: string;
  message_count: number;
  created_at: string;
  last_message_at?: string;
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
}

export default function ChatSessionLoader({
  sessionId,
  onMessagesLoaded,
  onSessionLoaded,
}: ChatSessionLoaderProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      // Reset to welcome message
      onMessagesLoaded([]);
      return;
    }

    let cancelled = false;

    const loadSession = async () => {
      try {
        setLoading(true);
        const token = await getAccessTokenSilently();
        const API_BASE =
          process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";

        const response = await fetch(
          `${API_BASE}/api/chat/sessions/${sessionId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          }
        );

        if (!response.ok) {
          throw new Error("Failed to load session");
        }

        const session: Session = await response.json();
        
        // Only update if not cancelled
        if (!cancelled) {
          onSessionLoaded(session);
          
          // Convert session messages to the format expected by ChatView
          // Messages from API are Dict[str, Any] with 'role' and 'content' fields
          const messages: Message[] = (session.messages || []).map((msg: any, index: number) => ({
            id: msg.id || msg.message_id || `msg-${index}`,
            role: msg.role || (msg.type === 'user' ? 'user' : 'assistant'),
            content: msg.content || msg.text || '',
            timestamp: msg.timestamp || msg.created_at,
            tool_calls: msg.tool_calls || [],
            intermediate_events: msg.intermediate_events || [],
          }));
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

