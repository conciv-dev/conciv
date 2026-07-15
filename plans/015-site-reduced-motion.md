# 015 — Site accessibility: reduced-motion gates, hover gates, dead motion CSS

- **Status**: TODO
- **Commit**: 7fb70e7b
- **Severity**: HIGH
- **Category**: Accessibility
- **Estimated scope**: ~9 files in `apps/site/src`, ~60 lines

## Problem & Target (itemized)

Site-wide standard to apply: a shared hook —

```ts
// apps/site/src/lib/use-reduced-motion.ts (new; or colocate if a lib/ dir doesn't exist)
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}
```

(If `motion/react` is already imported in the file, its `useReducedMotion` is equivalent — prefer the library hook where the file already uses motion.)

**A1 — AnimatedContent (HIGH).** `AnimatedContent.tsx:64-96`: GSAP scroll entrance slides 36–100px, no gate. Target: when reduced, skip the transform setup entirely and only fade opacity `0→1` over 200ms `ease` (per the standard: keep opacity, drop movement). The existing `animateOpacity` path makes this a branch on the initial `gsap.set` + tween props.

**A2 — SplitText (HIGH).** `SplitText.tsx:104-126`: per-word `y: 40` scroll entrance ungated. Target: when reduced, render text immediately with no per-word animation (set final state, skip the timeline).

**A3 — Magnet (MEDIUM).** `Magnet.tsx`: no gate. Target: `if (reduced) return` before attaching the mousemove listener (coordinated with plan 014's refactor — one early-return).

**A4 — features-section tilt (MEDIUM).** `features-section.tsx:70-71,100`: `useSpring(useTransform(...))` bound via `style={{rotateX, rotateY}}` bypasses `MotionConfig reducedMotion="user"` (lazy-motion.tsx:9). Target: `const reduced = useReducedMotion()`; when reduced pass `style={{rotateX: 0, rotateY: 0}}` (or skip the mousemove updates).

**A5 — animated icons (MEDIUM).** `ui/pen-icon.tsx:10-26`, `ui/terminal-icon.tsx:9-12`, `ui/mouse-pointer-2-icon.tsx:14-27`, plus the same pattern in `message-circle-icon`, `plug-connected-icon`, `shield-check` variants: imperative `useAnimate()` hover loops are NOT covered by MotionConfig. Target: each icon component reads `useReducedMotion()` and early-returns from its hover-start handler when reduced (icon stays static).

**A6 — hover gates (LOW).** `features-section.tsx:93-97` glow/dim/underline hover motion and `LogoLoop.tsx:325,339` `scaleOnHover` classes: wrap motion-bearing hover styles in `(hover: hover) and (pointer: fine)` — for Tailwind classes prefer variants (`pointer-fine:hover:…` if the site's Tailwind v4 config supports it, else a small CSS layer in app.css using the media query targeting the existing class hooks). Keep color-only hover ungated.

**A7 — dead motion CSS (MEDIUM, cleanup).** `styles/app.css:243-248` (`.od-anim` reduced-motion kill — 0 usages) and `:250-276` (`od-rise`, `od-caret`, `od-grid-pan` keyframes — 0 usages): delete all four blocks. EXCEPTION: before deleting `od-caret`, decide the missed-opportunity: `framework-tabs.tsx:216` + `app.css:167` have a static fake IDE caret the blink keyframe was built for. Either wire `animation: od-caret 1.1s steps(1) infinite` onto `.od-caret` (with a reduced-motion override to `animation: none`) — the intended delight — or delete the keyframe. Wire it; it's one line and the asset exists.

## Repo conventions to follow

- Existing correct gates to imitate: `landing/smooth-scroll.tsx:9` (lenis), `landing/demo/demo.tsx:68` (`reduced()` checked before every GSAP flourish), `VariableProximity.tsx:54`.
- Docs style: no em dashes in any copy touched (none should be).

## Steps

1. Add/choose the `useReducedMotion` source per file (library hook where motion is already imported: features-section, icons; matchMedia hook for GSAP files).
2. A1, A2: branch the GSAP setups.
3. A3: early-return in Magnet (with plan 014).
4. A4: zero the tilt springs when reduced.
5. A5: gate all six icon components' hover animations.
6. A6: hover media-query gating.
7. A7: delete `.od-anim` + `od-rise` + `od-grid-pan`; wire `od-caret` blink with reduced-motion override.
8. Build site; typecheck.

## Boundaries

- Do NOT remove any animation for non-reduced users (except dead CSS).
- Do NOT restructure components; branches only.
- If cited code drifted, STOP and report.

## Verification

- **Mechanical**: site build + typecheck; `grep -rn "od-anim\|od-rise\|od-grid-pan" apps/site/src` returns nothing; `grep -c "reduced" apps/site/src/components/AnimatedContent.tsx` ≥ 1.
- **Feel check** (DevTools → Rendering → prefers-reduced-motion: reduce, hard reload):
  - Scroll the landing page end to end: content fades in place — nothing slides, no per-word cascades, no tilt, no magnet pull, icons static on hover.
  - Without emulation: everything animates exactly as before; the IDE caret in the framework tabs now blinks.
  - On a touch device (or DevTools device mode): tapping cards doesn't stick hover glow/scale.
- **Done when**: reduced-motion pass shows zero positional movement site-wide; normal pass unchanged.
