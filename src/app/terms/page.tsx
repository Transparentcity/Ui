import type { Metadata } from "next";
import Header from "@/components/Header";
import PublicFooter from "@/components/PublicFooter";
import "../landing.css";
import "../legal.css";

export const metadata: Metadata = {
  title: "Terms of Service | Transparent.city",
  description: "Terms of Service for Transparent.city",
};

export default function TermsPage() {
  return (
    <>
      <Header />
      <main id="main-content" className="legal-page">
        <h1>Terms of Service</h1>
        <p className="legal-updated">Last updated: April 1, 2026</p>

        <section>
          <h2>1. About Transparent.city</h2>
          <p>
            Transparent.city is operated by Transparent Technology. We provide
            maps, metrics, and research built from public city data so residents
            and elected officials can share the same picture of what is
            happening.
          </p>
        </section>

        <section>
          <h2>2. Acceptance of Terms</h2>
          <p>
            By using Transparent.city, you agree to these terms. If you
            don&apos;t agree, please don&apos;t use the site. We may update
            these terms from time to time. Continued use after changes means you
            accept the updated terms.
          </p>
        </section>

        <section>
          <h2>3. What You Can Do</h2>
          <p>
            You can browse city data, dashboards, newsletters, and stories on
            Transparent.city. You may create an account to access personalized
            features, follow districts, and receive newsletters.
          </p>
        </section>

        <section>
          <h2>4. Your Account</h2>
          <p>
            If you create an account, you&apos;re responsible for keeping your
            login credentials secure. Let us know at{" "}
            <a href="mailto:seymour@parse.transparent.city">
              seymour@parse.transparent.city
            </a>{" "}
            if you suspect unauthorized access.
          </p>
        </section>

        <section>
          <h2>5. Acceptable Use</h2>
          <p>When using Transparent.city, please don&apos;t:</p>
          <ul>
            <li>Scrape or bulk-download data in ways that overload our systems</li>
            <li>Misrepresent data or attribute fabricated data to us</li>
            <li>Use the site to harass, spam, or harm others</li>
            <li>Attempt to gain unauthorized access to our systems</li>
          </ul>
        </section>

        <section>
          <h2>6. Our Content</h2>
          <p>
            The data we present comes from public sources. We work hard to
            make it accurate and useful, but we can&apos;t guarantee it&apos;s
            error-free. City data may have delays, gaps, or inconsistencies from
            the original sources. Don&apos;t rely on Transparent.city as your
            sole source for decisions with legal, financial, or safety
            implications.
          </p>
        </section>

        <section>
          <h2>7. User Feedback</h2>
          <p>
            When you submit feedback through our feedback widget, we may use it
            to improve the site. Feedback you submit is not confidential unless
            we agree otherwise.
          </p>
        </section>

        <section>
          <h2>8. Intellectual Property</h2>
          <p>
            The Transparent.city name, branding, and original analysis are owned
            by Transparent Technology. The underlying public data remains
            public. You&apos;re welcome to reference and link to our content
            with attribution.
          </p>
        </section>

        <section>
          <h2>9. Limitation of Liability</h2>
          <p>
            Transparent.city is provided &quot;as is.&quot; To the extent
            permitted by law, Transparent Technology is not liable for damages
            arising from your use of the site, including reliance on the data we
            present.
          </p>
        </section>

        <section>
          <h2>10. Contact</h2>
          <p>
            Questions about these terms? Reach us at{" "}
            <a href="mailto:seymour@parse.transparent.city">
              seymour@parse.transparent.city
            </a>
            .
          </p>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
