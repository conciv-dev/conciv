# 011 — Chat surfaces: hover action bar, footer notices, attachments, permission card, scroll button

- **Status**: TODO
- **Commit**: 7fb70e7b
- **Severity**: MEDIUM
- **Category**: Purpose & frequency / Missed opportunity
- **Estimated scope**: 6 files in `packages/ui-kit-chat/src/styled` + `apps/conciv/src/chat`, ~30 lines

## Problem

1. **Action bar animates on hover** (`packages/ui-kit-chat/src/styled/action-bar.tsx:47` and `:83`): the bar mounts on message hover (`primitives/action-bar/action-bar.tsx:69` `<Show when={status() !== 'hidden'}>`) with `anim-presence-in` — a 180ms scale/fade keyframe on a tens-to-hundreds-per-day trigger. Sweeping the pointer down a thread restarts the keyframe on every message; hover-out teleports it away. Frequency table: hover-frequency motion → remove or drastically reduce.

2. **Footer siblings disagree** (`apps/conciv/src/chat/chat-pane.tsx:43-44`): the reconnect banner has `anim-msg` while the error row (role="alert" + Retry) has no entrance — mismatched treatment; both mount/unmount with a layout jump.

3. **Attachments/grab chips teleport** (`packages/ui-kit-chat/src/styled/attachment-ui.tsx:27`, `apps/conciv/src/chat/grab-reference.tsx:52`): tiles appear/disappear in the composer with zero motion — the row reflow reads as a glitch.

4. **Permission card enters flat** (`packages/ui-kit-chat/src/styled/tools/permission-card.tsx:16`): the approval interrupt is a rare, high-attention moment (delight/emphasis budget exists) rendered with no entrance emphasis.

5. **ScrollToBottom hide pops** (`packages/ui-kit-chat/src/styled/thread.tsx:251`): `[transition:opacity_120ms_var(--chat-ease)] … data-[at-bottom]:opacity-0 data-[at-bottom]:invisible` — `visibility` isn't transitioned with a delay, so on hide `invisible` applies instantly, truncating the fade.

## Target

1. Action bar: remove the entrance keyframe entirely from the two class strings (delete `anim-presence-in`; frequency rule says hover UI appears instantly). Keep layout/positioning classes byte-identical otherwise.
2. `chat-pane.tsx`: give ERROR the same `anim-msg` as RECONNECT (they're occasional-frequency mounts; plan 001 makes `anim-msg` an 8px rise).
3. Attachments + grab chips: add `anim-presence-in` (180ms scale-0.96 fade — its correct use: occasional mounts) to the tile root class in `attachment-ui.tsx:27` and the chip root in `grab-reference.tsx:52`.
4. Permission card root (`permission-card.tsx:16`): add `anim-msg-lg` (180ms rise — reads as emphasis without inventing a new effect).
5. ScrollToBottom: extend the transition to `[transition:opacity_120ms_var(--chat-ease),visibility_0s_linear_120ms]` and keep `data-[at-bottom]:invisible`. On show, `visibility` snaps visible at 0s (transition-delay only applies on hide → exactly the `trans-pop-out` pattern at `packages/uno-preset/src/motion.ts:52`). Wait — a single transition list applies both directions; `visibility_0s_linear_120ms` delays the hide correctly but also delays show by 120ms. Fix: also add `data-[at-bottom]:[transition:opacity_120ms_var(--chat-ease),visibility_0s_linear_120ms]` as the hidden-state override and keep the base (visible-state) transition as plain `[transition:opacity_120ms_var(--chat-ease)]` — state-specific transition wins while that state is active, so hide delays visibility and show doesn't.

## Repo conventions to follow

- `anim-presence-in` for occasional mounts: `packages/ui-kit-chat/src/styled/follow-up-suggestions.tsx:11`.
- Never remove the always-rendered + absolute + `data-at-bottom` scroll-button structure (regression guard for the thread-jump bug).
- Styled chat components use `--chat-*` tokens only, never `--pw-*`.

## Steps

1. `action-bar.tsx:47,83`: delete `anim-presence-in` from both class strings.
2. `chat-pane.tsx:43`: append `anim-msg` to ERROR.
3. `attachment-ui.tsx:27` + `grab-reference.tsx:52`: append `anim-presence-in`.
4. `permission-card.tsx:16`: append `anim-msg-lg`.
5. `thread.tsx:251`: apply the two-transition visibility pattern from Target.
6. Rebuild widget + run ui-kit-chat tests.

## Boundaries

- Do NOT add exit animations to the action bar or attachments (unmount-on-state; out of scope).
- Do NOT touch primitives/ — styled layer only.
- Do NOT alter FOCUS/aria attributes.
- If cited class strings drifted, STOP and report.

## Verification

- **Mechanical**: typecheck + widget build + `pnpm turbo run test --filter=@conciv/ui-kit-chat` pass.
- **Feel check**:
  - Sweep the pointer across 10 messages fast: action bars appear instantly, zero flicker/scale churn.
  - Kill the dev server mid-session: error row rises in like the reconnect banner; footer doesn't jump.
  - Attach a file / grab an element: chip settles in with a subtle scale; remove it — row reflow reads intentional.
  - Trigger a permission prompt: the card rises in with slight emphasis.
  - Scroll up then to bottom repeatedly: the button fades fully out (120ms visible fade on hide — DevTools animations at 10% speed to confirm the fade completes before visibility flips).
- **Done when**: all five behaviors hold.
