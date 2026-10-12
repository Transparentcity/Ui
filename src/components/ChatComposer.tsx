"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { ModelGroupInfo } from "@/lib/apiClient";
import styles from "./ChatComposer.module.css";

export type ProviderKey = "anthropic" | "openai" | "google" | "grok" | "xai" | "unknown";

export function normalizeProviderKey(value: string | undefined | null): ProviderKey {
  const v = (value || "").toLowerCase().trim();
  if (v.includes("anthropic") || v.includes("claude")) return "anthropic";
  if (v.includes("openai") || v.includes("gpt")) return "openai";
  if (v.includes("google") || v.includes("gemini")) return "google";
  if (v.includes("grok")) return "grok";
  if (v.includes("xai") || v.includes("x.ai")) return "xai";
  return "unknown";
}

export function getGroupProviderKey(group: ModelGroupInfo): ProviderKey {
  // Prefer the explicit model provider; fall back to the group label.
  return normalizeProviderKey(group.models?.[0]?.provider || group.label);
}

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  /** While a reply streams, the send button becomes a stop button. */
  isStreaming?: boolean;
  /** Blocks sending without changing what the box looks like. */
  disabled?: boolean;
  placeholder: string;
  /** Starting height in rows; the box grows with content up to a quarter of the viewport. */
  minRows?: number;
  autoFocus?: boolean;
  models: ModelGroupInfo[];
  selectedModelKey: string;
  onSelectModel: (key: string) => void;
  className?: string;
}

const ArrowUpIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 19V5" />
    <path d="M5 12l7-7 7 7" />
  </svg>
);

const StopIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="5" y="5" width="14" height="14" rx="2" />
  </svg>
);

const ChevronIcon = ({ up }: { up: boolean }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {up ? <path d="M18 15l-6-6-6 6" /> : <path d="M6 9l6 6 6-6" />}
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

function formatPrice(price: number | null | undefined): string {
  return price ? `$${Math.round(price)}` : "N/A";
}

/**
 * The message box shared by the new-chat screen and a conversation: a growing
 * textarea, the model chip with its popover, and a send button that becomes
 * stop while a reply streams.
 */
export default function ChatComposer({
  value,
  onChange,
  onSend,
  onStop,
  isStreaming = false,
  disabled = false,
  placeholder,
  minRows = 1,
  autoFocus = false,
  models,
  selectedModelKey,
  onSelectModel,
  className,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Grow with content, up to a quarter of the viewport; scroll past that.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    if (!el.scrollHeight) return;
    const maxHeight = Math.round(window.innerHeight * 0.25);
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [value]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (modelRef.current && !modelRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const canSend = value.trim().length > 0 && !disabled && !isStreaming;

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (canSend) onSend();
    }
  };

  let selected: { group: ModelGroupInfo; name: string } | null = null;
  for (const group of models) {
    const model = group.models.find((m) => m.key === selectedModelKey);
    if (model) {
      selected = { group, name: model.name };
      break;
    }
  }
  const chipLabel = selected
    ? selected.name
    : models.length > 0
      ? "Select model"
      : "Loading models";

  return (
    <div className={`${styles.composer} ${className ?? ""}`}>
      <textarea
        id="chat-input"
        ref={textareaRef}
        className={styles.textarea}
        rows={minRows}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        autoFocus={autoFocus}
        aria-label="Message"
      />
      <div className={styles.row}>
        <div className={styles.modelWrapper} ref={modelRef}>
          <button
            id="model-select"
            type="button"
            className={`${styles.modelChip} ${menuOpen ? styles.modelChipOpen : ""}`}
            onClick={() => setMenuOpen((open) => !open)}
            disabled={isStreaming || models.length === 0}
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            aria-label="Select model"
            title="Model"
          >
            <span
              className={styles.providerDot}
              data-provider={selected ? getGroupProviderKey(selected.group) : "unknown"}
              aria-hidden="true"
            />
            <span className={styles.modelName}>{chipLabel}</span>
            <ChevronIcon up={!menuOpen} />
          </button>
          {menuOpen && models.length > 0 && (
            <div className={styles.modelMenu} role="listbox" aria-label="Models">
              {models.flatMap((group) =>
                group.models.map((model) => {
                  const isSelected = model.key === selectedModelKey;
                  return (
                    <button
                      key={model.key}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={`${styles.modelOption} ${isSelected ? styles.modelOptionSelected : ""}`}
                      disabled={!model.is_available}
                      onClick={() => {
                        onSelectModel(model.key);
                        setMenuOpen(false);
                      }}
                    >
                      <span
                        className={styles.providerDot}
                        data-provider={getGroupProviderKey(group)}
                        aria-hidden="true"
                      />
                      <span className={styles.modelOptionText}>
                        <span className={styles.modelOptionName}>{model.name}</span>
                        <span className={styles.modelOptionDetail}>
                          {model.is_available
                            ? `${formatPrice(model.input_price)} in · ${formatPrice(model.output_price)} out per 1M tokens`
                            : "API key not configured"}
                        </span>
                      </span>
                      {isSelected && (
                        <span className={styles.modelOptionCheck}>
                          <CheckIcon />
                        </span>
                      )}
                    </button>
                  );
                }),
              )}
            </div>
          )}
        </div>
        {isStreaming ? (
          <button
            id="stop-btn"
            type="button"
            className={styles.stopButton}
            onClick={onStop}
            aria-label="Stop generation"
            title="Stop"
          >
            <StopIcon />
          </button>
        ) : (
          <button
            id="send-btn"
            type="button"
            className={styles.sendButton}
            onClick={onSend}
            disabled={!canSend}
            aria-label="Send message"
            title="Send"
          >
            <ArrowUpIcon />
          </button>
        )}
      </div>
    </div>
  );
}
