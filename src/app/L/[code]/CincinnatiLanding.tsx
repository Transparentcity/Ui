"use client";

import type { CSSProperties } from "react";
import PublicFooter from "@/components/PublicFooter";
import BracketMark from "./BracketMark";
import EmailSignupForm from "./EmailSignupForm";
import type { LiveRow, NumbersMeta } from "./cincinnatiMetrics";
import styles from "./landing.module.css";

type Props = {
  shortCode: string;
  citySlug: string;
  cityName: string;
  cityId?: number | null;
  liveRows?: LiveRow[] | null;
  numbersMeta?: NumbersMeta | null;
};

const CINCY_SLUG = "cincinnati";
const CINCY_NAME = "Cincinnati";

export default function CincinnatiLanding({
  shortCode,
  citySlug = CINCY_SLUG,
  cityName = CINCY_NAME,
  cityId,
  liveRows,
  numbersMeta,
}: Props) {
  return (
    <div className={styles.root}>
      <MiniHeader />
      <Hero
        shortCode={shortCode}
        citySlug={citySlug}
        cityName={cityName}
        cityId={cityId}
      />
      <ThisWeek />
      <Numbers liveRows={liveRows ?? null} numbersMeta={numbersMeta ?? null} />
      <Stories />
      <FinalCTA
        shortCode={shortCode}
        citySlug={citySlug}
        cityName={cityName}
        cityId={cityId}
      />
      <PublicFooter citySlug={citySlug} />
    </div>
  );
}

/* ────────────────────────────── Header ────────────────────────────── */

const Logo = ({ size = 18 }: { size?: number }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      fontFamily: "var(--font-heading)",
      fontWeight: 900,
      fontSize: size,
      color: "#111827",
      letterSpacing: "-0.03em",
      lineHeight: 1,
    }}
  >
    <BracketMark size={size * 1.25} color="#111827" />
    <span>
      transparent<span style={{ color: "#ad35fa" }}>.city</span>
    </span>
  </span>
);

function MiniHeader() {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        borderBottom: "1px solid rgba(17,24,39,0.08)",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <Logo size={18} />
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 12.5,
              color: "#6b7280",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: "#10b981",
              }}
            />
            <span>🐅 Cincinnati edition</span>
          </span>
          <a
            href="#signup"
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 13.5,
              fontWeight: 600,
              color: "#ad35fa",
            }}
          >
            Subscribe →
          </a>
        </div>
      </div>
    </header>
  );
}

/* ────────────────────────────── Hero ────────────────────────────── */

function Hero({
  shortCode,
  citySlug,
  cityName,
  cityId,
}: {
  shortCode: string;
  citySlug: string;
  cityName: string;
  cityId?: number | null;
}) {
  return (
    <section
      id="signup"
      style={{
        position: "relative",
        padding: "64px 24px 56px",
        background:
          "radial-gradient(900px 540px at 18% -10%, rgba(173,53,250,0.16), transparent 60%), radial-gradient(800px 480px at 92% 8%, rgba(245,158,11,0.06), transparent 55%), #ffffff",
        borderBottom: "1px solid #e5e7eb",
        overflow: "hidden",
      }}
    >
      <div
        className="heroGrid"
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "1.05fr 0.95fr",
          gap: 56,
          alignItems: "center",
        }}
      >
        <div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 12px 5px 8px",
              borderRadius: 999,
              background: "rgba(173,53,250,0.08)",
              border: "1px solid rgba(173,53,250,0.18)",
              fontFamily: "var(--font-ui)",
              fontSize: 12.5,
              fontWeight: 600,
              color: "#7c3aed",
              marginBottom: 22,
            }}
          >
            <span style={{ fontSize: 14 }}>🐅</span>
            <span>The Cincinnati Weekly · Free email newsletter</span>
          </div>

          <h1
            className="h1Hero"
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: 58,
              fontWeight: 900,
              letterSpacing: "-0.045em",
              lineHeight: 0.98,
              margin: "0 0 22px",
              color: "#111827",
              textWrap: "balance",
            }}
          >
            What&rsquo;s{" "}
            <span
              style={{
                fontStyle: "italic",
                fontWeight: 900,
                backgroundImage: "linear-gradient(120deg, #ad35fa 0%, #6d28d9 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              actually
            </span>{" "}
            changing
            <br className="brHideMobile" />
            <span> in Cincinnati this week.</span>
          </h1>

          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 17.5,
              lineHeight: 1.5,
              color: "#374151",
              margin: "0 0 14px",
              maxWidth: "46ch",
            }}
          >
            One Sunday-morning email. Real numbers from Cincinnati open data, permits, 311s, crime stats, restaurant openings, and the changes that actually affect your neighborhood.
          </p>

          <div style={{ height: 22 }} />

          <EmailSignupForm
            citySlug={citySlug}
            cityName={cityName}
            cityId={cityId}
            shortCode={shortCode}
            variant="light"
            ctaLabel="Send me Sunday's issue →"
            successLabel="✓ You're in. Sunday's Cincinnati issue is on the way."
          />

          <div
            style={{
              marginTop: 30,
              display: "flex",
              flexWrap: "wrap",
              gap: 22,
              alignItems: "center",
            }}
          >
            <CincyStat n="−11.7%" l="property crime YTD" tone="good" />
            <Divider />
            <CincyStat n="+4.5%" l="911 calls YTD" />
            <Divider />
            <CincyStat n="118,016" l="911 calls through May 10" />
          </div>
        </div>

        <CincyEnvelope />
      </div>
    </section>
  );
}

const CincyStat = ({
  n,
  l,
  tone,
}: {
  n: string;
  l: string;
  tone?: "good";
}) => (
  <div>
    <div
      style={{
        fontFamily: "var(--font-data)",
        fontSize: 22,
        fontWeight: 700,
        color: tone === "good" ? "#059669" : "#111827",
        letterSpacing: "-0.02em",
        lineHeight: 1,
      }}
    >
      {n}
    </div>
    <div
      style={{
        fontFamily: "var(--font-ui)",
        fontSize: 11.5,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        color: "#6b7280",
        marginTop: 6,
      }}
    >
      {l}
    </div>
  </div>
);

const Divider = () => (
  <div style={{ width: 1, height: 28, background: "#e5e7eb" }} />
);

function CincyEnvelope() {
  return (
    <div style={{ position: "relative", perspective: 1400 }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: "rotate(-3deg) translate(-12px, 8px)",
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          opacity: 0.5,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: "rotate(2deg) translate(8px, 4px)",
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          opacity: 0.7,
        }}
      />

      <div
        style={{
          position: "relative",
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #e5e7eb",
          boxShadow:
            "0 22px 50px rgba(17,24,39,0.10), 0 4px 12px rgba(17,24,39,0.04)",
          transform: "rotate(-1deg)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "14px 18px",
            borderBottom: "1px solid #f3f4f6",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              background: "#111827",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <BracketMark size={18} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 13,
                fontWeight: 700,
                color: "#111827",
              }}
            >
              The Cincinnati Weekly
            </div>
            <div
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                color: "#6b7280",
              }}
            >
              to you · Sun, May 24 · 7:14 AM
            </div>
          </div>
          <div
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 11.5,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "#ad35fa",
              padding: "4px 8px",
              background: "rgba(173,53,250,0.08)",
              borderRadius: 6,
            }}
          >
            May 24
          </div>
        </div>

        <div style={{ padding: "22px 22px 24px" }}>
          <div
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#7c3aed",
              marginBottom: 10,
            }}
          >
            Lead story · Your city
          </div>

          <h3
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: 22,
              fontWeight: 900,
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              margin: "0 0 14px",
              color: "#111827",
            }}
          >
            Cincinnati&rsquo;s Property Crime Drop Has a Shape, and Auto Theft Is Driving It
          </h3>

          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 14,
              alignItems: "flex-end",
              height: 100,
            }}
          >
            <CategoryBar label="Auto theft" prev={796} curr={593} max={800} />
            <CategoryBar label="Burglary" prev={649} curr={497} max={800} />
            <CategoryBar label="Personal" prev={1735} curr={1703} max={1800} flat />
          </div>

          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 13,
              lineHeight: 1.55,
              color: "#374151",
              margin: "0 0 14px",
            }}
          >
            Cincinnati recorded <b>3,849 property crime incidents</b> YTD through May 20, down 11.7% from 4,359 in 2025. The drop isn&rsquo;t spread evenly: auto theft fell from 796 to 593, burglary from 649 to 497, while personal theft held nearly flat.
          </p>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 12px",
              background: "#f9fafb",
              borderRadius: 8,
              fontFamily: "var(--font-data)",
              fontSize: 12,
              color: "#6b7280",
            }}
          >
            <span>Source: Cincinnati STARS dataset</span>
            <span style={{ color: "#ad35fa", fontWeight: 600 }}>
              Read full story →
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CategoryBar({
  label,
  prev,
  curr,
  max,
  flat,
}: {
  label: string;
  prev: number;
  curr: number;
  max: number;
  flat?: boolean;
}) {
  const prevH = (prev / max) * 84;
  const currH = (curr / max) * 84;
  const delta = Math.round(((curr - prev) / prev) * 100);
  const currStyle: CSSProperties = {
    width: 18,
    height: `${currH}px`,
    borderRadius: 2,
    ...(flat
      ? { background: "#9ca3af" }
      : { background: "linear-gradient(180deg,#ad35fa,#7c3aed)" }),
  };
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 84 }}>
        <div
          style={{
            width: 18,
            height: `${prevH}px`,
            background: "#e5e7eb",
            borderRadius: 2,
          }}
          title={`2025: ${prev}`}
        />
        <div style={currStyle} title={`2026: ${curr}`} />
      </div>
      <div
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 10,
          fontWeight: 600,
          color: "#6b7280",
          textAlign: "center",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-data)",
          fontSize: 10.5,
          fontWeight: 700,
          color: flat ? "#6b7280" : delta < 0 ? "#059669" : "#dc2626",
        }}
      >
        {delta > 0 ? "+" : ""}
        {delta}%
      </div>
    </div>
  );
}

/* ────────────────────────────── This Week ────────────────────────────── */

const BRIEFS = [
  {
    n: "−34.8%",
    eyebrow: "Homicides YTD",
    title: "Running well below last year's pace",
    body: "15 reported homicides year-to-date through May 16, vs 23 in the same period of 2025. The lowest YTD total in the STARS dataset, which begins June 2024.",
    accent: "#059669",
  },
  {
    n: "5",
    suffix: "repairs",
    eyebrow: "One intersection · 30 days",
    title: "A North Avondale signal was fixed five times, then broke again",
    body: "The city closed 5 traffic signal repair cases at 3924 Reading Rd in the 30 days ending May 20, compared to zero in the same window a year earlier.",
    accent: "#ad35fa",
  },
  {
    n: "14,700",
    suffix: "sq ft",
    eyebrow: "Mt. Auburn · May 29 opening",
    title: "FotoFocus gets its first permanent home after 16 years",
    body: "228 East Liberty Street, two galleries, year-round free programming. The nonprofit has run America's largest photography biennial since 2010 without a building of its own.",
    accent: "#ad35fa",
  },
  {
    n: "506",
    suffix: "permits",
    eyebrow: "May OTC filings",
    title: "Over-the-counter permit filings dropped sharply in May",
    body: "Down 35% from the six-month average of 777. April hit 904, the highest in the comparison window. OTC permits cover smaller work that does not require full plan review.",
    accent: "#d97706",
  },
] as const;

function ThisWeek() {
  return (
    <section
      style={{
        padding: "80px 24px 64px",
        background: "#f8f9fa",
        borderTop: "1px solid #e5e7eb",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 24,
            marginBottom: 36,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 11.5,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#ad35fa",
                marginBottom: 12,
              }}
            >
              This Sunday&rsquo;s issue · May 24
            </div>
            <h2
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: 40,
                fontWeight: 900,
                letterSpacing: "-0.04em",
                lineHeight: 1.04,
                margin: 0,
                color: "#111827",
                maxWidth: "20ch",
              }}
            >
              What changed in Cincinnati this week, in four numbers.
            </h2>
          </div>
          <div
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 13,
              color: "#6b7280",
              padding: "8px 14px",
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 999,
            }}
          >
            Pulled from the actual May 24, 2026 newsletter
          </div>
        </div>

        <div
          className="briefGrid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 14,
          }}
        >
          {BRIEFS.map((b, i) => (
            <article
              key={i}
              style={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                padding: "22px 22px 24px",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 6,
                  marginBottom: 4,
                  flexWrap: "nowrap",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontSize: 38,
                    fontWeight: 900,
                    color: b.accent,
                    letterSpacing: "-0.035em",
                    lineHeight: 1,
                    whiteSpace: "nowrap",
                  }}
                >
                  {b.n}
                </span>
                {"suffix" in b && b.suffix ? (
                  <span
                    style={{
                      fontFamily: "var(--font-heading)",
                      fontSize: 18,
                      fontWeight: 800,
                      color: b.accent,
                      letterSpacing: "-0.02em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {b.suffix}
                  </span>
                ) : null}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#6b7280",
                  marginBottom: 12,
                }}
              >
                {b.eyebrow}
              </div>
              <h3
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: 16.5,
                  fontWeight: 800,
                  color: "#111827",
                  letterSpacing: "-0.02em",
                  lineHeight: 1.2,
                  margin: "0 0 10px",
                }}
              >
                {b.title}
              </h3>
              <p
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 13.5,
                  lineHeight: 1.5,
                  color: "#4b5563",
                  margin: 0,
                }}
              >
                {b.body}
              </p>
            </article>
          ))}
        </div>

        <div
          className="crossBlock"
          style={{
            marginTop: 24,
            padding: "24px 26px",
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: 24,
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 6,
              paddingRight: 24,
              borderRight: "1px solid #e5e7eb",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#ad35fa",
              }}
            >
              Across Cincinnati
            </span>
            <span
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: 44,
                fontWeight: 900,
                color: "#111827",
                letterSpacing: "-0.04em",
                lineHeight: 1,
              }}
            >
              −34%
            </span>
            <span
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 11,
                fontWeight: 600,
                color: "#6b7280",
              }}
            >
              POTHOLE COMPLAINTS YTD
            </span>
          </div>
          <div>
            <h3
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: 22,
                fontWeight: 900,
                letterSpacing: "-0.03em",
                color: "#111827",
                margin: "0 0 8px",
                lineHeight: 1.15,
              }}
            >
              Cincinnati&rsquo;s pothole complaints are running 34% below last year.
            </h3>
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 14.5,
                lineHeight: 1.55,
                color: "#4b5563",
                margin: 0,
              }}
            >
              5,165 pothole and street repair complaints came in through 311 YTD, down 34.4% from 7,790 in the same period of 2025. The 2025 peak was February (3,298 in a single month); February 2026 came in at 1,807, still elevated but 26% below March 2025&rsquo;s 1,434.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────── Numbers ────────────────────────────── */

type Row = LiveRow;

function formatAsOf(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

const ROWS: Row[] = [
  { group: "Crime",   emoji: "🚨", label: "Violent crime incidents",       curr: "681",    change: "+4%",   delta: "+27",    dir: "up",   bad: true },
  { group: "Crime",   emoji: "📦", label: "Property crime incidents",      curr: "3.9k",   change: "−12%",  delta: "−503",   dir: "down", bad: false },
  { group: "Crime",   emoji: "💀", label: "Homicides",                     curr: "16",     change: "−33%",  delta: "−8",     dir: "down", bad: false },
  { group: "Safety",  emoji: "📞", label: "911 calls",                     curr: "124.4k", change: "+4%",   delta: "+4,458", dir: "up",   bad: null },
  { group: "Safety",  emoji: "🚗", label: "Traffic crashes",               curr: "5.5k",   change: "−3%",   delta: "−183",   dir: "down", bad: false },
  { group: "Housing", emoji: "🏗️", label: "New residential permits filed", curr: "113",    change: "+24%",  delta: "+22",    dir: "up",   bad: null },
  { group: "Housing", emoji: "⏱️", label: "Avg days to permit",            curr: "42.1",   change: "−25%",  delta: "−14",    dir: "down", bad: false },
  { group: "311",     emoji: "🛣️", label: "Pothole & street repair",       curr: "5.2k",   change: "−34%",  delta: "−2,674", dir: "down", bad: false },
  { group: "311",     emoji: "🧹", label: "Street & sidewalk cleaning",    curr: "4.3k",   change: "+51%",  delta: "+1,451", dir: "up",   bad: null },
  { group: "311",     emoji: "🎨", label: "Graffiti removal",              curr: "387",    change: "+38%",  delta: "+107",   dir: "up",   bad: true },
  { group: "311",     emoji: "🔊", label: "Noise complaints",              curr: "377",    change: "+231%", delta: "+263",   dir: "up",   bad: true },
  { group: "311",     emoji: "🚙", label: "Abandoned vehicle complaints",  curr: "830",    change: "−41%",  delta: "−588",   dir: "down", bad: false },
];

function Numbers({
  liveRows,
  numbersMeta,
}: {
  liveRows: LiveRow[] | null;
  numbersMeta: NumbersMeta | null;
}) {
  const rows = liveRows && liveRows.length > 0 ? liveRows : ROWS;
  const asOfLabel = formatAsOf(numbersMeta?.asOf ?? null);
  return (
    <section
      style={{
        padding: "88px 24px 72px",
        background: "#fff",
        borderTop: "1px solid #e5e7eb",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", maxWidth: 720, margin: "0 auto 44px" }}>
          <div
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 11.5,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#ad35fa",
              marginBottom: 12,
            }}
          >
            What we watch · Citywide YTD
          </div>
          <h2
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: 42,
              fontWeight: 900,
              letterSpacing: "-0.04em",
              lineHeight: 1.02,
              margin: "0 0 14px",
              color: "#111827",
              textWrap: "balance",
            }}
          >
            How Cincinnati&rsquo;s actually doing, in twelve numbers.
          </h2>
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 16,
              lineHeight: 1.55,
              color: "#6b7280",
              margin: 0,
            }}
          >
            We track every series the city publishes and email you the week&rsquo;s biggest moves. Below: how 2026 looks vs the same window of 2025.
          </p>
        </div>

        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            overflow: "hidden",
            background: "#fff",
            boxShadow: "0 8px 32px rgba(17,24,39,0.04)",
          }}
        >
          <div
            className="numbersHeader"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 130px 130px",
              padding: "12px 22px",
              background: "#f9fafb",
              borderBottom: "1px solid #e5e7eb",
              fontFamily: "var(--font-ui)",
              fontSize: 10.5,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#6b7280",
            }}
          >
            <div>Metric</div>
            <div></div>
            <div style={{ textAlign: "right" }}>2026 YTD</div>
            <div style={{ textAlign: "right" }}>Change</div>
          </div>

          {rows.map((r, i) => (
            <NumberRow key={i} r={r} last={i === rows.length - 1} />
          ))}
        </div>

        <div
          style={{
            marginTop: 16,
            textAlign: "center",
            fontFamily: "var(--font-ui)",
            fontSize: 12.5,
            color: "#9ca3af",
          }}
        >
          Source: Cincinnati Open Data Portal · STARS crime reporting · Cincinnati 311 · CAGIS permits.
          {asOfLabel ? ` YTD comparison through ${asOfLabel}.` : " YTD comparison vs the same window of last year."}
        </div>
      </div>
    </section>
  );
}

function NumberRow({ r, last }: { r: Row; last: boolean }) {
  const arrow = r.dir === "up" ? "↑" : "↓";
  const color = r.bad === true ? "#dc2626" : r.bad === false ? "#059669" : "#6b7280";
  return (
    <div
      className="numbersRow"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 130px 130px",
        alignItems: "center",
        padding: "14px 22px",
        borderBottom: last ? 0 : "1px solid #f3f4f6",
        transition: "background 120ms ease",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#fafafa")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 16 }}>{r.emoji}</span>
        <span
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 14,
            fontWeight: 600,
            color: "#111827",
          }}
        >
          {r.label}
        </span>
      </div>
      <div>
        <span
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 10.5,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "#9ca3af",
            padding: "3px 8px",
            background: "#f3f4f6",
            borderRadius: 4,
          }}
        >
          {r.group}
        </span>
      </div>
      <div
        style={{
          textAlign: "right",
          fontFamily: "var(--font-data)",
          fontSize: 16,
          fontWeight: 700,
          color: "#111827",
          letterSpacing: "-0.01em",
        }}
      >
        {r.curr}
      </div>
      <div style={{ textAlign: "right" }}>
        <div
          style={{
            fontFamily: "var(--font-data)",
            fontSize: 13.5,
            fontWeight: 700,
            color,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span>{arrow}</span>
          <span>{r.change}</span>
        </div>
        <div
          style={{
            fontFamily: "var(--font-data)",
            fontSize: 11,
            color: "#9ca3af",
            marginTop: 2,
          }}
        >
          {r.delta}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────── Stories ────────────────────────────── */

type Story = {
  cat: string;
  time: string;
  neighborhood: string;
  head: string;
  body?: string;
  badge?: { emoji: string; label: string };
};

const STORIES: Story[] = [
  {
    cat: "City Hall",
    time: "3 days ago",
    neighborhood: "North Avondale",
    head: "Fixed 5 times since April. North Avondale signal keeps failing.",
    body: "The city closed 5 traffic signal repair cases at 3924 Reading Rd in the 30 days ending May 20, 2026, compared to zero in the same window a year earlier. The signal returned to complaint status as quickly as two days after a closure.",
    badge: { emoji: "🤦", label: "Fix it, already" },
  },
  {
    cat: "City Hall",
    time: "3 days ago",
    neighborhood: "West Price Hill",
    head: "Tagged 6 times in two days. West Price Hill car stays put.",
    body: "The city closed 6 abandoned vehicle service requests at 4918 Relleum Av in the 30 days ending May 20. All 6 cases were filed within two days of each other, and all 6 closed together on May 12.",
  },
  {
    cat: "Police",
    time: "6 days ago",
    neighborhood: "Citywide",
    head: "Auto theft down 25%, burglary down 23%: Cincinnati's property crime drop has a shape.",
    body: "3,657 property crime incidents through May 13, down 10.2% from 4,071 in the same period of 2025. Auto theft fell 796 to 593, burglary 649 to 497, while personal theft held flat at 1,703 vs 1,735.",
  },
  {
    cat: "Public Works",
    time: "6 days ago",
    neighborhood: "Bond Hill",
    head: "Bond Hill filed 512 service requests in March. Potholes led the surge.",
  },
  {
    cat: "Business",
    time: "3 days ago",
    neighborhood: "Norwood",
    head: "Herbistro brings plant-based cooking to Factory 52.",
    body: "Herbistro held its grand opening May 16 at The Gatherall food hall inside Factory 52 in Norwood. The restaurant took over the former Melt Revival space at 2750 Park Ave.",
  },
  {
    cat: "Business",
    time: "May 13",
    neighborhood: "Madisonville",
    head: "Iron Chef Makoto Okuwa opens Suzu in Madisonville this May.",
    body: "A 6,000-square-foot contemporary Japanese restaurant from Iron Chef Makoto Okuwa, opening at Madison Square in Madisonville in May 2026. Okuwa's first restaurant in the Midwest, seating more than 200 guests, with a 12-seat omakase counter.",
  },
  {
    cat: "Building Dept",
    time: "Yesterday",
    neighborhood: "Mount Auburn",
    head: "FotoFocus gets its own building after 16 years.",
    body: "FotoFocus opens its first permanent home on May 29 at 228 East Liberty Street in Mount Auburn, a 14,700-square-foot space with two galleries and year-round free programming. The organization has run the largest photography biennial in America since 2010 without a building of its own.",
  },
  {
    cat: "Police",
    time: "May 15",
    neighborhood: "Citywide",
    head: "Cincinnati 911: 118,016 calls in 2026, up 4.5% from last year.",
    body: "Cincinnati Emergency Communications Center logged 118,016 calls year-to-date through May 10, up 4.5% from 112,902 in the same period of 2025. The monthly series going back to 2019 shows typical volume of 26,000 to 32,000 calls per month, with a seasonal pattern of higher summer volume.",
  },
];

function Stories() {
  return (
    <section
      style={{
        padding: "84px 24px 72px",
        background: "#fff",
        borderTop: "1px solid #e5e7eb",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginBottom: 28,
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 11.5,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#ad35fa",
                marginBottom: 10,
              }}
            >
              From the Cincinnati feed
            </div>
            <h2
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: 38,
                fontWeight: 900,
                letterSpacing: "-0.04em",
                lineHeight: 1.04,
                margin: 0,
                color: "#111827",
                maxWidth: "22ch",
              }}
            >
              The kind of story you&rsquo;ll get every Sunday.
            </h2>
          </div>
        </div>

        <div
          className="storiesGrid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 16,
          }}
        >
          {STORIES.map((s, i) => (
            <StoryCard key={i} s={s} />
          ))}
        </div>
      </div>
    </section>
  );
}

function StoryCard({ s }: { s: Story }) {
  return (
    <article
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        padding: "22px 24px",
        transition: "all 200ms cubic-bezier(0.4,0,0.2,1)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.025)",
        cursor: "default",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "rgba(173,53,250,0.28)";
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 12px 36px rgba(0,0,0,0.07)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#e5e7eb";
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.025)";
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "var(--font-ui)",
            fontSize: 13,
            color: "#ad35fa",
          }}
        >
          <b style={{ color: "#111827" }}>{s.cat}</b>
          <span style={{ color: "#6b7280", fontWeight: 500 }}>· {s.time}</span>
        </span>
        <span
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 12.5,
            fontWeight: 500,
            color: "#6b7280",
            background: "#f3f4f6",
            padding: "3px 10px",
            borderRadius: 999,
            whiteSpace: "nowrap",
          }}
        >
          🐅 {s.neighborhood}
        </span>
      </div>

      {s.badge && (
        <div style={{ marginBottom: 12 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "var(--font-ui)",
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              padding: "4px 10px",
              borderRadius: 999,
              color: "#7c3aed",
              background: "rgba(173,53,250,0.08)",
            }}
          >
            <span>{s.badge.emoji}</span>
            <span>{s.badge.label}</span>
          </span>
        </div>
      )}

      <h3
        style={{
          fontFamily: "var(--font-heading)",
          fontSize: 21,
          fontWeight: 900,
          lineHeight: 1.12,
          letterSpacing: "-0.03em",
          margin: "0 0 10px",
          color: "#111827",
        }}
      >
        {s.head}
      </h3>
      {s.body && (
        <p
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 14,
            lineHeight: 1.55,
            color: "#4b5563",
            margin: 0,
          }}
        >
          {s.body}
        </p>
      )}
    </article>
  );
}

/* ────────────────────────────── Final CTA ────────────────────────────── */

function FinalCTA({
  shortCode,
  citySlug,
  cityName,
  cityId,
}: {
  shortCode: string;
  citySlug: string;
  cityName: string;
  cityId?: number | null;
}) {
  return (
    <section
      style={{
        padding: "96px 24px 88px",
        background: "linear-gradient(180deg,#0f0a1f 0%,#1a1330 100%)",
        color: "#fff",
        borderTop: "1px solid #e5e7eb",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto", textAlign: "center" }}>
        <div style={{ display: "inline-flex", marginBottom: 28 }}>
          <BracketMark size={48} color="#c4b5fd" />
        </div>

        <h2
          className="h1CTA"
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: 54,
            fontWeight: 900,
            letterSpacing: "-0.045em",
            lineHeight: 0.98,
            margin: "0 0 20px",
            color: "#fff",
            textWrap: "balance",
          }}
        >
          Cincinnati publishes the data.
          <br />
          <span style={{ color: "#c4b5fd" }}>We make it readable.</span>
        </h2>

        <p
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 17,
            lineHeight: 1.55,
            color: "rgba(255,255,255,0.7)",
            margin: "0 auto 36px",
            maxWidth: "52ch",
          }}
        >
          One free email every Sunday morning. The week&rsquo;s biggest changes, tied back to the streets, neighborhoods, and city offices behind them.
        </p>

        <EmailSignupForm
          citySlug={citySlug}
          cityName={cityName}
          cityId={cityId}
          shortCode={shortCode}
          variant="dark"
          ctaLabel="Subscribe →"
          successLabel="✓ See you Sunday morning, Cincinnati."
        />

        <div
          style={{
            marginTop: 18,
            fontFamily: "var(--font-ui)",
            fontSize: 12.5,
            color: "rgba(255,255,255,0.4)",
          }}
        >
          Free. One email a week. Unsubscribe whenever. No tracking pixels.
        </div>

        <div
          style={{
            marginTop: 56,
            paddingTop: 28,
            borderTop: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "10px 24px",
            fontFamily: "var(--font-ui)",
            fontSize: 11.5,
            fontWeight: 600,
            color: "rgba(255,255,255,0.45)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          <span>Cincinnati Open Data</span>
          <span style={{ color: "rgba(255,255,255,0.2)" }}>·</span>
          <span>STARS crime reporting</span>
          <span style={{ color: "rgba(255,255,255,0.2)" }}>·</span>
          <span>Cincinnati 311</span>
          <span style={{ color: "rgba(255,255,255,0.2)" }}>·</span>
          <span>CAGIS permits</span>
          <span style={{ color: "rgba(255,255,255,0.2)" }}>·</span>
          <span>City Council records</span>
        </div>
      </div>
    </section>
  );
}

