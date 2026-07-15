# 016 — Site cohesion: motion tokens, card stagger, frequency trims, press feedback

- **Status**: TODO
- **Commit**: 7fb70e7b
- **Severity**: MEDIUM
- **Category**: Cohesion & tokens / Purpose & frequency / Physicality
- **Estimated scope**: ~6 files in `apps/site/src`, ~50 lines

## Problem & Target (itemized)

**K1 — No motion tokens.** Six+ hand-typed easing/duration combos across gsap, motion, and Tailwind (`AnimatedContent.tsx:34` `'power3.out'` 0.8s; `features-section.tsx:99` `easeOut` 0.18s; `demo.tsx:111` `'power2.out'` 0.35s; `demo.tsx:81` `'power3.inOut'`; `LogoLoop.tsx:325` `cubic-bezier(0.4,0,0.2,1)`; scattered `duration-100/200/300/500`). Target: declare tokens in `apps/site/src/styles/app.css` `:root`:

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
```

and a TS mirror for the JS animators (new `apps/site/src/lib/motion-tokens.ts`: `export const easeOut = [0.23, 1, 0.32, 1] as const` for motion, `export const gsapEaseOut = 'power3.out'` naming the sanctioned gsap curves). Migrate ONLY the files this plan already touches plus the six cited call sites — not a whole-site sweep; new code adopts tokens from here on.

**K2 — Card grid enters all-at-once.** `features-section.tsx:146-158`: the 5-card grid enters inside one `<AnimatedContent distance={44}>`. Target: per-card stagger of 60ms (30–80ms budget). Mechanically: keep the single AnimatedContent for the section heading, and give each card its own entrance delayed by `index * 60`ms — AnimatedContent already accepts a `delay` prop (check its props; it does per its GSAP timeline). Stagger must not gate interaction (cards are clickable immediately — GSAP `from`-style opacity/y only).

**K3 — Hover dim of all siblings.** `features-section.tsx:98-99`: hovering one card animates ALL 5 cards (`scale: dimmed ? 0.97 : 1, opacity: dimmed ? 0.55 : 1`) via Framer shorthands, per hover enter/leave. Frequency rule: hover motion → drastically reduce. Target: drop the sibling `scale` (keep opacity dim only, it's cheap and quieter): `animate={{opacity: dimmed ? 0.55 : 1}}`, and pass `transition={{duration: 0.18, ease: easeOut}}` unchanged. This also removes the main-thread scale shorthand (perf).

**K4 — Magnet on the GitHub nav link.** `site-nav.tsx:24` `<Magnet padding={40} magnetStrength={3}>`: decorative pull on a persistent nav item used constantly. Target: remove the Magnet wrapper in the nav (keep the child link intact). KEEP the install-chip Magnet (`install-chip.tsx:19`) — hero-local, rare, delight budget.

**K5 — ClickSpark page-wide.** `landing-page.tsx:15`: sparks on every click anywhere (nav, text selection). Target: scope it — move the ClickSpark wrapper to the hero section only (wrap the hero/demo container instead of `SiteNav + main + footer`). Preserves the delight where it lands (hero CTA) and stops firing on routine navigation clicks.

**K6 — copy-button press.** `landing/copy-button.tsx:52`: `active:scale-90` (too deep) with only `transition-colors` declared, so the press snaps. Target: `active:scale-[0.97] transition-[color,transform] duration-150` (0.95–0.98 budget; 150ms within 100–160ms press budget).

**K7 — alert-dialog pop.** `ui/alert-dialog.tsx:46`: `duration-100` on modal content entrance (`zoom-in-95 fade-in-0`) — a 100ms pop out of step with the site's soft motion; modal budget 200–500ms. Target: `duration-200`.

**K8 — LogoLoop linear hover fade.** `LogoLoop.tsx:362`: `transition-opacity duration-200 ease-linear` on logo links → `ease` (hover/color rule): drop `ease-linear` (Tailwind default is a sane `ease`-family curve) or set `ease-out`.

## Repo conventions to follow

- shadcn/Tailwind class conventions; keep `cva` structures intact.
- Radix components already do origin-correct entrances (`origin-(--radix-*-transform-origin)`) — imitate, don't disturb.
- Marketing personality: soft, generous motion is allowed — these trims target frequency and cohesion, not delight removal.

## Steps

1. K1 tokens (css + ts) and migrate the six cited call sites.
2. K2 stagger.
3. K3 opacity-only dim.
4. K4 remove nav Magnet.
5. K5 scope ClickSpark to the hero.
6. K6, K7, K8 class tweaks.
7. Build site; typecheck.

## Boundaries

- Do NOT do a site-wide find-replace of every duration utility — only the cited sites.
- Do NOT remove Magnet/ClickSpark components or their files (still used in scoped locations).
- Do NOT touch the demo's scripted GSAP choreography beyond the token rename (demo.tsx flows are reduced-motion-gated and deliberate).
- If cited code drifted, STOP and report.

## Verification

- **Mechanical**: site build + typecheck pass; `grep -rn "cubic-bezier(0.4,0,0.2,1)" apps/site/src` returns nothing.
- **Feel check**:
  - Reload landing: feature cards cascade in at 60ms intervals; heading enters once; nothing blocks clicking mid-stagger (click a card during the cascade).
  - Hover a card: siblings dim (opacity only) — no shrink; hovered card's glow/underline unchanged.
  - Click the GitHub nav link: no magnet pull; click the hero install chip: magnet still there.
  - Click in the footer: no sparks. Click in the hero: sparks.
  - Copy button press: soft 0.97 compress with an eased return, icon swap eased.
  - Slow-motion (DevTools 10%): alert-dialog entrance reads as a settle, not a pop.
- **Done when**: tokens exist and the eight items above hold.
