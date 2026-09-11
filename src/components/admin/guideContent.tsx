import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Per-city content for the admin field guide (see AdminGuide.tsx).
 *
 * Everything here is city- and person-specific: the facts on the dashboard,
 * the starter prompts, the things worth digging into. The surrounding
 * explanation of how the platform works lives in AdminGuide.tsx and is shared.
 *
 * Snapshot numbers are stated with their date so a stale figure reads as a
 * dated fact rather than a wrong one.
 */

export interface GuideStep {
  title: string;
  body: ReactNode;
}

export interface GuidePrompt {
  text: string;
  note: string;
}

export interface GuideMetricRow {
  category: string;
  metrics: ReactNode;
  count: number;
}

export interface GuideCheatRow {
  goal: string;
  say: string;
}

export interface CityGuide {
  /** City id in the platform, used to match a city-lead assignment. */
  cityId: number;
  citySlug: string;
  cityName: string;
  cityEmoji: string;
  /** First name of the person this guide was written for. */
  personFirst: string;
  /** Short role line shown next to the wordmark. */
  roleChip: string;
  /** Government label for the top of the city, e.g. "Mayor Barbara Lee". */
  mayor: string;
  /** What this city calls its sub-units, singular and plural, lowercased. */
  unit: string;
  unitPlural: string;
  unitCount: number;
  datasetsCount: number;
  metricsCount: number;
  /** Portal platform, e.g. "Socrata" or "ArcGIS". */
  portal: string;
  /** Date the snapshot figures were taken. */
  snapshotDate: string;
  /** The reader's own district, when known, for deep links. */
  homeDistrict?: number;
  /** Opening paragraph. Written to the person, not to a generic admin. */
  lede: ReactNode;
  /** Optional second paragraph under the masthead. */
  welcome?: ReactNode;
  firstSteps: GuideStep[];
  /** One-sentence framing above the starter prompts. */
  promptsIntro: ReactNode;
  prompts: GuidePrompt[];
  /** Rows for the "what your city tracks today" table. */
  metricRows: GuideMetricRow[];
  /** Where the city stands on metrics. */
  standing: ReactNode;
  /** Things worth investigating, the heart of the guide. */
  challenge: GuideStep[];
  /** Closing line under that list. */
  challengeOutro: ReactNode;
  cheatSheet: GuideCheatRow[];
}

const OAKLAND: CityGuide = {
  cityId: 57223,
  citySlug: "oakland",
  cityName: "Oakland",
  cityEmoji: "🌳",
  personFirst: "Rajni",
  roleChip: "City manager · Rajni",
  mayor: "Mayor Barbara Lee",
  unit: "council district",
  unitPlural: "council districts",
  unitCount: 7,
  datasetsCount: 739,
  metricsCount: 15,
  portal: "Socrata",
  snapshotDate: "September 9, 2026",
  homeDistrict: 4,
  lede: (
    <>
      Welcome, and thank you. Several fixes here exist because you found them. This guide is built around
      what you said you want to know: who actually gets their 311 requests closed, how fast, and whether
      that depends on which part of town you live in.
    </>
  ),
  welcome: (
    <>
      You said you are not technical, and nothing here needs you to be. Almost all of it is typing a
      question in plain English. If a section starts to feel like source code, skip it.
    </>
  ),
  firstSteps: [
    {
      title: "See what your call already changed",
      body: (
        <>
          Open <Link href="/home?city_id=57223">Oakland</Link> from <b>My Places</b>, then the{" "}
          <Link href="/home?city_id=57223">All metrics</Link> tab. Three measures did not exist
          before you and Adam talked: <b>Pothole Reports</b>, <b>Pothole Closure Rate</b>, and{" "}
          <b>Average Days to Close a 311 Request</b>. Each took about a minute, by asking.
        </>
      ),
    },
    {
      title: "Ask your question, then push on the answer",
      body: (
        <>
          Click <Link href="/home?view=chat">New Chat</Link> and type:{" "}
          <i>
            &ldquo;Show Oakland pothole closure rate and average days to close by council district for the
            last 12 months, as a table and a map.&rdquo;
          </i>{" "}
          Then keep going in the same chat: <i>&ldquo;Now split that by police beat.&rdquo;</i> Follow-ups
          keep the context, so you can interrogate a number the way you would a colleague.
        </>
      ),
    },
    {
      title: "Look at your own district",
      body: (
        <>
          Pick <Link href="/home?city_id=57223&amp;district=4">District 4</Link> and read the{" "}
          <b>Alerts</b> tab: this week&apos;s statistical outliers,
          things that moved more than three standard deviations from their own history. Raw signal, not
          reporting. Some is noise; the useful ones are leads.
        </>
      ),
    },
    {
      title: "Open the admin menu",
      body: (
        <>
          Click the <b>green circle</b> at the bottom left. That is the full toolset, and where this guide
          lives in the app (<Link href="/admin/guide">Admin guide</Link>). Look, then come back here.
        </>
      ),
    },
  ],
  promptsIntro: <>Written for the questions in your Substack and your call. Copy one, change a word, send it.</>,
  prompts: [
    {
      text: "For Oakland 311, compare closure rate and average days to close across all seven council districts for the last 12 months. Flag any district that is an outlier.",
      note: "The core equity question.",
    },
    {
      text: "Abandoned auto complaints moved from the Police Department to Transportation in 2022. Chart Oakland abandoned vehicle 311 volume and closure rate before and after that handoff.",
      note: "A department accountability question the data can answer.",
    },
    {
      text: "Which Oakland neighborhoods report the most 311 requests per resident, and which get the highest closure rates? Are they the same neighborhoods?",
      note: "The squeaky-wheel question. Ask it to state its population assumptions.",
    },
    {
      text: "San Francisco has a 311 SLA compliance rate metric. Does Oakland's 311 data support the same thing? If so, build it.",
      note: "Borrowing a measure from a city that already has it.",
    },
    {
      text: "How long have Oakland's oldest still-open pothole requests been open? Show the distribution, not just the average.",
      note: "Averages hide the three-year-old pothole. Ask for the tail.",
    },
  ],
  metricRows: [
    {
      category: "311 and service delivery",
      metrics: (
        <>
          311 Service Requests · Average Days to Close · Illegal Dumping · Abandoned Vehicles · Graffiti ·
          Street &amp; Sidewalk · Rodent &amp; Pest
        </>
      ),
      count: 7,
    },
    {
      category: "Streets",
      metrics: <>Pothole Reports · Pothole Closure Rate</>,
      count: 2,
    },
    {
      category: "Crime and safety",
      metrics: <>Violent Crime · Property Crime · Drug Crime · Homicides · Unexplained Deaths</>,
      count: 5,
    },
    {
      category: "Housing and homelessness",
      metrics: <>Homeless Encampment 311 Cases</>,
      count: 1,
    },
  ],
  standing: (
    <>
      Oakland tracks 15 measures. San Francisco, longest on the platform, tracks 76. That gap is the
      opportunity: most of those are templates that can be pointed at Oakland&apos;s 739 catalogued
      datasets. Asking which ones fit is the highest-value thing you can do here.
    </>
  ),
  challenge: [
    {
      title: "Closure rates across the rest of your categories",
      body: (
        <>
          Potholes now have both a closure rate and days-to-close. Illegal dumping, encampments, abandoned
          autos, and graffiti do not. Build those four, break them out by district and police beat, and see
          whether service follows need or follows noise.
        </>
      ),
    },
    {
      title: "The abandoned autos handoff",
      body: (
        <>
          You said it got worse after the 2022 move to Transportation. Nobody has checked whether the data
          agrees. Ask for a research report. That is a Substack post with a chart in it.
        </>
      ),
    },
    {
      title: "What Oakland does not measure yet",
      body: (
        <>
          Ask which San Francisco metrics have no Oakland equivalent. Street sweeping, tree maintenance,
          sidewalk repair, code enforcement, and permit timelines are all plausible and all matter to a
          neighborhood.
        </>
      ),
    },
    {
      title: "The pothole loop, closed",
      body: (
        <>
          You organize neighbors, fill potholes on a Saturday, then call 311 to close the tickets. That is a
          measurable intervention with a before and an after. Track your area against the rest of the
          district.
        </>
      ),
    },
    {
      title: "Something for the next Public Safety Update",
      body: (
        <>
          Your posts already work from public records. This adds the time series underneath them. If a claim
          in a council meeting is checkable against 311 or crime data, check it here and cite the chart.
        </>
      ),
    },
  ],
  challengeOutro: (
    <>
      When you find something, ask Seymour to write it up. It lands in the Oakland feed and can be pulled
      into your own writing.
    </>
  ),
  cheatSheet: [
    { goal: "See what exists", say: "List all active Oakland metrics with their last run status and last data date." },
    { goal: "Closure rates", say: "Show closure rate and average days to close for Oakland 311 requests by category, last 12 months." },
    { goal: "By district", say: "Break Oakland pothole closure rates out by council district, as a map and a table." },
    { goal: "By police beat", say: "Show Oakland 311 requests and closure rates by police beat for the last year." },
    { goal: "Find what to add", say: "Which San Francisco metrics have no Oakland equivalent, and which Oakland datasets could feed them?" },
    { goal: "Build one", say: "Create an Oakland metric for [thing] from the 311 dataset, and confirm the numbers look right." },
    { goal: "Check a claim", say: "Oakland says [claim]. Does the data support that? Show the chart and the source dataset." },
    { goal: "Go deep", say: "Create a research report on whether abandoned auto response times changed after the 2022 move to Transportation." },
    { goal: "Write it up", say: "Write a story about [finding] in Oakland. Include the chart and cite the dataset." },
  ],
};

const MIAMI: CityGuide = {
  cityId: 56533,
  citySlug: "miami",
  cityName: "Miami",
  cityEmoji: "🏖️",
  personFirst: "Alan",
  roleChip: "City admin · Alan",
  mayor: "Mayor Eileen Higgins",
  unit: "commission district",
  unitPlural: "commission districts",
  unitCount: 5,
  datasetsCount: 103,
  metricsCount: 13,
  portal: "ArcGIS",
  snapshotDate: "September 5, 2026",
  lede: (
    <>
      You now have the same tools Rob and Adam use to run a city on Transparent City. This guide covers what
      each one does and which ones matter first. Read the first section, then go try things.
    </>
  ),
  firstSteps: [
    {
      title: "Find Miami and see what it has",
      body: (
        <>
          Open <Link href="/home?city_id=56533">Miami</Link> from <b>My Places</b>, then the{" "}
          <Link href="/home?city_id=56533">All metrics</Link> tab. Thirteen metrics across crime,
          permits, 911 calls and traffic crashes, each with a year-to-date comparison. That table is the raw
          material for everything else.
        </>
      ),
    },
    {
      title: "Ask a question, then push on the answer",
      body: (
        <>
          Click <Link href="/home?view=chat">New Chat</Link> and type:{" "}
          <i>
            &ldquo;Traffic calls for service in Miami are up 16 percent this year. Where is that increase
            concentrated? Show a map by commission district.&rdquo;
          </i>{" "}
          Follow-ups in the same chat keep the context.
        </>
      ),
    },
    {
      title: "Ask what is broken",
      body: (
        <>
          <i>
            &ldquo;The serious and fatal traffic crashes metric shows no 2026 data. Did Miami&apos;s crash
            dataset stop updating, move, or change shape?&rdquo;
          </i>{" "}
          Finding a broken feed is a real result.
        </>
      ),
    },
    {
      title: "Open the admin menu, then read the stories",
      body: (
        <>
          Click the <b>green circle</b> at the bottom left for the full toolset. Then, back on the{" "}
          <Link href="/home?city_id=56533">Miami dashboard</Link>, read <b>New stories</b>. Seymour generated those from anomalies, and they are what the
          Sunday newsletter is built from.
        </>
      ),
    },
  ],
  promptsIntro: <>Analysis questions are safe and cheap to ask as often as you like.</>,
  prompts: [
    {
      text: "Demolition permits in Miami are up 11 percent this year. Which neighborhoods are they concentrated in, and what kinds of buildings are coming down?",
      note: "Starts from a dashboard metric, then digs into the dataset.",
    },
    {
      text: "Show ShotSpotter activations by commission district for the last 12 months. Is any district trending up while the citywide number is flat?",
      note: "Analysis by place. Ask for the map and the table.",
    },
    {
      text: "Which datasets on Miami's portal have we catalogued but never used in a metric? Rank them by usefulness to a resident.",
      note: "Discovery from the data side.",
    },
    {
      text: "Police calls for service are down 9 percent and violent crime is down 9 percent. Is that one trend or two? Compare them month by month and by district.",
      note: "Analysis across metrics.",
    },
    {
      text: "Which Miami metrics have stale data or failed their last run, and what is the likely cause for each?",
      note: "Health check.",
    },
  ],
  metricRows: [
    {
      category: "Crime",
      metrics: <>Property Crime · Drug Crime · Violent Crime</>,
      count: 3,
    },
    {
      category: "Housing / Permits",
      metrics: (
        <>Demolition Permits · New Commercial Permits Filed · New Residential Permits Filed / Issued / Completed</>
      ),
      count: 5,
    },
    {
      category: "Safety / 911 calls",
      metrics: <>Police Calls for Service · Drug-Related 911 Calls · ShotSpotter Activations · Traffic Calls</>,
      count: 4,
    },
    {
      category: "Transportation safety",
      metrics: <>Serious &amp; Fatal Traffic Crashes (KSI)</>,
      count: 1,
    },
  ],
  standing: (
    <>
      The platform has 51 shared templates. Miami has 17 set up, and 34 not yet tried. Many will fail
      because Miami does not publish that data. Some will succeed. Finding out which is a good week&apos;s
      work.
    </>
  ),
  challenge: [
    {
      title: "A place not getting its share of service",
      body: (
        <>
          Map police calls for service and permit activity by commission district, then look for the
          district where response is slowest or activity has stalled.
        </>
      ),
    },
    {
      title: "A broken feed",
      body: (
        <>
          The KSI traffic crashes metric shows no 2026 data. Lagging, renamed, or moved? That alone is a
          story if the city stopped publishing.
        </>
      ),
    },
    {
      title: "A missing metric residents would want",
      body: (
        <>
          311 requests, code enforcement, park maintenance, transit, flooding, building inspections. Ask
          what Miami actually publishes on each and how current it is.
        </>
      ),
    },
    {
      title: "A trend nobody has noticed",
      body: (
        <>
          Residential permits filed are down 59 percent year to date while permits issued are up 9 percent.
          Policy change, data artifact, or a real slowdown coming?
        </>
      ),
    },
  ],
  challengeOutro: (
    <>
      When you find something, ask Seymour to write it up as a story or a research report so it lands in the
      feed and the newsletter.
    </>
  ),
  cheatSheet: [
    { goal: "See what exists", say: "List all active Miami metrics with their last run status and last data date." },
    { goal: "Find what to add", say: "Which Miami datasets are catalogued but not used by any metric? Which three would make the best new metrics?" },
    { goal: "Add one", say: "Instantiate the [template name] template for Miami and tell me which dataset and fields you used." },
    { goal: "Fix a stale one", say: "Check freshness for Miami's KSI traffic crashes metric. If the dataset changed, find the replacement." },
    { goal: "Look by district", say: "Show Miami police calls for service by commission district for the last 12 months, as a map and a table." },
    { goal: "Find anomalies", say: "Run anomaly detection on all Miami metrics for the last 90 days and show the three most significant." },
    { goal: "Write a story", say: "Write a story about [finding] in Miami. Include the chart and cite the dataset." },
    { goal: "Go deep", say: "Create a research report on [question] in Miami." },
    { goal: "Preview Sunday", say: "Generate a sample Miami newsletter for this week and show it to me." },
  ],
};

const SAN_FRANCISCO: CityGuide = {
  cityId: 57260,
  citySlug: "san-francisco",
  cityName: "San Francisco",
  cityEmoji: "🌉",
  personFirst: "Ishaan",
  roleChip: "City manager · Ishaan",
  mayor: "Mayor Daniel Lurie",
  unit: "supervisorial district",
  unitPlural: "supervisorial districts",
  unitCount: 11,
  datasetsCount: 1222,
  metricsCount: 76,
  portal: "Socrata",
  snapshotDate: "September 11, 2026",
  lede: (
    <>
      San Francisco is the deepest city on Transparent City. It has 76 live metrics against
      1,222 catalogued datasets, and most of the templates the other cities use were written here
      first. So the job is different from a new city: less building it out, more keeping it honest
      and making it more useful to the people who read it.
    </>
  ),
  welcome: (
    <>
      Nothing here needs a technical background. Almost all of it is typing a question in plain
      English and reading what comes back. If a section starts to feel like source code, skip it.
    </>
  ),
  firstSteps: [
    {
      title: "See what San Francisco already tracks",
      body: (
        <>
          Open <Link href="/home?city_id=57260">San Francisco</Link> from <b>My Places</b>, then the{" "}
          <Link href="/home?city_id=57260">All metrics</Link> tab. Seventy-six measures, from 911
          response times to permit timelines to contract spending, each with a year-to-date
          comparison. Skim the whole list once. It is the raw material for everything else.
        </>
      ),
    },
    {
      title: "Ask a question, then push on the answer",
      body: (
        <>
          Click <Link href="/home?view=chat">New Chat</Link> and type:{" "}
          <i>
            &ldquo;Show San Francisco 311 SLA compliance by supervisorial district for the last 12
            months, as a table and a map.&rdquo;
          </i>{" "}
          Then keep going in the same chat: <i>&ldquo;Now show the three worst-performing request
          types.&rdquo;</i> Follow-ups keep the context, so you can interrogate a number the way you
          would a colleague.
        </>
      ),
    },
    {
      title: "Find something that looks wrong",
      body: (
        <>
          Ask: <i>&ldquo;Which San Francisco metrics have data older than a month?&rdquo;</i> You will
          get a list. Some of those are honest source lag, some are broken feeds. Telling the two
          apart is the single most valuable thing you can do in your first week.
        </>
      ),
    },
    {
      title: "Open the admin menu",
      body: (
        <>
          Click the <b>green circle</b> at the bottom left. That is the full toolset, and where this
          guide lives in the app (<Link href="/admin/guide">Admin guide</Link>). Look, then come back
          here.
        </>
      ),
    },
  ],
  promptsIntro: (
    <>Analysis questions are safe and cheap to ask as often as you like. Copy one, change a word, send it.</>
  ),
  prompts: [
    {
      text: "List every San Francisco metric whose most recent data is more than 30 days old, with its source dataset and update frequency. For each, say whether the lag looks normal for that source.",
      note: "The data-quality sweep. Start here.",
    },
    {
      text: "Show San Francisco 311 SLA compliance rate by supervisorial district for the last 12 months. Which districts are consistently below the citywide average?",
      note: "Service equity, using a metric the city publishes about itself.",
    },
    {
      text: "Which San Francisco datasets have we catalogued but never used in a metric? Rank them by how useful they would be to a resident.",
      note: "1,222 datasets, 76 metrics. There is a lot of unused material.",
    },
    {
      text: "Compare San Francisco's permit timelines to every other launched city. Where does San Francisco sit, and is the gap growing or shrinking?",
      note: "Cross-city comparison works because the metrics come from shared templates.",
    },
    {
      text: "Run anomaly detection on all San Francisco metrics for the last 90 days and show me the three most significant, with the chart for each.",
      note: "The raw feed of story leads.",
    },
  ],
  metricRows: [
    {
      category: "Safety and emergency response",
      metrics: (
        <>
          EMS and ambulance response times · Fire calls and fatalities · Traffic, pedestrian and
          bicycle collisions · Overdose deaths and Narcan reversals · ShotSpotter · Police
          misconduct
        </>
      ),
      count: 18,
    },
    {
      category: "Housing and permits",
      metrics: (
        <>
          Permit timelines, over-the-counter and full review · Residential permits filed, issued and
          completed · Housing units completed · Demolitions · Eviction notices
        </>
      ),
      count: 11,
    },
    {
      category: "Crime and prosecution",
      metrics: (
        <>
          Violent, property and drug crime · Homicides · Total police incidents · Arrests
          presented to the DA · Charges filed, convictions, and both rates
        </>
      ),
      count: 10,
    },
    {
      category: "Economy",
      metrics: (
        <>
          Business registrations, openings, closures and expirations · Retail · Restaurant permit
          days · SFO passengers and landings
        </>
      ),
      count: 9,
    },
    {
      category: "911 and city operations",
      metrics: (
        <>
          All 911 calls · Priority A, B and C response times · Drug, overdose and homeless-related
          calls
        </>
      ),
      count: 9,
    },
    {
      category: "Streets and 311",
      metrics: (
        <>
          311 service requests · Illegal dumping · Abandoned vehicles · Graffiti · Muni
          complaints · Noise · Autonomous vehicle complaints
        </>
      ),
      count: 7,
    },
    {
      category: "Spending and contracts",
      metrics: (
        <>
          Vendor payments and transactions · Contract award value · Active supplier contracts ·
          Sole-source share
        </>
      ),
      count: 5,
    },
    {
      category: "Traffic enforcement",
      metrics: <>Traffic stops and citations · Speed camera citations and warnings</>,
      count: 4,
    },
    {
      category: "Environment and service levels",
      metrics: <>Rodent and pest complaints · Beach fecal coliform · 311 SLA compliance rate</>,
      count: 3,
    },
  ],
  standing: (
    <>
      San Francisco is the reference city. When a metric is written well here, it becomes a template
      the other cities inherit, so a fix you make can propagate to nine other places. The flip side
      is that a bad number here spreads too. That is why the work in this city leans toward quality
      rather than quantity.
    </>
  ),
  challenge: [
    {
      title: "Separate real lag from broken feeds",
      body: (
        <>
          Seventeen of the 76 metrics have data more than five weeks old. Some of that is honest:
          collision records and SFO traffic genuinely report on a delay. Some is not. Vendor payments
          have not moved since January, and overdose-related 911 calls stopped in March. Work down
          the list and decide which is which, then fix or flag each one.
        </>
      ),
    },
    {
      title: "Merge the split categories",
      body: (
        <>
          Metrics are filed under 14 different category strings, but only 12 real categories. &ldquo;City
          Ops&rdquo; and &ldquo;city ops&rdquo; are stored separately, and so are the two spellings of
          housing and homelessness. That splits groups apart on the dashboard for no reason. Ask
          Seymour to list the categories in use and reconcile them.
        </>
      ),
    },
    {
      title: "Fix what a resident sees first",
      body: (
        <>
          Seventy-six metrics is more than anyone reads. The dashboard order is yours to set in
          Display Settings, and it is the most visible change you can make. Open the public page as a
          resident would and ask whether the first screen answers the questions people actually have.
        </>
      ),
    },
    {
      title: "Check the numbers against the city's own",
      body: (
        <>
          Pick two or three metrics and compare them to what the department publishes in its own
          reports. If they disagree, find out why. A number that cannot be reconciled with the
          official source is worse than no number, and this is the fastest way to build trust in the
          whole platform.
        </>
      ),
    },
    {
      title: "Close a coverage gap",
      body: (
        <>
          There are 1,222 catalogued datasets behind 76 metrics. Ask what San Francisco publishes that
          nobody has turned into a measure yet, especially on the things people complain about most.
          Then build one and watch it run for a week.
        </>
      ),
    },
  ],
  challengeOutro: (
    <>
      When you find something, ask Seymour to write it up. It lands in the San Francisco feed and
      feeds the Sunday newsletter.
    </>
  ),
  cheatSheet: [
    { goal: "See what exists", say: "List all active San Francisco metrics with their last run status and last data date." },
    { goal: "Find stale data", say: "Which San Francisco metrics have data older than 30 days, and what is the likely cause for each?" },
    { goal: "Check a category", say: "List the categories San Francisco metrics are filed under, and flag any that look like duplicates." },
    { goal: "By district", say: "Break San Francisco 311 SLA compliance out by supervisorial district, as a map and a table." },
    { goal: "Find what to add", say: "Which San Francisco datasets are catalogued but not used by any metric? Which three would make the best new metrics?" },
    { goal: "Build one", say: "Create a San Francisco metric for [thing] from dataset [name], and confirm the numbers look right." },
    { goal: "Compare cities", say: "Rank every launched city by year-to-date change in [metric] and highlight San Francisco." },
    { goal: "Check a claim", say: "The city says [claim]. Does the data support that? Show the chart and the source dataset." },
    { goal: "Write it up", say: "Write a story about [finding] in San Francisco. Include the chart and cite the dataset." },
  ],
};

export const CITY_GUIDES: CityGuide[] = [OAKLAND, MIAMI, SAN_FRANCISCO];

/** Guide shown when a viewer has no city-lead assignment we recognize. */
export const DEFAULT_GUIDE = OAKLAND;

export function guideForCityIds(cityIds: readonly number[] | undefined): CityGuide | null {
  if (!cityIds?.length) return null;
  return CITY_GUIDES.find((g) => cityIds.includes(g.cityId)) ?? null;
}

export function guideForSlug(slug: string | undefined): CityGuide | null {
  if (!slug) return null;
  return CITY_GUIDES.find((g) => g.citySlug === slug.toLowerCase()) ?? null;
}
