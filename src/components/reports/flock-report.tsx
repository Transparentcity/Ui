import type { ReactNode } from "react";
import { FLOCK_DATA } from "@/lib/reports/flockData";
import { FLOCK_FIGURES, type FlockFigureKey } from "@/lib/reports/flockFigures";

// Long-form report. Numbers come from the pinned analysis snapshot exported by
// transparentcity-platform (scripts/analysis/flock); prose mirrors docs/flock/REPORT.md.

const D = FLOCK_DATA;

function pct(v: number): string {
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toFixed(1)}%`;
}

function n(v: number): string {
  return v.toLocaleString("en-US");
}

function Figure({ id, caption }: { id: FlockFigureKey; caption?: ReactNode }) {
  return (
    <figure>
      <div className="fr-figwrap" dangerouslySetInnerHTML={{ __html: FLOCK_FIGURES[id] }} />
      {caption ? <figcaption className="fr-cap">{caption}</figcaption> : null}
    </figure>
  );
}

function Section({ num, title, children }: { num: string; title: string; children: ReactNode }) {
  return (
    <>
      <h2 id={`s${num}`}>
        <span className="fr-secnum">{num}</span>
        {title}
      </h2>
      {children}
    </>
  );
}

function Part({ label, title, blurb }: { label: string; title: string; blurb: string }) {
  return (
    <section className="fr-part">
      <small>{label}</small>
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
  nyc: "New York City",
  seattle: "Seattle",
};

export function FlockReport() {
  const s2 = D.s2;
  const onRows = [
    { label: "San Francisco on (2024-04)", r: s2.sf.on },
    { label: "Oakland on (2024-04)", r: s2.oakland.on },
    { label: "Denver on (2024-04)", r: s2.denver.on },
    { label: "Austin on (2024-02, about 40 cameras)", r: s2.austin.on },
  ];
  const annualOrder = ["sf", "oakland", "denver", "austin", "chicago", "nyc", "seattle"] as const;

  return (
    <div className="flock-report" data-testid="flock-report">
      <section className="fr-cover">
        <div className="fr-cover-top">
          <span>Transparent City</span>
          <span>September 2026</span>
        </div>
        <div>
          <h1>
            Flock by{" "}
            <br />
            the Numbers
          </h1>
          <p className="fr-dek">
            What five American cities actually paid Flock Safety, what happened to vehicle theft while the
            cameras ran, and what happened where they were switched off.
          </p>
        </div>
        <div className="fr-cover-stats">
          <div>
            <b>$5.19M</b>
            <span>paid by San Francisco, from the city checkbook</span>
          </div>
          <div>
            <b>−54%</b>
            <span>SF vehicle theft since deployment, reproduced from raw data</span>
          </div>
          <div>
            <b>7</b>
            <span>cities in the pre-registered monthly panel, 2022 to 2026</span>
          </div>
          <div>
            <b>0</b>
            <span>rebound detected where the cameras were switched off</span>
          </div>
        </div>
      </section>

      <section className="fr-findings">
        <h2>Key findings</h2>
        <div className="fr-kfgrid">
          <div className="fr-kfc">
            <b>$5.19M</b>
            <span>
              San Francisco has paid Flock Safety $5.19 million to date, about 0.03% of one year’s city budget.
              Every dollar is visible in the city checkbook and matches independent reporting.
            </span>
          </div>
          <div className="fr-kfc">
            <b>−54%</b>
            <span>
              San Francisco vehicle theft fell 54% from 2023 to 2025. We reproduce the city’s own claim from raw
              incident data: 8,985 thefts down to 4,143.
            </span>
          </div>
          <div className="fr-kfc">
            <b>−49.5% vs −36.6%</b>
            <span>
              In the year and a half after deployment, SF fell faster than every comparison city. Oakland, the
              other dense network, fell 41.9%. Austin’s 40-camera pilot tracked the comparisons exactly.
            </span>
          </div>
          <div className="fr-kfc">
            <b>0 rebound</b>
            <span>
              Austin and Denver switched their networks off. Theft kept falling in both, as fast as or faster
              than comparison cities. The strongest pro-camera claim has no support so far.
            </span>
          </div>
          <div className="fr-kfc">
            <b>−50% / −59%</b>
            <span>
              Blocks within 250 meters of a camera fell 50%; blocks 500 meters or more from every camera fell
              59%. The decline is citywide, which points to an investigative network, not deterrence at the
              corner.
            </span>
          </div>
          <div className="fr-kfc">
            <b>14 of 14</b>
            <span>
              Every San Francisco neighborhood with 200 or more thefts in 2023 recorded fewer in 2025, with
              declines between 37% and 69%.
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
            <span>months, Jan 2022 to Jun 2026</span>
          </div>
          <div>
            <b>30,807</b>
            <span>geocoded SF theft incidents</span>
          </div>
          <div>
            <b>{D.block.cameras}</b>
            <span>mapped SFPD camera positions</span>
          </div>
          <div>
            <b>11</b>
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
            <strong>Abstract.</strong> Flock Safety’s license-plate-reading cameras are the most contested
            public-safety technology in America. This report sets aside claims from both the company and its
            critics and asks only what public records show. Using city open-data portals, we assemble every
            payment San Francisco and Denver made to Flock Safety, verify that Chicago has made none, and
            construct a seven-city monthly panel of motor vehicle theft (2022 to 2026) spanning two cities that
            deployed dense Flock networks (San Francisco, Oakland), two that deployed and later shut them down
            (Austin, Denver), and three Flock-free comparisons (Chicago, New York, Seattle).
          </p>
          <p>
            Three findings. <strong>First, the cost is small.</strong> San Francisco’s entire 400-camera program
            has cost $5.19 million to date, and we independently reproduce, from raw incident data, the city’s
            claim that vehicle theft has fallen 54% since deployment.{" "}
            <strong>Second, where Flock networks are dense, theft fell faster than in comparison cities.</strong>{" "}
            San Francisco fell 49.5% and Oakland 41.9% over matched twelve-month windows, against declines of
            12.6% to 36.6% in the three comparison cities. Our panel estimate is an 18% association (permutation
            p = 0.16), sharpening to 26% (p = 0.017) when the 40-camera Austin network is excluded per
            pre-registered robustness.{" "}
            <strong>
              Third, and contrary to the strongest version of the pro-camera case, switching the networks off
              produced no detectable rebound.
            </strong>{" "}
            Theft kept falling in Austin and in Denver. The honest conclusion is that Flock’s cameras are a cheap
            tool that coincided with outsized declines where densely deployed, that removal has not so far cost
            the cancelling cities any measurable increase in vehicle theft, and that the technology’s real
            vulnerabilities are governance failures, not ineffectiveness.
          </p>
        </div>

        <nav className="fr-toc" aria-label="Contents">
          <h3>Contents</h3>
          <ol>
            <li>The story in brief</li>
            <li><b>01</b> Why this report exists</li>
            <li><b>02</b> National context</li>
            <li><b>03</b> Follow the money</li>
            <li><b>04</b> Design and pre-registration</li>
            <li><b>05</b> What the seven cities look like</li>
            <li><b>06</b> Deployment: theft fell faster where cameras were dense</li>
            <li><b>07</b> The view from the block</li>
            <li><b>08</b> The off-switch: no rebound, so far</li>
            <li><b>09</b> Recoveries</li>
            <li><b>10</b> Data provenance</li>
            <li><b>11</b> Limitations</li>
            <li><b>12</b> The governance ledger</li>
            <li><b>13</b> Conclusion</li>
            <li><b>14</b> References and reproduction</li>
          </ol>
        </nav>
      </div>

      <Part
        label="Part one"
        title="The setting"
        blurb="Why the question matters, what the country was doing to vehicle theft at the same time, and what the cities actually paid."
      />

      <div className="fr-wrap">
        <h2>The story in brief</h2>
        <p>
          <strong>
            Two American cities switched off their Flock Safety camera networks in the past year, and vehicle
            theft in both kept falling.
          </strong>{" "}
          That is the central new fact in this report, and to our knowledge no one has published it. Austin
          ended its contract in June 2025 and saw theft drop 12.7% over the following seven months, faster than
          Chicago, New York, or Seattle over the same period. Denver removed all 110 cameras in March 2026 and
          has seen no rebound in the three months since. The most alarming claim made on the cameras’ behalf,
          that removing them invites a crime wave, has no support in the first real-world tests.
        </p>
        <p>
          At the same time, the cities that kept dense networks got a remarkable bargain by any municipal
          standard. San Francisco has paid Flock Safety $5.19 million total, about 0.03% of one year’s city
          budget, and its vehicle theft has fallen 54% since deployment, a decline that outpaced every comparison
          city in our panel. Whether the cameras caused any part of that decline cannot be proven with public
          data, and this report does not claim it. What can be shown is the full ledger: what was paid, what
          happened, and what happened where the cameras came down.
        </p>
        <p>
          Every number in this report comes from the cities’ own published records and can be re-queried by any
          reader, and the analysis plan was committed to a public repository before any result was computed.
        </p>

        <Section num="01" title="Why this report exists">
          <p>
            Flock Safety operates automated license plate readers (ALPRs) for over 5,000 law-enforcement
            agencies. Since 2025, reporting on immigration-related lookups through Flock’s national search
            network, an Illinois Attorney General audit finding that Customs and Border Protection accessed
            Illinois cameras through an undisclosed pilot, and a string of officer-misuse cases have driven dozens
            of cities to cancel contracts. The exact national tally (30, 53, or 80 cities, depending on the
            tracker) is advocacy-sourced and is not relied on here. Austin canceled in June 2025. Denver removed
            all 110 cameras when its contract expired in March 2026. Meanwhile San Francisco, which deployed 400
            cameras in 2024, and Oakland, which renewed its 290-camera contract in December 2025, kept theirs.
          </p>
          <p>
            Both sides of this fight argue mostly from anecdotes and advocacy tallies. What has been missing is
            the boring middle layer: the actual contracts and payments in city checkbooks, and the actual crime
            series in city open-data portals, analyzed under rules fixed in advance. Transparent City ingests
            exactly these datasets for its covered cities. That is the entire contribution of this report. We
            claim no access to Flock, no access to police departments, and nothing that cannot be re-queried by
            any reader.
          </p>
          <p>
            A note on posture. We undertook this analysis expecting the data to be broadly favorable to Flock,
            and much of it is. But the methodology (section 4) was committed to our repository before any
            outcome statistic was computed, and it binds us to publish whatever came out, including the finding
            in section 8 that undercuts the strongest pro-camera argument. Nothing in this report should be read
            as a causal claim; the design supports careful association language only.
          </p>
        </Section>

        <Section num="02" title="National context: theft was falling everywhere">
          <p>
            This is the single most important caveat, so it comes first. US motor vehicle theft fell
            dramatically over exactly the period Flock networks expanded. The FBI estimates the national theft
            rate dropped 19.4% in 2024, the largest one-year decline ever recorded in the category, and the
            National Insurance Crime Bureau reports a further 23% decline in the first half of 2025. A major
            driver was the subsidence of the 2022 to 2023 Kia and Hyundai theft wave after manufacturer software
            fixes, which hit cities unevenly. Colorado additionally felonized all motor vehicle theft in July
            2023, before Denver’s cameras went up.
          </p>
          <div className="fr-bigstat">
            <b>−19.4%</b>
            <span>
              The one-year drop in the national motor vehicle theft rate in 2024, per the FBI. The largest ever
              recorded. Every finding below sits on top of this wave.
            </span>
          </div>
          <p>
            Every city in our panel shows a large decline, with or without Flock. Any analysis that shows a chart
            of theft falling after camera installation and stops there is misleading. The only interesting
            question is whether Flock cities fell <em>faster than comparable cities</em>, and what happened at the
            off-switches. That is what the rest of this report measures.
          </p>
        </Section>

        <Section num="03" title="Follow the money">
          <p>
            We queried each city’s payment and contract datasets for vendor names matching “FLOCK” (excluding one
            unrelated 2007 individual and a Chicago nonprofit containing the word). Results, verbatim from the
            portals:
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
                <td className="num">${n(D.payments.sf_contracts[0].agreed)} agreed</td>
              </tr>
              <tr>
                <td></td>
                <td>cqi5-hm2d (contracts)</td>
                <td>“POL - Flock Aerodome DFR” (drone as first responder), term 2025-09-22 to 2027-09-21</td>
                <td className="num">${n(D.payments.sf_contracts[1].agreed)} agreed</td>
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
                <td className="num">${n(Math.round(D.payments.denver_total))}</td>
              </tr>
              <tr>
                <td><strong>Chicago</strong></td>
                <td>s4vu-giwb (payments)</td>
                <td>Zero payments to Flock Safety or Flock Group. CPD’s ALPR vendor is Motorola/Vigilant</td>
                <td className="num">$0</td>
              </tr>
              <tr>
                <td><strong>Oakland</strong></td>
                <td></td>
                <td>
                  No queryable checkbook on the open-data portal. The initial 290-camera network was CHP-funded;
                  the city’s own two-year renewal, approved December 2025, is roughly $2M per council record
                </td>
                <td className="num">~$2M (cited)</td>
              </tr>
              <tr>
                <td><strong>Austin</strong></td>
                <td></td>
                <td>
                  No queryable checkbook on the open-data portal. Roughly 40 fixed cameras under a pilot that
                  ended 2025-06-30, per council records and press
                </td>
                <td className="num">n/a (cited)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="fr-cap">
          Retrieved 2026-08-29, with the UTC timestamp pinned in the data snapshot. SF’s ALPR program was funded
          largely by a $17.3M state Organized Retail Theft Prevention Grant. Denver’s public checkbook covers
          recent years, so Denver’s visible spend is a floor, not a total.
        </p>
      </div>
      <div className="fr-wrap">
        <p>
          These checkbook figures match independent reporting. The San Francisco Standard, working from city
          contracting documents, reported that SFPD agreed to pay Flock more than $3.9 million for access to its
          technology between February 20, 2024 and February 19, 2027, with a yearly renewal cost of $1.2
          million. Both figures match the contract and voucher rows above. For Denver, the mayor’s office
          approved a Flock contract for just under $500,000 covering the 110-camera network, per Government
          Technology and CBS Colorado; the ${n(Math.round(D.payments.denver_total))} visible in the
          state-published checkbook is the portion of that spending inside the checkbook’s window.
        </p>
        <div className="fr-bigstat">
          <b>${n(D.payments.sf_total_paid)}</b>
          <span>
            Total vouchers paid by San Francisco to Flock Safety across fiscal years 2024 to 2027, per dataset
            n9pm-xkyq. Independently matched by SF Standard reporting.
          </span>
        </div>
        <p>
          Scale matters here. San Francisco’s adopted budget is roughly $15.9 billion per year; $5.19 million
          across three fiscal years is on the order of 0.03% of two annual budgets. Whatever else is true about
          Flock, no city in our panel bought it at a price where cost-effectiveness turns on fine margins. SFPD
          separately attributes 207 arrests to its Flock ALPRs, including 166 stolen-vehicle arrests. Those are
          the department’s numbers, not ours, and they are not independently verifiable from open data.
        </p>

        <Section num="04" title="Design and pre-registration">
          <p>
            The full methodology was committed to Transparent City’s repository (commit <code>f093c5df</code>,
            2026-08-29) after schema feasibility probes but before any monthly outcome series was assembled or
            any statistic computed. The rules were fixed before results were seen. In brief:
          </p>
          <ul className="fr-rules">
            <li>
              <strong>Panel.</strong> Seven cities, monthly motor-vehicle-theft counts by occurrence date, 2022-01
              to 2026-06, from each city’s own portal. Treated: SF (on 2024-04), Oakland (on 2024-04), Austin
              (on 2024-02, off 2025-07), Denver (on 2024-04 plus or minus two months, flagged; off 2026-04).
              Comparisons: Chicago, New York, Seattle. All three are Flock-free but not ALPR-free.
            </li>
            <li>
              <strong>S2 pre/post.</strong> For ON events: mean monthly theft in the 12 months before deployment
              against months 7 to 18 after (skipping a 6-month ramp), with identical windows for each comparison
              city. For OFF events: all available post months.
            </li>
            <li>
              <strong>S3 difference-in-differences.</strong> Log theft on a Flock-active indicator with city and
              month fixed effects. Because 7 clusters make asymptotic inference unreliable, significance comes
              from randomization inference across all 840 assignments of the four treatment paths to the seven
              cities.
            </li>
            <li>
              <strong>S4 event studies.</strong> Monthly coefficients relative to each event, treated city
              against the three comparisons.
            </li>
            <li>
              <strong>S5 recoveries.</strong> Recovered-vehicle counts and recovery-per-theft ratios where
              published (SF, Oakland).
            </li>
            <li>
              <strong>Publication rule.</strong> Results are published as computed, favorable or not, in
              correlational language throughout.
            </li>
          </ul>
          <p>
            Two items were added after pre-registration and are logged in the methodology’s amendments section:
            the verified Texas DPS install date for Austin (2026-02-02), and the block-level supplement in
            section 7, which is descriptive.
          </p>
        </Section>
      </div>

      <Part
        label="Part two"
        title="The findings"
        blurb="Seven cities, four camera events, one pre-registered set of rules. What happened when networks went on, what happened on the blocks, and what happened when they went off."
      />

      <div className="fr-wrap">
        <Section num="05" title="What the seven cities look like">
          <p>
            The panels below show monthly thefts per 100,000 residents. The shaded band marks the months when
            each city’s Flock network was active.
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
          <strong>Figure 1.</strong> Sources: SF wg3w-h783, Oakland ppgh-7dqv, Austin fdj4-gpfu, Denver
          ODC_CRIME_OFFENSES_P, Chicago ijzp-q8t2, NYC qgea-i56i and 5uac-w243, Seattle tazs-3rd5. Rates use
          Census Vintage-2023 populations, held constant. Every series declines from its 2023 peak, which is the
          national wave of section 2. Denver’s decline begins in 2023, before its cameras, coinciding with
          Colorado’s felony-theft law, and Chicago ticks up in 2026 without any Flock change.
        </p>
        <div className="fr-tablebox">
          <table>
            <thead>
              <tr>
                <th>City</th>
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
          Annual reported motor vehicle thefts from the pinned snapshot. The two dense always-on Flock cities sit
          at the top of the range alongside Denver, whose decline has non-Flock explanations documented above.
        </p>
      </div>

      <div className="fr-wrap">
        <Section num="06" title="Deployment: theft fell faster where cameras were dense">
          <p>This section carries the favorable evidence, with its confidence honestly stated.</p>
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
                <th>Event</th>
                <th>12-month pre mean</th>
                <th>Post mean (months 7 to 18)</th>
                <th>Change</th>
                <th>Chicago</th>
                <th>NYC</th>
                <th>Seattle</th>
              </tr>
            </thead>
            <tbody>
              {onRows.map(({ label, r }) => (
                <tr key={label}>
                  <td><strong>{label}</strong></td>
                  <td className="num">{r.pre_mean.toFixed(1)}</td>
                  <td className="num">{r.post_mean.toFixed(1)}</td>
                  <td className="num neg">{pct(r.pct_change)}</td>
                  <td className="num">{pct(r.controls_pct_change.chicago)}</td>
                  <td className="num">{pct(r.controls_pct_change.nyc)}</td>
                  <td className="num">{pct(r.controls_pct_change.seattle)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fr-cap">
          Mean monthly citywide motor vehicle thefts. Comparison-city columns apply the identical calendar
          windows. Denver’s row carries the Colorado confounders from section 2. SF’s cameras arrived bundled
          with the Real-Time Investigation Center, drones, and staffing changes, and the contributions cannot be
          separated.
        </p>
      </div>
      <div className="fr-wrap">
        <p>
          The pattern is consistent with camera density mattering. San Francisco (400 cameras, about 49 per 100k
          residents) and Oakland (290 city cameras plus 190 CHP highway cameras) outfell every comparison city.
          Austin, whose pilot amounted to roughly 40 cameras in a city of a million people, tracked the
          comparison cities almost exactly.
        </p>
        <p>
          The panel model summarizes the same contrast. Across all seven cities, city-months with an active Flock
          network show <strong>{Math.abs(D.s3.primary.pct_effect).toFixed(1)}% lower theft</strong> than city and
          calendar effects predict (coefficient {D.s3.primary.beta.toFixed(3)}, cluster SE{" "}
          {D.s3.primary.se_cluster.toFixed(3)}). Under the pre-registered permutation test this does not clear
          conventional significance (p = {D.s3.primary.perm_p_two_sided.toFixed(3)}). With only four treatment
          paths among seven cities, a co-movement this size arises by chance about one time in six. The
          pre-registered robustness that excludes the low-dose Austin network sharpens the estimate to{" "}
          <strong>
            {pct(D.s3.excl_austin.pct_effect)} with permutation p = {D.s3.excl_austin.perm_p_two_sided.toFixed(3)}
          </strong>
          . Excluding Denver instead yields {pct(D.s3.excl_denver.pct_effect)}, p ={" "}
          {D.s3.excl_denver.perm_p_two_sided.toFixed(3)}. Shifting SF’s start to full deployment (2024-07)
          changes little ({pct(D.s3.sf_on_2024_07.pct_effect)}, p ={" "}
          {D.s3.sf_on_2024_07.perm_p_two_sided.toFixed(3)}).
        </p>
        <div className="fr-callout feature">
          <b>How to say this honestly</b>
          “In the two cities that deployed dense Flock networks and kept them, vehicle theft fell roughly 42 to
          50% within a year and a half, more than in any of three large comparison cities over the same months.
          A seven-city panel puts the association at 18 to 26% depending on specification, at the edge of what so
          small a panel can statistically distinguish from coincidence. It is an association consistent with the
          cameras helping, bundled with everything else those cities did at the same time. It is not proof.”
        </div>
      </div>
      <div className="fr-wide">
        <Figure id="es_sf" />
        <Figure
          id="es_oak"
          caption={
            <>
              <strong>Figures 3 and 4.</strong> Event studies (S4): monthly log-difference in theft for the
              treated city relative to the three comparison cities, normalized to the month before the event.
              Both cities drift down through the post period, reaching roughly 40 to 60 log points below
              baseline by month +24.
            </>
          }
        />
      </div>

      <div className="fr-wrap">
        <Section num="07" title="The view from the block">
          <p>
            Transparent City’s product is built around a promise: your block, not just your city. So this section
            takes the San Francisco result down to street level, using the same public data. It was added after
            pre-registration and is labeled as a supplement; treat it as descriptive.
          </p>
          <p>
            The DeFlock project crowdsources camera locations onto OpenStreetMap, and its volunteers have mapped{" "}
            {D.block.cameras} SFPD Flock camera positions in San Francisco, roughly 70% of the 400-camera network.
            We measured the straight-line distance from each of 30,807 geocoded theft incidents to the nearest
            mapped camera, then compared the twelve months before deployment with the post-ramp period, on camera
            blocks (within 250 meters of a camera) and away from them (500 meters or more from every camera).
          </p>
        </Section>
      </div>
      <div className="fr-wide">
        <Figure
          id="nearfar"
          caption={
            <>
              <strong>Figure 5.</strong> Monthly thefts within each band, indexed so the April 2023 to March 2024
              average equals 100. Camera locations: OpenStreetMap contributors via the DeFlock project, retrieved
              2026-08-31. Incidents without coordinates ({D.block.incidents_no_geo} of 30,807) and the 250 to 500
              meter buffer band are excluded.
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
            The decline in monthly theft on blocks within 250 meters of a mapped camera, and on blocks 500 meters
            or more from every camera. The falls are nearly identical, and slightly larger away from the cameras.
          </span>
        </div>
        <p>
          Two things are visible here. First, the cameras sit where the problem was: blocks near cameras ran{" "}
          {Math.round(D.block.near.monthly_rate_before)} thefts per month before deployment against{" "}
          {Math.round(D.block.far.monthly_rate_before)} on distant blocks, consistent with SFPD’s stated placement
          on high-traffic corridors and entry routes. Second, the decline is citywide, not concentrated around
          camera sites. Theft on camera blocks fell {Math.abs(D.block.near.pct).toFixed(1)}%; theft far from every
          camera fell {Math.abs(D.block.far.pct).toFixed(1)}%.
        </p>
        <p>
          The teaching point: fixed license plate readers are not scarecrows. If these cameras contributed to San
          Francisco’s decline, the geography says they did it as an investigative network, identifying vehicles
          and closing cases across the whole city, rather than by frightening thieves away from particular
          corners. That reading is consistent with the randomized studies, which found no localized deterrence,
          and with what SFPD itself claims, which is arrests, not deterrence. It also means block-level camera
          maps are a poor guide to where the benefit lands.
        </p>
        <h3>Every high-theft neighborhood improved</h3>
        <p>
          The same incident data, grouped by the city’s analysis neighborhoods, shows the before and after for
          every part of San Francisco. All {D.block.neighborhoods.length} neighborhoods that logged at least 200
          thefts in 2023 recorded fewer in 2025, with declines between 37% and 69%.
        </p>
      </div>
      <div className="fr-wide">
        <Figure
          id="dumbbell"
          caption={
            <>
              <strong>Figure 6.</strong> Neighborhoods with at least 200 thefts in 2023, ordered by 2023 volume.
              Gray marks 2023; purple marks 2025. Source: wg3w-h783, analysis_neighborhood field.
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
              {D.block.neighborhoods.map((h) => (
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
        <Section num="08" title="The off-switch: no rebound, so far">
          <p>
            If dense camera networks were suppressing vehicle theft in real time, switching them off should show
            up in the data. Two cities ran that experiment for us. This is the finding that disciplines the
            pro-camera case.
          </p>
          <p>
            <strong>Austin</strong> shut its city network down on 2025-06-30. The pre-registered comparison
            (twelve months before against all twelve available post months) shows monthly theft falling from{" "}
            {s2.austin.off.pre_mean.toFixed(1)} to {s2.austin.off.post_mean.toFixed(1)}, a{" "}
            {Math.abs(s2.austin.off.pct_change).toFixed(1)}% decline, against{" "}
            {pct(s2.austin.off.controls_pct_change.chicago)} in Chicago,{" "}
            {pct(s2.austin.off.controls_pct_change.nyc)} in New York, and{" "}
            {pct(s2.austin.off.controls_pct_change.seattle)} in Seattle over the identical months. Because Texas
            DPS installed state-owned Flock readers along Austin rights-of-way on 2026-02-02, a post-hoc
            supplement also reports the clean seven-month window: Austin averaged{" "}
            {D.austin_clean_window.austin.post_mean.toFixed(1)} thefts a month against{" "}
            {D.austin_clean_window.austin.pre_mean.toFixed(1)} in the prior year, a{" "}
            {Math.abs(D.austin_clean_window.austin.pct).toFixed(1)}% decline, against{" "}
            {pct(D.austin_clean_window.chicago.pct)} (Chicago), {pct(D.austin_clean_window.nyc.pct)} (New York),
            and {pct(D.austin_clean_window.seattle.pct)} (Seattle). Austin’s roughly 40-camera network was small
            enough that little should have been expected of its removal.
          </p>
          <div className="fr-bigstat">
            <b>{pct(D.austin_clean_window.austin.pct)}</b>
            <span>
              Change in Austin’s monthly vehicle theft during its seven clean months with the Flock network off,
              a faster decline than any comparison city.
            </span>
          </div>
          <p>
            <strong>Denver</strong> went dark at the end of March 2026. Three post months are observable: 303,
            381, and 385 thefts against a prior-year mean of {s2.denver.off.pre_mean.toFixed(1)}, which is{" "}
            <strong>down {Math.abs(s2.denver.off.pct_change).toFixed(1)}%</strong>, roughly matching Seattle (
            {pct(s2.denver.off.controls_pct_change.seattle)}) while Chicago rose (
            {pct(s2.denver.off.controls_pct_change.chicago)}). There is no jump and no visible trend break. Three
            months is a short window, and criminals’ knowledge of camera removal may lag the removal itself.
          </p>
        </Section>
      </div>
      <div className="fr-wide">
        <Figure id="es_aus" />
        <Figure
          id="es_den"
          caption={
            <>
              <strong>Figures 7 and 8.</strong> Event studies around the OFF events. Austin’s post-off coefficients
              sit at or below zero, and Denver’s three post months are unremarkable.
            </>
          }
        />
      </div>
      <div className="fr-wrap">
        <div className="fr-callout warn">
          <b>What this means for the argument</b>
          The strongest version of the pro-camera case, that removing the cameras brings theft back, is not
          supported by the first two natural experiments available, within short windows. The defensible
          pro-camera case is the investigative one (sections 3 and 9): the cameras are cheap, police departments
          attribute concrete arrests and recoveries to them, and dense deployments coincided with outsized
          declines. Anyone claiming Denver or Austin “paid in crime” for canceling is, on present evidence,
          wrong. This report will not say it.
        </div>

        <Section num="09" title="Recoveries">
          <p>
            San Francisco’s incident data records recovered vehicles alongside thefts: 7,413 recoveries since
            April 2024. The recovery-to-theft ratio, however, was roughly 0.72 in the pre-camera period and 0.67
            after. Recoveries fell in proportion with thefts rather than rising as a share. (The categories count
            incident reports, including vehicles stolen elsewhere and recovered in SF, so the ratio is a rough
            gauge.) This is worth stating plainly because “more recoveries” is a common camera-vendor claim.
            SF’s open data shows fewer thefts and proportionally fewer recovery reports, not a rising recovery
            rate. Oakland’s recovery-labeled categories show a flat ratio near 0.11 throughout; its category
            taxonomy differs too much from SF’s for comparison.
          </p>
        </Section>
      </div>
      <div className="fr-wide">
        <Figure
          id="rec"
          caption={
            <>
              <strong>Figure 9.</strong> San Francisco monthly thefts (purple) and recovered-vehicle incidents
              (blue), with the deployment period shaded. Source: wg3w-h783.
            </>
          }
        />
      </div>

      <Part
        label="Part three"
        title="Reading it honestly"
        blurb="Where every number comes from, what the data cannot tell us, the governance record, and the conclusion the evidence supports."
      />

      <div className="fr-wrap">
        <Section num="10" title="Data provenance">
          <p>Every series in this report can be re-queried by any reader.</p>
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
              {[
                ["SF thefts / recoveries", "data.sfgov.org", "wg3w-h783", "incident_category = 'Motor Vehicle Theft' / 'Recovered Vehicle'"],
                ["SF payments", "data.sfgov.org", "n9pm-xkyq", "vendor = 'FLOCK SAFETY'"],
                ["SF contracts", "data.sfgov.org", "cqi5-hm2d", "prime_contractor like '%FLOCK%'"],
                ["Oakland thefts", "data.oaklandca.gov", "ppgh-7dqv", "crimetype = 'STOLEN VEHICLE'"],
                ["Austin thefts", "data.austintexas.gov", "fdj4-gpfu", "crime_type = 'AUTO THEFT'"],
                ["Denver thefts", "denvergov.org (ArcGIS)", "ODC_CRIME_OFFENSES_P/324", "OFFENSE_CATEGORY_ID = 'auto-theft'"],
                ["Denver payments", "data.colorado.gov", "wnau-xrqi", "payee = 'FLOCK SAFETY'"],
                ["Chicago thefts", "data.cityofchicago.org", "ijzp-q8t2", "primary_type = 'MOTOR VEHICLE THEFT'"],
                ["Chicago payments (zero-check)", "data.cityofchicago.org", "s4vu-giwb", "vendor_name like '%FLOCK SAFETY%' or '%FLOCK GROUP%'"],
                ["NYC thefts", "data.cityofnewyork.us", "qgea-i56i + 5uac-w243", "ofns_desc = 'GRAND LARCENY OF MOTOR VEHICLE'"],
                ["Seattle thefts", "data.seattle.gov", "tazs-3rd5", "nibrs_offense_code = '240'"],
                ["SF camera locations (supplement)", "OpenStreetMap (Overpass API)", "DeFlock project nodes", "man_made=surveillance, ALPR, operator SFPD / brand Flock Safety"],
              ].map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, i) => (
                    <td key={i}>{i === 0 ? cell : <code>{cell}</code>}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fr-cap">
          All counts are by occurrence date, citywide, monthly. A snapshot with the UTC retrieval timestamp is
          pinned in the analysis repository. Police data back-fills, so trailing months may rise in later
          refreshes; the panel ends 2026-06 for this reason.
        </p>
      </div>

      <div className="fr-wrap">
        <Section num="11" title="Limitations">
          <p>Read these before quoting anything above.</p>
          <ul className="fr-rules">
            <li>
              <strong>Small N, stated in our own voice.</strong> Seven cities and four treatment events. No
              specification here identifies a causal effect, and the permutation test exists precisely because
              seven clusters make conventional inference unreliable.
            </li>
            <li>
              <strong>No causal identification.</strong> Bundled interventions (SF’s cameras arrived with a
              real-time crime center, drones, and staffing changes). The randomized literature on ALPR
              deterrence, which predates Flock’s dense fixed networks, found null effects, and nothing here
              overturns it.
            </li>
            <li>
              <strong>The national wave dominates.</strong> The Kia and Hyundai correction and record national
              declines moved every series. Comparison cities absorb this only imperfectly because the wave hit
              cities unevenly.
            </li>
            <li>
              <strong>Comparison cities are Flock-free, not surveillance-free.</strong> Chicago runs Vigilant
              ALPRs, and NYC and Seattle have readers of their own.
            </li>
            <li>
              <strong>Off-windows are short.</strong> Denver has three months. Austin has seven clean months
              before state-installed Flock cameras recontaminate the city. Both series deserve re-running in a
              year.
            </li>
            <li>
              <strong>Reported crime is not crime.</strong> Vehicle theft is among the best-reported offenses
              because insurance requires it, which is why it is the outcome. It still undercounts.
            </li>
            <li>
              <strong>Denver’s ON date is approximate</strong> (plus or minus two months), and its checkbook
              window means its Flock spend is a floor.
            </li>
            <li>
              <strong>The block-level supplement is descriptive and post-hoc.</strong> Camera coordinates are
              crowdsourced and cover roughly 70% of the network; distance bands are coarse; cameras were placed
              on the highest-theft corridors, so near and far blocks differ at baseline.
            </li>
            <li>
              <strong>Category taxonomies differ across cities.</strong> Counts are never compared in levels
              across cities; only within-city changes are.
            </li>
          </ul>
        </Section>

        <Section num="12" title="The governance ledger">
          <p>
            The favorable numbers above are only credible next to a plain accounting of the criticisms, so here
            it is. The case against Flock in 2025 and 2026 was not that the cameras don’t work. It was: local
            police running immigration-related lookups through Flock’s national network despite state law (NPR,
            February 2026); an Illinois Attorney General audit finding that Customs and Border Protection accessed
            Illinois cameras through an undisclosed pilot (ACLU summary); SFPD’s own June 2026 audit finding 299
            unauthorized searches of its data, including improper federal access (Mission Local); and officers
            criminally charged with using the system to track ex-partners (WBEZ, August 2026). A federal judge in
            Norfolk nonetheless held a 176-camera network constitutional in February 2026, and Flock’s August
            2026 reforms, which cut default retention from 30 days to 7 and made case numbers mandatory on every
            search, answered several criticisms directly. National cancellation tallies come from advocacy
            trackers and are labeled as such.
          </p>
          <p>
            Our data adds one observation to this ledger: the cities that canceled over these governance failures
            have not, so far, paid a measurable price in vehicle theft. Cities that keep the cameras are, on this
            evidence, buying investigative capability cheaply. They also owe their residents the audit discipline
            that San Francisco’s own review showed was missing.
          </p>
        </Section>

        <Section num="13" title="Conclusion">
          <p>
            Strip away the advocacy on both sides and the public record supports three sentences. Flock’s cameras
            cost the cities in our panel remarkably little: $5.19 million over three fiscal years in San
            Francisco, $180 thousand visible in Denver’s checkbook, and zero in Chicago. Where networks were
            dense, vehicle theft fell farther and faster than in three large comparison cities, an association
            of 18 to 26% in our panel that is present in every specification but statistically fragile in the
            pre-registered one. And where the cameras were switched off, theft kept falling, which retires the
            strongest claim made on the cameras’ behalf while leaving intact the modest, checkable one: a cheap
            tool, concrete department-attributed arrests, outsized coincident declines, and governance, not
            effectiveness, as the thing the fights should be about.
          </p>
        </Section>

        <h2>About Transparent City</h2>
        <p>
          Transparent City uses AI and public data to make civic information legible, understandable, and
          actionable for everyday residents. The service ingests the official open-data portals of the cities it
          covers, including payments, contracts, payroll, police incidents, and service requests, normalizes
          millions of records, and turns them into plain-language reporting that links every number back to the
          dataset it came from. Its editorial rule for this report, as for all its reporting, is simple: no
          manufactured certainty, and no conclusions the data does not support.
        </p>

        <Section num="14" title="References and reproduction">
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
              9NEWS, “Denver removes all 110 Flock license plate reader cameras” (March 2026).{" "}
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
              ACLU, Illinois AG audit and CBP pilot summary.{" "}
              <a href="https://www.aclu.org/news/privacy-technology/tracking-alpr-cameras/flock-safety-credibility-lost-as-it-repeatedly-lies-to-city-councils-police-departments-and-public-across-the-country">aclu.org</a>
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
              Courthouse News, Norfolk ruling (February 2026).{" "}
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
            Reproduction: the pre-registered methodology, the analysis code, and the pinned data snapshots live in
            the Transparent City platform repository under <code>docs/flock/</code> and{" "}
            <code>scripts/analysis/flock/</code>. Rerunning the data pull and analysis regenerates every number
            on this page from the live portals; trailing months will differ slightly as police data back-fills.
          </p>
        </Section>

        <p className="fr-footer">
          Transparent City. Draft prepared September 2026, data as of {D.generated_from.retrieved_utc.slice(0, 10)}.
          Independent of Flock Safety, its investors, and campaign organizations on all sides. No non-public data
          was used. Corrections: seymour@transparent.city.
        </p>
      </div>
    </div>
  );
}
