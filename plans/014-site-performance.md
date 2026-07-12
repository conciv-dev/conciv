# 014 — Site performance: idle loops, per-event layout reads, transition-all

- **Status**: TODO
- **Commit**: 7fb70e7b
- **Severity**: HIGH
- **Category**: Performance
- **Estimated scope**: ~7 files in `apps/site/src`, ~80 lines

## Problem & Target (itemized)

**S1 — ClickSpark idle rAF (HIGH).** `apps/site/src/components/ClickSpark.tsx:118-132`: `draw` re-schedules `requestAnimationFrame(draw)` unconditionally; with zero sparks it still clears the canvas every frame, forever — and ClickSpark wraps the whole landing page (`landing-page.tsx:15`). Target: run the loop only while sparks exist —

```ts
const draw = (timestamp: number) => {
  /* existing clear + spark rendering */
  if (sparksRef.current.length > 0) animationId = requestAnimationFrame(draw)
  else animationId = null
}
```

and on click (where sparks are pushed) start the loop if `animationId == null`. Final frame must still clear the canvas after the last spark dies.

**S2 — Magnet per-mousemove layout+render (HIGH).** `Magnet.tsx:33-56`: document-level `mousemove` → `getBoundingClientRect()` + `setPosition(...)` (React re-render) per event, per instance (site-nav.tsx:24, install-chip.tsx:19). Target: cache the rect on `pointerenter`/scroll/resize (or measure once per rAF tick), gate work behind an rAF (one measurement+update per frame max), and write the transform directly to a ref'd element (`el.style.transform = …`) instead of setState — React state only for `isActive` if needed. Also add a `prefers-reduced-motion` early-return (no listener at all) — that half is plan 015's; implement here, count it for both.

**S3 — LogoLoop rAF marquee (MEDIUM).** `LogoLoop.tsx:146-173`: rAF-driven constant marquee; never pauses off-screen. Target: pause via `IntersectionObserver` (cancel rAF when the band is not intersecting; resume on intersect). Keep the rAF implementation itself (it does seamless width-aware looping; converting to pure CSS is a larger refactor — out of scope).

**S4 — Infinite box-shadow tween (MEDIUM).** `landing/demo/demo.tsx:92-99`: `gsap.to(grabRef, {boxShadow: …, repeat: -1, yoyo: true})` repaints every frame while idle in the hero. Target: replace with an opacity pulse on a dedicated pseudo-element/overlay span carrying the final shadow: element `after:` (or a sibling div) styled with `box-shadow: 0 0 0 5px var(--od-accent-soft); opacity: 0` and tween `opacity: 0→1` yoyo instead — compositor-only. Same duration (0.95s), same `sine.inOut`, same kill conditions.

**S5 — `transition-all` in shadcn base (MEDIUM).** `ui/button.tsx:8` and `ui/badge.tsx:8`: replace `transition-all` with `transition-[color,background-color,border-color,box-shadow,transform,opacity]` (Tailwind arbitrary property list — covers the states those variants actually change: colors, ring/shadow, the `active:translate-y-px` press).

**S6 — VariableProximity per-letter rects (MEDIUM).** `VariableProximity.tsx:58-70`: `getBoundingClientRect()` per letter per pointer-frame (~25 letters × 2 instances). Target: cache letter rects once (after fonts load) and on scroll/resize (recompute in a passive listener or `ResizeObserver`), read cached values in the rAF handler.

**S7 — copy-button `transition-all` (LOW).** `landing/copy-button.tsx:54-55`: `transition-all` on the two icons → `transition-[transform,opacity]` (only transform+opacity change). Line 52's press feedback is plan 016.

## Repo conventions to follow

- Site is React + Tailwind; keep shadcn class-variance patterns intact — edit only the transition utilities inside the base strings.
- GSAP cleanup pattern: return `() => tween.kill()` (as demo.tsx already does).
- No new dependencies.

## Steps

1. S1 ClickSpark loop gating.
2. S2 Magnet refactor (rect cache + rAF gate + direct style writes + reduced-motion early-return).
3. S3 IntersectionObserver pause in LogoLoop.
4. S4 opacity-pulse overlay in demo.tsx.
5. S5 + S7 transition property lists.
6. S6 rect caching in VariableProximity.
7. `pnpm turbo run build --filter=@conciv/site` (or the site package's actual name) + `pnpm typecheck`.

## Boundaries

- Do NOT change visual output (spark shapes, magnet strength, marquee speed, pulse rhythm, button styling).
- Do NOT remove ClickSpark/Magnet features — plan 015/016 decide product-level removal questions; this plan only makes them cheap.
- If cited code drifted, STOP and report.

## Verification

- **Mechanical**: site builds; typecheck passes.
- **Feel check** (Chrome DevTools Performance on the landing page):
  - Idle landing page, 5s trace: no continuous rAF activity from ClickSpark; CPU near-idle.
  - Move the mouse without nearing the GitHub button: no Magnet-driven React commits in the Profiler.
  - Scroll the bundler band off-screen: LogoLoop rAF stops (Performance tab).
  - Hero idle: no per-frame Paint from the grab chip; pulse still visible.
  - Buttons/badges still transition colors + press exactly as before.
- **Done when**: idle landing page shows no continuous rAF/paint work and interactions are visually unchanged.
