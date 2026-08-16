---
version: alpha
name: conciv.dev
description: Design language for the conciv marketing site: a ruled, paper-and-ink developer-tool page where product screenshots carry the argument.
colors:
  paper: oklch(0.985 0.006 75)
  ink: oklch(0.23 0.012 65)
  muted: oklch(0.52 0.014 65)
  line: oklch(0.9 0.008 75)
  panel: oklch(0.995 0.004 75)
  accent: oklch(0.58 0.207 27)
  accent-soft: oklch(0.58 0.207 27 / 0.12)
  accent-ink: oklch(0.99 0 0)
  pass: oklch(0.62 0.16 150)
typography:
  sans:
    fontFamily: Geist Variable
  display:
    fontFamily: Newsreader Variable
    letterSpacing: -0.02em
  mono:
    fontFamily: JetBrains Mono Variable
  h1:
    fontFamily: Newsreader Variable
    fontSize: clamp(34px, 3.4vw, 48px)
    lineHeight: 1.2
    fontWeight: 400
    fontStyle: italic
    letterSpacing: -0.02em
  h2:
    fontFamily: Newsreader Variable
    fontSize: 26px
    lineHeight: 32px
    fontWeight: 400
    letterSpacing: -0.015em
  h3:
    fontFamily: Newsreader Variable
    fontSize: 17px
    lineHeight: 24px
    fontWeight: 400
  body:
    fontFamily: Geist Variable
    fontSize: 16px
    lineHeight: 24px
    letterSpacing: -0.01em
  ui:
    fontFamily: Geist Variable
    fontSize: 14px
    lineHeight: 20px
  caption:
    fontFamily: Geist Variable
    fontSize: 13px
    lineHeight: 20px
  eyebrow:
    fontFamily: JetBrains Mono Variable
    fontSize: 13px
    lineHeight: 20px
    letterSpacing: 0.16em
rounded:
  base: 0.625rem
spacing:
  unit: 8px
  scale: [8, 16, 24, 32, 48, 64, 96]
---

## Overview

conciv.dev presents a developer tool that runs on the reader's own machine. The page argues with
product evidence: dark product windows sitting on light paper, separated by hairline rules. Type and
rules carry the hierarchy. The page carries exactly one non-structural surface, the hero backdrop
shader, and it is capped and budgeted in "Hallmark exceptions" below; everywhere else the rule holds
that nothing decorative is added. The structure and measurements are
derived from zed.dev at 1440×900 (1120px ruled column, 112px gutter columns, six type sizes) and
mapped onto our own faces and tokens.

## Colors

`accent` is the only saturated colour. Spend it on eyebrow labels, the spark mark, one primary
button, link hover, step numerals, and the focus/selection/caret affordances that already map to it.
Do not introduce a second accent surface. `muted` is the body colour for secondary prose; `ink` is
reserved for headings and primary copy.

Product screenshots are always dark windows and are never recoloured. On paper they sit directly on
the background inside a 1px `line` border; in dark mode they take a 1px `line` keyline over a 4px
`panel` matte so the window still reads as an object.

## Themes

| Token       | Light                       | Dark                      |
| ----------- | --------------------------- | ------------------------- |
| paper       | oklch(0.985 0.006 75)       | oklch(0.19 0.008 65)      |
| ink         | oklch(0.23 0.012 65)        | oklch(0.94 0.006 75)      |
| muted       | oklch(0.52 0.014 65)        | oklch(0.68 0.012 70)      |
| line        | oklch(0.9 0.008 75)         | oklch(0.31 0.01 65)       |
| panel       | oklch(0.995 0.004 75)       | oklch(0.23 0.009 65)      |
| accent      | oklch(0.58 0.207 27)        | oklch(0.7 0.19 32)        |
| accent-soft | oklch(0.58 0.207 27 / 0.12) | oklch(0.7 0.19 32 / 0.16) |
| accent-ink  | oklch(0.99 0 0)             | var(--od-paper)           |
| star        | oklch(0.78 0.16 85)         | oklch(0.84 0.15 88)       |
| pass        | oklch(0.62 0.16 150)        | oklch(0.74 0.16 152)      |

The light accent sits at lightness 0.58 rather than 0.60. At 0.60 white text on an accent fill
measures 4.25:1 and fails AA; 0.58 is the highest lightness that clears 4.5:1 on all three of the
readings we actually ship.

## Accent contrast

Every accent fill takes `accent-ink` as its text colour, never a literal white and never `ink`.
`--primary-foreground` points at `--od-accent-ink` in both themes, so a shadcn component that fills
with `primary` gets the right foreground without a local override. Measured with the sRGB relative
luminance formula against the OKLCH token values (`scratchpad/contrast.mjs`), 2026-08-16:

| Pair                               | Ratio         | Needs | Verdict |
| ---------------------------------- | ------------- | ----- | ------- |
| accent-ink on accent, light        | 4.62          | 4.5   | pass    |
| accent text on paper, light        | 4.55          | 4.5   | pass    |
| accent text on panel, light        | 4.68          | 4.5   | pass    |
| accent-ink (paper) on accent, dark | 6.38          | 4.5   | pass    |
| accent text on paper, dark         | 6.38          | 4.5   | pass    |
| accent text on panel, dark         | 5.84          | 4.5   | pass    |
| muted on paper, light / dark       | 5.29 / 6.40   | 4.5   | pass    |
| ink on paper, light / dark         | 16.19 / 15.49 | 4.5   | pass    |

Do not raise the light accent back to 0.60 without re-running the measurement: the first three rows
all drop below 4.5 together.

## Hallmark exceptions (Zed DNA, owner-approved)

The page is audited against the Hallmark slop-test gates. The following gates are knowingly not met,
because meeting them would break the zed.dev structure the owner asked for. Each one is a decision,
not an oversight.

- **Italic h1** (gate 38a). The whole h1 is Newsreader italic. Hallmark's literal fix is roman.
  Zed's display face is italic serif, and the italic is the page's one special typographic register.
- **Centred hero** (gate 6). Eyebrow, h1, lede and action row all share the page axis. Hallmark asks
  for an offset. Zed's hero is centred, and the install command reads as the page's one action.
- **Ruled grid lines and node markers** (decorative-lines gate). Vertical rules at the column and
  page edges with 7px rotated-square nodes at every intersection. This is the load-bearing device of
  the whole layout, not decoration.
- **Browser chrome on the product frame** (gate 47). Hallmark wants the raw capture. The frame reads
  as a running app on localhost, which is the claim the page is making, so the chrome stays.
- **Nav and footer fingerprint** (gates 42 and 43). Two nav destinations and a compact footer index
  are both flagged as thin. They are deliberate: this is a two-page site plus docs.
- **6px dashed mat and 2px radius** (gate 24). Off the 8px scale. Measured directly from zed.dev's
  feature tiles on 2026-08-16 at 1440x900 and reproduced rather than invented. These, plus the 10px
  radius the code and terminal panels inherit from the registry components, are the only off-scale
  values on the page.
- **Hero shader** (gates 23, 29 and 45). A WebGL julia isoline field runs behind the hero copy.
  Measured visible accent footprint 6.0% of the hero band in light and 7.3% in dark, above Hallmark's
  5% cap for abstract accent. Budget: DPR 1 backing store, 24fps cap, low-power context, paused by
  IntersectionObserver when scrolled out and by `visibilitychange` when the tab hides, a single
  static frame under reduced motion, `aria-hidden`, and `display: none` below 768px.
- **No macrostructure stamp comment** (gate 20). The repo lints comments out of source and the
  autofix deletes them, so the stamp cannot survive in `app.css`. This document is the stamp.

## Hero padding

The hero band is 88px top and 88px bottom (`py-16 md:py-22`), which measures 500px tall at 1440x900
against Zed's 502px. Zed's own padding is roughly 127/125, but their hero stack is shorter than ours
(no package-manager tabs, no install command). Matching their band height matters more than matching
their padding number, so the padding is smaller and symmetric.

## Motion

Two curves, one ladder of durations. Nothing on the page invents its own.

- `--od-ease-out: cubic-bezier(0.23, 1, 0.32, 1)` for every entrance, hover and state change.
- `--od-ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)` for the one looping pulse only.
- 160ms: hover and colour responses, including the media-frame label and the theme toggle.
- 200ms: the tab indicator, and the brand mark's hover.
- 250ms: the magic-move command morph, stagger 0.
- 500ms: the product-frame poster crossfade.
- Star hover: 280ms in, 150ms out, with the count bump and the "+1" delayed 100ms.

Every one of these is dropped or zeroed under `prefers-reduced-motion: reduce`.

## Touch targets

Visible chrome keeps its Zed proportions (32px nav controls, 36px command row). `.od-hit` adds a
centred pseudo-element sized `max(100%, 44px)` under `@media (pointer: coarse)`, so coarse pointers
get a 44px target without any control growing on a mouse.

## Typography

Six sizes carry the page: 13 (caption, mono, eyebrow), 14 (nav links, buttons, tabs), 16 (body,
hero sub), 17 (h3, serif), 26 (h2, serif), 48 (h1, serif italic). Add a seventh only by changing
this document. `display` is italic at `h1` and upright at `h2`/`h3`. Serif appears in exactly four
places and nowhere else: `h1`, `h2`, `h3`, and the how-it-works step numerals (a plain
`span` set at `h2` size, since the step's title carries the heading). `h3` stays serif at 17px even though a review flagged it as diluting the
display register: zed.dev's own feature-tile `h3` is serif at 16.8px, and that is the register we are
translating. `mono` is for commands, code,
eyebrows and ledger values, never for body prose. Headings use `text-wrap: balance`,
paragraphs `text-wrap: pretty`. Numbers are `tabular-nums`.

## Brand

- Wordmark: `BrandMark` (`src/components/brand-mark.tsx`) = red four-point spark (`SparkMark`, lucide `Sparkle`, `fill-current`, `text-primary`) + "conciv" in the UI sans (Geist Variable) 16px / 700 / tracking -0.02em, `leading-none`, one baseline.
- Mark size 0.75em (12px at 16px), nudged `translate-y-[0.09em]` so its centre sits on the x-height centre of "conciv" (measured 28.44 vs 28.39 at 1440; keep within +/-0.5px when the font changes).
- Used in the landing nav, footer, docs layout header (`lib/layout.shared.tsx`) and not-found (via `HomeLayout`); the OG image renders the wordmark text only (satori, no mark).
- Hover: the whole link is the trigger (`group`); the mark rotates 4deg and scales 1.04 over 200ms `--od-ease-out`; none under reduced motion. Never a spin, wobble or colour change.

## Layout

One ruled grid governs the nav, every section, and the footer: a 1120px column (`.od-col`) centred
inside 112px gutter columns (`.od-page`), with 1px `line` rules on both edges of the column and both
edges of the page. Text sits 48px inside the column (`.od-inset`); product frames and figure grids run
flush to the column rules, the way zed.dev sets its product shots. Below 1360px the gutter columns
collapse and the inset falls to 32px; below 768px the vertical rules are dropped and the inset falls
to 24px, then 16px.

Sections are separated by a full-width 1px rule (`.od-ruled`) carrying a 7px rotated-square node at
each intersection with a vertical rule. Grids inside a section use cell rules (`divide`), never gaps
of empty space. Vertical rhythm is on the 8px scale: 96px between the nav and the h1, 64px section
padding, 48px inside cells, 16px between a title and its body.

## Elevation & Depth

Nothing on the page carries a shadow. Product frames and figures are border-only objects: 1px `line`,
no shadow, no ring. Buttons use the registry component's own inset shadow where it ships one.

Screenshot figures use the mat measured on zed.dev's feature tiles (2026-08-16, 1440×900): cell
padding 40px 48px; a 1px dashed `line` mat drawn 6px outside the image frame (`-m-1.5 p-1.5`); the
image frame is a 1px solid `line` border, 2px radius, `overflow: clip`, no shadow, no scale or lift on
hover. The whole tile is one button. On hover (fine pointers only) or keyboard focus, a decorative
32px label bar (background 95% paper, top border in the accent) slides up from the bottom over 160ms
`--od-ease-out` and the frame border tints toward the accent; reduced motion drops the slide. Ours
opens a lightbox (shadcn Dialog) on click; Zed links out.

## Components

Every visible element is sourced from a component registry (21st.dev, smoothui.dev, kokonutui.com,
shadcn) and adapted to these tokens: tokens, copy, and sizing change; the component's own motion,
hover behaviour, structure, and accessibility stay as shipped. Hand-written code is reserved for the
ruled layout containers described in Layout, for copy, and for the short list of elements no registry
supplies (the brand mark, the media-frame mat, the hero shader, the poster crossfade, the step rows
and the touch-target helper). Every one of those carries its justification in the provenance table in
the landing spec, which records element → source → adaptation or justification → file. If a component
is adopted and then reduced past the point where its structure is recognisable, the table says
hand-written and names the starting point; it does not keep claiming the registry item.

Page-level entrance animation is not used: server-rendered content must be visible before hydration,
so no element may depend on an IntersectionObserver or a mount effect to become visible. The product
frame paints a static poster on the server and crossfades to the live demo once the demo has mounted;
the poster and the demo share the same box so nothing shifts.

## Do's and Don'ts

- Do not recolour product screenshots.
- Do not add a second accent surface.
- Do not add a gradient, glow, or blur to the page background.
- Do not put content in a grid gap; put it in a ruled cell.
- Do not add a seventh type size or an off-scale spacing value. The 6px mat, the 2px frame radius
  and the 10px panel radius are the only exceptions, and they are argued above.
- Do not put a literal colour in a component. Every accent fill takes `accent-ink`; every duration
  takes one of the values in Motion; every curve takes one of the two eases.
