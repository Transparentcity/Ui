# Claude Code QA Runbook -- Launch Day (April 15, 2026)

## What This Is

This is an automated QA plan for Claude Code to execute against the production site (transparent.city) and/or the local dev server. It focuses on the most likely real-world pathways people will hit tomorrow:

> **Companion docs (separable cadences):**
> - [`STORY_CONTENT_AUDIT.md`](STORY_CONTENT_AUDIT.md) — weekly deep audit of recent feed stories: imprecise language, near-duplicates, missing source attribution, data-gap disclosure, illogical claims. Backed by `scripts/qa/audit_recent_stories.py`.
> - [`SMOKE_TESTS.md`](SMOKE_TESTS.md) — per-deploy fast checks for onboarding flows, analytics, map controls, and mobile affordances.

1. Someone sees a post on X or reads a Substack newsletter, clicks a link, lands on a city page or story
2. They look around, decide to sign up, go through onboarding
3. They land in their feed and start exploring

The biggest risk areas are: **mobile bugs** (especially Android, which we don't test manually), **onboarding not completing properly**, and **people landing in the wrong place after signup**.

> **Domain note:** The production site is `transparent.city`. The old domain `transparentcity.com` redirects there via Vercel config (see `vercel.json`). The domain `transparentcity.co` is a *different, unrelated website* (an NYC apartment rental platform) and should never be used in testing or documentation.

---

## Phase 0: Pre-Flight Checks

Before testing user flows, verify the infrastructure is working.

### 0.1 Production is up
- [ ] `curl -sI https://transparent.city` returns 200
- [ ] `curl -sI https://transparent.city/c/san-francisco` returns 200
- [ ] `curl -sI https://transparent.city/c/austin` returns 200

### 0.2 Get the launched cities list
- [ ] Fetch `/api/public/cities/sitemap` and list all cities where `is_launched === true`
- [ ] Verify the count matches expected (should be ~25)
- [ ] Check that every launched city has a valid slug (no nulls, no empty strings)
- [ ] Cross-check: every city in the sitemap should appear in the launched list (and vice versa). Flag any mismatches. *April 14 finding: Memphis appeared in the sitemap but returned a "coming soon" state, meaning it was not actually launched. Unlaunched cities in the sitemap get ugly lowercase metadata.*

### 0.3 Sitemap and SEO basics
- [ ] Fetch `/sitemap.xml` -- verify it parses as valid XML
- [ ] Confirm every launched city slug appears in the sitemap
- [ ] Confirm no unlaunched cities appear in the sitemap (they'll have raw-slug metadata like `"memphis"` instead of `"Memphis, Tennessee"`)
- [ ] Confirm `/robots.txt` exists and allows crawling of `/c/` paths
- [ ] Spot check 3 city pages for OG meta tags (og:title, og:description, og:image)

### 0.4 Short URL redirects
- [ ] `curl -sI https://transparent.city/s/` with a known story hash -- verify redirect to `/c/[slug]/stories/[hash]`
- [ ] Note: Next.js `redirect()` returns **307** by default, not 308. If 308 is desired for SEO (permanent redirect, link equity transfer), the code in `src/app/s/[hash]/page.tsx` needs to use `permanentRedirect()` instead.
- [ ] Verify the redirect destination page loads (200)

### 0.4a Map title PII scan (highest-risk pre-flight)

The May 2026 audit found personalization tokens ("My Block", "My Place", "Home", user first names) leaking into public map titles surfaced on `/c/{city-slug}` and into HTML `<title>` tags at `/m/{id}`. These are search-engine indexable. Run this BEFORE any other phase; if any FAIL line prints, halt the runbook and escalate.

```bash
# Map title PII scan, all launched cities
for city in $(curl -s https://transparent.city/api/public/cities/sitemap \
  | jq -r '.[] | select(.is_launched==true) | .slug'); do
  curl -s "https://transparent.city/c/$city" \
    | grep -oE '"My Block[^"]*"|"My Place[^"]*"|"Home[^"]*"|"[A-Z][a-z]+'"'"'s (Block|Place|Neighborhood|Home)[^"]*"' \
    && echo "FAIL: PII in map titles for $city"
done

# HTML <title> tag scan, sampled map URLs from each city
# Pull the first 10 map URLs from each city dashboard, fetch each, check <title>
# Reference: Charter 5.5 audit, May 2026, found 8+ exposed map titles on /c/san-francisco
```

### 0.5 Domain redirects
- [ ] `curl -sI https://transparentcity.com` -- verify it redirects to `https://transparent.city`
- [ ] `curl -sI https://www.transparentcity.com` -- same check
- [ ] Verify the Vercel rewrite rules in `vercel.json` match production behavior

---

## Phase 1: Entry Point Testing -- "Someone Clicks a Link"

These simulate the most common way people will arrive tomorrow: clicking a link from X, Substack, email, or search results.

### 1.1 Landing on a city page cold (the most common entry)

For EACH of the 3 test cities (san-francisco, austin, and one low-data launched city):

> **City selection note:** Pick test cities from the *actually launched* list from Phase 0.2. Do not use unlaunched cities (like Memphis if it is still showing "coming soon") for feature testing. Use them only for verifying "coming soon" and empty state behavior.

**Desktop viewport (1280px):**
- [ ] Load `/c/[slug]` -- check for console errors
- [ ] Page title contains the city name (properly capitalized, with state name)
- [ ] OG meta tags present (og:title, og:description, og:image, twitter:card)
- [ ] *April 14 finding: City pages do NOT set `og:image` or `twitter:card` in metadata (`src/app/c/[slug]/page.tsx` lines 129-133). Social shares render as plain text cards with no image preview. Verify whether this has been fixed.*
- [ ] Hero section renders: city name visible (mayor name no longer in header, shown in district selector below)
- [ ] Mayor name in district selector is "First Last" format (not "Last, First")
- [ ] Metric cards section loads with at least 3 cards showing real data
- [ ] No metric cards showing value of 0 or "-100%"
- [ ] No metric cards showing ">500%" changes
- [ ] Category icons on metric cards are varied (not all the same icon)
- [ ] Stories section loads with at least 1 story card
- [ ] Story cards with no URL render as divs, not broken anchor tags
- [ ] District list/selector visible
- [ ] PageFeedback widget present on page
- [ ] No horizontal scroll
- [ ] JSON-LD structured data present in page source

**Mobile viewport (375px, simulating iPhone):**
- [ ] Same page loads without console errors
- [ ] No horizontal scroll at 375px
- [ ] Hero section readable (mayor name wraps correctly, not cut off)
- [ ] Metric cards don't overflow container
- [ ] Key-number labels truncate with ellipsis if needed
- [ ] Bottom nav bar appears (if applicable for logged-out view)
- [ ] Story cards stack vertically and are readable
- [ ] Touch targets for story cards and metric cards are at least 44px

**Mobile viewport (360px, simulating small Android):**
- [ ] Same checks as 375px
- [ ] Verify nothing breaks at this narrower width
- [ ] Text doesn't overflow any containers

**Tablet viewport (768px):**
- [ ] Layout transitions cleanly between mobile and desktop
- [ ] No awkward gaps or overlapping elements

### 1.2 Landing on a story page cold

Find 3 real story URLs across the test cities (fetch from API or scrape from city pages). For each:

**Desktop:**
- [ ] Story page loads with headline, body content
- [ ] OG meta tags for social sharing are present and populated
- [ ] Icons render as SVGs, not raw text strings like "AlertTriangle"
- [ ] No inline styles on headline, lede, hero image, body, share row (should be CSS classes)
- [ ] CTA button present (links to source or falls back to dashboard)
- [ ] Share button present and functional
- [ ] PageFeedback widget present
- [ ] Breadcrumb navigation present and links work

**Mobile (375px):**
- [ ] Story is readable without zooming
- [ ] Images scale to viewport width
- [ ] No horizontal overflow
- [ ] Share button accessible

### 1.3 Landing on a metric detail page

Find 3 metric detail URLs across test cities. For each:

**Desktop:**
- [ ] Page loads with metric title and description
- [ ] Chart renders with visible data
- [ ] No "down 100%" trend displayed on stale metrics
- [ ] Date ranges display correctly (no timezone off-by-one)
- [ ] Breadcrumb present and links to city dashboard

**Mobile (375px):**
- [ ] Chart resizes to viewport
- [ ] No metric value truncation or overflow

### 1.4 Landing on a safety page

> **Warning (April 14):** The `/c/[slug]/safe` route does NOT exist in the UI codebase. No `safe/` directory under `src/app/c/[slug]/`, no `evergreen/` components directory. All test city safety URLs return 404 in production. The CLAUDE.md references these as a major feature area with 20+ components. Confirm status before launch: if deferred, update CLAUDE.md and remove any sitemap references.

For each test city (if the route exists):

**Desktop:**
- [ ] `/c/[slug]/safe` loads with safety data
- [ ] At least 3 of the major components render (scorecard, grade, crime breakdown, trends, peer comparison)
- [ ] JSON-LD structured data present

**Mobile (375px):**
- [ ] Components stack correctly
- [ ] No overflow

### 1.5 Landing on a newsletter page

Find a newsletter URL for at least 1 test city (check the sitemap for newsletter URLs):

**Desktop:**
- [ ] Page loads with newsletter content
- [ ] Date formatting correct (no "undefined" or off-by-one month)
- [ ] Breadcrumb present

**Mobile (375px):**
- [ ] Newsletter content is readable, images scale properly
- [ ] No overflow

### 1.6 Short URL entry (simulating link from X post)
- [ ] Pick 3 story short URLs (`/s/[hash]`)
- [ ] Verify each returns a redirect (currently 307; see Phase 0.4 note)
- [ ] Verify redirect destination loads correctly
- [ ] Verify OG tags on the destination page (this is what X will scrape for the card preview)

---

## Phase 2: Signup and Onboarding -- "They Decide to Sign Up"

This is the highest-risk flow. If onboarding breaks, we lose the user.

### 2.1 Signup entry points exist and link correctly

**From the landing page (/):**
- [ ] Page loads when not authenticated
- [ ] CTA button(s) present with text encouraging signup
- [ ] CTA links/actions pass `screen_hint: "signup"` to Auth0
- [ ] `signup_intent` stored in localStorage

**From a city page (/c/[slug]):**
- [ ] Follow button visible for logged-out users (or signup prompt)
- [ ] NavEmailSignup component renders
- [ ] Email input doesn't overflow container (desktop and mobile)
- [ ] Signup CTA links include `follow_city_slug`, `follow_city_id`, `follow_city_name` params

**From a story page:**
- [ ] Some CTA or prompt to sign up is visible

### 2.2 Auth0 redirect callback handling

Verify the redirect logic in `src/app/providers.tsx`:
- [ ] `onRedirectCallback` reads `appState.returnTo`
- [ ] Auth0 callback params (`code`, `state`) are cleared from URL
- [ ] Default fallback is `/home`
- [ ] If `returnTo` includes `follow_city_slug`, those params survive the redirect
- [ ] Note: `follow_city_slug` is passed through localStorage (not URL params) to survive the Auth0 redirect. Verify localStorage is written before redirect and read/cleaned up after.

### 2.3 Post-signup landing page (/home)

Verify the dashboard at `/home`:
- [ ] If `?signup=resident` param present, WelcomeModal should trigger
- [ ] If `?signup=public-servant` param present, GovernmentOnboardingModal should trigger instead
- [ ] If `?follow_city_slug=san-francisco` present (via localStorage), the city context should be pre-selected
- [ ] If `?follow_city_id=` and `?follow_city_name=` present, they should populate correctly

### 2.4 WelcomeModal flow -- Code review

Read through `src/components/WelcomeModal.tsx` and verify:

**Step 1: Location selection**
- [ ] Address autocomplete calls `fetchAddressSuggestions()`
- [ ] City-only search works (place_type = "place" or "locality")
- [ ] Address search works (place_type = "address" or "poi")
- [ ] `hasPreciseLocation` is set correctly based on place_type
- [ ] GPS button exists and handles geolocation API

**Step 2: Preferences**
- [ ] Newsletter opt-in defaulted to true
- [ ] Category selection available
- [ ] "Let's go" button triggers `startCityLoading()` and (if precise) `startJob()`

**Completion:**
- [ ] Welcome email sent via `/api/welcome-email`
- [ ] *April 14 finding: `sendWelcomeEmail()` logs errors only to console. No user-facing feedback, no analytics tracking of send failures.*
- [ ] User lands in feed with correct city context
- [ ] No blank screen during transition
- [ ] *April 14 finding: `updateUserPreferences()` (~line 915) is fire-and-forget. If the user closes the tab during the background job, newsletter opt-in and category selections may be silently lost. Verify if retry logic has been added.*

### 2.5 OnboardingBanner states

Read `src/components/feed/OnboardingBanner.tsx` and verify:

**City-level loading (no precise address):**
- [ ] Purple banner: "Looking for stories in {city}..." with spinner
- [ ] Banner position: between filter chips and first story card
- [ ] Green banner on success: "Your {city} feed is ready!"
- [ ] Fallback if no stories: "No stories in {city} yet. Here's what's trending:"
- [ ] Auto-dismiss after **2 seconds** (reduced from 5s in commit acb7533) **[REG]**
- [ ] Manual dismiss (X button) works

**Address-level loading (precise address):**
- [ ] Progressive messages cycle through:
  - "Pulling public data near your address..." (0-10s)
  - "Analyzing trends in your neighborhood..." (10-22s)
  - "Searching for anomalies in the data..." (22-36s)
  - "Building stories from what we found..." (36-55s)
  - "Finishing up your neighborhood feed..." (55-90s)
  - "Still working on it, this can take a minute..." (90s+)
- [ ] Representative found message appears if applicable
- [ ] Final completion message: "Your neighborhood feed is ready!"
- [ ] No silent auto-switch to All Cities during scanning

### 2.6 Onboarding state management and race conditions **[REG]**

These bugs were found and fixed in commits 5b5bdec, acb7533, 35cf5da:

- [ ] `startCityLoading` resets `backgroundWorkActiveRef` so stale state from a prior session (user navigated away mid-onboarding) does not cause the banner to hang indefinitely on return
- [ ] `applyCityCompletion` is idempotent (React effect re-fires don't create duplicate dismiss timers)
- [ ] FeedContainer dismisses place banner immediately when new stories arrive after job completion, rather than waiting for the 2s timer
- [ ] `startJob` preserves `found_rep` status so mayor/rep notifications finish displaying before place-level messages begin
- [ ] `completeCityLoading` defers while background work is active, applies on `completeBackgroundWork`
- [ ] cityId/coordinates come from WelcomeModal context, not re-read from preferences (race condition fix)
- [ ] Background work `start` always fires first, `complete` fires in `finally` even when dependencies throw

### 2.7 Government signup flow **[REG]**

Simplified in commit d95fa82. The old multi-step GovernmentOnboardingModal (email verification, code entry, claim profile) was replaced with:

- [ ] Pre-Auth0 interstitial (GovernmentSignupMessage) tells government users they get free resources and should use their government email
- [ ] After Auth0, government users go through the same WelcomeModal as residents
- [ ] GovernmentSignupMessage appears in AuthModal, CitySignupButton, and Header
- [ ] Escape key dismisses the government signup message modals
- [ ] `?signup=public-servant` param triggers standard WelcomeModal (not old GovernmentOnboardingModal)

### 2.8 Error handling in onboarding

- [ ] If city detail fetch fails, user sees a specific error (not generic)
- [ ] Welcome modal step indicator renders correctly (no stray braces)
- [ ] If API times out during place creation, user gets feedback (not blank screen)

---

## Phase 3: Post-Signup Experience -- "They're In, Now What?"

### 3.1 Feed renders with content

- [ ] `/home` shows stories in the feed
- [ ] Stories are relevant to the selected city
- [ ] Default feed order is `published_at` (chronological), not `for_you` **(changed in commit 979ac49)** **[REG]**
- [ ] Cities with no metrics show stories in table view
- [ ] Stories slot passes through to both card-grid and table-view branches
- [ ] City stories not hidden behind saved-places filter
- [ ] Empty state shown when city has no stories (not blank)
- [ ] *April 14 finding: `FeaturedStories.tsx` line 169 returns `null` when no stories, causing the section to silently vanish with no message. Verify if an explicit empty state has been added.*
- [ ] Overflow menu (ellipsis) hidden for non-admin users (redundant since cards have share button) **(fixed in commit d34dfb6)** **[REG]**
- [ ] Filter panel on mobile has a "Done" button to apply and close **(added in commit 979ac49)** **[REG]**
- [ ] Filter panel backdrop tap on mobile applies draft filters before closing (prevents losing selections) **[REG]**
- [ ] "Clear filters" resets to `published_at` to match new default **[REG]**

### 3.2 Dashboard discoverability

- [ ] From the feed, can the user find the city dashboard?
- [ ] How many navigation steps from /home to /c/[slug]? (As of April 14: 2 steps via sidebar)
- [ ] Sidebar navigation present and functional
- [ ] "My Places" or equivalent navigation works

### 3.3 Follow/unfollow flow

For each test city:
- [ ] Follow button visible on city dashboard
- [ ] Follow button has accessible attributes (aria-pressed, aria-label)
- [ ] Loading state scoped per-district, not global
- [ ] Follower counts hidden when zero

### 3.4 District navigation

- [ ] District selector dropdown renders
- [ ] "Mayor/Citywide" is first option
- [ ] Keyboard navigation works (aria roles correct, role="option" on items)
- [ ] Clicking a district loads district page
- [ ] District page has breadcrumb back to city
- [ ] Leader name in "First Last" format
- [ ] Leader name tooltips on district pills
- [ ] *April 14 finding: District pills in `HeroDistrictSelector.tsx` lacked `title` attribute for hover tooltips. WCAG commit (07d1d05) touched HeroDistrictSelector. Verify if tooltips were added.*

### 3.5 District and city empty states

- [ ] Navigate to a district with few or no stories
- [ ] *April 14 finding: When a district has zero feed stories, the section silently disappears (same pattern as city-level). Verify whether an explicit empty state message has been added.*
- [ ] Navigate to a city with few or no stories and verify the same

---

## Phase 4: Mobile-Specific Checks

Run these against the dev server or production at specific viewport widths.

### 4.1 Global mobile layout (test at 320px, 360px, 375px, 414px)

For each test city dashboard:
- [ ] No horizontal scrollbar at any width
- [ ] `viewport-fit: cover` in meta tag
- [ ] `env(safe-area-inset-bottom)` padding on footer/dashboard wrapper
- [ ] Bottom nav renders at 48px height (not doubled)
- [ ] *April 14 finding: Bottom nav CSS sets `height: 48px` but fallback values in `landing.css`, `home/page.module.css`, and `CityMapView.css` use `--bottom-nav-height: 56px`, causing 8px misalignment. Verify all padding/calc references use the correct value.*
- [ ] Bottom nav labels: `white-space: nowrap` (no wrapping)
- [ ] Font sizes readable without zooming
- [ ] All interactive elements at least 44x44px tap target

### 4.2 Mobile signup bar

- [ ] Signup bar renders on mobile
- [ ] Dismiss button is 44px and has accessible label
- [ ] No undefined `--border-color` in dark mode
- [ ] *April 14 finding: `MobileCitySignupBar.module.css` uses hardcoded `background: #ffffff` with no dark mode override. Bar is invisible/jarring in dark mode. Verify if fixed.*
- [ ] Placeholder text fits without overflow

### 4.3 Map on mobile viewports

- [ ] Map renders within viewport (no overflow)
- [ ] Bottom panel sits above bottom nav (`calc(--bottom-nav-height + safe-area-inset-bottom)`)
- [ ] Map popups don't get clipped by bottom nav
- [ ] Point details panel doesn't overflow viewport height

### 4.4 Feed cards on mobile

- [ ] Feed container padding correct at 320px
- [ ] OTC emoji scales at small widths
- [ ] MetricSummaryCard fonts adjusted for small screens
- [ ] OffTheCharts stat numbers inline (17px not 24px), stat+label inline
- [ ] OTC/milestone headlines truncated at 65 chars at word boundary

### 4.5 Onboarding modal on mobile

- [ ] Modal fits viewport at 375px
- [ ] Address suggestions list scrollable
- [ ] Dismiss button tappable
- [ ] Step indicator doesn't overflow
- [ ] Banner text doesn't overflow at 375px
- [ ] Input font-size is 16px (prevents auto-zoom on iOS/Android) **(fixed in commit b48d4ed)** **[REG]**
- [ ] Modal has `overscroll-behavior: contain` (prevents scroll chaining) **[REG]**
- [ ] All buttons have `touch-action: manipulation` (removes 300ms tap delay) **[REG]**
- [ ] Tappable elements have `-webkit-tap-highlight-color: transparent` **[REG]**
- [ ] Title/subtitle font sizes tightened for small screens **[REG]**
- [ ] GPS button meets 44px touch target minimum **[REG]**
- [ ] Modal is non-dismissable (no close button, user must complete onboarding) **(changed in commit 7551204)** **[REG]**

---

## Phase 5: Dark Mode

Test at desktop (1280px) and mobile (375px) viewports with `prefers-color-scheme: dark`.

For each test city:

### 5.1 Critical dark mode checks
- [ ] City hero: background, text, key numbers readable
- [ ] Dashboard cards: no white-on-white or invisible text
- [ ] District selector dropdown: dark background, visible active state
- [ ] *April 14 finding: `DistrictNavigation.css` used undefined variables (`--bg-primary-dark`, `--bg-secondary-dark`, `--text-primary-dark`). **April 16 fix (055f093):** Standardized to use correct CSS variable names. Verify the fix holds.*
- [ ] Story detail: headline, lede, body, share row all styled
- [ ] `.btn-outline` renders correctly (check for malformed CSS selector)
- [ ] *April 14 finding: Dark mode `.btn-outline` border was nearly invisible. **April 16 fix (055f093):** Dark mode borders now use dark-mode-aware variables. Verify.*
- [ ] Hero category links: use CSS variables, not hardcoded rgba
- [ ] *April 14 finding: `landing.css` had multiple hardcoded `rgba(255, 255, 255, 0.x)` values. Partially addressed but verify remaining hardcoded values.*
- [ ] Map preview city label: uses CSS variables
- [ ] Metric row hover state: uses CSS variables
- [ ] Explainer/benefits sections readable
- [ ] **All dark mode CSS uses `.dark` class selectors, NOT `@media (prefers-color-scheme: dark)`** **[CRITICAL REG]**
  - *April 15 fix (d7d1d1c):* 8 CSS files used `prefers-color-scheme` which follows OS setting and ignores app theme toggle. Users with OS dark mode who chose light in Settings saw stuck dark components (notably mobile nav). All converted to `.dark` class selectors.
- [ ] Dashboard/Map tab inactive state has visible baseline border in dark mode

### 5.2 Dark mode on mobile components
- [ ] Mobile signup bar background is not hardcoded white
- [ ] *April 14 finding: `MobileCitySignupBar.module.css` uses hardcoded `background: #ffffff`. Verify if dark mode override has been added.*
- [ ] Bottom nav is themed for dark mode
- [ ] Onboarding modal dialogs have dark backgrounds
- [ ] Feed card borders and separators visible in dark mode
- [ ] Modal header borders use dark-mode-aware variables (not `rgba(0, 0, 0, 0.1)`)

---

## Phase 6: Cross-Browser Rendering

Use the preview tools at different viewport widths to catch CSS issues that vary by engine. Where possible, verify computed styles match expectations.

### 6.1 CSS variable usage audit
- [ ] Grep for hardcoded color values in components that should use CSS variables
- [ ] Check for `rgba(255, 255, 255` in hero/category components (should be var())
- [ ] Check for hardcoded `#fff` or `#000` in dark-mode-sensitive components

### 6.2 Safe area and viewport-fit
- [ ] `viewport-fit=cover` in root layout meta tag
- [ ] `env(safe-area-inset-bottom)` used in bottom nav and city dashboard wrapper
- [ ] Bottom nav height is fixed 48px (check CSS)
- [ ] All `--bottom-nav-height` fallbacks consistent across codebase (grep for the variable name)

### 6.3 Scroll and overflow audit
- [ ] No elements with `overflow: visible` that could cause horizontal scroll on mobile
- [ ] *April 14 finding: `TopNavCitySearch.module.css:54` and `ChatView.module.css:774` both set `overflow: visible` on constrained containers. Test at 320px.*
- [ ] Sidebar open/close doesn't freeze body scroll (check scroll lock implementation)
- [ ] Scroll position handler uses `requestAnimationFrame` throttling

---

## Phase 7: Data Quality Guards

Verify the frontend correctly filters bad backend data.

### 7.1 Metric filtering logic
- [ ] Code filters out "-100% drops" (stale metrics with current value 0)
- [ ] Code filters out ">500% changes" in feed cards
- [ ] Code filters out ">= 90% drops" **(confirmed in commit 055f093)**
- [ ] Code filters out small values in metric comparisons **(added in commit 055f093)**
- [ ] *April 14 finding: There is no explicit filter for metric values < 5 in `MetricSummaryCard.tsx` or `FeedContainer.tsx`. Values of 0 are partially caught by the -100% drop filter, but values 1-4 pass through. **April 16: commit 055f093 added filtering for extreme drops and small values. Verify scope of "small values" filter.***
- [ ] Verify `getCategoryMeta()` lookup used for icons (not hardcoded)
- [ ] "Controller" recognized as alias for "Spending" category
- [ ] Metric source text priority: portal domain > date range > empty (never "safety data")

### 7.2 Feed bad-data filter
- [ ] Drops of >= 90% are suppressed
- [ ] Story cards with 0-value drops suppressed
- [ ] Extreme percentage changes (>500%) suppressed in feed cards

### 7.3 Headline truncation
- [ ] OTC/milestone headlines capped at 65 chars at word boundary
- [ ] General headlines capped at **70 chars** (`MAX_HEADLINE_LENGTH` in `headlineCleanup.ts`) **(reduced from previous value in commit 055f093)** **[REG]**

### 7.3a City completeness check

Every launched city must be fully wired: city dashboard, district dashboards for all districts, a mayor + one rep per district, dashboard metrics, metric detail pages, feed stories, and a working map tab. Run before every launch and after any city is flipped to `is_launched=true`.

```bash
cd ~/Documents/Coding/TransparentCITY
source venv/bin/activate

# Browser mode (recommended): waits for React hydration so the rendered
# DOM is what a real visitor sees. Slower (~6s/page) but accurate.
python scripts/qa/check_city_completeness.py --browser --site https://transparent.city

# DB+HTTP mode: cheap urllib fetch, but the urllib mode misses anything
# that hydrates client-side (district list, mayor button text, metric
# values). Use only when you trust the site to render those server-side.
python scripts/qa/check_city_completeness.py --site https://transparent.city

# HTTP-only fallback if no DATABASE_URL: --http-only (combinable with --browser)
```

**One-time setup for browser mode:**

```bash
pip install playwright
python -m playwright install chromium
```

Checks:

| rule | what it verifies |
|---|---|
| C1 | `/c/{slug}` returns 200, headline contains city name |
| C2 | city has at least 3 active feed stories in the last 14 days |
| C3 | `city_leaders` has a mayor row (district=0 or title ~ mayor) |
| C4 | city has at least one district with a representative |
| C5 | every district present in `city_leaders` has a leader (no orphans) |
| C6 | every `/c/{slug}/district/{id}` returns 200 with district-specific signal |
| C7 | city has at least 3 dashboard metrics (`show_on_dash` + `is_active`) |
| C8 | every dashboard metric has a working `/c/{slug}/metrics/{key}` page |
| C5b | rendered district list matches `city_leaders` count (DB mode) |
| C10 | recent-story freshness: at least one story published in the last 7 days (DB mode) |
| C11 | metric category breadth: dashboard renders at least 2 category headers |

Tightening notes (May 2026):
- C3 requires a real mayor *name*, not just the word "mayor" in HTML.
- C5 fails any district with an empty rep name (catches the Cincinnati gap: 2 districts shown, no names).
- C6 fails when a district page mirrors citywide values (cohort bug — e.g., Cincinnati district 1).
- C8 fails when a metric detail page returns 200 but renders no numeric value (e.g., Detroit's `detroit_building_permits_plan_reviews`).
- HTTP-only mode downgrades district checks to REVIEW since the district list often hydrates client-side; DB mode and `--browser` mode keep them as hard fails.
- `--browser` mode launches headless Chromium via Playwright, waits for hydration, and reads the rendered DOM. This is what catches the real Cincinnati / Denver / Seattle district gaps that urllib falsely calls "passing".
- C9 (map tab) was removed: the map is intentionally not surfaced on the unauthenticated dashboard.

Exits 1 if any city has any C1-C8 failure.

### 7.4 Charter Section 5.5 mechanical checks

These are mechanical pre-publish checks that enforce the Seymour Voice Charter Section 5.5. Each step references a script in `scripts/qa/` in the **platform repo** (`~/Documents/Coding/TransparentCITY`), not this Ui repo. Run from the platform repo with the platform venv active:

```bash
cd ~/Documents/Coding/TransparentCITY
source venv/bin/activate
```

Then in order; each script exits 1 on any violation, 0 if clean.

```bash
# Pull last 30 days of feed stories
python ~/Documents/Coding/TransparentCITY/scripts/qa/pull_feed_stories.py --days 30 --output /tmp/qa_stories.csv

# Charter 5.5.1: metric-verb lock
python ~/Documents/Coding/TransparentCITY/scripts/qa/check_metric_verb_lock.py /tmp/qa_stories.csv
# Expected: 0 violations. April 14 audit found 31. Charter rule was added afterward.

# Charter 5.5.2: headline-body number reconciliation
python ~/Documents/Coding/TransparentCITY/scripts/qa/check_number_reconciliation.py /tmp/qa_stories.csv
# Expected: 0 violations. April 14 audit found 10. The "Robotaxi 11 all of last year" pattern is the canonical regression.

# Charter 5.5.3: cross-story consistency on shared metrics
python ~/Documents/Coding/TransparentCITY/scripts/qa/check_cross_story_consistency.py /tmp/qa_stories.csv --window 14
# Expected: 0 contradictions on same metric/window. April 14 audit found 10+.
# Canonical regression: 3 SF drug crime stories on April 14 with conflicting Mission trends.
# Note: this check returns candidates for human review, not definitive violations.

# Charter 5.5.4: neighborhood polygon overlap
python ~/Documents/Coding/TransparentCITY/scripts/qa/check_polygon_overlap.py /tmp/qa_stories.csv
# Expected: no top-N claims where sum/citywide > 1.05.
# Canonical regression: "Drug Crime Records Are Up 32%. Three Neighborhoods Hold Half the Count." (banned by name in charter)

# Charter 5.5.7: single-source automated complaint streams
python ~/Documents/Coding/TransparentCITY/scripts/qa/check_single_source_complaints.py --window 30
# Expected: any flagged category is either reframed in the story or suppressed.
# Canonical regression: O'Hare 108,930 complaints from one airport portal address, May 3 Chicago.
# Note: this script queries the 311 datasets directly, not the CSV.

# Duplicate detection
python ~/Documents/Coding/TransparentCITY/scripts/qa/check_duplicates.py /tmp/qa_stories.csv --window-days 7
# Expected: 0 duplicates. April 14 audit found 25 groups (Bell St ran 7 times).

# Empty body detection
python ~/Documents/Coding/TransparentCITY/scripts/qa/check_empty_bodies.py /tmp/qa_stories.csv --min-words 50
# Expected: 0 empty or template-only bodies.
```

---

## Phase 8: Error States

### 8.1 404 pages
- [ ] `/c/not-a-real-city` returns proper 404 page (not blank, not error)
- [ ] *April 14 finding: Invalid city slugs render the "coming soon" state instead of calling `notFound()`. `/c/asdfghjkl` shows an emoji and "We're setting up the dashboard" instead of a 404. Search engines may index garbage URLs.*
- [ ] `/c/san-francisco/metrics/fake-metric` handles gracefully (confirmed working April 14)
- [ ] `/c/san-francisco/stories/fake-hash` handles gracefully (confirmed working April 14)

### 8.2 Empty states
- [ ] A city with no stories shows an empty state message, not a blank feed
- [ ] A district with no stories shows an empty state message
- [ ] Metric card handles failed city retry and fallback headline

### 8.3 Unlaunched city handling
- [ ] An unlaunched city in the sitemap shows a reasonable "coming soon" page
- [ ] *April 14 finding: When a city isn't in the API response, `src/app/c/[slug]/page.tsx` line 60 falls back to the raw slug for `name`, so og:title becomes `"memphis"` (lowercase, no state). Unlaunched cities should either be excluded from the sitemap or get acceptable fallback metadata.*

---

## Phase 9: Link Integrity from Social/Email Entry

These are the exact paths people will take tomorrow. Verify end-to-end.

### 9.1 Simulate "click from X post"
The X card preview is built from OG tags. Verify for each test city:
- [ ] `og:title` is set and contains city name (properly capitalized with state)
- [ ] `og:description` is set and meaningful (not empty or generic)
- [ ] `og:image` URL is set and returns 200 (image actually exists)
- [ ] `og:image` dimensions are close to 1200x630 (optimal for X cards)
- [ ] `twitter:card` is set to `summary_large_image`
- [ ] Canonical URL is set

### 9.2 Simulate "click from Substack"
Newsletter links likely point to:
- Story pages via `/s/[hash]` short URLs
- City dashboard pages via `/c/[slug]`
- Metric detail pages via `/c/[slug]/metrics/[key]`

For each link type:
- [ ] URL resolves (no 404, no redirect loops)
- [ ] Page renders fully (not blank, no JS errors)
- [ ] The page makes sense as a standalone landing (not dependent on prior context)

### 9.3 Simulate "click from newsletter email"
- [ ] Newsletter archive pages at `/c/[slug]/newsletter/[date]` load correctly
- [ ] Links within newsletter content resolve
- [ ] Any signup CTAs in the newsletter link to the correct city context

---

## Phase 10: Use It Like a Resident

Everything above checks whether the product *works*. This phase checks whether it *delivers*. The whole promise of Transparent.city is that a resident can show up, look around, and walk away knowing something real about their city that they didn't know before. If that doesn't happen, nothing else matters.

Run these as open-ended missions, not checkbox items. Write down what you actually found (or couldn't find). If a mission is frustrating, confusing, or leads to a dead end, that's a finding.

### 10.1 The dashboard test: "What's going on in this city?"

For each of the 3 test cities, land on the city dashboard (`/c/[slug]`) cold and try to answer:

- [ ] **Find two genuinely interesting facts about this city from the dashboard alone.** Write them down. Could you text these to a friend and have them say "huh, I didn't know that"? If you can't find two, that's a problem. If everything is generic or obvious ("crime exists"), that's a problem too.
- [ ] **Find one thing that's gotten better.** The dashboard should surface positive trends, not just alarming ones. Can you find a metric that's improving? Is it obvious, or did you have to dig?
- [ ] **Find one thing that would make you want to call your city council member.** This is the core use case. Is there a metric or story on the dashboard that makes you think "someone should do something about this"? If so, is the path from "I see the problem" to "I know who's responsible" clear?
- [ ] **Can you figure out who your elected officials are?** From the dashboard, can you identify the mayor and your district representative? Is the information prominent or buried?

Record: what you found, how long it took, and whether anything felt confusing or broken along the way.

### 10.2 The feed test: "Is this worth coming back to?"

Sign in (or use an existing test account) and go to `/home`. Spend 2 minutes browsing the feed as if you were a new user who just signed up.

- [ ] **Find two stories you'd actually want to read.** Write down the headlines. Are they compelling, or do they read like database field names? Would a normal person click on them?
- [ ] **Find one story that taught you something you couldn't easily Google.** This is the value prop. Transparent.city should surface insights that are hard to get elsewhere: neighborhood-level trends, cross-dataset connections, anomalies. If every story is just "crime went up" or "311 calls happened," that's not enough.
- [ ] **Find one story that connects to your life as a resident.** Not "interesting in the abstract" but "I live here and this affects me." If the feed feels like a data dump rather than a neighborhood briefing, note that.
- [ ] **Do the story cards make you want to click through?** Check 3 story cards: is the headline clear, is there enough preview to know what you'll get, does the card feel worth tapping?
- [ ] **After 2 minutes, would you come back tomorrow?** Honest gut check. If not, what's missing?

### 10.3 The map test: "Show me where"

Open the map view for San Francisco (or whichever flagship city has the most data).

- [ ] **Find the part of town with the most violent crime.** Can you identify it from the map? Is the visualization clear enough that you could tell a friend "avoid this area" or "this neighborhood has gotten safer"? How many clicks did it take?
- [ ] **Find a neighborhood that's surprisingly safe (or surprisingly dangerous).** The map should reveal patterns that challenge assumptions. Can you spot one?
- [ ] **Find a geographic pattern in a non-crime dataset.** Try 311 calls, building permits, code violations, or whatever else is available on the map. Can you see where complaints cluster? Where construction is booming? The map shouldn't just be a crime map.
- [ ] **Zoom into a specific neighborhood and see what's happening there.** Pick a neighborhood you know (or pretend you live there). Does the map give you useful, specific information about that area? Or is the data too sparse/coarse to be meaningful at the neighborhood level?
- [ ] **Try to share what you found.** Can you link someone to the map view you're looking at? Does the URL capture your current state (zoom level, filters, selected data layer)?

### 10.4 The story deep-dive: "Does the journalism hold up?"

Pick 3 stories from different cities and read them fully (not just the card, the full story page).

- [ ] **Does each story cite its source?** Every claim should link back to the original public dataset. Check: can you click through and verify the number yourself?
- [ ] **Is the context useful?** A good Transparent.city story doesn't just say "X went up 20%." It should tell you: compared to what, over what time period, and whether that's unusual. Do these stories do that?
- [ ] **Are the numbers believable?** Scan for anything that looks wrong: a city of 900,000 people with 3 total crimes, a 9,000% increase, a metric that's clearly stale or duplicated. If you spot bad data that made it into a story, that's P0.
- [ ] **Do the charts add value?** If a story has a chart, does it help you understand the trend, or is it just decoration? Is the chart readable on mobile?
- [ ] **Would you share this story?** If you saw this on social media, would you click it? If you read it, would you repost it? The stories are the primary growth vector. They need to be genuinely share-worthy.

### 10.5 The "explain it to me" test

- [ ] **Go to the methodology page** (`/c/[slug]/methodology`) for a test city. Does it exist? Is it understandable to a non-technical reader? Can a skeptic figure out where the data comes from and why they should trust it?
- [ ] **Pick a metric you don't understand.** Click into its detail page. After reading it, do you understand what it measures and why it matters? If the description is jargon or missing, note it.
- [ ] **Try to figure out what "Transparent.city" actually is.** If you landed on a city page cold from a Google search, could you figure out what this site is within 10 seconds? Is the value proposition clear without scrolling?

### 10.6 The comparison test

- [ ] **Compare two cities.** Open San Francisco and Austin in separate tabs. Can you compare their crime rates? Their 311 response times? Is it easy to tell which city is doing better on a given metric, or do you have to do mental math across tabs?
- [ ] **Compare two districts within one city.** From the district selector, pick two districts. Can you compare them meaningfully? Is there a way to see them side by side, or do you have to remember numbers and flip back and forth?

> **Why this phase matters:** Every other phase tests whether the product is *functional*. This one tests whether it's *useful*. A product can pass every technical check and still fail its users if the data is confusing, the stories are boring, or the maps don't reveal anything interesting. If a tester can't complete these missions, real users won't either.

### 10.7 Charter Section 8.1 quality gate (resident sample)

- [ ] Pull 5 stories per city from the public feed view (unauthenticated)
- [ ] For each story, run the Charter Section 8.1 quality gate manually:
  - Metric-verb lock holds
  - Every headline number appears in body
  - No top-N claim where sum exceeds citywide
  - Time comparisons are like-for-like
  - No causal framing without a cited source
  - Single-source streams are reframed
  - Small-sample percentages converted to absolute counts
  - Geographic labels match data units
- [ ] Flag any story where the gate fails. The gate is also in `/docs/SEYMOUR_VOICE_CHARTER.md` Section 8.1.

---

## Phase 11: Deeper Technical Checks

These are areas the first QA pass didn't cover deeply. Worth a second look.

### 11.1 API response times and server-side rendering
- [ ] Time the server-side fetch for `listPublicCitiesForSitemap()` on the city page. If the API is slow, the entire page render blocks.
- [ ] Check for N+1 fetch patterns in server components (e.g., does the city page fetch leaders separately for every district?)
- [ ] Verify `NEXT_PUBLIC_API_BASE_URL` is correctly set in the Vercel deployment environment (server-side fetches use this directly, not the rewrite proxy)

### 11.2 Accessibility beyond aria attributes
- [ ] Run axe-core or Lighthouse accessibility audit on the city dashboard page
- [ ] Verify skip-to-content link exists and `id="main-content"` on `<main>` across all pages **(added in commit 07d1d05)**
- [ ] Verify focus management after modal close (focus should return to trigger element)
- [ ] Verify focus traps in AuthModal and WelcomeModal (`useFocusTrap` hook added in commit 07d1d05)
- [ ] Test the onboarding flow with keyboard only (tab through WelcomeModal steps)
- [ ] Verify color contrast ratios in metric cards and feed cards meet WCAG AA
- [ ] Verify `--text-secondary` is `#374151` (darkened from `#6b7280` for readability, commit dfcee23)
- [ ] Verify ContextMenu admin items are `<button>` with ARIA menu roles (not `<div>`) **(fixed in commit 07d1d05)**
- [ ] Verify decorative SVGs have `aria-hidden="true"` (ContextMenu, Header logo, HeroDistrictSelector, CardHeader)
- [ ] Verify global `focus-visible` override prevents component-level `outline: none` from suppressing keyboard focus rings
- [ ] Verify FollowButton small variant is 32px (bumped from 24px in commit 07d1d05)
- [ ] Verify `role="dialog"` on WelcomeModal
- [ ] Verify metrics dashboard has table ARIA roles
- [ ] Verify feed card articles do not have `role="link"` (removed in commit 07d1d05)

### 11.3 JS-disabled graceful degradation
- [ ] Load city pages with JavaScript disabled. Do they show meaningful content from SSR?
- [ ] Are critical CTAs (signup, follow) visible without JS?

### 11.4 Analytics and tracking
- [ ] Verify PostHog initialization doesn't block page render
- [ ] Check that GA4 measurement ID is set in production environment
- [ ] Verify Vercel Insights script loads
- [ ] Confirm key user events are tracked (signup start, onboarding complete, follow city)

### 11.5 Map view deep dive
- [ ] Load the map view on a city with many data points. Does it perform acceptably?
- [ ] Test map marker clustering at different zoom levels
- [ ] Verify map attribution text is visible and properly positioned
- [ ] Test map on mobile: pinch-to-zoom doesn't conflict with page scroll

### 11.6 CRM and press tools (if relevant for launch)
- [ ] Verify CRM sidebar loads for admin users
- [ ] Test press release archetype selection
- [ ] Verify SendGrid integration (email compose and send flow)

### 11.7 Vercel configuration
- [ ] Verify `vercel.json` rewrites are working (API proxy, domain redirects)
- [ ] Check if ISR/static generation is configured for city pages (affects TTFB)
- [ ] Verify image optimization config in `next.config.ts` covers all expected image domains

### 11.8 Content quality spot checks
- [ ] Read 5 random stories across different cities. Are headlines grammatically correct?
- [ ] Check that story body text doesn't contain raw markdown or HTML entities
- [ ] Verify metric descriptions are human-readable (not internal field names)
- [ ] Check that "traction" stories (positive/good-news) render with appropriate framing (not alarming colors/icons)

### 11.9 Story URL slug audit
- [ ] Confirm that the CSV `link` column captures the canonical story URL, not the outbound CTA destination.
- [ ] *May 2026 audit gap:* many flagged stories required CMS lookup because the CSV link pointed to the external citation. Fix: ensure feed export includes a separate `story_url` column with the `/s/{slug}` canonical URL.

### 11.10 Charter compliance smoke test after any prompt edit
- [ ] Generate 5 stories per affected story type using the updated prompt (in `src/transparentcity/agents/seymour/prompts/modular_prompts.py`, or wherever the affected story type's prompt lives).
- [ ] Run the full Phase 7.4 data-quality checks on the output.
- [ ] If failure rate exceeds 0%, the prompt needs iteration before it ships.

---

## Open findings (May 2026)

> Full audit results from the 2026-05-07 deep pass live in [`AUDIT_2026-05-07.md`](AUDIT_2026-05-07.md) (raw findings, ~165 items) and [`QA_SYNTHESIS_2026-05-07.md`](QA_SYNTHESIS_2026-05-07.md) (synthesis, root-cause patterns, prevention plan). The table below tracks the verified P0s only; consult the synthesis doc for P1/P2 lists and the four-week execution plan.

| Finding | Status | Reference |
|---|---|---|
| Map title PII leak on /c/{city} pages | Open, eng ticket needed | Phase 0.4a |
| Polygon overlap at data layer | Open, eng ticket needed | Phase 7.4 (`check_polygon_overlap.py`) |
| Publish pipeline dedup | Open, eng ticket needed | Phase 7.4 (`check_duplicates.py`) |
| `feed_producer` prompt charter compliance | Verify after deploy | Phase 11.10 |
| **Security P0** `/api/generate-emails` unauthenticated, drives Anthropic spend, reads `prospects` rows by guessable UUID | Open | `src/app/api/generate-emails/route.ts:328` — Phase 12.1 |
| **Security P0** `/api/analyze-anomaly` unauthenticated, Anthropic-bill DoS | Open | `src/app/api/analyze-anomaly/route.ts:67-142` — Phase 12.1 |
| **Security P0** `/api/research-media` SSRF (absolute `permalinkPath` overrides URL base) | Open | `src/app/api/research-media/route.ts:78` — Phase 12.2 |
| **Security P0** `next.config.ts` `images.remotePatterns: **` — open image proxy / probe vector | Open | `next.config.ts:48-65` — Phase 12.3 |
| **Security P0** Public chat route renders LLM output via `dangerouslySetInnerHTML` after only `\n -> <br/>` (XSS) | Open | `src/app/chat/[hash]/page.tsx:135` — Phase 12.4 |
| **Security P1** `welcome-email` and `city-suggestion` Origin allowlist matches any `*.vercel.app` (SendGrid abuse) | Open | `src/app/api/welcome-email/route.ts:198`, `src/app/api/city-suggestion/route.ts:48` |
| **Security P1** No CSP / X-Frame-Options / HSTS / Referrer-Policy headers anywhere | Open | Add `headers()` to `next.config.ts` |
| **Bug P0** `FeedAdmin` bulk delete confirms with filtered count (e.g. 12) but API deletes every story for the city (~200) | Open | `src/components/FeedAdmin.tsx:259-278` — irreversible data loss |
| **Bug P0** `providers.tsx` `clearStaleAuth0State` runs *after* `Auth0Provider` initialized off stale localStorage tokens; users hitting auth callback with stale state see redirect loops | Open | `src/app/providers.tsx:106-110` |
| **Bug P1** `FeedContainer` and `home/page` read `localStorage` in `useState` initializers → SSR/CSR hydration mismatch | Open | `src/components/feed/FeedContainer.tsx:681, 1158`; `src/app/home/page.tsx:182-188` |
| **Bug P1** `PageFeedback` 429 path persists `markSubmitted()` and shows "Thanks!" — locked out for 24h, feedback never recorded | Open | `src/components/PageFeedback.tsx:68-70` |
| **Bug P1** `FeedAdmin` `Last 24h` filter parses `YYYY-MM-DD` as UTC; Pacific users miss today's stories near the cutoff | Open | `src/components/FeedAdmin.tsx:62` |
| **Bug P1** `AuthModal` effect deps include `onClose` (inline arrow); repeated `router.push("/home")` after auth | Open | `src/components/AuthModal.tsx:31-36` |
| **Tests P0** 20 / 1719 unit tests failing on `main`, including all 10 of WelcomeModal "Preferences step" (the resident onboarding flow) | Open | Run `npm test`. CI does not gate on test exit code |
| **Lint P0** 989 ESLint errors and 491 warnings on `main`. 92 `react-hooks/exhaustive-deps`, 35 `react-hooks/set-state-in-effect`, 2 `react-hooks/rules-of-hooks` (the latter in `MediaGallery.tsx`, `MultiMetricCard.tsx`, `PhotoCard.tsx`) | Open | Run `npx eslint .`. CI does not gate |
| **Mobile P0** 6+ `<input>` elements at `font-size: 13px` cause iOS auto-zoom on focus | Open | `src/components/PageFeedback.tsx:271, 284, 434` and others |
| **Mobile P0** 22 instances of `100vh` clip on iOS address-bar collapse (modals, sidebars, full-screen panels) | Open | See AUDIT_2026-05-07.md §3 |
| **Mobile P0** Most modals (AuthModal, WelcomeModal, RenameDialog, EditHomeLocationModal) lack iOS-correct body scroll lock; rubber-band can fire overlay close | Open | Pattern exists in `MobileMoreMenu.tsx:65-76` and `NewsletterAdmin.tsx:1326`; not applied elsewhere |
| **A11y P0** Hand-rolled modals (`RenameDialog`, `UserMetricOrderDialog`, `MobileMoreMenu`, `EditHomeLocationModal`) lack `role="dialog"`, `aria-modal`, focus trap, focus-return-to-trigger | Open | Port to Radix Dialog |
| **A11y P0** No skip-to-content link in root layout; `loading.tsx` files have no `role="status"` / `aria-busy` (AT users hear silence) | Open | `src/app/layout.tsx`, every `loading.tsx` |

---

## Phase 12: Security checks (added 2026-05-07)

Added after the deep audit found 5 P0 security issues that the runbook had not previously covered. Run these on every deploy and on any change to `src/app/api/**` or `next.config.ts`.

### 12.1 Auth posture on every API route
- [ ] For each file under `src/app/api/**/route.ts`, confirm one of:
  - explicit `requireAdmin` / `requireUser` guard, OR
  - explicit "PUBLIC" comment with rate limit and origin check
- [ ] Specifically re-verify: `/api/generate-emails`, `/api/analyze-anomaly`, `/api/research-media`, `/api/welcome-email`, `/api/city-suggestion`. As of 2026-05-07 the first two are unauthenticated and pump arbitrary input into the Anthropic API.
- [ ] Try `curl -X POST https://transparent.city/api/generate-emails -H 'Content-Type: application/json' -d '{}'`. Expected: 401. If it returns 200 or processes the request, halt.

### 12.2 SSRF probe on user-URL fetchers
- [ ] `curl 'https://transparent.city/api/research-media?path=https%3A%2F%2Fexample.com%2F'`. Expected: 400 (rejected as non-relative). If it returns content from `example.com`, the SSRF is live.
- [ ] Confirm any new server-side fetch that accepts a URL goes through a hostname-allowlist helper.

### 12.3 Image proxy hostname allowlist
- [ ] `grep -A 20 'remotePatterns' next.config.ts`. Confirm there's no `hostname: "**"` entry. Specific domains only.
- [ ] `curl -sI 'https://transparent.city/_next/image?url=http%3A%2F%2Fexample.com%2Ffoo.png&w=64&q=75'`. Expected: 400. If 200, the image proxy is open.

### 12.4 dangerouslySetInnerHTML sinks
- [ ] `git grep -n dangerouslySetInnerHTML src/`. For each sink, confirm one of:
  - source is hardcoded in this repo, OR
  - content is sanitized via `sanitizeHtml` (see prevention plan in `QA_SYNTHESIS_2026-05-07.md` §3.5).
- [ ] Specifically verify: `src/app/chat/[hash]/page.tsx:135` (currently does `\n -> <br/>` only on LLM output, public route).
- [ ] Test: have a chat session output literal HTML/script tags, then visit the share URL. Expected: text rendered as text. If a script executes, halt.

### 12.5 Security headers
- [ ] `curl -sI https://transparent.city | grep -iE 'content-security-policy|x-frame-options|strict-transport-security|referrer-policy'`. Confirm all four are present.
- [ ] If any are missing, add them via `headers()` in `next.config.ts`.

---

## Phase 13: Automated check gating (added 2026-05-07)

Added because the 2026-05-07 audit found 989 lint errors and 20 test failures sitting on `main`, indicating CI does not gate. The runbook itself can't fix CI — but it can verify on each pre-deploy pass that the gating is in place.

### 13.1 Tests pass
- [ ] `npm test`. Expected: zero failures. As of 2026-05-07 baseline: 20 failing tests across 5 files.
- [ ] If failing, halt the deploy until either fixed or the test is deleted with reviewer signoff.

### 13.2 Type check passes
- [ ] `npm run type-check`. Expected: zero errors. As of 2026-05-07: clean.

### 13.3 Lint count does not increase
- [ ] `npx eslint . 2>&1 | tail -3`. Note the error/warning counts.
- [ ] Compare against the previous deploy's count. If higher on any tracked rule (`react-hooks/exhaustive-deps`, `react-hooks/set-state-in-effect`, `react-hooks/rules-of-hooks`), halt the deploy.
- [ ] 2026-05-07 baseline: 989 errors, 491 warnings. Count should monotonically decrease.

### 13.4 CI gate exists
- [ ] `cat .github/workflows/*.yml | grep -E 'type-check|test|lint'`. Confirm the GitHub Action runs all three on PRs and fails on non-zero exit.
- [ ] If no CI workflow exists, the prevention plan in `QA_SYNTHESIS_2026-05-07.md` §3.1 is unimplemented; flag as P0 process gap.

---

## Execution Notes

### How to run this

This runbook is designed for multiple passes:

1. **Pass 1 -- Infrastructure (Phase 0):** Quick curl/fetch checks. 5 minutes.
2. **Pass 2 -- Entry points (Phase 1):** Use preview tools at multiple viewports. 30 minutes per city.
3. **Pass 3 -- Onboarding code review (Phase 2):** Read the actual source files, verify logic. 30 minutes.
4. **Pass 4 -- Mobile layout (Phase 4):** Preview tools at 320/360/375/414px. 20 minutes.
5. **Pass 5 -- Dark mode (Phase 5):** Preview tools with color scheme override. 15 minutes.
6. **Pass 6 -- Data quality (Phase 7):** Code review + spot-check API responses. 15 minutes.
7. **Pass 7 -- Error states and links (Phase 8-9):** Curl checks and preview. 15 minutes.
8. **Pass 8 -- Use it like a resident (Phase 10):** The most important pass. Actually use the product. 45 minutes.
9. **Pass 9 -- Deeper technical checks (Phase 11):** API perf, accessibility, map, analytics. 30 minutes.

### Cities to test
Use whatever cities are returned from the `is_launched` API call. Prioritize:
- The flagship city (San Francisco)
- A mid-tier city (Austin has good data coverage)
- The launched city with the least data (most likely to expose empty-state bugs). **Do not use unlaunched cities** (like Memphis as of April 14) for feature testing; use them only for testing "coming soon" and empty states.

### What to report
For each failing check:
- The exact URL and viewport size
- What was expected vs what actually happened
- The file and line number responsible (if identifiable)
- Severity: P0 (blocks launch), P1 (embarrassing), P2 (polish), P3 (minor)

### Known issues tracker
When re-running this runbook, check whether previously flagged issues have been fixed. Items marked with *April 14 finding* throughout this document should be verified on each subsequent run and the annotations removed once resolved.
