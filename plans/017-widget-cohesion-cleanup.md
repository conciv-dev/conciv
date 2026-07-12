# 017 — Widget cohesion cleanup: easing-token adoption, spinner consolidation, small over/under-gates

- **Status**: TODO
- **Commit**: 7fb70e7b
- **Severity**: LOW
- **Category**: Cohesion & tokens / Accessibility
- **Estimated scope**: ~8 files, ~20 one-line edits

## Problem & Target (itemized)

**E1 — Transitions missing timing function (fall back to weak built-in `ease`).**

- `packages/ui-kit-chat/src/styled/composer.tsx:17` `[transition:background-color_120ms,transform_120ms]` → `[transition:background-color_120ms_var(--chat-ease),transform_120ms_var(--chat-ease)]`
- Same pattern at `composer.tsx:46`, `model-selector.tsx:14`, `model-selector.tsx:34`, `tool-fallback.tsx:50` (chat package → `var(--chat-ease)`), and `packages/ui-kit-system/src/scroll-area.tsx:5` (system package → `var(--pw-ease)`). Locate each with `grep -rn "transition:[^]]*_1[0-9]0ms[,\]]" packages/ui-kit-chat/src packages/ui-kit-system/src | grep -v var(` and fix every hit in those two packages the same way.

**E2 — Spinner timing consolidation.** Three near-identical spinner durations: `packages/ui-kit-chat/src/styled/classes.ts:7` `SPIN` hand-rolls `[animation:spin_0.6s_linear_infinite]`; `anim-tool-spin` = 0.7s; `anim-compact` = 0.85s. Target: `SPIN` uses `anim-tool-spin` (0.7s) instead of the hand-rolled 0.6s; leave `anim-compact` (progress-circle contexts) alone. One visible spinner cadence across chat.

**E3 — Terminal screen dim over-gated.** `packages/ui-kit-terminal/src/styled/terminal.tsx:7` `transition-opacity duration-200 motion-reduce:transition-none`: the dim is opacity-only (comprehension-aiding) — reduced motion should KEEP it. Remove `motion-reduce:transition-none`; add the token: `[transition:opacity_200ms_var(--pw-ease)]` replacing `transition-opacity duration-200`.

**E4 — streamdown defaults.** `packages/solid-streamdown/src/animate.ts:143` default `easing: 'ease'` → `'cubic-bezier(0.22, 1, 0.36, 1)'` (literal — this package must work outside the token scope) and `packages/solid-streamdown/src/styles.css:4` fallback `var(--sd-easing, ease)` → `var(--sd-easing, cubic-bezier(0.22, 1, 0.36, 1))`.

**E5 — streamdown reduced-motion refinement.** `packages/solid-streamdown/src/styles.css:7-11` currently `animation: none` for all `[data-sd-animate]`. Standard: keep opacity, drop movement. Target:

```css
@media (prefers-reduced-motion: reduce) {
  [data-sd-animate] {
    animation-name: sd-fadeIn;
  }
}
```

(forces the movement variants `sd-slideUp`/`sd-blurIn` down to the pure-opacity fade while keeping arrival feedback; duration/delay vars still apply).

**E6 — mirror-rail hover-feel parity (from extensions audit, whiteboard side).** `packages/extensions/whiteboard/src/client/inbox.tsx:13-15`, `thread.tsx:18-19`, `card.tsx:37`: hover background changes with no transition while siblings use `trans-bg`. Add `trans-bg` to ICON_BTN, FEED_ITEM, FILE_HEAD class constants.

**E7 — FAB hover lift touch-gate.** `apps/conciv/src/shell/fab.tsx:16` `hover:[transform:translateY(-0.125rem)]`: wrap in the fine-pointer media so touch taps don't stick a lift. UnoCSS: use the variant `[@media(hover:hover)_and_(pointer:fine)]:hover:[transform:translateY(-0.125rem)]` (and same gate for `hover:shadow-pw-hover`). Verify the variant compiles; if not, add a tiny rule in `apps/conciv/src/styles.css` keyed on `[data-pw-fab]:hover` inside the media query and drop the utility.

## Repo conventions to follow

- Every transition names its properties and rides `var(--pw-ease)`/`var(--chat-ease)` — exemplar: the `trans-*` family, `packages/uno-preset/src/motion.ts:34-53`.
- solid-streamdown is standalone — literals allowed, tokens not (matches its existing `--sd-*` var system).

## Steps

1. E1 sweep (grep-driven, fix every hit in the two packages).
2. E2, E3, E4, E5, E6, E7 individual edits.
3. Rebuild widget; run chat/terminal/streamdown package tests.

## Boundaries

- Do NOT change durations while adding easings (120ms stays 120ms).
- Do NOT convert `--chat-*` consumers to `--pw-*` or vice versa.
- Do NOT touch example apps (`apps/examples/*` are boilerplate demos; their `transition: all` / missing gates are recorded as known-and-accepted in plans/README.md).
- If a cited line drifted, STOP and report.

## Verification

- **Mechanical**: `grep -rn "_1[0-9]0ms[,\]]" packages/ui-kit-chat/src packages/ui-kit-system/src | grep -v "var("` returns nothing; builds + tests pass.
- **Feel check**:
  - Composer buttons/hover surfaces feel identical but settle with the quart curve (DevTools: computed transition-timing-function shows the cubic-bezier, not `ease`).
  - All chat spinners rotate at one cadence.
  - Reduced-motion emulation: terminal end-of-session dim still fades; streamed markdown still fades in (opacity only), even with a slideUp/blurIn config.
  - On a touch device emulation, tapping the FAB doesn't leave it hovering 2px up.
- **Done when**: greps are clean and the reduced-motion checks pass.
