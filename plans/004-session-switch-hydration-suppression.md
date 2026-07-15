# 004 — Restore session-switch hydration suppression; reset stale tab-slide

- **Status**: TODO
- **Commit**: 7fb70e7b
- **Severity**: HIGH
- **Category**: Purpose & frequency
- **Estimated scope**: 4 files, ~30 lines

## Problem

Three related regressions make frequent thread/session switches replay entrance animations that mean nothing:

1. Dead suppressor. `apps/conciv/src/styles.css:104` ships:

```css
/* current — matches nothing */
[data-pw-hydrating] [data-pw-msg] {
  animation: none;
}
```

Repo-wide grep finds **zero** code setting `data-pw-hydrating` or `data-pw-msg`. The documented mechanism ("suppress per-row entrance while a switched thread hydrates") is a no-op, so switching sessions replays the 160ms `anim-msg` entrance (`packages/ui-kit-chat/src/styled/thread.tsx:133` and `:177`) on every historical message simultaneously.

2. The new Activity timeline has no suppression at all: `packages/ui-kit-chat/src/styled/activity.tsx:229` and `:254` put `anim-msg` on every turn; opening the rail (open by default on the current branch) animates the full history at once.

3. Stale directional slide. `apps/conciv/src/routes/panel.$sessionId.tsx:55-56`:

```tsx
// current
const [slideDir, setSlideDir] = createSignal<'left' | 'right' | null>(null)
const slideClass = () => (slideDir() === 'right' ? 'anim-tab-right' : slideDir() === 'left' ? 'anim-tab-left' : '')
```

`setSlideDir` is called in `switchView` (line 60) and never reset to `null`, so after the first tab switch the pane wrapper permanently carries `anim-tab-*`; any later remount of pane content (e.g. switching sessions, not tabs) replays a directional slide that lies about spatial context.

## Target

- Entrance animation (`anim-msg`) plays only for rows that actually arrive while the user watches; bulk-mounted history renders still.
- The wiring: the message list container gets `data-pw-hydrating` (or a passed class) while a thread switch is mounting; each animated row carries `data-pw-msg`. The existing CSS rule then works as written. Set the attribute for the mount frame(s) of a session/thread switch and remove it after one `requestAnimationFrame` (double-rAF for safety), so subsequent live messages animate normally.
- Same rule extended to the Activity timeline:

```css
[data-pw-hydrating] [data-pw-msg] {
  animation: none;
}
```

(row markers added in `activity.tsx:229`/`:254` — `data-pw-msg` on the same elements that have `anim-msg`).

- `slideDir` resets to `null` after the slide completes: `onAnimationEnd={() => setSlideDir(null)}` on the pane wrapper that receives `slideClass()`.

Implementation detail for the styled chat package: `ui-kit-chat` styled components should not know about `--pw-*` app conventions; add `data-pw-msg` via the app if a slot/prop exists, otherwise adding the attribute directly in the styled components is acceptable (it is inert without the app's CSS). Choose whichever the code structure makes smaller — attribute-in-package is the expected one-liner.

## Repo conventions to follow

- The CSS rule already exists and is documented at `apps/conciv/src/styles.css:103-106` — the fix makes reality match it, don't invent a new mechanism.
- Solid idiom: derive hydrating state from the router param change, e.g. a `createSignal(true)` flipped false in `onMount`/double-rAF of the thread view, or track `params().sessionId` changes with `createEffect` + rAF.
- No comments in TS/JS.

## Steps

1. `packages/ui-kit-chat/src/styled/thread.tsx`: add `data-pw-msg` to the two `anim-msg` roots (lines 133, 177).
2. `packages/ui-kit-chat/src/styled/activity.tsx`: add `data-pw-msg` to the two `anim-msg` divs (lines 229, 254).
3. `apps/conciv/src/routes/panel.$sessionId.tsx` (or the component that owns the thread mount): set `data-pw-hydrating` on the pane container whenever `sessionId` (and view) changes, clear it after a double `requestAnimationFrame`.
4. Same file: add `onAnimationEnd={() => setSlideDir(null)}` to the element receiving `slideClass()`.
5. Terminal rail: the rail's Activity timeline mounts with history — wrap its container with the same `data-pw-hydrating`-on-mount pattern (`packages/extensions/terminal/src/client/mirror-rail.tsx`, container div at line ~155), cleared after double-rAF, so opening the rail doesn't animate the backlog.
6. Rebuild widget: `pnpm turbo run build --filter=@conciv/widget`.

## Boundaries

- Do NOT remove `anim-msg` from the rows — live arrivals must keep their entrance.
- Do NOT introduce timers longer than double-rAF for the hydrating window.
- Do NOT change scroll behavior or `holdPosition` logic.
- If the cited lines have drifted, STOP and report.

## Verification

- **Mechanical**: typecheck + widget build + `pnpm turbo run test --filter=@conciv/ui-kit-chat --filter=@conciv/widget` pass; `grep -rn "data-pw-hydrating" apps packages --include='*.tsx'` now shows at least one setter.
- **Feel check**: dev app with two sessions, several messages each:
  - Switch sessions: history appears instantly still — no mass fade-in-up ripple.
  - Send a new message after switching: that one message still animates in.
  - Open/close the terminal activity rail: backlog renders still; a new live step animates.
  - Switch tab chat→terminal→chat, then switch session: no directional slide replays on the session switch.
- **Done when**: bulk mounts are motion-free, live arrivals animate, `slideDir` is null after each slide.
