/**
 * Tests for EscalateSheet component.
 *
 * NOTE: EscalateSheet is currently dead code — the component is no longer
 * imported or rendered by any active component after the UI simplification
 * that removed Applaud/Flag/Investigate actions from feed cards.
 * These tests are skipped until the component is either removed or re-enabled.
 *
 * Covers: rendering, comment/includeName passing via onSend, word limit,
 * toggle behavior, skip/close, keyboard dismiss.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EscalateSheet from "./EscalateSheet";

// Mock createPortal to render inline (jsdom doesn't support portals)
vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

describe.skip("EscalateSheet (dead code — component no longer rendered)", () => {
  let onClose: ReturnType<typeof vi.fn>;
  let onSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onClose = vi.fn();
    onSend = vi.fn();
    cleanup();
  });

  function renderSheet(open = true) {
    return render(
      <EscalateSheet
        open={open}
        headline="Test headline about crime trends"
        onClose={onClose}
        onSend={onSend}
      />
    );
  }

  it("renders nothing when closed", () => {
    renderSheet(false);
    expect(screen.queryByText("Test headline about crime trends")).not.toBeInTheDocument();
  });

  it("renders headline and controls when open", () => {
    renderSheet();
    expect(screen.getByText("Test headline about crime trends")).toBeInTheDocument();
    expect(screen.getByText("Send")).toBeInTheDocument();
    expect(screen.getByText("Skip")).toBeInTheDocument();
    expect(screen.getByText("Include my name")).toBeInTheDocument();
  });

  it("calls onSend with empty comment and includeName=true by default", async () => {
    renderSheet();
    const sendBtn = screen.getByText("Send");
    fireEvent.click(sendBtn);

    expect(onSend).toHaveBeenCalledWith("", true);
    expect(onClose).toHaveBeenCalled();
  });

  it("passes comment text to onSend", async () => {
    renderSheet();
    const textarea = screen.getByPlaceholderText(/comment/i);
    await userEvent.type(textarea, "This is unacceptable");

    fireEvent.click(screen.getByText("Send"));
    expect(onSend).toHaveBeenCalledWith("This is unacceptable", true);
  });

  it("passes includeName=false when toggle is off", async () => {
    renderSheet();
    const toggle = screen.getByLabelText(/Include my name/i);
    fireEvent.click(toggle); // Toggle OFF

    fireEvent.click(screen.getByText("Send"));
    expect(onSend).toHaveBeenCalledWith("", false);
  });

  it("passes comment and includeName=false together", async () => {
    renderSheet();

    // Type a comment
    const textarea = screen.getByPlaceholderText(/comment/i);
    await userEvent.type(textarea, "Fix this please");

    // Toggle off name
    const toggle = screen.getByLabelText(/Include my name/i);
    fireEvent.click(toggle);

    fireEvent.click(screen.getByText("Send"));
    expect(onSend).toHaveBeenCalledWith("Fix this please", false);
  });

  it("calls onClose on Skip", () => {
    renderSheet();
    fireEvent.click(screen.getByText("Skip"));
    expect(onClose).toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("calls onClose on Escape keypress", () => {
    renderSheet();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("shows word count after typing", async () => {
    renderSheet();
    const textarea = screen.getByPlaceholderText(/comment/i);
    await userEvent.type(textarea, "one two three");

    expect(screen.getByText("3/150 words")).toBeInTheDocument();
  });

  it("resets state when reopened", async () => {
    const { rerender } = render(
      <EscalateSheet open={true} headline="H" onClose={onClose} onSend={onSend} />
    );

    // Type something
    const textarea = screen.getByPlaceholderText(/comment/i);
    await userEvent.type(textarea, "some text");

    // Close
    rerender(
      <EscalateSheet open={false} headline="H" onClose={onClose} onSend={onSend} />
    );

    // Reopen
    rerender(
      <EscalateSheet open={true} headline="H" onClose={onClose} onSend={onSend} />
    );

    const newTextarea = screen.getByPlaceholderText(/comment/i);
    expect(newTextarea).toHaveValue("");
  });
});
