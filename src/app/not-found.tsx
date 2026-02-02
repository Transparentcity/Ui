import Link from "next/link";
import styles from "./home.module.css";

export default function NotFound() {
  return (
    <div className={styles.page}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "80vh",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            maxWidth: "500px",
            background: "var(--bg-secondary, #f8f9fa)",
            borderRadius: "12px",
            padding: "32px",
            boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
          }}
        >
          <div
            style={{
              fontSize: "48px",
              marginBottom: "16px",
            }}
          >
            🔍
          </div>

          <h1
            style={{
              fontSize: "24px",
              fontWeight: 600,
              color: "var(--text-primary, #1a1a1a)",
              marginBottom: "12px",
            }}
          >
            Page Not Found
          </h1>

          <p
            style={{
              fontSize: "15px",
              color: "var(--text-secondary, #666)",
              marginBottom: "24px",
              lineHeight: 1.6,
            }}
          >
            The page you're looking for doesn't exist or may have been moved.
          </p>

          <div
            style={{
              display: "flex",
              gap: "12px",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <Link
              href="/"
              style={{
                padding: "12px 24px",
                fontSize: "15px",
                fontWeight: 500,
                color: "#ffffff",
                background: "var(--brand-primary, #ad35fa)",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                textDecoration: "none",
                transition: "background 0.15s ease",
              }}
            >
              Go to Home
            </Link>

            <Link
              href="/sitemap"
              style={{
                padding: "12px 24px",
                fontSize: "15px",
                fontWeight: 500,
                color: "var(--text-primary, #1a1a1a)",
                background: "var(--bg-primary, #ffffff)",
                border: "1px solid var(--border-primary, #e0e0e0)",
                borderRadius: "8px",
                cursor: "pointer",
                textDecoration: "none",
                transition: "all 0.15s ease",
              }}
            >
              View Sitemap
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
