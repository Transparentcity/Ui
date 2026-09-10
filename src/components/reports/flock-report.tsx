import type { ReactNode } from "react";
import { FLOCK_DATA } from "@/lib/reports/flockData";
import { FLOCK_FIGURES, type FlockFigureKey } from "@/lib/reports/flockFigures";

// Long-form report. Numbers come from the pinned analysis snapshot exported by
// transparentcity-platform (scripts/analysis/flock); prose mirrors docs/flock/REPORT.md.

const D = FLOCK_DATA;
const VERSION = "1.0";
const PUBLISHED = "September 2026";
const RETRIEVED = D.generated_from.retrieved_utc.slice(0, 10);
const DOWNLOADS = "/reports/flock";

function pct(v: number): string {
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toFixed(1)}%`;
}

function n(v: number): string {
  return Math.round(v).toLocaleString("en-US");
}

function soql(domain: string, id: string, params: Record<string, string>): string {
  const q = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return `https://${domain}/resource/${id}.json?${q}`;
}

function monthly(domain: string, id: string, dateField: string, where: string): string {
  return soql(domain, id, {
    $select: `date_trunc_ym(${dateField}) as month, count(*) as n`,
    $where: `(${where}) AND ${dateField} >= '2022-01-01T00:00:00'`,
    $group: "month",
    $order: "month",
  });
}

function Figure({ id, caption }: { id: FlockFigureKey; caption?: ReactNode }) {
  return (
    <figure>
      <div className="fr-figwrap" dangerouslySetInnerHTML={{ __html: FLOCK_FIGURES[id] }} />
      {caption ? <figcaption className="fr-cap">{caption}</figcaption> : null}
    </figure>
  );
}

function Section({ num, title, children }: { num: number; title: string; children: ReactNode }) {
  return (
    <>
      <h2 id={`s${num}`}>
        {num}. {title}
      </h2>
      {children}
    </>
  );
}

function Part({ title, blurb }: { title: string; blurb: string }) {
  return (
    <section className="fr-part">
      <h2>{title}</h2>
      <p>{blurb}</p>
    </section>
  );
}

const CITY_NAMES: Record<string, string> = {
  sf: "San Francisco",
  oakland: "Oakland",
  denver: "Denver",
  austin: "Austin",
  chicago: "Chicago",
  nyc: "New York",
  seattle: "Seattle",
};

const PROVENANCE: { series: string; portal: string; dataset: string; filter: string; url: string }[] = [
  { series: "San Francisco thefts", portal: "data.sfgov.org", dataset: "wg3w-h783", filter: "incident_category = 'Motor Vehicle Theft'",
    url: monthly("data.sfgov.org", "wg3w-h783", "incident_date", "incident_category='Motor Vehicle Theft'") },
  { series: "San Francisco recovered vehicles", portal: "data.sfgov.org", dataset: "wg3w-h783", filter: "incident_category = 'Recovered Vehicle'",
    url: monthly("data.sfgov.org", "wg3w-h783", "incident_date", "incident_category='Recovered Vehicle'") },
  { series: "San Francisco payments", portal: "data.sfgov.org", dataset: "n9pm-xkyq", filter: "vendor = 'FLOCK SAFETY'",
    url: soql("data.sfgov.org", "n9pm-xkyq", { $where: "vendor='FLOCK SAFETY'", $order: "fiscal_year" }) },
  { series: "San Francisco contracts", portal: "data.sfgov.org", dataset: "cqi5-hm2d", filter: "prime_contractor like '%FLOCK%'",
    url: soql("data.sfgov.org", "cqi5-hm2d", { $where: "upper(prime_contractor) like '%FLOCK%'" }) },
  { series: "Oakland thefts", portal: "data.oaklandca.gov", dataset: "ppgh-7dqv", filter: "crimetype = 'STOLEN VEHICLE'",
    url: monthly("data.oaklandca.gov", "ppgh-7dqv", "datetime", "crimetype='STOLEN VEHICLE'") },
  { series: "Austin thefts", portal: "data.austintexas.gov", dataset: "fdj4-gpfu", filter: "crime_type = 'AUTO THEFT'",
    url: monthly("data.austintexas.gov", "fdj4-gpfu", "occ_date", "crime_type='AUTO THEFT'") },
  { series: "Denver thefts", portal: "denvergov.org (ArcGIS)", dataset: "ODC_CRIME_OFFENSES_P, layer 324", filter: "OFFENSE_CATEGORY_ID = 'auto-theft'",
    url: "https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/arcgis/rest/services/ODC_CRIME_OFFENSES_P/FeatureServer/324/query?where=OFFENSE_CATEGORY_ID%3D%27auto-theft%27&outStatistics=%5B%7B%22statisticType%22%3A%22count%22%2C%22onStatisticField%22%3A%22OBJECTID%22%2C%22outStatisticFieldName%22%3A%22n%22%7D%5D&groupByFieldsForStatistics=EXTRACT(YEAR%20FROM%20FIRST_OCCURRENCE_DATE)%2C%20EXTRACT(MONTH%20FROM%20FIRST_OCCURRENCE_DATE)&f=json" },
  { series: "Denver payments", portal: "data.colorado.gov", dataset: "wnau-xrqi", filter: "payee = 'FLOCK SAFETY'",
    url: soql("data.colorado.gov", "wnau-xrqi", { $where: "upper(payee) like '%FLOCK%'", $order: "paymentdate" }) },
  { series: "Chicago thefts", portal: "data.cityofchicago.org", dataset: "ijzp-q8t2", filter: "primary_type = 'MOTOR VEHICLE THEFT'",
    url: monthly("data.cityofchicago.org", "ijzp-q8t2", "date", "primary_type='MOTOR VEHICLE THEFT'") },
  { series: "Chicago payments (zero check)", portal: "data.cityofchicago.org", dataset: "s4vu-giwb", filter: "vendor_name like '%FLOCK SAFETY%' or '%FLOCK GROUP%'",
    url: soql("data.cityofchicago.org", "s4vu-giwb", { $where: "upper(vendor_name) like '%FLOCK SAFETY%' OR upper(vendor_name) like '%FLOCK GROUP%'" }) },
  { series: "New York thefts, through 2025", portal: "data.cityofnewyork.us", dataset: "qgea-i56i", filter: "ofns_desc = 'GRAND LARCENY OF MOTOR VEHICLE'",
    url: monthly("data.cityofnewyork.us", "qgea-i56i", "cmplnt_fr_dt", "ofns_desc='GRAND LARCENY OF MOTOR VEHICLE'") },
  { series: "New York thefts, 2026", portal: "data.cityofnewyork.us", dataset: "5uac-w243", filter: "ofns_desc = 'GRAND LARCENY OF MOTOR VEHICLE'",
    url: monthly("data.cityofnewyork.us", "5uac-w243", "cmplnt_fr_dt", "ofns_desc='GRAND LARCENY OF MOTOR VEHICLE'") },
  { series: "Seattle thefts", portal: "data.seattle.gov", dataset: "tazs-3rd5", filter: "nibrs_offense_code = '240'",
    url: monthly("data.seattle.gov", "tazs-3rd5", "offense_date", "nibrs_offense_code='240'") },
  { series: "San Francisco camera locations (supplement)", portal: "OpenStreetMap via the DeFlock project", dataset: "Overpass API nodes", filter: "man_made=surveillance, ALPR, operator SFPD or brand Flock Safety",
    url: "https://deflock.me" },
];

export function FlockReport() {
  const s2 = D.s2;
  const nr = D.s2_no_ramp;
  const onRows = [
    { key: "sf", label: "San Francisco on (2024-04)", r: s2.sf.on, noRamp: nr.sf },
    { key: "oakland", label: "Oakland on (2024-04)", r: s2.oakland.on, noRamp: nr.oakland },
    { key: "denver", label: "Denver on (2024-04)", r: s2.denver.on, noRamp: nr.denver },
    { key: "austin", label: "Austin on (2024-02, about 40 cameras)", r: s2.austin.on, noRamp: nr.austin },
  ];
  const annualOrder = ["sf", "oakland", "denver", "austin", "chicago", "nyc", "seattle"] as const;
  const hoods = D.block.neighborhoods;
  const hoodMin = Math.min(...hoods.map((h) => Math.abs(h.pct)));
  const hoodMax = Math.max(...hoods.map((h) => Math.abs(h.pct)));
  const beta = D.s3.primary.beta;
  const se = D.s3.primary.se_cluster;
  const ciLo = (Math.exp(beta - 1.96 * se) - 1) * 100;
  const ciHi = (Math.exp(beta + 1.96 * se) - 1) * 100;
  const alprPaid = D.payments.sf_contracts[0].paid;
  const dronePaid = D.payments.sf_contracts[1].paid;

  return (
    <div className="flock-report" data-testid="flock-report">
      <section className="fr-cover">
        <div className="fr-cover-top">
          <span>Transparent City</span>
          <span>Version {VERSION}, {PUBLISHED}</span>
        </div>
        <div>
          <h1>
            Flock by{" "}
            <br />
            the Numbers
          </h1>
          <p className="fr-dek">
            What five American cities paid Flock Safety according to public records, what happened to reported
            vehicle theft while the cameras ran, and what happened where they were switched off.
          </p>
          <p className="fr-meta">Data through June 2026. Methodology fixed before the analysis was run.</p>
        </div>
        <div className="fr-cover-stats">
          <div>
            <b>$5.19M</b>
            <span>paid by San Francisco to Flock Safety for cameras and drones, from the city checkbook</span>
          </div>
          <div>
            <b>−54%</b>
            <span>reported San Francisco vehicle thefts, 2023 to 2025, reproduced from raw incident data</span>
          </div>
          <div>
            <b>7</b>
            <span>cities in the pre-registered monthly panel, 2022 to 2026</span>
          </div>
          <div>
            <b>7 + 3</b>
            <span>months of data after Austin and Denver switched their networks off, with no rebound so far</span>
          </div>
        </div>
      </section>

      <section className="fr-findings">
        <h2>Key findings</h2>
        <div className="fr-kfgrid">
          <div className="fr-kfc">
            <b>$5.19M</b>
            <span>
              San Francisco has paid Flock Safety ${n(D.payments.sf_total_paid)} to date: ${n(alprPaid)} on the
              400-camera license plate reader contract and ${n(dronePaid)} on a drone contract that began in
              September 2025. The camera program was funded largely by a $17.3 million state grant. Every dollar
              is visible in the city checkbook and matches independent reporting.
            </span>
          </div>
          <div className="fr-kfc">
            <b>−54%</b>
            <span>
              Reported vehicle thefts in San Francisco fell 54 percent from 2023 to 2025, from{" "}
              {n(D.annual.sf["2023"])} to {n(D.annual.sf["2025"])}. We reproduce from raw incident data the
              figure the San Francisco Standard reported from SFPD data.
            </span>
          </div>
          <div className="fr-kfc">
            <b>−49.5% vs −36.6%</b>
            <span>
              Over months 7 to 18 after deployment, San Francisco’s reported thefts fell faster than in every
              comparison city; Oakland, the other dense network, fell 41.9 percent. Austin’s 40-camera pilot
              tracked Chicago and Seattle closely.
            </span>
          </div>
          <div className="fr-kfc">
            <b>No rebound so far</b>
            <span>
              Austin and Denver switched their networks off. Reported thefts kept falling in both, as fast as or
              faster than in comparison cities, across seven clean months in Austin and three in Denver. The
              windows are short and the page says so.
            </span>
          </div>
          <div className="fr-kfc">
            <b>−50% / −59%</b>
            <span>
              Blocks within 250 meters of a camera fell 50 percent; blocks 500 meters or more from every camera
              fell 59 percent. The decline is citywide, not concentrated near cameras. If the cameras
              contributed, the geography is more consistent with case-closing than with deterrence at the
              corner.
            </span>
          </div>
          <div className="fr-kfc">
            <b>
              {hoods.length} of {hoods.length}
            </b>
            <span>
              Every San Francisco neighborhood with 200 or more reported thefts in 2023 logged fewer in 2025,
              with declines between {Math.round(hoodMin)} and {Math.round(hoodMax)} percent.
            </span>
          </div>
        </div>
        <div className="fr-howbuilt">
          <div>
            <b>7</b>
            <span>cities in the monthly panel</span>
          </div>
          <div>
            <b>54</b>
            <span>months, January 2022 to June 2026</span>
          </div>
          <div>
            <b>{n(30807 - D.block.incidents_no_geo)}</b>
            <span>geocoded San Francisco theft incidents ({D.block.incidents_no_geo} of 30,807 lacked coordinates)</span>
          </div>
          <div>
            <b>{D.block.cameras}</b>
            <span>mapped SFPD camera positions, about {Math.round(D.block.cameras / 4)} percent of the network</span>
          </div>
          <div>
            <b>12</b>
            <span>official open datasets, all public</span>
          </div>
          <div>
            <b>f093c5df</b>
            <span>methodology committed before analysis</span>
          </div>
        </div>
      </section>

      <div className="fr-wrap">
        <div className="fr-abstract">
          <p>
            <strong>Abstract.</strong> Flock Safety’s license plate readers have been cancelled by dozens of
            cities since 2025 and kept by others. This report sets aside claims from both the company and its
            critics and asks only what public records show. Using city open-data portals, we assemble every
            payment San Francisco and Denver made to Flock Safety, verify that Chicago has made none, and
            construct a seven-city monthly panel of reported motor vehicle theft (2022 to 2026) spanning two
            cities that deployed dense Flock networks (San Francisco, Oakland), two that deployed and later shut
            them down (Austin, Denver), and three Flock-free comparisons (Chicago, New York, Seattle).
          </p>
          <p>
            The record supports three findings. <strong>First, the cost is small.</strong> San Francisco has paid
            Flock Safety $5.19 million in total, $3.94 million of it on the 400-camera contract, and we reproduce
            from raw incident data the figure, reported by the San Francisco Standard from SFPD data, that
            reported vehicle thefts fell 54 percent from 2023 to 2025.{" "}
            <strong>Second, where Flock networks are dense, reported theft fell faster than in comparison cities.</strong>{" "}
            San Francisco fell 49.5 percent and Oakland 41.9 percent over matched windows, against declines of
            12.6 to 36.6 percent in the three comparison cities. The panel estimate is an 18 percent association
            (permutation p = 0.16), sharpening to 26 percent (p = 0.017) when the 40-camera Austin network is
            excluded per pre-registered robustness.{" "}
            <strong>Third, switching the networks off produced no detectable rebound within the short windows available.</strong>{" "}
            Reported theft kept falling in Austin and in Denver. The conclusion the record supports is that
            Flock’s cameras are a cheap tool that coincided with outsized declines where densely deployed, that
            removal has not so far coincided with any measurable increase in vehicle theft, and that the live
            disputes are about governance, because the public record does not settle effectiveness either way.
          </p>
        </div>

        <h2 id="story">The story in brief</h2>
        <p>
          <strong>
            Two American cities switched off their Flock Safety camera networks in the past year, and reported
            vehicle theft in both kept falling.
          </strong>{" "}
          We have not found a published comparison of theft trends in cities that shut Flock networks off. Austin
          ended its contract in June 2025 and logged 12.7 percent fewer thefts per month over the following seven
          months, a faster decline than Chicago, New York, or Seattle over the same period. Denver removed all
          110 cameras in March 2026, and the three months since show no rebound. The most alarming claim made on
          the cameras’ behalf, that removing them invites a crime wave, has no support in the first real-world
          tests, which are short.
        </p>
        <p>
          The cities that kept dense networks paid little for them. San Francisco has paid Flock Safety $5.19
          million in total, about 0.03 percent of one year’s $15.9 billion city budget, and its reported vehicle
          thefts fell 54 percent from 2023 to 2025, a decline that outpaced every comparison city in our panel.
          Whether the cameras caused any part of that decline cannot be established from public data, and this
          report does not claim it. What can be shown is the full ledger: what was paid, what happened, and what
          happened where the cameras came down.
        </p>

        <nav className="fr-toc" aria-label="Contents">
          <h3>Contents</h3>
          <ol>
            <li><a href="#story">The story in brief</a></li>
            <li><b>1</b><a href="#s1">Why this report exists</a></li>
            <li><b>2</b><a href="#s2">National context</a></li>
            <li><b>3</b><a href="#s3">Follow the money</a></li>
            <li><b>4</b><a href="#s4">Design and pre-registration</a></li>
            <li><b>5</b><a href="#s5">What the seven cities look like</a></li>
            <li><b>6</b><a href="#s6">After deployment</a></li>
            <li><b>7</b><a href="#s7">The view from the block</a></li>
            <li><b>8</b><a href="#s8">The off-switch</a></li>
            <li><b>9</b><a href="#s9">Recoveries</a></li>
            <li><b>10</b><a href="#s10">Data, downloads, and queries</a></li>
            <li><b>11</b><a href="#s11">Limitations</a></li>
            <li><b>12</b><a href="#s12">The governance ledger</a></li>
            <li><b>13</b><a href="#s13">Conclusion</a></li>
            <li><b>14</b><a href="#s14">References and reproduction</a></li>
          </ol>
        </nav>
      </div>

      <Part
        title="Part one: The setting"
        blurb="Why the question matters, what the country was doing to vehicle theft at the same time, and what the cities actually paid."
      />

      <div className="fr-wrap">
        <Section num={1} title="Why this report exists">
          <p>
            Flock Safety operates automated license plate readers (ALPRs) for more than 5,000 law enforcement
            agencies. Since 2025, reporting on immigration-related lookups through Flock’s national search
            network, an Illinois Secretary of State audit finding that Customs and Border Protection accessed
            Illinois cameras through an undisclosed pilot, and a string of officer-misuse cases have driven dozens
            of cities to cancel contracts. The exact national tally (30, 53, or 80 cities, depending on the
            tracker) comes from advocacy groups and is not relied on here. Austin canceled in June 2025. Denver
            removed all 110 cameras (111 by one count) when its contract expired on March 31, 2026. San Francisco, which deployed 400
            cameras in 2024, and Oakland, which renewed its 290-camera contract in December 2025, kept theirs.
          </p>
          <p>
            Both sides of this fight argue mostly from anecdotes and tallies. What has been missing is the middle
            layer of record: the contracts and payments in city checkbooks, and the crime series in city
            open-data portals, analyzed under rules fixed in advance. Transparent City ingests exactly these
            datasets for its covered cities, and that is the entire contribution of this report. We claim no
            access to Flock, no access to police departments, and nothing that cannot be re-queried by any
            reader.
          </p>
          <p>
            A note on posture. We undertook this analysis expecting the data to be broadly favorable to Flock,
            and much of it is. But the methodology (section 4) was committed to our repository before any outcome
            statistic was computed, and it binds us to publish whatever came out, including the finding in
            section 8 that undercuts the strongest pro-camera argument. Nothing in this report should be read as
            a causal claim; the design supports careful association language only.
          </p>
        </Section>

        <Section num={2} title="National context: theft was falling everywhere">
          <p>
            This is the single most important caveat, so it comes first. Reported motor vehicle theft in the
            United States fell dramatically over exactly the period Flock networks expanded. The FBI estimates
            the national theft rate dropped 19.4 percent in 2024, and the National Insurance Crime Bureau reports
            a further 23 percent decline in the first half of 2025. A major driver was the subsidence of the 2022
            to 2023 Kia and Hyundai theft wave after manufacturer software fixes, which hit cities unevenly.
            Colorado additionally felonized all motor vehicle theft in July 2023, before Denver’s cameras went
            up.
          </p>
          <div className="fr-bigstat">
            <b>−19.4%</b>
            <span>
              The one-year drop in the national motor vehicle theft rate in 2024, per the FBI. The National
              Insurance Crime Bureau counted 17 percent fewer thefts that year, the largest annual decrease it
              has recorded in 40 years, and every finding below sits on top of that wave.
            </span>
          </div>
          <p>
            Every city in our panel shows a large decline, with or without Flock. Any analysis that shows a chart
            of theft falling after camera installation and stops there is misleading. The questions this report
            can answer are whether Flock cities fell <em>faster than comparable cities</em>, and what happened at
            the off-switches.
          </p>
        </Section>

        <Section num={3} title="Follow the money">
          <p>
            We queried each city’s payment and contract datasets for vendor names matching “FLOCK” (excluding one
            unrelated 2007 individual and a Chicago nonprofit containing the word). The results below are
            verbatim from the portals.
          </p>
        </Section>
      </div>
      <div className="fr-wide">
        <div className="fr-tablebox">
          <table>
            <thead>
              <tr>
                <th>City</th>
                <th>Source dataset</th>
                <th>What it shows</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>San Francisco</strong></td>
                <td>cqi5-hm2d (contracts)</td>
                <td>“POL - ALPR subscription,” Flock Safety, term 2024-02-20 to 2027-02-19</td>
                <td className="num">${n(D.payments.sf_contracts[0].agreed)} agreed, ${n(alprPaid)} paid</td>
              </tr>
              <tr>
                <td></td>
                <td>cqi5-hm2d (contracts)</td>
                <td>“POL - Flock Aerodome DFR” (drone as first responder), term 2025-09-22 to 2027-09-21</td>
                <td className="num">${n(D.payments.sf_contracts[1].agreed)} agreed, ${n(dronePaid)} paid</td>
              </tr>
              <tr>
                <td></td>
                <td>n9pm-xkyq (payments)</td>
                <td>
                  Vouchers paid to FLOCK SAFETY: FY2024 ${n(D.payments.sf_by_fy["2024"])}; FY2025 $
                  {n(D.payments.sf_by_fy["2025"])}; FY2026 ${n(D.payments.sf_by_fy["2026"])}; FY2027 $
                  {n(D.payments.sf_by_fy["2027"])}
                </td>
                <td className="num">${n(D.payments.sf_total_paid)} paid</td>
              </tr>
              <tr>
                <td><strong>Denver</strong></td>
                <td>wnau-xrqi (checkbook)</td>
                <td>Six payments to FLOCK SAFETY, October to December 2025, categorized “Computer services”</td>
                <td className="num">${n(D.payments.denver_total)}</td>
              </tr>
              <tr>
                <td><strong>Chicago</strong></td>
                <td>s4vu-giwb (payments)</td>
                <td>Zero payments to Flock Safety or Flock Group. The Chicago Police Department’s ALPR vendor is Motorola Solutions (Vigilant)</td>
                <td className="num">$0</td>
              </tr>
              <tr>
                <td><strong>Oakland</strong></td>
                <td>none queryable</td>
                <td>
                  No queryable checkbook on the open-data portal. The initial 290-camera network was funded by
                  the California Highway Patrol; the city’s own two-year renewal, approved December 2025, is
                  roughly $2 million per council record
                </td>
                <td className="num">about $2M (cited)</td>
              </tr>
              <tr>
                <td><strong>Austin</strong></td>
                <td>none queryable</td>
                <td>
                  No queryable checkbook on the open-data portal. Roughly 40 fixed cameras under a pilot that
                  ended 2025-06-30, per council records and press
                </td>
                <td className="num">not available (cited)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="fr-cap">
          Retrieved {RETRIEVED} UTC, with the timestamp pinned in the data snapshot. San Francisco’s camera
          program was funded largely by a $17.3 million state Organized Retail Theft Prevention Grant. Denver’s
          public checkbook covers recent years, so Denver’s visible spend is a floor, not a total.
        </p>
      </div>
      <div className="fr-wrap">
        <p>
          These checkbook figures match independent reporting. The San Francisco Standard, working from city
          contracting documents, reported that SFPD agreed to pay Flock more than $3.9 million for access to its
          technology between February 20, 2024 and February 19, 2027, which matches the contract row above; the
          city’s own FY2027 voucher of $1,200,000 shows the annual renewal price. For Denver, the mayor’s office
          approved a Flock contract for just under $500,000 covering the 110-camera network, per Government
          Technology and CBS Colorado; the ${n(D.payments.denver_total)} visible in the state-published
          checkbook is the portion of that spending inside the checkbook’s window.
        </p>
        <div className="fr-bigstat">
          <b>${n(D.payments.sf_total_paid)}</b>
          <span>
            Total vouchers paid by San Francisco to Flock Safety across four fiscal years, FY2024 to FY2027, for
            the camera contract and the drone contract combined, per dataset n9pm-xkyq. Independently matched by
            San Francisco Standard reporting.
          </span>
        </div>
        <p>
          The scale of the spending matters here. San Francisco’s adopted budget is roughly $15.9 billion a year,
          so $5.19 million paid across four fiscal years is about 0.03 percent of a single year’s budget. No city
          in our panel bought the cameras at a price where cost-effectiveness turns on fine margins. SFPD
          separately attributes 207 arrests to its Flock ALPRs, including 166 stolen-vehicle arrests. Those are
          the department’s numbers, not ours, and they cannot be verified from open data; for scale, the city
          logged roughly {n(D.annual.sf["2024"] + D.annual.sf["2025"])} reported thefts in 2024 and 2025
          combined, and arrests and thefts are different units.
        </p>

        <Section num={4} title="Design and pre-registration">
          <p>
            The full methodology was committed to Transparent City’s repository (commit <code>f093c5df</code>,
            2026-08-29) after schema feasibility probes but before any monthly outcome series was assembled or
            any statistic computed. The rules were fixed before results were seen, and the methodology document
            is <a href={`${DOWNLOADS}/METHODOLOGY.md`}>published on this page</a>. In brief:
          </p>
          <ul className="fr-rules">
            <li>
              <strong>Panel.</strong> Seven cities, monthly reported motor vehicle theft counts by occurrence
              date, January 2022 to June 2026, from each city’s own portal. Treated: San Francisco (network on
              April 2024), Oakland (on April 2024), Austin (on February 2024 as pre-registered, although the first cameras went live March 29, 2024, so section 6 also reports an April 2024 start; off July 2025), Denver (on April
              2024, uncertain by about two months and tested in section 6; off April 2026). Comparisons: Chicago,
              New York, and Seattle, which are the three cities in Transparent City’s coverage without a Flock
              contract. They were not selected for similarity, and all three run license plate readers from
              other vendors.
            </li>
            <li>
              <strong>S2, the before and after comparison.</strong> For each network switch-on, the mean monthly
              count in the 12 months before deployment against months 7 to 18 after it, with the identical
              calendar windows computed for each comparison city. For San Francisco the pre window is April
              2023 to March 2024 and the post window is November 2024 to October 2025. The six-month ramp is
              skipped because San Francisco’s cameras were installed between March and July 2024, and months in
              which only part of the network was live would otherwise count as treated. Switch-offs get no ramp,
              because removal is immediate: the pre window is the 12 months before the first month off and the
              post window is every month available since (July 2025 to June 2026 for Austin, April to June 2026
              for Denver). The asymmetry favors the switch-on estimate, and section 6 reports the no-ramp version.
            </li>
            <li>
              <strong>S3, the panel model.</strong> A difference-in-differences regression, which compares each
              city with itself over time and with the other cities in the same month: the log of monthly thefts
              on an indicator for months with an active Flock network, with city and month fixed effects and
              standard errors clustered by city. Because seven clusters make conventional inference unreliable,
              significance comes from randomization inference: we reassigned the four camera timelines to the
              seven cities in every possible way (840 assignments), recomputed the estimate each time, and asked
              how often chance alone produced an association at least as large as the real one.
            </li>
            <li>
              <strong>S4, event studies.</strong> Month-by-month differences between the treated city and the
              three comparisons, with the month before the event set to zero.
            </li>
            <li>
              <strong>S5, recoveries.</strong> Recovered-vehicle counts and recoveries per theft where published
              (San Francisco, Oakland).
            </li>
            <li>
              <strong>Publication rule.</strong> Results are published as computed, favorable or not, in
              correlational language throughout.
            </li>
          </ul>
          <p>
            Three items were added after pre-registration and are logged in the methodology’s amendments section:
            the verified Texas DPS install date for Austin (February 2, 2026), the block-level supplement in
            section 7 (descriptive), and the completion on September 3, 2026 of the robustness variants the
            pre-registration promised, from the same pinned snapshot.
          </p>
        </Section>
      </div>

      <Part
        title="Part two: The findings"
        blurb="Seven cities, four camera events, one pre-registered set of rules. What happened when networks went on, what happened on the blocks, and what happened when they went off."
      />

      <div className="fr-wrap">
        <Section num={5} title="What the seven cities look like">
          <p>
            The panels below show reported thefts per month per 100,000 residents. The shaded band marks the
            months when each city’s Flock network was active.
          </p>
        </Section>
      </div>
      <div className="fr-wide">
        <div className="fr-grid7">
          {(["city_sf", "city_oakland", "city_austin", "city_denver", "city_chicago", "city_nyc", "city_seattle"] as const).map(
            (k) => (
              <div key={k} className="fr-cell" dangerouslySetInnerHTML={{ __html: FLOCK_FIGURES[k] }} />
            ),
          )}
        </div>
        <p className="fr-cap">
          <strong>Figure 1.</strong> Sources: San Francisco wg3w-h783, Oakland ppgh-7dqv, Austin fdj4-gpfu,
          Denver ODC_CRIME_OFFENSES_P, Chicago ijzp-q8t2, New York qgea-i56i and 5uac-w243, Seattle tazs-3rd5.
          Rates use Census Vintage-2023 populations, held constant. Every series declines from its 2023 peak
          except Denver, which peaked in 2022 and had been falling for a year before its cameras went up,
          coinciding with Colorado’s felony-theft law. Chicago ticks up in 2026 without any Flock change.
        </p>
        <div className="fr-tablebox">
          <table>
            <thead>
              <tr>
                <th>City</th>
                <th>Population (2023)</th>
                <th>2022</th>
                <th>2023</th>
                <th>2024</th>
                <th>2025</th>
                <th>2023 to 2025</th>
              </tr>
            </thead>
            <tbody>
              {annualOrder.map((c) => {
                const a = D.annual[c];
                const chg = (a["2025"] / a["2023"] - 1) * 100;
                return (
                  <tr key={c}>
                    <td>{CITY_NAMES[c]}</td>
                    <td className="num">{n(D.populations[c])}</td>
                    <td className="num">{n(a["2022"])}</td>
                    <td className="num">{n(a["2023"])}</td>
                    <td className="num">{n(a["2024"])}</td>
                    <td className="num">{n(a["2025"])}</td>
                    <td className="num">{pct(chg)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="fr-cap">
          Annual reported motor vehicle thefts from the pinned snapshot, with the Census Vintage-2023 population
          estimates used for the per-capita rates. The two dense always-on Flock cities sit at the top of the
          range alongside Denver, whose decline has non-Flock explanations documented above.
        </p>
      </div>

      <div className="fr-wrap">
        <Section num={6} title="After deployment: reported theft fell faster in the two dense-network cities">
          <p>This section carries the favorable evidence and its uncertainty.</p>
        </Section>
      </div>
      <div className="fr-wide">
        <Figure
          id="bars"
          caption={
            <>
              <strong>Figure 2.</strong> Purple bars are cities with an active Flock network; gray bars are the
              three comparison cities over the same calendar window. Specification S2.
            </>
          }
        />
        <div className="fr-tablebox">
          <table>
            <thead>
              <tr>
                <th>Network switch-on</th>
                <th>Thefts per month, 12 months before</th>
                <th>Thefts per month, months 7 to 18 after</th>
                <th>Change</th>
                <th>Chicago</th>
                <th>New York</th>
                <th>Seattle</th>
                <th>Change with no ramp skip (months 1 to 12)</th>
              </tr>
            </thead>
            <tbody>
              {onRows.map(({ key, label, r, noRamp }) => (
                <tr key={key}>
                  <td><strong>{label}</strong></td>
                  <td className="num">{r.pre_mean.toFixed(1)}</td>
                  <td className="num">{r.post_mean.toFixed(1)}</td>
                  <td className="num neg">{pct(r.pct_change)}</td>
                  <td className="num">{pct(r.controls_pct_change.chicago)}</td>
                  <td className="num">{pct(r.controls_pct_change.nyc)}</td>
                  <td className="num">{pct(r.controls_pct_change.seattle)}</td>
                  <td className="num">
                    {pct(noRamp.pct_change)} (comparisons {pct(noRamp.controls_pct_change.chicago)},{" "}
                    {pct(noRamp.controls_pct_change.nyc)}, {pct(noRamp.controls_pct_change.seattle)})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fr-cap">
          Mean monthly reported thefts citywide. Comparison-city columns apply the identical calendar windows.
          The last column is the pre-registered robustness variant with no ramp skip; in the first twelve
          months San Francisco’s decline ({pct(nr.sf.pct_change)}) is only slightly ahead of Chicago (
          {pct(nr.sf.controls_pct_change.chicago)}) and Seattle ({pct(nr.sf.controls_pct_change.seattle)}), so
          the head start reported in this section appears in months 7 to 18, not in the first year. Denver’s row
          carries the Colorado confounders from section 2. San Francisco’s cameras arrived bundled with the
          Real-Time Investigation Center, drones, and staffing changes, and the contributions cannot be
          separated.
        </p>
      </div>
      <div className="fr-wrap">
        <p>
          The pattern is consistent with camera density mattering. San Francisco (400 cameras, about 49 per
          100,000 residents) and Oakland (290 city cameras plus 190 California Highway Patrol cameras on
          highways) outfell every comparison city. Austin, whose pilot amounted to roughly 40 cameras in a city
          of about a million people, tracked Chicago and Seattle closely.
        </p>
        <p>
          The panel model summarizes the same contrast. Across all seven cities, months with an active Flock
          network show <strong>{Math.abs(D.s3.primary.pct_effect).toFixed(1)} percent lower reported theft</strong>{" "}
          than city and calendar effects predict (coefficient {beta.toFixed(3)}, standard error clustered by
          city {se.toFixed(3)}). A conventional 95 percent interval runs from roughly {pct(ciLo)} to{" "}
          {pct(ciHi)}, and with seven clusters even that interval is unreliable, which is why the permutation
          test is the primary check. Under it the estimate does not clear conventional significance (p ={" "}
          {D.s3.primary.perm_p_two_sided.toFixed(3)}); an association this size arises by chance about one time
          in six. The robustness variants promised in the pre-registration are all reported below.
        </p>
      </div>
      <div className="fr-wide">
        <div className="fr-tablebox">
          <table>
            <thead>
              <tr>
                <th>Specification</th>
                <th>Association</th>
                <th>Permutation p</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Primary (all seven cities, log counts)</td>
                <td className="num">{pct(D.s3.primary.pct_effect)}</td>
                <td className="num">{D.s3.primary.perm_p_two_sided.toFixed(3)}</td>
                <td>Pre-registered main specification</td>
              </tr>
              <tr>
                <td>Excluding Austin</td>
                <td className="num">{pct(D.s3.excl_austin.pct_effect)}</td>
                <td className="num">{D.s3.excl_austin.perm_p_two_sided.toFixed(3)}</td>
                <td>Drops the roughly 40-camera network; 360 permutations</td>
              </tr>
              <tr>
                <td>Excluding Denver</td>
                <td className="num">{pct(D.s3.excl_denver.pct_effect)}</td>
                <td className="num">{D.s3.excl_denver.perm_p_two_sided.toFixed(3)}</td>
                <td>Drops the city with an uncertain start date and a confounded decline</td>
              </tr>
              <tr>
                <td>San Francisco start moved to July 2024</td>
                <td className="num">{pct(D.s3.sf_on_2024_07.pct_effect)}</td>
                <td className="num">{D.s3.sf_on_2024_07.perm_p_two_sided.toFixed(3)}</td>
                <td>Full deployment instead of first installs</td>
              </tr>
              <tr>
                <td>Denver start moved to February 2024</td>
                <td className="num">{pct(D.denver_on_sensitivity["2024-02"].s3_pct_effect)}</td>
                <td className="num">{D.denver_on_sensitivity["2024-02"].s3_perm_p.toFixed(3)}</td>
                <td>Denver S2 change {pct(D.denver_on_sensitivity["2024-02"].s2_pct_change)}</td>
              </tr>
              <tr>
                <td>Denver start moved to June 2024</td>
                <td className="num">{pct(D.denver_on_sensitivity["2024-06"].s3_pct_effect)}</td>
                <td className="num">{D.denver_on_sensitivity["2024-06"].s3_perm_p.toFixed(3)}</td>
                <td>Denver S2 change {pct(D.denver_on_sensitivity["2024-06"].s2_pct_change)}</td>
              </tr>
              <tr>
                <td>Austin start moved to April 2024 (first cameras live March 29, 2024)</td>
                <td className="num">Austin S2 change {pct(D.austin_on_sensitivity["2024-04"].s2_pct_change)}</td>
                <td className="num">not applicable</td>
                <td>
                  Comparisons {pct(D.austin_on_sensitivity["2024-04"].s2_controls.chicago)},{" "}
                  {pct(D.austin_on_sensitivity["2024-04"].s2_controls.nyc)},{" "}
                  {pct(D.austin_on_sensitivity["2024-04"].s2_controls.seattle)}
                </td>
              </tr>
              <tr>
                <td>Winsorized at each city’s 1st and 99th percentile</td>
                <td className="num">{pct(D.s3.winsorized.pct_effect)}</td>
                <td className="num">{D.s3.winsorized.perm_p_two_sided.toFixed(3)}</td>
                <td>Limits the influence of extreme months</td>
              </tr>
              <tr>
                <td>Levels instead of logs</td>
                <td className="num">{D.s3.levels.toFixed(1)} thefts per month</td>
                <td className="num">not tested</td>
                <td>Coefficient in monthly thefts; no permutation run for this variant</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="fr-cap">
          Every variant lands between {pct(D.s3.excl_denver.pct_effect)} and {pct(D.s3.excl_austin.pct_effect)}.
          Only the variant that drops Austin clears p = 0.05. The no-ramp before and after comparison appears in
          the table above.
        </p>
      </div>
      <div className="fr-wrap">
        <div className="fr-callout feature">
          <b>How to state this finding</b>
          “In the two cities that deployed dense Flock networks and kept them, reported vehicle theft fell
          roughly 42 to 50 percent over months 7 to 18 after deployment, more than in any of three large
          comparison cities over the same months. A seven-city panel puts the association at 14 to 26 percent
          depending on specification, at the edge of what so small a panel can statistically distinguish from
          coincidence. It is an association consistent with the cameras helping, bundled with everything else
          those cities did at the same time. It is not proof.”
        </div>
      </div>
      <div className="fr-wide">
        <Figure id="es_sf" />
        <Figure
          id="es_oak"
          caption={
            <>
              <strong>Figures 3 and 4.</strong> Event studies (S4): the month-by-month difference in reported
              theft between the treated city and the three comparison cities, on a log scale, with the month
              before the event set to zero. San Francisco reaches roughly 55 percent below its pre-event
              relationship by month 24; Oakland’s post-event months range roughly 10 to 45 percent below.
              Whiskers are unadjusted 95 percent intervals.
            </>
          }
        />
      </div>

      <div className="fr-wrap">
        <Section num={7} title="The view from the block">
          <p>
            Transparent City’s product is built around a promise: your block, not just your city. So this section
            takes the San Francisco result down to street level, using the same public data. It was added after
            pre-registration and is labeled as a supplement, and it is descriptive.
          </p>
          <p>
            The DeFlock project crowdsources camera locations onto OpenStreetMap, and its volunteers have mapped{" "}
            {D.block.cameras} SFPD Flock camera positions in San Francisco, about {Math.round(D.block.cameras / 4)}{" "}
            percent of the 400-camera network. We measured the straight-line distance from each geocoded theft
            incident to the nearest mapped camera. Of 30,807 incidents in the window, {D.block.incidents_no_geo}{" "}
            lacked coordinates and were excluded, leaving {n(30807 - D.block.incidents_no_geo)}. SFPD publishes
            incident points snapped to intersections or block faces rather than exact addresses, so the distance
            bands are approximate. We then compared the twelve months before deployment (April 2023 to March
            2024) with the post-ramp period (October 2024 to June 2026), on camera blocks (within 250 meters of a
            camera) and away from them (500 meters or more from every camera).
          </p>
        </Section>
      </div>
      <div className="fr-wide">
        <Figure
          id="nearfar"
          caption={
            <>
              <strong>Figure 5.</strong> Monthly reported thefts within each band, indexed so the April 2023 to
              March 2024 average equals 100. Camera locations: OpenStreetMap contributors via the DeFlock
              project, retrieved 2026-08-31. The 250 to 500 meter buffer band is excluded.
            </>
          }
        />
      </div>
      <div className="fr-wrap">
        <div className="fr-bigstat">
          <b>
            −{Math.round(Math.abs(D.block.near.pct))}% / −{Math.round(Math.abs(D.block.far.pct))}%
          </b>
          <span>
            The decline in monthly reported theft on blocks within 250 meters of a mapped camera, and on blocks
            500 meters or more from every camera. The falls are nearly identical, and slightly larger away from
            the cameras.
          </span>
        </div>
        <p>
          Two things are visible here. First, the cameras sit where the problem was: blocks near cameras ran{" "}
          {Math.round(D.block.near.monthly_rate_before)} reported thefts per month before deployment against{" "}
          {Math.round(D.block.far.monthly_rate_before)} on distant blocks, consistent with SFPD’s stated placement
          on high-traffic corridors and entry routes. Second, the decline is citywide, not concentrated around
          camera sites. Reported theft on camera blocks fell {Math.abs(D.block.near.pct).toFixed(1)} percent;
          reported theft far from every camera fell {Math.abs(D.block.far.pct).toFixed(1)} percent.
        </p>
        <p>
          The teaching point is that fixed license plate readers are not scarecrows. If these cameras contributed
          to San Francisco’s decline, the geography is more consistent with an investigative network that
          identifies vehicles and closes cases across the whole city than with frightening thieves away from
          particular corners. That reading matches the randomized studies, which found no localized deterrence,
          and it matches what SFPD itself claims, which is arrests rather than deterrence. It also means
          block-level camera maps are a poor guide to where any benefit lands.
        </p>
        <h3>Every high-theft neighborhood logged fewer thefts</h3>
        <p>
          The same incident data, grouped by the city’s analysis neighborhoods, shows the before and after for
          every part of San Francisco. All {hoods.length} neighborhoods that logged at least 200 reported thefts
          in 2023 recorded fewer in 2025, with declines between {Math.round(hoodMin)} and {Math.round(hoodMax)}{" "}
          percent.
        </p>
      </div>
      <div className="fr-wide">
        <Figure
          id="dumbbell"
          caption={
            <>
              <strong>Figure 6.</strong> Neighborhoods with at least 200 reported thefts in 2023, ordered by 2023
              volume. Gray marks 2023; purple marks 2025. Source: wg3w-h783, analysis_neighborhood field.
            </>
          }
        />
        <div className="fr-tablebox">
          <table>
            <thead>
              <tr>
                <th>Neighborhood</th>
                <th>2023</th>
                <th>2025</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {hoods.map((h) => (
                <tr key={h.name}>
                  <td>{h.name}</td>
                  <td className="num">{n(h.y2023)}</td>
                  <td className="num">{n(h.y2025)}</td>
                  <td className="num">{pct(h.pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fr-cap">
          The steepest declines are in residential districts on the west and south sides, and the smallest are in
          the dense core. That gradient fits the national story in section 2, in which the Kia and Hyundai wave
          that had made street-parked cars in residential neighborhoods easy targets receded after software
          fixes.
        </p>
      </div>

      <div className="fr-wrap">
        <Section num={8} title="The off-switch: no rebound, so far">
          <p>
            If dense camera networks were suppressing vehicle theft in real time, switching them off should show
            up in the data. Two cities switched their networks off, which is the closest thing to that test the
            public record offers, and this is the finding that disciplines the pro-camera case.
          </p>
          <p>
            <strong>Austin</strong> shut its city network down on June 30, 2025. In the pre-registered comparison,
            the twelve months after the shutoff against the twelve before, reported thefts fell{" "}
            {Math.abs(s2.austin.off.pct_change).toFixed(1)} percent, faster than any comparison city. Because
            Texas DPS installed state-owned Flock readers along Austin rights-of-way on February 2, 2026, a
            post-hoc supplement also reports the clean seven-month window, July 2025 to January 2026, in which
            Austin fell {Math.abs(D.austin_clean_window.austin.pct).toFixed(1)} percent, again faster than any
            comparison city. Austin’s roughly 40-camera network was small enough that little should have been
            expected of its removal.
          </p>
        </Section>
      </div>
      <div className="fr-wide">
        <div className="fr-tablebox compact">
          <table>
            <thead>
              <tr>
                <th>Austin switch-off window</th>
                <th>Thefts per month before</th>
                <th>Thefts per month after</th>
                <th>Austin</th>
                <th>Chicago</th>
                <th>New York</th>
                <th>Seattle</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Pre-registered: July 2025 to June 2026</td>
                <td className="num">{s2.austin.off.pre_mean.toFixed(1)}</td>
                <td className="num">{s2.austin.off.post_mean.toFixed(1)}</td>
                <td className="num neg">{pct(s2.austin.off.pct_change)}</td>
                <td className="num">{pct(s2.austin.off.controls_pct_change.chicago)}</td>
                <td className="num">{pct(s2.austin.off.controls_pct_change.nyc)}</td>
                <td className="num">{pct(s2.austin.off.controls_pct_change.seattle)}</td>
              </tr>
              <tr>
                <td>Clean window, post-hoc: July 2025 to January 2026</td>
                <td className="num">{D.austin_clean_window.austin.pre_mean.toFixed(1)}</td>
                <td className="num">{D.austin_clean_window.austin.post_mean.toFixed(1)}</td>
                <td className="num neg">{pct(D.austin_clean_window.austin.pct)}</td>
                <td className="num">{pct(D.austin_clean_window.chicago.pct)}</td>
                <td className="num">{pct(D.austin_clean_window.nyc.pct)}</td>
                <td className="num">{pct(D.austin_clean_window.seattle.pct)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="fr-cap">Mean monthly reported thefts; comparison columns use the identical calendar windows.</p>
      </div>
      <div className="fr-wrap">
        <div className="fr-bigstat">
          <b>{pct(D.austin_clean_window.austin.pct)}</b>
          <span>
            Change in Austin’s monthly reported vehicle theft during its seven clean months with the Flock
            network off, a faster decline than any comparison city over the same months.
          </span>
        </div>
        <p>
          <strong>Denver</strong> went dark at the end of March 2026. Three post months are observable, April to
          June 2026, with 303, 381, and 385 reported thefts against a prior-year mean of{" "}
          {s2.denver.off.pre_mean.toFixed(1)} per month, which is{" "}
          <strong>down {Math.abs(s2.denver.off.pct_change).toFixed(1)} percent</strong>, roughly matching Seattle
          ({pct(s2.denver.off.controls_pct_change.seattle)}) while Chicago rose (
          {pct(s2.denver.off.controls_pct_change.chicago)}). The three months rise from April to May; Denver’s
          count also rose from April to May in 2024 and in 2025, so on three points this is seasonal noise rather
          than a trend. Three months is a short window, and criminals’ knowledge of camera removal may lag the
          removal itself.
        </p>
      </div>
      <div className="fr-wide">
        <Figure id="es_aus" />
        <Figure
          id="es_den"
          caption={
            <>
              <strong>Figures 7 and 8.</strong> Event studies around the switch-off events. Austin’s post-shutoff
              differences sit at or below zero, and Denver’s three post months are unremarkable.
            </>
          }
        />
      </div>
      <div className="fr-wrap">
        <div className="fr-callout warn">
          <b>What this means for the argument</b>
          The strongest version of the pro-camera case, that removing the cameras brings theft back, is not
          supported by the first two natural experiments available, within short windows. The defensible
          pro-camera case is the investigative one (section 3): the cameras are cheap, police departments
          attribute concrete arrests to them, and dense deployments coincided with outsized declines. Anyone
          claiming Denver or Austin “paid in crime” for canceling is, on present evidence, wrong, and this
          report will not say it.
        </div>

        <Section num={9} title="Recoveries">
          <p>
            San Francisco’s incident data records recovered vehicles alongside thefts: 7,413 recovery reports from
            April 2024 to June 2026. The ratio of recovery reports to theft reports was roughly 0.72 in the
            pre-camera period (January 2022 to March 2024) and 0.67 after the ramp (October 2024 to June 2026).
            Recoveries fell in proportion with thefts rather than rising as a share. The categories count incident
            reports, including vehicles stolen elsewhere and recovered in San Francisco, so the ratio is a rough
            gauge. It is worth stating plainly because “more recoveries” is a common vendor claim, and San
            Francisco’s open data shows fewer thefts and proportionally fewer recovery reports, not a rising
            recovery rate. Oakland’s recovery-labeled categories show a flat ratio near 0.11 throughout, and its
            category taxonomy differs too much from San Francisco’s for comparison.
          </p>
        </Section>
      </div>
      <div className="fr-wide">
        <Figure
          id="rec"
          caption={
            <>
              <strong>Figure 9.</strong> San Francisco monthly reported thefts (purple) and recovered-vehicle
              incidents (blue), with the deployment period shaded. Source: wg3w-h783.
            </>
          }
        />
      </div>

      <Part
        title="Part three: Reading the evidence"
        blurb="Where every number comes from, what the data cannot tell us, the governance record, and the conclusion the evidence supports."
      />

      <div className="fr-wrap">
        <Section num={10} title="Data, downloads, and queries">
          <p>
            Every number on this page traces to a public dataset. The pinned snapshot, the results, the
            methodology, the analysis scripts, and the PDF edition are published here so that nothing depends on
            access to Transparent City’s systems.
          </p>
          <ul className="fr-downloads">
            <li>
              <a href={`${DOWNLOADS}/monthly_series.csv`}>monthly_series.csv</a>
              <span>Seven cities, monthly reported thefts and per-100k rates, plus recovery series</span>
            </li>
            <li>
              <a href={`${DOWNLOADS}/flock_payments.csv`}>flock_payments.csv</a>
              <span>Every San Francisco and Denver payment and contract row used</span>
            </li>
            <li>
              <a href={`${DOWNLOADS}/flock_snapshot.json`}>flock_snapshot.json</a>
              <span>Raw pinned snapshot with the UTC retrieval timestamp</span>
            </li>
            <li>
              <a href={`${DOWNLOADS}/analysis_results.json`}>analysis_results.json</a>
              <span>Every statistic in this report, as computed</span>
            </li>
            <li>
              <a href={`${DOWNLOADS}/block_supplement.json`}>block_supplement.json</a>
              <span>Section 7 near/far bands and neighborhood counts</span>
            </li>
            <li>
              <a href={`${DOWNLOADS}/METHODOLOGY.md`}>METHODOLOGY.md</a>
              <span>The pre-registered methodology with its amendments log</span>
            </li>
            <li>
              <a href={`${DOWNLOADS}/pull_data.py`}>pull_data.py</a>, <a href={`${DOWNLOADS}/analyze.py`}>analyze.py</a>,{" "}
              <a href={`${DOWNLOADS}/block_analysis.py`}>block_analysis.py</a>, <a href={`${DOWNLOADS}/build_charts.py`}>build_charts.py</a>
              <span>The analysis code, in run order</span>
            </li>
            <li>
              <a href={`${DOWNLOADS}/Flock-by-the-Numbers.pdf`}>Flock-by-the-Numbers.pdf</a>
              <span>Print edition of this report</span>
            </li>
          </ul>
          <p>Each series below links to the live portal query that produced it.</p>
        </Section>
      </div>
      <div className="fr-wide">
        <div className="fr-tablebox">
          <table>
            <thead>
              <tr>
                <th>Series</th>
                <th>Portal</th>
                <th>Dataset</th>
                <th>Filter</th>
              </tr>
            </thead>
            <tbody>
              {PROVENANCE.map((row) => (
                <tr key={row.series}>
                  <td>
                    <a href={row.url} rel="noopener">{row.series}</a>
                  </td>
                  <td>{row.portal}</td>
                  <td><code>{row.dataset}</code></td>
                  <td><code>{row.filter}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fr-cap">
          All counts are by occurrence date, citywide, monthly. Police data back-fills, so trailing months may
          rise in later refreshes; the panel ends June 2026 for this reason.
        </p>
      </div>

      <div className="fr-wrap">
        <Section num={11} title="Limitations">
          <p>Read these before quoting anything above.</p>
          <ul className="fr-rules">
            <li>
              <strong>Small N, stated in our own voice.</strong> Seven cities and four treatment events. No
              specification here identifies a causal effect, and the permutation test exists precisely because
              seven clusters make conventional inference unreliable.
            </li>
            <li>
              <strong>No causal identification.</strong> San Francisco’s cameras arrived with a real-time crime
              center, drones, and staffing changes, and the contributions cannot be separated. The randomized
              literature on license plate reader deterrence, which predates Flock’s dense fixed networks, found
              null effects, and nothing here overturns it.
            </li>
            <li>
              <strong>The head start depends on the window.</strong> With no ramp skip, San Francisco’s
              first-year decline is only slightly ahead of Chicago and Seattle (section 6). The larger gap
              appears in months 7 to 18.
            </li>
            <li>
              <strong>The national wave dominates.</strong> The Kia and Hyundai correction and record national
              declines moved every series. Comparison cities absorb this only imperfectly because the wave hit
              cities unevenly, and New York’s smaller decline widens the comparison range.
            </li>
            <li>
              <strong>Comparison cities were not chosen for similarity.</strong> Chicago, New York, and Seattle
              are the Flock-free cities in Transparent City’s coverage. All three run license plate readers from
              other vendors, so the contrast is “dense Flock fixed network” against “other arrangements,” not
              cameras against none.
            </li>
            <li>
              <strong>Off-windows are short.</strong> Denver has three months. Austin has seven clean months
              before state-installed Flock cameras recontaminate the city. Both series will be re-run as data
              accumulates; see the update log below.
            </li>
            <li>
              <strong>Reported crime is not crime.</strong> Vehicle theft is among the best-reported offenses
              because insurance requires a report, which is why it is the outcome. It still undercounts.
            </li>
            <li>
              <strong>Denver’s start date is approximate</strong> (about two months either way, tested in section
              6), and its checkbook window means its Flock spend is a floor.
            </li>
            <li>
              <strong>The block-level supplement is descriptive and post-hoc.</strong> Camera coordinates are
              crowdsourced and cover about {Math.round(D.block.cameras / 4)} percent of the network; incident
              points are snapped to intersections; distance bands are coarse; cameras were placed on the
              highest-theft corridors, so near and far blocks differ at baseline.
            </li>
            <li>
              <strong>Category taxonomies differ across cities.</strong> Counts are never compared in levels
              across cities; only within-city changes are.
            </li>
          </ul>
        </Section>

        <Section num={12} title="The governance ledger">
          <p>
            The favorable numbers above are only credible next to a plain accounting of the criticisms, so here
            it is. The case against Flock in 2025 and 2026 was not that the cameras do not work. It was: local
            police running immigration-related lookups through Flock’s national network despite state law (NPR,
            February 2026); an Illinois Secretary of State audit in August 2025 finding that Customs and Border Protection
            accessed Illinois cameras through an undisclosed pilot (Capitol News Illinois); SFPD’s own June 2026 audit finding 299
            unauthorized searches of its data, including improper federal access (Mission Local); and officers
            criminally charged with using the system to track ex-partners (WBEZ, August 2026). A federal judge in
            Norfolk nonetheless held a 176-camera network constitutional in January 2026, a ruling now on appeal,
            and Flock’s August 2026 reforms, which cut the recommended default retention from 30 days to 7
            (existing customers keep their settings) and will require a case code on every search by the end of
            the year, answered several criticisms directly. National cancellation tallies come from advocacy
            trackers and are labeled as such.
          </p>
          <p>
            Our data adds one observation to this ledger: the cities that canceled over these governance failures
            have not, so far, seen a measurable rise in reported vehicle theft. Cities that keep the cameras are
            paying little for them; whether they are buying investigative capability is a claim only the
            departments can make. Either way, they owe their residents the audit discipline that San Francisco’s
            own review showed was missing.
          </p>
        </Section>

        <Section num={13} title="Conclusion">
          <p>
            Strip away the advocacy on both sides and the public record supports three sentences. Flock’s cameras
            cost the cities in our panel remarkably little: ${n(D.payments.sf_total_paid)} across four fiscal
            years in San Francisco, ${n(D.payments.denver_total)} visible in Denver’s checkbook, and zero in
            Chicago. Where networks were dense, reported vehicle theft fell farther and faster than in three
            large comparison cities, an association of 14 to 26 percent in our panel that is present in every
            specification but statistically fragile in the pre-registered one. And where the cameras were
            switched off, reported theft kept falling, which retires the strongest claim made on the cameras’
            behalf while leaving intact the modest, checkable one: a cheap tool, concrete department-attributed
            arrests, outsized coincident declines, and governance, not effectiveness, as the thing the fights
            should be about.
          </p>
        </Section>

        <Section num={14} title="References and reproduction">
          <ol className="fr-refs">
            <li>
              SF.gov, “San Francisco begins installing automated license plate readers” (2024).{" "}
              <a href="https://www.sf.gov/news--san-francisco-begins-installing-automated-license-plate-readers-disrupt-organized-theft-and">sf.gov</a>
            </li>
            <li>
              SFPD News Release 25-047, Real-Time Investigation Center results.{" "}
              <a href="https://www.sanfranciscopolice.org/news/san-francisco-police-department-real-time-investigation">sanfranciscopolice.org</a>
            </li>
            <li>
              Oaklandside, Newsom and CHP camera announcement (2024-03-29).{" "}
              <a href="https://oaklandside.org/2024/03/29/governor-gavin-newsom-announces-license-plate-reader-cameras-flock-safety-oakland/">oaklandside.org</a>
            </li>
            <li>
              Oaklandside, “Oakland approves $2M Flock surveillance camera plan” (2025-12-17).{" "}
              <a href="https://oaklandside.org/2025/12/17/oakland-flock-safety-council-approves-surveillance-cameras/">oaklandside.org</a>
            </li>
            <li>
              EFF, “Victory! Austin organizers cancel city’s Flock ALPR contract” (June 2025).{" "}
              <a href="https://www.eff.org/deeplinks/2025/06/victory-austin-organizers-cancel-citys-flock-alpr-contract">eff.org</a>
            </li>
            <li>
              KVUE, “Texas DPS installs license plate reader cameras in Austin” (installs 2026-02-02).{" "}
              <a href="https://www.kvue.com/article/news/local/dps-license-plate-reader-cameras-austin/269-372ec82a-ab8f-4f95-aa45-b0157dbf9b5c">kvue.com</a>
            </li>
            <li>
              9NEWS, “Denver removes all 110 Flock license plate reader cameras” (2026-04-01).{" "}
              <a href="https://www.9news.com/article/news/local/denver-removes-flock-license-plate-reader-cameras/73-eaf91d0a-3b90-45f5-8338-dbb9f79a8712">9news.com</a>
            </li>
            <li>
              Government Technology, “Denver Mayor Extends City’s Use of Flock License Plate Readers.”{" "}
              <a href="https://www.govtech.com/public-safety/denver-mayor-extends-citys-use-of-flock-license-plate-readers">govtech.com</a>
            </li>
            <li>
              San Francisco Standard, SFPD data sharing and the $3.9M contract (2025-09-08).{" "}
              <a href="https://sfstandard.com/2025/09/08/sfpd-flock-alpr-ice-data-sharing/">sfstandard.com</a>
            </li>
            <li>
              FBI UCR, Summary of Reported Crimes in the Nation, 2024.{" "}
              <a href="https://cde.ucr.cjis.gov/LATEST/resources/reports/UCR%20Summary%20of%20Reported%20Crimes%20in%20the%20Nation%202024.pdf">cde.ucr.cjis.gov</a>
            </li>
            <li>
              National Insurance Crime Bureau, 2024 and first-half 2025 releases.{" "}
              <a href="https://www.nicb.org/news/news-releases/vehicle-thefts-united-states-fell-17-2024">nicb.org</a>
            </li>
            <li>
              Lum, Koper et al., J. Experimental Criminology (2011); NIJ CrimeSolutions rating.{" "}
              <a href="https://link.springer.com/article/10.1007/s11292-011-9133-9">springer.com</a>
            </li>
            <li>
              NPR, “Why some cities are ditching their Flock license plate readers” (2026-02-17).{" "}
              <a href="https://www.npr.org/2026/02/17/nx-s1-5612825/flock-contracts-canceled-immigration-survillance-concerns">npr.org</a>
            </li>
            <li>
              Capitol News Illinois, on the Illinois Secretary of State audit finding CBP access through a Flock
              pilot (August 2025).{" "}
              <a href="https://capitolnewsillinois.com/news/hundreds-of-police-departments-use-camera-company-accused-of-breaking-state-law/">capitolnewsillinois.com</a>
            </li>
            <li>
              San Francisco Standard, reporting the 54 percent decline in vehicle theft from SFPD data
              (2026-03-25).{" "}
              <a href="https://sfstandard.com/2026/03/25/sf-surveillance-state-crime-drones-billionaires/">sfstandard.com</a>
            </li>
            <li>
              Mission Local, SFPD June 2026 audit, 299 unauthorized searches.{" "}
              <a href="https://missionlocal.org/2026/06/federal-agencies-sf-surveillance-flock-data-audit/">missionlocal.org</a>
            </li>
            <li>
              WBEZ, Flock in the Chicago suburbs (2026-08-27).{" "}
              <a href="https://www.wbez.org/public-safety/2026/08/27/flock-license-plate-reader-alpr-chicago-suburb">wbez.org</a>
            </li>
            <li>
              Courthouse News, Norfolk ruling of January 27, 2026 (reported February 2026).{" "}
              <a href="https://www.courthousenews.com/judge-holds-norfolks-license-plate-reader-use-constitutional/">courthousenews.com</a>
            </li>
            <li>
              San Francisco Chronicle, Flock’s August 2026 reforms.{" "}
              <a href="https://www.sfchronicle.com/crime/article/flock-cameras-ceo-surveillance-policy-22384139.php">sfchronicle.com</a>
            </li>
            <li>
              OpenStreetMap contributors via the DeFlock project (camera locations, retrieved 2026-08-31).{" "}
              <a href="https://deflock.me">deflock.me</a>
            </li>
          </ol>
          <p>
            Reproduction: download the four scripts and the snapshot in section 10. Running <code>pull_data.py</code>{" "}
            then <code>analyze.py</code> regenerates every number on this page from the live portals; trailing
            months will differ slightly as police data back-fills. The page source is public in the{" "}
            <a href="https://github.com/Transparentcity/Ui">Transparent City Ui repository</a>.
          </p>
        </Section>

        <h2 id="about">About Transparent City</h2>
        <p>
          Transparent City uses AI and public data to make civic information legible, understandable, and
          actionable for everyday residents. The service ingests the official open-data portals of the cities it
          covers, including payments, contracts, payroll, police incidents, and service requests, normalizes
          millions of records, and turns them into plain-language reporting that links every number back to the
          dataset it came from. Its editorial rule for this report, as for all its reporting, is simple: no
          manufactured certainty, and no conclusions the data does not support.
        </p>

        <div className="fr-version">
          <h3>Version, updates, and corrections</h3>
          <p>
            Version {VERSION}, published {PUBLISHED}. Data retrieved {RETRIEVED} UTC; panel through June 2026.
            Author: Transparent City (Adam Werbach); analysis and drafting assisted by Claude, with every number
            traced to the pinned snapshot above. Independent of Flock Safety, its investors, and campaign
            organizations on all sides; no non-public data was used.
          </p>
          <p>
            This page is the canonical edition of the report. It will be refreshed as the cities publish more
            months, without changing any pre-registered specification; each refresh bumps the version and is
            logged here. Corrections are made in place and noted below with the date. Send corrections to{" "}
            <a href="mailto:seymour@transparent.city">seymour@transparent.city</a>.
          </p>
          <p>
            How to cite: Transparent City, “Flock by the Numbers,” version {VERSION}, {PUBLISHED},
            transparent.city/reports/flock.
          </p>
          <ul>
            <li>
              Version 1.0 ({PUBLISHED}): first publication. Pre-review corrections applied before release:
              neighborhood count (18, not 14), camera-map coverage (about 83 percent), geocoded incident count,
              the four-fiscal-year payment span, and the drone share of San Francisco’s total.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
