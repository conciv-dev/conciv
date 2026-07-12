# 012 — ui-kit-chat: component-level reduced-motion for entrance keyframes

- **Status**: TODO
- **Commit**: 7fb70e7b
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: ~8 class-string edits across `packages/ui-kit-chat/src/styled`, +1 in uno-preset if shortcut route chosen

## Problem

The published `@conciv/ui-kit-chat` styled set gates only spinners/shimmer/pulse with `motion-reduce:` variants. Entrance/movement keyframes — `anim-msg` (thread.tsx:133,177; activity.tsx:229,254), `anim-presence-in` (action-bar pre-plan-011, follow-up-suggestions.tsx:11), `anim-now` (now-line.tsx:15), `anim-tab-*` (app side) — have none. Inside the conciv app this is masked by the shadow-root blanket reset (`apps/conciv/src/styles.css:125` — documented, exempt). Consumed anywhere else (Storybook, other embedders of the published package), reduced-motion users get every movement animation.

## Target

Every movement keyframe in the styled set carries `motion-reduce:animate-none`. Two mechanical options — pick ONE and apply uniformly:

- **Option A (preferred, zero call-site churn)**: bake the gate into the shortcuts. In `packages/uno-preset/src/motion.ts`, append `motion-reduce:animate-none` to the movement shortcuts (`anim-msg`, `anim-msg-lg`, `anim-rise`, `anim-rise-d`, `anim-presence-in`, `anim-presence-out`, `anim-tab-right`, `anim-tab-left`, `anim-now`, `anim-combo`, `anim-fab`, `anim-pop` if plan 010 added it). Static shortcuts accept variant-prefixed utilities; verify one generated class in the widget CSS before doing all.
- **Option B**: add `motion-reduce:animate-none` at each styled call site listed above.

Note the standard: reduced ≠ zero — but these are entrance _movement_ keyframes; after plan 001 they still move 8px. Dropping them entirely under reduced motion is correct because content visibility does not depend on them (`fill-mode` is not `both` on `anim-msg`/`anim-presence-in`; for the `both`-filled `anim-rise`/`anim-fab`, `animate-none` leaves the element at its natural visible state — confirm visually).

## Repo conventions to follow

- Gate pattern exemplar: `packages/ui-kit-chat/src/styled/tool-card.tsx:10` (`anim-pulse motion-reduce:[animation:none]`). `motion-reduce:animate-none` is the utility equivalent; either spelling is fine — match `animate-none` for brevity.

## Steps

1. Choose Option A; edit the shortcuts in `motion.ts`.
2. Probe: build the widget, grep the emitted CSS (`packages/widget/dist/*.css` or the injected style string) for `@media (prefers-reduced-motion: reduce)` rules covering `.anim-msg` — if shortcuts refuse variant utilities, fall back to Option B.
3. Verify `anim-rise`/`anim-fab` elements are fully visible under reduced motion (fill-mode interaction).
4. Rebuild + run chat/system Storybook tests if present.

## Boundaries

- Do NOT touch the conciv app blanket reset — it stays (defense in depth).
- Do NOT gate `trans-*` transition shortcuts (opacity/color transitions aid comprehension and are kept per the reduced-motion standard).
- Do NOT gate spinners again (already gated at call sites).

## Verification

- **Mechanical**: widget build; emitted CSS contains reduced-motion overrides for the movement keyframes.
- **Feel check**: open ui-kit-chat Storybook (not the conciv app, which blankets) with DevTools reduced-motion emulation:
  - New message renders with no rise; empty-state, popover, FAB all appear instantly but fully visible.
  - Spinners static; shimmer static (pre-existing gates intact).
- **Done when**: package-level reduced-motion holds without the app's blanket.
