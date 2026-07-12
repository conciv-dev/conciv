# 001 — Replace wind4 built-in entrance keyframes with subtle custom ones

- **Status**: TODO
- **Commit**: 7fb70e7b
- **Severity**: HIGH
- **Category**: Physicality & origin / Easing & duration
- **Estimated scope**: 2 files (`packages/uno-preset/src/animation.ts`, `packages/uno-preset/src/motion.ts`), ~15 lines

## Problem

The `anim-msg`, `anim-msg-lg`, `anim-rise`, `anim-rise-d` shortcuts use UnoCSS preset-wind4's built-in `fade-in-up` keyframe, and `anim-fab` uses the built-in `zoom-in`. These built-ins are animate.css ports with drastic values:

- `fade-in-up` = `{from{opacity:0;transform:translate3d(0,100%,0)}to{opacity:1;transform:translate3d(0,0,0)}}` — the element slides up by its **entire own height**. Every chat message, activity-timeline turn, tool card, popover, dialog, and empty-state block does this on entry. A tall assistant message slides hundreds of pixels in 160ms.
- `zoom-in` = `{from{opacity:0;transform:scale3d(0.3,0.3,0.3)}50%{opacity:1}}` — the FAB pops in from 30% scale, near the forbidden `scale(0)` appear-from-nothing.

Current code:

```ts
// packages/uno-preset/src/motion.ts:7-11 — current
'anim-msg': 'animate-fade-in-up animate-duration-[160ms] animate-ease-pw',
'anim-msg-lg': 'animate-fade-in-up animate-duration-[180ms] animate-ease-pw',
'anim-rise': 'animate-fade-in-up animate-duration-[320ms] animate-ease-pw-expo animate-fill-mode-both',
'anim-rise-d':
  'animate-fade-in-up animate-duration-[320ms] animate-ease-pw-expo animate-delay-[40ms] animate-fill-mode-both',
```

```ts
// packages/uno-preset/src/motion.ts:16 — current
'anim-fab': 'animate-zoom-in animate-duration-[360ms] animate-ease-pw-expo animate-fill-mode-both',
```

## Target

Elements enter with a small fixed offset (8px) or a subtle scale (0.9), per the 0.9–0.97 physicality rule. Add two keyframes to the preset's own keyframe map and point the shortcuts at them. Durations and easings stay exactly as they are.

```ts
// packages/uno-preset/src/animation.ts — add inside `keyframes`
'pw-fade-in-up': '{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}',
'pw-zoom-in': '{from{opacity:0;transform:scale(0.9)}to{opacity:1;transform:scale(1)}}',
```

```ts
// packages/uno-preset/src/motion.ts — target
'anim-msg': 'animate-pw-fade-in-up animate-duration-[160ms] animate-ease-pw',
'anim-msg-lg': 'animate-pw-fade-in-up animate-duration-[180ms] animate-ease-pw',
'anim-rise': 'animate-pw-fade-in-up animate-duration-[320ms] animate-ease-pw-expo animate-fill-mode-both',
'anim-rise-d':
  'animate-pw-fade-in-up animate-duration-[320ms] animate-ease-pw-expo animate-delay-[40ms] animate-fill-mode-both',
'anim-fab': 'animate-pw-zoom-in animate-duration-[360ms] animate-ease-pw-expo animate-fill-mode-both',
```

## Repo conventions to follow

- Custom keyframes already live in `packages/uno-preset/src/animation.ts` under the `pw-` prefix — imitate `'pw-presence-in': '{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}'` (that one is already correct and stays untouched).
- Keyframe strings are single-line, no spaces after `{`/`;`, matching the existing entries.
- No code comments (repo lint deletes them).

## Steps

1. `packages/uno-preset/src/animation.ts`: add the two keyframes above to the `keyframes` object, after `'pw-slide-in-left'`.
2. `packages/uno-preset/src/motion.ts`: change the five shortcut values as shown in Target (only the keyframe name changes; durations/easings/delays/fill modes stay byte-identical).
3. Rebuild the widget so integration surfaces pick it up: `pnpm turbo run build --filter=@conciv/uno-preset --filter=@conciv/widget`.

## Boundaries

- Do NOT touch any other shortcut in `motion.ts` (`anim-presence-*`, `anim-tab-*`, `anim-collapse-*`, `trans-*` are correct).
- Do NOT change any consumer class strings — the shortcut names stay the same.
- Do NOT remove the wind4 preset or alter `packages/uno-preset/src/easing.ts`.
- If the shortcut values at those lines differ from the "current" excerpts above, STOP and report drift.

## Verification

- **Mechanical**: `pnpm typecheck && pnpm turbo run build --filter=@conciv/widget` both pass; `grep -rn "animate-fade-in-up\|animate-zoom-in" packages/uno-preset/src` returns nothing.
- **Feel check**: run the dev app (`pnpm dev`), open the chat panel, send a message:
  - New messages settle with a barely-perceptible 8px rise — a tall reply must NOT visibly travel from below its final position.
  - Open a popover (e.g. session menu): it rises subtly, not from a full panel-height away.
  - Reload the page: the FAB fades in from 90% scale — no "pop from a dot".
  - DevTools → Animations panel at 10% speed: the from-frame of a message entrance shows `translateY(8px)`, not the element's own height.
- **Done when**: all five shortcuts reference `pw-fade-in-up`/`pw-zoom-in` and the feel checks pass.
