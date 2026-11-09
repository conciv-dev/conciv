# Page agent simulator: port from the preview-branches toolbar

## Goal

When the agent acts on the live page (click, hover, fill, select, check, press, scroll), the user sees it happen:
a mask with the page-agent glow covers the page, the agent's cursor glides to each target, ripples on press, and
the action then runs as a real browser input sequence. Two clicks on the mask stop the run.

Today conciv has no visuals, and the act verbs in `packages/extensions/page/src/client/bodies.ts` dispatch thin
synthetic events (`el.click()` with no pointer sequence, `mouseover` with no coordinates, fill with no focus,
`KeyboardEvent` without `composed`/`cancelable`). Menus that open on `pointerdown` (Ark/zag/Radix) never open.

## Source (port verbatim)

Source repo: `/Users/omrikatz/Public/web/mono/packages/preview-branches/preview-branches-toolbar/src`. It is
well tested and looks right. Port the logic, the constants, the timings, the event order and the visuals exactly.
The only allowed changes are the ones this spec lists.

| Toolbar file                                                | What comes over                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `simulator/simulator.ts`                                    | All of it: mask, glow (`ai-motion`), task start/touch/end, 60 s idle timeout, two-click stop with hint and shake, `moveTo`, `hitTarget`, `blurLastClicked`, `dispatchPress`, `pointAt`, `simulateClick`, `setNativeValue`, `simulateFill`. `simulatePin` is dropped (comments only).                                                                 |
| `simulator/look.ts`, `cursor-fill.svg`, `cursor-border.svg` | The cursor art, ripple, shake, hint and their keyframes. Colours `AGENT_BLUE`/`AGENT_PURPLE` and the glow palette unchanged.                                                                                                                                                                                                                         |
| `simulator/dark-page.ts`                                    | All of it (glow light/dark mode).                                                                                                                                                                                                                                                                                                                    |
| `agent/act.ts`                                              | All of it: `hover`, `fill`, `select`, `setChecked` (incl. `aria-checked` widgets), `press`, `focusedElement`/`deepActive`.                                                                                                                                                                                                                           |
| `agent/driver.ts`                                           | The per-verb behaviour only: `actionable` (visible + not disabled checks and their messages), `withActionable`/`withElement` semantics, the `scroll` (instant, `pointAt` first) and `pressKey` bodies, which verbs start the task (`ACTING_VERBS`), `touchTask` on every call. Not its verb switch, snapshot, screenshot, comment, navigate or wait. |
| `agent/snapshot.ts`                                         | Only `isVisible`, `isDisabled`, `isHtml`, `isInput`, `isTextArea`, `isSelect` (used by the above).                                                                                                                                                                                                                                                   |
| `presence/cursor-pass.ts`                                   | The aimed-cursor engine: `CursorLook` (AGENT only), `aimCursor`, `glide`, `write` (transform, visibility, trail angle), `pressCursor`, `cursorElement`, `registerCursor`, `cursorStill`, `dropCursor`, `aimedCursors`, `placeCursors`, `windowAt`, `STILL_MS`.                                                                                       |
| `presence/cursor-at.ts`                                     | `pageAt` and `locateCursor` for the `PAGE` and `CHROME` zones, including the same-width exact path and the scaled fallback.                                                                                                                                                                                                                          |
| `presence/cursors.tsx`                                      | `Cursor` (AGENT branch) and `AimedCursors`.                                                                                                                                                                                                                                                                                                          |
| `presence/cursor-looks.tsx`                                 | `AgentLook` and the `replay` class helper.                                                                                                                                                                                                                                                                                                           |
| `host-page/frames.ts`                                       | `Point`, `frameDocument`, `frameChain`, `toTop` (the same-origin iframe path).                                                                                                                                                                                                                                                                       |
| `motion/motion.ts`                                          | `reducedMotion` only.                                                                                                                                                                                                                                                                                                                                |

## Allowed changes

1. **Styling: UnoCSS, not Panda.** `css()`/`cx()` become UnoCSS classes. The `SIMULATOR_CSS` string keeps its rules
   and keyframes but its Panda tokens (`--sizes-8`, `--spacing-1`, `--spacing-2`, `--durations-slow`,
   `--durations-normal`, `--easings-out`, `--easings-in-out`) map onto existing conciv design tokens. Every value
   derives from an existing token; flag any new token you think is needed instead of inventing one.
   `tooltipLook` becomes the conciv tooltip look from ui-kit.
2. **Frame loop.** The toolbar drives `placeCursors` from `host-page/page-watcher.ts` (`request()`,
   `layoutVersion()`). Port only what the cursor needs: a `requestAnimationFrame` pass that runs while dirty, and a
   layout version bumped on scroll (capture) and resize. Do not port the page watcher.
3. **Presence scope: agents only.** No person cursors, no demo cursor, no peer replay (`tracks`,
   `addCursorSample`, `replay`), no Storybook zones. `pageAt` keeps the `anchor`/`leaf` reflow fields out: an
   aimed cursor is located in the same tab at the same width, so the exact path always applies. Each cursor is
   keyed by the acting agent: `PageQuerySchema` and `ToolRequest` gain a required `agentId`, decided in one place
   where the request is built (`packages/core/src/runtime/core-runtime.ts`). Today that is the session id (one
   agent per session); the multi-agent lane supplies real per-agent ids there. A page serves page queries only for
   the session the widget shows (`packages/client/src/push-channel.ts`); all agents of that session reach it.
4. **Task lifetime.** conciv has no `done` verb. The task starts on the first acting verb (same set as the
   toolbar's `ACTING_VERBS`, mapped onto conciv's act tools), is touched on every page call, ends when that
   session's run ends (find the run lifecycle the widget already observes) or after the toolbar's 60 s idle
   timeout, whichever comes first.
5. **Stop.** The mask's two-click stop calls the widget's existing stop-run path for that session. No room, no
   stored stop slot.
6. **Mount.** The mask, glow and cursor go first in the widget's shadow root, as the toolbar puts them first in
   its own, so every widget surface after them stays above the mask. The page tool bodies must never resolve the
   widget's own elements as targets (the toolbar's `isOurs` rule).
7. **Code style.** conciv rules apply over the source: no comments (the lint rule deletes them; that is fine),
   functions not classes, no `as`/`any`/non-null, oxfmt formatting, kebab-case files, no barrels, no em dashes.
   Toolbar uses `.ts` import suffixes; conciv uses `.js`.

## Where it lives

The simulator and cursor engine run in the host page, next to the page tool dispatcher: `packages/page/src`
(Solid is fine there if the package already depends on it; otherwise say so before adding it). The act bodies in
`packages/extensions/page/src/client/bodies.ts` call the ported `simulateClick`, `pointAt`, `hover`, `fill`,
`select`, `setChecked`, `press`. Fewest files: fold small modules together rather than mirror the toolbar's file
split. `ai-motion` is approved as a new dependency (use the pnpm catalog, pin `0.4.8` like the toolbar).

## Tests

One journey in the existing browser test file for the owning package (no new test files), real Chromium, headless,
no mocks, no CSS/DOM implementation asserts, written to fail on today's `el.click()` first:

- the agent clicks an Ark/zag menu trigger that opens on `pointerdown`: the menu opens;
- the agent fills an input: the input receives focus and the framework sees the value;
- while the agent acts, a real user click on the page does not reach the page;
- two user clicks on the mask stop the run;
- a hidden or disabled target is refused with the toolbar's message.

## Not ported (follow-ups)

Listed in the final report back to Omri, so he can pick them up next:

- People presence: `PersonLook`, `people.tsx`, `avatars.tsx`, `follow.ts`, `join-toasts.tsx`, `peer-activity.tsx`,
  `aurora.tsx`, `live.ts`, `room-client.ts`, the peer replay in `cursor-pass.ts` (option 2 and 3 presence).
- Reflow anchoring for cursors seen at another viewport width (`anchoring/anchor.ts`, `siteping/*`, `leaf`).
- The page watcher (`host-page/page-watcher.ts`) beyond the cursor's frame loop.
- The walkthrough cursor (`DemoLook`, `walkthrough/*`) and the Clawd mascot.
- Driver verbs conciv already has its own version of: ARIA snapshot and its tab-marked refs, screenshot, wait,
  navigate under base; `comment` (pins) and the agent menu, the stored stop state and the MCP connect command.
- Serving page queries for sessions the widget is not showing (agents of one session already share the page).
