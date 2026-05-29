/**
 * Tests for InboxCard component.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import InboxCard from "./InboxCard";
import type { InboxItem } from "@/lib/apiClient";

function makeItem(overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    id: "edition:abc123",
    type: "edition",
    subject: "Weekly SF update",
    preview: "Here is what happened this week in San Francisco.",
    cover_image_url: null,
    sent_at: new Date(Date.now() - 2 * 86_400_000).toISOString(), // 2 days ago
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
    public_url: "/c/san-francisco/newsletter/abc123",
    ...overrides,
  };
}

describe("InboxCard", () => {
  it("renders subject and preview", () => {
    render(<InboxCard item={makeItem()} onClick={vi.fn()} />);
    expect(screen.getByText("Weekly SF update")).toBeInTheDocument();
    expect(
      screen.getByText(/Here is what happened this week/i)
    ).toBeInTheDocument();
  });

  it("shows unread dot when not read", () => {
    render(<InboxCard item={makeItem({ is_read: false })} onClick={vi.fn()} />);
    const dot = screen.getByRole("status", { name: "Unread" });
    expect(dot).toBeInTheDocument();
  });

  it("hides unread dot when already read", () => {
    render(<InboxCard item={makeItem({ is_read: true })} onClick={vi.fn()} />);
    expect(screen.queryByRole("status", { name: "Unread" })).not.toBeInTheDocument();
  });

  it("shows city emoji for city-scope item", () => {
    render(<InboxCard item={makeItem({ scope: "city", city_emoji: "🌉" })} onClick={vi.fn()} />);
    expect(screen.getByRole("img", { name: "San Francisco" })).toBeInTheDocument();
  });

  it("shows district badge for district-scope item", () => {
    render(
      <InboxCard
        item={makeItem({
          scope: "district",
          district: "6",
          district_label: "D6",
        })}
        onClick={vi.fn()}
      />
    );
    expect(screen.getByLabelText("D6")).toBeInTheDocument();
  });

  it("shows Personalized Edition pill for private items", () => {
    render(<InboxCard item={makeItem({ is_private: true })} onClick={vi.fn()} />);
    expect(screen.getByText("Personalized Edition")).toBeInTheDocument();
    expect(screen.getByLabelText("Private")).toBeInTheDocument();
  });

  it("does not show Personalized Edition pill for non-private items", () => {
    render(<InboxCard item={makeItem({ is_private: false })} onClick={vi.fn()} />);
    expect(screen.queryByText("Personalized Edition")).not.toBeInTheDocument();
  });

  it("shows Citywide Edition for non-private city-scope items", () => {
    render(
      <InboxCard
        item={makeItem({ is_private: false, scope: "city" })}
        onClick={vi.fn()}
      />
    );
    expect(screen.getByText("Citywide Edition")).toBeInTheDocument();
    expect(screen.getByLabelText("Citywide editions are public")).toBeInTheDocument();
  });

  it("does not show Citywide Edition for private items", () => {
    render(
      <InboxCard
        item={makeItem({ is_private: true, scope: "city" })}
        onClick={vi.fn()}
      />
    );
    expect(screen.queryByText("Citywide Edition")).not.toBeInTheDocument();
  });

  it("does not show Citywide Edition for district-scope items", () => {
    render(
      <InboxCard
        item={makeItem({
          is_private: false,
          scope: "district",
          district: "6",
          district_label: "D6",
        })}
        onClick={vi.fn()}
      />
    );
    expect(screen.queryByText("Citywide Edition")).not.toBeInTheDocument();
  });

  it("does not open the card when the edition lock is clicked", () => {
    const handleClick = vi.fn();
    render(<InboxCard item={makeItem({ is_private: true })} onClick={handleClick} />);
    fireEvent.click(screen.getByLabelText("Private"));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it("renders thumbnail image when cover_image_url is set", () => {
    const { container } = render(
      <InboxCard
        item={makeItem({ cover_image_url: "https://example.com/img.jpg" })}
        onClick={vi.fn()}
      />
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("https://example.com/img.jpg");
  });

  it("does not render img when cover_image_url is null", () => {
    const { container } = render(
      <InboxCard item={makeItem({ cover_image_url: null })} onClick={vi.fn()} />
    );
    expect(container.querySelector("img")).toBeNull();
  });

  it("calls onClick with item id when clicked", () => {
    const handleClick = vi.fn();
    render(<InboxCard item={makeItem({ id: "edition:test" })} onClick={handleClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledWith("edition:test");
  });

  it("shows place name for place-scope item", () => {
    render(
      <InboxCard
        item={makeItem({
          scope: "place",
          place_id: 5,
          place_name: "My Block",
          is_private: true,
        })}
        onClick={vi.fn()}
      />
    );
    expect(screen.getByText("My Block")).toBeInTheDocument();
  });

  it("shows place pin and name when place_name is set even if scope is district", () => {
    const { container } = render(
      <InboxCard
        item={makeItem({
          scope: "district",
          district: "6",
          district_label: "D6",
          place_id: 5,
          place_name: "Glen Park",
          is_private: true,
        })}
        onClick={vi.fn()}
      />
    );
    expect(screen.getByText("Glen Park")).toBeInTheDocument();
    expect(screen.queryByLabelText("D6")).not.toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("shows relative date for recent items", () => {
    // 2 days ago
    render(<InboxCard item={makeItem()} onClick={vi.fn()} />);
    expect(screen.getByText("2d ago")).toBeInTheDocument();
  });
});
