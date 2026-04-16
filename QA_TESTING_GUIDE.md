# Transparent City QA Testing Guide

## Your Role

You're testing Transparent City as a **real person encountering this product for the first time**. We're not asking you to check if pages load or if meta tags exist (we handle that with automated tools). We need your eyes, instincts, and judgment on things only a human can evaluate:

- Does this make sense to a new user?
- Does anything look wrong, feel off, or seem confusing?
- Would you trust this product? Would you come back?

**Website:** https://transparentcity.co
**Time estimate:** 5-6 hours total (heavy emphasis on physical mobile testing)
**Turnaround:** 24 hours from start

---

## Setup

### What you need
- A desktop computer
- **At least two physical phones** (one iPhone, one Android). If you only have one, tell us which and we'll find someone for the other.
- Three email addresses (one per city)
- The shared Google Sheet for recording your findings

### Required device/browser matrix

We need real physical device testing, not emulators. Please tell us in your proposal exactly which of these you can cover:

**iPhone (test all browsers you have installed):**
- Safari on iOS 17+
- Chrome on iOS
- Bonus: older iPhone (SE or iPhone 11/12) for smaller screen + older iOS

**Android (test all browsers you have installed):**
- Chrome on Android 13+
- Samsung Internet (if Samsung device)
- Firefox on Android
- Bonus: budget/mid-range Android phone for performance testing

**Desktop (secondary priority, we can automate more of this):**
- Chrome (latest)
- Safari (latest, Mac only)
- Firefox (latest)

In your proposal, list every physical device you own with its OS version.

### Three test cities

| City | URL | Notes |
|------|-----|-------|
| **San Francisco** | transparentcity.co/c/san-francisco | Most data, our flagship |
| **Austin** | transparentcity.co/c/austin | Mid-tier data |
| **Memphis** | transparentcity.co/c/memphis | Newer city, sparser data |

### Severity ratings
- **P0 Critical** -- You can't complete the task, or something is clearly broken/wrong
- **P1 Major** -- Something is confusing, misleading, or looks unprofessional
- **P2 Minor** -- Cosmetic issue, minor confusion, small polish problem
- **P3 Suggestion** -- Not a bug, but an idea for improvement

---

## Part 1: First Impressions (10 min)

Go to **transparentcity.co** as if you've never seen it before.

1. **What is this product?** Can you tell what Transparent City does within 5 seconds? Write down your first impression.
2. **Trust check.** Does the landing page look professional and trustworthy? Anything that undermines credibility?
3. **Call to action.** Is it obvious what you're supposed to do next? Is there a clear reason to sign up?
4. **City browsing.** Try searching for each of the three test cities. Is the search experience smooth? Do results feel right?
5. **Scroll the full page.** Anything look broken, misaligned, or confusing as you scroll down?

Take screenshots of anything that catches your eye (good or bad).

---

## Part 2: City Dashboard -- First Look (15 min per city)

For each city, go to the public dashboard (e.g., /c/san-francisco) while logged out.

1. **Comprehension.** Can you understand what you're looking at? What is this dashboard showing you?
2. **Data credibility.** Do the numbers and metrics look believable? Anything look suspiciously wrong (zeros, extreme percentages, nonsensical values)?
3. **Mayor/leader info.** The mayor's name no longer appears in the city header (it was removed to reduce duplication). It should appear in the district selector below. Does it look correct and well-formatted there?
4. **Visual quality.** Do the metric cards, charts, and layout look polished? Anything misaligned, cut off, or oddly spaced?
5. **Stories.** Read 2-3 story cards. Do the headlines make sense? Do the numbers in the stories seem plausible? Click into one -- does the full story feel coherent?
6. **Districts.** Click into a district. Does it feel like a useful sub-page or a dead end?
7. **Map.** Find the map. Is it intuitive? Click on some incident points. Does the information shown make sense? Is anything confusing about how data is displayed?
8. **Navigation.** Can you easily find your way around? Is it clear how to get back to the main dashboard from a sub-page?
9. **Compare cities.** After viewing all three, note which city has noticeably better or worse data coverage. Does the product degrade gracefully when a city has less data, or does it look broken?

---

## Part 3: Sign Up and Onboarding (15 min per city)

Create a new account for each city. Go through this as a real new user would.

### City-name signup (all three cities)
1. Start the signup flow. Is it clear what to do at each step?
2. Enter just the **city name** (e.g., "Austin") when asked for your location.
3. **Wait and watch.** What happens after you submit? Is there good feedback about what's happening (loading states, progress)?
4. **First feed.** When your feed loads, does it make sense? Are the stories relevant to the city you chose?
5. **Welcome email.** Check your email. Did you get one? Does it look professional? Do the links in it work?

### Address-level signup (San Francisco only)
1. Create one more account using a **full street address** (e.g., "742 Evergreen Terrace, San Francisco")
2. **Address suggestions.** Does the autocomplete dropdown work well? Are suggestions relevant?
3. **Loading experience.** During the longer neighborhood scan, is the loading experience clear about what's happening, or does it feel like something is broken?
4. **Result quality.** Does the resulting feed feel more personalized than the city-level one?

### Onboarding judgment calls
- The onboarding modal cannot be dismissed (no close button). You must complete it. Does this feel okay or frustrating?
- At any point, did you feel lost or unsure what to do next?
- Was there a moment you would have given up if this weren't a test?
- Anything feel unnecessarily slow?
- After stories load, a banner should appear and auto-dismiss after about 2 seconds. Does it feel natural or too fast/slow?

---

## Part 4: Using the Product (15 min per city)

Now that you're signed in, use the product as a regular user would.

1. **Dashboard discovery.** Can you find the main dashboard? Is it obvious, or buried? How many clicks/taps does it take?
2. **Follow a district.** Find the Follow button for a district. Click it. Was the feedback clear (toast notification)?
3. **Explore metrics.** Click into a metric detail page. Do the charts make sense? Can you understand the trend?
4. **Read stories.** Read 3-4 stories across different types. Do they feel like real, useful local news? Anything feel auto-generated or nonsensical? Note: the three-dot menu on cards is now hidden for regular users (only admins see it). Does the card still feel complete without it?
5. **Filter stories.** Try using the filter panel. On mobile, there should be a "Done" button to apply filters. Does it work? Does the default chronological sort order feel right?
6. **Page feedback widget.** Find the thumbs up/down widget. Is it noticeable? Does it work?
7. **Safety page.** Visit the safety page (/c/[city]/safe). Is the data presentation clear? Would you trust these safety ratings?
8. **Newsletter.** Find a newsletter archive page. Does it read well? Would you subscribe based on this?

---

## Part 5: Dark Mode -- All Devices (15 min)

Test dark mode on **every device you have** (desktop, iPhone, Android).

**Important:** The app has its own dark mode toggle in Settings, separate from your OS setting. Test BOTH ways:
1. OS dark mode ON + app dark mode ON (should be dark)
2. OS dark mode ON + app light mode (should be light, not stuck in dark)
3. OS light mode + app dark mode ON (should be dark)

This combination matters because a recent bug caused components to follow the OS setting instead of the app toggle.

For each device, check one city dashboard, one story detail page, and the safety page:

- Is all text readable? (Feed body text was recently darkened for better readability)
- Any elements that are invisible or nearly invisible?
- Any harsh color clashes or obvious styling misses?
- Does it feel intentionally designed for dark mode, or like an afterthought?
- On mobile specifically: does the bottom nav, signup bar, and map look right in dark mode?
- Do Dashboard/Map tabs look correct? (Inactive tabs should have a visible border)

Screenshot every issue. Note which device and browser for each screenshot.

---

## Part 6: Physical Mobile Testing -- iPhone (30 min)

**This is the most important section.** Use your real iPhone. Do NOT use desktop responsive mode as a substitute.

Test on **every browser you have installed** on your iPhone (Safari, Chrome, etc.). Note which browser for each finding.

### 6A. First Contact on iPhone
1. Open transparentcity.co in Safari. What's your first impression? Does it feel like a native-quality experience?
2. Does the page respect the notch/Dynamic Island? Is there proper spacing at the top and bottom? (The app now uses `viewport-fit: cover` with safe area insets.)
3. Is the bottom navigation bar visible and does it clear the home indicator (swipe bar)?

### 6B. Core Interactions on iPhone (test for each city)
1. **Tap targets.** Tap every button you encounter: Follow, district selector, metric cards, story cards, feedback widget. Are any too small or too close together?
2. **Scrolling.** Scroll through the city dashboard, story feed, and safety page. Is scrolling smooth? Any pages where you can accidentally scroll sideways?
3. **Pull-to-refresh.** Does it work or conflict with the browser's pull-to-refresh?
4. **Text selection.** Can you copy text from stories without triggering unwanted actions?

### 6C. Map on iPhone (test for San Francisco)
This is critical. The map is a key feature and touch interaction is very different from desktop.
1. **Pinch to zoom.** Does the map zoom smoothly? Does it conflict with page zoom?
2. **Pan.** Can you drag the map without accidentally scrolling the page?
3. **Tap a cluster.** Does it zoom in or show details? Is the behavior clear?
4. **Tap a single incident point.** Does the detail panel appear? Can you read it? Does it overlap with the bottom nav?
5. **Swipe to dismiss.** Can you close the incident panel naturally? What gesture feels right? Does it work?
6. **Orientation.** Rotate to landscape. Does the map behave? Does the incident panel still work?

### 6D. Onboarding on iPhone (do a full signup on one city)
1. Go through the complete signup flow on your phone
2. **Address autocomplete.** Type an address. Does the suggestions dropdown appear? Can you tap the right suggestion without it jumping or closing?
3. **Keyboard interaction.** When the keyboard is up, can you still see what you're typing? Does the modal scroll properly? (The input should be 16px to prevent iOS/Android auto-zoom.)
4. **Button responsiveness.** Do buttons respond immediately to taps, or is there a noticeable delay? (A 300ms tap delay fix was recently applied.)
5. **Loading states.** During the neighborhood scan, are the progressive messages visible and readable on the small screen?
6. **After completion.** Does the feed render well? Can you immediately start using the product?

### 6E. Reading and Sharing on iPhone
1. Open a story. Is the text comfortable to read without zooming?
2. Try sharing a story via the share button. Does the iOS share sheet open correctly?
3. Does the shared link preview look good in iMessage or another app?

### 6F. Older/Smaller iPhone (if you have one)
If you have an iPhone SE, 11, 12, or any phone with a smaller screen:
1. Repeat 6A-6D quickly. Smaller screens expose layout overflow and cramped tap targets.
2. Does the city dashboard hero section (mayor name, follow button) fit?

---

## Part 7: Physical Mobile Testing -- Android (30 min)

Same depth as iPhone testing, but note the differences. Android has its own quirks (back gesture, different safe areas, Samsung Internet, varying screen sizes).

### 7A. First Contact on Android
1. Open transparentcity.co in Chrome. First impression?
2. Does it respect the system navigation bar (gesture or 3-button)?
3. Is the bottom navigation bar visible and not overlapping system controls?

### 7B. Core Interactions on Android (test for each city)
1. **Tap targets.** Same tests as iPhone. Android users tend to have slightly different tap behavior.
2. **Back button/gesture.** Does the Android back gesture (swipe from edge) navigate correctly? Does it go where you expect?
3. **Scrolling.** Any over-scroll or horizontal scroll issues?
4. **Text size.** If you have your system text size set larger than default, does the site handle it or does text overflow?

### 7C. Map on Android (test for San Francisco)
1. **Pinch to zoom.** Same tests as iPhone. Does it work smoothly?
2. **Tap an incident point.** Does the detail panel appear correctly?
3. **Does the panel sit above the Android navigation bar?** This is a known problem area.
4. **Performance.** Is the map smooth or janky? Especially on mid-range Android phones.

### 7D. Onboarding on Android (do a full signup on one city)
1. Complete signup flow. Same checks as iPhone.
2. **Address autocomplete.** On Android, does the dropdown appear above the keyboard? Can you tap suggestions?
3. **Keyboard behavior.** Does the page scroll correctly when the keyboard opens?
4. **Chrome vs Samsung Internet.** If you have a Samsung phone, compare the experience in both browsers. Note any differences.

### 7E. Browser Differences on Android
If you have multiple browsers installed, do a quick comparison:
1. Chrome vs Firefox: Load a city dashboard. Any differences?
2. Samsung Internet (if available): Same test. Samsung Internet handles CSS differently sometimes.

---

## Part 8: Cross-Platform Comparison (10 min)

After testing on all your devices, write up:

1. **iPhone vs Android.** Did one feel better? Were there platform-specific bugs?
2. **Safari vs Chrome vs other browsers.** Any browser-specific issues?
3. **Small screen vs large screen.** Did anything break on smaller phones?
4. **Performance.** Which device/browser felt slowest? Was the map usable everywhere?
5. **Gestures and affordances.** Did interactions (tap, swipe, pinch) feel natural on both platforms? Anything that worked on one but not the other?

---

## Part 9: Final Summary

In the "Summary" tab of the Google Sheet, write:

1. **Top 3-5 issues** -- The most important things to fix before launch, with severity
2. **City comparison** -- Which city worked best? Which had the most problems? Why?
3. **Biggest UX confusion** -- Where did you feel most lost or frustrated?
4. **Trust and credibility** -- Would you trust this site with your attention? What helped or hurt?
5. **Mobile verdict** -- Is the mobile experience ready for real users?
6. **Would you come back?** -- Honest answer. Why or why not?
7. **Top 3 suggestions** -- If you could change three things, what would they be?
