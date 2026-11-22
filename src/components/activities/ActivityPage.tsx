import type { ReactNode } from "react";

import {
  buildMailto,
  formatAge,
  formatDate,
  statusBreakdown,
  targetsCsv,
  type ActivityPayload,
  type ActivitySource,
  type ActivityTarget,
} from "@/lib/activities";

import "@/components/CityView.css";
import styles from "./ActivityPage.module.css";
import ActivityMap from "./ActivityMap";
import ReportBackForm from "./ReportBackForm";

/** Locations shown before "Show all". The CSV always has every one. */
const TARGETS_SHOWN = 10;

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className={styles.block} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={styles.blockTitle}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="stat-card" role="listitem">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note && <div className={styles.statNote}>{note}</div>}
    </div>
  );
}

function SourceLink({ url, children }: { url: string; children: ReactNode }) {
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ) : (
    <>{children}</>
  );
}

function Cite({ source, withPublisher = true }: { source: ActivitySource; withPublisher?: boolean }) {
  return (
    <span className={styles.cite}>
      Source: <SourceLink url={source.url}>{source.title}</SourceLink>
      {withPublisher && source.publisher ? `, ${source.publisher}` : ""}, checked {formatDate(source.checked)}.
    </span>
  );
}

function WhatHappened({ p }: { p: ActivityPayload }) {
  const f = p.figures;
  const oa = f.open_over_one_year;
  const oldest = f.oldest_unresolved;
  const most = f.most_reported_location;
  const lines: string[] = [];
  if (f.unresolved.total > 0) {
    lines.push(
      `Of the ${f.unresolved.total.toLocaleString("en-US")}, ${statusBreakdown(
        f.unresolved.by_status,
        p.data_source.unresolved_statuses
      )}.`
    );
  }
  if (oldest) lines.push(`The oldest, at ${oldest.address}, was filed ${formatDate(oldest.opened)}.`);
  if (most && most.unresolved_requests > 1) {
    lines.push(
      `The most reported location, ${most.address}, has ${most.unresolved_requests} unresolved requests, the first filed ${formatDate(most.oldest_opened)}.`
    );
  }
  return (
    <Block id="what-happened" title="What happened">
      <div className={`statistics-grid ${styles.stats}`} role="list" aria-label="Pothole requests in this area">
        <Stat label="Unresolved requests" value={f.unresolved.total.toLocaleString("en-US")} />
        <Stat
          label="Locations"
          value={f.locations.toLocaleString("en-US")}
          note={`Requests within ${f.group_radius_m} m counted once`}
        />
        {oa.area.of > 0 && (
          <Stat
            label="Open more than a year"
            value={`${oa.area.count.toLocaleString("en-US")} of ${oa.area.of.toLocaleString("en-US")}`}
            note={
              p.area.kind !== "city" && oa.city.pct != null
                ? `${oa.area.pct}% here, ${oa.city.pct}% citywide`
                : `${oa.area.pct}%`
            }
          />
        )}
      </div>
      {lines.length > 0 && <p className={styles.lede}>{lines.join(" ")}</p>}
      <p className={styles.meta}>
        Source: <SourceLink url={p.data_source.url}>{p.data_source.name}</SourceLink>, requests filed{" "}
        {formatDate(f.data_from)} to {formatDate(f.data_through)}
        {p.data_source.portal_updated ? `, portal updated ${formatDate(p.data_source.portal_updated)}` : ""}.
      </p>
    </Block>
  );
}

function WhyItMatters({ p }: { p: ActivityPayload }) {
  const med = p.figures.median_days_to_close;
  return (
    <Block id="why" title="Why it matters">
      <p className={styles.lede}>{p.why_it_matters}</p>
      <p className={styles.meta}>
        Based on {med.area.closed_requests.toLocaleString("en-US")} closed requests here
        {p.area.kind !== "city" ? ` and ${med.city.closed_requests.toLocaleString("en-US")} citywide` : ""}.
      </p>
    </Block>
  );
}

function WhatYouCanDo({ p }: { p: ActivityPayload }) {
  return (
    <Block id="what-you-can-do" title="What you can do">
      <div className={styles.paths}>
        {p.paths.map((path) => (
          <div key={path.key} className={`stat-card ${styles.pathCard}`}>
            <h3 className={styles.pathTitle}>{path.title}</h3>
            <p className={styles.pathWho}>{path.who}</p>
            <p className={styles.meta}>
              {path.legal_note} {path.legal_source && <Cite source={path.legal_source} withPublisher={false} />}
            </p>
          </div>
        ))}
      </div>
      {p.rules.unverified_note && (
        <p className={styles.notice} role="note">
          {p.rules.unverified_note}
        </p>
      )}
    </Block>
  );
}

function TargetRow({ t }: { t: ActivityTarget }) {
  return (
    <tr>
      <td className={styles.num}>{t.rank}</td>
      <td>
        <span className={styles.address}>{t.address}</span>
        <span className={styles.ids}>
          {t.request_ids.length === 1 ? "Request" : "Requests"} {t.request_ids.join(", ")}
        </span>
      </td>
      <td className={styles.num}>{t.requests}</td>
      <td className={styles.since}>
        {formatDate(t.first_reported)}
        <span className={styles.ids}>{formatAge(t.days_open)}</span>
      </td>
    </tr>
  );
}

function TargetTable({ targets }: { targets: ActivityTarget[] }) {
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.num} scope="col">
              #
            </th>
            <th scope="col">Location</th>
            <th className={styles.num} scope="col">
              Requests
            </th>
            <th scope="col">Open since</th>
          </tr>
        </thead>
        <tbody>
          {targets.map((t) => (
            <TargetRow key={t.rank} t={t} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TargetList({ p }: { p: ActivityPayload }) {
  const targets = p.figures.targets;
  if (!targets.length) return <p className={styles.meta}>No unresolved requests in this area.</p>;
  const rest = targets.slice(TARGETS_SHOWN);
  return (
    <>
      <h3 className={styles.subTitle}>Where to start</h3>
      <p className={styles.meta}>
        Most unresolved requests first, then the oldest. Requests within {p.figures.group_radius_m} meters
        of each other count as one location.
      </p>
      <ActivityMap targets={targets} areaLabel={p.area.label} sourceUrl={p.data_source.url} />
      <TargetTable targets={targets.slice(0, TARGETS_SHOWN)} />
      {rest.length > 0 && (
        <details className={styles.more}>
          <summary>Show the other {rest.length} locations</summary>
          <TargetTable targets={rest} />
        </details>
      )}
    </>
  );
}

function HowStepByStep({ p }: { p: ActivityPayload }) {
  const many = p.paths.length > 1;
  const targets = p.figures.targets;
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(targetsCsv(targets))}`;
  const fileName = `${p.city}-${p.activity}-${p.area.slug || "citywide"}-${p.figures.as_of}.csv`;
  return (
    <Block id="how" title="How, step by step">
      {p.paths.map((path) => (
        <div key={path.key}>
          {many && <h3 className={styles.subTitle}>{path.title}</h3>}
          <ol className={styles.steps}>
            {path.steps.map((s) => (
              <li key={s.text}>
                {s.text}
                {s.link_url && (
                  <>
                    {" "}
                    <a href={s.link_url} target="_blank" rel="noopener noreferrer">
                      {s.link_label || "Open"}
                    </a>
                  </>
                )}
              </li>
            ))}
          </ol>
        </div>
      ))}
      <div className={styles.actions}>
        {p.paths.some((x) => x.key === "report") && (
          <a className="btn btn-primary" href={buildMailto(p.email_draft)}>
            Open the email draft
          </a>
        )}
        {targets.length > 0 && (
          <a className="btn btn-secondary" href={csvHref} download={fileName}>
            Download the list ({targets.length} locations, CSV)
          </a>
        )}
      </div>
      <TargetList p={p} />
    </Block>
  );
}

function CostAndTime({ p }: { p: ActivityPayload }) {
  const many = p.paths.length > 1;
  return (
    <Block id="cost" title="Cost and time">
      {p.paths.map((path) => (
        <div key={path.key}>
          {many && <h3 className={styles.subTitle}>{path.title}</h3>}
          <dl className={styles.costs}>
            {path.cost_time.map((c) => (
              <div key={c.label}>
                <dt>{c.label}</dt>
                <dd>
                  {c.value}
                  <span className={styles.cite}>{c.source}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </Block>
  );
}

function RulesAndSafety({ p }: { p: ActivityPayload }) {
  const r = p.rules;
  return (
    <Block id="rules" title="Rules and safety">
      <ul className={styles.bullets}>
        {[r.who_fixes, ...r.statements].map((s) => (
          <li key={s.text}>
            {s.text} <Cite source={s.source} />
          </li>
        ))}
      </ul>
      {r.safety.length > 0 && (
        <>
          <h3 className={styles.subTitle}>Safety</h3>
          <ul className={styles.bullets}>
            {r.safety.map((s) => (
              <li key={s.text}>
                {s.text} <Cite source={s.source} />
              </li>
            ))}
          </ul>
        </>
      )}
      {r.background.length > 0 && (
        <>
          <h3 className={styles.subTitle}>Background, not a city rule</h3>
          <ul className={styles.bullets}>
            {r.background.map((s) => (
              <li key={s.text}>
                {s.text}{" "}
                <span className={styles.cite}>
                  Source: <SourceLink url={s.source.url}>{s.source.publisher}</SourceLink>.
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Block>
  );
}

function ReportBack({ p }: { p: ActivityPayload }) {
  const rb = p.report_back;
  return (
    <Block id="report-back" title="Report back">
      <p className={styles.body}>{rb.summary}</p>
      {rb.enabled ? (
        <ReportBackForm
          city={p.city}
          activity={p.activity}
          areaSlug={p.area.slug}
          pathKeys={p.paths.map((x) => x.key)}
        />
      ) : (
        <>
          <p className={styles.meta}>We will ask for: {rb.fields.join(", ")}.</p>
          <p className={styles.notice} role="note">
            Report-back is not open yet. Keep your request numbers; you will be able to log them here.
          </p>
        </>
      )}
      <p className={styles.meta}>{rb.watch}</p>
    </Block>
  );
}

function Sources({ p }: { p: ActivityPayload }) {
  const f = p.figures;
  return (
    <Block id="sources" title="Sources">
      <ol className={styles.sources}>
        {p.sources.map((s) => (
          <li key={`${s.title}-${s.url}`}>
            <SourceLink url={s.url}>{s.title}</SourceLink>
            {s.publisher ? `, ${s.publisher}` : ""}. Checked {formatDate(s.checked)}.
          </li>
        ))}
      </ol>
      <h3 className={styles.subTitle}>How we counted</h3>
      <ul className={`${styles.bullets} ${styles.small}`}>
        <li>
          Requests in the categories {p.data_source.categories.join(" and ")}, filed {formatDate(f.data_from)} to{" "}
          {formatDate(f.data_through)}.
        </li>
        <li>Unresolved means status {p.data_source.unresolved_statuses.join(", ")}.</li>
        <li>
          A location is a group of unresolved requests within {f.group_radius_m} meters of each other, starting
          from the oldest.
        </li>
        <li>&ldquo;More than a year&rdquo; is counted as of {formatDate(f.as_of)}.</li>
        <li>Median waits use closed requests only. {f.median_days_to_close.note}</li>
      </ul>
    </Block>
  );
}

/**
 * The activity page template (spec section 2): seven blocks, then sources.
 * Laid out in the city dashboard's section chrome. Where the city's own
 * rules allow a group repair (Path B), rules and safety move above the steps.
 */
export default function ActivityPage({ payload }: { payload: ActivityPayload }) {
  const p = payload;
  const rulesFirst = p.paths.some((x) => x.key === "repair_day");
  return (
    <section className="dashboard-section">
      <div className="container">
        <div className={styles.wrap}>
          <WhatHappened p={p} />
          <WhyItMatters p={p} />
          <WhatYouCanDo p={p} />
          {rulesFirst && <RulesAndSafety p={p} />}
          <HowStepByStep p={p} />
          <CostAndTime p={p} />
          {!rulesFirst && <RulesAndSafety p={p} />}
          <ReportBack p={p} />
          <Sources p={p} />
        </div>
      </div>
    </section>
  );
}
