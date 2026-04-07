import Loader from "@/components/Loader";

/**
 * Route-level loading UI for newsletter archive pages.
 * Shows the TransparentCity bracket loader while the page fetches edition data.
 */
export default function NewsletterLoading() {
  return (
    <div
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
        Loading newsletter…
      </p>
    </div>
  );
}
