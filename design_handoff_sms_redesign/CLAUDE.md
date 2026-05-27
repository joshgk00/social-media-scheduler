# CLAUDE.md — Operating Guide for Building the Redesign

You are implementing the **Clicks & Mortar Social Media Scheduler** UI redesign inside the existing Vite + React codebase. This file tells you how to operate.

## Source of truth

For each screen you build, your sources are:

1. **`README.md`** in this handoff folder — the specification. Token values, layout descriptions, component lists, exact copy.
2. **`screenshots/`** — visual reference for every screen and state. Use these to disambiguate the spec.
3. **`design_files/`** — runnable HTML/React prototype. Open `Social Media Scheduler.html` in a browser to interact with the design (sidebar nav routes all screens; tweaks toolbar exposes theme/density/color variants).
4. **`reference/UI-UX-BRIEF.md`** — the original audit that motivated this redesign. Re-read when a design decision feels unmotivated; the brief usually explains why.

## Rules

1. **Do not lift the prototype's code wholesale.** The single-file React/JSX in `design_files/scripts/` is illustrative. The codebase has its own routing, data fetching, state management, file structure — use those.
2. **Match the codebase's conventions.** Read `src/` first. Follow file naming, component patterns, TypeScript usage, CSS approach (Tailwind/CSS modules/styled-components/whatever's there).
3. **Tokens go in first.** Before building any screen, translate `README.md → Design Tokens` into whatever the codebase uses for theming. That's the foundation. Don't hardcode `#640f0d` in components.
4. **Build the component library second.** The 20-odd primitives in `README.md → Components` (Button, Pill, Input, Modal, etc.) are reused on every screen. Build them once, in `src/components/ui/` (or wherever the codebase puts shared components), to spec — including all variants and states — before you start the first screen.
5. **Build screens in the order in `IMPLEMENTATION_PLAN.md`.** Each milestone has a definition of done. Don't skip ahead.
6. **Pixel-fidelity matters where the spec is specific.** Spacing, radii, font weights, and color values are pinned for a reason. Where the spec describes a layout in words ("4-col grid 12px gap"), match it.
7. **Copy is final.** Every visible string in `screenshots/` and the prototype is intentional copy. Replicate verbatim unless there's a reason to diverge (and surface that reason).
8. **Don't invent components or screens.** If something feels missing, check `README.md` and `screenshots/` first. The brief deliberately removes some things (e.g., the "error column" on Posts) — what's missing from the redesign vs. the old UI is often intentional.
9. **Accessibility is in `README.md`.** Implement the checklist. It's not optional.

## What this redesign does NOT touch

- Authentication backend, OAuth flows (existing)
- Database schema (existing)
- BullMQ queues, worker logic (existing)
- Bull Board itself (third-party — we just embed it cleanly)
- API contract (some endpoints might need additive fields — see `API_CONTRACT.md` for the sketch — but routes don't move)

## Workflow

For each screen:

1. Read the relevant `README.md` section and look at the matching screenshot(s).
2. Read the corresponding source file in `design_files/scripts/screens-*.jsx` for behavioral details — but **only** to understand intent, not to copy.
3. Check the existing codebase for a similar screen — if there's an old "posts list" you're replacing, find it and understand how it currently fetches data, handles routing, etc.
4. Build it in the codebase's conventions.
5. Cross-check against the screenshot. If something looks off, the screenshot is the visual tiebreaker.
6. Run the existing test suite. Add tests where the codebase already has tests for similar code.
7. Move to the next screen.

## When the spec and the codebase disagree

Pick whichever produces the better end-user experience and note the divergence in your PR. Don't silently change behavior the brief explicitly addresses (e.g., the 3,470 sessions fix in Security — that has to be the new "1 active, 3 auto-pruned" copy, not the old number).

## Theming

Dark theme is the default and what 99% of users will see. The light theme tokens are defined so the team can flip it on later — implement the CSS variable system to support both, but don't worry about polishing the light theme right now. There's no light-theme screenshot in the bundle because we haven't designed for it pixel-perfectly yet.

## Density

Compact / Regular / Roomy density is **optional** for v1. Build with Regular only. The density tokens are in the CSS; expose density as a Settings → Preferences option if it's straightforward, otherwise skip until v2.

## Tweaks panel

The Tweaks panel in the prototype (toolbar toggle) is a **design-time tool**, not a user feature. Do not port it to production.

## Bull Board

Don't try to restyle Bull Board. It's a third-party operator UI; we frame it cleanly via the wrapper page (Settings → Advanced → Worker queue inspector). Just embed its existing route in an iframe inside our wrapper page.

## Brand assets

`brand-guidelines.md` and `brand-colors.md` are the authoritative source for company identity. If the codebase has a real Clicks & Mortar logo SVG, swap it in for the `Brandmark` placeholder used in the prototype. Otherwise, keep the placeholder rounded-square with "C&M" until a logo arrives.

## Questions to ask the user (before starting)

If any of these aren't already obvious from the codebase, surface them in your first response:

- Where do design tokens live today? (Tailwind config, theme.ts, CSS variables, etc.)
- What's the routing library?
- What's the data-fetching pattern?
- Is there a component library in `src/components/` to extend, or do we start fresh?
- Are there existing tests we should mirror?
- Where is the brand logo file? (Or confirm to use placeholder.)
