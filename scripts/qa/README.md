# UI-side automated QA

Frontend-facing automated checks. Lives in the UI repo because these checks exercise the signup surface and the post-signup user states — the parts that change with every frontend deploy.

This is separate from the platform repo's full sweep (`scripts/qa/run_qa.sh` at the TransparentCITY root), which covers story content, data truth, WCAG, etc. Run both for full coverage; this one is fast enough to run on every PR.

## What's in here

| Script | What it checks | Needs auth? |
|---|---|---|
| `onboarding-multi-engine.mjs` | Sign-up CTA visibility, Auth0 reachability, gov interstitial across Chromium + Firefox + WebKit at desktop / tablet / mobile widths | no |
| `slow-3g-banner.mjs` | Post-signup "Looking for stories" banner: 30s success contract, or explicit failure message by 60s under Slow-3G throttle | yes |
| `user-states.mjs` | D1 unlaunched-area signup (auth), D2 no-district city render (no auth), D6 delaunched-returning-user stub | partial |
| `get-landing-pages.mjs` | `/get/{slug}` landing page for every launched city: page loads, most recent Sunday's newsletter date renders, Sign in button reaches Auth0 login | no |
| `content-render.mjs` | Rendered DOM + render health: em/en dashes & " - " punctuation in visible text, leaked tokens (undefined/null/NaN/{{}}/raw entities/markdown), failed first-party requests, broken images, console errors, error boundaries, React hydration mismatches (CR8) | no |
| `headline-sense.mjs` | LLM judge (claude-sonnet-4-6) flagging rendered headlines with a broken/template string: broken grammar, truncation, placeholder/leaked tokens, nonsense. Judges each headline in isolation (cross-story data consistency is the platform's job); has a product glossary + headlinese rules so "your weekly" and implied-subject headlines aren't flagged | needs LLM key |
| `chart-render.mjs` | Newsletter-embed chart images render (not broken) inside the `/get` iframe; any top-level recharts/canvas actually drew | no |
| `link-crawl.mjs` | Internal links from seed pages: HTTP status + client render (error boundary / blank page) that a status-only crawl misses | no |
| `run-qa.sh` | Orchestrator |

These read the **rendered DOM and runtime behavior**, which is what makes them additive to the platform suite — that one reads the story CSV (source data) and can't see anything the rendering layer introduces, transforms, or fails to load (marketing-copy dashes, broken chart images, hydration mismatches, client-only nav errors).

## Setup

```bash
cd ~/Documents/Coding/TransparentCITY/Ui
npx playwright install chromium firefox webkit
```

Credentials and keys go in `scripts/qa/.env.local` (gitignored; `run-qa.sh`
sources it automatically):

```bash
export QA_AUTH0_EMAIL="awerbach+QA@gmail.com"
export QA_AUTH0_PASSWORD="..."
export QA_ANTHROPIC_API_KEY="sk-ant-..."   # for headline-sense.mjs
```

Without the Auth0 creds, `user-states.mjs` skips D1 and `slow-3g-banner.mjs`
skips itself. Without an LLM key (`QA_ANTHROPIC_API_KEY`, falling back to
`ANTHROPIC_API_KEY`), `headline-sense.mjs` skips itself. None of these
block the rest of the sweep.

## Running

```bash
cd ~/Documents/Coding/TransparentCITY/Ui

bash scripts/qa/run-qa.sh                           # full UI sweep
bash scripts/qa/run-qa.sh --skip-webkit             # drop WebKit
bash scripts/qa/run-qa.sh --skip-firefox            # drop Firefox
bash scripts/qa/run-qa.sh --only onboarding         # one step
bash scripts/qa/run-qa.sh --site https://staging.example
```

Or invoke any check directly:

```bash
node scripts/qa/onboarding-multi-engine.mjs --engines chromium,firefox
node scripts/qa/user-states.mjs --unlaunched-location "Sacramento, CA"
node scripts/qa/slow-3g-banner.mjs
```

## Exit codes

- `0` everything clean
- `1` at least one check reported findings (the system worked, real bugs caught)
- `2` one or more checks crashed (Playwright missing, etc.)

## Adding a new check

Drop a `.mjs` file in this directory that prints `OK  <rule>` / `FAIL <rule> — detail` lines and exits 1 on findings. Add one `run_step` line to `run-qa.sh`. That's it.
