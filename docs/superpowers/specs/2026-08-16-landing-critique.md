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

---

# Follow-up log (2026-08-16)

Everything below is the record of what happened after the critique above was written: which skills
were consulted, which commits fixed what, how the page compares to zed.dev at each iteration, and a
line-by-line disposition of the two Codex reviews. Commit hashes are on `feat/landing-redesign`
(`git log --oneline origin/main..HEAD`).

## Skills applied

Agent 1 (grid rebuild, P0s, component sourcing):

- `create-design-md` — produced `apps/site/DESIGN.md` from the measured zed.dev reference and our
  own tokens; committed as `f29ca225`. This is the only skill agent 1's handoff records by name, so
  the rest of its list is not reconstructable from the repo.

Agent 2 (motion, brand, copy, shader):

- `pnpm dlx @tanstack/intent@latest list` — discovery works; no router skill loaded because no route
  or search-param code was touched in that pass.
- `animate` — drove the star hover rebuild: fill from the bottom through the star mask as the
  dominant response, tilt as the secondary, delayed count bump, interruptible.
- `review-animations` — checklist run against the star strip; produced the 280ms in / 150ms out
  asymmetry and the compositor-only property list.
- `animation-vocabulary` — named the star response so the durations could be argued rather than
  guessed.
- taste-skill §4 (directives) and §9 (AI tells) — removed every visible em-dash and capped the
  eyebrow at two items.
- redesign-skill audit checklist — flagged the theme toggle, the footer link farm and the repeated
  eyebrows.
- soft-skill (motion, spacing) — read and mostly rejected: its floating pill nav, scroll reveals and
  96px-plus section padding contradict the brief. Recorded, not applied.
- hallmark `SKILL.md` disciplines, `references/verbs/audit.md`, and the slop-test gate list — gates
  6, 38a, 42, 43 and 47 identified as Zed-DNA exceptions to document; gate 23 accent footprint
  measured; gate 44 fold checked (CTA at y=468 at 1280x800); gate 48 produced the `--od-star` and
  `--od-hero-line-alpha` tokens.

Agent 3 (Codex punch lists, batch A):

- `pnpm dlx @tanstack/intent@latest list` — ran clean; `router-core#navigation` loaded before the
  active-link work, which is why the nav and footer use `activeProps` / `inactiveProps` /
  `activeOptions` and let the router emit `aria-current` instead of hand-rolling it.
- taste-skill §4 and §9 — second copy pass over captions and the ledger.
- redesign-skill audit — drove the Card removal, the compact footer and the single lightbox
  affordance per tile.
- hallmark disciplines plus the motion, layout and responsive references, with the Codex review 2
  scorecard used as the gate list — produced the accent-ink tokens, the measured contrast table, the
  root clip, the heading wrap safeguards and the 44px touch targets.
- `animate`, `review-animations`, `animation-vocabulary` — retimed the tab indicator, the magic
  move, the media-frame label and the poster crossfade onto one ease and one duration ladder.
- `baseline-ui` — deslop pass over every landing file; this is what removed the last Card wrappers
  and the off-grid spacing.
- `emil-design-eng` — the hover-card delay decision (slow on hover, instant on keyboard focus) and
  the reserved-width count skeleton.
- `impeccable:critique`, `impeccable:audit`, `impeccable:animate`, `impeccable:polish` — the
  section-by-section pass that produced the semantic figures, the ledger principles and the
  one-row footer index.

## Fixes since the critique

- `f29ca225` docs(site): DESIGN.md, the Zed-derived ruled grid, six-size type scale and component
  sourcing rules.
- `02be96d8` feat(site): red-accent capability screenshots.
- `9026d802` wip(site): the grid rebuild itself, all four P0s, and the first registry pass.
- `699542ac` fix(site): hero shader, `rotate()` was undefined so the julia program never linked.
- `82fd8a78` feat(site): star hover on CSS transitions, `--od-star` token, reserved count width.
- `f59286c0` feat(site): `BrandMark`, spark plus wordmark on one baseline, used in nav, footer and
  the docs header.
- `59a8d71f` feat(site): copy diet, two-item eyebrow, 17-word hero sub, plain h2s, captions at 14
  words or fewer, no em-dashes, symmetric 88/88 hero padding.
- `6b8f7dc0` fix(site): motion and shader calibration, flat theme toggle, 200ms tab indicator,
  250ms magic move with no stagger, 160ms tile hover, per-theme shader alpha, 60ch balanced lede,
  all CSS comments removed.
- `12a9327f` fix(site): nav inset, off-grid spacing sweep, accent AA tokens, root clip.
- `a81e935b` refactor(site): semantic figures, ledger principles, compact footer, one lightbox
  affordance per tile, active links, 44px touch targets.
- `79c0be85` fix(site): poster persists until the demo reports ready; step 3 on a 2:1 grid.
- `7cf56ec2` refactor(site): tokenised hover markup, one star component, reserved count skeleton.
- `cf95997f` style(site): demo type on the six-size scale.
- `32f119b6` fix(site): hover-card anchors open instantly on keyboard focus.

## Compare iterations

- `scratchpad/compare-01.png` (zed | ours light). The grid lands: same 1120 column, same rule
  cadence, same nav height. Differences left: Zed's h1 is one line and ours wraps to two; Zed carries
  an announcement bar between nav and hero that we do not have; Zed's nav has six product links and a
  Download CTA where ours has two links.
- `scratchpad/compare-02.png` (zed | ours light | ours dark). Adds the dark theme. Difference left:
  Zed puts its Fast / Agentic / Collaborative strip between the hero and the product shot, so the
  product arrives after a beat; we go hero straight to frame and put the principles strip after it.
- `scratchpad/copy-hero-2up.png` (ours light over dark, after the copy diet). Two-item eyebrow and
  the 17-word sub. Difference left: the shader is still loud enough at this alpha to read as the
  subject rather than as texture, which is what the next iteration fixed.
- `scratchpad/hero-shader-2-2up.png` (ours light over dark, after the alpha and quiet-zone change).
  Visible accent footprint 6.0% light and 7.3% dark of the hero band. Difference left versus Zed: our
  backdrop moves and theirs is a static dotted texture, which is the owner-approved divergence.
- `scratchpad/a3-b-full-light.png` (full page, current). Differences left versus Zed across the
  whole page: our lower sections all use the same ruled cadence where Zed varies it, and our
  capability grid was still six framed tiles at that capture; it is now two annotated stories plus
  an evidence strip (variant A).

## Pixel audit

Per-element geometry and computed-style measurements at 1440 and 390 live in
`scratchpad/pixel-audit.md` (element, expected, measured, verdict), produced in the same pass.

## Codex review 1

Source: `scratchpad/codex-landing-critique.out` from "## 1. AI-slop verdict by section". Verdict at
the time: 6.5/10.

Section 1, per-section verdicts:

- Theme toggle gradient, shine and 360deg spin → fixed (`6b8f7dc0`): flat outline button, 160ms
  colour only.
- Nav padding not on the 48px section inset → fixed (`12a9327f`), but to 12px, not 48px: Zed's nav
  inset is not their section inset, and 12px is what puts the brand at x=174 and the right edge at
  x=1266 to match them.
- Centred hero template → justified: the centred hero is the Zed macrostructure the owner asked for;
  recorded as a Hallmark exception in DESIGN.md.
- Shader is decorative AI atmosphere burning WebGL at 24fps → justified: the owner keeps it. Motion
  was made rigid and calm, alpha dropped per theme, footprint measured at 6.0% / 7.3%.
- Headline should be a one-line claim of 36 characters or fewer → justified: the h1 stays.
- Four package-manager tabs are visual chatter → justified: the owner keeps four tabs with icons and
  the magic-move morph.
- Separate copy button weakens the command silhouette → justified: that separation is the 21st 1095
  layout we adopted.
- Live demo reintroduces tiny mono text and nested cards → fixed (`cf95997f`): demo type is on 13
  and 14px only.
- Crossfade on mount rather than readiness → fixed (`79c0be85`): the demo calls `onReady`.
- Three identical principle cells are the card-grid formula → fixed (`a81e935b`): a compact ledger,
  24px padding, 17/24 titles over one-line 13/20 facts.
- Six image-plus-heading-plus-paragraph capability cards → applied, variant A (Codex review #1:
  capability restructure). The owner approved `scratchpad/capability-mock-a.png`; the section is
  now two mirrored 7/5 stories (`grab-element`, `edit-live`), each with a serif h3, a one-line
  body and three numbered facts verified against the code (react-grab picking, build-time
  `data-conciv-source`, grab attachment into the composer; `edit-live` page tools, `DiffBlock` on
  the file-edit card, "keep it → the agent edits the real files" from `usage/page-control.mdx`),
  followed by a four-up evidence strip (tests, permission gate, whiteboard, vite.dev clone) with
  equal-height tiles. Captures: `scratchpad/capability-A-light.png`, `capability-A-dark.png`.
  The unverifiable "its state" phrase was dropped from the grab caption.
- Identical "View full size" drawers on every tile → fixed (`a81e935b`): one button per tile, the
  label is decorative and hover-gated.
- Dashed media mats feel component-demo-ish → justified: the 6px dashed mat is measured from Zed's
  own feature tiles, documented in DESIGN.md.
- Crop screenshots so internal UI text renders at 11px or more → deferred to the screenshot re-shoot
  lane, which owns the file names and the manifest.
- Step 3 pairs a flexible terminal with an arbitrary 200px image column → fixed (`79c0be85`): a 2:1
  grid with equal heights.
- Cold-load em dash in the ledger exposes an inconsistent data state → fixed (`59a8d71f` reserved
  blank, then `7cf56ec2` a shared reserved-width skeleton in both the nav and the ledger).
- Footer blurb repeats the hero → fixed (`59a8d71f`): "MIT-licensed. Runs with your local dev
  server."

Section 2, provenance audit (all fixed in this documentation commit unless noted):

- Shader listed as a Radiant registry item with "id pending" → fixed: listed as hand-written GLSL,
  owner-approved, with the note that MIT Radiant only inspired the slot.
- Table names `ui/tabs.tsx`, which does not exist → fixed: `ui/animated-tabs.tsx`, listed once as a
  component and referenced by both the package switcher and the framework tabs.
- `SparkMark` motion hand-written and absent → fixed: brand-mark row added.
- `MediaFrame` hand-written and omitted → fixed: row added with the measured Zed mat as its
  justification and shadcn Dialog credited for the lightbox only.
- Safari 4117 reduced to generic dots and a URL bar → fixed: listed as hand-written layout code with
  4117 named as the starting point, justified because the owner keeps the chrome.
- Cards adopted then neutralised into semantic wrappers → fixed twice over: the Cards are gone from
  the page (`a81e935b`) and `ui/card.tsx` is trimmed to the one export the demo uses.
- smoothui footer-3 gutted down to a hand-authored link grid → fixed: listed as hand-written, and
  the grid itself was replaced by a one-row index.
- Crossfade and step layout already disclosed → no change needed.

Section 3, motion:

- Tab indicator 250ms spring with bounce and a meaningless `originY` → fixed (`6b8f7dc0`): 200ms
  `cubic-bezier(0.23, 1, 0.32, 1)`, no spring, no `originY`.
- Magic move 500ms plus per-token stagger → fixed (`6b8f7dc0`): 250ms, stagger 0.
- GitHub hover invents a count increment → justified: the owner keeps the fill, the tilt and the
  "+1". The count jumps back on unhover and never persists.
- Hard-coded yellow escapes the token system → fixed (`82fd8a78`): `--od-star`.
- Brand mark 180deg rotation at 1.2 scale on a low-damping spring → fixed (`f59286c0`): 4deg / 1.04
  over 200ms, CSS only.
- Tile hover bar at 100ms is abrupt → fixed (`6b8f7dc0`): 160ms on `--od-ease-out`.
- Hover bar obscures the image → justified: it is a decorative label on a hover-capable pointer
  only, and the whole tile is one button, so nothing is hidden from keyboard or touch.
- Shader should freeze after an establishment beat → justified: the owner keeps the motion; it is
  rigid zoom and rotation, not morphing, and it stops entirely off-screen, on tab hide, and under
  reduced motion.

Section 4, typography, spacing, alignment:

- Hero wraps to two lines → justified: the h1 stays.
- Nav at 16px inset versus 48px sections → fixed (`12a9327f`) to the measured 12px.
- Six-size scale is false once `demo/*` appears → fixed (`cf95997f`): demo type on 13 and 14px only.
- Off-grid values (`px-2.5`, `size-3.5`, `-m-1.5/p-1.5`, `mt-1.5`, `gap-2.5`, `p-3.5`, `p-[18px]`)
  → fixed (`12a9327f`), swept everywhere except two documented exceptions: the 6px Zed mat and the
  2px tab underline.
- Section headers at 64px versus Zed's tighter bands → justified: 64px is the measured section
  padding; the hero specifically was retuned to 88/88, giving a 500px band against Zed's 502px.
- Dashed 6px mats break the 1px rule system → justified, documented as a measured Zed exception.
- Row B images too small to be evidence → partly fixed by the variant-A restructure: the two lead
  captures now render at ~569px wide inside the 7-column track; the strip tiles stay small
  (216px) by design as evidence thumbnails with a lightbox. The re-shoot lane still owns cropping.

Section 5, copy:

- Eyebrow at five words → fixed (`59a8d71f`): two items.
- Subhead at 34 words chaining five claims → fixed (`59a8d71f`): 17 words, one sentence, 60ch
  balanced.
- Hero and section phrasing sound campaign-generated; replace the h1 → justified: the h1 stays. The
  h2s were nonetheless replaced with plain statements ("What it does on the page.", "Three steps
  from install to first edit.").

Section 6, design-affecting code quality:

- Duplicate star presentations across three call sites → fixed (`7cf56ec2`): one
  `components/github-stars-button.tsx` used by the nav, the docs sidebar and not-found;
  `github-star-link.tsx` deleted.
- Hard-coded yellow OKLCH → fixed (`82fd8a78`).
- One-off radii, durations, widths and fractional values → fixed (`12a9327f`, `6b8f7dc0`).
- `CardTitle` renders a `div` inside figures → fixed (`a81e935b`): real `h3` headings.
- Poster goes `aria-hidden` on mount, not readiness → fixed (`79c0be85`).
- `dangerouslySetInnerHTML` for generated hover markup → fixed (`7cf56ec2`): rendered from a
  `SnippetToken[][]` structure.
- Tests do not cover measured alignment, first-paint poster persistence, reduced motion or rapid tab
  interruption → in progress, plan Task 8.
- Extensive CSS implementation comments → fixed (`6b8f7dc0`): all removed.

Section 7, the ten actions, all covered above: 1 shader justified, 2 hero justified, 3 capabilities
open, 4 demo type fixed, 5 star justified with the token fixed, 6 motion normalised, 7 six-size
scale enforced, 8 off-grid swept with two documented exceptions, 9 nav inset measured, 10 provenance
table corrected and the geometry, first-paint and motion tests queued.

## Codex review 2

Source: `scratchpad/codex-critique-2-final.md`. Verdict at the time: 7/10, Hallmark 35 pass / 23
fail.

Gate table, the 23 failures:

- Gate 2, theme control uses two gradients → fixed (`6b8f7dc0`).
- Gate 3, two equal three-column rows → fixed (`a81e935b`): capabilities are 2 / 3 / 1 and the
  principles strip is a ledger, not a card row.
- Gate 6, everything in the hero is centred → justified: Zed DNA, owner-approved, documented.
- Gate 13, theme icon combines rotate, scale and colour under a parent that changes border and two
  shadows → fixed (`6b8f7dc0`): one response, colour.
- Gate 20, missing Hallmark macrostructure stamp comment → justified: the repo has a zero-comments
  rule and a lint autofix that deletes comments. The macrostructure is recorded in DESIGN.md
  instead.
- Gate 22, unused zero-chroma shadcn neutrals → fixed (`12a9327f`): `--chart-*` and `--sidebar-*`
  deleted.
- Gate 23, shader covers most of the hero in accent linework → fixed (`6b8f7dc0`): per-theme alpha
  and a wider quiet ellipse bring the visible accent footprint to 6.0% light and 7.3% dark, measured
  with `scratchpad/accent-footprint.mjs`. The shader itself is justified.
- Gate 24, off-scale 6px mat and 10px radii → justified and documented in DESIGN.md as the two
  deliberate exceptions.
- Gate 25, hero lede only 512px → fixed (`6b8f7dc0`): `.od-lede` at 60ch, balanced.
- Gate 26, nav and footer links lack explicit active states → fixed (`a81e935b`): TanStack `Link`
  `activeProps` / `inactiveProps`, router-supplied `aria-current`.
- Gate 27, product-frame fade has no reduced-motion fallback → fixed (`79c0be85`).
- Gate 29, full-band background animates continuously at 24fps → justified: owner keeps it; it
  pauses off-screen and on tab hide and is static under reduced motion.
- Gate 34, `overflow-x: clip` on both roots and tests at 320/375/414 → clip fixed (`12a9327f`); the
  extra widths are queued in plan Task 8.
- Gate 38a, the entire h1 is italic → justified: owner-approved Hallmark exception, documented.
- Gate 39, shared input is 32px with no helper slot → justified: `ui/input.tsx` is used only by the
  demo composer inside the product frame, not by page chrome; every page control carries `.od-hit`
  for a 44px target on coarse pointers.
- Gate 40, contrast unproven → fixed (`12a9327f`): measured both themes, table in DESIGN.md.
- Gate 41, no `--od-accent-ink` token → fixed (`12a9327f`), and `--primary-foreground` now points at
  it.
- Gate 44, hero padding 96 top versus 48 bottom → fixed (`59a8d71f`): symmetric 88/88, band 500px
  against Zed's 502px. The gate's "bottom at least 125px" is not applied, because Zed fidelity is
  the brief and our hero stack is taller than theirs.
- Gate 45, the fractal has no semantic relationship to the product → justified: owner keeps it.
- Gate 47, hand-built browser chrome → justified: the owner keeps the chrome on the product frame.
- Gate 48, one-off OKLCH and RGB shadows → fixed (`82fd8a78` for `--od-star`, `6b8f7dc0` for the
  theme-switch shadows).
- Gate 49, footer links lack `whitespace-nowrap` → fixed (`a81e935b`).
- Gate 51, headings lack `overflow-wrap: anywhere` and `min-width: 0` → fixed (`12a9327f`).

Other review-2 findings outside the gate table:

- "ephemeral" in a capability caption → fixed (`59a8d71f`): the caption now reads "Edits land on the
  running page first, then in source when you say so."
- One unruled breath between capabilities and steps → tried, captured as `scratchpad/breath.png`,
  and reverted: it reads as a missing rule, and the unbroken ruled cadence is the Zed DNA the owner
  asked for.
- Serif used below h2 → justified: `od-h3` stays serif, because Zed's own feature-tile h3 is serif at
  16.8px. Serif is allowed on h1, h2, h3 and the step numerals only; that boundary is now written
  into DESIGN.md.
- How-it-works padding 48px to 40px → not applied: 40px is off the 8px scale the whole page is on.
- `HoverCard openDelay` 150ms → fixed (`6b8f7dc0` retiming, `32f119b6` behaviour): 700ms on hover,
  250ms close, and instant on keyboard focus via a controlled `open`, with the anchors focusable and
  labelled.
- Magic-move second settle → measured during `6b8f7dc0`; 250ms with stagger 0 settles in one pass.

Ordered top 12:

1. Constrain the fractal → footprint fixed, shader justified.
2. Upright h1 or an owner-approved exception → exception taken and documented.
3. Remove the faux chrome → justified, owner keeps it.
4. Capability widths → shipped grid is 2 / 3 / 1; the two-story restructure is mocked and waiting on
   the owner.
5. Flatten the theme switch → fixed (`6b8f7dc0`).
6. `--od-accent-ink` plus measured contrast → fixed (`12a9327f`).
7. Root clip, heading wrap, extra width tests → clip and wrap fixed (`12a9327f`), tests in Task 8.
8. 44px touch targets → fixed (`a81e935b`).
9. Paint-aware, reduced-motion-safe crossfade → fixed (`79c0be85`).
10. Remove the footer columns → fixed (`a81e935b`).
11. Slower screenshot affordances and hover cards, instant on keyboard → fixed (`6b8f7dc0`,
    `32f119b6`).
12. Delete off-token colours and shadows, document the 2px and 6px exceptions → fixed (`12a9327f`)
    and documented in DESIGN.md.
