# Smoke Tests

Fast, repeatable checks for the four areas where a regression silently
breaks user experience: **onboarding flows, analytics, map controls,
mobile affordances**. Each test is binary (pass/fail) and takes under
two minutes.

This is meant to run before every deploy and after every change to the
relevant surface. It is separate from the deep `QA_CLAUDE_RUNBOOK.md`
and from `STORY_CONTENT_AUDIT.md` — those are weekly. These are
per-deploy.

## How to run

For each section, start from a clean browser session (incognito or
cleared cookies). On each step, mark ✅ or ❌. If anything fails, halt
the deploy.

---

## 1. Onboarding flows

### 1.1 City-only signup, resident, desktop

- [ ] Visit `https://transparent.city/c/san-francisco` while logged out.
- [ ] Click any "Sign up" CTA. Verify the URL gains `screen_hint=signup`.
- [ ] Auth0 redirects back to `/home?signup=resident`.
- [ ] WelcomeModal opens. Modal has no close button (cannot dismiss).
- [ ] Type `San Francisco` in the location field. Pick the city-level
      suggestion (not an address).
- [ ] Click through the preferences step. Newsletter opt-in is checked.
- [ ] Click "Let's go". Modal closes; feed renders within 3 seconds.
- [ ] Purple banner appears: "Looking for stories in San Francisco…"
- [ ] Banner turns green ("Your San Francisco feed is ready!") within
      30 seconds.
- [ ] Banner auto-dismisses after 2 seconds (not 5 — the timer was
      reduced in commit `acb7533`).
- [ ] Welcome email arrives within 60 seconds. Check the verified inbox.

### 1.2 Address-level signup, resident, desktop

- [ ] Same as 1.1 but type a full street address (e.g., `742 Evergreen
      Terrace, San Francisco`).
- [ ] Address suggestions dropdown appears and is clickable.
- [ ] Pick the address suggestion. `hasPreciseLocation` is set true.
- [ ] After "Let's go", banner cycles through the place-level messages:
      `Pulling public data near your address...` → `Analyzing trends...`
      → `Searching for anomalies...` → `Building stories...` →
      `Finishing up your neighborhood feed...`.
- [ ] Each message is visible for at least 5 seconds (script doesn't
      blow through them).
- [ ] If a representative is found, the "Found your representative:
      {name}" message displays for 4 seconds.
- [ ] Final banner: "Your neighborhood feed is ready!"
- [ ] Feed renders with stories that reference the neighborhood (not
      just the citywide context).

### 1.3 Government signup, desktop

- [ ] On the landing page, click the government-signup CTA (or visit
      `/?signup=public-servant`).
- [ ] GovernmentSignupMessage interstitial appears, telling the user to
      sign up with their government email.
- [ ] Press Escape — the interstitial dismisses.
- [ ] Re-trigger, click "Continue" — Auth0 opens.
- [ ] After Auth0, user lands on `/home?signup=public-servant`.
- [ ] **Standard** WelcomeModal (not the old multi-step
      GovernmentOnboardingModal) opens. Verify by URL params: no
      `?email_verification=` param.

### 1.4 Resume mid-flow

- [ ] During address-level signup, after the banner appears, navigate
      away (open a new tab to /). Then return to /home.
- [ ] Banner should resume, not be stuck. The `backgroundWorkActiveRef`
      reset (commit `5b5bdec`) handles this.

### 1.5 Failure paths

- [ ] In the WelcomeModal location field, type a deliberately bad
      address (`asdfghjkl`). Submit.
- [ ] Specific error message ("We couldn't find that address") not a
      generic error.
- [ ] Network: open dev tools, throttle to "Slow 3G". Repeat 1.1.
      Banner messages remain readable; modal does not deadlock.

### 1.6 Onboarding on iOS Safari and Android Chrome

- [ ] Real iPhone, Safari: 1.1 + 1.2 work. Address suggestions tappable
      without the keyboard hiding them. Input does not auto-zoom.
- [ ] Real Android, Chrome: 1.1 + 1.2 work. Back gesture from inside
      the modal does not exit the page (modal traps focus).
- [ ] Welcome email link opens correctly on the phone.

---

## 2. Analytics

### 2.1 PostHog firing

- [ ] Open dev tools → Network. Filter to `posthog`.
- [ ] Visit landing page. Confirm a `/e/?_=` POST fires with `$pageview`.
- [ ] Click any story card. Confirm a `story_card_clicked` event fires
      (or whatever the canonical name is — check `analytics.ts`).
- [ ] Complete a city-only signup. Confirm `signup_started`,
      `onboarding_step_completed`, `signup_completed` events fire in
      order with city in properties.
- [ ] Click Follow on a city. Confirm `city_followed` event with
      `city_id` and `city_slug` in properties.

### 2.2 Vercel Analytics + Insights

- [ ] Network: `/_vercel/insights/event` POSTs are firing on navigation.
- [ ] On a slow page, check that an `LCP` measurement is reported.

### 2.3 GA4 (if configured)

- [ ] Network: requests to `google-analytics.com/g/collect` fire on
      pageview.
- [ ] Measurement ID matches the production env var (not a dev one).

### 2.4 No analytics on opt-out

- [ ] Open in a browser with Do-Not-Track enabled (or block the
      `posthog-js` request).
- [ ] Site still loads and functions. No console errors.

### 2.5 Server logs

- [ ] After completing a signup flow, check Vercel function logs for
      `signup_completed` server-side log line. Confirm the log carries
      a request ID for correlation.

---

## 3. Map controls

### 3.1 Desktop, San Francisco map

- [ ] Visit `/c/san-francisco`. Scroll to the map.
- [ ] Map tiles load within 4 seconds.
- [ ] Map shows clusters with count badges, not individual points at
      city zoom.
- [ ] Pan and zoom: clusters split into individual points as you zoom
      in.
- [ ] Click a cluster: map zooms in on the cluster centroid.
- [ ] Click an individual point: bottom panel opens with title,
      description, date, type, disposition. Internal fields (lat, lon,
      `_opacity`, etc.) are NOT shown.
- [ ] Close button on the panel works. Map remains functional.
- [ ] If a layer toggle exists, switching between data layers
      (incidents, 311 calls, etc.) does not require a page reload.
- [ ] Map attribution ("© Mapbox © OpenStreetMap") is visible in a
      bottom corner.
- [ ] A legend or color key is visible somewhere on or above the map.

### 3.2 Anomaly map (if launched)

- [ ] Visit `/a/{some-anomaly-id}`. Map renders.
- [ ] Hovering a point shows a tooltip with the metric value.
- [ ] Time slider (if present) advances the map state.

### 3.3 Mobile, San Francisco map

- [ ] Real iPhone, real Android: 3.1 minus the cluster-click step (which
      may behave differently on touch).
- [ ] Pinch-to-zoom does not conflict with page scroll.
- [ ] Tap a point: panel opens above the bottom nav (does not get
      clipped).
- [ ] Close button on the panel is at least 44x44px and tappable.
- [ ] Pinch sometimes triggers Safari's page zoom — confirm map has
      `touch-action: none` or equivalent so this does not happen.

### 3.4 Map dot count sanity

- [ ] On the SF map at default zoom, manually count: are there fewer
      than 1000 visible markers? If 1000+, the map is unreadable
      (Charter audit calls this out). Acceptable only if clustering
      is on.

### 3.5 Map shareability

- [ ] Pan and zoom to a specific neighborhood. Copy the URL.
- [ ] Open the URL in a new tab. Map should restore the same view
      (zoom, center, layer). If the URL doesn't capture state, that's
      a P2.

---

## 4. Mobile affordances

### 4.1 Viewport and safe areas

- [ ] iPhone with notch: page respects the safe area at top and bottom.
      Bottom nav is above the home indicator.
- [ ] Android with gesture nav: bottom nav clears the gesture indicator.
- [ ] No horizontal scroll on any page at 320px, 360px, 375px, 414px.

### 4.2 Tap targets

- [ ] All interactive elements are at least 44x44px (iOS) / 48x48px
      (Android) according to dev tools accessibility audit.
- [ ] Story card overflow menus are at least 32px on the small variant
      (commit `07d1d05` raised this from 24).

### 4.3 Tap delay and feedback

- [ ] Buttons respond immediately to tap (no 300ms delay). Verify by
      tapping a button and watching the visual state change instantly.
- [ ] Tap highlight is transparent (no blue/gray flash on tap).
- [ ] Tap-action elements have a clear hover or active state.

### 4.4 Keyboard interaction

- [ ] Type in any input on the WelcomeModal. iOS does not auto-zoom
      (font-size on inputs is at least 16px).
- [ ] When the keyboard is open, the input being typed remains visible
      (the modal scrolls).
- [ ] Tapping outside an input dismisses the keyboard.

### 4.5 Scroll behavior

- [ ] Pull-to-refresh on the feed page does not conflict with browser
      pull-to-refresh.
- [ ] Modal scroll does not chain to body scroll
      (`overscroll-behavior: contain`).
- [ ] Sidebar open on mobile does not freeze body scroll. (Was a
      regression — commit history shows fix.)

### 4.6 Dark mode app vs OS

- [ ] OS dark mode ON, app set to Light: site renders in light mode
      (does not follow OS).
- [ ] OS dark mode OFF, app set to Dark: site renders in dark mode.
- [ ] All `.dark` selectors fire, no `prefers-color-scheme` selector
      sneaks in (regression check from commit `d7d1d1c`).

### 4.7 Network resilience

- [ ] On a flaky connection (dev tools throttle), images use
      `loading="lazy"` and don't block the page paint.
- [ ] If an image fails to load, the layout doesn't shift more than
      0.1 CLS.

---

## What to do when a smoke test fails

1. Halt the deploy if you were about to push.
2. Reproduce on a clean browser (no cache, no extensions).
3. If reproduces, revert the suspected commit or hold the deploy.
4. File a P0 if the broken flow is signup, payment, or analytics
   collection. P1 otherwise.

## Future work

- Automate sections 3 and 4 with Playwright. The tests are already
  written as a checklist; they should mostly translate.
- Add a screenshot diff for the SF map at default zoom — if the cluster
  count or layout changes by more than ~10%, flag for review.
- Add a Lighthouse run as part of section 4.
