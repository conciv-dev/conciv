# 010 — ui-kit-system: press feedback, popover budget, dialog exit, swap physicality

- **Status**: TODO
- **Commit**: 7fb70e7b
- **Severity**: MEDIUM
- **Category**: Physicality & origin / Easing & duration
- **Estimated scope**: 4 files in `packages/ui-kit-system/src`, ~10 lines

## Problem

1. No press feedback on the system Button (`button.tsx:7`) or TooltipIconButton (`tooltip-icon-button.tsx:7`) while sibling surfaces have it (FAB `active:…scale(0.94)`, composer send `active:scale-[0.92]`, empty-state starters `active:scale-[0.97]`). `trans-btn` already transitions transform, so the wiring exists; the `:active` rule is just missing.

```ts
// packages/ui-kit-system/src/button.tsx:7 — current
const BASE =
  'inline-flex items-center justify-center gap-1.5 font-pw cursor-pointer trans-btn focus-ring [border:1px_solid_transparent] disabled:opacity-50 disabled:cursor-not-allowed'
```

2. Popover entrance is 320ms (`popover.tsx:5` uses `anim-rise`), over the 150–250ms popover budget; the same token also serves the modal dialog where 320ms is correct — the token is fine, the popover's use of it isn't. (Plan 001 already fixes the keyframe's travel; this plan fixes the duration split.)

3. Dialog content vanishes with a hard cut on close (`dialog.tsx:7`, `data-[state=open]:anim-rise`, nothing for `closed`).

4. Swap indicator morphs from `scale:0.6` on the browser's built-in ease (`swap.tsx:5`) — below the 0.9–0.97 physicality floor and off-token.

## Target

1. Button/TooltipIconButton BASE gains: `active:not-disabled:[transform:scale(0.97)]` (0.97 per the press-feedback standard; `trans-btn` transitions transform at 100ms `--pw-ease`, within the 100–160ms press budget).
2. Popover gets its own faster entrance: add a shortcut in `packages/uno-preset/src/motion.ts`:

```ts
'anim-pop': 'animate-pw-fade-in-up animate-duration-[200ms] animate-ease-pw-expo animate-fill-mode-both',
```

(depends on plan 001's `pw-fade-in-up`; if 001 not yet applied use `animate-fade-in-up` and note it) and `popover.tsx:5` swaps `anim-rise` → `anim-pop`. Dialog keeps `anim-rise` (320ms modal budget OK). 3. Dialog exit: `dialog.tsx:7` adds `data-[state=closed]:anim-presence-out` (existing 120ms fade/scale-out shortcut). Ark keeps the element mounted through the closed animation (Presence behavior), so the keyframe runs. 4. `swap.tsx:5` → `[transition:opacity_150ms_var(--pw-ease),scale_150ms_var(--pw-ease)] [&[hidden]]:opacity-0 [&[hidden]]:[scale:0.92] [&[hidden]]:[display:inline-flex]`.

## Repo conventions to follow

- Press-feedback exemplar: `apps/conciv/src/shell/empty-state.tsx:27` (`active:scale-[0.97]` on starters).
- Exit-animation exemplar: `packages/ui-kit-system/src/presence.tsx:4` (`data-[state=closed]:anim-presence-out`).
- New shortcuts go in `packages/uno-preset/src/motion.ts` next to their family.

## Steps

1. `button.tsx:7` + `tooltip-icon-button.tsx:7`: append the active-scale utility to BASE.
2. `motion.ts`: add `anim-pop`.
3. `popover.tsx:5`: `anim-rise` → `anim-pop`.
4. `dialog.tsx:7`: append `data-[state=closed]:anim-presence-out`.
5. `swap.tsx:5`: replace INDICATOR transition/scale per Target.
6. Rebuild widget; check ui-kit-system stories still render.

## Boundaries

- Do NOT add press feedback to link-styled or ghost text variants if pressing them navigates instantly (only the shared BASE — variants inherit; that is intended).
- Do NOT touch menu.tsx/tooltip.tsx/hover-card.tsx here (fade-only 120ms `anim-combo` is a deliberate crisp choice for those high-frequency surfaces).
- Do NOT alter dialog entrance timing.
- If cited class strings drifted, STOP and report.

## Verification

- **Mechanical**: typecheck + widget build + ui-kit-system tests pass.
- **Feel check**:
  - Press-and-hold any system button: it compresses to 0.97 and springs back on release; disabled buttons don't.
  - Open a popover: settles in 200ms — noticeably snappier than the dialog.
  - Close a dialog: 120ms fade/scale-out, no hard cut. Spam open/close: acceptable (keyframe restart on a modal is fine — it can't be re-triggered mid-exit through the overlay).
  - Toggle a Swap (e.g. copy button icon): the icons crossfade with a subtle 0.92 scale, quart curve.
- **Done when**: all four behaviors observable in the dev app/Storybook.
