"use client";

import { useState, useRef, useEffect, useCallback, ReactElement } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import ChatSessionLoader from "./ChatSessionLoader";
import MarkdownWithEmbeds from "./MarkdownWithEmbeds";
import ToolCall from "./ToolCall";
import SessionHeader from "./SessionHeader";
import Loader from "./Loader";
import styles from "./ChatView.module.css";
import {
  sendChatMessageStream,
  createNewSession,
  getAvailableModels,
  getSessionStats,
  toggleSessionPublic,
  type ModelGroupInfo,
  type StreamEvent,
  type SessionStats,
} from "@/lib/apiClient";
import {
  PREFERRED_DEFAULT_MODEL_KEY,
  pickDefaultModelKey,
} from "@/lib/modelDefaults";

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
  isError?: boolean;
}

interface ChatViewProps {
  sessionId?: string | null;
  onSessionChange?: (sessionId: string | null) => void;
  initialPrompt?: string | null;
  onInitialPromptHandled?: () => void;
  currentSession?: any; // Store session data for intermediate_steps
}

type ProviderKey = "anthropic" | "openai" | "google" | "grok" | "xai" | "unknown";

function normalizeProviderKey(value: string | undefined | null): ProviderKey {
  const v = (value || "").toLowerCase().trim();
  if (v.includes("anthropic") || v.includes("claude")) return "anthropic";
  if (v.includes("openai") || v.includes("gpt")) return "openai";
  if (v.includes("google") || v.includes("gemini")) return "google";
  if (v.includes("grok")) return "grok";
  if (v.includes("xai") || v.includes("x.ai")) return "xai";
  return "unknown";
}

function getGroupProviderKey(group: ModelGroupInfo): ProviderKey {
  // Prefer explicit model provider if present; fall back to label heuristics.
  const fromModels = group.models?.[0]?.provider;
  const fromLabel = group.label;
  return normalizeProviderKey(fromModels || fromLabel);
}

function getProviderBadgeLetter(provider: ProviderKey): string {
  switch (provider) {
    case "anthropic":
      return "A";
    case "openai":
      return "O";
    case "google":
      return "G";
    case "grok":
    case "xai":
      return "X";
    default:
      return "?";
  }
}

export default function ChatView({
  sessionId = null,
  onSessionChange,
  initialPrompt = null,
  onInitialPromptHandled,
}: ChatViewProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [currentSessionId, setCurrentSessionIdInternal] = useState<string | null>(sessionId);
  
  // Wrap setCurrentSessionId to log all changes
  const setCurrentSessionId = (newId: string | null) => {
    setCurrentSessionIdInternal(newId);
  };
  const [currentSession, setCurrentSession] = useState<any>(null);
  const [selectedModel, setSelectedModel] = useState<string>(
    PREFERRED_DEFAULT_MODEL_KEY
  );
  const [availableModels, setAvailableModels] = useState<ModelGroupInfo[]>([]);
  const [currentAssistantMessageId, setCurrentAssistantMessageId] = useState<string | null>(null);
  // Tracks the last assistant message whose text/share link was copied (for "Copied" feedback).
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [copiedShareId, setCopiedShareId] = useState<string | null>(null);
  // True while the conversation-share request (toggleSessionPublic) is in flight.
  const [isSharing, setIsSharing] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(() => {
    // Initialize stats if sessionId is provided on mount
    if (sessionId) {
      return {
        session_id: sessionId,
        total_tokens_used: 0,
        llm_call_count: 0,
        total_execution_time_ms: 0,
        model_key: PREFERRED_DEFAULT_MODEL_KEY,
        last_message_at: null,
        created_at: new Date().toISOString(),
      };
    }
    return null;
  });
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const modelIconWrapperRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasShownWelcome = useRef(false);
  const lastAutoPromptRef = useRef<string | null>(null);
  const sendMessageRef = useRef<((overrideMessage?: string) => Promise<void>) | undefined>(undefined);
  const hasPendingSendRef = useRef(false);
  const pendingSessionIdRef = useRef<string | null>(null);
  const statsSetFromSessionLoadRef = useRef<string | null>(null); // Track which session had stats set from handleSessionLoaded
  
  // Refs for streaming state (reused across stream calls)
  const streamingStateRef = useRef<{
    fullResponse: string;
    intermediateEvents: Array<{
      type: string;
      content?: string;
      tool_id?: string;
      tool_name?: string;
      timestamp?: string;
    }>;
    toolCalls: any[];
    toolCallMap: Record<string, any>;
  } | null>(null);

  // Update when sessionId prop changes
  // CRITICAL: This effect ensures stats are ALWAYS set when we have a sessionId
  useEffect(() => {
    // If sessionId prop is provided but currentSessionId doesn't match, update it
    if (sessionId && sessionId !== currentSessionId) {
      const isBootstrappedSessionAssignment =
        pendingSessionIdRef.current !== null &&
        sessionId === pendingSessionIdRef.current;

      // Cancel any active stream when switching sessions (but NOT when the
      // sessionId is being assigned as part of the current send/bootstrap)
      if (!isBootstrappedSessionAssignment && abortControllerRef.current) {
        abortControllerRef.current.abort();
        hasPendingSendRef.current = false;
        setIsTyping(false);
        setIsStreaming(false);
        setCurrentAssistantMessageId(null);
      }

      // Clear messages from the previous session so ChatSessionLoader can
      // populate them cleanly.  Without this, stale messages linger and the
      // "loaded.length > prev.length" guard in handleMessagesLoaded can
      // silently discard the new session's messages.
      if (!isBootstrappedSessionAssignment) {
        setMessages([]);
      }

      // Set currentSessionId FIRST so the header knows we have a session
      setCurrentSessionId(sessionId);
      if (isBootstrappedSessionAssignment) {
        pendingSessionIdRef.current = null;
      }
      
      // IMMEDIATELY set placeholder stats so header appears right away
      // This is critical for old conversations - header should show immediately
      setSessionStats((prevStats) => {
        // Only set if we don't already have stats for this exact session
        if (!prevStats || prevStats.session_id !== sessionId) {
          return {
            session_id: sessionId,
            total_tokens_used: 0,
            llm_call_count: 0,
            total_execution_time_ms: 0,
            model_key: selectedModel || PREFERRED_DEFAULT_MODEL_KEY,
            last_message_at: null,
            created_at: new Date().toISOString(),
          };
        }
        // Keep existing stats for this session
        return prevStats;
      });
    } else if (!sessionId && currentSessionId) {
      // Reset when sessionId prop becomes null (e.g., when clicking "New Chat")
      // Only preserve state if we're in the middle of streaming to prevent data loss
      if (isStreaming || hasPendingSendRef.current) {
        return; // Don't clear during active operations
      }
      
      // When explicitly starting a new chat (sessionId becomes null), clear everything
      hasShownWelcome.current = false;
      setSessionStats(null);
      statsSetFromSessionLoadRef.current = null;
      setCurrentSessionId(null);
      // Clear messages to show welcome view
      setMessages([]);
    } else if (sessionId && sessionId === currentSessionId) {
      // Ensure stats exist even if they were cleared somehow
      // This is a safety net to prevent header from disappearing
      setSessionStats((prevStats) => {
        if (!prevStats || prevStats.session_id !== sessionId) {
          return {
            session_id: sessionId,
            total_tokens_used: 0,
            llm_call_count: 0,
            total_execution_time_ms: 0,
            model_key: selectedModel || PREFERRED_DEFAULT_MODEL_KEY,
            last_message_at: null,
            created_at: new Date().toISOString(),
          };
        }
        return prevStats;
      });
    }
    // Remove sessionStats from deps - we use functional update to access it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, currentSessionId, selectedModel]);

  // Show welcome message when no session is loaded (only once)
  useEffect(() => {
    if (!currentSessionId && messages.length === 0 && !hasShownWelcome.current) {
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content:
            "Hello! I'm Seymour, your AI assistant for analyzing civic data. How can I help you today?",
        },
      ]);
      hasShownWelcome.current = true;
    }
  }, [currentSessionId, messages.length]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-resize textarea when message changes
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const maxHeight = window.innerHeight * 0.25; // 25% of screen height
      const newHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${newHeight}px`;
      if (textarea.scrollHeight > maxHeight) {
        textarea.style.overflowY = 'auto';
      } else {
        textarea.style.overflowY = 'hidden';
      }
    }
  }, [message]);

  // Fetch session stats when session changes, but NOT during streaming
  // This prevents the header from disappearing during message streaming
  useEffect(() => {
    // Don't fetch during streaming - wait until it's complete
    if (isStreaming) {
      return;
    }

    // Don't clear stats if we have a sessionId - keep them visible
    if (!currentSessionId) {
      // Only clear stats if we truly have no session and aren't waiting for one
      if (!pendingSessionIdRef.current && !sessionId) {
        setSessionStats(null);
        statsSetFromSessionLoadRef.current = null;
      }
      return;
    }

    // CRITICAL: Always ensure we have stats when we have a sessionId
    // Skip placeholder zeros if session loader already populated stats.
    if (statsSetFromSessionLoadRef.current !== currentSessionId) {
      setSessionStats((prevStats) => {
        if (!prevStats || prevStats.session_id !== currentSessionId) {
          return {
            session_id: currentSessionId,
            total_tokens_used: 0,
            llm_call_count: 0,
            total_execution_time_ms: 0,
            model_key: selectedModel || PREFERRED_DEFAULT_MODEL_KEY,
            last_message_at: null,
            created_at: new Date().toISOString(),
          };
        }
        return prevStats;
      });
    }

    // Fetch stats for the current session to ensure they're up to date
    // But preserve existing stats if the fetch fails
    const fetchStats = async () => {
      try {
        const token = await getAccessTokenSilently();
        const stats = await getSessionStats(currentSessionId, token);
        // Always update with fresh stats (they may have changed after a new message)
        // This ensures the header shows the latest token counts
        setSessionStats(stats);
        // Clear the flag since we now have real stats
        statsSetFromSessionLoadRef.current = null;
      } catch (error) {
        console.error("Failed to fetch session stats:", error);
        // Don't set to null on error - keep existing stats if available
        // The placeholder stats we set above will remain visible
        // This ensures the header stays visible even if the API call fails
      }
    };

    // Fetch stats (will update if they've changed, but won't clear if fetch fails)
    fetchStats();
    // Remove sessionStats from deps to prevent infinite loops
     
  }, [currentSessionId, isStreaming, sessionId, getAccessTokenSilently, selectedModel]);

  const handleMessagesLoaded = useCallback((loadedMessages: Message[]) => {
    // If we're in the middle of sending/streaming, ignore loader updates.
    // This prevents a race where the session fetch returns before the first
    // message is persisted, wiping the optimistic user message.
    if (hasPendingSendRef.current || isStreaming) {
      return;
    }

    setMessages((prevMessages) => {
      if (loadedMessages.length > 0) {
        // Always accept loaded messages — they are authoritative for the
        // session that ChatSessionLoader just fetched.
        hasShownWelcome.current = false;
        return loadedMessages;
      }

      // No loaded messages — if we also have no previous messages, keep empty
      // (the UI will show "No messages yet" for the session, or the welcome
      // composer if there's no session).
      if (prevMessages.length === 0) {
        return prevMessages;
      }

      // We have previous messages but loaded is empty — this can happen when
      // streaming just finished and the persisted session hasn't caught up.
      // Keep existing messages to avoid flicker.
      return prevMessages;
    });
  }, [isStreaming]);

  const handleSessionLoaded = useCallback((session: any) => {
    
    // Store session data for intermediate_steps access
    setCurrentSession(session);
    
    // Update selected model from session if available
    if (session.model_key) {
      setSelectedModel(session.model_key);
    }
    
    // Always set stats from session data (even if all 0 for old sessions)
    // This ensures the header always displays when a session is loaded
    // Use the model from session, or fall back to current selectedModel, or default
    const modelKeyForStats = session.model_key || selectedModel || PREFERRED_DEFAULT_MODEL_KEY;
    const stats = {
      session_id: session.session_id,
      total_tokens_used: session.total_tokens_used ?? 0,
      llm_call_count: session.llm_call_count ?? 0,
      total_execution_time_ms: session.total_execution_time_ms ?? 0,
      model_key: modelKeyForStats,
      last_message_at: session.last_message_at || null,
      created_at: session.created_at || new Date().toISOString(),
      estimated_cost_usd: session.estimated_cost_usd ?? 0,
    };

    // Never let a stale session fetch wipe live streaming totals (DB can lag).
    setSessionStats((prevStats) => {
      if (!prevStats || prevStats.session_id !== session.session_id) {
        return stats;
      }
      return {
        ...stats,
        total_tokens_used: Math.max(
          prevStats.total_tokens_used ?? 0,
          stats.total_tokens_used
        ),
        llm_call_count: Math.max(
          prevStats.llm_call_count ?? 0,
          stats.llm_call_count
        ),
        estimated_cost_usd: Math.max(
          prevStats.estimated_cost_usd ?? 0,
          stats.estimated_cost_usd ?? 0
        ),
      };
    });
    // Mark that we've set stats from session load to prevent them from being cleared
    statsSetFromSessionLoadRef.current = session.session_id;
    
    // Ensure currentSessionId is set if it's not already
    if (session.session_id && session.session_id !== currentSessionId) {
      setCurrentSessionId(session.session_id);
    }
    
    // Session loaded, messages are already in handleMessagesLoaded
    if (onSessionChange && session.session_id !== currentSessionId) {
      onSessionChange(session.session_id);
    }
  }, [onSessionChange, currentSessionId, selectedModel]);

  // Load available models on mount (with deduplication)
  const isLoadingModelsRef = useRef(false);
  const modelsLoadedRef = useRef(false);
  
  useEffect(() => {
    // Prevent duplicate loads
    if (isLoadingModelsRef.current || modelsLoadedRef.current) {
      return;
    }

    const loadModels = async () => {
      isLoadingModelsRef.current = true;
      try {
        // Try to get token, but don't fail if it's not available
        let token: string | undefined;
        try {
          token = await getAccessTokenSilently();
        } catch (tokenError) {
          console.warn("Could not get auth token, trying without authentication:", tokenError);
        }
        const models = await getAvailableModels(token);
        setAvailableModels(models);
        modelsLoadedRef.current = true;

        // Prefer Claude Sonnet 4 if present; otherwise fall back gracefully.
        const defaultKey = pickDefaultModelKey(models);
        if (defaultKey) {
          setSelectedModel(defaultKey);
        }
      } catch (error) {
        console.error("Failed to load models:", error);
        // Set empty array so UI shows "Loading models..." state
        setAvailableModels([]);
      } finally {
        isLoadingModelsRef.current = false;
      }
    };
    loadModels();
    // Only load once on mount - remove getAccessTokenSilently from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run once on mount

  const handleSend = async (overrideMessage?: string) => {
    const userMessageText = (overrideMessage ?? message).trim();
    if (!userMessageText || isStreaming) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: userMessageText,
    };

    setMessages((prev) => [...prev, userMessage]);
    setMessage("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.overflowY = 'hidden';
    }
    setIsTyping(true);
    setIsStreaming(true);
    hasPendingSendRef.current = true;

    // Create assistant message ID for streaming (but don't add to messages until content arrives)
    const assistantMessageId = `assistant-${Date.now()}`;
    setCurrentAssistantMessageId(assistantMessageId);
    
    // Don't add empty message to messages array - wait for first token

    try {
      const token = await getAccessTokenSilently();
      
      // Create new session if needed
      let sessionIdToUse = currentSessionId;
      if (!sessionIdToUse) {
        try {
          const newSession = await createNewSession(selectedModel, undefined, token);
          sessionIdToUse = newSession.session_id;
          pendingSessionIdRef.current = sessionIdToUse;
          setCurrentSessionId(sessionIdToUse);
          if (onSessionChange) {
            onSessionChange(sessionIdToUse);
          }
          // Immediately notify sidebar to refresh session list
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("chat:sessions:invalidate")
            );
          }
        } catch (error) {
          console.error("Failed to create session:", error);
          // Continue anyway - backend will create session
        }
      }

      // Track streaming state - use refs to ensure we always have latest values
      streamingStateRef.current = {
        fullResponse: "",
        intermediateEvents: [],
        toolCalls: [],
        toolCallMap: {},
      };

      // Create abort controller for cancellation
      abortControllerRef.current = new AbortController();

      // Stream the response
      await sendChatMessageStream(
        {
          message: userMessageText,
          session_id: sessionIdToUse || undefined,
          model_key: selectedModel,
        },
        token,
        (event: StreamEvent) => {
          
          if (abortControllerRef.current?.signal.aborted) {
            return;
          }

          const now = new Date().toISOString();

          if (event.type === "session_id" && event.content) {
            const newSessionId = event.content;
            if (newSessionId !== sessionIdToUse) {
              pendingSessionIdRef.current = newSessionId;
              setCurrentSessionId(newSessionId);
              if (onSessionChange) {
                onSessionChange(newSessionId);
              }
              // Nudge sidebar session list to refresh
              if (typeof window !== "undefined") {
                window.dispatchEvent(
                  new CustomEvent("chat:sessions:invalidate")
                );
              }
            }
          } else if (event.type === "token" && event.content) {
            // Append token to response using ref
            if (!streamingStateRef.current) {
              console.error("❌ Streaming state ref is null!");
              return;
            }
            
            streamingStateRef.current.fullResponse += event.content;
            streamingStateRef.current.intermediateEvents.push({
              type: "text_response",
              content: event.content,
              timestamp: now,
            });

            // Update the assistant message - use functional update to ensure we have latest state
            setMessages((prev) => {
              const currentContent = streamingStateRef.current!.fullResponse;
              const currentEvents = [...streamingStateRef.current!.intermediateEvents];
              
              const messageExists = prev.some((msg) => msg.id === assistantMessageId);
              if (!messageExists) {
                // First token - create the message now that we have content
                return [
                  ...prev,
                  {
                    id: assistantMessageId,
                    role: "assistant" as const,
                    content: currentContent,
                    tool_calls: [],
                    intermediate_events: currentEvents,
                  },
                ];
              }
              
              const updated = prev.map((msg) =>
                msg.id === assistantMessageId
                  ? {
                      ...msg,
                      content: currentContent,
                      intermediate_events: currentEvents,
                    }
                  : msg
              );
              
              // Log for debugging
              if (updated.length > 0 && updated[updated.length - 1].id === assistantMessageId) {
              }
              
              return updated;
            });
          } else if (event.type === "tool_call_start") {
            if (!streamingStateRef.current) return;
            
            const toolId = event.tool_id || `tool-${Date.now()}`;
            const toolName = event.tool_name || "unknown";
            
            streamingStateRef.current.toolCallMap[toolId] = {
              tool_id: toolId,
              tool_name: toolName,
              arguments: null,
              response: null,
              success: null,
            };

            streamingStateRef.current.intermediateEvents.push({
              type: "tool_call_start",
              tool_id: toolId,
              tool_name: toolName,
              timestamp: now,
            });

            // Update message with tool call start (create if doesn't exist yet)
            setMessages((prev) => {
              const messageExists = prev.some((msg) => msg.id === assistantMessageId);
              if (!messageExists) {
                // Create message with tool call even if no text content yet
                return [
                  ...prev,
                  {
                    id: assistantMessageId,
                    role: "assistant" as const,
                    content: streamingStateRef.current!.fullResponse,
                    tool_calls: [],
                    intermediate_events: [...streamingStateRef.current!.intermediateEvents],
                  },
                ];
              }
              return prev.map((msg) =>
                msg.id === assistantMessageId
                  ? {
                      ...msg,
                      intermediate_events: [...streamingStateRef.current!.intermediateEvents],
                    }
                  : msg
              );
            });
          } else if (event.type === "tool_call_args" && event.tool_id) {
            if (streamingStateRef.current?.toolCallMap[event.tool_id]) {
              streamingStateRef.current.toolCallMap[event.tool_id].arguments = event.arguments;
            }
          } else if (event.type === "tool_call_complete" && event.tool_id) {
            if (!streamingStateRef.current) return;
            
            if (streamingStateRef.current.toolCallMap[event.tool_id]) {
              streamingStateRef.current.toolCallMap[event.tool_id].response = event.response;
              streamingStateRef.current.toolCallMap[event.tool_id].success = event.success;
              streamingStateRef.current.toolCalls.push(streamingStateRef.current.toolCallMap[event.tool_id]);
            }

            streamingStateRef.current.intermediateEvents.push({
              type: "tool_call_complete",
              tool_id: event.tool_id,
              tool_name: event.tool_name,
              timestamp: now,
            });

            // Update message with tool calls
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? {
                      ...msg,
                      tool_calls: [...streamingStateRef.current!.toolCalls],
                      intermediate_events: [...streamingStateRef.current!.intermediateEvents],
                    }
                  : msg
              )
            );
          } else if (event.type === "title_update" && event.title) {
            // Title update - notify sidebar to update immediately
            // Dispatch event with session ID and title for optimistic update
            if (typeof window !== "undefined" && sessionIdToUse) {
              window.dispatchEvent(
                new CustomEvent("chat:session:title-updated", {
                  detail: {
                    session_id: sessionIdToUse,
                    title: event.title,
                  },
                })
              );
              // Also trigger a refresh after a delay to ensure backend persistence
              window.dispatchEvent(new CustomEvent("chat:sessions:invalidate"));
            }
          } else if (event.type === "token_usage") {
            // Real-time token usage update from streaming
            // Handle both nested token_usage object and flat fields
            const tokenData = event.token_usage || event;
            const sessionTokens = tokenData.session_total_tokens ?? 0;
            const callCount = tokenData.llm_call_count ?? 0;
            const costUsd = tokenData.estimated_cost_usd ?? 0;
            
            
            // Update session stats in real-time
            setSessionStats((prevStats) => {
              if (!prevStats) {
                // Create new stats object if none exists
                return {
                  session_id: sessionIdToUse || "",
                  total_tokens_used: sessionTokens,
                  llm_call_count: callCount,
                  total_execution_time_ms: 0,
                  model_key: selectedModel || PREFERRED_DEFAULT_MODEL_KEY,
                  last_message_at: new Date().toISOString(),
                  created_at: new Date().toISOString(),
                  estimated_cost_usd: costUsd,
                };
              }
              // Update existing stats with streaming values
              return {
                ...prevStats,
                total_tokens_used: sessionTokens,
                llm_call_count: callCount,
                last_message_at: new Date().toISOString(),
                estimated_cost_usd: costUsd,
              };
            });
          } else if (event.type === "heartbeat") {
            // Heartbeat event - just keep connection alive, don't process
            return;
          } else if (event.type === "end") {
            // Stream ended
            setIsTyping(false);
            setIsStreaming(false);
            setCurrentAssistantMessageId(null);
            
            // Refresh session stats after streaming completes
            // Add a small delay to ensure backend has persisted the stats
            if (sessionIdToUse) {
              setTimeout(() => {
                getSessionStats(sessionIdToUse, token)
                  .then((stats) => {
                    setSessionStats(stats);
                  })
                  .catch((error) => {
                    console.error("Failed to refresh stats after stream:", error);
                    // Keep existing stats - don't clear them
                    // Use functional update to check current state
                    setSessionStats((prevStats) => {
                      // If we don't have stats or they're for a different session, set placeholder
                      if (!prevStats || prevStats.session_id !== sessionIdToUse) {
                        return {
                          session_id: sessionIdToUse,
                          total_tokens_used: 0,
                          llm_call_count: 0,
                          total_execution_time_ms: 0,
                          model_key: selectedModel || PREFERRED_DEFAULT_MODEL_KEY,
                          last_message_at: null,
                          created_at: new Date().toISOString(),
                        };
                      }
                      // Otherwise keep existing stats
                      return prevStats;
                    });
                  });
              }, 500); // Wait 500ms for backend to persist
            }
          } else if (event.type === "error") {
            console.error("❌ Stream error event:", event);
            const errorContent = event.content || "Unknown error";
            const isCancellation =
              errorContent.includes("cancelled") ||
              errorContent.includes("Stream cancelled");

            if (!isCancellation) {
              const errorId = `error-${Date.now()}`;
              setMessages((prev) => [
                ...prev,
                {
                  id: errorId,
                  role: "assistant" as const,
                  content: errorContent,
                  isError: true,
                },
              ]);
            }
          } else {
            // Log unhandled event types
          }
        },
        abortControllerRef.current?.signal // Pass abort signal to fetch
      );
      

      // Finalize the message - ensure it exists and has all content
      if (!streamingStateRef.current) {
        console.error("❌ Streaming state ref is null when finalizing!");
        return;
      }
      
      const finalContent = streamingStateRef.current.fullResponse;
      const finalToolCalls = [...streamingStateRef.current.toolCalls];
      const finalEvents = [...streamingStateRef.current.intermediateEvents];
      
      // Only create/update message if there's actual content, tool calls, or events
      if (finalContent.trim() || finalToolCalls.length > 0 || finalEvents.length > 0) {
        setMessages((prev) => {
          const messageExists = prev.some((msg) => msg.id === assistantMessageId);
          if (!messageExists) {
            return [
              ...prev,
              {
                id: assistantMessageId,
                role: "assistant" as const,
                content: finalContent,
                tool_calls: finalToolCalls,
                intermediate_events: finalEvents,
              },
            ];
          }
          
          return prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  content: finalContent,
                  tool_calls: finalToolCalls,
                  intermediate_events: finalEvents,
                }
              : msg
          );
        });
      } else {
      }
      
    } catch (error: any) {
      console.error("❌ Chat error:", error);
      console.error("Error stack:", error.stack);
      
      // Check if this is an abort/cancellation error (expected)
      const isAbortError = 
        error instanceof Error && 
        (error.name === "AbortError" || 
         error.message?.includes("aborted") || 
         error.message?.includes("cancelled") ||
         error.message?.includes("Stream cancelled"));
      
      if (isAbortError) {
        // Don't show error message for cancellations - the partial response is fine
      } else {
        // Update assistant message with error for real errors
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  content: `${msg.content}\n\n⚠️ Error: ${error.message || "Unknown error"}. Please try again.`,
                }
              : msg
          )
        );
      }
    } finally {
      hasPendingSendRef.current = false;
      setIsTyping(false);
      setIsStreaming(false);
      setCurrentAssistantMessageId(null);
      abortControllerRef.current = null;
    }
  };

  // Keep an up-to-date send function available for side effects.
  sendMessageRef.current = handleSend;

  // Auto-send a one-time prefilled prompt when supplied by parent route state.
  useEffect(() => {
    const prompt = initialPrompt?.trim();
    if (!prompt) return;
    if (isStreaming || hasPendingSendRef.current) return;
    if (lastAutoPromptRef.current === prompt) return;

    lastAutoPromptRef.current = prompt;
    void sendMessageRef.current?.(prompt);
    onInitialPromptHandled?.();
  }, [initialPrompt, isStreaming, onInitialPromptHandled]);

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    hasPendingSendRef.current = false;
    setIsTyping(false);
    setIsStreaming(false);
    setCurrentAssistantMessageId(null);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Close model dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // Check if click is outside both the welcome view dropdown and the chat view icon wrapper
      const isOutsideWelcome = !modelDropdownRef.current || !modelDropdownRef.current.contains(target);
      const isOutsideChat = !modelIconWrapperRef.current || !modelIconWrapperRef.current.contains(target);
      
      if (isOutsideWelcome && isOutsideChat) {
        setIsModelDropdownOpen(false);
      }
    };

    if (isModelDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isModelDropdownOpen]);

  // Get selected model info for display
  const getSelectedModelInfo = () => {
    for (const group of availableModels) {
      const model = group.models.find((m) => m.key === selectedModel);
      if (model) {
        return { group, model };
      }
    }
    return null;
  };

  const selectedModelInfo = getSelectedModelInfo();

  // Extract the full plain-text answer for an assistant message, preferring the
  // streamed text_response events (which exclude tool calls) and falling back to content.
  const getAnswerText = (msg: Message): string => {
    const fromEvents = (msg.intermediate_events || [])
      .filter((e) => e.type === "text_response" && e.content)
      .map((e) => e.content)
      .join("");
    return (fromEvents.trim() ? fromEvents : msg.content || "").trim();
  };

  const handleCopyAnswer = async (msg: Message) => {
    const text = getAnswerText(msg);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(msg.id);
      setTimeout(() => {
        setCopiedMessageId((id) => (id === msg.id ? null : id));
      }, 1500);
    } catch {
      // Clipboard may be unavailable (e.g. insecure context); fail silently.
    }
  };

  // Share the whole conversation: make the session public (idempotent) and copy
  // its /chat/{hash} link. Mirrors the share flow in SessionList's handleCopyUrl.
  const handleShareConversation = async (msg: Message) => {
    if (!currentSessionId || isSharing) return;
    setIsSharing(true);
    try {
      const token = await getAccessTokenSilently();
      const data = await toggleSessionPublic(currentSessionId, true, token);
      // The public link uses a server-generated hash, so rely on public_url
      // rather than fabricating a URL from the session id.
      if (!data.public_url) return;
      const url = `${window.location.origin}${data.public_url}`;
      await navigator.clipboard.writeText(url);
      setCopiedShareId(msg.id);
      setTimeout(() => {
        setCopiedShareId((id) => (id === msg.id ? null : id));
      }, 1500);
    } catch {
      // Share/clipboard may fail (offline, insecure context); fail silently.
    } finally {
      setIsSharing(false);
    }
  };

  // Footer shown under a completed Seymour answer: icon-only Copy, plus a Share
  // button (copies a public conversation link) once the session is saved.
  const renderMessageActions = (msg: Message) => {
    if (!getAnswerText(msg)) return null;
    const justCopied = copiedMessageId === msg.id;
    const justCopiedShare = copiedShareId === msg.id;
    return (
      <div className={styles.messageActions}>
        <button
          type="button"
          className={styles.messageActionButton}
          onClick={() => handleCopyAnswer(msg)}
          aria-label={justCopied ? "Answer copied" : "Copy answer"}
          title={justCopied ? "Copied" : "Copy answer"}
        >
          {justCopied ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
        </button>
        {currentSessionId && (
          <button
            type="button"
            className={styles.messageActionButton}
            onClick={() => handleShareConversation(msg)}
            disabled={isSharing}
            aria-label={justCopiedShare ? "Share link copied" : "Copy share link"}
            title={justCopiedShare ? "Link copied" : "Copy link to this conversation"}
          >
            {justCopiedShare ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
                <path d="M16 6l-4-4-4 4" />
                <path d="M12 2v14" />
              </svg>
            )}
          </button>
        )}
      </div>
    );
  };

  const renderAssistantMessage = (msg: Message, isActiveStream: boolean = false) => {
    // Check if we have intermediate events for chronological rendering
    // Only use message-level events - session-level events contain ALL events from all messages
    // which would cause tool calls to appear at the top incorrectly
    const intermediateEvents = msg.intermediate_events || [];
    
    // Don't fall back to session-level intermediate_steps as they contain events from all messages
    // This would cause incorrect chronological ordering
    
    if (intermediateEvents.length > 0) {
      // Sort events by timestamp for proper chronological order
      const sortedEvents = [...intermediateEvents].sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeA - timeB;
      });

      const elements: ReactElement[] = [];
      let currentTextContent = "";
      let lastEventType: string | null = null;

      sortedEvents.forEach((event, idx) => {
        if (event.type === "text_response") {
          // If this is the first text event or we just had a tool call, create a new text div
          if (currentTextContent === "" || lastEventType === "tool_call_start") {
            // Finalize previous text div if it exists
            if (currentTextContent.trim()) {
              elements.push(
                <div key={`text-${idx}`} className={styles.messageContent}>
                  <MarkdownWithEmbeds content={currentTextContent} />
                </div>
              );
            }
            currentTextContent = "";
          }

          // Accumulate text content
          if (event.content) {
            currentTextContent += event.content;
          }
        } else if (event.type === "tool_call_start") {
          // Finalize current text div before adding tool call
          if (currentTextContent.trim()) {
            elements.push(
              <div key={`text-before-tool-${idx}`} className={styles.messageContent}>
                <MarkdownWithEmbeds content={currentTextContent} />
              </div>
            );
            currentTextContent = "";
          }

          // Find the corresponding tool call from tool_calls array
          const toolCall = msg.tool_calls?.find(
            (tc) => tc.tool_id === event.tool_id
          );
          if (toolCall) {
            elements.push(
              <ToolCall
                key={`${msg.id}-tool-${idx}`}
                toolCall={toolCall}
              />
            );
          }
        }

        lastEventType = event.type;
      });

      // Finalize the last text segment
      if (currentTextContent.trim()) {
        elements.push(
          <div key="text-final" className={styles.messageContent}>
            <MarkdownWithEmbeds content={currentTextContent} />
          </div>
        );
      }

      // If there's additional message content that wasn't in intermediate events, add it at the end
      if (msg.content && !intermediateEvents.some(e => e.type === "text_response" && e.content === msg.content)) {
        // Check if the content is already covered by intermediate events
        const allTextFromEvents = intermediateEvents
          .filter(e => e.type === "text_response" && e.content)
          .map(e => e.content)
          .join("");
        
        // Only add if the message content is different from what we've already rendered
        if (msg.content.trim() !== allTextFromEvents.trim()) {
          elements.push(
            <div key="message-content-final" className={styles.messageContent}>
              <MarkdownWithEmbeds content={msg.content} />
            </div>
          );
        }
      }

      if (isActiveStream) {
        elements.push(
          <div key="thinking" className={styles.thinkingIndicator}>
            <span className={styles.thinkingDot} />
            <span className={styles.thinkingDot} />
            <span className={styles.thinkingDot} />
          </div>
        );
      }
      return <>{elements}</>;
    } else {
      // Fallback: render content and tool calls separately (old behavior)
      return (
        <>
          {/* Render tool calls before content */}
          {msg.tool_calls &&
            msg.tool_calls.length > 0 &&
            msg.tool_calls.map((toolCall, idx) => (
              <ToolCall key={`${msg.id}-tool-${idx}`} toolCall={toolCall} />
            ))}
          {/* Render markdown content */}
          {msg.content && (
            <div className={styles.messageContent}>
              <MarkdownWithEmbeds content={msg.content} />
            </div>
          )}
          {isActiveStream && (
            <div className={styles.thinkingIndicator}>
              <span className={styles.thinkingDot} />
              <span className={styles.thinkingDot} />
              <span className={styles.thinkingDot} />
            </div>
          )}
        </>
      );
    }
  };

  // Determine if we should show the welcome composer (new chat state)
  // Only show welcome if we truly have no session AND no messages (or just welcome message)
  // IMPORTANT: If we have messages with actual content (not just welcome), keep showing chat view
  const hasRealMessages = messages.length > 0 && 
    !(messages.length === 1 && messages[0]?.id === "welcome");
  
  const showWelcomeComposer = 
    !currentSessionId && 
    !isStreaming && 
    !hasRealMessages &&
    (messages.length === 0 || (messages.length === 1 && messages[0]?.id === "welcome"));

  // Quick prompts for the welcome view
  const quickPrompts = [
    "What are the crime trends in my neighborhood?",
    "How's the budget allocated this year?",
    "Show me 311 complaints by district",
    "What is the drug crime enforcement data?",
  ];

  const handleQuickPrompt = (prompt: string) => {
    setMessage(prompt);
  };

  // Render the model dropdown (reused in both views)
  const renderModelDropdown = (isWelcome: boolean = false) => (
    <div
      ref={modelDropdownRef}
      className={isWelcome ? styles.welcomeModelSelect : styles.modelDropdownWrapper}
    >
      <button
        id="model-select"
        className={isWelcome 
          ? styles.welcomeModelButton 
          : `${styles.modelSelectButton} ${isModelDropdownOpen ? styles.modelSelectButtonOpen : ""}`
        }
        onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
        disabled={isStreaming}
        type="button"
        aria-label="Select model"
      >
        {availableModels.length === 0 ? (
          <span className={isWelcome ? styles.welcomeModelName : styles.modelSelectLoading}>Loading...</span>
        ) : selectedModelInfo ? (
          <>
            <span
              className={`${isWelcome ? styles.welcomeModelEmoji : styles.modelSelectEmoji} ${styles.providerBadge}`}
              data-provider={getGroupProviderKey(selectedModelInfo.group)}
              title={selectedModelInfo.group.label}
              aria-hidden="true"
            >
              {getProviderBadgeLetter(getGroupProviderKey(selectedModelInfo.group))}
            </span>
            <span className={isWelcome ? styles.welcomeModelName : styles.modelSelectText}>
              {selectedModelInfo.model.name}
            </span>
            {isWelcome && (
              <span className={`${styles.welcomeModelChevron} ${isModelDropdownOpen ? styles.welcomeModelChevronOpen : ""}`}>
                ▼
              </span>
            )}
          </>
        ) : (
          <span className={isWelcome ? styles.welcomeModelName : styles.modelSelectText}>Select model</span>
        )}
      </button>
      {isModelDropdownOpen && availableModels.length > 0 && (
        <div className={`${styles.modelDropdownMenu} ${isWelcome ? styles.modelDropdownMenuWelcome : ""}`}>
          {availableModels.flatMap((group) =>
            group.models.map((model) => {
              const isSelected = model.key === selectedModel;
              const inputPricePerM = model.input_price
                ? `$${Math.round(model.input_price)}`
                : "N/A";
              const outputPricePerM = model.output_price
                ? `$${Math.round(model.output_price)}`
                : "N/A";
              
              return (
                <button
                  key={model.key}
                  className={`${styles.modelDropdownOption} ${isSelected ? styles.modelDropdownOptionSelected : ""} ${!model.is_available ? styles.modelDropdownOptionDisabled : ""}`}
                  onClick={() => {
                    if (model.is_available) {
                      setSelectedModel(model.key);
                      setIsModelDropdownOpen(false);
                    }
                  }}
                  disabled={!model.is_available || isStreaming}
                  type="button"
                >
                  <div className={styles.modelDropdownOptionHeader}>
                        <span
                          className={`${styles.modelDropdownOptionEmoji} ${styles.providerBadge}`}
                          data-provider={getGroupProviderKey(group)}
                          title={group.label}
                          aria-hidden="true"
                        >
                          {getProviderBadgeLetter(getGroupProviderKey(group))}
                        </span>
                    <span className={styles.modelDropdownOptionName}>
                      {model.name}
                    </span>
                    {isSelected && (
                      <span className={styles.modelDropdownOptionCheck}>
                        ✓
                      </span>
                    )}
                  </div>
                  {model.is_available && (
                    <div className={styles.modelDropdownOptionDetails}>
                      <span className={styles.modelDropdownOptionCost}>
                        Input: {inputPricePerM}/1M tokens
                      </span>
                      <span className={styles.modelDropdownOptionCost}>
                        Output: {outputPricePerM}/1M tokens
                      </span>
                    </div>
                  )}
                  {!model.is_available && (
                    <span className={styles.modelDropdownOptionUnavailable}>
                      API key not configured
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );

  // Welcome Composer View (New Chat State)
  // Only show if we truly have no session AND no real messages
  if (showWelcomeComposer && !hasRealMessages) {
    return (
      <div id="chat-view" className={styles.chatViewRoot}>
        <div className={styles.welcomeContainer}>
          <div className={styles.welcomeContent}>
            <div className={styles.welcomeHeader}>
              <div className={styles.welcomeBracket}>
                <Loader size="lg" color="dark" className="loaderStatic" />
              </div>
              <h1 className={styles.welcomeTitle}>What would you like to explore?</h1>
              <p className={styles.welcomeSubtitle}>
                Ask about crime data, city budgets, 311 complaints, permits, and more. 
                Seymour will help you analyze public data.
              </p>
            </div>

            <div className={styles.welcomeComposer}>
              <textarea
                id="chat-input"
                className={styles.welcomeTextarea}
                placeholder="Ask me anything about civic data..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                autoFocus
              />
              <div className={styles.welcomeActions}>
                {renderModelDropdown(true)}
                <button
                  id="send-btn"
                  className={styles.welcomeSendButton}
                  onClick={() => handleSend()}
                  disabled={!message.trim() || isTyping}
                >
                  <span className={styles.welcomeSendIcon}>→</span>
                  Send
                </button>
              </div>
            </div>

            <div className={styles.welcomeHints}>
              {quickPrompts.map((prompt, idx) => (
                <button
                  key={idx}
                  className={styles.welcomeHint}
                  onClick={() => handleQuickPrompt(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Regular Chat View (Active Session)
  return (
    <div id="chat-view" className={styles.chatViewRoot}>
      <ChatSessionLoader
        sessionId={currentSessionId}
        onMessagesLoaded={handleMessagesLoaded}
        onSessionLoaded={handleSessionLoaded}
        onLoadingChange={setIsLoadingSession}
      />
      <div className={`${styles.sessionHeaderContainer} dashboard-page-header`}>
        <SessionHeader
          sessionId={currentSessionId}
          stats={sessionStats}
          model={selectedModel || PREFERRED_DEFAULT_MODEL_KEY}
        />
      </div>
      <div className={styles.chatContainer}>
        {/* Chat Messages Area */}
        <div id="chat-messages" className={styles.chatMessages}>
          {isLoadingSession ? (
            <div style={{ padding: "40px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px" }}>
              <Loader size="md" color="dark" />
              <div style={{ color: "var(--text-secondary)", textAlign: "center" }}>
                Loading conversation...
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div style={{ padding: "20px", color: "var(--text-secondary)", textAlign: "center" }}>
              No messages yet. Start a conversation!
            </div>
          ) : (
            messages
              .filter((msg) => {
                // Filter out assistant messages with no content and no tool calls
                if (msg.role === "assistant" && !msg.isError && !msg.content && (!msg.tool_calls || msg.tool_calls.length === 0) && (!msg.intermediate_events || msg.intermediate_events.length === 0)) {
                  return false;
                }
                return true;
              })
              .map((msg) => {
                if (msg.isError) {
                  return (
                    <div
                      key={msg.id}
                      className={`${styles.chatMessage} ${styles.assistantMessage}`}
                    >
                      <div className={styles.errorBubble}>
                        <div className={styles.errorTitle}>Something went wrong</div>
                        <div className={styles.errorContent}>{msg.content}</div>
                      </div>
                    </div>
                  );
                }
                return (
                  <div
                    key={msg.id}
                    className={`${styles.chatMessage} ${msg.role === "user" ? styles.userMessage : styles.assistantMessage}` }
                  >
                    {msg.role === "assistant" ? (
                      <div className={styles.assistantBubble}>
                        <div className={styles.assistantName}>Seymour</div>
                        {renderAssistantMessage(msg, isStreaming && msg.id === currentAssistantMessageId)}
                        {!(isStreaming && msg.id === currentAssistantMessageId) &&
                          renderMessageActions(msg)}
                      </div>
                    ) : (
                      <div className={styles.messageContent}>{msg.content}</div>
                    )}
                  </div>
                );
              })
          )}
          {isStreaming && currentAssistantMessageId && !messages.some(m => m.id === currentAssistantMessageId) && (
            <div className={`${styles.chatMessage} ${styles.assistantMessage}`}>
              <div className={styles.assistantBubble}>
                <div className={styles.assistantName}>Seymour</div>
                <div className={styles.thinkingIndicator}>
                  <span className={styles.thinkingDot} />
                  <span className={styles.thinkingDot} />
                  <span className={styles.thinkingDot} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Chat Input Area */}
        <div className={styles.chatInputArea}>
          <div className={styles.chatInputWrapper}>
            {/* Model selector icon inside on the left */}
            <div ref={modelIconWrapperRef} className={styles.modelIconWrapper}>
              {availableModels.length > 0 && selectedModelInfo ? (
                <button
                  className={styles.modelIconButton}
                  onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                  disabled={isStreaming}
                  type="button"
                  aria-label="Select model"
                >
                  <span
                    className={`${styles.modelIconEmoji} ${styles.providerBadge}`}
                    data-provider={getGroupProviderKey(selectedModelInfo.group)}
                    title={selectedModelInfo.group.label}
                    aria-hidden="true"
                  >
                    {getProviderBadgeLetter(getGroupProviderKey(selectedModelInfo.group))}
                  </span>
                </button>
              ) : (
                <div className={styles.modelIconButton} aria-label="Loading models">
                  <span className={styles.modelIconEmoji}>⏳</span>
                </div>
              )}
              {isModelDropdownOpen && availableModels.length > 0 && (
                <>
                  <div 
                    className={styles.modelDropdownBackdrop}
                    onClick={() => setIsModelDropdownOpen(false)}
                  />
                  <div className={styles.modelDropdownMenuCentered}>
                  {availableModels.flatMap((group) =>
                    group.models.map((model) => {
                      const isSelected = model.key === selectedModel;
                      const inputPricePerM = model.input_price
                        ? `$${Math.round(model.input_price)}`
                        : "N/A";
                      const outputPricePerM = model.output_price
                        ? `$${Math.round(model.output_price)}`
                        : "N/A";
                      
                      return (
                        <button
                          key={model.key}
                          className={`${styles.modelDropdownOption} ${isSelected ? styles.modelDropdownOptionSelected : ""} ${!model.is_available ? styles.modelDropdownOptionDisabled : ""}`}
                          onClick={() => {
                            if (model.is_available) {
                              setSelectedModel(model.key);
                              setIsModelDropdownOpen(false);
                            }
                          }}
                          disabled={!model.is_available || isStreaming}
                          type="button"
                        >
                          <div className={styles.modelDropdownOptionHeader}>
                            <span
                              className={`${styles.modelDropdownOptionEmoji} ${styles.providerBadge}`}
                              data-provider={getGroupProviderKey(group)}
                              title={group.label}
                              aria-hidden="true"
                            >
                              {getProviderBadgeLetter(getGroupProviderKey(group))}
                            </span>
                            <span className={styles.modelDropdownOptionName}>
                              {model.name}
                            </span>
                            {isSelected && (
                              <span className={styles.modelDropdownOptionCheck}>
                                ✓
                              </span>
                            )}
                          </div>
                          {model.is_available && (
                            <div className={styles.modelDropdownOptionDetails}>
                              <span className={styles.modelDropdownOptionCost}>
                                Input: {inputPricePerM}/1M tokens
                              </span>
                              <span className={styles.modelDropdownOptionCost}>
                                Output: {outputPricePerM}/1M tokens
                              </span>
                            </div>
                          )}
                          {!model.is_available && (
                            <span className={styles.modelDropdownOptionUnavailable}>
                              API key not configured
                            </span>
                          )}
                        </button>
                      );
                    })
                  )}
                  </div>
                </>
              )}
            </div>
            
            {/* Textarea that grows with content */}
            <textarea
              ref={textareaRef}
              id="chat-input"
              className={styles.chatInput}
              placeholder="Ask me anything about civic data..."
              rows={1}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                // Auto-resize textarea
                const textarea = e.target;
                textarea.style.height = 'auto';
                const maxHeight = window.innerHeight * 0.25; // 25% of screen height
                const newHeight = Math.min(textarea.scrollHeight, maxHeight);
                textarea.style.height = `${newHeight}px`;
                if (textarea.scrollHeight > maxHeight) {
                  textarea.style.overflowY = 'auto';
                } else {
                  textarea.style.overflowY = 'hidden';
                }
              }}
              onKeyPress={handleKeyPress}
            />
            
            {/* Action icons inside on the right */}
            {isStreaming ? (
              <button
                id="stop-btn"
                className={styles.stopIconButton}
                onClick={handleStop}
                type="button"
                aria-label="Stop generation"
              >
                <span className={styles.stopIcon}>⏹</span>
              </button>
            ) : (
              <button
                id="send-btn"
                className={styles.sendIconButton}
                onClick={() => handleSend()}
                disabled={!message.trim() || isTyping}
                type="button"
                aria-label="Send message"
              >
                <span className={styles.sendIcon}>→</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

