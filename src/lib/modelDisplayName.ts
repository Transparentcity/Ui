const MODEL_DISPLAY_NAMES: Record<string, string> = {
  // Claude (latest + one older)
  "claude-haiku-4.5": "Claude Haiku 4.5",
  "claude-sonnet-5.5": "Claude Sonnet 5.5",
  "claude-sonnet-5": "Claude Sonnet 5",
  "claude-fable-5": "Claude Fable 5",
  "claude-opus-4.8": "Claude Opus 4.8",
  "claude-sonnet-4.6": "Claude Sonnet 4.6",
  "claude-opus-4.6": "Claude Opus 4.6",
  "claude-sonnet-4.5": "Claude Sonnet 4.5",
  "claude-opus-4.5": "Claude Opus 4.5",

  // Gemini (latest + one older)
  "gemini-3-pro": "Gemini 3 Pro",
  "gemini-3-flash": "Gemini 3 Flash",
  "gemini-2.5-pro": "Gemini 2.5 Pro",
  "gemini-2.5-flash": "Gemini 2.5 Flash",

  // Grok (latest + one older)
  "grok-4": "Grok 4",
  "grok-3": "Grok 3",

  "gpt-4o": "GPT-4o",
  "gpt-4-turbo": "GPT-4 Turbo",
  "gpt-4": "GPT-4",
  "gpt-3.5-turbo": "GPT-3.5 Turbo",
};

/** Human-readable name for a model key; unknown keys come back as given. */
export function getModelDisplayName(modelKey: string): string {
  return MODEL_DISPLAY_NAMES[modelKey] || modelKey;
}
