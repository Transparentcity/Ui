import type { ReactNode } from "react";

/**
 * Per-city content for the admin field guide (see AdminGuide.tsx).
 *
 * Everything here is city- and person-specific: the facts on the dashboard,
 * the starter prompts, the challenge list. The surrounding explanation of how
 * the platform works lives in AdminGuide.tsx and is shared.
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
  /** Opening paragraph. Written to the person, not to a generic admin. */
  lede: ReactNode;
  /** Optional personal note under the masthead. */
  welcome?: ReactNode;
  firstSteps: GuideStep[];
  /** One-sentence framing above the starter prompts. */
  promptsIntro: ReactNode;
  prompts: GuidePrompt[];
  /** Rows for the "what your city has today" table. */
  metricRows: GuideMetricRow[];
  /** Paragraph under that table: where the city stands on metrics. */
  standing: ReactNode;
  /** Things worth investigating, the heart of the guide. */
  challenge: GuideStep[];
  /** Closing line under the challenge list. */
  challengeOutro: ReactNode;
  cheatSheet: GuideCheatRow[];
  /** Known data caveats for this city, shown as a callout. Optional. */
  caveats?: { title: string; body: ReactNode };
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
  lede: (
    <>
      Welcome, and thank you. Half the fixes on this page exist because you found them. You now have the
      same tools Adam and Rob use to run a city here, pointed at Oakland. This guide is written around what
      you already told us you want to know: who actually gets their 311 requests closed, how fast, and
      whether that depends on which part of town you live in.
    </>
  ),
  welcome: (
    <>
      You said you are not technical, and nothing here needs you to be. Almost everything happens by typing
      a question in plain English. If a section starts to feel like source code, skip it. The parts that
      matter most are the first two.
    </>
  ),
  firstSteps: [
    {
      title: "See what your call already changed",
      body: (
        <>
          Open Oakland from <b>My Places</b> in the left nav, then the <b>All metrics</b> tab. Three
          measures near the top did not exist before you and Adam talked: <b>Pothole Reports (311)</b>,{" "}
          <b>Pothole Closure Rate</b>, and <b>Average Days to Close a 311 Request</b>. They were built in
          about a minute each, by asking. That is the whole tool in one example.
        </>
      ),
    },
    {
      title: "Ask the closure-rate question you actually care about",
      body: (
        <>
          Click <b>New Chat</b> and type:{" "}
          <i>
            “For Oakland potholes, show the closure rate and average days to close by council district for
            the last 12 months. Put it in a table and a map.”
          </i>{" "}
          Give it a minute or two. This is the equity question in one prompt: same complaint, seven
          districts, one comparison.
        </>
      ),
    },
    {
      title: "Push on the answer",
      body: (
        <>
          Stay in the same chat and keep going. <i>“Now split that by police beat instead of district.”</i>{" "}
          Then <i>“Which beats have the oldest still-open pothole requests?”</i> Follow-ups keep the
          context, so you can interrogate a number the way you would a colleague.
        </>
      ),
    },
    {
      title: "Look at your own district",
      body: (
        <>
          Go to Oakland, pick <b>District 4</b>, and read the <b>Alerts</b> tab. These are the week&apos;s
          statistical outliers: things that moved more than three standard deviations from their own
          history. It is raw signal, not reporting. Some of it is noise. The useful ones are leads.
        </>
      ),
    },
    {
      title: "Open the admin menu",
      body: (
        <>
          Click the <b>green circle</b> at the bottom left. That is the full toolset, and it is where this
          guide lives (<b>Admin guide</b>, at the top). Look, do not click anything yet, and come back here.
        </>
      ),
    },
  ],
  promptsIntro: (
    <>
      These are written for the questions in your Substack and your call with Adam. Copy one, change a word,
      send it.
    </>
  ),
  prompts: [
    {
      text: "For Oakland 311, compare closure rate and average days to close across all seven council districts for the last 12 months. Flag any district that is an outlier in either direction.",
      note: "The core equity question. Ask for the table and the map.",
    },
    {
      text: "Abandoned auto complaints moved from the Police Department to the Department of Transportation in 2022. Chart Oakland abandoned vehicle 311 volume and closure rate before and after that handoff.",
      note: "A department accountability question the data can actually answer.",
    },
    {
      text: "Which Oakland neighborhoods report the most 311 requests per resident, and which get the highest closure rates? Are they the same neighborhoods?",
      note: "The squeaky-wheel question. Ask it to name its assumptions about population.",
    },
    {
      text: "San Francisco has a 311 SLA compliance rate metric. Does Oakland's 311 data support building the same thing? If so, build it.",
      note: "Borrowing a measure from a city that already has it.",
    },
    {
      text: "Show illegal dumping, encampment, and graffiti 311 requests in Oakland by district for the last two years. Which is growing fastest and where?",
      note: "Your top complaint categories, side by side.",
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
          Oakland 311 Service Requests · Average Days to Close a 311 Request · Illegal Dumping · Abandoned
          Vehicles · Graffiti · Street &amp; Sidewalk · Rodent &amp; Pest Complaints
        </>
      ),
      count: 7,
    },
    {
      category: "Streets",
      metrics: <>Pothole Reports (311) · Pothole Closure Rate</>,
      count: 2,
    },
    {
      category: "Crime and safety",
      metrics: (
        <>Violent Crime · Property Crime · Drug Crime · Homicides · Unexplained Deaths</>
      ),
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
      Oakland tracks 15 measures today. San Francisco, which has been on the platform longest, tracks 76.
      That gap is the opportunity, not a failing: most of those 76 are templates that can be pointed at
      Oakland&apos;s data, and Oakland has 739 catalogued datasets to point them at. Asking which ones fit is the
      single highest-value thing you can do here.
    </>
  ),
  challenge: [
    {
      title: "Closure rates as an equity measure",
      body: (
        <>
          This is your question, and the platform can now answer it. Build closure rate and days-to-close
          for your four complaint categories, break them out by district and by police beat, and see whether
          service follows need or follows noise. If the answer is uncomfortable, that is a finding worth
          publishing.
        </>
      ),
    },
    {
      title: "The abandoned autos handoff",
      body: (
        <>
          You said it got worse after the 2022 move from the Police Department to Transportation. Nobody has
          checked whether the data agrees. Ask for a research report on it. That is a Substack post with a
          chart in it.
        </>
      ),
    },
    {
      title: "What Oakland does not measure yet",
      body: (
        <>
          Ask which San Francisco metrics have no Oakland equivalent, and which Oakland datasets could feed
          them. Street sweeping, tree maintenance, sidewalk repair, code enforcement, and permit timelines
          are all plausible and all matter to a neighborhood.
        </>
      ),
    },
    {
      title: "The pothole loop, closed",
      body: (
        <>
          You organize neighbors, fill potholes on a Saturday, then call 311 to close the tickets. That is a
          measurable intervention with a before and an after. Track the requests in your area against the
          rest of the district and see what volunteer repair actually shows up as in the city&apos;s own numbers.
        </>
      ),
    },
    {
      title: "Something for the next Public Safety Update",
      body: (
        <>
          Your posts already work from public records: meeting recordings, audit reports, charter sections.
          This adds the time series underneath them. If a claim in a council meeting is checkable against
          311 or crime data, check it here and cite the chart.
        </>
      ),
    },
  ],
  challengeOutro: (
    <>
      When you find something, ask Seymour to write it up as a story or a research report. It lands in the
      Oakland feed and can be pulled into your own writing. Adam&apos;s ask is one problem in Oakland that this
      data helps fix. You already have a shortlist.
    </>
  ),
  cheatSheet: [
    { goal: "See what exists", say: "List all active Oakland metrics with their last run status and last data date." },
    { goal: "Closure rates", say: "Show closure rate and average days to close for Oakland 311 requests by category, last 12 months." },
    { goal: "By district", say: "Break Oakland pothole closure rates out by council district and show it as a map and a table." },
    { goal: "By police beat", say: "Show Oakland 311 requests and closure rates by police beat for the last year." },
    { goal: "Find what to add", say: "Which San Francisco metrics have no Oakland equivalent, and which Oakland datasets could feed them?" },
    { goal: "Build one", say: "Create an Oakland metric for [thing] from the 311 dataset, using the description field, and confirm the numbers look right." },
    { goal: "Compare cities", say: "Compare Oakland's 311 closure rate to every other launched city and rank them." },
    { goal: "Check a claim", say: "Oakland says [claim]. Does the data support that? Show me the chart and the source dataset." },
    { goal: "Go deep", say: "Create a research report on whether abandoned auto response times changed after the 2022 move to the Department of Transportation." },
    { goal: "Write it up", say: "Write a story about [finding] in Oakland. Include the chart and cite the dataset." },
    { goal: "Preview Sunday", say: "Generate a sample Oakland newsletter for this week and show it to me." },
  ],
  caveats: {
    title: "Two things to know about Oakland's data",
    body: (
      <>
        <b>Crime data runs about 90 days behind.</b> The Police Department&apos;s public feed lags, so a
        year-to-date crime number is not current through today. Treat the last quarter as incomplete rather
        than as a decline. <b>Potholes hide in the description field.</b> Oakland files them under a broad
        streets category, so the pothole metrics read the description text (“Streets, Potholes/Depression”)
        rather than the category. If a 311 topic you care about seems missing, it is often there under a
        different field, and Seymour can go find it.
      </>
    ),
  },
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
      each one does, why it exists, and which ones matter first. Read the first section, then go try things.
      Everything else is here when you need it.
    </>
  ),
  firstSteps: [
    {
      title: "Sign in and find Miami",
      body: (
        <>
          In the left nav under <b>My Places</b>, click <b>Miami, Florida</b>. You will see a purple{" "}
          <b>Admin View</b> banner across the top. That banner means you are seeing the admin version of the
          page, with extra tabs that residents do not get.
        </>
      ),
    },
    {
      title: "Look at what Miami already has",
      body: (
        <>
          Click the <b>All metrics</b> tab. Today Miami tracks 13 metrics across crime, permits, 911 calls
          and traffic crashes. Notice the year-to-date comparison for each one. That table is the raw
          material for everything else.
        </>
      ),
    },
    {
      title: "Ask Seymour a question",
      body: (
        <>
          Click <b>New Chat</b> and type:{" "}
          <i>
            “Traffic calls for service in Miami are up 16 percent this year. Where in the city is that
            increase concentrated? Show me a map by commission district.”
          </i>{" "}
          Seymour will pull data, chart it, and explain.
        </>
      ),
    },
    {
      title: "Ask Seymour what is broken",
      body: (
        <>
          In the same chat:{" "}
          <i>
            “The serious and fatal traffic crashes metric shows no 2026 data. Did Miami&apos;s crash dataset stop
            updating, move, or change shape?”
          </i>{" "}
          Finding a broken feed is a real result.
        </>
      ),
    },
    {
      title: "Open the admin menu",
      body: (
        <>
          Click the <b>green circle</b> at the bottom left of the nav. That is the full admin toolset, and it
          is where this guide lives. Just see what is there, then come back here.
        </>
      ),
    },
    {
      title: "Read the five Miami stories",
      body: (
        <>
          Back on the Miami dashboard, scroll to <b>New stories</b>. These were generated by Seymour from
          anomalies in the metrics. They are what the Sunday newsletter is built from.
        </>
      ),
    },
  ],
  promptsIntro: <>Analysis questions are safe and cheap to ask as often as you like.</>,
  prompts: [
    {
      text: "Demolition permits in Miami are up 11 percent this year. Which neighborhoods are they concentrated in, and what kinds of buildings are coming down?",
      note: "Starts from a dashboard metric, then digs into the underlying dataset.",
    },
    {
      text: "Show ShotSpotter activations by commission district for the last 12 months. Is any district trending up while the citywide number is flat?",
      note: "Analysis by place. Ask for the map and the table.",
    },
    {
      text: "Which datasets on Miami's open-data portal have we catalogued but never used in a metric? Rank them by how useful they would be to a resident.",
      note: "Discovery from the data side.",
    },
    {
      text: "Police calls for service are down 9 percent and violent crime is down 9 percent. Is that one trend or two? Compare them month by month and by district.",
      note: "Analysis across metrics.",
    },
    {
      text: "Which Miami metrics have stale data or failed their last run, and what is the most likely cause for each?",
      note: "Health check.",
    },
    {
      text: "Run anomaly detection on Miami's drug-related 911 calls and show me anything unusual since June.",
      note: "Analysis that feeds stories.",
    },
  ],
  metricRows: [
    {
      category: "Crime",
      metrics: <>Property Crime Incidents · Drug Crime Incidents · Violent Crime Incidents</>,
      count: 3,
    },
    {
      category: "Housing / Permits",
      metrics: (
        <>
          Demolition Permits Issued · New Commercial Construction Permits Filed · New Residential
          Construction Permits Filed / Issued / Completed
        </>
      ),
      count: 5,
    },
    {
      category: "Safety / 911 calls",
      metrics: (
        <>
          Police Calls for Service · Drug-Related 911 Calls · ShotSpotter Activations · Traffic Calls for
          Service
        </>
      ),
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
      The platform has 51 shared templates. Miami has 17 instantiated, 18 attempted, and 34 not yet tried.
      Many of the missing ones will fail because Miami does not publish that data. Some will succeed.
      Finding out which is a good week&apos;s work.
    </>
  ),
  challenge: [
    {
      title: "A place not getting its share of service",
      body: (
        <>
          Ask Seymour to map police calls for service and permit activity by commission district, then look
          for the district where response is slowest or activity has stalled.
        </>
      ),
    },
    {
      title: "A broken feed",
      body: (
        <>
          The KSI traffic crashes metric shows no 2026 data. Is Miami&apos;s crash dataset lagging, renamed, or
          moved? That alone is a story if the city stopped publishing.
        </>
      ),
    },
    {
      title: "A missing metric residents would want",
      body: (
        <>
          311 requests, code enforcement, park maintenance, transit, flooding and sea level, building
          inspections. Ask Seymour what Miami actually publishes on each topic and how current it is.
        </>
      ),
    },
    {
      title: "A trend nobody has noticed",
      body: (
        <>
          Residential permits filed are down 59 percent year to date while permits issued are up 9 percent.
          Policy change, data artifact, or a real slowdown coming? Research it.
        </>
      ),
    },
    {
      title: "Something you already care about",
      body: (
        <>
          The best problem is the one you would want answered as a resident. Ask it. If the data is not there
          yet, that becomes the metric to build.
        </>
      ),
    },
  ],
  challengeOutro: (
    <>
      When you find something, write it up as a story or a research report so it lands in the feed and the
      newsletter. That is the loop: data, then a finding, then published, then residents and officials see
      it.
    </>
  ),
  cheatSheet: [
    { goal: "See what exists", say: "List all active metrics for Miami with their last run status and last data date." },
    { goal: "Find what to add", say: "Which Miami datasets are catalogued but not used by any metric? Which three would make the best new metrics?" },
    { goal: "Add one", say: "Instantiate the [template name] template for Miami and tell me which dataset and fields you used." },
    { goal: "Fix a stale one", say: "Check freshness for Miami's KSI traffic crashes metric. If the dataset changed, find the replacement." },
    { goal: "Compare cities", say: "Rank every launched city by year-to-date change in demolition permits and highlight Miami." },
    { goal: "Look by district", say: "Show Miami police calls for service by commission district for the last 12 months, as a map and a table." },
    { goal: "Find anomalies", say: "Run anomaly detection on all Miami metrics for the last 90 days and show me the three most significant." },
    { goal: "Write a story", say: "Write a story about [finding] in Miami. Include the year-to-date chart and cite the dataset." },
    { goal: "Go deep", say: "Create a research report on [question] in Miami." },
    { goal: "Automate it", say: "Create a weekly scheduled job for Miami that looks for permit anomalies by district and writes stories about them." },
    { goal: "Preview Sunday", say: "Generate a sample Miami newsletter for this week and show it to me." },
  ],
};

export const CITY_GUIDES: CityGuide[] = [OAKLAND, MIAMI];

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
