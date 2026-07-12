# 013 — Extensions: whiteboard pin transform + entrances, spinner gates, test-runner collapsible, rail dedup

- **Status**: TODO
- **Commit**: 7fb70e7b
- **Severity**: MEDIUM
- **Category**: Performance / Accessibility / Cohesion / Missed opportunity
- **Estimated scope**: ~7 files across `packages/extensions/{whiteboard,terminal,test-runner}/src`, ~50 lines

## Problem & Target (itemized)

**W1 — Pins move via left/top per frame.** `packages/extensions/whiteboard/src/client/pins/pins.tsx:115` (and the anchor at :164):

```tsx
style={{left: `${pos().x}px`, top: `${pos().y}px`, transform: 'translate(-50%, -50%)'}}
```

Position updates on every pointermove during drag and on every viewport pan → layout per frame. Target: pin fixed at `left:0;top:0`, everything in the transform:

```tsx
style={{transform: `translate(calc(${pos().x}px - 50%), calc(${pos().y}px - 50%))`}}
```

**W2 — Inbox drawer teleports.** `whiteboard/src/client/inbox.tsx:104`: the fixed right-side panel mounts/unmounts with zero motion. Target: add `anim-presence-in` to the PANEL class (entrance only; exit stays instant — acceptable).

**W3 — Compose popover has no origin.** `whiteboard/src/client/pins/compose.tsx:17-21`: the comment composer appears at the click point with no entrance. Target: `anim-presence-in` on the dialog root (scale from 0.96 at the click point — the element is positioned at the click, so default origin center reads as "from the point").

**W4 — Source-linked pin snap-back.** `pins.tsx:142-149`: releasing a source-linked pin instantly teleports it back to origin. Target: with W1's transform-based positioning, add `[transition:transform_200ms_var(--pw-ease-expo)]` to the pin while NOT dragging (`classList={{'[transition:transform_200ms_var(--pw-ease-expo)]': !dragging}}`) so the snap-back glides; during drag the class is absent (no per-frame transition retarget). Whiteboard rule: this is a style-only change — no db writes in effects.

**T1 — Ungated pulse.** `terminal/src/client/mirror-rail.tsx:59` `'bg-pw-text-3 anim-pulse': status === 'connecting'` → append `motion-reduce:animate-none` beside `anim-pulse` (i.e. the classList key becomes `'bg-pw-text-3 anim-pulse motion-reduce:animate-none'`).

**T2 — Status dot color snaps.** `mirror-rail.tsx:55-60`: add `trans-bg` to the dot's base class so success/danger/neutral swaps ease at 120ms like sibling surfaces.

**T3 — Hand-typed duplicate.** `mirror-rail.tsx:103` `[transition:transform_150ms_var(--pw-ease)] motion-reduce:transition-none` → `trans-tf150 motion-reduce:transition-none` (shortcut at `packages/uno-preset/src/motion.ts:48`; exemplar user: test-runner `card.tsx:38`).

**R1 — Ungated spinner.** `test-runner/src/tool/card.tsx:49` (and the summary-bar use at :189): append `motion-reduce:animate-none` next to `anim-test-rot`.

**R2 — Mismatched expand affordances.** `test-runner/src/tool/card.tsx:240-243`: per-test error details toggle via raw `<Show>` while file groups two lines up use animated `Collapsible.Root/Content`. Target: wrap the error block in the same `Collapsible` the file groups use (import already present in the file), collapsed by default, driven by the existing `openTest() === key` state via `open`/`onOpenChange` — visual parity with the sibling pattern.

**WB-UI — dup transition.** `whiteboard/src/client/ui.tsx:137` hand-types `trans-color-bg`'s value → replace with the `trans-color-bg` shortcut.

## Repo conventions to follow

- Spinner gate: `motion-reduce:[animation:none]` / `motion-reduce:animate-none` — exemplar `packages/ui-kit-chat/src/styled/now-line.tsx:12`.
- Whiteboard: never write to the db inside subscribe/effect/render — all edits here are class/style only.
- Ark Collapsible animates via the `anim-collapse-*` keyframes on data-state (`packages/ui-kit-system/src/collapsible.tsx:4`) — reuse, don't hand-roll.

## Steps

1. W1: refactor pin + anchor positioning to single-transform (pins.tsx:115, :164).
2. W4: add the conditional snap-back transition (depends on W1).
3. W2, W3: add `anim-presence-in` to inbox panel and compose dialog roots.
4. T1, T2, T3, R1, WB-UI: the five class-string swaps.
5. R2: convert the error-details `<Show>` to `Collapsible` matching the file-group usage above it.
6. Rebuild widget; run extension tests: `pnpm turbo run test --filter=@conciv/extension-terminal --filter=@conciv/extension-test-runner --filter=@conciv/extension-whiteboard` (adjust filter names to actual package names in each package.json).

## Boundaries

- Do NOT animate the Excalidraw canvas visibility flip (island.tsx:329) in this plan — light-DOM/hit-test risk needs its own investigation.
- Do NOT animate the activity-rail width (mirror-rail.tsx:158) — xterm fit thrash; separately tracked.
- Do NOT touch pin data flow, drift prompts, or comment models.
- If cited code drifted, STOP and report.

## Verification

- **Mechanical**: typecheck + builds + extension tests pass.
- **Feel check**:
  - Drag a pin: smooth, and DevTools Performance shows no per-frame Layout from the pin.
  - Release a source-linked pin away from its anchor: it glides back (~200ms expo) instead of teleporting.
  - Open the whiteboard inbox: panel scales in subtly. Click empty canvas to comment: composer settles in from the click point.
  - Terminal rail while connecting: dot pulses; reduced-motion emulation → static. Status change connecting→open: color eases.
  - Test-runner card: open a failing test's details — same collapse motion as the file groups.
- **Done when**: all items above observable; no `[transition:transform_150ms` literal remains in mirror-rail.
