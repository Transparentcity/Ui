## TransparentCity Brand Kit (Frontend Reference)

This is the **frontend-facing brand reference** for `transparent.city`.
Use this together with the shared backend style guide when designing
new React/Next.js pages in `transparentcity-ui`.

---

## 1. Canonical Brand Sources

- **Primary Visual Design System** (tokens, components, maps, charts)  
  Source file (backend repo):  
  `transparentSF/ai/static/data/Style Guide`

- **Platform Brand Kit** (logo, favicon, loader)  
  Source file (platform repo):  
  `transparentcity-platform/docs/BRAND_KIT.md`

When in doubt, match:

1. The explicit rules in those two documents, then  
2. Existing production UI in TransparentCity/TransparentSF.

---

## 2. Assets to Use in React

### 2.1 Favicon

- File: `public/favicon.svg`  
- Usage in `app/layout.tsx` (Next.js App Router):

```tsx
export const metadata = {
  icons: {
    icon: '/favicon.svg',
  },
};
```

Do not introduce alternative favicons; the bracket mark is the canonical icon.

### 2.2 Logo

- Primary logo asset lives in the platform repo:  
  `transparentcity-platform/src/transparentcity/static/logo-black.png`

When you need a logo in the React app:

- Prefer importing a **vector/SVG** once available.
- Until then, reference a web-accessible PNG served by the backend or copied
  into `public/` with a clear name (e.g. `transparentcity-logo-dark-on-light.png`).
- Keep clear space equal to the height of the bracket mark around the logo.

---

## 3. Bracket Loader in React

For loading states in React:

- Prefer the **bracket loader** described in  
  `transparentcity-platform/docs/loader_mockup.html`.
- Two canonical sizes:
  - Small (24px) – inline in buttons/text.
  - Large (80px) – full-page or panel overlays.

Implementation guidance:

- Wrap the SVG markup from `loader_mockup.html` in a small React component,
  e.g. `src/components/BracketLoader.tsx`.
- Expose props like `size="sm" | "lg"` and `variant="purple" | "white" | "dark"`.
- Reuse the same CSS class names (`tc-loader`, `tc-loader-sm`, `tc-loader-lg`,
  `loader-purple`, etc.) so behavior matches across repos.

---

## 4. Colors & Typography (Quick Frontend Summary)

- **Primary accent**: `#ad35fa` (`--bright-purple`)  
- **Error / negative**: `#FF6B5A` (`--warm-coral`)  
- **Success / positive**: `#4A7463` (`--spruce-green`)  
- **Text**:
  - `--text-primary`: `#111827` (landing) / `#222222` (apps)
  - `--text-secondary`: `#6b7280`
- **Backgrounds (light)**:
  - `--bg-primary`: `#ffffff`
  - `--bg-secondary`: `#f8f9fa`
  - `--bg-tertiary`: `#f3f4f6`
- **Backgrounds (dark landing)**:
  - Base: `#020617`
  - Nav/section borders: `#1f2937`

Typography:

- **Headings / labels**: Inter  
- **Body content**: IBM Plex Sans  

Homepage loader guidance:

- On the **light hero / CTA** sections, use the **purple loader** variant.
- On **dark hero / CTA** sections (dark-mode or dark marketing surfaces),
  use the **white loader** variant for contrast.

Keep the actual font stacks and sizing consistent with the backend style guide.

---

## 5. Checklist for New React Screens

Before merging a new screen or template:

- [ ] Consult this file **and** the backend Visual Design System.
- [ ] Use the bracket favicon and, where needed, the branded bracket loader.
- [ ] Use design tokens (CSS variables or a theme object), not raw hex values.
- [ ] Use Inter + IBM Plex Sans with the documented sizing hierarchy.
- [ ] Respect light/dark modes where appropriate.


