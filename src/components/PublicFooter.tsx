import Link from "next/link";

interface PublicFooterProps {
  citySlug?: string;
}

export default function PublicFooter({ citySlug }: PublicFooterProps) {
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
            <h4 className="footer-title">Explore</h4>
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
            <h4 className="footer-title">Get involved</h4>
            <Link href="/pro" className="footer-link">
              Add your city
            </Link>
            <Link href="/landing" className="footer-link">
              Learn more
            </Link>
          </div>
          <div className="footer-column">
            <h4 className="footer-title">Contact</h4>
            <a href="mailto:hello@transparentcity.com" className="footer-link">
              hello@transparentcity.com
            </a>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; {new Date().getFullYear()} Transparent.city.</p>
        </div>
      </div>
    </footer>
  );
}
