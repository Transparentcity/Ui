/**
 * Skeleton placeholder for FeaturedStoriesAsync while stories load.
 * Matches the height and layout of the featured stories grid to prevent
 * layout shift when Suspense resolves.
 */
export default function FeaturedStoriesSkeleton() {
  return (
    <section className="featured-stories-section">
      <div className="container">
        <header className="section-header" style={{ marginBottom: "1.25rem" }}>
          <div className="skeleton-badge" />
          <div className="skeleton-heading" />
        </header>

        <div className="featured-stories-grid">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton-story-card">
              <div className="skeleton-line skeleton-line-short" />
              <div className="skeleton-line skeleton-line-long" />
              <div className="skeleton-line skeleton-line-medium" />
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .skeleton-badge {
          width: 120px;
          height: 14px;
          border-radius: 4px;
          background: var(--bg-tertiary, #e5e7eb);
          animation: skeletonPulse 1.5s ease-in-out infinite;
        }
        .skeleton-heading {
          width: 200px;
          height: 20px;
          border-radius: 4px;
          background: var(--bg-tertiary, #e5e7eb);
          margin-top: 8px;
          animation: skeletonPulse 1.5s ease-in-out infinite;
          animation-delay: 0.1s;
        }
        .skeleton-story-card {
          padding: 12px 16px;
          border: 1px solid var(--border-primary, #e5e7eb);
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .skeleton-line {
          height: 12px;
          border-radius: 4px;
          background: var(--bg-tertiary, #e5e7eb);
          animation: skeletonPulse 1.5s ease-in-out infinite;
        }
        .skeleton-line-short { width: 40%; animation-delay: 0s; }
        .skeleton-line-long { width: 90%; animation-delay: 0.1s; }
        .skeleton-line-medium { width: 65%; animation-delay: 0.2s; }
        @keyframes skeletonPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>
    </section>
  );
}
