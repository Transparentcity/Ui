# UI-side automated QA

Frontend-facing automated checks. Lives in the UI repo because these checks exercise the signup surface and the post-signup user states — the parts that change with every frontend deploy.

This is separate from the platform repo's full sweep (`scripts/qa/run_qa.sh` at the TransparentCITY root), which covers story content, data truth, WCAG, etc. Run both for full coverage; this one is fast enough to run on every PR.

## What's in here

| Script | What it checks | Needs auth? |
|---|---|---|
| `onboarding-multi-engine.mjs` | Sign-up CTA visibility, Auth0 reachability, gov interstitial across Chromium + Firefox + WebKit at desktop / tablet / mobile widths | no |
| `slow-3g-banner.mjs` | Post-signup "Looking for stories" banner: 30s success contract, or explicit failure message by 60s under Slow-3G throttle | yes |
| `user-states.mjs` | D1 unlaunched-area signup (auth), D2 no-district city render (no auth), D6 delaunched-returning-user stub | partial |
| `run-qa.sh` | Orchestrator |

## Setup

```bash
cd ~/Documents/Coding/TransparentCITY/Ui
npx playwright install chromium firefox webkit
```

For checks that need auth, set the QA sandbox creds:

```bash
export QA_AUTH0_EMAIL="awerbach+QA@gmail.com"
export QA_AUTH0_PASSWORD="..."
```

Without them, `user-states.mjs` skips D1 and `slow-3g-banner.mjs` skips itself entirely.

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
