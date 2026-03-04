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

const keywords: Keyword[] = [
  { id: "kw-1", name: "Budget", description: null, category: null, created_at: "2026-01-01T00:00:00Z" },
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
    city_id: 1,
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
