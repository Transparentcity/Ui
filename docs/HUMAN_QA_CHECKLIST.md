# Human QA Checklist

What the automated sweep (`scripts/qa/run_qa.sh`) cannot judge: real browsers, real fingers, real comprehension, and the awkward states where a user's location data is partial or missing. This is the script for a human tester to run weekly against prod (`https://transparent.city`).

Pair every failure with a screenshot or screen recording and a one-line repro. File in the QA issue tracker with the section letter from this doc (e.g. "B3 - Safari iOS signup loop").

Use these accounts:
- Citizen test inbox: `awerbach+QA@gmail.com` (passwordless magic-link)
- Burner inbox for one-off signups: any `+tag` on the same Gmail
- Government test inbox: ask Adam

Reset between runs by clearing cookies for `transparent.city` and `*.auth0.com`, or use a fresh private window per case.

---

## A. Signup flow, by browser

For each browser, run cases A1 through A6 from a private window. Note any case where the visible result differs from Chrome on macOS (the baseline). Differences are the bug, not the absolute behavior.

Browsers to cover:
1. Chrome, macOS, current stable
2. Safari, macOS, current stable
3. Firefox, macOS, current stable
4. Edge, Windows, current stable
5. Safari, iOS, current iOS on a real device (simulator is not enough, the password manager and email handoff behave differently)
6. Chrome, Android, current stable on a real device
7. Brave, desktop, shields up (catches anything that breaks on aggressive ad/tracker blocking)
8. Chrome, macOS, with a 1Password or LastPass extension actively autofilling

**A1 Citizen, magic link, happy path.** From the landing page, click Sign up, choose Sign up as citizen. Enter the test email. Switch to the inbox, click the link, return to the tab that opened. Expect to land on `/home?signup=resident` with the welcome modal open.

**A2 Citizen, magic link, opened in a different browser.** Same as A1, but click the email link from a different browser than the one you started in. This is common in the wild (started on phone, link opens in the default mail browser). Expect the flow to either complete or show a clear "open this in your original tab" message. A blank `/home` with no modal is a bug.

**A3 Citizen, password autofill.** Repeat A1 with a password manager extension active. Expect the email field to be filled and the form to submit cleanly. The bug to watch for: the manager autofills, but the form's hidden state doesn't update and the submit button stays disabled.

**A4 Citizen, back button mid-flow.** Click Sign up, on the Auth0 page click the browser back button. You should land back on `/`, sidebar intact, no half-modal stuck open. Then click Sign up again. The dropdown should work on the second try.

**A5 Citizen, double-click the magic link.** Click the magic link twice in quick succession (some mail clients prefetch the link, then the human clicks it). Expect one successful session, not two errors or a "link expired" screen.

**A6 Government, interstitial.** From `/?signup=public-servant` (or click "I'm city staff"), expect the government interstitial with the email-domain form. Try with a personal gmail (should be rejected with a friendly message), then with a `.gov` address (should accept and continue).

### A. Specific browser edge cases to actively try to break

- **Safari iOS, link from Mail.app.** When the magic link opens in SFSafariViewController instead of full Safari, the session may not persist back to the original tab. Mark as a bug if the user is dumped to landing instead of `/home`.
- **In-app browsers.** Open the magic link from Gmail iOS, then from the Facebook in-app browser, then from LinkedIn's. Each one has a different cookie jar. Document which of these complete vs. dead-end at `/home` with no session.
- **Strict privacy / shields.** Brave with shields up, Firefox in Strict ETP mode, Safari with "Hide IP from trackers" on. Auth0 sometimes 4xx's the callback. If the callback fails, what does the user see? Spinner forever is a P0.
- **Cookies disabled entirely.** Block all third-party cookies. Run A1. Expect a clear error message, not a silent failure.
- **Slow 3G throttle.** In Chrome devtools, throttle to Slow 3G, run A1. The "Looking for stories" banner has a 30s contract. If the feed is still spinning at 60s, the failure state should say something useful.
- **Time-skewed device.** Set system clock 10 minutes back. Magic link signatures sometimes choke on clock skew. Expect a clear error, not a generic 500.
- **2-tab race.** Open two tabs to `/`, click Sign up in both, complete the flow in one. The other tab should not break the session when you click around in it.
- **Resize during signup.** Open the welcome modal at desktop width, drag the window down to ~400px, then submit. Modal should reflow, not clip the submit button below the fold.

---

## B. Mobile

Run on a real device for each, not a simulator. The keyboard, the safe areas, and the touch latency all differ.

Devices:
- iPhone 13 or newer, Safari
- iPhone SE 2nd gen or any small-screen phone, Safari (catches 320-375px regressions)
- Android, Chrome, any modern Pixel or Samsung

**B1 Tap targets.** On every primary CTA in the signup flow and the city dashboard, the button should fit a 44x44pt minimum. Anything smaller than a thumb pad gets flagged.

**B2 Keyboard occlusion.** In the welcome modal location field, tap to focus. The submit button should not be hidden behind the soft keyboard. If it is, the page needs to scroll the focused field into view.

**B3 Autocorrect on the city field.** Type "san francisco" with autocorrect on. Does autocorrect mangle it ("San Francisco's"? "Sanfrancisco"?). The matcher should still find the city, or there should be a visible dropdown to pick from.

**B4 Pull-to-refresh.** On `/c/{slug}`, pull down to refresh. Doesn't crash, content reloads, scroll position resets cleanly.

**B5 Landscape.** Rotate to landscape mid-flow. Welcome modal, city dashboard, story detail. None should clip or have unreachable buttons.

**B6 Safe area / notch.** On a notched device, check that the top navigation does not collide with the status bar. Bottom CTAs should respect home-indicator safe area.

**B7 Share sheet.** Long-press a story link, share via Messages. The preview should render the OG image. Open the shared link, it should deep-link to the story, not bounce to `/`.

**B8 Map interactions.** District map on `/c/{slug}/district/{id}`: pinch to zoom, two-finger pan, single-tap to select. None of these should accidentally trigger the page's normal scroll.

**B9 Dark mode.** Toggle the system into dark mode mid-session. The app should follow without a hard reload, and no text should become invisible on its background.

**B10 Reduced motion.** iOS Settings, Accessibility, Reduce Motion ON. Run signup. Banner transitions should still complete, just without animation.

---

## C. Understanding (does a real person know what just happened)

This is the section that can only be done by a human, ideally one who has not been in a TC standup. Recruit a friend who has never seen the product. Watch them. Do not coach. Ten-minute session each.

For each task, mark: **Completed unassisted**, **Completed with one nudge**, **Failed / gave up**, plus a one-line "what tripped them up".

**C1 First impression.** Open `https://transparent.city/` on a fresh device. Tell them: "Tell me what this is, in your own words, in ten seconds." Then: "What do you do next if you live in San Francisco?" Flag if they cannot find the way in.

**C2 City landing.** Open `/c/san-francisco` cold (not logged in). Same questions: "What is this? What do you do next?" Look for whether they understand they need to sign up, and whether they understand the value before signing up.

**C3 First feed scroll.** After signup, watch them scroll through the feed for 60 seconds without commentary. Then ask: "What is one thing you learned about your city?" If they can't name one, the feed copy is failing the comprehension test.

**C4 Story click.** Watch them open a story. Then ask: "Where does this number come from? Do you believe it?" Flag if the source citation is missed or distrusted.

**C5 District meaning.** Ask: "Which district are you in, and what does that mean for what you see?" If they don't know, the district pill copy is failing.

**C6 Newsletter subscribe.** Ask them to sign up for the newsletter (don't show them how). Time it. Anything over 30 seconds is a discoverability bug.

**C7 What is Seymour.** After 5 minutes in the product, ask: "Have you noticed anything called Seymour? What do you think it does?" Most users won't have. That itself is a finding, not a bug, but track the trend.

**C8 Exit interview.** "If you came back tomorrow, what would you want to see? What would make you not come back?" Write down the verbatim answers.

---

## D. Edge user states (the consolidated section)

Today the automated suite tests one path: an Auth0 sandbox user signing up for San Francisco. The states below are unrepresented and have all caused production bugs at some point.

For each state, set it up, then load the FTUX feed (`/home`), the city dashboard (`/c/{slug}`), the district page, and the place-level page if applicable. Note any blank state, infinite spinner, broken layout, or copy that contradicts the user's actual state.

### D1. User signed up but is in a city with no launched cities nearby

Setup: sign up with the location field set to a city that exists in our backend but is **not** in the launched list (try Sacramento, Portland, anywhere not on the homepage hero). Or set it to a state like "Wyoming" with no covered cities at all.

Expected: the user sees a clear "we're not in your area yet, here's what we do cover" screen, with a way to subscribe to be notified when their area is added, and an obvious link to browse a launched city anyway.

What to flag:
- Blank feed with no explanation
- Modal that won't close because there's no valid city to land on
- Suggestion to "look in San Francisco" without explaining why
- Newsletter signup prompt that promises city-specific content the user will never get

### D2. User in a launched city but no district selected

Setup: sign up, land on `/home`, set city to San Francisco but skip the district step (or pick a city like Stockton that hasn't published district data). Or pick a coordinate that doesn't fall inside any of the city's mapped districts.

Expected: city-level feed and dashboard render, with copy that explains "set your district for local stories" rather than implying the user already has one.

What to flag:
- District-specific cards rendering with "no data" or "your district" pointing at the wrong place
- District pill showing a stale or random district
- The "Your district rep is X" card showing the mayor or nothing
- The map highlighting nothing, or highlighting the whole city as if it were a district
- Story cards filtered to "your district" when there is none

### D3. User has a district but no precise place / address

Setup: sign up, set city, set district by clicking on the map (no street address). Or set a district that doesn't have an associated precinct, school zone, or other place-level overlay.

Expected: city + district works, place-specific cards either hide or say "add your address to see {place-level data}".

What to flag:
- Place-level cards (school zone, polling place, nearest park) rendering with someone else's data
- Address-required prompts that loop back to the same screen after submitting
- "Your nearest X" copy with no X populated

### D4. User signed up but city has zero published stories this week

Setup: pick a launched city in a quiet week (or fake it by filtering to a launched city you know is sparse).

Expected: feed shows evergreen content or an explicit "quiet week" message. Not a blank page.

### D5. Government user who signs up before their city is launched

Setup: government signup flow with a `.gov` email for a city not in the launched list.

Expected: confirmation that they're early, ETA or "we'll be in touch" message, not dumped into a citizen-style feed for a non-launched city.

### D6. Returning user whose previously-selected city has been delaunched

Setup: in dev, sign in as a user whose home city was launched then taken offline. (If you can't repro in prod, ask backend to flip `is_launched=false` on a non-critical city for one of your test accounts.)

Expected: clear "this city is no longer published" message and a prompt to pick another. Not a 404.

### D7. User who signed up but the welcome email never arrived

Setup: complete signup, then check inbox 60 seconds later. If the email didn't arrive, that's the state to test against.

Expected: the user can still operate the product. There is some in-product way to re-trigger the welcome (e.g. account settings, resend link). The session is not gated on the email.

---

## E. Smoke pass after every backend deploy

Five minutes, one browser, one device. Use a fresh private window. If any of these fail, page Rob before announcing the deploy.

1. `https://transparent.city/` loads, hero cities visible
2. Click Sign up, citizen, magic-link email arrives in under 60s
3. Magic link logs you in and lands on `/home` with a welcome modal
4. Pick San Francisco, feed renders within 30s, banner dismisses
5. Click a story, story page renders with chart + source citation
6. Open `/c/san-francisco`, dashboard loads, no console errors
7. Open the same on iPhone Safari, no obvious layout breaks

---

## What goes back to engineering

For every finding, attach:
- Section + case (e.g. "A3, Firefox 124, macOS")
- Screenshot or 10s screen recording
- Console log if there's an error
- One-line "what should happen instead"

File in the QA issue tracker. P0 (signup blocked, data wrong) gets escalated same-day. P1 (mobile layout broken, comprehension failure) gets bundled into the weekly QA digest.
