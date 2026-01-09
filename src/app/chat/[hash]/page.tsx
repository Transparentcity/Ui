"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { getPublicSession } from "@/lib/apiClient";
import Link from "next/link";
import "./styles.css";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

interface SessionDetail {
  session_id: string;
  title: string;
  model_key?: string;
  messages: Message[];
  tool_calls?: any[];
  created_at: string;
  last_message_at?: string;
  message_count: number;
}

export default function PublicChatPage() {
  const params = useParams();
  const hash = params.hash as string;
  
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Fetch session data (no auth required)
  useEffect(() => {
    if (hash) {
      getPublicSession(hash)
        .then(setSession)
        .catch(err => {
          console.error("Failed to load chat session:", err);
          setError(err.message || "Chat session not found or private");
        })
        .finally(() => setLoading(false));
    }
  }, [hash]);
  
  if (loading) {
    return (
      <div className="public-chat-page loading">
        <div className="loading-spinner">Loading...</div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="public-chat-page">
        <div className="error-container">
          <h1>Chat Session Not Available</h1>
          <p>{error}</p>
          <p>This chat may be private or the link may be incorrect.</p>
        </div>
      </div>
    );
  }
  
  if (!session) {
    return <div className="public-chat-page">Chat session not found</div>;
  }
  
  return (
    <div className="public-chat-page">
      {/* Header */}
      <div className="chat-header">
        <Link href="/" className="brand">
          <div className="logo-corners">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 3h6v6H3V3z" className="brace" />
              <path d="M15 3h6v6h-6V3z" className="brace" />
              <path d="M3 15h6v6H3v-6z" className="brace" />
              <path d="M15 15h6v6h-6v-6z" className="brace" />
            </svg>
          </div>
          <div className="brand-text">
            <span className="brand-transparent">Transparent</span>
            <span className="brand-city">City</span>
          </div>
        </Link>
        <div className="header-right">
          <button
            className="share-button-header"
            onClick={() => {
              navigator.clipboard.writeText(window.location.href);
              alert("Link copied to clipboard!");
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            Share
          </button>
        </div>
      </div>
      
      {/* Article */}
      <article className="chat-article">
        <div className="chat-info">
          <h1 className="chat-title">{session.title || "Chat Session"}</h1>
          <p className="chat-description">
            AI-powered conversation about civic data and city insights
          </p>
          <div className="chat-meta">
            <span>Created {session.created_at ? new Date(session.created_at).toLocaleDateString() : "Recently"}</span>
            {session.model_key && <span> • {session.model_key}</span>}
            {session.message_count > 0 && <span> • {session.message_count} messages</span>}
          </div>
        </div>
        
        {/* Messages */}
        <div className="messages-container">
          {session.messages && session.messages.length > 0 ? (
            session.messages.map((message, index) => (
              <div
                key={index}
                className={`message ${message.role === "user" ? "message-user" : "message-assistant"}`}
              >
                <div className="message-role">
                  {message.role === "user" ? "You" : "Assistant"}
                </div>
                <div className="message-content">
                  {message.role === "assistant" ? (
                    <div
                      className="markdown-content"
                      dangerouslySetInnerHTML={{
                        __html: message.content.replace(/\n/g, "<br />"),
                      }}
                    />
                  ) : (
                    <p>{message.content}</p>
                  )}
                </div>
                {message.timestamp && (
                  <div className="message-timestamp">
                    {new Date(message.timestamp).toLocaleString()}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="no-messages">No messages in this chat session.</div>
          )}
        </div>
        
        {/* Footer */}
        <div className="chat-footer">
          <div className="cta-section">
            <h3>Start Your Own Chat</h3>
            <p>
              Ask questions about your city's data using AI-powered analysis
              of public datasets.
            </p>
            <Link href="/dashboard" className="cta-button">
              Start Chatting
            </Link>
          </div>
        </div>
      </article>
    </div>
  );
}

