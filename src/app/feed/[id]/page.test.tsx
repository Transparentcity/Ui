import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import FeedDetailPage from "./page";

const mockLoginWithRedirect = vi.fn();
let mockIsAuthenticated = false;

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({
    isAuthenticated: mockIsAuthenticated,
    isLoading: false,
    getAccessTokenSilently: vi.fn(),
    loginWithRedirect: mockLoginWithRedirect,
  }),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "123" }),
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock("@/lib/hooks/useFeed", () => ({
  feedKeys: {
    detail: (id: number) => ["feed", "detail", id],
    lists: () => ["feed", "list"],
    places: () => ["feed", "places"],
  },
  useFeedStoryDetail: () => ({
    data: undefined,
    isLoading: false,
    error: { status: 404 },
  }),
  useCityFeedStories: () => ({ data: undefined }),
  useTrackFeedEngagement: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/lib/feed/mockFeedData", () => ({
  enrichStory: (story: unknown) => story,
  enrichStories: (stories: unknown[]) => stories,
}));

vi.mock("@/lib/feed/canonicalUrl", () => ({
  canRestorePlacePrivateScope: () => false,
  isPrivateFeedStory: () => false,
  requiresPublishForPublicShare: () => false,
  resolveOutboundCanonicalPath: () => "",
}));

vi.mock("@/lib/feed/sharePublicUrl", () => ({
  runSharePublicUrl: vi.fn(),
}));

vi.mock("@/lib/feed/fetchReportNarratives", () => ({
  fetchDetailNarrative: vi.fn(),
}));

vi.mock("@/components/feed/FeedStoryDetailView", () => ({
  FeedStoryDetailView: () => null,
}));

vi.mock("@/components/feed/FeedStoryShareDialog", () => ({
  default: () => null,
}));

describe("FeedDetailPage authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = false;
    mockLoginWithRedirect.mockResolvedValue(undefined);
    window.history.replaceState({}, "", "/feed/123?source=email");
  });

  it("offers sign in for a private story and returns to the email URL", async () => {
    const user = userEvent.setup();
    render(<FeedDetailPage />);

    expect(
      screen.getByRole("heading", { name: "Sign in to view this story" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(mockLoginWithRedirect).toHaveBeenCalledWith({
      appState: { returnTo: "/feed/123?source=email" },
    });
  });

  it("keeps the not-found state for an authenticated user", () => {
    mockIsAuthenticated = true;
    render(<FeedDetailPage />);

    expect(
      screen.getByRole("heading", { name: "Story not found" }),
    ).toBeInTheDocument();
  });
});
