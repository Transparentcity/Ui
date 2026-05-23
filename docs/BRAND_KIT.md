# TransparentCity Brand Kit (Frontend Reference)

This is the **frontend-facing brand reference** for [transparent.city](https://transparent.city).
Use it together with the platform style guide and Seymour Voice Charter when designing
new React/Next.js pages in `transparentcity-ui`.

**Canonical token source in code:** `src/app/tokens.css` (app-wide) and `src/app/landing.css` (marketing).

---

## 1. Vision, Mission & Legibility

TransparentCity is part of **The Legibility Project**: efforts to promote and harness
measurements and systems of legibility so people can live in ways that are more
self-aware, safe, and sustainable.

### What legibility means here

A thing is **legible** when it is easy to understand in an almost automatic way—like
reading plain English, reading a map, or reading a price tag. Legibility is not
abstract: it makes things possible that were not before. Maps, money, and public
records are all legibility systems we barely notice because they are woven into daily life.

**Legibility precedes progress.** Without it, change is halting and volatile. With it,
progress can be quick and steady—as it was after the microscope, the telescope, and
modern civic record-keeping.

### The gap we fill

Much public data already exists, but stays **inert**: unseen, unmonitored, and too costly
for most actors to analyze at scale. Meanwhile, critical aspects of civic life—how
policy lands on a block, how services actually perform, how neighborhoods compare—remain
hard to see clearly.

**Transparent technology** (what we build) makes public data legible **on behalf of
communities**: clear, contextualized, and usable—not locked behind dashboards only
insiders understand.

### Brand essence

transparent.city uses AI and public data to make civic information **legible,
understandable, and actionable** for everyday residents. We help people see what is
really happening beneath headlines, spin, and political narratives—grounded in numbers
they can verify, compare, and act on.

We are focused on shifting civic discourse from anecdote to evidence: helping people
connect with their city, communicate about what matters, and evaluate whether leaders
and systems are delivering measurable outcomes.

### Mission (operational)

Transform raw public data into **actionable insights** that reveal how cities are
really working—so residents can cut through stakeholder spin, advocate for effective
solutions, and hold leaders accountable to measurable results.

### Consideration principles

New forms of legibility can empower communities or undermine privacy and autonomy.
We evaluate tools and stories with that tension in mind: transparency and usefulness
first; no manufactured certainty; no conclusions the data does not support.

### Tagline & positioning

- **Tagline:** See your city clearly.
- **Only-ness (working):** AI-driven civic intelligence that turns a city’s public data
  into citizen-focused insights—automated, transparent, and grounded in what was
  actually measured.

---

## 2. Seymour (Brand Mascot & Voice)

**Seymour** is TransparentCity’s AI civic data reporter—and the **personality layer**
of the brand. Readers encounter him in newsletters, feed stories, chat, and admin
surfaces. He is not a chatbot gimmick; he is the byline.

**Full voice spec (platform repo):** `transparentcity-platform/docs/SEYMOUR_VOICE_CHARTER.md`  
If UI copy, marketing, or product text describes how Seymour writes, **defer to the charter**.
Do not resurrect the old “snarky friend over coffee” framing (em-dashes, rhetorical questions,
one-word sentences, unearned judgments).

### Who Seymour is (public-facing)

- A **civic data beat reporter**: works numbers the way a city hall reporter works sources.
- **In every city he covers**: uses neighborhood names and local context; writes as if he
  knows the blocks the data describes.
- **Rooting for cities to succeed** without cheerleading: reports wins and failures with
  equal energy because transparency is how cities get better.
- **Reference voices:** analytical rigor (FiveThirtyEight features desk), local beat texture
  (The City NYC), wire discipline (AP/Reuters)—closest to The City NYC when modes conflict.

Readers infer Seymour from the work; there is no cartoon mascot on an About page.

### Two modes (one character)

| Surface | Mode | Register |
|--------|------|----------|
| Newsletters, feed stories, story pages, bylined content | **Mode 1** | Third person. Calm, confident, specific. No “I/we”. Teaching principle required. |
| In-app chat, side panels, direct Q&A | **Mode 2** | First person OK (“I pulled the series”). Conversational but still precise. Offers next steps when helpful. |

**UI implication:** Hero copy and empty states may address the user as “you”. Do not
write Seymour’s **published** voice in first person on marketing pages unless it is
clearly labeled as chat (e.g. “Ask Seymour”).

### Teaching principle (what makes a Seymour story)

Every published story should leave the reader knowing **how to read the data**, not only
what it says—via at least one of: a reframe, a mental model, triangulation, or a named
driver / thing to watch next. If none apply, it is a chart caption, not Seymour.

### Voice rules (summary for designers & PMs)

**Hard rules (Mode 1):**

- No em-dashes / en-dashes as punctuation.
- Minimum four words per sentence (no fragments).
- No rhetorical questions.
- No unearned value judgments without a cited number in the same sentence.
- No causal claims the data does not support (including by juxtaposition in headlines).
- Only numbers from the data pipeline—never invented stats in UI or previews.

**Humor:** Rare, dry, one beat per piece—only on low-stakes “Off The Charts” findings.
Never on policy, safety, or harm. **Signoff:** `More next week. Seymour.`

**Accuracy:** Headline verbs must match what the metric counts (complaints vs arrests vs
tickets). See charter §5.5 (metric-verb lock).

### Seymour in the UI

- **Loader / accent:** Brand purple (`#ad35fa`) for Seymour analysis states; indeterminate
  progress bars often use `bg-purple-500` in side panels.
- **Labels:** “Seymour”, “Ask Seymour”, “Seymour analysis”—not “AI assistant” in product chrome.
- **Tone in chrome:** Helpful and specific; avoid hype (“magic”, “supercharge”) and faux intimacy
  (“let’s be real”, “here’s the thing”).

---

## 3. Canonical Brand Sources

| Resource | Location |
|----------|----------|
| **Design tokens (app)** | `src/app/tokens.css` |
| **Marketing tokens & patterns** | `src/app/landing.css` |
| **Bracket loader** | `src/components/Loader.css`, platform `docs/loader_mockup.html` |
| **Visual Design System** (charts, maps, spacing) | Platform `ai/static/data/Style Guide` |
| **Platform brand kit** (logo, loader details) | `transparentcity-platform/docs/BRAND_KIT.md` |
| **Seymour Voice Charter** | `transparentcity-platform/docs/SEYMOUR_VOICE_CHARTER.md` |

When in doubt: **charter + tokens.css + production UI** on transparent.city.

---

## 4. Color System

Use **CSS variables**, not raw hex, in new components. Import tokens via `tokens.css`
(global) or reference `landing.css` on marketing routes.

### 4.1 Brand & accent

| Token | Hex | Usage |
|-------|-----|--------|
| `--brand-primary` / `--bright-purple` | `#ad35fa` | Primary CTA, links, Seymour accent, bracket loader (default) |
| `--brand-primary-hover` | `#7c3aed` (app) / `#8b2cc7` (landing) | Hover states—prefer `tokens.css` value in app chrome |
| `--brand-primary-light` | `rgba(173, 53, 250, 0.1–0.15)` | Focus rings, badges, subtle fills |
| `--secondary` | `#8b5cf6` | Gradients, secondary purple |
| `--warm-coral` | `#FF6B5A` | Negative / error emphasis (charts, deltas) |
| `--spruce-green` | `#4A7463` | Positive / success emphasis (charts, civic “good” trend) |
| `--sky-blue` (style guide) | `#71B2CA` | Info / chart accent (research surfaces) |

### 4.2 Neutrals (light mode)

| Token | Hex |
|-------|-----|
| `--bg-primary` | `#ffffff` |
| `--bg-secondary` | `#f8f9fa` |
| `--bg-tertiary` | `#f3f4f6` |
| `--bg-subtle` | `#f9f9f9` |
| `--text-primary` | `#111827` |
| `--text-secondary` | `#374151` |
| `--text-tertiary` / `--text-muted` | `#6b7280` |
| `--text-on-brand` | `#ffffff` |
| `--border` / `--border-primary` | `#e5e7eb` |
| `--border-secondary` | `#d1d5db` |

### 4.3 Neutrals (dark mode)

Apply with `[data-theme="dark"]` or `.dark` on a parent (see `tokens.css`).

| Token | Hex |
|-------|-----|
| `--bg-primary` | `#0f172a` |
| `--bg-secondary` | `#1e293b` |
| `--bg-tertiary` | `#334155` |
| `--text-primary` | `#f1f5f9` |
| `--text-secondary` | `#cbd5e1` |
| `--text-tertiary` / `--text-muted` | `#94a3b8` |
| `--button-secondary-text` | `#a8b8cc` |
| `--border-primary` | `#334155` |
| `--border-secondary` | `#475569` |

**Marketing dark hero** may also use `#020617` as a deep base (`landing.css`); app dark
theme standardizes on slate tokens above.

### 4.4 Status (UI chrome)

| Token | Hex |
|-------|-----|
| `--success` | `#10b981` |
| `--warning` | `#f59e0b` |
| `--error` | `#ef4444` |

Loader semantic variants: `.loader-blue` `#3b82f6`, `.loader-green` `#10b981`,
`.loader-orange` `#f59e0b`, `.loader-white` / `.loader-black` for contrast on hero backgrounds.

### 4.5 Data & links

- Inline metric links: `#9333ea` hover `#7c3aed` (`globals.css`)
- Skip link focus: `#9333ea`

Prefer `--brand-primary` for new work; legacy purples are being aligned over time.

---

## 5. Typography

| Role | Family | Where defined |
|------|--------|----------------|
| Headings, UI labels, nav | **Inter** | `--font-heading`, `globals.css` body fallback |
| Body, dense copy, stories | **IBM Plex Sans** | `--font-body`, `landing.css` |

**Hierarchy (marketing):**

- `.page-title` — 1.75–2rem, weight 700, tight tracking
- `.section-heading` — 1.25rem, weight 600
- `.body-text` — ~0.9375rem, line-height 1.6, `--text-secondary`
- `.caption` — smaller, `--text-muted`

**Get landing / city signup** (`get-landing.module.css`): hero titles use clamp
`2rem–3rem`, weight 800; uppercase pill badges at 12px / 600 / letter-spacing 0.04em.

Load fonts the same way as existing layouts (`layout.tsx` / landing imports)—do not
introduce a third body font without design review.

---

## 6. Layout, Shape & Motion

From `tokens.css` and `landing.css`:

| Token | Value |
|-------|--------|
| `--space-xs` … `--space-2xl` | 4px → 32px |
| `--radius-sm` | 6px |
| `--radius-md` | 8px |
| `--radius` / `--radius-lg` | 12px (landing hero inputs may use 10px) |
| `--transition` | `all 0.3s cubic-bezier(0.4, 0, 0.2, 1)` or 0.15s ease on marketing |
| `--shadow-sm` … `--shadow-xl` | Elevation scale; heavier in dark mode |

**Spacing base:** 4px grid (align with platform Style Guide for larger layouts).

---

## 7. Visual Patterns (In Production)

### 7.1 Corner bracket mark

- **Favicon:** `public/favicon.svg` — bracket-only; no text.
- **Loader:** Breathing corner braces (`tc-loader`, 4s ease-in-out). Sizes: sm 24px,
  md 40px, lg 80px.
- **Rule:** Light hero / white CTAs → **purple** loader. Dark hero / navy CTAs → **white** loader.

### 7.2 Hero gradient orbs (marketing)

Soft blurred circles behind hero content (`landing.css`):

- Purple `#ad35fa`
- Blue `#3b82f6`
- Green `#10b981`

`filter: blur(40px)`, `opacity: ~0.6`, large absolute positioning—decorative only,
`pointer-events: none`.

### 7.3 Pills & badges

- **Category / hero badge:** `border-radius: 999px`, `rgba(173, 53, 250, 0.12)` background,
  `#ad35fa` text, uppercase micro-label.
- **Featured card badge:** `linear-gradient(135deg, brand-primary → brand-primary-hover)`,
  white text.

### 7.4 Cards & sections

- White cards on `--bg-secondary` sections; 2px border, lift on hover (`translateY(-4px)`).
- Featured cards: `--brand-primary` border + stronger shadow.

### 7.5 Gradients (CTAs & research)

- Primary button gradient: `135deg, var(--brand-primary), var(--brand-primary-hover)`
- Research brand: `--gradient-purple`, `--gradient-blue` in `src/app/research/brand-styles.css`

Do not add new spinner styles; extend bracket loader variants only.

---

## 8. Assets

### 8.1 Favicon

```tsx
export const metadata = {
  icons: { icon: "/favicon.svg" },
};
```

### 8.2 Logo

- Platform file: `transparentcity-platform/src/transparentcity/static/logo-black.png`
- Prefer SVG when available; maintain clear space = height of bracket mark.
- Dark-on-light logo on `#ffffff` / `--bg-primary`.

### 8.3 Bracket loader in React

- Component pattern: `src/components/Loader.css` + SVG from `loader_mockup.html`
- Props: `size="sm" | "md" | "lg"`, `variant="purple" | "white" | "blue" | …`

---

## 9. Content & Product Copy Guidelines

- Lead with **what was measured**, not what people assume happened.
- Prefer **neighborhood and district names** over vague “the city”.
- Avoid moral framing from dashboard green/red arrows; describe the metric’s configured meaning.
- Newsletters and story UI should assume **Mode 1** Seymour unless the surface is chat.
- CTA copy: clear and civic (“See your city clearly”, “Get the weekly briefing”)—not
  startup hype.

---

## 10. Checklist for New Screens

Before merging a new route or major component:

- [ ] Read this file + `tokens.css`; no new one-off hex values.
- [ ] Inter (headings) + IBM Plex Sans (body) with documented hierarchy.
- [ ] Bracket favicon; bracket loader for async states.
- [ ] Light + dark via `[data-theme="dark"]` / `.dark` where the rest of the app does.
- [ ] Seymour-labeled surfaces follow Voice Charter (link above).
- [ ] Charts/maps follow platform Style Guide.
- [ ] Hero/marketing: orb + pill patterns OR intentional deviation documented in PR.

---

## 11. Changelog

| Date | Notes |
|------|--------|
| 2026-05 | Expanded: Legibility Project vision, Seymour charter summary, production tokens from `tokens.css` / `landing.css`, UI patterns (orbs, pills, loader). |
