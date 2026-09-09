"use client";

import Link from "next/link";
import {
  ADMIN_MENU_GROUPS,
  ADMIN_API_DOCS_ICON,
  ADMIN_GUIDE_ICON,
  ADMIN_SITEMAP_ICON,
} from "@/lib/adminMenuItems";
import type { CityGuide } from "./guideContent";
import styles from "./AdminGuide.module.css";

/**
 * City admin field guide. The explanation of how the platform works is shared;
 * everything city-specific comes from the CityGuide passed in (guideContent.tsx).
 *
 * The admin-menu mockup renders the real ADMIN_MENU_GROUPS definition so it
 * cannot drift from the menu behind the green avatar.
 */

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

function sections(g: CityGuide): Array<{ id: string; label: string; hook: string }> {
  return [
    { id: "start", label: "Start here", hook: "your first 20 minutes" },
    { id: "how", label: "How it fits together", hook: "one picture" },
    { id: "screen", label: "The screen", hook: "nav and menu" },
    { id: "seymour", label: "Seymour", hook: "the agent you talk to" },
    { id: "dashboard", label: `The ${g.cityName} dashboard`, hook: "admin tabs" },
    { id: "metrics", label: "Metrics and templates", hook: `how ${g.cityName} grows` },
    { id: "stories", label: "Stories and the Feed", hook: "what residents read" },
    { id: "newsletter", label: "The Sunday newsletter", hook: "weekly product" },
    { id: "data", label: "Data and city structure", hook: "under the hood" },
    { id: "rest", label: "Everything else", hook: "for completeness" },
    { id: "care", label: "Handle with care", hook: "reversible vs not" },
    { id: "challenge", label: "What to dig into", hook: "where to start" },
    { id: "cheatsheet", label: "Prompt cheat sheet", hook: "copy, paste" },
  ];
}

function Tag({ kind }: { kind: "useful" | "rarely" }) {
  return (
    <span className={`${styles.tag} ${kind === "useful" ? styles.tagHi : styles.tagLo}`}>{kind}</span>
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

function SchematicFigure({ g }: { g: CityGuide }) {
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
          aria-label={`Schematic: ${g.cityName}'s open-data portal is fetched into a dataset catalog; metrics built from shared templates query those datasets; anomaly detection finds spikes in the metrics; Seymour writes and judges stories from the anomalies; stories publish to the ${g.cityName} dashboard, individual story pages and the Sunday newsletter, which reach residents, reporters and officials. Seymour operates every stage, scheduled jobs trigger it nightly and weekly, and the city manager directs Seymour and edits display settings, stories, leaders and districts.`}
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

          {box(20, 20, 150, 60, "You", "chat, panels, gear icon")}
          {box(230, 20, 650, 60, "Seymour, the agent", "finds datasets · builds metrics · spots anomalies · writes stories and the newsletter", undefined, { accent: true })}
          {box(900, 20, 170, 60, "Scheduled jobs", "nightly metrics, weekly stories", undefined, { dashed: true })}
          {arrow(170, 50, 228, 50, "asks, directs", 199, 41)}
          {arrow(898, 50, 882, 50)}
          <text x={890} y={13} textAnchor="middle" fontSize={L} fill="currentColor" opacity={0.85}>triggers</text>

          {arrow(300, 80, 300, 170, "catalogs", 308, 130, { accent: true, dashed: true, anchor: "start" })}
          {arrow(470, 80, 470, 170, "builds, runs", 478, 130, { accent: true, dashed: true, anchor: "start" })}
          {arrow(640, 80, 640, 170, "detects", 648, 130, { accent: true, dashed: true, anchor: "start" })}
          {arrow(810, 80, 810, 170, "writes, judges", 818, 130, { accent: true, dashed: true, anchor: "start" })}

          {box(20, 172, 130, 78, "Open-data portal", `${g.portal}, run by`, `the City of ${g.cityName}`)}
          {arrow(150, 211, 228, 211, "fetched", 189, 202)}
          {box(230, 172, 140, 78, "Datasets", `${g.datasetsCount} catalogued`, "Datasets panel")}
          {arrow(370, 211, 398, 211)}
          {box(400, 172, 140, 78, "Metrics", `${g.metricsCount} live today`, "shared templates")}
          {arrow(540, 211, 568, 211)}
          {box(570, 172, 140, 78, "Anomalies", "spikes and drops", "Alerts tab")}
          {arrow(710, 211, 738, 211)}
          {box(740, 172, 140, 78, "Stories", "drafted, then", "judged for accuracy")}

          <line x1={810} y1={250} x2={810} y2={302} stroke="currentColor" strokeWidth={1.5} />
          <line x1={500} y1={302} x2={810} y2={302} stroke="currentColor" strokeWidth={1.5} />
          <text x={655} y={294} textAnchor="middle" fontSize={L} fill="currentColor" opacity={0.85}>published to</text>
          {arrow(500, 302, 500, 330)}
          {arrow(640, 302, 640, 330)}
          {arrow(810, 302, 810, 330)}
          {arrow(440, 250, 440, 330, "tables, charts", 432, 294, { anchor: "end" })}

          {box(400, 332, 140, 78, `${g.cityName} dashboard`, "Overview · All metrics", `transparent.city/c/${g.citySlug}`)}
          {box(570, 332, 140, 78, "Story pages", "one public page", "per story")}
          {box(740, 332, 140, 78, "Sunday newsletter", "shared edition, or", "personalized per reader")}

          <rect x={400} y={444} width={480} height={36} rx={8} fill="currentColor" fillOpacity={0.08} stroke="none" />
          <text x={640} y={467} textAnchor="middle" fontSize={T} fontWeight={600} fill="currentColor">
            {g.cityName} residents, reporters and officials
          </text>
          {arrow(470, 410, 470, 442)}
          {arrow(640, 410, 640, 442)}
          {arrow(810, 410, 810, 442)}

          {box(20, 332, 150, 78, "You also edit", "dashboard order, stories,", "leaders and districts", { dashed: true })}
          {arrow(170, 371, 398, 371, "display settings", 284, 362)}
        </svg>
      </div>
      <figcaption className={styles.figcaption}>
        Solid arrows are data moving. Dashed purple arrows are Seymour acting on a stage. Everything in the
        middle and bottom rows is visible to you in the admin menu; everything in the bottom row is visible
        to the public.
      </figcaption>
    </figure>
  );
}

function ScreenMockup({ g }: { g: CityGuide }) {
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
          <div className={`${styles.navSub} ${styles.navSubActive}`}>
            {g.cityEmoji} {g.cityName}
          </div>
          <div className={styles.navSub}>District 4</div>
          <div className={styles.navSect}><span>Research reports</span><span>▸</span></div>
          <div className={styles.navSect}><span>Recent chats</span><span>▸</span></div>
          <div className={styles.navSect}><span>Suggested questions</span><span>▾</span></div>
          <div className={styles.navQ}>Which neighborhood in {g.cityName} is the safest?</div>
          <div className={styles.navQ}>What are the crime trends in {g.cityName}?</div>
          <div className={styles.navSect}><span>Job sessions</span><span>▸</span></div>
          <div className={styles.navFoot}>
            <span className={styles.bubble}>{g.personFirst.slice(0, 1)}</span>
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
              {g.cityEmoji} {g.cityName} <small>{g.mayor}</small>
            </div>
            <div className={styles.map} />
            <div className={styles.chips}>
              <span className={`${styles.pill} ${styles.pillBrand}`}>New this week</span>
              <span className={`${styles.pill} ${styles.pillNeutral}`}>Following</span>
            </div>
          </div>
        </div>
      </div>
      <p className={styles.fine}>
        A sketch of the home screen as an admin. The green circle at the bottom left is the admin menu. The
        four tabs across the top (Overview, All metrics, Map, Alerts) only appear for admins.
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
      <div className={styles.mi}><span /><span>Settings</span><span /></div>
      <div className={styles.mi}><span /><span>Logout</span><span /></div>
    </div>
  );
}

export default function AdminGuide({ guide: g }: { guide: CityGuide }) {
  const totalMetrics = g.metricRows.reduce((n, r) => n + r.count, 0);

  return (
    <div className={styles.shell}>
      <div className={styles.topbar}>
        <Link href="/home" className={styles.back}>
          <span aria-hidden="true">←</span> Back to Transparent City
        </Link>
        <span className={styles.crumb}>
          Admin <b>· {g.cityName} guide</b>
        </span>
      </div>

      <div className={styles.page}>
        <header className={styles.masthead}>
          <div className={styles.mastTop}>
            <span className={styles.wordmark}>
              <span>
                {g.cityEmoji} {g.cityName} on
              </span>
              <span>
                transparent<span className={styles.city}>.city</span>
              </span>
            </span>
            <span className={styles.roleChip}>{g.roleChip}</span>
          </div>
          <h1>The {g.cityName} Field Guide</h1>
          <p className={styles.lede}>{g.lede}</p>
          {g.welcome && <p className={styles.lede}>{g.welcome}</p>}
          <div className={styles.meta}>
            <span>
              <b>Your city:</b> {g.cityName}, {g.unitCount} {g.unitPlural}
            </span>
            <span>
              <b>Public page:</b>{" "}
              <a href={`https://transparent.city/c/${g.citySlug}`} target="_blank" rel="noopener noreferrer">
                transparent.city/c/{g.citySlug}
              </a>
            </span>
            <span>
              <b>Written:</b> {g.snapshotDate}
            </span>
          </div>
        </header>

        <nav className={styles.contents} aria-label="Contents">
          <span className={styles.eyebrow}>Jump to a section, in priority order</span>
          <ol>
            {sections(g).map((s, i) => (
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
              The fastest way to understand this is to make it answer a question you already have. This
              sequence touches every major piece once.
            </p>
          </div>
          <ol className={styles.steps}>
            {g.firstSteps.map((s) => (
              <li key={s.title}>
                <div>
                  <b>{s.title}.</b> {s.body}
                </div>
              </li>
            ))}
          </ol>
          <div className={`${styles.callout} ${styles.calloutOk}`}>
            <div className={styles.t}>The one rule</div>
            <p>
              Stay inside {g.cityName}. Your admin menu shows every city on the platform, and nothing stops
              you from changing another one. Nothing in this guide asks you to.
            </p>
          </div>
          {g.caveats && (
            <div className={`${styles.callout} ${styles.calloutWarn}`}>
              <div className={styles.t}>{g.caveats.title}</div>
              <p>{g.caveats.body}</p>
            </div>
          )}
        </section>

        {/* How it fits together */}
        <section id="how" className={styles.section}>
          <div className={styles.secHead}>
            <span className={styles.eyebrow}>The whole machine</span>
            <h2>How it fits together</h2>
            <p className={styles.why}>
              Data flows left to right, from {g.cityName}&apos;s open-data portal to a resident&apos;s inbox.
              Seymour does the work at every stage. Scheduled jobs keep it moving without anyone asking. You
              steer.
            </p>
          </div>
          <SchematicFigure g={g} />
          <div className={styles.prose}>
            <p>
              <strong>The key idea:</strong> nothing reaches a resident that did not start as a metric. If
              you want {g.cityName}&apos;s feed and newsletter to be richer, the lever is more and better
              metrics. If you want them to be more accurate, the lever is checking stories before Sunday.
              Both are conversations with Seymour.
            </p>
          </div>
        </section>

        {/* The screen */}
        <section id="screen" className={styles.section}>
          <div className={styles.secHead}>
            <span className={styles.eyebrow}>Orientation</span>
            <h2>The screen, and where the tools are</h2>
            <p className={styles.why}>
              Almost everything lives in two places: the left nav, and the menu behind the green circle at
              the bottom of it.
            </p>
          </div>
          <ScreenMockup g={g} />
          <div className={styles.prose}>
            <h3>The left nav, top to bottom</h3>
            <ul className={styles.plain}>
              <li><strong>Feed.</strong> Every story on the platform, all cities, newest first. Useful for seeing what good looks like in the older cities.</li>
              <li><strong>New Chat.</strong> Opens a conversation with Seymour. This is the door to most of your powers.</li>
              <li><strong>Search Cities.</strong> Jump to any city. You will mostly ignore this.</li>
              <li><strong>My Places.</strong> Cities, districts and saved spots you follow. {g.cityName} is here, and you can add your own neighborhood with a pin and a radius you set.</li>
              <li><strong>Research reports.</strong> Long-form investigations Seymour has run. You can start new ones from a chat.</li>
              <li><strong>Recent chats.</strong> Your past conversations. Nothing is lost when you close one.</li>
              <li><strong>Suggested questions.</strong> Starter prompts that adapt to the city you are looking at. Click one to send it.</li>
              <li><strong>Job sessions.</strong> Chats started by scheduled background jobs rather than a person. This is how you read what Seymour was thinking when it wrote a story overnight.</li>
              <li><strong>The green circle.</strong> Your avatar. Click it for the admin menu below, plus Settings and Logout.</li>
            </ul>
          </div>
          <h3>The admin menu (the green circle)</h3>
          <div className={styles.menuExplain}>
            <MenuMockup />
            <dl>
              <div>
                <dt>Data group</dt>
                <dd>Everything about what {g.cityName} <em>is</em>: its boundaries and {g.unitPlural}, its open-data portal, the datasets pulled from it, and the metrics computed on top.</dd>
              </div>
              <div>
                <dt>Workflows group</dt>
                <dd>Everything Seymour <em>produces</em> on a schedule: stories, the newsletter, replies to reader email, and the logs of the jobs that made them.</dd>
              </div>
              <div>
                <dt>Tagged &ldquo;useful&rdquo;</dt>
                <dd>The panels you will actually open in your first weeks. The rest are platform-wide tools that are safe to ignore.</dd>
              </div>
              <div>
                <dt>Prefer the chat</dt>
                <dd>Most of what these panels do, Seymour can do for you in plain English. The panels are for when you want the full list, one exact button, or to check what a job did.</dd>
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
              Seymour is the AI agent that runs Transparent City. It answers questions, but it also builds
              things: metrics, maps, stories, research reports. Talking to it is the primary interface.
            </p>
          </div>
          <div className={styles.prose}>
            <p>
              <strong>What it is.</strong> A conversational agent with about 90 tools behind it. When you ask
              something, it decides which to use: query {g.cityName}&apos;s open-data portal, pull a
              metric&apos;s history, run anomaly detection, draw a chart or map, create a story. You watch
              each step unfold in the chat, so you can follow its reasoning and catch mistakes.
            </p>
            <p>
              <strong>Its house rule is show, don&apos;t tell.</strong> It is instructed to always chart or
              map the data it is discussing. If it gives you a number without a picture, ask for the chart.
            </p>
            <p>
              <strong>Two modes of question.</strong> Analysis questions (&ldquo;what is happening with
              X?&rdquo;) are safe and cheap to ask as often as you like. Build questions (&ldquo;create a
              metric for X&rdquo;) change what residents see. Handle with care covers which builds to be
              careful with.
            </p>
            <p>
              <strong>You cannot break it by asking.</strong> Nothing in a normal question damages anything.
              The risky verbs are delete, clear, and re-create, and they are all listed further down.
            </p>
          </div>
          <h3>Good questions to start with</h3>
          <p className={styles.why}>{g.promptsIntro}</p>
          <div className={styles.prompts}>
            {g.prompts.map((p) => (
              <div className={styles.prompt} key={p.text}>
                <span className={styles.q}>?</span>
                <div className={styles.txt}>
                  {p.text}
                  <small>{p.note}</small>
                </div>
              </div>
            ))}
          </div>
          <div className={styles.callout}>
            <div className={styles.t}>How to get better answers</div>
            <p>
              Name the city and the time window. Ask for the chart or map explicitly. If it grabs the wrong
              dataset, tell it the dataset name from the Datasets panel. Long questions are fine, and
              follow-ups in the same chat keep the context. If an answer looks wrong, say so and ask it to
              check.
            </p>
          </div>
          <div className={`${styles.callout} ${styles.calloutWarn}`}>
            <div className={styles.t}>It will do what you ask, including destructive things</div>
            <p>
              Seymour can delete a metric, clear its data, or restructure the city if you tell it to. There
              is no confirmation step. Read Handle with care before asking it to remove or rebuild anything.
            </p>
          </div>
        </section>

        {/* Dashboard */}
        <section id="dashboard" className={styles.section}>
          <div className={styles.secHead}>
            <span className={styles.eyebrow}>What residents see</span>
            <h2>The {g.cityName} dashboard</h2>
            <p className={styles.why}>
              This is the public product. Residents see the Overview. As an admin you also get three more
              tabs and a gear icon that opens {g.cityName}&apos;s settings without leaving the page.
            </p>
          </div>
          <div className={styles.tablewrap}>
            <table>
              <thead>
                <tr><th>Tab</th><th>What it shows</th><th>Who sees it</th></tr>
              </thead>
              <tbody>
                <tr><td><b>Overview</b></td><td>The briefing: map, what moved this week, new stories, and the &ldquo;accountable here&rdquo; list of elected officials. This is what a resident gets.</td><td>Everyone</td></tr>
                <tr><td><b>All metrics</b></td><td>Every active metric with a year-to-date comparison, grouped by category. Click any metric for its detail page with charts, {g.unit} breakdowns and maps.</td><td>Admins (residents reach it via a toggle)</td></tr>
                <tr><td><b>Map</b></td><td>{g.cityName}&apos;s metrics on a map, by {g.unit} or neighborhood, with a timeline slider.</td><td>Admins</td></tr>
                <tr><td><b>Alerts</b></td><td>Anomalies across {g.cityName}&apos;s metrics: sudden spikes or drops, citywide or by {g.unit}. Story ideas start here.</td><td>Admins</td></tr>
              </tbody>
            </table>
          </div>
          <div className={styles.prose}>
            <p>
              <strong>Scope it to where you live.</strong> The dashboard can be filtered to a {g.unit}, or to
              a saved place: a pin with a radius you set yourself. Drag the radius to match your actual
              neighborhood rather than a default circle.
            </p>
            <p>
              <strong>The gear icon next to the city name.</strong> It opens a drawer with{" "}
              {g.cityName}&apos;s admin settings: city information, structure, metrics, datasets and
              newsletters, without leaving the dashboard.
            </p>
            <p>
              <strong>Metric detail pages.</strong> Clicking a metric opens a full page with time series,{" "}
              {g.unit} comparisons, a map, and source attribution. Admins also get a row of actions there:
              execute (re-run now), edit, view anomalies, view maps, clear data, delete.
            </p>
          </div>
          <h3>What {g.cityName} tracks today</h3>
          <div className={styles.tablewrap}>
            <table>
              <thead>
                <tr><th>Category</th><th>Metrics on the dashboard</th><th className={styles.num}>Count</th></tr>
              </thead>
              <tbody>
                {g.metricRows.map((r) => (
                  <tr key={r.category}>
                    <td>{r.category}</td>
                    <td>{r.metrics}</td>
                    <td className={styles.num}>{r.count}</td>
                  </tr>
                ))}
                <tr>
                  <td><b>Total</b></td>
                  <td />
                  <td className={styles.num}><b>{totalMetrics}</b></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className={styles.fine}>
            Snapshot from {g.snapshotDate}. {g.cityName} also has {g.datasetsCount} datasets catalogued from
            its {g.portal} open-data portal.
          </p>
        </section>

        {/* Metrics */}
        <section id="metrics" className={styles.section}>
          <div className={styles.secHead}>
            <span className={styles.eyebrow}>Growing {g.cityName}</span>
            <h2>Metrics and templates</h2>
            <p className={styles.why}>
              A metric is a number we compute from a city dataset on a schedule and track over time.
              Templates are metric definitions shared across every city, so {g.cityName}&apos;s version is
              directly comparable to San Francisco&apos;s.
            </p>
          </div>
          <div className={styles.prose}>
            <p>
              <strong>Why templates matter.</strong> Every city publishes its data differently, with
              different vendors and no common definitions. A template says &ldquo;count of X, by day, by
              district&rdquo; once, and Seymour maps that onto each city&apos;s own fields. That is what
              makes cross-city comparison possible, and it is why filling in templates usually beats
              inventing one-off metrics.
            </p>
            <p>
              <strong>Where {g.cityName} stands.</strong> {g.standing}
            </p>
          </div>
          <div className={styles.pipe} aria-label="How a metric goes from idea to dashboard">
            <Stage l="Ask" h="Say what you want" d="In plain English, in a chat. A template name or a description both work." />
            <Stage l="Map" h="Seymour finds the data" d="It searches the portal, matches fields, writes the query. This runs as a background job." />
            <Stage l="Run" h="It computes history" d="Check status, last run and last data date in the Metrics tab." />
            <Stage l="Show" h="Turn it on" d="Show on Dashboard and the ordering are controlled in Display Settings." />
            <Stage l="Watch" h="Anomalies and stories" d="Once it has history, spikes get detected and stories can be written about them." />
          </div>
          <h3>Two ways to do it</h3>
          <div className={styles.prose}>
            <p>
              <strong>Through Seymour (recommended).</strong> &ldquo;Create a 311 metric for just potholes in{" "}
              {g.cityName}&rdquo; is a complete instruction. It finds the dataset, handles the messy field,
              and reports back. Then ask it to confirm the numbers make sense. That check is worth doing
              every time.
            </p>
            <p>
              <strong>Through the panel.</strong> Admin menu → <b>City Data</b> → search {g.cityName} → click
              into it → <b>Metrics</b> tab. Four sub-sections:
            </p>
            <ul className={styles.plain}>
              <li><strong>Metrics.</strong> Every metric with status, last run, last data date, record counts. Click one for its chart and an Execute button.</li>
              <li><strong>Templates.</strong> The shared catalog, with a badge showing how many are not yet set up here. You can try one at a time, or all the missing ones at once.</li>
              <li><strong>Display Settings.</strong> Which metrics appear on the public dashboard and in what order. The most visible change you can make, and instantly reversible.</li>
              <li><strong>Inactive &amp; Cleanup.</strong> Metrics that failed or were turned off. Safe to leave alone.</li>
            </ul>
            <p>
              <strong>The platform-wide Metrics panel</strong> (admin menu → Metrics) shows all cities
              together with filters. Good for cross-city views. Do not edit templates there: a template edit
              changes every city that uses it.
            </p>
          </div>
          <div className={styles.callout}>
            <div className={styles.t}>How metrics stay fresh</div>
            <p>
              Each metric has a schedule and re-runs on its own. If one shows &ldquo;No data&rdquo; or a last
              data date weeks old, the city&apos;s dataset has probably lagged or changed shape. Ask Seymour
              to check freshness, or open the metric and hit Execute. If it keeps failing, that is a real
              finding: the city&apos;s feed broke.
            </p>
          </div>
        </section>

        {/* Stories */}
        <section id="stories" className={styles.section}>
          <div className={styles.secHead}>
            <span className={styles.eyebrow}>What people read</span>
            <h2>Stories and the Feed</h2>
            <p className={styles.why}>
              A story is a short, sourced piece Seymour writes about something notable in the data, with a
              chart or map. Stories appear on the dashboard, get their own public page, and feed the
              newsletter. Think of them as leads, not finished reporting.
            </p>
          </div>
          <div className={styles.pipe} aria-label="How stories get made">
            <Stage l="Input" h="Metrics" d="Anything with enough history." />
            <Stage l="Detect" h="Anomalies" d="Moves beyond three standard deviations from a metric's own history. Visible under Alerts." />
            <Stage l="Write" h="Seymour drafts" d="Headline, summary, article, chart. Scheduled jobs do this overnight; you can also ask in chat." />
            <Stage l="Judge" h="Accuracy check" d="A second model scores the draft against its own trace. 4 or higher is newsletter-eligible." />
            <Stage l="Publish" h="Dashboard, page, newsletter" d={`Public URL: /c/${g.citySlug}/stories/…`} />
          </div>
          <div className={styles.prose}>
            <p>
              <strong>There is noise in the alerts.</strong> A weekly spike in a small number is often
              nothing. That is expected: the alerts are a wide net, and your judgment is the filter. The ones
              worth keeping are the ones you would want to ask a department about.
            </p>
            <p>
              <strong>Making a story yourself.</strong> In chat: &ldquo;Write a story about [finding] in{" "}
              {g.cityName}, with the chart.&rdquo; Or from a research report: &ldquo;Generate feed stories
              from this research.&rdquo; It appears on the dashboard within a minute.
            </p>
            <p>
              <strong>The Feed admin panel</strong> (admin menu → Feed) is the editorial desk. Filter by city
              to {g.cityName}. For each story you see views, likes, clicks, the accuracy score, and which job
              or chat created it. From there you can edit a headline, delete a story, force one into the
              newsletter, or ask Seymour to make a minimal factual fix.
            </p>
            <p>
              <strong>Seymour&apos;s Inbox</strong> (admin menu → Seymour&apos;s Inbox) is different: reader
              email. When someone replies to a newsletter, it lands here and Seymour can draft a reply for you
              to approve.
            </p>
          </div>
          <div className={styles.callout}>
            <div className={styles.t}>Check before you share</div>
            <p>
              Read a story&apos;s numbers against the metric page before you cite it anywhere. The accuracy
              check catches most errors, not all. If something is wrong, use the fix option in the Feed panel
              or delete the story. Every story is public the moment it exists.
            </p>
          </div>
        </section>

        {/* Newsletter */}
        <section id="newsletter" className={styles.section}>
          <div className={styles.secHead}>
            <span className={styles.eyebrow}>The weekly product</span>
            <h2>The Sunday newsletter</h2>
            <p className={styles.why}>
              Every Sunday, subscribers in {g.cityName} get an email built from that week&apos;s eligible
              stories and the metrics that moved, personalized for readers who saved a specific neighborhood.
            </p>
          </div>
          <div className={styles.prose}>
            <p>
              <strong>How it is assembled.</strong> A weekly job scores the week&apos;s stories, picks a
              slate, and asks Seymour to write the edition. Readers with no saved places get the shared
              edition. Readers who saved a neighborhood get their own version with that place&apos;s numbers.
              Editions are archived publicly at <code>/c/{g.citySlug}/newsletter/&lt;date&gt;</code>.
            </p>
            <p><strong>The Newsletters panel</strong> (admin menu → Newsletters) has tabs:</p>
            <ul className={styles.plain}>
              <li><strong>Dashboard.</strong> Subscriber count, sends this week, stories scored today, unsent drafts.</li>
              <li><strong>Workbench.</strong> The scored candidates for the coming edition, and a button to generate a sample right now so you can read what next Sunday would look like. This is the tab to use.</li>
              <li><strong>Queue and Sends.</strong> Pending sends awaiting review, and the log of what went out.</li>
              <li><strong>Subscribers.</strong> Who is signed up, by city and frequency.</li>
              <li><strong>Prompts.</strong> The instructions Seymour follows when writing. Editing these changes the voice for every city, so leave them unless you have talked to Adam.</li>
            </ul>
            <p>
              <strong>What you control.</strong> Mostly the inputs: the more good stories {g.cityName} has by
              Saturday, the better the Sunday email.
            </p>
          </div>
        </section>

        {/* Data */}
        <section id="data" className={styles.section}>
          <div className={styles.secHead}>
            <span className={styles.eyebrow}>Under the hood</span>
            <h2>Data and city structure</h2>
            <p className={styles.why}>
              Where {g.cityName}&apos;s numbers come from, and how the city is divided up. You will read
              these panels often and change them rarely.
            </p>
          </div>
          <div className={styles.prose}>
            <p>
              <strong>Datasets</strong> (admin menu → Datasets). The catalog of open-data sources pulled from{" "}
              {g.cityName}&apos;s portal: {g.datasetsCount} today, each with its portal ID, department,
              category, row count, update frequency and fetch status. When Seymour builds a metric, it picks
              from this list. If a dataset you know exists is missing, ask Seymour to find and add it. If one
              shows an error, that is often a portal-side change worth reporting.
            </p>
            <p><strong>City Data → {g.cityName}</strong> is the per-city control panel with five tabs:</p>
            <ul className={styles.plain}>
              <li><strong>Data.</strong> City information, statistics, and buttons to reload datasets and metadata.</li>
              <li><strong>Structure.</strong> {g.cityName}&apos;s geography and government: {g.unitPlural} as map shapes, neighborhoods, and elected officials with titles and districts. This is what powers &ldquo;accountable here&rdquo; and every {g.unit} breakdown. If a boundary or a name is wrong, this is where it gets fixed, and telling us is genuinely useful.</li>
              <li><strong>Metrics.</strong> Covered above.</li>
              <li><strong>Datasets.</strong> The same catalog, filtered to this city.</li>
              <li><strong>Newsletters.</strong> This city&apos;s editions and subscriber settings.</li>
            </ul>
            <p>
              <strong>The Structure tab has powerful buttons.</strong> Refresh structure data re-reads what is
              already saved, which is safe. Re-create structure from query configs deletes the{" "}
              {g.unitPlural} and officials and downloads them again, which is not, unless you mean it.
            </p>
          </div>
        </section>

        {/* Everything else */}
        <section id="rest" className={styles.section}>
          <div className={styles.secHead}>
            <span className={styles.eyebrow}>For completeness</span>
            <h2>Everything else in the menu</h2>
            <p className={styles.why}>Platform-wide tools. Good to know they exist. None is required for city work.</p>
          </div>
          <div className={styles.tablewrap}>
            <table>
              <thead>
                <tr><th>Item</th><th>What it is</th><th>When you would open it</th></tr>
              </thead>
              <tbody>
                <tr><td><b>Job Logs</b></td><td>Every background job: metric runs, story generation, newsletter sends. Status, progress, error messages, and the schedules that trigger them. You can also create a recurring job, for example a weekly research prompt that produces stories.</td><td>When something you asked for did not appear, or to see what ran overnight.</td></tr>
                <tr><td><b>Research reports</b></td><td>Deep, multi-source investigations. Start one from chat. Seymour asks a few narrowing questions, works for a while, then produces a report you can turn into stories or pull into your own writing.</td><td>When a question is bigger than one chat can answer.</td></tr>
                <tr><td><b>Dashboard</b> (Data group)</td><td>Product analytics: active users, signup funnel, retention, daily model cost.</td><td>Curiosity.</td></tr>
                <tr><td><b>Users</b></td><td>Every account, role, verification status, and city assignments.</td><td>If a local official signs up and needs verifying. Ask Adam first.</td></tr>
                <tr><td><b>Sitemap</b></td><td>Every public URL the site generates, per city.</td><td>To find the public link for a page you want to share.</td></tr>
                <tr><td><b>API Documentation</b></td><td>The backend&apos;s interactive API reference.</td><td>Only if you want to script something.</td></tr>
                <tr><td><b>Settings</b></td><td>Your own preferences: dark mode, newsletter and alert subscriptions, and a way to send yourself a sample newsletter.</td><td>Worth doing once: subscribe yourself to your city&apos;s newsletter and alerts.</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Handle with care */}
        <section id="care" className={styles.section}>
          <div className={styles.secHead}>
            <span className={styles.eyebrow}>The honest version</span>
            <h2>What to handle with care</h2>
            <p className={styles.why}>
              This is a two-person project and the guardrails you would expect are not all there yet. Here is
              the honest map of what is reversible and what is not. Most things are.
            </p>
          </div>
          <div className={styles.safety}>
            <div className={styles.box}>
              <h4><span className={styles.dot} style={{ background: "var(--success)" }} />Do freely</h4>
              <ul>
                <li>Ask Seymour any analysis question</li>
                <li>Create metrics for your city</li>
                <li>Execute (re-run) one of your metrics</li>
                <li>Create stories, run anomaly detection</li>
                <li>Generate a sample newsletter</li>
                <li>Reorder or hide metrics in Display Settings (instantly public, instantly reversible)</li>
                <li>Read any panel, any city</li>
              </ul>
            </div>
            <div className={styles.box}>
              <h4><span className={styles.dot} style={{ background: "var(--warning)" }} />Think first</h4>
              <ul>
                <li>Editing a metric&apos;s query or definition</li>
                <li>Editing or deleting a story (it may already be in a newsletter)</li>
                <li>Editing an elected official&apos;s record</li>
                <li>Running every missing template at once (slow, and it costs money)</li>
                <li>Creating scheduled jobs</li>
              </ul>
            </div>
            <div className={styles.box}>
              <h4><span className={styles.dot} style={{ background: "var(--error)" }} />Ask Adam or Rob</h4>
              <ul>
                <li>Deleting a metric, or clearing its data</li>
                <li>Re-creating structure from query configs</li>
                <li>Editing a shared template (it affects every city)</li>
                <li>Newsletter prompts or scoring config</li>
                <li>Users: roles, verification, deletion</li>
                <li>Anything in a city that is not yours</li>
              </ul>
            </div>
          </div>
          <div className={`${styles.callout} ${styles.calloutDanger}`}>
            <div className={styles.t}>Seymour does not ask twice</div>
            <p>
              &ldquo;Delete that metric&rdquo; will delete it, with its history. If you want to hide
              something, use Display Settings. If you want to test whether a metric is broken, use Execute,
              not Clear.
            </p>
          </div>
          <p className={styles.fine}>
            Every metric change is written to an audit log with your name on it, so nothing is anonymous and
            most things can be reconstructed. Rebuilding lost data is still slow. When in doubt, text Adam.
          </p>
        </section>

        {/* Challenge */}
        <section id="challenge" className={styles.section}>
          <div className={styles.secHead}>
            <span className={styles.eyebrow}>Where to start</span>
            <h2>What to dig into</h2>
            <p className={styles.why}>
              Concrete places to point this, each answerable with the tools above.
            </p>
          </div>
          <ul className={styles.checklist}>
            {g.challenge.map((c) => (
              <li key={c.title}>
                <span className={styles.bx} />
                <div>
                  <b>{c.title}.</b> {c.body}
                </div>
              </li>
            ))}
          </ul>
          <p className={styles.fine}>{g.challengeOutro}</p>
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
                {g.cheatSheet.map((r) => (
                  <tr key={r.goal}>
                    <td>{r.goal}</td>
                    <td>{r.say}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <footer className={styles.footer}>
          <span>Transparent City · guide for the {g.cityName} city manager</span>
          <span>Questions: Adam or Rob, any time</span>
        </footer>
      </div>
    </div>
  );
}
