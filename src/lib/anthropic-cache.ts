import type { SystemModelMessage } from "ai"

/**
 * Wrap a stable system prompt with an Anthropic cache breakpoint. Prompt caching
 * is a prefix match, so everything in the system message must be identical across
 * requests; per-request content belongs in the user prompt, after the breakpoint.
 * Prompts below the model's minimum cacheable size (1024 tokens on Sonnet 4.6)
 * are simply not cached.
 */
export function cachedSystem(content: string): SystemModelMessage {
  return {
    role: "system",
    content,
    providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
  }
}
