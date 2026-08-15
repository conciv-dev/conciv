# conciv.dev landing — critique of `feat/landing-redesign` @ e7b377ad

Date: 2026-08-16. Method: own Chromium (Playwright 1.61), `http://localhost:3009`, 1440×900 and
390×844, light + dark, DPR 2, `domcontentloaded` + fonts-loaded (never `networkidle` — the live
widget's SSE never idles). Geometry read from `getBoundingClientRect()` + `getComputedStyle`, not
eyeballed. Reference: zed.dev captured the same way, measured in
`scratchpad/zed-ref/ZED-MEASURED.md`.

Verdict: the structure is right; the execution is not. The page reads as assembled, not designed —
a centred text block, then a black rectangle, then three left-aligned lists. Nothing is on a grid,
the type scale has thirteen sizes, and the hero's primary action is visibly off-axis. Below, per
section, with numbers.

## P0 — first paint

1. **The product frame is an empty 16:10 black box for seconds.** `useIsMobile()` is `undefined`
   on the server, so `ProductFrame` renders _neither_ branch: SSR ships an empty
   `<div class="aspect-[16/10]">` (measured 1112×695 at y=647). Content only appears after
   hydration → lazy chunk → local model boot. Measured: at +2 s the box is empty; at +4 s
   `innerHTML.length = 12481`. The centrepiece of the page is a hole on load.
2. **The hero's action row is not one row.** `InstallCommand` renders a 2-line block (pm tab strip
   above the command line) and `TryLiveButton` is a 1-line pill; `flex items-center` centres the
   pill against the _block_, so the pill floats between the tab strip and the command. Worse, the
   group is centred as a whole, so the command line's centre lands at x≈598 while the h1's centre
   is x=720 — the primary action is 122 px off the page axis.
3. **Type scale: 13 sizes.** Measured in use: 68 / 40 / 19 / 18 / 17 / 15 / 14 / 13.5 / 13 / 12.5 /
   12 / 11.5 / 11 px. zed.dev uses six (13 / 14 / 15 / 16 / 16.8 / 25.6 / 48). `13.5px` and
   `11.5px` are arbitrary. The h1 at 68 px is 42 % larger than zed's 48 px and wraps to two lines,
   which is what makes the fold feel empty.
4. **Spacing is not on an 8px grid.** In the landing components alone: `mb-5` (20), `mb-2.5` (10),
   `mt-1.5` (6), `pl-3.5` (14), `p-[3px]`, `mb-3.5` (14), `py-[18px]`, `gap-2.5` (10),
   `px-1.5 py-0.5` (6/2). Roughly a third of the spacing values are off-grid.

## Nav

- Nav content spans x=162..1278; section content spans x=163..1277. One gutter, two values — the
  nav is 1 px wider on each side because it is _outside_ `.od-container`, whose `border-inline`
  eats 1 px. The vertical column rules therefore begin _below_ the nav instead of running through
  it (zed runs them from y=0 through the nav and the whole page).
- No rule above the footer; the ruled column simply stops.

## Hero

- Frame top edge at y=647 of a 900 px viewport: only 253 px of the product is above the fold
  (zed: frame top y≈640 of a 770 px-tall frame, but zed fills its fold with a _readable_ product
  shot, not a black box).
- `pt-[72px] pb-10` + frame `mt-10` = 112 px of dead space between the action row and the frame.
- Sub-headline measures 620 px wide at 18 px — ~78 characters per line, past the 45–75 comfort
  band.

## Principles strip

- Three columns, `gap-8`, no vertical rules between them, `text-[15px]` title over `text-[14px]`
  body. zed's equivalent strip uses column rules and 15/13 with the cells being real grid cells.
  Ours reads as three floating paragraphs with a big empty band above and below (`py-16` on both
  sides of a 91 px content block).

## Capabilities

- **Row-C figure is a light screenshot in a grid of dark ones** (`any-running-app.webp`), breaking
  the spec's own "product imagery is always a dark window" rule. It also reads as a different
  product.
- **Row-B figures are unreadable.** 350×197 renderings of 1160×726 masters: the UI text inside is
  ~3 px tall. They are texture, not evidence.
- **Captions have ragged bottoms.** `figcaption` heights 68.5 / 68.5 / 68.5 / 68.5 / 47.5 px — the
  row-C caption is one line where every other caption is two, so the last row's rhythm breaks.
- Figures sit in bare grid tracks with no cell rules, so the 32 px gutters read as accidental
  whitespace rather than as a grid.
- (Known, other lane: every widget screenshot carries a magenta accent that clashes with the red
  `--od-accent`. Red re-shoots are in flight; not fixed here.)

## How it works

- The `56px` red numeral column and the content column are separated by `gap-6`, but the numeral's
  optical left edge is 1 px inside the section gutter while every h2/eyebrow above it starts at
  x=163 — the numerals do not share the page's left edge with anything.
- Step 3's `fab-closed.webp` figure renders at 120×90 next to a 320 px terminal block: two
  unrelated object sizes in one row, neither aligned to the other's baseline.
- The terminal block is capped at `max-w-[320px]` while step 2's snippet panel is full width —
  the three steps have three different content widths.

## Open source ledger

- `h2` "Open source, on your machine." is dropped into a 537 px column and wraps to **three lines**
  at 40 px (measured height 169.5 px). At 26 px it would be two.
- The star value rendered `—` on a cold load (client fetch had not resolved) while the nav showed
  `4` — the same datum, two states, visible simultaneously.

## Footer

- Full-bleed dark bookend with hard-coded `oklch(...)` literals in six places instead of tokens
  (`text-[oklch(0.85_0.008_75)]`, `border-[oklch(0.31_0.01_65)]`, …). Not themeable, not auditable.
- `py-[18px]` bottom bar, `pt-14`/`pb-10` top block: three off-grid values in one component.

## What is actually working

- The copy is honest and specific, and it obeys the truth rules — that part of the previous pass is
  good and is kept verbatim where possible.
- Newsreader italic for the h1 and self-hosted JetBrains Mono are the right calls; the palette
  tokens are sound.
- No entrance animation on the page body, so nothing is invisible before JS — keep that property.

## Fix direction (executed in the rebuild)

One 1180 px ruled container from nav to footer with 112 px gutter columns and node markers at rule
intersections (zed's device, mapped to our red). Five type sizes. Everything on an 8 px grid.
Registry components for every element — nav, install command, steps, figures, stats/ledger, footer,
copy button, star count, theme toggle, tabs — adapted to `--od-*` tokens. The frame renders the
`hero-demo.webp` poster on the server and crossfades to the live demo once it reports ready.
