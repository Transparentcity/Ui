"use client";

import { useState, useRef, useEffect, useCallback, ReactElement } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import ReactMarkdown from "react-markdown";
import ChatSessionLoader from "./ChatSessionLoader";
import ToolCall from "./ToolCall";
import {
  sendChatMessageStream,
  createNewSession,
  getAvailableModels,
  type ModelGroupInfo,
  type StreamEvent,
} from "@/lib/apiClient";

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

interface ChatViewProps {
  sessionId?: string | null;
  onSessionChange?: (sessionId: string | null) => void;
  currentSession?: any; // Store session data for intermediate_steps
}

export default function ChatView({ sessionId = null, onSessionChange }: ChatViewProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(sessionId);
  const [currentSession, setCurrentSession] = useState<any>(null);
  const [selectedModel, setSelectedModel] = useState<string>("gpt-5");
  const [availableModels, setAvailableModels] = useState<ModelGroupInfo[]>([]);
  const [currentAssistantMessageId, setCurrentAssistantMessageId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasShownWelcome = useRef(false);
  
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
  useEffect(() => {
    if (sessionId !== currentSessionId) {
      // Cancel any active stream when switching sessions
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        setIsTyping(false);
        setIsStreaming(false);
        setCurrentAssistantMessageId(null);
      }
      
      setCurrentSessionId(sessionId);
      // Reset welcome flag when session changes
      if (!sessionId) {
        hasShownWelcome.current = false;
      }
    }
  }, [sessionId, currentSessionId]);

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

  const handleMessagesLoaded = useCallback((loadedMessages: Message[]) => {
    if (loadedMessages.length > 0) {
      setMessages(loadedMessages);
      hasShownWelcome.current = false; // Reset flag when messages are loaded
    } else {
      // If no messages and no session, show welcome
      if (!currentSessionId && !hasShownWelcome.current) {
        setMessages([
          {
            id: "welcome",
            role: "assistant",
            content:
              "Hello! I'm Seymour, your AI assistant for analyzing civic data. How can I help you today?",
          },
        ]);
        hasShownWelcome.current = true;
      } else if (currentSessionId) {
        // Session exists but no messages yet
        setMessages([]);
      }
    }
  }, [currentSessionId]);

  const handleSessionLoaded = useCallback((session: any) => {
    // Store session data for intermediate_steps access
    setCurrentSession(session);
    // Session loaded, messages are already in handleMessagesLoaded
    // Don't update currentSessionId here to avoid loops - it's already set via props
    if (onSessionChange && session.session_id !== currentSessionId) {
      onSessionChange(session.session_id);
    }
  }, [onSessionChange, currentSessionId]);

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
        const token = await getAccessTokenSilently();
        const models = await getAvailableModels(token);
        setAvailableModels(models);
        modelsLoadedRef.current = true;
      } catch (error) {
        console.error("Failed to load models:", error);
      } finally {
        isLoadingModelsRef.current = false;
      }
    };
    loadModels();
    // Only load once on mount - remove getAccessTokenSilently from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run once on mount

  const handleSend = async () => {
    if (!message.trim() || isStreaming) return;

    const userMessageText = message.trim();
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: userMessageText,
    };

    setMessages((prev) => [...prev, userMessage]);
    setMessage("");
    setIsTyping(true);
    setIsStreaming(true);

    // Create assistant message placeholder for streaming
    const assistantMessageId = `assistant-${Date.now()}`;
    setCurrentAssistantMessageId(assistantMessageId);
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      tool_calls: [],
      intermediate_events: [],
    };
    console.log("➕ Creating assistant message:", assistantMessageId);
    
    // Use functional update to ensure we're working with latest state
    setMessages((prev) => {
      // Check if message already exists (shouldn't, but be safe)
      if (prev.some((msg) => msg.id === assistantMessageId)) {
        console.warn("⚠️ Assistant message already exists, skipping creation");
        return prev;
      }
      const updated = [...prev, assistantMessage];
      console.log("📋 Messages after adding assistant:", updated.length, "messages");
      console.log("📋 Last message:", updated[updated.length - 1]);
      return updated;
    });
    
    // Force a small delay to ensure state is set before streaming starts
    await new Promise((resolve) => setTimeout(resolve, 10));

    try {
      const token = await getAccessTokenSilently();
      
      // Create new session if needed
      let sessionIdToUse = currentSessionId;
      if (!sessionIdToUse) {
        try {
          const newSession = await createNewSession(selectedModel, undefined, token);
          sessionIdToUse = newSession.session_id;
          setCurrentSessionId(sessionIdToUse);
          if (onSessionChange) {
            onSessionChange(sessionIdToUse);
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
      console.log("🚀 Starting chat stream...");
      await sendChatMessageStream(
        {
          message: userMessageText,
          session_id: sessionIdToUse || undefined,
          model_key: selectedModel,
        },
        token,
        (event: StreamEvent) => {
          console.log("📬 Received event:", event.type, event);
          
          if (abortControllerRef.current?.signal.aborted) {
            console.log("⏹️ Stream aborted, ignoring event");
            return;
          }

          const now = new Date().toISOString();

          if (event.type === "session_id" && event.content) {
            const newSessionId = event.content;
            if (newSessionId !== sessionIdToUse) {
              setCurrentSessionId(newSessionId);
              if (onSessionChange) {
                onSessionChange(newSessionId);
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
                console.warn("⚠️ Assistant message not found in state, creating it");
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
                console.log("📝 Updated message content length:", currentContent.length);
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

            // Update message with tool call start
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? {
                      ...msg,
                      intermediate_events: [...streamingStateRef.current!.intermediateEvents],
                    }
                  : msg
              )
            );
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
            // Title update - could notify parent component
            console.log("Session title updated:", event.title);
          } else if (event.type === "end") {
            // Stream ended
            console.log("🏁 Stream ended");
            setIsTyping(false);
            setIsStreaming(false);
            setCurrentAssistantMessageId(null);
          } else if (event.type === "error") {
            console.error("❌ Stream error event:", event);
            throw new Error(event.content || "Stream error occurred");
          } else {
            // Log unhandled event types
            console.log("⚠️ Unhandled event type:", event.type, event);
          }
        }
      );
      
      console.log("✅ Stream completed successfully");

      // Finalize the message - ensure it exists and has all content
      if (!streamingStateRef.current) {
        console.error("❌ Streaming state ref is null when finalizing!");
        return;
      }
      
      const finalContent = streamingStateRef.current.fullResponse;
      const finalToolCalls = [...streamingStateRef.current.toolCalls];
      const finalEvents = [...streamingStateRef.current.intermediateEvents];
      
      setMessages((prev) => {
        const messageExists = prev.some((msg) => msg.id === assistantMessageId);
        if (!messageExists) {
          console.warn("⚠️ Assistant message not found when finalizing, creating it");
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
      
      console.log("✅ Finalized message with content length:", finalContent.length);
      console.log("✅ Final message preview:", finalContent.substring(0, 100));
    } catch (error: any) {
      console.error("❌ Chat error:", error);
      console.error("Error stack:", error.stack);
      
      // Update assistant message with error
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                content: `Sorry, I encountered an error: ${error.message || "Unknown error"}. Please try again.`,
              }
            : msg
        )
      );
    } finally {
      console.log("🧹 Cleaning up stream state");
      setIsTyping(false);
      setIsStreaming(false);
      setCurrentAssistantMessageId(null);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
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

  const renderAssistantMessage = (msg: Message) => {
    // Check if we have intermediate events for chronological rendering
    // Only use message-level events - session-level events contain ALL events from all messages
    // which would cause tool calls to appear at the top incorrectly
    let intermediateEvents = msg.intermediate_events || [];
    
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
                <div key={`text-${idx}`} className="message-content">
                  <ReactMarkdown>{currentTextContent}</ReactMarkdown>
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
              <div key={`text-before-tool-${idx}`} className="message-content">
                <ReactMarkdown>{currentTextContent}</ReactMarkdown>
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
                key={toolCall.tool_id || `tool-${idx}`}
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
          <div key="text-final" className="message-content">
            <ReactMarkdown>{currentTextContent}</ReactMarkdown>
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
            <div key="message-content-final" className="message-content">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
          );
        }
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
              <ToolCall key={toolCall.tool_id || `tool-${idx}`} toolCall={toolCall} />
            ))}
          {/* Render markdown content */}
          {msg.content && (
            <div className="message-content">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
          )}
        </>
      );
    }
  };

  return (
    <div id="chat-view" className="content-view active">
      <ChatSessionLoader
        sessionId={currentSessionId}
        onMessagesLoaded={handleMessagesLoaded}
        onSessionLoaded={handleSessionLoaded}
      />
      <div className="chat-container">
        {/* Chat Messages Area */}
        <div id="chat-messages" className="chat-messages">
          {messages.length === 0 ? (
            <div style={{ padding: "20px", color: "var(--text-secondary)", textAlign: "center" }}>
              No messages yet. Start a conversation!
            </div>
          ) : (
            messages.map((msg) => {
              console.log("🎨 Rendering message:", msg.id, "content length:", msg.content?.length || 0);
              return (
                <div
                  key={msg.id}
                  className={`chat-message ${
                    msg.role === "user" ? "user-message" : "assistant-message"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="assistant-bubble">
                      <div className="assistant-name">Seymour</div>
                      {renderAssistantMessage(msg)}
                    </div>
                  ) : (
                    <div className="message-content">{msg.content}</div>
                  )}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Typing Indicator */}
        {isTyping && (
          <div id="typing-indicator" className="typing-indicator">
            <div className="typing-bubble">
              <div className="typing-dots">
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
              </div>
              <span className="text-secondary">Seymour is thinking...</span>
            </div>
          </div>
        )}

        {/* Chat Input Area */}
        <div className="chat-input-area">
          <div className="chat-input-container">
            <textarea
              id="chat-input"
              className="chat-input"
              placeholder="Ask me anything about civic data..."
              rows={1}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={handleKeyPress}
            />
            <select
              id="model-select"
              className="model-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={isStreaming}
            >
              {availableModels.length === 0 ? (
                <option value="">Loading models...</option>
              ) : (
                availableModels.flatMap((group) =>
                  group.models
                    .filter((m) => m.is_available)
                    .map((model) => (
                      <option key={model.key} value={model.key}>
                        {group.emoji} {model.name}
                      </option>
                    ))
                )
              )}
            </select>
            {isStreaming ? (
              <button
                id="stop-btn"
                className="btn btn-danger"
                onClick={handleStop}
              >
                ⏹ Stop
              </button>
            ) : (
              <button
                id="send-btn"
                className="btn btn-primary"
                onClick={handleSend}
                disabled={!message.trim() || isTyping}
              >
                Send
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

