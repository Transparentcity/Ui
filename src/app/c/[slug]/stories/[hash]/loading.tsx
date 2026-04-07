import Loader from "@/components/Loader";

/**
 * Route-level loading UI for story detail pages.
 * Shows the TransparentCity bracket loader while the page fetches story data.
 */
export default function StoryDetailLoading() {
  return (
    <div
      className="story-detail-page"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "50vh",
        gap: "1rem",
      }}
    >
      <Loader size="lg" color="dark" />
      <p style={{ margin: 0, fontSize: "1rem", color: "var(--text-secondary)" }}>
        Loading story…
      </p>
    </div>
  );
}
