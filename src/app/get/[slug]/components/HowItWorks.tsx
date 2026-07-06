import styles from "../get-landing.module.css";

const HOW_STEPS = [
  {
    icon: "🏛️",
    title: "Official open data",
    body:
      "Every number in your weekly comes directly from your city's open data portal, the same data the city publishes. Nothing is estimated, modeled, or invented.",
  },
  {
    icon: "🔍",
    title: "Automated anomaly detection",
    body:
      "Seymour, our AI analyst, runs statistical checks across hundreds of metrics every week to surface what changed and what's unusual, so you don't have to sift through spreadsheets.",
  },
  {
    icon: "✍️",
    title: "Plain-language narrative",
    body:
      "Each finding is turned into a clear, jargon-free explanation with the raw number, the trend, and a link back to the source dataset so you can verify everything yourself.",
  },
  {
    icon: "📬",
    title: "In your inbox every week",
    body:
      "Your briefing arrives every week with the categories you care about: new businesses, 311, crime and safety, housing, and more. Add a custom prompt to emphasize what matters to you, from pollen counts to permits.",
  },
];

const FAQ_ITEMS = [
  {
    q: "Where does the data come from?",
    a: "Your city's official open data portal. We connect directly to published datasets: police incident reports, building permits, 311 service requests, spending records, and more.",
  },
  {
    q: "How is the weekly report generated?",
    a: "Seymour, our AI analyst, compares the current week against prior periods, flags statistical anomalies, and writes a plain-language summary. Every number links back to the source row or query.",
  },
  {
    q: "Can I trust the numbers?",
    a: "Every figure in the report is sourced directly from official city data. We do not adjust, impute, or estimate. Links to the underlying datasets are included in every issue.",
  },
  {
    q: "What cities are available?",
    a: "We currently cover several major U.S. cities and are adding more. If your city isn't launched yet, you can request it and we'll notify you when it goes live.",
  },
  {
    q: "What happens after the free month?",
    a: "After your first free month the newsletter continues at $5/month. You can cancel any time. Payment is coming soon. For now, sign up and enjoy the free period.",
  },
];

export default function HowItWorks({ cityName }: { cityName: string }) {
  return (
    <>
      {/* How it works */}
      <section className={styles.howItWorksSection}>
        <div className="container">
          <header className={styles.sectionHeader}>
            <span className={styles.sectionBadge}>How it works</span>
            <h2 className={styles.sectionHeading}>
              Your {cityName} weekly, explained
            </h2>
            <p className={styles.sectionSubheading}>
              Every issue is built from official public data, run through
              automated analysis, and written in plain English.
            </p>
          </header>

          <div className={styles.howItWorksGrid}>
            {HOW_STEPS.map((step, i) => (
              <div key={i} className={styles.howItWorksCard}>
                <div className={styles.howItWorksIcon}>{step.icon}</div>
                <h3 className={styles.howItWorksTitle}>{step.title}</h3>
                <p className={styles.howItWorksBody}>{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className={styles.faqSection}>
        <div className="container">
          <header className={styles.sectionHeader}>
            <span className={styles.sectionBadge}>Questions</span>
            <h2 className={styles.sectionHeading}>Common questions</h2>
          </header>
          <div className={styles.faqList}>
            {FAQ_ITEMS.map((item, i) => (
              <div key={i} className={styles.faqItem}>
                <h3 className={styles.faqQuestion}>{item.q}</h3>
                <p className={styles.faqAnswer}>{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
