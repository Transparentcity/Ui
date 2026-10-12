import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ChatComposer from "./ChatComposer";
import type { ModelGroupInfo } from "@/lib/apiClient";

const models: ModelGroupInfo[] = [
  {
    label: "Anthropic",
    emoji: "",
    models: [
      {
        key: "claude-sonnet-5.5",
        name: "Claude Sonnet 5.5",
        provider: "anthropic",
        context_window: 200000,
        input_price: 3,
        output_price: 15,
        is_available: true,
      },
    ],
  },
  {
    label: "OpenAI",
    emoji: "",
    models: [
      {
        key: "gpt-4o",
        name: "GPT-4o",
        provider: "openai",
        context_window: 128000,
        input_price: 5,
        output_price: 15,
        is_available: false,
      },
    ],
  },
];

function renderComposer(overrides: Partial<React.ComponentProps<typeof ChatComposer>> = {}) {
  const props = {
    value: "How are 311 complaints trending?",
    onChange: vi.fn(),
    onSend: vi.fn(),
    onStop: vi.fn(),
    onSelectModel: vi.fn(),
    placeholder: "Message Seymour",
    models,
    selectedModelKey: "claude-sonnet-5.5",
    ...overrides,
  };
  render(<ChatComposer {...props} />);
  return props;
}

describe("ChatComposer", () => {
  it("sends on Enter and inserts a newline on Shift+Enter", () => {
    const props = renderComposer();
    const box = screen.getByLabelText("Message");
    fireEvent.keyDown(box, { key: "Enter" });
    expect(props.onSend).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(props.onSend).toHaveBeenCalledTimes(1);
  });

  it("does not send an empty message", () => {
    const props = renderComposer({ value: "   " });
    fireEvent.keyDown(screen.getByLabelText("Message"), { key: "Enter" });
    expect(props.onSend).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Send message")).toBeDisabled();
  });

  it("shows stop instead of send while a reply streams", () => {
    const props = renderComposer({ isStreaming: true });
    expect(screen.queryByLabelText("Send message")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Stop generation"));
    expect(props.onStop).toHaveBeenCalledTimes(1);
  });

  it("names the selected model on the chip and switches from the popover", () => {
    const props = renderComposer();
    const chip = screen.getByLabelText("Select model");
    expect(chip).toHaveTextContent("Claude Sonnet 5.5");

    fireEvent.click(chip);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /GPT-4o/ })).toBeDisabled();
    expect(screen.getByText("API key not configured")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("option", { name: /Claude Sonnet 5.5/ }));
    expect(props.onSelectModel).toHaveBeenCalledWith("claude-sonnet-5.5");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("uses the placeholder it is given", () => {
    renderComposer({ value: "", placeholder: "Ask me anything about city data" });
    expect(screen.getByPlaceholderText("Ask me anything about city data")).toBeInTheDocument();
  });
});
