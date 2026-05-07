# QA Synthesis Report
2026-05-07. TransparentCITY UI. Single-pass deep audit covering security, latent bugs, mobile UX, accessibility, automated checks, and root-cause patterns.

## Headline numbers

| Surface | Issue count | Verified | Worst severity |
|---|---|---|---|
| ESLint rule violations | **1480** (989 errors + 491 warnings) | yes (`npx eslint .`) | rules-of-hooks (3 files) |
| TypeScript errors | **0** | yes (`tsc --noEmit`) | clean |
| Failing tests | **20** across 5 files | yes (`npm test`) | WelcomeModal Preferences step (10 tests, public flow) |
| Confirmed P0 security | **5** | yes (read each route) | unauthenticated `/api/generate-emails` |
| Confirmed P0 bugs | **2** + 6 P1 | yes (read each file) | bulk-delete count mismatch (admin data loss) |
| Mobile UI P0 | **7** (iOS zoom, scroll lock, missing inputModes) | static review | inputs at 13px font cause iOS zoom on every input |
| A11y P0 | **9** (modals, labels, alerts) | static review | hand-rolled modals lack focus trap |
| Total findings | **~165 distinct** | mixed | |

The audit doc lives at `AUDIT_2026-05-07.md`. This file is the synthesis: what's actually wrong, why it keeps happening, and how to keep it from recurring.

---

## 1. Confirmed P0s, ranked by what to fix today

### Security (5)

| # | Route / file | Verdict | Risk | Fix |
|---|---|---|---|---|
| 1 | `src/app/api/generate-emails/route.ts:328` | **Confirmed** | Unauthenticated, drives Anthropic spend (8000 maxTokens/call) and reads `prospects` rows by guessing UUIDs | `withAdmin` Auth0 guard + IP rate limit; verify Supabase RLS on `prospects` |
| 2 | `src/app/api/analyze-anomaly/route.ts:67-142` | **Confirmed** | Unauthenticated, Anthropic-bill DoS (1500 maxTokens/call) | Auth0 session check + per-IP rate limit + cap input size |
| 3 | `src/app/api/research-media/route.ts:78` | **Confirmed SSRF** | `new URL(absoluteUrl, base)` ignores base; server fetches arbitrary host (cloud metadata, internal VPC) | Reject if `permalinkPath` parses absolute, or assert `.origin === base.origin` post-resolve |
| 4 | `next.config.ts:48-65` | **Confirmed** | `remotePatterns: [{protocol:"http", hostname:"**"}]` makes `/_next/image` an open image proxy and probe vector | Restrict to specific hostnames |
| 5 | `src/app/chat/[hash]/page.tsx:135` | **Confirmed XSS** | LLM output piped through `\n -> <br/>` then `dangerouslySetInnerHTML` on a public route | Escape HTML first or render via sanitized markdown |

Findings 4 (newsletter HTML), 8 (NewsletterAdmin), 9 (FeedAdmin) from the original audit were downgraded after verification: admin-only context with backend-controlled HTML. Still worth sanitizing as defense-in-depth, but not exploitable today.

Two more must-fixes but not strictly P0:
- `welcome-email/route.ts:198` and `city-suggestion/route.ts:48`: `origin.includes(".vercel.app")` lets any Vercel preview deploy bypass. SendGrid abuse / signup spam.
- No security headers anywhere (no CSP, X-Frame-Options, HSTS). Add `headers()` in `next.config.ts`.

### Bugs (2 P0, 6 P1)

| # | Location | Verdict | Impact | Fix |
|---|---|---|---|---|
| 1 | `FeedAdmin.tsx:259-278` | **Confirmed P0** | Admin sees "Delete ALL 12 stories for Oakland" but the API deletes every story for that city (~200). Irreversible. | Either pass time/search filters to API or compute count via `stories.filter(s => s.city_id === selectedCityId).length` |
| 2 | `providers.tsx:106-110` | **Confirmed P1 → P0 for some users** | `clearStaleAuth0State` runs *after* Auth0Provider initialized off stale localStorage tokens. Users hitting auth callbacks with stale state see redirect loops or "invalid state" errors | Run cleanup in module scope or gate Auth0Provider rendering on `ready` state |
| 3 | `FeedContainer.tsx:681, 1158-1164` | Confirmed | Hydration mismatch: `useState(() => loadHiddenIds())` and `useMemo(showCityDiscovery)` read localStorage during SSR | Init empty, hydrate in `useEffect` |
| 4 | `home/page.tsx:182-188` | Confirmed | Same SSR/CSR sidebarWidth mismatch (the `sidebarOpen` directly above is correctly handled, comment even calls out the pattern) | Default to 280, hydrate in effect |
| 5 | `AuthModal.tsx:31-36` | Confirmed | `onClose` in deps + inline arrow callers → `router.push("/home")` repeats per render after auth | Memoize at call site or omit `onClose` from deps |
| 6 | `PageFeedback.tsx:68-70` | Confirmed | 429 path runs `markSubmitted()` and shows "Thanks!"; user is locked out for 24h, feedback never recorded | Show "rate-limited, try later" without persisting submission |
| 7 | `FeedAdmin.tsx:62` | Confirmed | `new Date(s.story_date)` parses YYYY-MM-DD as UTC; "Last 24h" filter shifts up to 8h for Pacific users | Append `T00:00:00` or use date-fns calendar math |
| 8 | `FeedAdmin.tsx:158-171` | Partial | `while(true)` paginator has a break condition but no max-iterations guard or AbortController; backend regression hangs the tab | Add `MAX_PAGES`, AbortController on unmount |

False positive identified: `anomalies-manager.tsx:578` `pct_change.toFixed(1)` is guarded by `pct_change != null`. Remove from list.

### Failing tests (20 / 1719)

| File | Failures | Likely root cause |
|---|---|---|
| `WelcomeModal.test.tsx` | **10** (entire "Preferences step" block) | Refactor to onboarding flow (mayor/district representative cards, naming on "Almost there", advanced options) — tests not updated |
| `review-and-send.test.tsx` | 5 (anomaly swap UI) | Anomaly swap interaction changed since tests written |
| `m/[hash]/page.test.tsx` | 2 (Source information button, signup CTA when unauthenticated) | UI label or role attribute changed |
| `waste/waste-shell.test.tsx` | 1 (tab navigation links) | Tab structure changed |
| `wrongHeadlines.test.ts` | 1 (FRIENDS HALAL MEAT SUPERMARKET title-casing) | Headline normalizer regressed on a specific case |

These are passing-when-they-shouldn't dynamics: the WelcomeModal failures cover the **single most important user flow** (resident onboarding), and we shipped UI changes through anyway because the test step isn't part of CI gating, or CI ignores failure.

### Mobile UI (7 P0, 30+ P1)

The big patterns:
- **iOS auto-zoom**: 6+ `<input>` and `<textarea>` elements with `font-size: 13` (PageFeedback inline styles, others). Every input causes a viewport zoom on focus.
- **`100vh` everywhere**: 22 references across CSS files. iOS address-bar collapse clips modals, sidebars, the full-screen FOIA panel, the media gallery.
- **No iOS scroll lock**: Most modals (`AuthModal`, `WelcomeModal`, `RenameDialog`, `EditHomeLocationModal`) use `body { overflow: hidden }` only — iOS ignores it. Two modals (`NewsletterAdmin`, `MobileMoreMenu`) do it right with `position: fixed; top: -scrollY`. The pattern exists; it's just not applied consistently.
- **44px tap targets**: Many icon-only buttons at 16-32px (close X in AuthModal at 36px, filter pill remove at 16x16, ui/checkbox at 16x16).
- **Sticky 280px sidebars on mobile**: 3 admin pages (cityreadiness, crm, foia) leave 40-95px for content on a 320px viewport.
- **Missing `inputMode` / `autoCapitalize` / `autoCorrect`** on address and email inputs in WelcomeModal — iOS auto-corrects "Treat" out of "Evergreen Terrace".

### Accessibility (9 P0)

- Hand-rolled modal overlays with no `role="dialog"`, `aria-modal`, focus trap, focus return-to-trigger: `RenameDialog`, `UserMetricOrderDialog`, `MobileMoreMenu`, `EditHomeLocationModal`. Radix Dialog handles all of this for free; the pattern just wasn't followed.
- No skip-to-content link.
- `loading.tsx` files: spinners with no `role="status"` / `aria-busy`, AT users hear silence.
- 39+ files use `text-gray-400` / `zinc-400` / `slate-400` on white (~3.4:1, fails AA 4.5:1 for body).
- Forms (PageFeedback, TopNavCitySearch, plus 8+ admin search bars) use placeholder as the only label.

---

## 2. Root-cause patterns

Most of the 165 findings collapse into a small set of recurring root causes. Fixing the *patterns* is cheaper than fixing every instance.

### Pattern A: localStorage in render (3+ confirmed instances)
`useState(() => localStorage.getItem(...))` and `useMemo(() => localStorage.getItem(...))` produce SSR/CSR hydration mismatches. The team already understands this — `home/page.tsx:181` has a correct workaround for `sidebarOpen` with a comment explaining it. The next line ignored its own advice. **Fix: lint rule + a `useLocalStorage` helper that's safe by construction.**

### Pattern B: API routes shipped without auth (2 confirmed)
`/api/generate-emails`, `/api/analyze-anomaly` were built when "internal use only" was the assumption. They're now public routes pointing at a paid LLM. **Fix: a `withAuth` / `withAdmin` wrapper required for every route by convention, plus a CI grep that flags new `route.ts` files without one.**

### Pattern C: 989 lint errors with no CI gate
| Rule | Count | Severity |
|---|---|---|
| `@typescript-eslint/no-explicit-any` | 862 | type laxness — masks real bugs |
| `@typescript-eslint/no-unused-vars` | 366 | dead code |
| `react-hooks/exhaustive-deps` | 92 | **stale closures, real bugs** |
| `react/no-unescaped-entities` | 45 | minor |
| `react-hooks/set-state-in-effect` | 35 | **render loops, real bugs** |
| `react-hooks/refs` | 16 | ref misuse |
| `jsx-a11y/role-has-required-aria-props` | 15 | a11y |
| `react-hooks/rules-of-hooks` | **2** | **definitely broken** in MediaGallery, MultiMetricCard, PhotoCard |

Most concerning: 92 `exhaustive-deps` warnings + 35 `set-state-in-effect` warnings + 2 `rules-of-hooks` errors are exactly the rule family our P0 bugs come from. We have the static analysis, we just don't enforce it. **Fix: enforce zero new violations, drive the count down per sprint.**

### Pattern D: ad-hoc modals diverge from Radix
Radix Dialog gives you focus trap, focus return, Escape, ARIA, body scroll lock. Four hand-rolled modals (RenameDialog, UserMetricOrderDialog, MobileMoreMenu, EditHomeLocationModal) reinvent fragments of this and miss things. **Fix: a project rule "all dialogs use Radix unless reviewer signs off"; codemod the four offenders.**

### Pattern E: 22 instances of `100vh`
Mobile address-bar pain. Pure search-and-replace with `100dvh`. **Fix: a Stylelint rule that bans `100vh` in favor of `100dvh`.**

### Pattern F: HTML rendered raw, sometimes from public sources
6+ `dangerouslySetInnerHTML` calls. Three are admin-only (acceptable but worth defense-in-depth). One is on a public route (`chat/[hash]/page.tsx`) and is a real XSS vector. **Fix: a project-wide convention that `dangerouslySetInnerHTML` always passes through `sanitize()` from a single helper, with grep enforcement.**

### Pattern G: 20 failing tests, all in user-facing flows
Three of the five failing files (WelcomeModal, review-and-send, public map page) are public flows. Test file existence isn't enough; tests need to *actually fail the build*. **Fix: CI gate on `npm test` exit code.**

### Pattern H: form inputs at 13px font-size
A few inline-styled inputs use `fontSize: 13`. Tailwind defaults are larger; the regressions came from inline style overrides. **Fix: either ban inline `fontSize` below 16px, or set `text-size-adjust: 100%` and use a base input style.**

### Pattern I: image proxy and SSRF share a root
The `remotePatterns: **` and the `research-media` SSRF are the same instinct: "trust input, fetch it server-side, ship it". **Fix: any server-side fetch with a user-supplied URL goes through a single helper that enforces an allowlist.**

---

## 3. Prevention plan: keep these out of `main`

The patterns above suggest 6 mechanical changes, ranked by ROI. None require new infrastructure beyond what we already have (ESLint, Vitest, GitHub Actions, Vercel).

### 3.1 Make CI actually block on the things we already check (highest ROI)

Today: `npm run lint`, `npm run type-check`, `npm test` run, but the deploy doesn't block on lint or test failures (otherwise we couldn't be sitting at 989 errors and 20 failing tests on `main`).

Add a single GitHub Action that runs all three on PRs to `main` and fails the build if any return non-zero. **Until then, every other rule below is optional.**

```yaml
# .github/workflows/ci.yml
name: CI
on: [pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npm run type-check
      - run: npm test
      - run: npm run lint -- --max-warnings 0
```

For the lint gate to pass, we need a "ratchet" approach: capture today's count as the baseline, fail PRs that *increase* any rule count. (Tools: `lint-baseline`, `eslint-rule-tester`, or a custom diff script. A shell one-liner is enough for now.)

### 3.2 Convention: every API route declares its auth posture

Today: routes vary. Some use `requireAdmin`, some have nothing, hard to audit.

Add a single helper:
```ts
// src/lib/api/auth.ts
export const PUBLIC = Symbol("PUBLIC")
export type Auth = typeof PUBLIC | "user" | "admin"
export function withAuth(auth: Auth, handler: ...) { ... }
```

Convention: every `route.ts` exports `export const auth = "admin"` (or PUBLIC) and wraps the handler. A pre-commit grep enforces it:
```sh
# any route.ts that doesn't import withAuth fails the check
git diff --diff-filter=A --name-only HEAD | grep '/route\.ts$' | xargs grep -L 'withAuth\|export const auth'
```

This would have caught `/api/generate-emails` and `/api/analyze-anomaly` at PR time.

### 3.3 Add `react-hooks/exhaustive-deps` and `set-state-in-effect` to the lint ratchet

These are bug-finding rules. The 92 + 35 + 2 violations are mostly latent bugs we haven't hit yet. Let the count only go down.

### 3.4 Helper for SSR-safe localStorage

Replace ad-hoc patterns with one helper:
```ts
// src/lib/useLocalStorage.ts
export function useLocalStorage<T>(key: string, initial: T): [T, (v: T)=>void] {
  const [value, set] = useState<T>(initial)
  useEffect(() => {
    try { const v = localStorage.getItem(key); if (v) set(JSON.parse(v)) } catch {}
  }, [key])
  ...
}
```

Codemod the three confirmed offenders and any new ones get caught by an ESLint custom rule banning `localStorage` in `useState` initializers.

### 3.5 One sanitize helper, one place to grep

```ts
// src/lib/sanitize.ts
import DOMPurify from "isomorphic-dompurify"
export const sanitizeHtml = (s: string) => DOMPurify.sanitize(s, { ... })
```

Add a grep guard:
```sh
grep -r "dangerouslySetInnerHTML" src/ | grep -v "sanitizeHtml"
```

If the grep returns anything, CI fails. Forces the call site to either use the helper or explicitly justify a bypass.

### 3.6 Stylelint rule for `100vh` and `font-size < 16px` on inputs

```js
// .stylelintrc
"declaration-property-value-disallowed-list": [
  { "/.*/": ["/100vh/"] }
]
```

Plus a grep for inline `fontSize: 1[0-5]` near `<input` / `<textarea`.

### 3.7 Enforce Radix for dialogs

Project README rule + grep:
```sh
grep -rE "(role=\"dialog\"|aria-modal=\"true\")" src/ | grep -v "node_modules\|@radix-ui"
```

Anything that hand-rolls dialog ARIA outside Radix needs a code review nod.

---

## 4. Suggested execution order

**This week (P0 critical-path)**
1. Add the CI gate (3.1). Even with all 989 lint errors, prevents *new* regressions.
2. Auth-gate the two public LLM routes. Patch the SSRF in `research-media`. Tighten image `remotePatterns`. (Security findings 1, 2, 3, 4.)
3. Fix the bulk-delete count mismatch in FeedAdmin (data loss).
4. Fix the Auth0 init race in `providers.tsx` (auth flakiness).
5. Sanitize the public chat HTML render.
6. Add CSP / X-Frame-Options / HSTS via `next.config.ts` `headers()`.

**Week 2 (mobile P0 sweep)**
7. Replace `100vh` with `100dvh` everywhere (mechanical, safe).
8. Bump every input below 16px to 16px font-size.
9. Apply iOS body-scroll-lock pattern to all modals.
10. 44px tap-target sweep on icon buttons.

**Week 3 (a11y + bug cleanup)**
11. Port hand-rolled modals to Radix Dialog.
12. Add skip-to-content + screen-reader loading announcements.
13. Color-contrast pass: replace text-gray-400 → 500 on white backgrounds.
14. Fix the 20 failing tests (or delete the obsolete ones).
15. Hydration-mismatch fixes in FeedContainer / home/page (use the new useLocalStorage helper).

**Week 4 (process + ratchet)**
16. Land the auth-posture convention (3.2).
17. Land the sanitize helper (3.5) and grep guards.
18. Land the Stylelint rule (3.6) and Radix guard (3.7).
19. Set per-rule baselines for the lint ratchet (3.3).
20. Reduce `no-explicit-any` count by 100 per week as a stretch goal.

---

## 5. What I checked, in case anyone wants to repeat

| Check | Tool | Result |
|---|---|---|
| Lint | `npx eslint .` | 989 errors, 491 warnings, 1480 total |
| Types | `tsc --noEmit` | clean |
| Unit tests | `npm test` (vitest) | 20 failures across 5 files |
| Security audit | code review of `src/app/api/**`, `next.config.ts`, `vercel.json` | 5 P0 confirmed |
| Bug audit | code review of state hooks, effects, dates, API contracts | 2 P0 + 6 P1 confirmed |
| Mobile audit | search for `100vh`, `font-size < 16`, missing `inputMode`, sticky sidebars, hand-rolled modals | 7 P0 + 30 P1 |
| A11y audit | ARIA on dialogs, labels on inputs, contrast classes, skip links | 9 P0 + 10 P1 |

Browser-based smoke tests (mobile viewport interaction, real keyboard zoom, real iOS scroll lock) were not run in this pass — the existing `SMOKE_TESTS.md` manual checklist remains the right runtime gate. The CI ratchet in 3.1 is the durable answer.

---

## TL;DR

- We have ~165 distinct issues, but they collapse to 9 root-cause patterns.
- Most patterns already have the tooling to detect them (ESLint, Radix, existing helpers); we just don't enforce them.
- The single biggest leverage point is making CI actually fail on lint/test/typecheck (today nothing blocks `main`).
- Five P0 security holes, two P0 admin-bug data-loss surfaces, and twenty test failures should land this week.
- A four-week process plan plus six mechanical CI/lint/grep changes prevents 80% of these from recurring.
