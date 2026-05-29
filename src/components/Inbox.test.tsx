/**
 * Tests for Inbox list view component.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
  };
});

import { listInbox } from "@/lib/apiClient";
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

  it("shows unread count badge", async () => {
    vi.mocked(listInbox).mockResolvedValue({
      items: [makeItem({ is_read: false })],
      unread_count: 1,
    });
    render(<Inbox onOpen={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByLabelText("1 unread")).toBeInTheDocument();
    });
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
