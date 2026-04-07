import Loader from "@/components/Loader";

/**
 * Route-level loading UI for the city dashboard page.
 * Shows the TransparentCity bracket loader while the page fetches city data.
 */
export default function CityDashboardLoading() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        gap: "1rem",
      }}
    >
      <Loader size="lg" color="dark" />
      <p style={{ margin: 0, fontSize: "1rem", color: "var(--text-secondary)" }}>
        Loading city dashboard…
      </p>
    </div>
  );
}
