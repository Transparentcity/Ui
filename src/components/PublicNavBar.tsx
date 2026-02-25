import Link from "next/link";

/**
 * Public (logged-out) nav bar with brand logo: logomark + "transparent.city" wordmark.
 * Matches Header branding (BRAND_KIT: bracket mark + Inter, --brand-primary for .city).
 * Use on city page, district page, and other public routes.
 */
export default function PublicNavBar({ children }: { children: React.ReactNode }) {
  return (
    <nav className="navbar public-nav">
      <div className="container">
        <div className="nav-content">
          <Link
            href="/"
            className="brand-link"
            aria-label="Transparent.city home"
          >
            <span className="logo-corners" aria-hidden>
              <svg
                viewBox="0 0 100 100"
                xmlns="http://www.w3.org/2000/svg"
                style={{ overflow: "visible" }}
              >
                <defs>
                  <mask
                    id="public-nav-mask-bl"
                    x="-400"
                    y="-400"
                    width="1200"
                    height="1200"
                    maskUnits="userSpaceOnUse"
                    maskContentUnits="userSpaceOnUse"
                  >
                    <rect x="-400" y="-400" width="1200" height="1200" fill="white" />
                    <rect x="8.333" y="8.333" width="83.333" height="83.333" rx="3" ry="3" fill="black" />
                    <rect x="16.666" y="-33.333" width="66.666" height="166.666" fill="black" transform="rotate(-45 50 50)" />
                    <rect x="50" y="-400" width="1200" height="1200" fill="black" transform="rotate(-45 50 50)" />
                  </mask>
                  <mask
                    id="public-nav-mask-tr"
                    x="-400"
                    y="-400"
                    width="1200"
                    height="1200"
                    maskUnits="userSpaceOnUse"
                    maskContentUnits="userSpaceOnUse"
                  >
                    <rect x="-400" y="-400" width="1200" height="1200" fill="white" />
                    <rect x="8.333" y="8.333" width="83.333" height="83.333" rx="3" ry="3" fill="black" />
                    <rect x="16.666" y="-33.333" width="66.666" height="166.666" fill="black" transform="rotate(-45 50 50)" />
                    <rect x="-1150" y="-400" width="1200" height="1200" fill="black" transform="rotate(-45 50 50)" />
                  </mask>
                </defs>
                <rect className="brace" x="0" y="0" width="100" height="100" rx="3" ry="3" mask="url(#public-nav-mask-bl)" transform="translate(23.5%, -23.5%)" />
                <rect className="brace" x="0" y="0" width="100" height="100" rx="3" ry="3" mask="url(#public-nav-mask-tr)" transform="translate(-23.5%, 23.5%)" />
              </svg>
            </span>
            <span className="brand-text">
              <span className="logo-transparent">transparent</span>
              <span className="logo-city">.city</span>
            </span>
          </Link>
          <div className="nav-links">{children}</div>
        </div>
      </div>
    </nav>
  );
}
