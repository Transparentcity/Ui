import { render, screen } from "@testing-library/react";

import { ActionCard } from "@/components/waste/action-card";
import type { WasteInvestigationAction } from "@/lib/apiClient";

function makeAction(
  overrides: Partial<WasteInvestigationAction> = {}
): WasteInvestigationAction {
  return {
    id: "act-1",
    investigation_id: "inv-1",
    action_type: "note",
    title: "Test Action",
    description: "A test action description",
    status: "pending",
    assigned_to: null,
    target_department: null,
    due_date: null,
    completed_at: null,
    response_notes: null,
    attachments: [],
    created_at: "2026-01-15T00:00:00Z",
    created_by: "auditor@city.gov",
    ...overrides,
  };
}

describe("ActionCard", () => {
  it("renders description when present", () => {
    render(<ActionCard action={makeAction({ description: "Detailed evidence review" })} />);
    expect(screen.getByText("Detailed evidence review")).toBeInTheDocument();
  });

  it("falls back to title when description is empty", () => {
    render(<ActionCard action={makeAction({ description: "" })} />);
    expect(screen.getByText("Test Action")).toBeInTheDocument();
  });

  it("renders the action type label for non-note types", () => {
    render(<ActionCard action={makeAction({ action_type: "interview" })} />);
    expect(screen.getByText("Interview")).toBeInTheDocument();
  });

  it("does not render type label for notes", () => {
    render(<ActionCard action={makeAction({ action_type: "note" })} />);
    expect(screen.queryByText("Note")).not.toBeInTheDocument();
  });

  it("renders timestamp from created_at", () => {
    render(<ActionCard action={makeAction({ created_at: "2026-01-15T00:00:00Z" })} />);
    expect(screen.getByText(/Jan/)).toBeInTheDocument();
  });

  it("renders all eight action types without error", () => {
    const types: WasteInvestigationAction["action_type"][] = [
      "document_request",
      "interview",
      "site_visit",
      "subpoena",
      "referral",
      "note",
      "evidence_collected",
      "ai_auditor_review",
    ];
    for (const t of types) {
      const { unmount } = render(
        <ActionCard action={makeAction({ action_type: t })} />
      );
      expect(screen.getByText("A test action description")).toBeInTheDocument();
      unmount();
    }
  });

  it("merges custom className", () => {
    const { container } = render(
      <ActionCard action={makeAction()} className="my-extra" />
    );
    expect(container.firstChild).toHaveClass("my-extra");
  });
});
