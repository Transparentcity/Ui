/**
 * Tests for Inbox list view component.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { InboxItem } from "@/lib/apiClient";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetAccessTokenSilently = vi.fn().mockResolvedValue("test-token");

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({
    isAuthenticated: true,
    isLoading: false,
    getAccessTokenSilently: mockGetAccessTokenSilently,
  }),
}));

vi.mock("@/lib/productAnalytics", () => ({
  recordProductEvent: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  trackInboxView: vi.fn(),
  trackInboxNavClicked: vi.fn(),
}));

vi.mock("@/lib/apiClient", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/apiClient")>();
  return {
    ...mod,
    listInbox: vi.fn(),
    markAllInboxRead: vi.fn(),
  };
});

import { listInbox, markAllInboxRead } from "@/lib/apiClient";
import Inbox from "./Inbox";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    id: "edition:abc",
    type: "edition",
    subject: "Test subject",
    preview: "Preview text here",
    cover_image_url: null,
    sent_at: new Date(Date.now() - 86_400_000).toISOString(),
    is_read: false,
    is_private: false,
    scope: "city",
    city_id: 1,
    city_name: "San Francisco",
    city_slug: "san-francisco",
    city_emoji: "🌉",
    district: null,
    district_label: null,
    place_id: null,
    place_name: null,
    public_url: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Inbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows inbox header", async () => {
    vi.mocked(listInbox).mockResolvedValue({ items: [], unread_count: 0 });
    render(<Inbox onOpen={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Newsletters" })).toBeInTheDocument();
    expect(screen.getByText(/New editions weekly/i)).toBeInTheDocument();
  });

  it("shows empty state when no items", async () => {
    vi.mocked(listInbox).mockResolvedValue({ items: [], unread_count: 0 });
    render(<Inbox onOpen={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/No newsletters yet/i)).toBeInTheDocument();
    });
    expect(
      screen.getByText(/Newsletters from your saved cities/i)
    ).toBeInTheDocument();
  });

  it("renders inbox items when loaded", async () => {
    vi.mocked(listInbox).mockResolvedValue({
      items: [makeItem({ subject: "SF Weekly Update" })],
      unread_count: 1,
    });
    render(<Inbox onOpen={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("SF Weekly Update")).toBeInTheDocument();
    });
  });

  it("shows unread indicator on unread items", async () => {
    vi.mocked(listInbox).mockResolvedValue({
      items: [makeItem({ is_read: false })],
      unread_count: 1,
    });
    render(<Inbox onOpen={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByLabelText("Unread")).toBeInTheDocument();
    });
  });

  it("shows mark all as read when there are unread items", async () => {
    vi.mocked(listInbox).mockResolvedValue({
      items: [makeItem({ is_read: false })],
      unread_count: 1,
    });
    render(<Inbox onOpen={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Mark all as read" })).toBeInTheDocument();
    });
  });

  it("marks all items as read when button is clicked", async () => {
    vi.mocked(listInbox).mockResolvedValue({
      items: [
        makeItem({ id: "edition:one", is_read: false }),
        makeItem({ id: "edition:two", is_read: false, subject: "Second" }),
      ],
      unread_count: 2,
    });
    vi.mocked(markAllInboxRead).mockResolvedValue({ ok: true, marked_count: 2 });
    const onUnreadCountChange = vi.fn();
    const user = userEvent.setup();

    render(<Inbox onOpen={vi.fn()} onUnreadCountChange={onUnreadCountChange} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Mark all as read" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Mark all as read" }));

    await waitFor(() => {
      expect(markAllInboxRead).toHaveBeenCalledWith("test-token", [
        "edition:one",
        "edition:two",
      ]);
    });
    expect(onUnreadCountChange).toHaveBeenCalledWith(0);
    expect(screen.queryByRole("button", { name: "Mark all as read" })).not.toBeInTheDocument();
  });

  it("does not show mark all as read when all items are read", async () => {
    vi.mocked(listInbox).mockResolvedValue({
      items: [makeItem({ is_read: true })],
      unread_count: 0,
    });
    render(<Inbox onOpen={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("Test subject")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Mark all as read" })).not.toBeInTheDocument();
  });

  it("does not show unread badge when all read", async () => {
    vi.mocked(listInbox).mockResolvedValue({
      items: [makeItem({ is_read: true })],
      unread_count: 0,
    });
    render(<Inbox onOpen={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("Test subject")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/unread/i)).not.toBeInTheDocument();
  });

  it("shows error state on fetch failure", async () => {
    vi.mocked(listInbox).mockRejectedValue(new Error("Network error"));
    render(<Inbox onOpen={vi.fn()} />);
    await waitFor(() => {
      expect(
        screen.getByText(/Could not load your inbox/i)
      ).toBeInTheDocument();
    });
  });

  it("renders items sorted by sent_at descending (already sorted by backend)", async () => {
    const items = [
      makeItem({ id: "edition:first", subject: "Newer", sent_at: new Date(Date.now() - 86_400_000).toISOString() }),
      makeItem({ id: "edition:second", subject: "Older", sent_at: new Date(Date.now() - 2 * 86_400_000).toISOString() }),
    ];
    vi.mocked(listInbox).mockResolvedValue({ items, unread_count: 0 });
    render(<Inbox onOpen={vi.fn()} />);
    await waitFor(() => {
      const subjects = screen.getAllByText(/Newer|Older/);
      expect(subjects[0]).toHaveTextContent("Newer");
      expect(subjects[1]).toHaveTextContent("Older");
    });
  });
});
