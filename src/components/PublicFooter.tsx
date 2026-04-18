import Link from "next/link";
import PageFeedback from "@/components/PageFeedback";

interface PublicFooterProps {
  citySlug?: string;
  feedbackPageUrl?: string;
  feedbackPageType?: string;
}

export default function PublicFooter({ citySlug, feedbackPageUrl, feedbackPageType }: PublicFooterProps) {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-content">
          <div className="footer-column">
            <div className="brand-text">
              <span className="logo-transparent">transparent</span>
              <span className="logo-city">.city</span>
            </div>
            <p className="footer-description">
              Maps, metrics, and research built from public city data so
              residents and elected officials can share the same picture of what
              is happening.
            </p>
          </div>
          <div className="footer-column">
            <h3 className="footer-title">Explore</h3>
            {citySlug && (
              <Link
                href={`/c/${citySlug}/methodology`}
                className="footer-link"
              >
                Methodology
              </Link>
            )}
            <Link href="/sitemap" className="footer-link">
              Site map
            </Link>
          </div>
          <div className="footer-column">
            <h3 className="footer-title">Get involved</h3>
            <Link href="/add-your-city" className="footer-link">
              Add your city
            </Link>
          </div>
          <div className="footer-column">
            <h3 className="footer-title">Contact</h3>
            <a href="mailto:seymour@transparent.city" className="footer-link">
              seymour@transparent.city
            </a>
          </div>
        </div>
        <div className="footer-bottom">
          <p>
            &copy; {new Date().getFullYear()} Transparent.city
            {" "}
            <Link href="/terms" className="footer-link" style={{ display: "inline", marginLeft: "0.5rem" }}>
              Terms
            </Link>
            {" "}
            <Link href="/privacy" className="footer-link" style={{ display: "inline", marginLeft: "0.5rem" }}>
              Privacy
            </Link>
          </p>
          {feedbackPageUrl && (
            <PageFeedback
              pageUrl={feedbackPageUrl}
              pageType={feedbackPageType}
              variant="inline"
            />
          )}
        </div>
      </div>
    </footer>
  );
}
