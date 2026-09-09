"use client";

import Link from "next/link";
import {
  ADMIN_MENU_GROUPS,
  ADMIN_API_DOCS_ICON,
  ADMIN_GUIDE_ICON,
  ADMIN_SITEMAP_ICON,
} from "@/lib/adminMenuItems";
import styles from "./AdminGuide.module.css";

/**
 * City admin field guide, written for Miami's first external city admin.
 * The admin-menu mockup renders the real ADMIN_MENU_GROUPS definition so it
 * cannot drift from the menu behind the green avatar.
 */

const SECTIONS: Array<{ id: string; label: string; hook: string }> = [
  { id: "start", label: "Your first 20 minutes", hook: "do this once, in order" },
  { id: "how", label: "How it fits together", hook: "one picture" },
  { id: "screen", label: "The screen", hook: "nav and menu" },
  { id: "seymour", label: "Seymour", hook: "the agent" },
  { id: "dashboard", label: "The Miami dashboard", hook: "admin tabs" },
  { id: "metrics", label: "Metrics and templates", hook: "how Miami grows" },
  { id: "stories", label: "Stories and the Feed", hook: "what residents read" },
  { id: "newsletter", label: "The Sunday newsletter", hook: "weekly product" },
  { id: "data", label: "Data and city structure", hook: "under the hood" },
  { id: "rest", label: "Everything else", hook: "for completeness" },
  { id: "care", label: "Handle with care", hook: "reversible vs not" },
  { id: "challenge", label: "Your challenge", hook: "where to start" },
  { id: "cheatsheet", label: "Prompt cheat sheet", hook: "copy, paste" },
];

/** How often a new city admin will actually open each admin-menu view. */
const MENU_USAGE: Record<string, "useful" | "rarely"> = {
  "system-stats": "rarely",
  "city-data": "useful",
  "metrics-admin": "useful",
  "datasets-admin": "useful",
  "feed-stories-admin": "rarely",
  "feed-admin": "useful",
  "newsletter-admin": "useful",
  "job-logs": "useful",
  "user-management": "rarely",
};

const BRAND = "#ad35fa";

function Tag({ kind }: { kind: "useful" | "rarely" }) {
  return (
    <span className={`${styles.tag} ${kind === "useful" ? styles.tagHi : styles.tagLo}`}>
      {kind}
    </span>
  );
}

function SchematicFigure() {
  const T = 14;
  const S = 12;
  const L = 11.5;
  const box = (
    x: number,
    y: number,
    w: number,
    h: number,
    title: string,
    sub1?: string,
    sub2?: string,
    opts: { dashed?: boolean; accent?: boolean } = {}
  ) => {
    const cx = x + w / 2;
    const ty = sub1 || sub2 ? y + 27 : y + h / 2 + 5;
    return (
      <g key={`${x}-${y}`}>
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx={10}
          fill={opts.accent ? BRAND : "none"}
          fillOpacity={opts.accent ? 0.12 : undefined}
          stroke={opts.accent ? BRAND : "currentColor"}
          strokeWidth={1.5}
          strokeDasharray={opts.dashed ? "5 4" : undefined}
        />
        <text x={cx} y={ty} textAnchor="middle" fontSize={T} fontWeight={600} fill="currentColor">
          {title}
        </text>
        {sub1 && (
          <text x={cx} y={ty + 18} textAnchor="middle" fontSize={S} fill="currentColor" opacity={0.75}>
            {sub1}
          </text>
        )}
        {sub2 && (
          <text x={cx} y={ty + 34} textAnchor="middle" fontSize={S} fill="currentColor" opacity={0.75}>
            {sub2}
          </text>
        )}
      </g>
    );
  };
  const arrow = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    label?: string,
    lx?: number,
    ly?: number,
    opts: { accent?: boolean; dashed?: boolean; anchor?: "start" | "middle" | "end" } = {}
  ) => {
    const col = opts.accent ? BRAND : "currentColor";
    return (
      <g key={`a${x1}-${y1}-${x2}-${y2}`}>
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={col}
          strokeWidth={1.5}
          strokeDasharray={opts.dashed ? "4 4" : undefined}
          markerEnd={opts.accent ? "url(#guide-arrow-brand)" : "url(#guide-arrow)"}
        />
        {label && (
          <text x={lx} y={ly} textAnchor={opts.anchor ?? "middle"} fontSize={L} fill={col} opacity={0.85}>
            {label}
          </text>
        )}
      </g>
    );
  };

  return (
    <figure className={styles.figure}>
      <div className={styles.diagram}>
        <svg
          viewBox="0 0 1080 490"
          role="img"
          aria-label="Schematic: Miami’s open-data portal is fetched into a dataset catalog; metrics built from shared templates query those datasets; anomaly detection finds spikes in the metrics; Seymour writes and judges stories from the anomalies; stories publish to the Miami dashboard, individual story pages and the Sunday newsletter, which reach residents, reporters and officials. Seymour operates every stage, scheduled jobs trigger it nightly and weekly, and the city admin directs Seymour and edits display settings, stories, leaders and districts."
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <marker id="guide-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
            </marker>
            <marker id="guide-arrow-brand" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={BRAND} />
            </marker>
          </defs>

          {box(20, 20, 150, 60, "You (city admin)", "chat, panels, gear icon")}
          {box(230, 20, 650, 60, "Seymour, the agent", "discovers datasets · maps templates · runs metrics · finds anomalies · writes stories and the newsletter", undefined, { accent: true })}
          {box(900, 20, 170, 60, "Scheduled jobs", "nightly metrics, weekly stories", undefined, { dashed: true })}
          {arrow(170, 50, 228, 50, "asks, directs", 199, 41)}
          {arrow(898, 50, 882, 50)}
          <text x={890} y={13} textAnchor="middle" fontSize={L} fill="currentColor" opacity={0.85}>triggers</text>

          {arrow(300, 80, 300, 170, "catalogs", 308, 130, { accent: true, dashed: true, anchor: "start" })}
          {arrow(470, 80, 470, 170, "builds, runs", 478, 130, { accent: true, dashed: true, anchor: "start" })}
          {arrow(640, 80, 640, 170, "detects", 648, 130, { accent: true, dashed: true, anchor: "start" })}
          {arrow(810, 80, 810, 170, "writes, judges", 818, 130, { accent: true, dashed: true, anchor: "start" })}

          {box(20, 172, 130, 78, "Open-data portal", "ArcGIS, run by", "the City of Miami")}
          {arrow(150, 211, 228, 211, "fetched", 189, 202)}
          {box(230, 172, 140, 78, "Datasets", "103 catalogued", "Datasets panel")}
          {arrow(370, 211, 398, 211)}
          {box(400, 172, 140, 78, "Metrics", "13 live on dashboard", "51 shared templates")}
          {arrow(540, 211, 568, 211)}
          {box(570, 172, 140, 78, "Anomalies", "spikes and drops", "Alerts tab")}
          {arrow(710, 211, 738, 211)}
          {box(740, 172, 140, 78, "Stories", "5 so far", "judged, 4+ passes")}

          <line x1={810} y1={250} x2={810} y2={302} stroke="currentColor" strokeWidth={1.5} />
          <line x1={500} y1={302} x2={810} y2={302} stroke="currentColor" strokeWidth={1.5} />
          <text x={655} y={294} textAnchor="middle" fontSize={L} fill="currentColor" opacity={0.85}>published to</text>
          {arrow(500, 302, 500, 330)}
          {arrow(640, 302, 640, 330)}
          {arrow(810, 302, 810, 330)}
          {arrow(440, 250, 440, 330, "tables, charts", 432, 294, { anchor: "end" })}

          {box(400, 332, 140, 78, "Miami dashboard", "Overview · All metrics", "transparent.city/c/miami")}
          {box(570, 332, 140, 78, "Story pages", "one public page", "per story")}
          {box(740, 332, 140, 78, "Sunday newsletter", "shared edition, or", "personalized per reader")}

          <rect x={400} y={444} width={480} height={36} rx={8} fill="currentColor" fillOpacity={0.08} stroke="none" />
          <text x={640} y={467} textAnchor="middle" fontSize={T} fontWeight={600} fill="currentColor">
            Miami residents, reporters and officials
          </text>
          {arrow(470, 410, 470, 442)}
          {arrow(640, 410, 640, 442)}
          {arrow(810, 410, 810, 442)}

          {box(20, 332, 150, 78, "You also edit", "dashboard order, stories,", "leaders and districts", { dashed: true })}
          {arrow(170, 371, 398, 371, "display settings", 284, 362)}
        </svg>
      </div>
      <figcaption className={styles.figcaption}>
        Solid arrows are data moving. Dashed purple arrows are Seymour acting on a stage. Everything in the middle and
        bottom rows is visible to you in the admin menu; everything in the bottom row is visible to the public.
      </figcaption>
    </figure>
  );
}

function ScreenMockup() {
  return (
    <div className={styles.mock}>
      <div className={styles.mockframe} aria-label="Sketch of the app layout">
        <div className={styles.nav}>
          <div className={styles.brand}>
            transparent<span className={styles.city}>.city</span>
          </div>
          <div className={styles.navItem}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
              <path d="M18 14h-8" />
              <path d="M15 18h-5" />
              <path d="M10 6h8v4h-8V6Z" />
            </svg>
            Feed
          </div>
          <div className={styles.navItem}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Chat
          </div>
          <div className={styles.navItem}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.5" y2="16.5" />
            </svg>
            Search Cities
          </div>
          <div className={styles.navSect}><span>My Places</span><span>▾</span></div>
          <div className={styles.navSub}>San Francisco, California</div>
          <div className={`${styles.navSub} ${styles.navSubActive}`}>🏖️ Miami, Florida</div>
          <div className={styles.navSect}><span>Research reports</span><span>▸</span></div>
          <div className={styles.navSect}><span>Recent chats</span><span>▸</span></div>
          <div className={styles.navSect}><span>Suggested questions</span><span>▾</span></div>
          <div className={styles.navQ}>Which neighborhood in Miami, Florida is the safest?</div>
          <div className={styles.navQ}>What are the crime trends in Miami, Florida?</div>
          <div className={styles.navSect}><span>Job sessions</span><span>▸</span></div>
          <div className={styles.navFoot}>
            <span className={styles.bubble}>AE</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </div>
        </div>
        <div className={styles.canvas}>
          <div className={styles.adminbar}>Admin view</div>
          <div className={styles.tabs}>
            <span className={styles.on}>Overview</span>
            <span>All metrics</span>
            <span>Map</span>
            <span>Alerts</span>
          </div>
          <div className={styles.card}>
            <div className={styles.ttl}>
              🏖️ Miami <small>Mayor: Eileen Higgins</small>
            </div>
            <div className={styles.map} />
            <div className={styles.chips}>
              <span className={`${styles.pill} ${styles.pillBrand}`}>5 new since Aug 29</span>
              <span className={`${styles.pill} ${styles.pillNeutral}`}>Following</span>
            </div>
          </div>
        </div>
      </div>
      <p className={styles.fine}>
        A sketch of the home screen as an admin. The green circle at the bottom left is the admin menu. The four tabs
        across the top (Overview, All metrics, Map, Alerts) only appear for admins.
      </p>
    </div>
  );
}

function MenuMockup() {
  return (
    <div className={styles.menu} aria-label="The admin menu, as it appears behind the green circle">
      <div className={`${styles.mi} ${styles.miHere}`}>
        {ADMIN_GUIDE_ICON}
        <span>Admin guide</span>
        <span className={`${styles.tag} ${styles.tagHi}`}>you are here</span>
      </div>
      <div className={styles.mi}>
        {ADMIN_SITEMAP_ICON}
        <span>Sitemap</span>
        <Tag kind="rarely" />
      </div>
      <div className={styles.mi}>
        {ADMIN_API_DOCS_ICON}
        <span>API Documentation</span>
        <Tag kind="rarely" />
      </div>
      {ADMIN_MENU_GROUPS.map((group) => (
        <div key={group.label}>
          <div className={styles.menuGrp}>{group.label}</div>
          {group.items.map((item) => (
            <div key={item.view} className={styles.mi}>
              {item.icon}
              <span>{item.label}</span>
              <Tag kind={MENU_USAGE[item.view] ?? "rarely"} />
            </div>
          ))}
        </div>
      ))}
      <div className={styles.menuSep} />
      <div className={styles.mi}>
        <span />
        <span>Settings</span>
        <span />
      </div>
      <div className={styles.mi}>
        <span />
        <span>Logout</span>
        <span />
      </div>
    </div>
  );
}

export default function AdminGuide() {
  return (
    <div className={styles.shell}>
      <div className={styles.topbar}>
        <Link href="/home" className={styles.back}>
          <span aria-hidden="true">←</span> Back to Transparent City
        </Link>
        <span className={styles.crumb}>
          Admin <b>· Guide</b>
        </span>
      </div>

      <div className={styles.page}>
        <header className={styles.masthead}>
          <div className={styles.mastTop}>
            <span className={styles.wordmark}>
              <span>🏖️ Miami on</span>
              <span>transparent<span className={styles.city}>.city</span></span>
            </span>
            <span className={styles.roleChip}>City admin · Alan</span>
          </div>
          <h1>Miami Admin Field Guide</h1>
          <p className={styles.lede}>
            You now have the same tools Rob and Adam use to run a city on Transparent City. This guide covers what each
            one does, why it exists, and which ones matter first. Read the first section, then go try things.
            Everything else is here when you need it.
          </p>
          <div className={styles.meta}>
            <span><b>Your account:</b> Admin + City Lead for Miami</span>
            <span>
              <b>Public page:</b>{" "}
              <a href="https://transparent.city/c/miami" target="_blank" rel="noopener noreferrer">
                transparent.city/c/miami
              </a>
            </span>
            <span><b>Written:</b> September 5, 2026</span>
          </div>
        </header>

        <nav className={styles.contents} aria-label="Contents">
          <span className={styles.eyebrow}>Jump to a section, in priority order</span>
          <ol>
            {SECTIONS.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className={i === 0 ? styles.first : undefined}>
                  {s.label} <small>{s.hook}</small>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* Start here */}
        <section id="start" className={styles.section}>
          <div className={styles.secHead}>
            <span className={styles.eyebrow}>Start here</span>
            <h2>Your first 20 minutes</h2>
            <p className={styles.why}>
              The fastest way to understand the system is to make it do something for Miami. This sequence touches
              every major piece once.
            </p>
          </div>
          <ol className={styles.steps}>
            <li>
              <div>
                <b>Sign in and find Miami.</b> Go to <Link href="/home">transparent.city/home</Link>. In the left nav
                under <b>My Places</b>, click <b>Miami, Florida</b>. You will see a purple <b>Admin View</b> banner across
                the top. That banner means you are seeing the admin version of the page, with extra tabs that residents
                do not get.
              </div>
            </li>
            <li>
              <div>
                <b>Look at what Miami already has.</b> Click the <b>All metrics</b> tab. Today Miami tracks 13 metrics
                across crime, permits, 911 calls and traffic crashes. Notice the year-to-date comparison for each one.
                That table is the raw material for everything else.
              </div>
            </li>
            <li>
              <div>
                <b>Ask Seymour a question.</b> Click <b>New Chat</b> at the top of the left nav and type:{" "}
                <i>
                  “Traffic calls for service in Miami are up 16 percent this year. Where in the city is that increase
                  concentrated? Show me a map by commission district.”
                </i>{" "}
                Seymour will pull data, chart it, and explain. Give it a minute or two.
              </div>
            </li>
            <li>
              <div>
                <b>Ask Seymour what is broken.</b> In the same chat:{" "}
                <i>
                  “The serious and fatal traffic crashes metric shows no 2026 data. Did Miami’s crash dataset stop
                  updating, move, or change shape?”
                </i>{" "}
                Seymour can check the portal and the metric’s query. Finding a broken feed is a real result.
              </div>
            </li>
            <li>
              <div>
                <b>Open the admin menu.</b> Click the <b>green circle</b> at the bottom left of the nav. That is the full
                admin toolset, and it is where this guide lives. You do not need to click into anything yet. Just see
                what is there, then come back here.
              </div>
            </li>
            <li>
              <div>
                <b>Read the five Miami stories.</b> Back on the Miami dashboard, scroll down to <b>New stories</b>. These
                were generated by Seymour from anomalies in the metrics. They are what the Sunday newsletter is built
                from.
              </div>
            </li>
          </ol>
          <div className={`${styles.callout} ${styles.calloutOk}`}>
            <div className={styles.t}>The one rule</div>
            <p>
              Stay inside Miami. Your admin menu shows every city on the platform, and nothing stops you from changing
              another one. Nothing in this guide requires touching any city other than Miami.
            </p>
          </div>
        </section>

        {/* How it fits together */}
        <section id="how" className={styles.section}>
          <div className={styles.secHead}>
            <span className={styles.eyebrow}>The whole machine</span>
            <h2>How it fits together</h2>
            <p className={styles.why}>
              Data flows left to right, from Miami’s open-data portal to a resident’s inbox. Seymour does the work at
              every stage. Scheduled jobs keep it moving without anyone asking. You steer.
            </p>
          </div>
          <SchematicFigure />
          <div className={styles.prose}>
            <p>
              <strong>The key idea:</strong> nothing reaches a resident that did not start as a metric. If you want
              Miami’s feed and newsletter to be richer, the lever is more and better metrics. If you want them to be more
              accurate, the lever is checking stories before Sunday. Both are Seymour conversations.
            </p>
          </div>
        </section>

        {/* The screen */}
        <section id="screen" className={styles.section}>
          <div className={styles.secHead}>
            <span className={styles.eyebrow}>Orientation</span>
            <h2>The screen, and where the tools are</h2>
            <p className={styles.why}>
              Almost everything lives in two places: the left nav, and the menu behind the green circle at the bottom of
              it.
            </p>
          </div>
          <ScreenMockup />
          <div className={styles.prose}>
            <h3>The left nav, top to bottom</h3>
            <ul className={styles.plain}>
              <li><strong>Feed.</strong> Every story on the platform, all cities, newest first. Useful for seeing what “good” looks like in the older cities.</li>
              <li><strong>New Chat.</strong> Opens a conversation with Seymour. This is the door to most of your powers. See Seymour below.</li>
              <li><strong>Search Cities.</strong> Jump to any city. You will mostly ignore this.</li>
              <li><strong>My Places.</strong> Cities and neighborhoods you follow. Miami is here. Click it to open the Miami dashboard.</li>
              <li><strong>Research reports.</strong> Long-form investigations Seymour has run. You can create new ones from a chat.</li>
              <li><strong>Recent chats.</strong> Your past Seymour conversations. Nothing is lost when you close a chat.</li>
              <li><strong>Suggested questions.</strong> Starter prompts that adapt to the city you are looking at. Click one to send it.</li>
              <li><strong>Job sessions.</strong> Chats that were started by scheduled background jobs rather than a person. This is how you can read what Seymour was thinking when it wrote a story overnight.</li>
              <li><strong>The green circle.</strong> Your avatar. Click it for the admin menu below, plus Settings and Logout.</li>
            </ul>
          </div>
          <h3>The admin menu (the green circle)</h3>
          <div className={styles.menuExplain}>
            <MenuMockup />
            <dl>
              <div>
                <dt>Data group</dt>
                <dd>Everything about what Miami <em>is</em>: its boundaries and districts, its open-data portal, the datasets pulled from it, and the metrics computed on top. See Metrics and templates, and Data and city structure.</dd>
              </div>
              <div>
                <dt>Workflows group</dt>
                <dd>Everything Seymour <em>produces</em> on a schedule: stories, the newsletter, replies to reader email, and the logs of the jobs that made them. See Stories, the Sunday newsletter, and Everything else.</dd>
              </div>
              <div>
                <dt>Tagged “useful”</dt>
                <dd>The panels you will actually open in your first weeks. The rest are platform-wide tools that are there if you need them and safe to ignore.</dd>
              </div>
              <div>
                <dt>Prefer the chat</dt>
                <dd>Most of what these panels do, Seymour can do for you in plain English. The panels are for when you want to see the full list, click one exact button, or check what a job did.</dd>
              </div>
            </dl>
          </div>
        </section>

        {/* Seymour */}
        <section id="seymour" className={styles.section}>
          <div className={styles.secHead}>
            <span className={styles.eyebrow}>The main tool</span>
            <h2>Seymour, the agent</h2>
            <p className={styles.why}>
              Seymour is the AI agent that runs Transparent City. It answers questions, but it also builds things:
              metrics, maps, stories, research reports, scheduled jobs. Talking to it is the primary admin interface.
            </p>
          </div>
          <div className={styles.prose}>
            <p>
              <strong>What it is.</strong> A conversational agent with about 90 tools behind it. When you ask something,
              it decides which tools to call: query Miami’s open-data portal, pull a metric’s time series, run anomaly
              detection, draw a chart or map, create a story. You see each tool call unfold in the chat, so you can follow
              its reasoning and catch mistakes.
            </p>
            <p>
              <strong>Its house rule is “show, don’t tell.”</strong> It is prompted to always chart or map the data it is
              discussing. If it gives you a number without a picture, ask it to show the chart.
            </p>
            <p>
              <strong>Two modes of question.</strong> Analysis questions (“what is happening with X?”) are safe and cheap
              to ask as often as you like. Build questions (“create a metric for X”, “make a story about Y”) change what
              Miami residents see. The Handle with care section covers which builds to be careful with.
            </p>
          </div>
          <h3>Good first questions for Miami</h3>
          <div className={styles.prompts}>
            <Prompt text="Demolition permits in Miami are up 11 percent this year. Which neighborhoods are they concentrated in, and what kinds of buildings are coming down?" note="Analysis. Starts from a dashboard metric, then digs into the underlying dataset." />
            <Prompt text="Show ShotSpotter activations by commission district for the last 12 months. Is any district trending up while the citywide number is flat?" note="Analysis by place. Ask for the map and the table." />
            <Prompt text="Which datasets on Miami’s open-data portal have we catalogued but never used in a metric? Rank them by how useful they would be to a resident." note="Discovery from the data side. Pairs with the template question in Adam’s note." />
            <Prompt text="Police calls for service are down 9 percent and violent crime is down 9 percent. Is that one trend or two? Compare them month by month and by district." note="Analysis across metrics." />
            <Prompt text="Which Miami metrics have stale data or failed their last run, and what is the most likely cause for each?" note="Health check. Seymour can list metric status and last data date." />
            <Prompt text="Run anomaly detection on Miami’s drug-related 911 calls and show me anything unusual since June." note="Analysis that feeds stories. See the Stories section." />
          </div>
          <div className={styles.callout}>
            <div className={styles.t}>How to get better answers</div>
            <p>
              Name the city (“in Miami”) and the time window (“this year vs last year”). Ask for the chart or map
              explicitly. If it grabs the wrong dataset, tell it the dataset name from the Datasets panel. Long questions
              are fine. Follow-ups in the same chat keep the context.
            </p>
          </div>
          <div className={`${styles.callout} ${styles.calloutWarn}`}>
            <div className={styles.t}>It will do what you ask, including destructive things</div>
            <p>
              Seymour can delete a metric, clear its data, or restructure the city if you tell it to. There is no
              confirmation step. Read Handle with care before asking it to remove or rebuild anything.
            </p>
          </div>
        </section>

        {/* Dashboard */}
        <section id="dashboard" className={styles.section}>
          <div className={styles.secHead}>
            <span className={styles.eyebrow}>What residents see</span>
            <h2>The Miami dashboard</h2>
            <p className={styles.why}>
              This is the public product. Residents see the Overview. As admin you get four tabs and a gear icon that
              opens Miami’s settings without leaving the page.
            </p>
          </div>
          <div className={styles.tablewrap}>
            <table>
              <thead>
                <tr><th>Tab</th><th>What it shows</th><th>Who sees it</th></tr>
              </thead>
              <tbody>
                <tr><td><b>Overview</b></td><td>The briefing: map, what moved this week, new stories, and the “accountable here” list of elected officials. This is what a Miami resident gets.</td><td>Everyone</td></tr>
                <tr><td><b>All metrics</b></td><td>Every active metric with a year-to-date comparison, grouped by category. Click any metric for its detail page with charts, district breakdowns and maps.</td><td>Admins (residents reach it via a toggle on Overview)</td></tr>
                <tr><td><b>Map</b></td><td>Miami’s metrics on a map, by district or neighborhood, with a timeline slider.</td><td>Admins</td></tr>
                <tr><td><b>Alerts</b></td><td>Anomalies detected across Miami’s metrics: sudden spikes or drops, citywide or by district. Story ideas start here.</td><td>Admins</td></tr>
              </tbody>
            </table>
          </div>
          <div className={styles.prose}>
            <p>
              <strong>The gear icon next to “Miami.”</strong> On the dashboard header there is a small “City data admin”
              button. It opens a drawer with Miami’s admin settings: city information, structure, metrics, datasets and
              newsletters, without leaving the dashboard. It is the same thing as the City Data panel in the admin menu,
              scoped to Miami.
            </p>
            <p>
              <strong>Metric detail pages.</strong> Clicking a metric opens a full page with time series, district
              comparisons, a map, and source attribution. On these pages, admins also get a small row of actions: execute
              (re-run the metric now), edit, view anomalies, view maps, clear data, delete.
            </p>
          </div>
          <h3>What Miami has today</h3>
          <div className={styles.tablewrap}>
            <table>
              <thead>
                <tr><th>Category</th><th>Metrics on the dashboard</th><th className={styles.num}>Count</th></tr>
              </thead>
              <tbody>
                <tr><td>Crime</td><td>Property Crime Incidents · Drug Crime Incidents · Violent Crime Incidents</td><td className={styles.num}>3</td></tr>
                <tr><td>Housing / Permits</td><td>Demolition Permits Issued · New Commercial Construction Permits Filed · New Residential Construction Permits Filed / Issued / Completed</td><td className={styles.num}>5</td></tr>
                <tr><td>Safety / 911 calls</td><td>Police Calls for Service · Drug-Related 911 Calls · ShotSpotter Activations · Traffic Calls for Service</td><td className={styles.num}>4</td></tr>
                <tr><td>Transportation safety</td><td>Serious &amp; Fatal Traffic Crashes (KSI) <span className={styles.sub}>Currently showing “No data” for 2026. Worth investigating.</span></td><td className={styles.num}>1</td></tr>
              </tbody>
            </table>
          </div>
          <p className={styles.fine}>
            Snapshot from September 5, 2026. Miami also has 103 datasets catalogued from its ArcGIS open-data portal, and
            5 published stories. Mayor on record: Eileen Higgins.
          </p>
        </section>

        {/* Metrics */}
        <section id="metrics" className={styles.section}>
          <div className={styles.secHead}>
            <span className={styles.eyebrow}>Growing Miami</span>
            <h2>Metrics and templates</h2>
            <p className={styles.why}>
              A metric is a number we compute from a city dataset on a schedule and track over time. Templates are metric
              definitions shared across all ten cities, so Miami’s version is directly comparable to Chicago’s or
              Seattle’s.
            </p>
          </div>
          <div className={styles.prose}>
            <p>
              <strong>Why templates matter.</strong> Every city publishes its data a little differently. A template says
              “count of violent crime incidents, by day, by district” once, and Seymour maps that onto each city’s own
              dataset and field names. That is what makes cross-city comparison possible, and it is why the first thing
              to do in Miami is fill in more templates rather than invent one-off metrics.
            </p>
            <p>
              <strong>Where Miami stands.</strong> The platform has 51 templates. Miami has 17 instantiated, 18 attempted,
              and 34 not yet tried. Many of the missing ones will fail because Miami does not publish that data. Some will
              succeed. Finding out which is a good week’s work.
            </p>
          </div>
          <div className={styles.pipe} aria-label="How a metric goes from template to dashboard">
            <Stage l="Template" h="Pick a template" d="Ask Seymour which apply, or open City Data → Miami → Metrics → Templates." />
            <Stage l="Map" h="Seymour maps it" d="It searches Miami’s portal for a dataset, matches fields, writes the query. This runs as a background job." />
            <Stage l="Run" h="Execute it" d="The metric computes its history. Check status, last run and last data date in the Metrics tab." />
            <Stage l="Show" h="Turn on for dashboard" d="“Show on Dashboard” and the order are controlled in Display Settings." />
            <Stage l="Watch" h="Anomalies and stories" d="Once it has history, anomaly detection can find spikes, and stories can be written about them." />
          </div>
          <h3>Two ways to do it</h3>
          <div className={styles.prose}>
            <p>
              <strong>Through Seymour (recommended).</strong> “Instantiate the 311 service requests template for Miami.”
              Seymour finds the dataset, maps the fields, and reports back. If it cannot find a matching dataset it will
              say so. You can also ask it to create a Miami-only metric from scratch when no template fits: “Create a
              metric counting weekly code-enforcement cases in Miami from dataset X.” Prefer templates when one exists.
            </p>
            <p>
              <strong>Through the panel.</strong> Admin menu → <b>City Data</b> → search Miami → click into it →{" "}
              <b>Metrics</b> tab. Four sub-sections:
            </p>
            <ul className={styles.plain}>
              <li><strong>Metrics.</strong> Every Miami metric with status, last run, last data date, record counts. Click one to open a drawer with its chart and an Execute button.</li>
              <li><strong>Templates.</strong> The catalog, with a badge showing how many are not yet instantiated. “Run all templates” tries every missing one in sequence (this takes a while and costs money; fine to do once). Or instantiate one at a time.</li>
              <li><strong>Display Settings.</strong> Which metrics appear on the public dashboard and in what order. This is the single most visible change you can make. Changes go live immediately.</li>
              <li><strong>Inactive &amp; Cleanup.</strong> Metrics that failed or were turned off. Safe to leave alone.</li>
            </ul>
            <p>
              <strong>The platform-wide Metrics panel</strong> (admin menu → Metrics) shows all cities together with
              filters. Use it for cross-city comparison views. Do not edit templates there: a template edit changes every
              city that uses it.
            </p>
          </div>
          <div className={styles.callout}>
            <div className={styles.t}>How metrics stay fresh</div>
            <p>
              Each metric has a schedule (daily, weekly, monthly) and re-runs automatically. If a metric shows “No data”
              or a last data date weeks old, the city’s dataset has probably lagged or changed shape. Ask Seymour to
              “check freshness for Miami metrics” or open the metric and hit Execute. If it keeps failing, that is a real
              finding: Miami’s data feed broke.
            </p>
          </div>
        </section>

        {/* Stories */}
        <section id="stories" className={styles.section}>
          <div className={styles.secHead}>
            <span className={styles.eyebrow}>What people read</span>
            <h2>Stories and the Feed</h2>
            <p className={styles.why}>
              A story is a short, sourced article Seymour writes about something notable in the data, with a chart or
              map. Stories appear on the Miami dashboard, get their own public page, and feed the newsletter.
            </p>
          </div>
          <div className={styles.pipe} aria-label="How stories get made">
            <Stage l="Input" h="Metrics" d="Anything with enough history." />
            <Stage l="Detect" h="Anomalies" d="Statistical spikes and drops, citywide or by district. Visible under the Alerts tab." />
            <Stage l="Write" h="Seymour drafts" d="Headline, summary, article, chart. Scheduled jobs do this overnight; you can also ask for one in chat." />
            <Stage l="Judge" h="Accuracy eval" d="A second model scores each story for accuracy against its own trace. 4 or higher is newsletter-eligible." />
            <Stage l="Publish" h="Dashboard, page, newsletter" d="Public URL: /c/miami/stories/…" />
          </div>
          <div className={styles.prose}>
            <p>
              <strong>Story types you will see.</strong> Alerts (something spiked), comparisons (Miami vs other cities, or
              district vs district), spending, milestones, and “traction” stories, which are the good-news ones: a number
              moving the right way for a sustained period. The mix matters. A feed that is all alarms is not useful to a
              resident.
            </p>
            <p>
              <strong>Making a story yourself.</strong> In chat: “Write a story about the drop in Miami’s property crime
              this year, with the year-to-date chart.” Or from a research report: “Generate feed stories from this
              research.” Or: “Run anomaly detection on Miami’s 911 calls and write a story if there is anything
              significant.” The story shows up on the dashboard within a minute.
            </p>
            <p>
              <strong>The Feed admin panel</strong> (admin menu → Feed) is the editorial desk. Filter by city to Miami.
              For each story you can see views, likes and clicks, the eval score, and which job or chat session created
              it. From here you can edit a headline, delete a story, force a story into the newsletter pool regardless of
              score, or ask Seymour to make a minimal factual fix based on the judge’s notes.
            </p>
            <p>
              <strong>Seymour’s Inbox</strong> (admin menu → Seymour’s Inbox) is something different: reader emails. When
              someone replies to a newsletter or writes in, it lands here and Seymour can draft a reply for you to
              approve. For Miami this will be quiet for a while.
            </p>
          </div>
          <div className={styles.callout}>
            <div className={styles.t}>Judge before you trust</div>
            <p>
              Read a story’s numbers against the metric page before you share it. The eval catches most errors, not all.
              If something is wrong, use “fix with Seymour” in the Feed panel or delete the story. Every story is public
              the moment it exists.
            </p>
          </div>
        </section>

        {/* Newsletter */}
        <section id="newsletter" className={styles.section}>
          <div className={styles.secHead}>
            <span className={styles.eyebrow}>The weekly product</span>
            <h2>The Sunday newsletter</h2>
            <p className={styles.why}>
              Every Sunday, subscribers in Miami get an email built from that week’s eligible stories and the metrics that
              moved. It is generated by Seymour, per city, and personalized for readers who have saved a specific
              neighborhood.
            </p>
          </div>
          <div className={styles.prose}>
            <p>
              <strong>How it is assembled.</strong> A weekly job scores the week’s stories, picks a slate, and asks
              Seymour to write the edition. Readers with no saved places get the shared Miami edition. Readers who saved
              a neighborhood get their own version with that place’s numbers. Editions are archived publicly at{" "}
              <code>/c/miami/newsletter/&lt;date&gt;</code>.
            </p>
            <p><strong>The Newsletters panel</strong> (admin menu → Newsletters) has tabs:</p>
            <ul className={styles.plain}>
              <li><strong>Dashboard.</strong> Subscriber count, sends this week, stories scored today, unsent drafts.</li>
              <li><strong>Workbench.</strong> The scored candidate stories for the coming edition, and a button to generate a sample Miami newsletter right now so you can read what next Sunday would look like. This is the tab to use.</li>
              <li><strong>Queue and Sends.</strong> Pending sends awaiting review, and the log of what went out.</li>
              <li><strong>Subscribers.</strong> Who is signed up, by city and frequency.</li>
              <li><strong>Prompts.</strong> The instructions Seymour follows when writing. Editing these changes the voice for every city, so leave them unless you have talked to Adam.</li>
            </ul>
            <p>
              <strong>What you control for Miami.</strong> Mostly the inputs: the more good stories Miami has by Saturday,
              the better the Sunday email. Use the Workbench sample to see how it reads, and if it is thin, go make
              stories.
            </p>
          </div>
        </section>

        {/* Data */}
        <section id="data" className={styles.section}>
          <div className={styles.secHead}>
            <span className={styles.eyebrow}>Under the hood</span>
            <h2>Data and city structure</h2>
            <p className={styles.why}>
              Where Miami’s numbers come from, and how the city is divided up. You will read these panels often and
              change them rarely.
            </p>
          </div>
          <div className={styles.prose}>
            <p>
              <strong>Datasets</strong> (admin menu → Datasets). The catalog of open-data sources we have pulled from
              Miami’s portal: 103 today, each with its portal ID, department, category, row count, update frequency and
              fetch status. When Seymour builds a metric, it picks from this list. If a dataset you know exists is missing,
              ask Seymour to “discover and add dataset X from Miami’s portal.” If one shows an error, that is often a
              portal-side change worth reporting.
            </p>
            <p><strong>City Data → Miami</strong> is the per-city control panel with five tabs:</p>
            <ul className={styles.plain}>
              <li><strong>Data.</strong> City information (name, population, portal URL), statistics, and buttons to reload datasets and metadata.</li>
              <li><strong>Structure.</strong> Miami’s geography and government: council districts as map shapes, neighborhoods, the mayor and commissioners with titles and districts. This is what powers “accountable here” and every district breakdown. Leaders can be edited by hand if someone is wrong or out of date.</li>
              <li><strong>Metrics.</strong> Covered under Metrics and templates.</li>
              <li><strong>Datasets.</strong> The same catalog, filtered to Miami.</li>
              <li><strong>Newsletters.</strong> Miami’s editions and subscriber settings.</li>
            </ul>
            <p>
              <strong>The Structure tab has powerful buttons.</strong> “Refresh structure data” re-reads what is already
              saved (safe). “Re-create structure from query configs” deletes Miami’s districts and leaders and downloads
              them again (not safe unless you mean it). See Handle with care.
            </p>
          </div>
        </section>

        {/* Everything else */}
        <section id="rest" className={styles.section}>
          <div className={styles.secHead}>
            <span className={styles.eyebrow}>For completeness</span>
            <h2>Everything else in the menu</h2>
            <p className={styles.why}>Platform-wide tools. Good to know what they are. None of them is required for Miami work.</p>
          </div>
          <div className={styles.tablewrap}>
            <table>
              <thead>
                <tr><th>Item</th><th>What it is</th><th>When you would open it</th></tr>
              </thead>
              <tbody>
                <tr><td><b>Job Logs</b></td><td>Every background job: metric runs, template instantiations, story generation, newsletter sends. Status, progress, error messages, and the scheduled jobs that trigger them. You can also create a custom scheduled job (for example, a weekly Miami research prompt that produces stories).</td><td>When something you asked for did not appear, or to see what ran overnight.</td></tr>
                <tr><td><b>Research reports</b></td><td>Deep, multi-source investigations. Start one from chat: “Research whether Miami’s permit backlog is concentrated in particular districts.” Seymour asks a few narrowing questions, then works for a while and produces a report you can turn into stories.</td><td>When a question is bigger than one chat can answer.</td></tr>
                <tr><td><b>Dashboard</b> (Data group)</td><td>Product analytics: active users, signup funnel, retention, daily LLM cost, top events.</td><td>Curiosity. Nothing Miami-specific to do here yet.</td></tr>
                <tr><td><b>Users</b></td><td>Every account, role, verification status, city lead assignments. This is where Adam made you a city lead.</td><td>If a Miami official signs up and needs verifying. Ask Adam first.</td></tr>
                <tr><td><b>Sitemap</b></td><td>Every public URL the site generates, per city.</td><td>To find the public link for a Miami page.</td></tr>
                <tr><td><b>API Documentation</b></td><td>The backend’s interactive API reference. You are technical, so this may be interesting.</td><td>If you want to script something.</td></tr>
                <tr><td><b>Settings</b></td><td>Your own preferences: dark mode, newsletter and alert subscriptions, re-run onboarding, newsletter testing (send yourself a sample).</td><td>Subscribe yourself to Miami’s newsletter and anomaly alerts.</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Handle with care */}
        <section id="care" className={styles.section}>
          <div className={styles.secHead}>
            <span className={styles.eyebrow}>Guardrails, since there are none</span>
            <h2>What to handle with care</h2>
            <p className={styles.why}>
              Adam said it plainly: there are not the safeguards you would expect. This is the honest map of what is
              reversible and what is not.
            </p>
          </div>
          <div className={styles.safety}>
            <div className={styles.box}>
              <h4><span className={styles.dot} style={{ background: "var(--success)" }} />Do freely</h4>
              <ul>
                <li>Ask Seymour any analysis question</li>
                <li>Instantiate templates for Miami</li>
                <li>Execute (re-run) a Miami metric</li>
                <li>Create stories, run anomaly detection</li>
                <li>Generate a sample newsletter</li>
                <li>Reorder or hide metrics in Display Settings (instantly public, instantly reversible)</li>
                <li>Read any panel, any city</li>
              </ul>
            </div>
            <div className={styles.box}>
              <h4><span className={styles.dot} style={{ background: "var(--warning)" }} />Think first</h4>
              <ul>
                <li>Creating a non-template metric (fine, but ask whether a template exists)</li>
                <li>Editing a metric’s query or definition</li>
                <li>Editing or deleting a story (it may already be in a newsletter)</li>
                <li>Editing a city leader’s record</li>
                <li>“Run all templates” (slow and costs money; once is fine)</li>
                <li>Creating scheduled jobs</li>
              </ul>
            </div>
            <div className={styles.box}>
              <h4><span className={styles.dot} style={{ background: "var(--error)" }} />Ask Adam or Rob</h4>
              <ul>
                <li>Deleting a metric or “clear metric data”</li>
                <li>“Re-create structure from query configs”</li>
                <li>Anything under Metrics → Templates that edits a template (affects all cities)</li>
                <li>Newsletter Prompts or scoring config</li>
                <li>Users: roles, verification, deletion</li>
                <li>Anything in a city that is not Miami</li>
              </ul>
            </div>
          </div>
          <div className={`${styles.callout} ${styles.calloutDanger}`}>
            <div className={styles.t}>Seymour does not ask twice</div>
            <p>
              “Delete the ShotSpotter metric” will delete it, with its history. If you want to hide something, use Display
              Settings instead. If you want to test whether a metric is broken, use Execute, not Clear.
            </p>
          </div>
          <p className={styles.fine}>
            Every metric change you make as a city lead is written to an audit log with your name on it, so nothing is
            anonymous and most things can be reconstructed. Rebuilding lost data is still slow. When in doubt, text Adam.
          </p>
        </section>

        {/* Challenge */}
        <section id="challenge" className={styles.section}>
          <div className={styles.secHead}>
            <span className={styles.eyebrow}>Why you are here</span>
            <h2>Your challenge</h2>
            <p className={styles.why}>
              One problem in Miami that Transparent City’s data can help improve. Here are some concrete places to start
              looking, each answerable with the tools above.
            </p>
          </div>
          <ul className={styles.checklist}>
            <li><span className={styles.bx} /><div><b>A place not getting its share of service.</b> Ask Seymour to map police calls for service and permit activity by commission district, then look for the district where response is slowest or activity has stalled.</div></li>
            <li><span className={styles.bx} /><div><b>A broken feed.</b> The KSI traffic crashes metric shows no 2026 data. Is Miami’s crash dataset lagging, renamed, or moved? That alone is a story if it turns out the city stopped publishing.</div></li>
            <li><span className={styles.bx} /><div><b>A missing metric residents would want.</b> 311 requests, code enforcement, park maintenance, transit, flooding and sea level, building inspections. Ask Seymour what Miami actually publishes on each topic and how current it is.</div></li>
            <li><span className={styles.bx} /><div><b>A trend nobody has noticed.</b> Residential permits filed are down 59 percent year to date while permits issued are up 9 percent. Is that a policy change, a data artifact, or a real slowdown coming? Research it.</div></li>
            <li><span className={styles.bx} /><div><b>Something you already care about.</b> The best problem is the one you would want answered as a resident. Ask it. If the data is not there yet, that becomes the metric to build.</div></li>
          </ul>
          <p className={styles.fine}>
            When you find something, write it up as a story or a research report so it lands in the feed and the
            newsletter. That is the loop: data, then a finding, then published, then residents and officials see it.
          </p>
        </section>

        {/* Cheat sheet */}
        <section id="cheatsheet" className={styles.section}>
          <div className={styles.secHead}>
            <span className={styles.eyebrow}>Keep this handy</span>
            <h2>Prompt cheat sheet</h2>
            <p className={styles.why}>Copy, paste, adjust. All of these go in New Chat.</p>
          </div>
          <div className={styles.tablewrap}>
            <table>
              <thead>
                <tr><th>Goal</th><th>Say to Seymour</th></tr>
              </thead>
              <tbody>
                <tr><td>See what exists</td><td>List all active metrics for Miami with their last run status and last data date.</td></tr>
                <tr><td>Find what to add</td><td>Which Miami datasets are catalogued but not used by any metric? Which three would make the best new metrics, and does a template exist for any of them?</td></tr>
                <tr><td>Add one</td><td>Instantiate the [template name] template for Miami and tell me which dataset and fields you used.</td></tr>
                <tr><td>Fix a stale one</td><td>Check freshness for Miami’s KSI traffic crashes metric. If the dataset changed, find the replacement and update the metric.</td></tr>
                <tr><td>Compare cities</td><td>Rank every launched city by year-to-date change in demolition permits and highlight Miami.</td></tr>
                <tr><td>Look by district</td><td>Show Miami police calls for service by commission district for the last 12 months, as a map and a table.</td></tr>
                <tr><td>Find anomalies</td><td>Run anomaly detection on all Miami metrics for the last 90 days and show me the three most significant.</td></tr>
                <tr><td>Write a story</td><td>Write a story about [finding] in Miami. Include the year-to-date chart and cite the dataset.</td></tr>
                <tr><td>Go deep</td><td>Create a research report on [question] in Miami.</td></tr>
                <tr><td>Automate it</td><td>Create a weekly scheduled job for Miami that looks for permit anomalies by district and writes stories about significant ones.</td></tr>
                <tr><td>Preview Sunday</td><td>Generate a sample Miami newsletter for this week and show it to me.</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <footer className={styles.footer}>
          <span>Transparent City · internal guide for the Miami city admin</span>
          <span>Questions: Adam or Rob, any time</span>
        </footer>
      </div>
    </div>
  );
}

function Prompt({ text, note }: { text: string; note: string }) {
  return (
    <div className={styles.prompt}>
      <span className={styles.q}>?</span>
      <div className={styles.txt}>
        {text}
        <small>{note}</small>
      </div>
    </div>
  );
}

function Stage({ l, h, d }: { l: string; h: string; d: string }) {
  return (
    <div className={styles.st}>
      <span className={styles.l}>{l}</span>
      <span className={styles.h}>{h}</span>
      <span className={styles.d}>{d}</span>
    </div>
  );
}
