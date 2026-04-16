# TransparentCITY Frontend QA Checklist

## Context
With 25 cities launching April 15, this checklist covers every public-facing entry point and key authenticated flows. Items marked with **[REG]** are regression checks for bugs that have appeared repeatedly in recent commits.

---

## 1. Public Landing Page (`/`)

- [ ] Page loads without errors
- [ ] Featured stories skeleton loads, then real content replaces it (no layout shift) **[REG]**
- [ ] Metric cards display data; cards with 0-value or incomplete data are filtered out **[REG]**
- [ ] Metric cards hide Share button and overflow menu (landing page only) **[REG]**
- [ ] Landing page card styling (padding, border-radius, hover) matches feed cards **[REG]**
- [ ] City selector / search works
- [ ] CTA buttons link correctly (sign up, explore, etc.)
- [ ] Unauthenticated user sees landing; authenticated user redirects to `/home`
- [ ] SEO: correct `<title>`, meta description, OG tags
- [ ] JSON-LD structured data present

## 2. City Dashboard (`/c/[slug]`)

- [ ] Page loads for each launched city slug
- [ ] Hero: city name and follow button render (mayor name removed from header, shown in selector below) **[REG]**
- [ ] "Datasets" count and "as of" date appear below Citywide Dashboard title **[REG]**
- [ ] Metrics section populates with real data
- [ ] No metric cards with zero/tiny values (< 5) or "down 100%" from stale data **[REG]**
- [ ] Metric cards show correct category icon (not hardcoded Landmark for all) **[REG]**
- [ ] Metric card source text shows portal domain or date range, not "safety data" **[REG]**
- [ ] District list/map renders
- [ ] District selector dropdown includes "Mayor/Citywide" as first option **[REG]**
- [ ] District selector keyboard nav works (arrow keys, Home/End, Escape) **[REG]**
- [ ] Follower counts hidden when zero **[REG]**
- [ ] Follow button shows toast confirmation on click **[REG]**
- [ ] Loading state for Follow scoped per-district, not global **[REG]**
- [ ] Featured stories appear (10 most recent for logged-out visitors) **[REG]**
- [ ] District story cards: stories without URLs render as `<div>`, not `<a href="#">` **[REG]**
- [ ] Links to district, metric detail, stories all resolve
- [ ] PageFeedback widget appears and submits successfully
- [ ] SEO: dynamic OG image, meta tags, JSON-LD
- [ ] ISR: page revalidates within expected window (1 hr)

## 3. District Dashboard (`/c/[slug]/district/[districtId]`)

- [ ] Page loads with district-specific data
- [ ] District metrics display
- [ ] Leader/supervisor info renders with correct "First Last" format **[REG]**
- [ ] Leader name tooltips on district navigation pills **[REG]**
- [ ] Follower counts hidden when zero **[REG]**
- [ ] Follow button toast feedback works **[REG]**
- [ ] Empty state message when district has no recent stories **[REG]**
- [ ] Back navigation to city dashboard works
- [ ] Breadcrumb component renders and links correctly **[REG]**
- [ ] PageFeedback widget present

## 4. Metric Detail Page (`/c/[slug]/metrics/[metricKey]`)

- [ ] Page loads with metric title, description
- [ ] Charts render with real data
- [ ] Trend lines / historical data display
- [ ] No misleading "down 100%" trend on stale metrics with 0 current value **[REG]**
- [ ] Date ranges display correctly across timezones (UTC midnight bug) **[REG]**
- [ ] Chart detail drill-down works (`/c/[slug]/metrics/[metricKey]/chart/[chartId]`)
- [ ] Category page works (`/c/[slug]/category/[category]`)
- [ ] Dynamic OG image generates correctly for sharing
- [ ] Breadcrumb component renders correctly **[REG]**
- [ ] SEO: structured data, meta tags

## 5. Story Detail Page (`/c/[slug]/stories/[hash]`)

- [ ] Page loads with full story content
- [ ] Icons render as Lucide SVGs, not raw icon name strings **[REG]**
- [ ] Inline styles are replaced with CSS classes (headline, lede, hero image, body, share row) **[REG]**
- [ ] All card templates render correctly:
  - [ ] Alert
  - [ ] Compact
  - [ ] MultiMetric
  - [ ] OffTheCharts: stat numbers not oversized (17px not 24px), stat+label inline **[REG]**
  - [ ] Photo
  - [ ] Spending
  - [ ] TextChart
  - [ ] TextOnly
  - [ ] Traction (positive/good-news stories)
- [ ] OTC and milestone headlines truncated to 65 chars at word boundary **[REG]**
- [ ] Feed cards with bad data suppressed: no 0-value drops, no >500% changes **[REG]**
- [ ] Share links work
- [ ] CTA always visible: falls back to dashboard link when no detail_url **[REG]**
- [ ] Short URL redirect works (`/s/[hash]` -> canonical story URL, 308)
- [ ] PageFeedback widget present
- [ ] SEO: OG tags for social sharing

## 6. Evergreen Safety Pages (`/c/[slug]/safe`, `/c/[slug]/[districtSlug]/safe`)

- [ ] City-level safety page loads
- [ ] District-level safety page loads
- [ ] All 20+ evergreen components render:
  - [ ] Safety scorecard
  - [ ] Grade display
  - [ ] Crime breakdown
  - [ ] Trend charts
  - [ ] Peer city comparisons
  - [ ] Street conditions
  - [ ] District pulse
- [ ] JSON-LD structured data for SEO
- [ ] Internal links resolve correctly

## 7. Newsletter Archive (`/c/[slug]/newsletter/[date]`)

- [ ] Page loads with newsletter content
- [ ] Date formatting correct across timezones (no off-by-one month) **[REG]**
- [ ] Breadcrumb component renders correctly **[REG]**
- [ ] Links within newsletter content work
- [ ] Sitemap includes newsletter URLs
- [ ] SEO: meta tags, indexability

## 8. Methodology Page (`/c/[slug]/methodology`)

- [ ] Page loads with methodology content
- [ ] All sections render

## 9. Authenticated Dashboard (`/home`)

- [ ] Redirects to login if unauthenticated
- [ ] Loads user's followed cities
- [ ] Feed renders with personalized content
- [ ] Default feed order is `published_at` (chronological), not `for_you` **[REG]**
- [ ] Cities with no metrics show stories in table view **[REG]**
- [ ] Stories slot passes through to both card-grid and table-view branches **[REG]**
- [ ] City stories not hidden behind saved-places filter when city is selected **[REG]**
- [ ] Sidebar navigation works (My Places, maps, etc.)
- [ ] Dashboard discoverability: can users find it easily?
- [ ] Overflow menu on feed cards hidden for non-admin users **[REG]**
- [ ] Admin users see full overflow menu (Share, Hide, Delete) **[REG]**
- [ ] Filter panel: Done button appears on mobile **[REG]**
- [ ] Filter panel: backdrop tap applies draft filters before closing (no lost selections) **[REG]**
- [ ] Filter panel: "Clear filters" resets to `published_at` default **[REG]**

## 10. Map Incident Interaction (find a police incident on the map and read it)

### Finding an incident
- [ ] Open city dashboard map (e.g. `/c/san-francisco`)
- [ ] Map loads with Mapbox tiles and incident markers/clusters visible near city center
- [ ] Clusters show count badge; zooming in splits clusters into individual points
- [ ] Points with media (photos) show gold circle stroke instead of white

### Clicking a single incident point
- [ ] Bottom panel opens with "Point details" header and close button
- [ ] **Title/name** of incident displays
- [ ] **Description** text displays (if available)
- [ ] **Incident date/time** displays (incident_datetime, incident_date, or date field)
- [ ] **Incident type** displays (e.g. assault, theft, burglary)
- [ ] **Disposition** displays (e.g. arrest, GOA, cited)
- [ ] **Police district** or geographic field displays
- [ ] Internal fields are hidden (no _opacity, _useGrey, lat, lon, color, mapId, scale)
- [ ] HTML in field values renders correctly (dangerouslySetInnerHTML)

### Clicking an aggregated cluster point
- [ ] Shows count of points (e.g. "15 points at this location")
- [ ] Shows category summaries (unique incident types, dispositions)
- [ ] Shows date range spanning the aggregated points

### Anomaly map (`/a/[id]`)
- [ ] Chart renders with recent vs. comparison period
- [ ] Map overlay shows location data for recent period
- [ ] Clicking anomaly point shows top 8 properties in bottom panel
- [ ] Percent change and statistical fields display

### Mobile-specific map checks
- [ ] Bottom panel sits above mobile bottom nav (uses `calc(--bottom-nav-height + safe-area-inset-bottom)`) **[REG]**
- [ ] Map is touch-friendly: pinch to zoom, drag to pan
- [ ] Point details panel is scrollable if content overflows
- [ ] Close button on point details panel is tappable (44px target)
- [ ] Media gallery opens correctly on tap for points with photos
- [ ] Mapbox popups don't get clipped by bottom nav **[REG]**

## 11. Onboarding Flow (create account or login with home address)

### City-level loading (enter a city name, not a precise address)
- [ ] Enter city name (e.g. "San Francisco") in WelcomeModal
- [ ] `hasPreciseLocation` is NOT set (city-level geocode)
- [ ] Click "Let's go" after preferences step
- [ ] Purple-bordered banner appears: "Looking for stories in {city}..." with spinner **[REG]**
- [ ] Banner appears between filter chips and first story card
- [ ] Navigation to feed happens immediately (no blank screen while loading)
- [ ] When stories load: banner turns green, shows "Your {city} feed is ready!"
- [ ] If no stories: shows "No stories in {city} yet. Here's what's trending:"
- [ ] Banner auto-dismisses after 5 seconds
- [ ] Dismiss button (X) in top-right of banner works

### Place-level loading (enter a precise street address)
- [ ] Enter full address (e.g. "123 Main St, San Francisco") in WelcomeModal
- [ ] Address suggestions dropdown appears and is tappable
- [ ] `hasPreciseLocation` is set to true (address/POI geocode) **[REG]**
- [ ] After "Let's go": banner initially shows "Looking for stories in {city}..."
- [ ] Banner switches to progressive place-level messages:
  - [ ] "Pulling public data near your address..." (0-10s)
  - [ ] "Analyzing trends in your neighborhood..." (10-22s)
  - [ ] "Searching for anomalies in the data..." (22-36s)
  - [ ] "Building stories from what we found..." (36-55s)
  - [ ] "Finishing up your neighborhood feed..." (55-90s)
  - [ ] "Still working on it, this can take a minute..." (90s+)
- [ ] If representative found during loading: temporary "Found your representative: {name}" message (4 sec)
- [ ] On completion: "Your neighborhood feed is ready!" with green border/checkmark
- [ ] No silent auto-switch to All Cities while scanning **[REG]**

### Government signup flow **[REG]**
- [ ] Government users see pre-Auth0 interstitial (GovernmentSignupMessage) before redirect
- [ ] Interstitial tells users to use government email when creating account
- [ ] After Auth0, government users go through standard WelcomeModal (same as residents)
- [ ] Escape key dismisses government signup message modals (CitySignupButton, Header)

### Error handling
- [ ] Correct error message when city detail fetch fails (not generic error) **[REG]**
- [ ] Welcome modal step indicator renders correctly (no stray braces) **[REG]**

### Onboarding state management (race conditions) **[REG]**
- [ ] `startCityLoading` resets `backgroundWorkActiveRef` (prevents stuck banner from prior session)
- [ ] `applyCityCompletion` is idempotent (duplicate calls don't create multiple dismiss timers)
- [ ] Banner auto-dismiss is 2 seconds (not 5) **[REG]**
- [ ] FeedContainer dismisses place banner immediately when new stories arrive after job completion **[REG]**
- [ ] `startJob` preserves `found_rep` status so mayor/rep notifications finish before place messages begin **[REG]**
- [ ] No silent auto-switch to All Cities while scanning **[REG]**
- [ ] `completeCityLoading` defers while background work is active, applies on `completeBackgroundWork`

### Mobile-specific onboarding checks
- [ ] Welcome modal dropdown touch targets large enough on mobile **[REG]**
- [ ] Address suggestions list is scrollable and tappable on small screens
- [ ] Banner text doesn't overflow on 375px width
- [ ] Dismiss button is tappable on mobile
- [ ] Input font-size is 16px (prevents auto-zoom on Android/iOS) **[REG]**
- [ ] `overscroll-behavior: contain` on modal (prevents scroll chaining) **[REG]**
- [ ] Buttons have `touch-action: manipulation` (removes 300ms tap delay) **[REG]**
- [ ] Tappable elements have `-webkit-tap-highlight-color: transparent` **[REG]**

## 11. Short URL Redirects

- [ ] `/s/[hash]` redirects to `/c/[slug]/stories/[hash]` (308 permanent)
- [ ] `/r/[hash]` loads public research report
- [ ] Fallback: `/s/[hash]` falls back to `/feed/[id]` if city slug unavailable

## 12. Research Pages (`/research`, `/research/[id]`, `/r/[hash]`)

- [ ] `/research` requires auth, shows login prompt if not authenticated
- [ ] `/research/new` creates new report
- [ ] `/research/[id]` shows report detail
- [ ] `/r/[hash]` renders public view without auth

## 13. Anomaly & Map Pages

- [ ] `/a/[id]` loads anomaly visualization
- [ ] `/m/[hash]` loads map view
- [ ] Map point details, popups, and legend sit above mobile bottom nav **[REG]**
- [ ] `/maps` (auth required) shows map gallery

## 14. Chat (`/chat/[hash]`)

- [ ] Public chat session renders messages and context

## 15. Static/Info Pages

- [ ] `/privacy` loads
- [ ] `/terms` loads
- [ ] `/about/seymour` loads
- [ ] `/add-your-city` loads
- [ ] `/cost` loads

## 16. Feed Routes

- [ ] `/feed/[id]` loads story by numeric ID
- [ ] `/feed-preview` and `/feed-preview/[id]` load for previewing

---

## 17. Dark Mode **[REG]**

Dark mode has broken repeatedly. Test each of these in dark mode explicitly:

- [ ] City hero section: background, text, key numbers all readable
- [ ] Dashboard cards: no white-on-white or invisible text
- [ ] District selector dropdown: dark background, visible active state **[REG]**
- [ ] District selector uses standardized CSS variables (not `--bg-primary-dark` etc.) **[REG]**
- [ ] Story detail page: headline, lede, body, share row all styled
- [ ] `.btn-outline` renders correctly (borders use dark-mode-aware variables) **[REG]**
- [ ] Mobile signup bar: no undefined `--border-color` variable
- [ ] Hero category links: use CSS variables, not hardcoded rgba white
- [ ] Map preview city label: uses CSS variables
- [ ] Metric row hover state: uses CSS variables
- [ ] Explainer/benefits sections on city page: readable
- [ ] All dark mode uses `.dark` class selectors, NOT `@media (prefers-color-scheme: dark)` **[REG]**
  - Prior bug: 8 CSS files used prefers-color-scheme which follows OS, not app toggle. Users with OS dark mode who chose light in Settings saw stuck dark components.
- [ ] Dashboard/Map tab inactive state has visible baseline border in dark mode **[REG]**
- [ ] Body background and delete-hover color use CSS variables, not hardcoded values **[REG]**

## 18. Mobile Compatibility (test at 320px, 375px, and 768px)

### Global / Layout
- [ ] No horizontal overflow or scrolling on any page
- [ ] Bottom nav bar renders at fixed 48px height, not doubling **[REG]**
- [ ] Bottom nav does not overlap map popups, media gallery, anomaly sheets, or legend **[REG]**
- [ ] Bottom nav labels: `white-space: nowrap`, no wrapping **[REG]**
- [ ] `viewport-fit: cover` present in meta tag for iPhone safe areas **[REG]**
- [ ] `env(safe-area-inset-bottom)` padding on footer and city dashboard wrapper **[REG]**
- [ ] Sidebar does not freeze body scroll on open/close (scroll lock) **[REG]**
- [ ] All modals and drawers are usable on small screens
- [ ] Font sizes are readable without zooming
- [ ] Touch targets are at least 44x44px (signup bar dismiss button specifically) **[REG]**
- [ ] Mobile signup bar dismiss button is 44px and has dark mode styling **[REG]**

### Landing Page (Mobile)
- [ ] Hero section stacks vertically
- [ ] Featured stories skeleton loads, then content appears without shift **[REG]**
- [ ] CTA buttons are full-width and tappable

### City Dashboard (Mobile)
- [ ] Hero: mayor name wraps correctly at 320-375px **[REG]**
- [ ] Follow button has min-height on mobile **[REG]**
- [ ] Key-number metric labels truncate with ellipsis (no overflow) **[REG]**
- [ ] District list is scrollable
- [ ] Map component is touch-friendly (pinch/zoom)
- [ ] Cards stack vertically
- [ ] Coming-soon empty state is responsive **[REG]**

### Feed Cards (Mobile)
- [ ] Feed container padding correct at small widths **[REG]**
- [ ] OTC emoji scales properly on small screens **[REG]**
- [ ] MetricSummaryCard fonts adjusted for small screens **[REG]**
- [ ] OffTheCharts stat numbers inline, not oversized **[REG]**

### Metric Detail (Mobile)
- [ ] Charts resize to viewport width
- [ ] Chart interactions (tap for tooltip) work on touch
- [ ] No metric value truncation or overflow

### Story Detail (Mobile)
- [ ] All card templates render correctly at mobile width
- [ ] Images scale proportionally
- [ ] Text is legible

### Safety Pages (Mobile)
- [ ] Scorecard components stack
- [ ] Tables scroll horizontally if needed
- [ ] Charts resize

### Newsletter (Mobile)
- [ ] Content fits viewport
- [ ] Images scale

### Dashboard / Auth Pages (Mobile)
- [ ] Sidebar collapses to mobile nav without freezing scroll **[REG]**
- [ ] Nav email input does not overflow container **[REG]**
- [ ] Feed items are tappable
- [ ] Login flow works on mobile browsers

---

## 19. Accessibility **[REG]**

- [ ] FollowButton has `aria-pressed` and `aria-label` attributes
- [ ] FollowButton small variant meets 32px minimum desktop size **[REG]**
- [ ] `focus-visible` outline on story related cards for keyboard nav
- [ ] Global `focus-visible` cannot be suppressed by component-level `outline: none` **[REG]**
- [ ] District selector: `role="option"` on list items, not nested buttons
- [ ] Keyboard navigation on district selector (arrow keys, Home/End, Enter, Escape)
- [ ] Mobile signup bar dismiss button has accessible label
- [ ] ContextMenu admin items are `<button>` with ARIA menu roles, not `<div>` **[REG]**
- [ ] Decorative SVGs have `aria-hidden="true"` (ContextMenu, Header logo, HeroDistrictSelector, CardHeader) **[REG]**
- [ ] Focus trap active in AuthModal and WelcomeModal (useFocusTrap hook) **[REG]**
- [ ] `id="main-content"` on main element across all pages (skip-link target) **[REG]**
- [ ] Metrics dashboard table has proper table roles **[REG]**
- [ ] Feed card articles do not have `role="link"` **[REG]**
- [ ] WelcomeModal has `role="dialog"` **[REG]**

## 20. Cross-Browser (Desktop)

- [ ] Chrome (latest)
- [ ] Safari (latest)
- [ ] Firefox (latest)
- [ ] Edge (latest)

## 21. Cross-Browser (Mobile)

- [ ] iOS Safari (safe area insets, viewport-fit)
- [ ] Android Chrome
- [ ] iOS Chrome

## 22. Text Readability & Color Tokens

- [ ] `--text-secondary` is `#374151` in light mode (not `#6b7280`) **[REG]**
  - Prior bug: feed body text was too light gray at #6b7280, now darkened to #374151
- [ ] Token change applied consistently across `dashboard.css`, `home/dashboard.css`, `landing.css`, `tokens.css` **[REG]**
- [ ] Green indicator color in ContextMenu meets WCAG AA contrast **[REG]**

## 23. Performance & SEO Baseline

- [ ] Lighthouse score > 80 on key public pages (landing, city dashboard, safety)
- [ ] Core Web Vitals: LCP < 2.5s, CLS < 0.1, INP < 200ms
- [ ] Featured stories skeleton prevents CLS on landing and city pages **[REG]**
- [ ] Scroll position handler throttled with requestAnimationFrame **[REG]**
- [ ] `sitemap.xml` includes all launched cities, newsletters, safety pages
- [ ] Sitemap handles nullish city slugs gracefully **[REG]**
- [ ] `robots.txt` is correct
- [ ] OG images load on social sharing (test with Twitter/Facebook debugger)
- [ ] PostHog and Vercel Analytics firing

## 24. Data Quality Guards

These are frontend checks for bad backend data that has caused visible bugs:

- [ ] Metric cards with value 0 or < 5 are filtered from display **[REG]**
- [ ] No "-100% drops" shown (stale metrics where current value is 0) **[REG]**
- [ ] No ">= 90% drops" shown in feed cards (extreme drop filter) **[REG]**
- [ ] No ">500% changes" shown in feed cards **[REG]**
- [ ] OTC/milestone headlines capped at 65 chars at word boundary **[REG]**
- [ ] General headlines capped at 70 chars (`MAX_HEADLINE_LENGTH` in `headlineCleanup.ts`) **[REG]**
- [ ] Category icons use `getCategoryMeta()` lookup, not hardcoded **[REG]**
- [ ] "Controller" recognized as alias for "Spending" category **[REG]**
- [ ] Metric source text: portal domain > date range > empty (no "safety data") **[REG]**

## 25. Error States

- [ ] 404 page renders for invalid city slug
- [ ] 404 page renders for invalid metric key
- [ ] 404 page renders for invalid story hash
- [ ] API timeout / failure shows graceful error state (not blank page)
- [ ] Auth error toast appears on login failure
- [ ] Onboarding: correct error when city detail fetch fails **[REG]**
- [ ] Feed empty state shown when city has no stories (not blank) **[REG]**
- [ ] Metric card: failed city retry and fallback headline work **[REG]**

---

## How to Use This Checklist

1. **Per-city spot check**: Run sections 2-8, 17, and 18 for a sample of cities (pick 3-5 diverse ones)
2. **Pre-deploy regression**: Run the full checklist against staging, prioritize **[REG]** items
3. **Mobile pass**: Section 18 + 21 using Chrome DevTools at 320px, 375px, and 768px + real iPhone
4. **Dark mode pass**: Section 17, test with browser/OS dark mode toggle
5. **SEO audit**: Sections focused on SEO bullets + section 22
6. **Data quality**: Section 23, test with cities that have sparse or missing data
