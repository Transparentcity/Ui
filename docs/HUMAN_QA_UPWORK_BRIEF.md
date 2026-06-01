# QA Tester Job: TransparentCITY Web App

## The job

Run through a fixed checklist on `https://transparent.city` using real devices and a few different browsers. Sign up your own test accounts (use Gmail `+tag` addresses), follow the steps, and report what's broken.

**Flat payment: $250 for the first full pass. $150 per recurring pass after that.** Pay sent on delivery of the results doc.

Expected time: 4 to 6 hours. If it takes you longer that's on us in the price; if it takes less, great.

## What you need

- A real iPhone (any model from iPhone SE 2 forward) and a real Android phone (Pixel or Samsung, any modern model)
- A Mac or Windows desktop with Chrome, Safari (if Mac), Edge, and Brave installed
- A Gmail address that supports `+tag` (e.g. `youremail+tc1@gmail.com`, `youremail+tc2@gmail.com`)
- A password manager extension (1Password, Bitwarden, or LastPass) installed in Chrome
- 4 to 6 hours of focused time

You set up your own test accounts. We don't provide logins. Use a fresh `+tag` for each signup so we can track them.

## How it works

1. Run through the checklist below in order.
2. For each numbered item, mark **PASS** or **FAIL**.
3. For every FAIL, paste a screenshot (or a 10-second screen recording) and one sentence about what happened.
4. Paste your results into a Google Doc or Notion page, share the link with us.
5. We send payment within 24 hours of receiving the doc.

If you get stuck on a step, mark it **SKIP** with a one-line reason and move on. Don't burn time fighting one bug.

If something is on fire (signup completely broken, site down, can't load any page), ping us on Slack before continuing the rest.

---

## The checklist

Work top to bottom. Each step says which device or browser to use. Sign up a fresh account using a new `+tag` email each time you see "fresh signup".

### Part 1: Desktop signup, multiple browsers (~60 min)

Use a new `+tag` for each browser. Open each browser in a private/incognito window.

**1.1 Chrome on desktop.** Go to `https://transparent.city`. Click Sign up, choose Sign up as citizen. Enter your fresh email. Open the magic link from your inbox in the same Chrome window. PASS if you land on `/home` with a welcome modal open. Pick San Francisco when prompted, wait for the feed to load. PASS if the feed shows stories within 30 seconds.

**1.2 Same as 1.1 but with your password manager extension active.** Fresh `+tag`. PASS if the email field autofills and the submit button still enables (a common bug: autofill fires but submit stays disabled).

**1.3 Safari on Mac (skip if you're on Windows).** Fresh `+tag`, same flow as 1.1.

**1.4 Edge on Windows (skip if you're on Mac).** Fresh `+tag`, same flow.

**1.5 Brave, shields up.** Fresh `+tag`, same flow. PASS if signup completes. A common Brave bug is the Auth0 callback dying silently with shields up. If you see a spinner that never resolves, that's a FAIL with details.

**1.6 Cross-browser magic link.** Start signup in Chrome (enter the email). Then open the magic link in Safari (or Firefox if no Mac). PASS if either it completes the signup, or it shows a clear "open this in your original browser" message. FAIL if it just lands on a blank `/home`.

**1.7 Back button mid-flow.** In Chrome, click Sign up, get to the Auth0 page, hit browser back. PASS if you cleanly return to `/`. Then click Sign up again. PASS if the dropdown still works.

**1.8 Government interstitial.** Go to `https://transparent.city/?signup=public-servant`. Try entering a regular Gmail. PASS if it's rejected with a clear message. Then enter a `.gov` address (you don't have one, just type any fake like `test@ca.gov`). PASS if the form accepts it and moves forward.

**1.9 Cookies disabled.** In Chrome, block all cookies for the site. Try signup. PASS if you see a clear error message. FAIL if it silently fails or spins forever.

**1.10 Window resize.** Open the welcome modal at full desktop width. Drag the window down to about 400px wide. PASS if the modal reflows cleanly. FAIL if the submit button gets clipped below the fold.

---

### Part 2: iPhone (~45 min)

Fresh `+tag` for each major flow. All these are on your real iPhone Safari unless stated.

**2.1 Signup, magic link from Mail.app.** Fresh `+tag`. Sign up in Safari, open the magic link from the Mail app. PASS if you land on `/home` with the modal.

**2.2 Signup, magic link from Gmail iOS app.** Fresh `+tag`. Sign up in Safari, open the link from the Gmail app (which uses an in-app browser). PASS if signup completes. FAIL if you end up logged out on `/`.

**2.3 Keyboard occlusion.** In the welcome modal, tap the city/location field. PASS if the submit button is still visible above the keyboard. FAIL if it's hidden under the keyboard with no way to scroll.

**2.4 Autocorrect on city field.** Type "san francisco" with autocorrect on. PASS if the city is recognized (either matches directly or shows a dropdown to pick). FAIL if autocorrect mangles it and the matcher gives up.

**2.5 Pull-to-refresh.** On `/c/san-francisco`, pull down. PASS if content reloads cleanly. FAIL if it crashes or duplicates content.

**2.6 Landscape rotation.** While the welcome modal is open, rotate to landscape. PASS if it reflows. Then go to a story page in landscape. PASS if nothing is clipped.

**2.7 Notch / safe area.** PASS if the top navigation doesn't collide with the status bar, and bottom buttons don't get hidden behind the home indicator.

**2.8 Share sheet.** Long-press a story link in the feed, tap Share, send to yourself via Messages. PASS if the iMessage preview shows a real image (not a broken thumbnail). Open the link from Messages. PASS if it deep-links to the story, not to `/`.

**2.9 Map gestures.** Go to `https://transparent.city/c/san-francisco`, find a district map, try pinch-zoom and two-finger pan. PASS if the map responds and doesn't accidentally trigger page scroll.

**2.10 Reduced motion.** iPhone Settings, Accessibility, Reduce Motion ON. Sign up with a fresh `+tag`. PASS if the signup banner still completes (just without animation).

---

### Part 3: Android (~30 min)

Fresh `+tag` for each. Use Chrome on Android.

**3.1 Signup, magic link from Gmail app.** Fresh `+tag`. Sign up, open the link from the Gmail Android app. PASS if signup completes.

**3.2 Keyboard occlusion.** Same as 2.3 but on Android.

**3.3 Pull-to-refresh.** Same as 2.5 on Android.

**3.4 Landscape.** Same as 2.6 on Android.

**3.5 Share sheet.** Same as 2.8 on Android (share to yourself via SMS or any messenger).

---

### Part 4: You as a new user (~30 min)

You're a real person looking at this for the first time too. After all the signups above, spend 30 minutes using the product like a curious resident would. Then answer these questions in your results doc, one or two sentences each. We want your honest take, not what you think we want to hear.

**4.1 First impression.** When you first hit `https://transparent.city/`, what did you think it was? Did you understand what to do next?

**4.2 Sign-in friction.** Rank the signup flow on a 1-5 scale (1 = painful, 5 = effortless). What was the worst part?

**4.3 Feed comprehension.** Pick any story on the feed. Read it. Where does the number in the headline come from? Do you believe it? Why or why not?

**4.4 District meaning.** Look at the district page for any San Francisco district. Do you understand what a district is and what it means for the data shown? If not, what's confusing?

**4.5 Newsletter signup.** Without using search, how would you sign up for a newsletter? Time yourself. If it took over 30 seconds to find, that's a discoverability problem.

**4.6 Seymour.** Have you noticed anything called Seymour anywhere in the product? If yes, what do you think it does?

**4.7 Would you come back?** If a friend in San Francisco asked "should I check out transparent.city?", what would you tell them? One sentence.

**4.8 One thing to fix.** If you could change one thing about the site, what would it be?

---

### Part 5: Edge user states (~15 min)

These need a fresh signup each, in any browser.

**5.1 Unlaunched area.** Fresh `+tag`. Complete signup. In the welcome modal location field, type "Sacramento, CA" (a city we don't cover). PASS if you see a clear "not yet in your area" message with options. FAIL if you get a blank feed, infinite spinner, or get dumped onto a random city.

**5.2 Skip the district step.** Fresh `+tag`. Complete signup, pick San Francisco. If the flow lets you skip picking a district, do so. Go to `/c/san-francisco`. PASS if the page makes sense as a citywide visitor. FAIL if it shows "your district" copy with no district set, or if district-specific cards have wrong/random data.

**5.3 Welcome email never arrives.** Fresh `+tag`. Complete signup, then DON'T click the magic link. Wait 60 seconds. Try to sign in again with the same email. PASS if there's a clear way to get a new link sent. FAIL if you're stuck.

**5.4 Government user, unlaunched city.** Go to `?signup=public-servant`. Use a fake `.gov` email for a city you know we don't cover (try `test@grandforks.gov`). PASS if you see a "we'll be in touch" or similar holding message. FAIL if you're dropped into a citizen-style feed.

---

## How to report

Make a Google Doc or Notion page with this structure:

```
TC QA Pass — [your name] — [date]

Summary
- Items run: X / 38
- Pass: X
- Fail: X
- Skip: X (with reason for each)
- P0 issues (signup completely blocked, can't use site): X

Details
[for each item, paste the number, the result, and if FAIL the screenshot + one sentence]
```

Share the doc link with us. Payment goes out within 24 hours.

## Quick examples of what counts as FAIL vs PASS

- FAIL: "1.5 Brave shields up — clicked Sign up as citizen, got stuck on Auth0 callback URL spinning for 60+ seconds. Screenshot attached."
- FAIL: "2.3 Keyboard occlusion — when I tapped the city field on my iPhone 14, the keyboard covered the submit button completely with no way to scroll. Screen recording attached."
- PASS: "1.1 Chrome desktop — signup worked, feed loaded in about 12 seconds, no issues."
- SKIP: "1.4 Edge on Windows — I only have a Mac, no Windows machine available."

Don't write essays. One sentence per FAIL is all we need.

## Questions before you start?

Slack us. Don't start until you have access to a test `.gov` placeholder format and confirmation of which San Francisco district to use as the test case.
