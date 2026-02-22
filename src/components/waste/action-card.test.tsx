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
  it("renders the action title", () => {
    render(<ActionCard action={makeAction()} />);
    expect(screen.getByText("Test Action")).toBeInTheDocument();
  });

  it("renders the action type label", () => {
    render(<ActionCard action={makeAction({ action_type: "interview" })} />);
    expect(screen.getByText("Interview")).toBeInTheDocument();
  });

  it("renders the status badge", () => {
    render(<ActionCard action={makeAction({ status: "completed" })} />);
    expect(screen.getByText("completed")).toBeInTheDocument();
  });

  it("renders the description", () => {
    render(
      <ActionCard
        action={makeAction({ description: "Detailed evidence review" })}
      />
    );
    expect(screen.getByText("Detailed evidence review")).toBeInTheDocument();
  });

  it("renders assignee when present", () => {
    render(
      <ActionCard action={makeAction({ assigned_to: "Jane Doe" })} />
    );
    expect(screen.getByText("Assigned to Jane Doe")).toBeInTheDocument();
  });

  it("does not render assignee when null", () => {
    render(<ActionCard action={makeAction({ assigned_to: null })} />);
    expect(screen.queryByText(/Assigned to/)).not.toBeInTheDocument();
  });

  it("renders due date when present", () => {
    render(
      <ActionCard action={makeAction({ due_date: "2026-03-01T00:00:00Z" })} />
    );
    expect(screen.getByText(/Due/)).toBeInTheDocument();
  });

  it("applies overdue styling for past-due non-completed actions", () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);
    const { container } = render(
      <ActionCard
        action={makeAction({
          status: "pending",
          due_date: pastDate.toISOString(),
        })}
      />
    );
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain("border-red-200");
  });

  it("does not apply overdue styling for completed actions even with past due date", () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);
    const { container } = render(
      <ActionCard
        action={makeAction({
          status: "completed",
          due_date: pastDate.toISOString(),
          completed_at: new Date().toISOString(),
        })}
      />
    );
    const card = container.firstChild as HTMLElement;
    expect(card.className).not.toContain("border-red-200");
  });

  it("renders completed date when present", () => {
    render(
      <ActionCard
        action={makeAction({
          status: "completed",
          completed_at: "2026-02-10T00:00:00Z",
        })}
      />
    );
    expect(screen.getByText(/Completed/)).toBeInTheDocument();
  });

  it("renders all seven action types without error", () => {
    const types: WasteInvestigationAction["action_type"][] = [
      "document_request",
      "interview",
      "site_visit",
      "subpoena",
      "referral",
      "note",
      "evidence_collected",
    ];
    for (const t of types) {
      const { unmount } = render(
        <ActionCard action={makeAction({ action_type: t })} />
      );
      expect(screen.getByText("Test Action")).toBeInTheDocument();
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
