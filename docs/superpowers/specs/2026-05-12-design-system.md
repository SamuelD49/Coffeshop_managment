# Buna Ledger — Design System

**Date:** 2026-05-12
**Companion to:** [`2026-05-12-coffee-shop-management-design.md`](./2026-05-12-coffee-shop-management-design.md)

> "Buna" (ቡና) is the Amharic word for coffee. This design system treats the management app as a beautifully-kept ledger sitting on the counter of a specialty café — warm, deliberate, and dignified enough to use for years.

## Philosophy in one paragraph

Every generic admin template defaults to a dark slate sidebar, drop-shadowed cards, an Inter typeface, and a single blue accent. We do none of that. The app is a paper-warm interface — cream backgrounds, an ink-dark serif for headings, a refined geometric sans for UI, and monospace for every number. Cards have hairline borders instead of shadows. The sidebar reads like the spine of a journal, with an ember-orange bookmark marking the active page. The shop's name, set in Fraunces italic, *is* the logo. Status is communicated with shape *and* colour so a colourblind owner can still read the ledger at a glance. The result feels like a tool an exacting shop owner would actually want on their counter.

---

## 1. Color tokens

A palette of warm earth tones, **not literal coffee browns everywhere** (cliché). Inspired by kiln-fired ceramic, aged ledger paper, and the embers of a *jebena*-roasting pan.

### Light theme (default)

| Token | Hex | Use |
|---|---|---|
| `ink` | `#1A1410` | Body text, primary buttons, headings |
| `coal` | `#2B221C` | Secondary text |
| `smoke` | `#7A6E62` | Meta text, labels, hints |
| `mist` | `#A89889` | Disabled text, very light meta |
| `cream` | `#F4ECDF` | Page background |
| `parchment` | `#EBE0CC` | Card surfaces, table stripe |
| `paper` | `#FAF6EE` | Alt surface, input background on hover |
| `rule` | `#1A1410` (12% alpha) | Hairline borders |
| `rule-strong` | `#1A1410` (24% alpha) | Section dividers |
| `ember` | `#C75D34` | Single accent — links, active states, primary CTAs, focus rings |
| `ember-deep` | `#9E4524` | Hover state on accent |
| `leaf` | `#5C7558` | Success / positive deltas |
| `clay` | `#B68A3C` | Warning |
| `crimson` | `#8B2A26` | Error / negative deltas |

### Dark theme (used by owner working late)

| Token | Hex | Use |
|---|---|---|
| `ink` | `#EBE0CC` | Text |
| `coal` | `#D6CAB4` | Secondary text |
| `smoke` | `#8E8273` | Meta |
| `cream` | `#181310` | Page background |
| `parchment` | `#241D17` | Cards |
| `paper` | `#2B221C` | Alt surface |
| `rule` | `#EBE0CC` (12%) | Hairlines |
| `ember` | `#E07B4C` | Accent (slightly brighter for contrast) |
| `leaf` | `#86A07F` | |
| `clay` | `#D4A861` | |
| `crimson` | `#C45550` | |

> The dark theme isn't a Plan 1 deliverable — it ships in a later polish pass. But the tokens are reserved now so we don't repaint later.

### How to wire it (Tailwind config)

Drop this into `tailwind.config.js`:

```js
module.exports = {
  content: ["./src/views/**/*.ejs"],
  theme: {
    extend: {
      colors: {
        ink:        "#1A1410",
        coal:       "#2B221C",
        smoke:      "#7A6E62",
        mist:       "#A89889",
        cream:      "#F4ECDF",
        parchment:  "#EBE0CC",
        paper:      "#FAF6EE",
        ember:      "#C75D34",
        "ember-deep": "#9E4524",
        leaf:       "#5C7558",
        clay:       "#B68A3C",
        crimson:    "#8B2A26",
      },
      borderColor: {
        rule:        "rgba(26, 20, 16, 0.12)",
        "rule-strong": "rgba(26, 20, 16, 0.24)",
      },
      fontFamily: {
        display: ['"Fraunces"', 'Georgia', 'serif'],
        sans:    ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono:    ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        smallcaps: "0.12em",
      },
      borderRadius: {
        // Almost everything is square or nearly so — radii are reserved
        sharp: "0",
        soft:  "2px",
        pill:  "9999px",
      },
    },
  },
};
```

---

## 2. Typography

Three voices, no more. Variable fonts where possible (one file, many weights/optical sizes).

| Role | Family | Notes |
|---|---|---|
| Display / headings | **Fraunces** (variable) | Use `opsz` axis: 144 for hero, 24 for section. `SOFT` axis at ~50 adds the signature "soft" terminals. Italic for the wordmark. |
| UI / body | **IBM Plex Sans** | Distinctive humanist-geometric hybrid. 400 body, 500 labels, 600 buttons. |
| Numbers / mono | **IBM Plex Mono** | Every money figure, every date, every quantity, every order-number. Tabular numerals always-on. |

All three are free from Google Fonts and have permissive licenses. For local-first behaviour, download `.woff2` files into `public/fonts/` and serve from there (no CDN dependency).

### Scale

Use these named sizes — never raw `text-xl`/`text-2xl` calls in Tailwind.

| Token | Size / line-height | Family | Use |
|---|---|---|---|
| `display-lg` | 56 / 60 | Fraunces, opsz 144 | Login page, setup, empty states |
| `display-md` | 36 / 42 | Fraunces, opsz 72 | Page title |
| `display-sm` | 24 / 30 | Fraunces, opsz 36 | Card title, section title |
| `body-lg` | 17 / 26 | Plex Sans 400 | Prose paragraphs |
| `body` | 15 / 24 | Plex Sans 400 | Default UI |
| `body-sm` | 13 / 20 | Plex Sans 400 | Meta |
| `label` | 12 / 16, tracking 0.12em, uppercase | Plex Sans 500 | Form labels, table headers |
| `button` | 13 / 16, tracking 0.06em, uppercase | Plex Sans 600 | Buttons |
| `mono-lg` | 24 / 30 | Plex Mono 500 | Big totals |
| `mono` | 15 / 24 | Plex Mono 400 | Money in tables |
| `mono-sm` | 13 / 20 | Plex Mono 400 | Compact figures |

### Loading the fonts (one-time)

Put this at the top of `public/css/app.css.src` (before the Tailwind directives):

```css
/* Self-hosted; place .woff2 files in /public/fonts/ */
@font-face {
  font-family: "Fraunces";
  src: url("/fonts/Fraunces[SOFT,WONK,opsz,wght].woff2") format("woff2-variations");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Fraunces";
  src: url("/fonts/Fraunces-Italic[SOFT,WONK,opsz,wght].woff2") format("woff2-variations");
  font-weight: 100 900;
  font-style: italic;
  font-display: swap;
}
@font-face {
  font-family: "IBM Plex Sans";
  src: url("/fonts/IBMPlexSans-Regular.woff2") format("woff2");
  font-weight: 400; font-style: normal; font-display: swap;
}
@font-face {
  font-family: "IBM Plex Sans";
  src: url("/fonts/IBMPlexSans-Medium.woff2") format("woff2");
  font-weight: 500; font-style: normal; font-display: swap;
}
@font-face {
  font-family: "IBM Plex Sans";
  src: url("/fonts/IBMPlexSans-SemiBold.woff2") format("woff2");
  font-weight: 600; font-style: normal; font-display: swap;
}
@font-face {
  font-family: "IBM Plex Mono";
  src: url("/fonts/IBMPlexMono-Regular.woff2") format("woff2");
  font-weight: 400; font-style: normal; font-display: swap;
}
@font-face {
  font-family: "IBM Plex Mono";
  src: url("/fonts/IBMPlexMono-Medium.woff2") format("woff2");
  font-weight: 500; font-style: normal; font-display: swap;
}

@tailwind base;
@tailwind components;
@tailwind utilities;
```

The Fraunces variable file is **one file** that handles every weight + italic via the `wght` and `SOFT` axes. We set `font-variation-settings: "opsz" <n>, "SOFT" 50;` on usages.

---

## 3. Spacing & rhythm

4px base. The frequently-used multiples have names so layouts stay consistent.

| Token | px | Notes |
|---|---|---|
| `gutter-tight` | 8 | Inline padding inside buttons / chips |
| `gutter` | 16 | Default gap |
| `gutter-lg` | 24 | Section-internal spacing |
| `air` | 40 | Between cards |
| `air-lg` | 64 | Between major page sections |
| `chapter` | 96 | Page top/bottom margin |

Card interior padding: `gutter-lg` (24). Page main padding: `chapter` top, `air-lg` sides. Tables row height: 56px (generous — readable from across a counter).

---

## 4. Signature components

Six small primitives. The rest of the UI is composed from these.

### 4.1 The ornament

Used as a section divider, decorative footer, sign-off line. Three small filled diamonds, evenly spaced, in `smoke`. Restrained but unmistakable.

Save as `public/img/ornament.svg`:

```svg
<svg width="56" height="8" viewBox="0 0 56 8" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
  <rect x="2" y="2" width="4" height="4" transform="rotate(45 4 4)"/>
  <rect x="26" y="2" width="4" height="4" transform="rotate(45 28 4)"/>
  <rect x="50" y="2" width="4" height="4" transform="rotate(45 52 4)"/>
</svg>
```

Used inline as:

```html
<div class="flex items-center gap-3 text-smoke my-air">
  <span class="h-px bg-rule flex-1"></span>
  <svg class="w-14 h-2"><use href="/img/ornament.svg#ornament"/></svg>
  <span class="h-px bg-rule flex-1"></span>
</div>
```

### 4.2 The paper texture

A SVG noise overlay at 2-3% opacity gives every page a faint warmth. Define once in CSS:

```css
@layer base {
  body {
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/><feColorMatrix values='0 0 0 0 0.10  0 0 0 0 0.08  0 0 0 0 0.06  0 0 0 0.6 0'/></filter><rect width='160' height='160' filter='url(%23n)' opacity='0.04'/></svg>");
    background-repeat: repeat;
  }
}
```

### 4.3 Wordmark

The shop name is the logo. No SVG file, no image — just type, set in Fraunces italic with a generous optical size.

```html
<a href="/" class="font-display italic text-display-sm text-ink" style="font-variation-settings:'opsz' 36, 'SOFT' 50;">
  <%= shopName %>
</a>
```

In the sidebar it appears at `display-sm`; in print headers it scales to `display-md`. The optical-size axis ensures it always looks intentional.

### 4.4 Buttons

```html
<!-- Primary -->
<button class="btn-primary">Save</button>

<!-- Secondary -->
<button class="btn-secondary">Cancel</button>

<!-- Destructive -->
<button class="btn-danger">Delete</button>

<!-- Quiet text-link -->
<a href="#" class="link">Forgot password?</a>
```

```css
@layer components {
  .btn-primary {
    @apply inline-flex items-center justify-center px-5 h-10 rounded-soft bg-ink text-cream
           font-sans font-semibold text-[13px] tracking-[0.06em] uppercase
           transition-colors duration-200 hover:bg-coal
           focus:outline-none focus:ring-2 focus:ring-ember focus:ring-offset-2 focus:ring-offset-cream;
  }
  .btn-secondary {
    @apply inline-flex items-center justify-center px-5 h-10 rounded-soft border border-rule-strong text-ink
           font-sans font-semibold text-[13px] tracking-[0.06em] uppercase
           transition-colors duration-200 hover:bg-paper
           focus:outline-none focus:ring-2 focus:ring-ember focus:ring-offset-2 focus:ring-offset-cream;
  }
  .btn-danger {
    @apply inline-flex items-center justify-center px-5 h-10 rounded-soft border border-crimson text-crimson
           font-sans font-semibold text-[13px] tracking-[0.06em] uppercase
           transition-colors duration-200 hover:bg-crimson hover:text-cream
           focus:outline-none focus:ring-2 focus:ring-crimson focus:ring-offset-2 focus:ring-offset-cream;
  }
  .link {
    @apply text-ember underline decoration-from-font underline-offset-4 hover:text-ember-deep transition-colors;
  }
}
```

### 4.5 Inputs

Inputs have no box. Just a hairline bottom border. Focused: 2px ember. Labels above, in label style.

```html
<label class="block">
  <span class="field-label">Username</span>
  <input name="username" class="field-input" />
  <span class="field-hint">Used to sign in</span>
</label>
```

```css
@layer components {
  .field-label {
    @apply block font-sans font-medium text-[12px] tracking-[0.12em] uppercase text-smoke mb-2;
  }
  .field-input {
    @apply block w-full bg-transparent border-0 border-b border-rule-strong px-0 py-2
           font-sans text-[15px] text-ink placeholder:text-mist
           focus:outline-none focus:border-b-2 focus:border-ember focus:pb-[7px]
           transition-colors;
  }
  .field-input.field-mono {
    @apply font-mono;
  }
  .field-hint {
    @apply block font-sans text-[12px] text-smoke mt-2;
  }
  .field-error {
    @apply block font-sans text-[12px] text-crimson mt-2;
  }
}
```

For money inputs, add `.field-mono` to the input class so figures align by glyph width.

### 4.6 Cards

No drop shadow. Hairline border, cream-tinted surface, ample padding.

```html
<article class="card">
  <header class="card-header">
    <h2 class="card-title">Today</h2>
    <p class="card-meta">Tahsas 4, 2018 EC · 12 May 2026</p>
  </header>
  <div class="card-body">…</div>
</article>
```

```css
@layer components {
  .card {
    @apply bg-parchment border border-rule rounded-soft;
  }
  .card-header {
    @apply px-gutter-lg pt-gutter-lg pb-gutter border-b border-rule;
  }
  .card-title {
    @apply font-display text-[24px] leading-[30px] text-ink;
    font-variation-settings: "opsz" 36, "SOFT" 50;
  }
  .card-meta {
    @apply font-mono text-[12px] text-smoke mt-1;
  }
  .card-body {
    @apply p-gutter-lg;
  }
}
```

(Define the `gutter*` and `air*` spacing tokens by extending `theme.spacing` in tailwind config — see the wiring section below.)

### 4.7 Status pip — shape + color

So a colorblind owner reads status without relying on hue.

```html
<span class="pip pip-open">Open</span>     <!-- ◯ ember outline -->
<span class="pip pip-closed">Closed</span> <!-- ● smoke fill -->
<span class="pip pip-approved">Approved</span><!-- ■ leaf fill -->
<span class="pip pip-draft">Draft</span>    <!-- □ smoke outline -->
```

```css
@layer components {
  .pip {
    @apply inline-flex items-center gap-2 font-sans font-medium text-[12px] tracking-[0.06em] uppercase text-smoke;
  }
  .pip::before {
    content: "";
    @apply inline-block w-2 h-2;
  }
  .pip-open::before    { @apply rounded-pill border border-ember; }
  .pip-closed::before  { @apply rounded-pill bg-smoke; }
  .pip-approved::before{ @apply bg-leaf; }
  .pip-draft::before   { @apply border border-smoke; }
}
```

---

## 5. Layouts

### 5.1 The shell (logged-in pages)

A 2-column shell, **cream sidebar, cream main** — not the typical dark sidebar / light content. The sidebar has a `rule-strong` hairline divider on its right edge so it reads as a separate column without changing color.

```
┌────────────────┬──────────────────────────────────────────────┐
│ shopName       │                                              │
│   (Fraunces    │  (chapter top padding)                       │
│    italic)     │                                              │
│ ──────────     │   page title (display-md Fraunces)           │
│                │   page meta (mono-sm smoke)                  │
│ DASHBOARD      │                                              │
│ Sales          │   ───── ornament ─────                       │
│ Menu           │                                              │
│▌Employees      │   <main content>                             │
│ Purchases      │                                              │
│ Petty Cash     │                                              │
│ Payroll        │                                              │
│                │                                              │
│ ─────          │                                              │
│ OWNER          │                                              │
│ Reports        │                                              │
│ Settings       │                                              │
│                │                                              │
│ ─────          │                                              │
│  SA            │                                              │
│  Sam Aboye     │                                              │
│  Owner         │                                              │
│  Logout        │                                              │
└────────────────┴──────────────────────────────────────────────┘
```

Key sidebar moves:
- Width: 240px.
- Top padding 40px (`air`), left/right padding 24px (`gutter-lg`).
- Section group labels (`DASHBOARD`, `OWNER`) in `label` style.
- Active link gets a 3px ember vertical bar on the left, sitting *outside* the link's text padding (looks like a bookmark sliding in from the page edge). No background fill on the active row — the bar is enough.
- User block at the bottom: a 36px square with the user's initials in Fraunces italic, name in `body-sm`, role + logout below in `body-sm smoke`.

### 5.2 Login page

A single-column centred composition. Generous whitespace.

```
                  shopName
              (Fraunces italic, display-lg, ink)

         "Welcome back to the counter"
              (display-sm, coal italic)

         ───── ornament ─────

         [ Username  ]
         [ Password  ]
         [ Sign in        →]

         Forgot password?  (link)
```

Background: `cream` with the noise overlay. The whole composition is at most ~360px wide, centred vertically. The display-lg shop name uses opsz 144 + SOFT 80 (more character at large size).

### 5.3 Setup page (first run)

Similar single-column. The headline reads "Open the ledger" (display-md). Body explains in a single sentence: "This is the first account — it has full access. Choose your owner name and credentials." Then three fields, then a primary CTA "Begin keeping" (right-arrow at end). After submit, a brief celebration: the dashboard load animation fires (see §6).

### 5.4 Dashboard

Two zones: a salutation strip + a grid of "ledger entries" (the cards).

```
Selam, Sam.                  (display-md, Fraunces italic)
Tahsas 4, 2018 EC · 12 May  (mono-sm, smoke)

───── ornament ─────

┌────────────┐ ┌────────────┐ ┌────────────┐
│ TODAY'S    │ │ PURCHASES  │ │ PETTY CASH │
│ SALES      │ │ TODAY      │ │ SPENT      │
│            │ │            │ │            │
│ Br 8,425   │ │ Br 1,200   │ │ Br 340     │
│ (mono-lg)  │ │ (mono-lg)  │ │ (mono-lg)  │
│            │ │            │ │            │
│ vs yest.   │ │ 3 entries  │ │ 5 entries  │
│ + Br 1,205 │ │ ─────      │ │            │
│ (leaf)     │ │            │ │            │
│            │ │ View →     │ │ View →     │
│ View →     │ │            │ │            │
└────────────┘ └────────────┘ └────────────┘
```

Each card: tiny label (label style, smoke) at top, the figure in `mono-lg`, then meta or delta below. A small "View →" link in ember at the bottom. The cards don't all need to be identical — one can have a sparkline, one can have a list of top items. Variety reduces the "AI grid" feeling.

For the **employee** dashboard, replace the grid with two big stacked CTAs:

```
Selam, Helen.
Morning shift · 12 May

───── ornament ─────

┌──────────────────────────────────┐
│  START NEW SHIFT          →      │  (ink button, full-width, 56px tall)
└──────────────────────────────────┘
┌──────────────────────────────────┐
│  MY PAST SHIFTS           →      │  (parchment, hairline border)
└──────────────────────────────────┘
```

### 5.5 Settings

A single column of sections, each section preceded by a small caps `label` heading and a `rule-strong` underline. No tabs — settings is short enough to scroll. Sections from top:

1. **Shop** — name, address, phone, logo upload.
2. **Money** — currency code, symbol, decimal places.
3. **Payroll** — default percentages.
4. **System** — timezone, business-day cutoff.

The Save button is sticky at the bottom of the viewport when scrolled past — a hairline-edged bar with `Save settings` on the right. (HTMX or a tiny script can toggle a class based on scroll.)

### 5.6 Account

The smallest page. Two cards stacked: "Who you are" (full name, role, member-since date) and "Change password" (current, new, button).

### 5.7 Reusable details (preview of plans 2–5)

- **Daily Sales entry**: a long table of menu items. Each row is 56px tall. Far-right column is the running line total in `mono`. As the cashier types `qty`, the total flashes ember-on-cream for 600ms then settles to ink (HTMX out-of-band swap). Bottom of the page: a sticky footer with Cash, Bank, Computed Difference (in `leaf` or `crimson`) and a "Close shift" `btn-primary`.
- **Employee profile**: tabs along the top in label style — only the active tab has the ember underline. Profile photo at top-left as a 96px square (no avatar circle clichés). Personal info as a definition list with mono values where applicable (phone numbers, dates).
- **Payroll sheet**: the whole table is set in mono. Headers in label style. Snapshot rates appear in italic small caps with a hairline tooltip-on-hover explaining "Pension rates captured 12 May 2026 for this run." Print stylesheet hides the sidebar and renders the table to fill the page.

---

## 6. Motion

Three signature moves. Everything else uses CSS `transition: colors 200ms ease`.

### 6.1 Page load — staggered reveal

On every full page load, three regions fade-up by 8px in 320ms, staggered by 80ms: header, ornament, content. No JavaScript needed.

```css
@layer components {
  .reveal { opacity: 0; transform: translateY(8px); animation: reveal 320ms cubic-bezier(0.2, 0.6, 0.2, 1) forwards; }
  .reveal-1 { animation-delay: 0ms; }
  .reveal-2 { animation-delay: 80ms; }
  .reveal-3 { animation-delay: 160ms; }
  @keyframes reveal {
    to { opacity: 1; transform: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .reveal, .reveal-1, .reveal-2, .reveal-3 { animation: none; opacity: 1; transform: none; }
  }
}
```

Apply `class="reveal reveal-1"` to the page title row, `reveal reveal-2` to the ornament, `reveal reveal-3` to the main content block.

### 6.2 Number flash (HTMX updates)

When a total updates via HTMX, give it a brief ember flash so the eye finds the change without it being jumpy.

```css
@layer components {
  .num-flash {
    animation: num-flash 600ms ease-out;
  }
  @keyframes num-flash {
    0%   { background-color: rgba(199, 93, 52, 0.18); }
    100% { background-color: transparent; }
  }
}
```

The HTMX response includes `class="num-flash"` on the swapped element; the class will be re-applied on each update because the element is replaced.

### 6.3 Sidebar bookmark

Active link transition. When clicking a new link, the ember bar slides via `transition: opacity 150ms`. (We don't try to physically slide it between rows — too fiddly with EJS partials; fade is enough.)

---

## 7. The Ethiopian calendar touch (signature detail)

The dashboard salutation and the date in card metas show **both** the Ethiopian (Geez) calendar date and the Gregorian, separated by a hairline middot. The Ethiopian calendar is 7–8 years behind Gregorian, has 13 months, and is the calendar Ethiopians use in daily life.

```
Tahsas 4, 2018 EC · 12 May 2026
```

Implementation: a tiny pure-function helper `formatEthiopianDate(d)` in `src/lib/dates.ts`. We add a third returned format alongside the existing `businessDate`. No external library needed — the algorithm is ~30 lines.

This is **off by default** and toggled in Settings (`show_ethiopian_calendar`). The conversion uses the Amete Mihret epoch and the standard Beyene-Kudlek algorithm. Test cases in `tests/dates.test.ts`.

This is the unforgettable touch. No generic admin template would do this — and it tells every Ethiopian shop owner who opens the app: *this was built for me*.

---

## 8. Applying to Plan 1 — what changes

The implementation plan already lays out the files. With this design system, several Plan 1 tasks expand or change. The diffs are minor; mostly we swap class strings and add a few CSS rules. Concretely:

**Task 1 — `package.json`**: no change.

**Task 2 — Tailwind config**: replace the minimal `tailwind.config.js` with the version in §1 (tokens) including `theme.extend.spacing`:

```js
spacing: {
  "gutter-tight": "8px",
  "gutter":       "16px",
  "gutter-lg":    "24px",
  "air":          "40px",
  "air-lg":       "64px",
  "chapter":      "96px",
},
```

**Task 2 — `app.css.src`**: include the `@font-face` block (§2), the `body` paper-texture rule (§4.2), and a `@layer components` block with `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.link`, `.field-label`, `.field-input`, `.field-hint`, `.field-error`, `.card`, `.card-header`, `.card-title`, `.card-meta`, `.card-body`, `.pip`, `.pip-*`, `.reveal*`, `.num-flash`.

**New asset task** (insert as Task 2a): download `.woff2` files for Fraunces, IBM Plex Sans (400/500/600), IBM Plex Mono (400/500) into `public/fonts/`. Add `public/img/ornament.svg`.

**Task 11 — `partials/head.ejs`**: add `<body class="bg-cream text-ink font-sans antialiased">` and link `/css/app.css`.

**Task 11 — `partials/sidebar.ejs`**: rewrite per §5.1 layout — cream background, group labels in `label` style, active link gets the `bookmark` modifier (a `::before` ember bar), user block at bottom with initial-square in Fraunces italic.

**Task 11 — `partials/ornament.ejs`** *(new partial)*: just renders the SVG ornament between two hairlines, for use between page header and content.

**Task 13 — `setup.ejs`**: rewrite per §5.3 — display-md headline "Open the ledger," three `.field-*` inputs, `.btn-primary` saying "Begin keeping →".

**Task 14 — `login.ejs`**: rewrite per §5.2 — centred shop wordmark + display-sm italic tagline + ornament + two fields + `.btn-primary`.

**Task 15 — `dashboard.ejs`**: rewrite per §5.4 — salutation, ornament, three cards using the `card` component. For employees, the two stacked CTAs.

**Task 16 — `settings/index.ejs`**: keep the data wiring but rewrite sections per §5.5, using `.field-*` and `.card`. Add the sticky save bar.

**Task 17 — `account.ejs`**: rewrite per §5.6.

**Task 18 — happy-path test**: assertion text changes from `"Bunna Café"` → still works (we assert on the shop name string, not the visual chrome).

Estimated added effort: **+30–40 minutes per view task** (≈ 3 extra hours total) to apply the design system properly. Worth it.

---

## 9. What we're not doing (anti-patterns)

Spelled out so subagents don't drift:

- ❌ No dark slate sidebar.
- ❌ No drop shadows on cards.
- ❌ No purple, no Tailwind `blue-500`, no Material design defaults.
- ❌ No Inter / Roboto / system font.
- ❌ No rounded-2xl cards. Almost everything is sharp (radius 0 or 2px).
- ❌ No emoji in UI chrome (status, labels). Pip glyphs are CSS-drawn shapes.
- ❌ No "Welcome back!" with an exclamation mark. The tone is calm and observational.
- ❌ No gradient backgrounds, no glassmorphism.
- ❌ No "data-viz" pie charts on the dashboard. If a chart appears in Plan 6 Reports, it's a single-line sparkline in mono.
- ❌ No coffee-bean illustrations, no steaming cup icons. The coffee identity is **typographic and chromatic**, never literal.

---

## 10. Quick-reference one-page cheatsheet

| Need a… | Use |
|---|---|
| Page wrapper | `<body class="bg-cream text-ink font-sans antialiased">` |
| Page title | `<h1 class="font-display text-[36px] leading-[42px]" style="font-variation-settings:'opsz' 72,'SOFT' 50">…</h1>` |
| Section divider | `<%- include('partials/ornament') %>` |
| Card | `.card / .card-header / .card-title / .card-meta / .card-body` |
| Primary button | `.btn-primary` |
| Cancel button | `.btn-secondary` |
| Delete | `.btn-danger` |
| Money | `<span class="font-mono">Br 8,425.00</span>` |
| Field label | `.field-label` |
| Field input | `.field-input` (+ `.field-mono` for money) |
| Status | `<span class="pip pip-open">Open</span>` |
| Reveal on load | `.reveal .reveal-{1\|2\|3}` |
| Number flash on HTMX swap | `.num-flash` |
