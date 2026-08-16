---
version: alpha
name: conciv.dev
description: Design language for the conciv marketing site — a ruled, paper-and-ink developer-tool page where product screenshots carry the argument.
colors:
  paper: oklch(0.985 0.006 75)
  ink: oklch(0.23 0.012 65)
  muted: oklch(0.52 0.014 65)
  line: oklch(0.9 0.008 75)
  panel: oklch(0.995 0.004 75)
  accent: oklch(0.6 0.207 27)
  accent-soft: oklch(0.6 0.207 27 / 0.12)
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
    lineHeight: 1.16
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
rules carry the hierarchy; there is no decorative surface. The structure and measurements are
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

| Token       | Light                      | Dark                      |
| ----------- | -------------------------- | ------------------------- |
| paper       | oklch(0.985 0.006 75)      | oklch(0.19 0.008 65)      |
| ink         | oklch(0.23 0.012 65)       | oklch(0.94 0.006 75)      |
| muted       | oklch(0.52 0.014 65)       | oklch(0.68 0.012 70)      |
| line        | oklch(0.9 0.008 75)        | oklch(0.31 0.01 65)       |
| panel       | oklch(0.995 0.004 75)      | oklch(0.23 0.009 65)      |
| accent      | oklch(0.6 0.207 27)        | oklch(0.7 0.19 32)        |
| accent-soft | oklch(0.6 0.207 27 / 0.12) | oklch(0.7 0.19 32 / 0.16) |
| pass        | oklch(0.62 0.16 150)       | oklch(0.74 0.16 152)      |

## Typography

Six sizes carry the page — 13 (caption, mono, eyebrow), 14 (nav links, buttons, tabs), 16 (body,
hero sub), 17 (h3, serif), 26 (h2, serif), 48 (h1, serif italic). Add a seventh only by changing
this document. `display` is italic at `h1` and upright at `h2`/`h3`. `mono` is for commands, code,
eyebrows, ledger values, and step numerals — never for body prose. Headings use `text-wrap: balance`,
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
hover; on hover/focus-within an info bar (32px, background 95% paper, top border in the accent) slides
up from the bottom over 100ms `cubic-bezier(0.4, 0, 0.2, 1)` and the frame border tints toward the
accent; reduced motion drops the slide. Ours adds a lightbox (shadcn Dialog) on click; Zed links out.

## Components

Every visible element is sourced from a component registry (21st.dev, smoothui.dev, kokonutui.com,
shadcn) and adapted to these tokens: tokens, copy, and sizing change; the component's own motion,
hover behaviour, structure, and accessibility stay as shipped. Hand-written code is reserved for the
ruled layout containers described in Layout, and for copy. The provenance table in the landing spec
records element → registry item → adaptation → file.

Page-level entrance animation is not used: server-rendered content must be visible before hydration,
so no element may depend on an IntersectionObserver or a mount effect to become visible. The product
frame paints a static poster on the server and crossfades to the live demo once the demo has mounted;
the poster and the demo share the same box so nothing shifts.

## Do's and Don'ts

- Do not recolour product screenshots.
- Do not add a second accent surface.
- Do not add a gradient, glow, or blur to the page background.
- Do not put content in a grid gap; put it in a ruled cell.
- Do not add a seventh type size or an off-scale spacing value.
