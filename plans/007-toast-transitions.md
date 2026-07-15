# 007 — Toasts: wire the missing transition on Ark's stacking vars

- **Status**: TODO
- **Commit**: 7fb70e7b
- **Severity**: MEDIUM
- **Category**: Interruptibility / Missed opportunity
- **Estimated scope**: 1 file (`packages/ui-kit-system/src/toast.tsx`), ~5 lines

## Problem

Ark UI's toast drives enter/exit/stacking by updating `--x/--y/--scale/--height/--opacity` CSS vars on the root and expects the consumer to transition them. The root styles consume the vars but declare **no transition**:

```tsx
// packages/ui-kit-system/src/toast.tsx:6 — current (excerpt)
const ROOT =
  '… [translate:var(--x)_var(--y)] [scale:var(--scale)] [z-index:var(--z-index)] [height:var(--height)] [opacity:var(--opacity)] …'
```

Result: toasts appear, dismiss, and restack as instant jumps. Toasts are exactly the "rapidly triggered, reversible" case where interruptible transitions (never keyframes) are required — new toasts restack the whole group mid-motion.

## Target

Add a transition covering the driven properties, on the repo's tokens:

```
[transition:translate_400ms_var(--pw-ease),scale_400ms_var(--pw-ease),opacity_240ms_var(--pw-ease),height_400ms_var(--pw-ease)]
```

Rationale for values: 400ms is the toast-stack standard (Sonner uses 400ms `ease`); opacity leads shorter so dismiss reads immediate; `height` must be transitioned too or collapse-on-dismiss jumps (it is a layout property — acceptable here because Ark animates stacked toast height by design and the stack is small; there is no transform-based alternative for the gap-collapse).

## Repo conventions to follow

- Transition shortcuts pattern: bracketed `[transition:…_var(--pw-ease)]` utilities as in `packages/uno-preset/src/motion.ts:34-53`. This one is component-local (toast-only), so inline in `ROOT` is fine — or add a `trans-toast` shortcut in `motion.ts` if oxfmt line length forces a split.
- Easing token `var(--pw-ease)` (`packages/ui-kit-system/src/tokens.css:38`).

## Steps

1. Append the transition utility above to `ROOT` in `packages/ui-kit-system/src/toast.tsx:6`.
2. Rebuild widget; open Storybook for ui-kit-system if present (`toast.stories.tsx`) to exercise stacking.

## Boundaries

- Do NOT add enter/exit keyframes — Ark's var choreography + transition is the whole mechanism.
- Do NOT change toast markup, close button, or toaster creation.
- If `ROOT` differs from the excerpt, STOP and report.

## Verification

- **Mechanical**: typecheck + build pass.
- **Feel check**: trigger 3+ toasts quickly (Storybook story or dev app flow that emits toasts):
  - New toasts slide/settle in; older ones scale back and shift smoothly.
  - Dismissing a middle toast: the stack closes the gap with motion, not a jump.
  - Spamming toasts mid-animation retargets fluidly (transitions, so no restart-from-zero).
  - Reduced-motion emulation in the app: flattened by the blanket reset — instant, fine.
- **Done when**: no instant jumps in enter/dismiss/restack.
