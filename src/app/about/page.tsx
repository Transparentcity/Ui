import Header from "@/components/Header";
import PublicFooter from "@/components/PublicFooter";
import Link from "next/link";
import "../landing.css";

export const metadata = {
  title: "About Us",
  description:
    "Transparent City is built by Rob Goldman and Adam Werbach, two friends who wanted to see what data could tell them about their city.",
};

const headingStyle = {
  fontSize: "1.25rem",
  fontWeight: 600,
  color: "var(--text-primary, #111827)",
  marginTop: "2rem",
  marginBottom: "0.75rem",
} as const;

const paragraphStyle = {
  fontSize: "1rem",
  lineHeight: 1.6,
  color: "var(--text-secondary, #374151)",
  marginBottom: "1.5rem",
} as const;

export default function AboutPage() {
  return (
    <>
      <Header />
      <main
        id="main-content"
        className="about-us"
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "2rem 1.5rem 4rem",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <h1
          style={{
            fontSize: "1.75rem",
            fontWeight: 700,
            color: "var(--text-primary, #111827)",
            marginBottom: "1rem",
          }}
        >
          About Us
        </h1>
        <p style={paragraphStyle}>
          We finally figured we should write an About Us page because people
          were beginning to wonder if this was just some giant AI building this
          thing. Nope, just us, Rob and Adam, two friends who wanted to see
          what data we could find about our city.
        </p>
        <p style={paragraphStyle}>
          Rob actually started the project, and then Adam joined in to help
          figure out how we might support the turnaround in San Francisco. We
          believe that when people can actually see what&rsquo;s happening on
          their block, they can believe it can change.
        </p>

        <h2 style={headingStyle}>Rob Goldman</h2>
        <p style={paragraphStyle}>
          Rob has been building consumer internet products since the early
          days. He helped build Shopping.com, founded his own tech startup,
          and then spent seven years at Facebook, where he ran the ads product
          used by billions of people. He knows the difference between data
          that sits in a spreadsheet and data that actually changes what
          people do.
        </p>

        <h2 style={headingStyle}>Adam Werbach</h2>
        <p style={paragraphStyle}>
          Adam has spent his career pushing big institutions to work for
          regular people. He was the youngest president of the Sierra Club,
          helped some of the world&rsquo;s largest companies be more
          sustainable, and ran a startup of his own too.
        </p>

        <p style={paragraphStyle}>
          We build Transparent City together. No org chart, no titles, just
          two friends who both write, code, and answer every email. Now
          we&rsquo;re growing it, city by city.
        </p>
        <p style={paragraphStyle}>
          Okay, one small clarification on the AI front: we do have a helper
          you&rsquo;ll hear us mention named{" "}
          <Link
            href="/about/seymour"
            style={{ color: "#ad35fa", textDecoration: "none", fontWeight: 500 }}
          >
            Seymour
          </Link>
          . Seymour is an AI agent we&rsquo;ve trained with all the city data
          and structuring we&rsquo;ve learned along the way, and he&rsquo;s an
          essential part of our team, both building the tools and making sense
          of the data. Let us know what you think and how we can improve.
        </p>

        <p style={{ fontSize: "0.9375rem", color: "var(--text-tertiary, #6b7280)" }}>
          <a
            href="mailto:seymour@transparent.city?subject=Hello%20from%20the%20About%20page"
            style={{ color: "#ad35fa", textDecoration: "none", fontWeight: 500 }}
          >
            Drop us a note →
          </a>
        </p>
      </main>
      <PublicFooter />
    </>
  );
}
