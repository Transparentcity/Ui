import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import type { Keyword } from "@/lib/types";

// Mock server actions
vi.mock("@/app/actions/contacts", () => ({
  createContact: vi.fn(),
  updateContact: vi.fn(),
}));

// Mock publicApiClient
vi.mock("@/lib/publicApiClient", () => ({
  searchPublicCities: vi.fn().mockResolvedValue([]),
}));

// Must import after mocks
import { ContactDialog } from "./contact-dialog";
import { createContact, updateContact } from "@/app/actions/contacts";

const keywords: Keyword[] = [
  { id: "kw-1", name: "Budget", description: null, category: null, created_at: "2026-01-01T00:00:00Z" },
  { id: "kw-2", name: "Housing", description: null, category: null, created_at: "2026-01-01T00:00:00Z" },
];

function makeContact(overrides: Record<string, unknown> = {}) {
  return {
    id: "c-1",
    name: "Jane Doe",
    title: "Council Member",
    department: "City Council",
    organization: "City of Springfield",
    email: "jane@city.gov",
    phone: null,
    jurisdiction: "District 5",
    city_id: 57260,
    city_name: "San Francisco, CA",
    contact_type: "city_staff" as string | null,
    priority: 2,
    status: "active" as const,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    keywords: [],
    ...overrides,
  };
}

describe("ContactDialog – contact_type field", () => {
  it("renders the Type label in the create form", async () => {
    const user = userEvent.setup();

    render(
      <ContactDialog keywords={keywords}>
        <button>Add Contact</button>
      </ContactDialog>
    );

    await user.click(screen.getByText("Add Contact"));
    expect(screen.getByText("Type")).toBeInTheDocument();
  });

  it("renders the Type label in the edit form", async () => {
    const user = userEvent.setup();

    render(
      <ContactDialog contact={makeContact({ contact_type: "media" })} keywords={keywords}>
        <button>Edit</button>
      </ContactDialog>
    );

    await user.click(screen.getByText("Edit"));
    expect(screen.getByText("Type")).toBeInTheDocument();
  });

  it("shows City Staff as the default type for new contacts", async () => {
    const user = userEvent.setup();

    render(
      <ContactDialog keywords={keywords}>
        <button>Add Contact</button>
      </ContactDialog>
    );

    await user.click(screen.getByText("Add Contact"));

    const triggers = screen.getAllByRole("combobox");
    const typeTrigger = triggers[0]; // First select is Type
    expect(typeTrigger).toHaveTextContent("City Staff");
  });

  it("shows the selected type when editing a contact", async () => {
    const user = userEvent.setup();

    render(
      <ContactDialog contact={makeContact({ contact_type: "media" })} keywords={keywords}>
        <button>Edit</button>
      </ContactDialog>
    );

    await user.click(screen.getByText("Edit"));

    const triggers = screen.getAllByRole("combobox");
    const typeTrigger = triggers[0];
    expect(typeTrigger).toHaveTextContent("Press / Media");
  });
});

describe("ContactDialog – save/submit", () => {
  it("calls createContact when submitting a new contact form", async () => {
    const user = userEvent.setup();

    render(
      <ContactDialog keywords={keywords}>
        <button>Add Contact</button>
      </ContactDialog>
    );

    await user.click(screen.getByText("Add Contact"));

    // Fill required name field
    const nameInput = screen.getByLabelText(/name/i);
    await user.type(nameInput, "Test Person");

    // Fill email
    const emailInput = screen.getByLabelText(/email/i);
    await user.type(emailInput, "test@example.com");

    // Submit
    const submitBtn = screen.getByRole("button", { name: /add contact/i });
    await user.click(submitBtn);

    await vi.waitFor(() => {
      expect(createContact).toHaveBeenCalled();
    });
  });

  it("calls updateContact when editing an existing contact", async () => {
    const user = userEvent.setup();

    render(
      <ContactDialog contact={makeContact()} keywords={keywords}>
        <button>Edit</button>
      </ContactDialog>
    );

    await user.click(screen.getByText("Edit"));

    // Modify name
    const nameInput = screen.getByLabelText(/name/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Updated Name");

    // Submit
    const saveBtn = screen.getByRole("button", { name: /save changes/i });
    await user.click(saveBtn);

    await vi.waitFor(() => {
      expect(updateContact).toHaveBeenCalledWith("c-1", expect.any(FormData));
    });
  });

  it("shows 'Saving...' text on submit button while pending", async () => {
    const user = userEvent.setup();

    // Make createContact hang
    (createContact as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    render(
      <ContactDialog keywords={keywords}>
        <button>Add Contact</button>
      </ContactDialog>
    );

    await user.click(screen.getByText("Add Contact"));

    const nameInput = screen.getByLabelText(/name/i);
    await user.type(nameInput, "Test Person");

    const submitBtn = screen.getByRole("button", { name: /add contact/i });
    await user.click(submitBtn);

    await vi.waitFor(() => {
      expect(screen.getByText("Saving...")).toBeInTheDocument();
    });
  });

  it("closes dialog after cancel button is clicked", async () => {
    const user = userEvent.setup();

    render(
      <ContactDialog keywords={keywords}>
        <button>Add Contact</button>
      </ContactDialog>
    );

    await user.click(screen.getByText("Add Contact"));
    expect(screen.getByText("Type")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    await vi.waitFor(() => {
      expect(screen.queryByText("Type")).not.toBeInTheDocument();
    });
  });

  it("shows media-specific fields when type is Press / Media", async () => {
    const user = userEvent.setup();

    render(
      <ContactDialog contact={makeContact({ contact_type: "media" })} keywords={keywords}>
        <button>Edit</button>
      </ContactDialog>
    );

    await user.click(screen.getByText("Edit"));

    expect(screen.getByLabelText(/outlet/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/primary beat/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/primary city/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/article links/i)).toBeInTheDocument();
  });

  it("toggles keyword selection", async () => {
    const user = userEvent.setup();

    render(
      <ContactDialog keywords={keywords}>
        <button>Add Contact</button>
      </ContactDialog>
    );

    await user.click(screen.getByText("Add Contact"));

    // Click a keyword to add it
    const budgetBadge = screen.getByText("+ Budget");
    await user.click(budgetBadge);

    // Should now appear in the selected area (without the '+' prefix)
    expect(screen.queryByText("+ Budget")).not.toBeInTheDocument();
    expect(screen.getByText("Budget")).toBeInTheDocument();
  });
});
