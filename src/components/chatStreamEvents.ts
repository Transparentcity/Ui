export type IntermediateChatEvent = {
  type: string;
  content?: string;
  tool_id?: string;
  tool_name?: string;
  timestamp?: string;
};

export function appendChatStreamEvent(
  events: IntermediateChatEvent[],
  event: IntermediateChatEvent
): IntermediateChatEvent[] {
  if (
    event.type === "thinking" &&
    events.length > 0 &&
    events[events.length - 1].type === "thinking"
  ) {
    const last = events[events.length - 1];
    return [
      ...events.slice(0, -1),
      {
        ...last,
        content: (last.content || "") + (event.content || ""),
        timestamp: event.timestamp || last.timestamp,
      },
    ];
  }
  return [...events, event];
}

export function mergeConsecutiveThinkingEvents(
  events: IntermediateChatEvent[]
): IntermediateChatEvent[] {
  const merged: IntermediateChatEvent[] = [];
  for (const event of events) {
    const last = merged[merged.length - 1];
    if (event.type === "thinking" && last?.type === "thinking") {
      merged[merged.length - 1] = {
        ...last,
        content: (last.content || "") + (event.content || ""),
        timestamp: event.timestamp || last.timestamp,
      };
    } else {
      merged.push({ ...event });
    }
  }
  return merged;
}
