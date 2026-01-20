import Loader from "@/components/Loader";
import "./styles.css";

/**
 * Route-level loading UI for the metric detail page.
 * Uses the TransparentCity bracket loader while the page fetches metric data.
 */
export default function MetricDetailLoading() {
  return (
    <div className="metric-detail-page">
      <div
        className="metric-detail-content-wrapper"
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
          Loading metric…
        </p>
      </div>
    </div>
  );
}
