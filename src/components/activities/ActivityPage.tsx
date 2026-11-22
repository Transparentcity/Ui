import type { ReactNode } from "react";

import {
  buildMailto,
  formatDate,
  formatDays,
  targetsCsv,
  type ActivityPath,
  type ActivityPayload,
} from "@/lib/activities";

import styles from "./ActivityPage.module.css";
import ReportBackForm from "./ReportBackForm";

const TARGETS_SHOWN = 20;

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

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className={styles.figure}>
      <div className={styles.figureValue}>{value}</div>
      <div className={styles.figureLabel}>{label}</div>
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

function WhatHappened({ p }: { p: ActivityPayload }) {
  const f = p.figures;
  const oa = f.open_over_one_year.area;
  const med = f.median_days_to_close;
  return (
    <Block id="what-happened" title="What happened">
      <div className={styles.figures}>
        <Figure value={f.unresolved.total.toLocaleString("en-US")} label="unresolved pothole requests" />
        <Figure
          value={f.locations.toLocaleString("en-US")}
          label={`separate locations (requests within ${f.group_radius_m} meters grouped)`}
        />
        {oa.of > 0 && (
          <Figure value={`${oa.count} of ${oa.of}`} label={`open requests more than a year old (${oa.pct}%)`} />
        )}
        {p.area.kind !== "city" && med.area.days != null && (
          <Figure value={`${formatDays(med.area.days)} days`} label="median wait when the city closes a request" />
        )}
      </div>
      {p.what_happened.map((line) => (
        <p key={line} className={styles.lede}>
          {line}
        </p>
      ))}
      <p className={styles.meta}>
        Source: <SourceLink url={p.data_source.url}>{p.data_source.name}</SourceLink>, categories{" "}
        {p.data_source.categories.join(" and ")}. Requests filed {formatDate(f.data_from)} to{" "}
        {formatDate(f.data_through)}
        {p.data_source.portal_updated ? `; portal updated ${formatDate(p.data_source.portal_updated)}` : ""}.
        Unresolved means status {p.data_source.unresolved_statuses.join(", ")}. &ldquo;More than a year
        old&rdquo; is counted as of {formatDate(f.as_of)}.
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
        Based on {med.area.closed_requests.toLocaleString("en-US")} closed requests here and{" "}
        {med.city.closed_requests.toLocaleString("en-US")} citywide, filed{" "}
        {formatDate(p.figures.data_from)} to {formatDate(p.figures.data_through)}. {med.note}
      </p>
    </Block>
  );
}

function UnverifiedNotice({ p }: { p: ActivityPayload }) {
  if (!p.rules.unverified_note) return null;
  return (
    <p className={styles.notice} role="note">
      {p.rules.unverified_note}
    </p>
  );
}

function WhatYouCanDo({ p }: { p: ActivityPayload }) {
  return (
    <Block id="what-you-can-do" title="What you can do">
      <div className={styles.paths}>
        {p.paths.map((path) => (
          <div key={path.key} className={styles.pathCard}>
            <h3>{path.title}</h3>
            <p>{path.who}</p>
            <p className={styles.meta}>
              {path.legal_note}
              {path.legal_source && (
                <>
                  {" "}
                  Source: <SourceLink url={path.legal_source.url}>{path.legal_source.title}</SourceLink>,
                  checked {formatDate(path.legal_source.checked)}.
                </>
              )}
            </p>
          </div>
        ))}
      </div>
      <UnverifiedNotice p={p} />
    </Block>
  );
}

function PathSteps({ path, p }: { path: ActivityPath; p: ActivityPayload }) {
  return (
    <>
      <h3>{path.title}</h3>
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
      {path.key === "report" && (
        <div className={styles.actions}>
          <a className={styles.button} href={buildMailto(p.email_draft)}>
            Open the email draft
          </a>
        </div>
      )}
    </>
  );
}

function TargetList({ p }: { p: ActivityPayload }) {
  const targets = p.figures.targets;
  if (!targets.length) return <p className={styles.meta}>No unresolved requests in this area.</p>;
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(targetsCsv(targets))}`;
  const fileName = `${p.city}-${p.activity}-${p.area.slug || "citywide"}-${p.figures.as_of}.csv`;
  return (
    <>
      <h3>Locations, most reported first</h3>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.num}>#</th>
              <th>Location</th>
              <th className={styles.num}>Requests</th>
              <th>Request numbers</th>
              <th>First reported</th>
              <th className={styles.num}>Days open</th>
            </tr>
          </thead>
          <tbody>
            {targets.slice(0, TARGETS_SHOWN).map((t) => (
              <tr key={t.rank}>
                <td className={styles.num}>{t.rank}</td>
                <td>{t.address}</td>
                <td className={styles.num}>{t.requests}</td>
                <td>{t.request_ids.join(", ")}</td>
                <td>{formatDate(t.first_reported)}</td>
                <td className={styles.num}>{t.days_open.toLocaleString("en-US")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.actions}>
        <a className={styles.button} href={csvHref} download={fileName}>
          Download the list ({targets.length} locations, CSV)
        </a>
      </div>
      <p className={styles.meta}>
        Ranked by number of unresolved requests at the location, then by age. An open request does not
        prove the hole is still there.
      </p>
    </>
  );
}

function HowStepByStep({ p }: { p: ActivityPayload }) {
  return (
    <Block id="how" title="How, step by step">
      {p.paths.map((path) => (
        <PathSteps key={path.key} path={path} p={p} />
      ))}
      <TargetList p={p} />
    </Block>
  );
}

function CostAndTime({ p }: { p: ActivityPayload }) {
  return (
    <Block id="cost" title="Cost and time">
      {p.paths.map((path) => (
        <div key={path.key}>
          <h3>{path.title}</h3>
          <table className={styles.table}>
            <tbody>
              {path.cost_time.map((c) => (
                <tr key={c.label}>
                  <th scope="row">{c.label}</th>
                  <td>
                    {c.value}
                    <div className={styles.meta}>{c.source}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </Block>
  );
}

function RulesAndSafety({ p }: { p: ActivityPayload }) {
  const r = p.rules;
  return (
    <Block id="rules" title="Rules and safety">
      <UnverifiedNotice p={p} />
      <ul className={styles.bullets}>
        {[r.who_fixes, ...r.statements].map((s) => (
          <li key={s.text}>
            {s.text}{" "}
            <span className={styles.meta}>
              Source: <SourceLink url={s.source.url}>{s.source.title}</SourceLink>, {s.source.publisher},
              checked {formatDate(s.source.checked)}.
            </span>
          </li>
        ))}
      </ul>
      {r.background.length > 0 && (
        <>
          <h3>Background, not a city rule</h3>
          <ul className={styles.bullets}>
            {r.background.map((s) => (
              <li key={s.text}>
                {s.text}{" "}
                <span className={styles.meta}>
                  Source: <SourceLink url={s.source.url}>{s.source.publisher}</SourceLink>.
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {r.safety.length > 0 && (
        <>
          <h3>Safety</h3>
          <ul className={styles.bullets}>
            {r.safety.map((s) => (
              <li key={s.text}>
                {s.text}{" "}
                <span className={styles.meta}>
                  Source: <SourceLink url={s.source.url}>{s.source.title}</SourceLink>, checked{" "}
                  {formatDate(s.source.checked)}.
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
      <p className={styles.lede}>{rb.summary}</p>
      <p className={styles.meta}>We will ask for: {rb.fields.join(", ")}.</p>
      <p className={styles.meta}>{rb.watch}</p>
      {rb.enabled ? (
        <ReportBackForm
          city={p.city}
          activity={p.activity}
          areaSlug={p.area.slug}
          pathKeys={p.paths.map((x) => x.key)}
        />
      ) : (
        <p className={styles.notice} role="note">
          Report-back is not open yet. Keep your request numbers; you will be able to log them here.
        </p>
      )}
    </Block>
  );
}

function Sources({ p }: { p: ActivityPayload }) {
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
    </Block>
  );
}

/**
 * The activity page template (spec section 2). Where the city's own rules
 * allow a group repair (Path B), rules and safety move above the steps.
 */
export default function ActivityPage({ payload }: { payload: ActivityPayload }) {
  const p = payload;
  const rulesFirst = p.paths.some((x) => x.key === "repair_day");
  return (
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
  );
}
