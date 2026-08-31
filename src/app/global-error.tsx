"use client";

/**
 * Global error boundary for the root layout.
 * This catches errors that occur in layout.tsx or any providers,
 * including Auth0 initialization errors.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const handleGoHome = () => {
    // Clear any stale Auth0 state from localStorage
    if (typeof window !== "undefined") {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith("a0.spajs.txs") || key.startsWith("@@auth0spajs@@"))
        ) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
    }
    window.location.href = "/";
  };

  const handleRetry = () => {
    // Clear stale state before retrying
    if (typeof window !== "undefined") {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith("a0.spajs.txs") || key.startsWith("@@auth0spajs@@"))
        ) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
    }
    reset();
  };

  // Check if this is an Auth0 state error
  const isAuth0Error =
    error.message?.includes("state") ||
    error.message?.includes("Invalid state") ||
    error.message?.includes("auth") ||
    error.message?.includes("Login required");

  return (
    <html lang="en">
      <body>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            padding: "24px",
            textAlign: "center",
            fontFamily:
              'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            background: "var(--bg-secondary)",
          }}
        >
          <div
            style={{
              maxWidth: "500px",
              background: "#ffffff",
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
              {isAuth0Error ? "🔐" : "⚠️"}
            </div>

            <h1
              style={{
                fontSize: "24px",
                fontWeight: 600,
                color: "#1a1a1a",
                marginBottom: "12px",
              }}
            >
              {isAuth0Error ? "Session Interrupted" : "Something went wrong"}
            </h1>

            <p
              style={{
                fontSize: "15px",
                color: "#666",
                marginBottom: "24px",
                lineHeight: 1.6,
              }}
            >
              {isAuth0Error
                ? "Your session was interrupted, possibly by navigating back during login. This is easily fixed."
                : "An unexpected error occurred. You can try again or return to the home page."}
            </p>

            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={handleGoHome}
                style={{
                  padding: "12px 24px",
                  fontSize: "15px",
                  fontWeight: 500,
                  color: "#ffffff",
                  background: "var(--brand-primary)",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                Go to Home
              </button>

              <button
                onClick={handleRetry}
                style={{
                  padding: "12px 24px",
                  fontSize: "15px",
                  fontWeight: 500,
                  color: "#1a1a1a",
                  background: "#ffffff",
                  border: "1px solid #e0e0e0",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                Try Again
              </button>
            </div>

            {process.env.NODE_ENV === "development" && error.message && (
              <details
                style={{
                  marginTop: "24px",
                  textAlign: "left",
                  fontSize: "12px",
                  color: "#999",
                }}
              >
                <summary style={{ cursor: "pointer", marginBottom: "8px" }}>
                  Technical details
                </summary>
                <pre
                  style={{
                    background: "#f0f0f0",
                    padding: "12px",
                    borderRadius: "6px",
                    overflow: "auto",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {error.message}
                  {error.digest && `\n\nDigest: ${error.digest}`}
                </pre>
              </details>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
