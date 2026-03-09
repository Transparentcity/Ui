import Header from "@/components/Header";
import Link from "next/link";

export const metadata = {
  title: "About Seymour",
  description:
    "Seymour is Transparent City’s AI assistant. Learn what Seymour is, how he works, and how he helps you understand civic data.",
};

export default function AboutSeymourPage() {
  return (
    <>
      <Header showCityPicker={false} />
      <main
        className="about-seymour"
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
            color: "#111827",
            marginBottom: "0.5rem",
          }}
        >
          Who is Seymour?
        </h1>
        <p
          style={{
            fontSize: "1rem",
            lineHeight: 1.6,
            color: "#374151",
            marginBottom: "1.5rem",
          }}
        >
          Seymour is the AI assistant for the Transparent City team. When you
          receive emails from us—newsletters, research summaries, or replies to
          your questions—they’re sent by Seymour on our behalf.
        </p>

        <h2
          style={{
            fontSize: "1.25rem",
            fontWeight: 600,
            color: "#111827",
            marginTop: "2rem",
            marginBottom: "0.75rem",
          }}
        >
          What Seymour does
        </h2>
        <ul
          style={{
            fontSize: "1rem",
            lineHeight: 1.7,
            color: "#374151",
            paddingLeft: "1.5rem",
            marginBottom: "1.5rem",
          }}
        >
          <li>
            <strong>Research and summaries</strong> — Seymour analyzes public
            city data and turns it into plain-language briefs, district
            updates, and answers to your questions.
          </li>
          <li>
            <strong>Email and newsletters</strong> — The weekly newsletters and
            one-off emails you get from Transparent City are written and sent by
            Seymour, so you stay informed without us manually drafting each
            message.
          </li>
          <li>
            <strong>Charts, maps, and reports</strong> — Inside the app, you can
            ask Seymour to create maps, explain metrics, or dig into anomalies;
            he uses the same civic datasets and links back to sources.
          </li>
        </ul>

        <h2
          style={{
            fontSize: "1.25rem",
            fontWeight: 600,
            color: "#111827",
            marginTop: "2rem",
            marginBottom: "0.75rem",
          }}
        >
          How Seymour works
        </h2>
        <p
          style={{
            fontSize: "1rem",
            lineHeight: 1.6,
            color: "#374151",
            marginBottom: "1rem",
          }}
        >
          Seymour is an AI agent built on large language models and connected to
          Transparent City’s tools and data. He can query official city datasets,
          generate charts and maps, and draft emails—all while citing sources so
          you can verify the numbers. Human reviewers don’t edit every message
          before it’s sent, so if something looks off or you have feedback,
          reply to the email; your reply comes to the Transparent City team.
        </p>

        <p
          style={{
            fontSize: "1rem",
            lineHeight: 1.6,
            color: "#374151",
            marginBottom: "2rem",
          }}
        >
          We use Seymour to scale clear, source-backed communication about
          your city—so you get timely updates and can hold officials accountable
          with the same data they use.
        </p>

        <p style={{ fontSize: "0.9375rem", color: "#6b7280" }}>
          <Link
            href="/dashboard"
            style={{ color: "#ad35fa", textDecoration: "none", fontWeight: 500 }}
          >
            Go to dashboard →
          </Link>
        </p>
      </main>
    </>
  );
}
