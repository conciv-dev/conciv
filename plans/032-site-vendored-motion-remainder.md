# 032 — Re-land the backed-out site motion work (fallow-safe)

- **Status**: TODO
- **Commit**: 3d9225ea
- **Severity**: HIGH
- **Category**: Performance + Accessibility + Cohesion (remainder of plans 014/015/016)
- **Estimated scope**: ~9 files in `apps/site/src` + `.fallowrc.json`, ~120 lines

## Problem

PR#54 executed the site animation plans but backed out every change touching the vendored
"React Bits"-style components (`LogoLoop`, `SplitText`, `Magnet`, `VariableProximity`, the demo,
the animated icons) because fallow's complexity/duplication gates flagged the touched files as
INTRODUCED findings. The findings those changes fixed are still live:

**P1 — Magnet: per-mousemove React re-render + layout read, no reduced-motion gate.**
`apps/site/src/components/Magnet.tsx:35-56` — a window-level `mousemove` listener calls
`getBoundingClientRect()` and `setPosition(...)` (React re-render) on every pointer move, per
instance, whenever the page is open. No `prefers-reduced-motion` handling at all.

```ts
// apps/site/src/components/Magnet.tsx:35-49 — current
const handleMouseMove = (e: MouseEvent) => {
  if (!magnetRef.current) return
  const {left, top, width, height} = magnetRef.current.getBoundingClientRect()
  const centerX = left + width / 2
  const centerY = top + height / 2
  const distX = Math.abs(centerX - e.clientX)
  const distY = Math.abs(centerY - e.clientY)
  if (distX < width / 2 + padding && distY < height / 2 + padding) {
    setIsActive(true)
    const offsetX = (e.clientX - centerX) / magnetStrength
    const offsetY = (e.clientY - centerY) / magnetStrength
    setPosition({x: offsetX, y: offsetY})
  } else {
```

**P2 — LogoLoop: permanent rAF marquee, never pauses off-screen.**
`apps/site/src/components/LogoLoop.tsx:146-176` — `animate` re-schedules
`requestAnimationFrame(animate)` unconditionally; the bundler band burns frames while scrolled
out of view. (Reduced-motion is already handled; this is purely perf.)

**P3 — Demo grab pill: infinite `box-shadow` tween.**
`apps/site/src/components/landing/demo/demo.tsx:92-99` — paints off-GPU every frame while the
hero is idle:

```ts
const tween = gsap.to(grabRef.current, {
  boxShadow: '0 0 0 5px var(--od-accent-soft)',
  repeat: -1,
  yoyo: true,
  duration: 0.95,
  ease: 'sine.inOut',
})
```

(Already reduced-motion-gated at line 90 — keep that.)

**P4 — VariableProximity: per-letter `getBoundingClientRect` per pointer-frame.**
`apps/site/src/components/VariableProximity.tsx:55-70` — the rAF handler measures every letter
on every tick instead of reading cached rects.

**P5 — SplitText: no reduced-motion gate + permanent `will-change`.**
`apps/site/src/components/SplitText.tsx:104-126` animates every word/char from `y: 40` on scroll
with no `prefers-reduced-motion` branch; `SplitText.tsx:158-162` leaves
`willChange: 'transform, opacity'` as a static style forever (compositor layer never released).

**P6 — Animated icons: imperative `useAnimate()` bypasses MotionConfig.**
`apps/site/src/components/ui/terminal-icon.tsx:9-17` (same pattern in `pen-icon.tsx`,
`mouse-pointer-2-icon.tsx`, `message-circle-icon.tsx`, `plug-connected-icon.tsx`,
`shield-check.tsx`) — `MotionConfig reducedMotion="user"` (`landing/lazy-motion.tsx:9`) covers
`m.*` props but NOT imperative `animate()` calls, so reduced-motion users still get the hover
motion. `features-section.tsx:83-84` calls `iconRef.current?.startAnimation()` unconditionally.

**P7 — Feature-card underline animates `width`, hover ungated.**
`apps/site/src/components/landing/features-section.tsx:117-120` (retained file — the earlier
pass missed it):

```tsx
className =
  'absolute bottom-0 left-0 h-[2px] w-0 transition-[width] duration-500 ease-out [background:linear-gradient(90deg,var(--od-accent),transparent)] group-hover:w-full'
```

`width` is a layout property; the sibling glow at line 108 is gated behind
`[@media(hover:hover)_and_(pointer:fine)]` but the underline is not.

**P8 — Missing CSS motion tokens + linear hover fade.**
`apps/site/src/styles/app.css` `:root` (line ~25) has no `--ease-out`/`--ease-in-out`
declarations (only the TS mirror `lib/motion-tokens.ts` landed). `LogoLoop.tsx:362`
`transition-opacity duration-200 ease-linear` uses `linear` on a hover fade, and the
`scaleOnHover` spans at `LogoLoop.tsx:324-325,338-339` hand-type
`ease-[cubic-bezier(0.4,0,0.2,1)]`.

## Target

- Magnet: rect cached on activation/scroll/resize; at most one measurement+style write per rAF;
  transform written directly to the inner element ref (`el.style.transform = ...`), React state
  only for `isActive`; `if (matchMedia('(prefers-reduced-motion: reduce)').matches) return`
  before attaching the listener. Visual behavior otherwise identical.
- LogoLoop: `IntersectionObserver` on the track's container cancels the rAF when not
  intersecting and resumes on intersect. Marquee math unchanged.
- Demo pill: dedicated overlay span carrying the final shadow
  (`box-shadow: 0 0 0 5px var(--od-accent-soft); opacity: 0`), tweened
  `opacity: 0 → 1, repeat: -1, yoyo: true, duration: 0.95, ease: 'sine.inOut'` — compositor-only.
  Same kill conditions as today.
- VariableProximity: letter rects cached once after mount/fonts-ready and recomputed on
  scroll/resize (passive listeners or `ResizeObserver`); the rAF handler reads the cache.
- SplitText: when `matchMedia('(prefers-reduced-motion: reduce)').matches`, render final state
  immediately (skip the split timeline). Set `will-change` only while animating; clear it in the
  existing `onComplete` (which already sets `animationCompletedRef`).
- Icons: each icon component reads `useReducedMotion()` from `motion/react` and early-returns
  from its `start` callback when reduced. `features-section.tsx` may alternatively gate the
  `enter` handler — gate at the icon level so every future call site is safe.
- Underline: replace `w-0 transition-[width] duration-500 ease-out ... group-hover:w-full` with
  a transform reveal, gated:

```tsx
className =
  'absolute bottom-0 left-0 h-[2px] w-full origin-left scale-x-0 transition-transform duration-500 ease-[var(--ease-out)] [background:linear-gradient(90deg,var(--od-accent),transparent)] [@media(hover:hover)_and_(pointer:fine)]:group-hover:scale-x-100'
```

- Tokens in `apps/site/src/styles/app.css` inside the existing `:root` block (line ~25):

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
```

Migrate only these call sites: `LogoLoop.tsx:325,339` `ease-[cubic-bezier(0.4,0,0.2,1)]` →
`ease-[var(--ease-out)]`; `LogoLoop.tsx:362` drop `ease-linear` (Tailwind default `ease` is
correct for a hover fade). No site-wide sweep.

## The fallow strategy (why the last attempt failed)

CI runs `pnpm exec fallow audit --changed-since main --format json` and blocks on INTRODUCED
findings. The vendored components carry pre-existing complexity that gets counted the moment the
file is touched. Strategy, in order:

1. **Preferred**: add the four vendored files to `ignorePatterns` in `.fallowrc.json` (there is
   single-file precedent: `packages/ui-kit-chat/src/store/story-connection.ts`):

```json
"apps/site/src/components/LogoLoop.tsx",
"apps/site/src/components/SplitText.tsx",
"apps/site/src/components/Magnet.tsx",
"apps/site/src/components/VariableProximity.tsx"
```

Rationale: vendored third-party-style code; its complexity is not ours to shrink, and dead-code
analysis on it has no value. **This is a repo-policy edit — surface it in the PR description
so the maintainer can veto it.** 2. If the maintainer rejects the ignore: keep every touched function's cyclomatic complexity ≤ 4
by extracting small helpers (the PR#54 chat-pane extraction is the precedent). 3. `demo.tsx`, `features-section.tsx`, the icons, and `app.css` are first-party — never ignore
them; keep those edits helper-extracted and flat.

## Repo conventions to follow

- Site is React + Tailwind v4 + gsap + motion. Reduced-motion exemplars to imitate:
  `landing/demo/demo.tsx:90` (`if (reduced() || ...) return` before each GSAP flourish),
  `VariableProximity.tsx:54` (matchMedia early-return), `lib/use-reduced-motion.ts` (shared hook
  for GSAP files; prefer motion/react's `useReducedMotion` where motion is already imported).
- Hover-gate exemplar: `features-section.tsx:108`
  `[@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100`.
- GSAP cleanup: return `() => tween.kill()` (demo.tsx already does).
- Zero code comments; no new dependencies; oxfmt formatting (no semicolons, single quotes).

## Steps

1. `.fallowrc.json`: add the four vendored files to `ignorePatterns` (strategy step 1).
2. P1 Magnet: reduced-motion early-return; rect cache + rAF gate + direct style writes.
3. P2 LogoLoop: IntersectionObserver pause/resume around the existing rAF.
4. P3 demo.tsx: opacity-pulse overlay replacing the box-shadow tween (extract a small helper if
   the hook body grows).
5. P4 VariableProximity: rect cache.
6. P5 SplitText: reduced-motion branch + scoped will-change.
7. P6 icons: `useReducedMotion()` early-return in all six icon components' `start`.
8. P7 underline: scaleX + hover gate in features-section.tsx.
9. P8 tokens in app.css `:root` + the three LogoLoop easing call sites.
10. `pnpm typecheck && pnpm turbo run build --filter=site` (check the actual package name in
    `apps/site/package.json` first), then
    `pnpm exec fallow audit --changed-since main --format json` — zero INTRODUCED findings.

## Boundaries

- Do NOT change visual output for non-reduced users (magnet strength, marquee speed, pulse
  rhythm, underline length/color).
- Do NOT remove Magnet/ClickSpark/LogoLoop features or files.
- Do NOT touch the demo's scripted GSAP choreography beyond the pulse swap.
- Do NOT do a site-wide easing/duration sweep — only the cited call sites.
- If cited code drifted from the excerpts above, STOP and report instead of improvising.
- If fallow still reports INTRODUCED findings after strategy steps 1–2, STOP and report the
  exact findings rather than adding more ignores.

## Verification

- **Mechanical**: typecheck + site build pass; fallow audit reports nothing INTRODUCED;
  `grep -rn "cubic-bezier(0.4,0,0.2,1)" apps/site/src` returns nothing;
  `grep -n "prefers-reduced-motion" apps/site/src/components/SplitText.tsx apps/site/src/components/Magnet.tsx` hits both.
- **Feel check** (Chrome DevTools, landing page):
  - Performance trace, idle hero, 5s: no continuous rAF from LogoLoop when the band is scrolled
    off-screen; no per-frame Paint from the grab pill (pulse still visible).
  - React Profiler: mouse movement far from the install chip produces no Magnet commits.
  - Rendering → prefers-reduced-motion: reduce, hard reload: heading text renders in place (no
    per-word cascade), no magnet pull, icons static on hover; opacity fades remain.
  - Device mode (touch): tapping a feature card does not stick the underline.
  - Slow-motion (Animations panel, 10%): underline reveals left→right as a scale, no layout
    shift of neighboring text.
- **Done when**: all mechanical gates pass and the reduced-motion pass shows zero positional
  movement from the six components above, with normal-motion visuals unchanged.
