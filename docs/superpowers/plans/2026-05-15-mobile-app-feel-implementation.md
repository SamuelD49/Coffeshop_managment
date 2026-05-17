---
date: 2026-05-15
status: in-progress
---

# Mobile-app feel — implementation plan

## Goal

Phones use the app like a native mobile app, not a responsive desktop site. Concretely:

- Bottom tab bar (thumb reach), not hamburger
- Page = full-height screen with a sticky top app header (title + back)
- Lists render as tap-target cards on phone (tables stay on tablet/desktop)
- Forms have a sticky bottom action bar pinned above the keyboard
- Confirm dialog opens as a bottom sheet on phone
- Real touch ergonomics: 44px minimum targets, `inputmode` on number inputs, momentum scroll

Desktop is **untouched**. Everything is guarded behind `@media (max-width: 767px)` or `md:` Tailwind prefixes.

## Architecture

- **`src/views/partials/mobile-nav.ejs`** — new. Top app header (page title + optional back link) + bottom tab bar (Dashboard / Sales / Purchases / Reports / More). Tapping More opens a slide-up sheet listing secondary items (Menu, Employees, Petty cash, Payroll, Settings, Account, Logout).
- **`src/views/partials/sidebar.ejs`** — keep desktop sidebar intact. Drop the old mobile-topbar + drawer markup and JS. Include the new `mobile-nav.ejs` instead.
- **`src/middleware/locals.ts`** — set `res.locals.pageTitle` from the route so the mobile header can show it without each view passing it.
- **`public/css/app.css.src`** — new components: `.tab-bar`, `.tab-item`, `.app-header-mobile`, `.sheet`, `.sticky-actions`, `.list-card`. Hide desktop sidebar below 768px; reserve top/bottom safe areas.
- **List views (purchases, sales)** — dual-render: existing table wrapped in `.hidden md:block`; new mobile card list in `.md:hidden` block beneath it.
- **Form views (sales/new, purchases/edit, petty-cash/edit, payroll/new, employees/new, menu/new|edit)** — wrap action buttons in `.sticky-actions` so they pin to the bottom on mobile.
- **Confirm dialog** — restyle to slide up from the bottom on mobile via CSS.

## Steps

1. Plan doc (this file)
2. Locals: derive `pageTitle` from path
3. New partial `mobile-nav.ejs` + restructured `sidebar.ejs`
4. CSS additions (mobile shell + components)
5. `head.ejs` viewport-fit + theme-color
6. Convert purchases list table → dual-rendered (table + cards)
7. Convert sales list table → dual-rendered
8. Sticky-actions wrapper on key forms
9. Build CSS + tsc verify

## Non-goals

- No PWA / service worker / install prompt (separate)
- No native gesture lib (swipe back); rely on browser back
- No iOS-specific haptics beyond `navigator.vibrate` opportunism
- No per-resource detail-view redesign — only lists + form actions in this pass
