# Whiteboard comments UI — Liveblocks-parity redesign

Status: READY TO BUILD — all decisions resolved, all claims verified against the code.
Date: 2026-06-28
Owner: whiteboard extension
Reference: the supplied screenshot (Excalidraw canvas + pin threads + right inbox panel)

This document is executable as written. Every section is the single source of truth for
its area; there are no "supersedes on conflict" layers and no open questions. Build in the
order of §15. Each claim below was checked against the real code at the cited path.

## 1. Goal and scope

Recreate the reference comments experience inside the whiteboard extension:

- **Pin thread card** floating on the canvas, anchored to its pin: header toolbar, author
  avatars, relative time, per-comment overflow menu, @mention composer.
- **Right inbox panel**: tabbed header, quick search, filter menu (sort by date / unread,
  show-resolved toggle), "Mark all as read", scrollable feed with participant avatars and
  reply counts.
- **Agent presence** marker on the canvas (where an AI agent is acting).

Solid only. Ark UI for every interactive surface. The visual layer is bespoke CSS over
Ark's headless behavior.

### Multiplayer model — one developer + N AI agents, never two humans

A room is exactly one human (the developer) plus N AI agents. There is no second human.
The reference's named-people roster is borrowed chrome; the real cast is the dev and the
agents. This constraint drives the whole data model:

- **Author identity has two kinds.** `authorKind:'human'` is the dev; `authorKind:'ai'` is
  an agent labelled by `authorModel`. No multi-human roster, no guest disambiguation.
- **Read state is single-user**, keyed to the dev's persisted identity (§5).
- **Participant avatar stacks** show the dev + the agents that posted in a thread (small N).
  No "+99" overflow math.
- **@mentions are label-only in v1.** A mention renders a chip and stores an id; it does NOT
  notify or trigger an agent (agents act per turn via the harness; a comment triggers no
  turn). No notification infrastructure.
- **Agent presence is in scope** (§12); human-mouse cursors stay dormant (§12).
- **Sync to verify is agent-write -> dev-view**: `api.callTool(...)` then assert on
  `api.page`. `secondClient` is used only to verify the dev's own read-state durability
  across two tabs.

Cut from v1: presence top bar, Share button, copy-link / deep-link (no router or URL state
exists in the widget).

## 2. What exists today

`packages/extensions/whiteboard/`

| Piece                                                                          | File                                                    | Action                              |
| ------------------------------------------------------------------------------ | ------------------------------------------------------- | ----------------------------------- |
| Jazz schema (`comments`, `pins`, `cursors`, `canvasElements`, `canvasPending`) | `src/shared/schema.ts`                                  | extend (§5)                         |
| Canvas pins (drag, anchor line, status fill)                                   | `src/client/pins/pins.tsx`                              | migrate to scene coords (§6)        |
| Thread panel (fixed bottom-right)                                              | `src/client/pins/thread.tsx`                            | rebuild as anchored card (§8)       |
| New-comment composer                                                           | `src/client/pins/compose.tsx`                           | upgrade to mention composer (§11)   |
| Overlay mount (shadow surface, `EnvironmentProvider`)                          | `src/client/overlay.tsx`                                | add inbox + model wiring            |
| Excalidraw mount, cursors, viewport                                            | `src/canvas/island.tsx`                                 | dark + viewport + presence (§6,§12) |
| Extension entry, composer-slot buttons                                         | `src/client.tsx`                                        | add inbox toggle                    |
| Agent tools                                                                    | `src/tool/comment/*`, `tool/element/*`, `tool/canvas/*` | scene coords + presence (§6,§12)    |
| Server context                                                                 | `src/server/context.ts`                                 | expose `model` (§5)                 |
| Permissions                                                                    | `src/shared/permissions.ts`                             | add `reads` (§5)                    |

ui-kit-system already ships (Ark, shadow-safe, `EnvironmentProvider`-wired): Button,
Collapsible, HoverCard, ScrollArea, Combobox, Dialog, TextField, Progress.

Token palette is dark + magenta (`--pw-*`, `tokens.css`). The Excalidraw island currently
renders `theme="light"` with `viewBackgroundColor:'transparent'`.

## 3. Resolved decisions

1. **Theme: dark.** Flip Excalidraw to `theme="dark"` AND add an opaque dark backdrop (§4).
   Reuse `--pw-*`; accent stays mandarax magenta.
2. **Read/unread: build the `reads` table now**, keyed to the dev's persisted Jazz account
   id (§5).
3. **Canvas pan to a thread: in scope.** Pins migrate to scene coordinates (§6).
4. **Agent presence: in scope**, restricted to actions where the server has a scene
   coordinate (§12).
5. **Agent/AI label source: extend `ToolRequest` with the model** (§5). This also populates
   `authorModel` on AI comments.
6. **Stale agent presence cleanup: the dev's client garbage-collects** stale rows (§12). No
   server turn-end hook.
7. **All three surfaces ship together**, landed slice-by-slice per §15.
8. **Cut: copy-link, presence top bar, Share button. @mentions are label-only.**

## 4. Theme: dark canvas

The comments UI and Excalidraw share one dark theme; reuse `--pw-*`, no new token set.

1. **Flip the island.** `overlay.tsx` `<Island ... theme="dark" />`. `island.tsx` already
   maps `theme` to `THEME.DARK`; the injected `@excalidraw/excalidraw/index.css` carries
   `.excalidraw.theme--dark`. (Verified: 38 dark rules incl. `--theme-filter`.)
2. **Add an opaque dark backdrop.** `island.tsx` sets
   `appState.viewBackgroundColor:'transparent'` (line 222) and both layers are transparent,
   so the invert filter darkens nothing. Set `viewBackgroundColor` to an opaque dark fill
   (`--pw-panel-sunk`) so the canvas reads dark. This is the change that makes the canvas
   actually dark.
3. **Flip the anchor-line stroke.** `pins.tsx` line 109 `stroke="#adb5bd"` ->
   `stroke="var(--pw-line-2)"`. Keep the `border-white` pin ring, the black drop shadow,
   and the `PALETTE` guest colors — all legible on dark.
4. **Excalidraw dark = `invert(93%) hue-rotate(180deg)`**: drawn colors render inverted vs
   their stored value. This is inherent to Excalidraw dark mode; it is expected, not a bug.

Token map:

```
card / panel        --pw-panel / --pw-glass
sunk input          --pw-panel-sunk / --pw-sunken
hairline            --pw-line / --pw-line-soft / --pw-line-2
text / 2 / 3        --pw-text / --pw-text-2 / --pw-text-3
accent fills/bars   --pw-accent / --pw-accent-08 / --pw-accent-20 / --pw-accent-line
accent TEXT         --pw-accent-hi / --pw-accent-link   (raw --pw-accent fails AA <18px)
agent presence      --pw-agent
unread bar          --pw-accent
resolved            --pw-success
danger (Remove)     --pw-danger / --pw-danger-line
radius              --pw-r-sm/md/lg/pill
shadow              --pw-shadow / --pw-shadow-lg
ease                --pw-ease / --pw-ease-expo
```

CSS rules every new surface follows (presetWind4 reset-leak): remove borders/outlines with
`[border:none]` / `[outline:none]` (never `border-0` / `outline-none`); arbitrary
backgrounds via `[background:…]`; reuse the `focus-ring` shortcut. Avatar overlap halo:
`[box-shadow:0_0_0_2px_var(--pw-panel)]`. Menu/Tooltip/Popover entrance use the `anim-combo`
(opacity) shortcut, not collapse-height keyframes (those are only for Collapsible/Accordion).

## 5. Identity and data model

`room == sessionId` is an invariant (commit 952f2b3). `comments` key on `sessionId`;
`pins`/`cursors` key on `room`; both equal the session id. **All new tables and rows key on
`sessionId`** to join cleanly with `comments`.

### Dev identity = the persisted Jazz account (NOT the sessionStorage guest)

`selfIdentity()` in `overlay.tsx` mints a `sessionStorage` guest (`Guest xxxx`) that
regenerates per tab and is wiped on restart. It stays the source of `cursors.peerId` only.
The dev's **author and read-state identity is the persisted Jazz account id** from
`useLocalFirstAuth` (`jazz-client.tsx`). Today only the account `secret` is consumed there;
expose the account id out of `WhiteboardJazzProvider` down to `Canvas` and use it for
`comments.authorId` and `reads`. The two identities are deliberately separate; do not join
them.

Durability: the driver is `{type:'memory'}` (no OPFS); durability comes from the server
`dataDir` re-sync. The account id is stable across reload because `useLocalFirstAuth`
persists its secret. Step 0 proves this with a reload assertion.

### `comments` — add author columns

```
authorId: col.string().optional(),
authorName: col.string().optional(),
authorAvatar: col.string().optional(),
```

- Human comments (created client-side in `overlay.tsx createComment` and `thread.tsx send`):
  write `authorId` = Jazz account id, `authorName`/`authorAvatar` = the dev's profile.
- AI comments (created server-side): keep `authorKind:'ai'`, set `authorModel` and
  `authorName` = the model (from `ctx.model(request)`, below). When the model is null, label
  "AI" and use the agent glyph.
- Existing rows have null `authorId`: treat null as not-the-dev for Remove-gating, and use
  `authorKind`-derived initials for the avatar.

### `reads` — new table (single-user)

```
reads: schema.table({
  sessionId: col.string(),
  threadId: col.string(),
  accountId: col.string(),
  lastReadAt: col.timestamp(),
}),
```

A thread is unread when its newest non-self comment `createdAt` > the dev's `lastReadAt`
(exclude the dev's own comments so replying never marks a thread unread to yourself).
"Mark all as read" upserts `lastReadAt = now` per visible thread. "Sort by unread" orders
unread-first. All derived client-side via a second `useAll(reads.where({sessionId}))`
subscription joined to comments.

### `cursors` — add kind

```
kind: col.enum('human', 'agent').default('human'),
```

Existing rows default to `'human'`. Used by §12 to style agent presence.

### Permissions

Add `'reads'` to `scopedTables` in `permissions.ts` (a table absent from that list has every
write denied). `cursors.kind` and the `comments` columns need no policy change.
`allowDelete.always()` means author-only Remove is a UI affordance, not a security boundary.

### `ToolRequest.model` — make the agent's model reachable server-side

Today `ToolRequest = {sessionId: string}` (`packages/extension/src/types.ts:30`); the
`/api/mcp` request carries no model (`mcp.ts:40`). The model IS known at turn launch
(`turn.ts:118`: `chatReq.model ?? forwardedProps?.model ?? data?.model`). Wire it through:

1. `packages/extension/src/types.ts`: `ToolRequest = {sessionId: string; model: string | null}`.
2. `packages/core/src/api/chat/turn.ts`: at launch, persist the resolved model to the session
   store — `deps.store.update(sessionId, {model})` (the store already supports `update`,
   turn.ts:168, and `get`, launch.ts:29). Add `model` to the stored session record.
3. `packages/core/src/api/mcp/mcp.ts`: `registerMcpRoutes` takes a
   `sessionModel: (sessionId: string) => string | null` resolver (reads the store); build
   `request = {sessionId, model: sessionModel(sessionId)}`. Wire the resolver from the call
   site that has the store.
4. `packages/extensions/whiteboard/src/server/context.ts`: add `model: (request) =>
request.model`. Agent tools read `ctx.model(request)` for `authorModel` and the presence
   label.

## 6. Pin coordinate model + canvas pan

Pins must move to **scene coordinates** so they follow pan/zoom and so the inbox can pan to
them. Cursors already use scene coords (`island.tsx onPointerUpdate` writes scene
`pointer.x/y`); pins are the only screen-space holdout. Excalidraw 0.18.1 exports
`sceneCoordsToViewportCoords` / `viewportCoordsToSceneCoords` and `api.scrollToContent`
(verified). Never hand-roll the zoom math.

### Island exposes (callback-ref up to `Canvas`, like `registerComment`)

- a **viewport** signal `{scrollX, scrollY, zoom, offsetLeft, offsetTop}` published from
  `api.onScrollChange(cb)` (the purpose-built pan/zoom subscription — not the noisy
  `onChange`). `offsetLeft/offsetTop` come from `appState` and are required by the
  converters even though the fixed `inset:0` container makes them ~0. This is local Solid
  state, no Jazz write.
- `panToScene(x, y)` -> `api.scrollToContent` to center a pin.

### Pin coordinate migration (convert every write site)

`pins.x/y` and `pins.anchorX/anchorY` become scene coordinates. Existing runtime pin rows are
discarded (v0, no users, no seed/migration writes `pins.x/y` — verified). Convert at all four
write sites:

1. **Client create** (`overlay.tsx createComment`, uses `pick.rect` screen center + the
   `{x:80,y:80}` fallback): convert with `viewportCoordsToSceneCoords(point, viewport)`.
2. **Drag** (`pins.tsx`, currently raw `clientX/clientY` deltas with no `/zoom`): recompute
   scene coords from the drag-end screen point via `viewportCoordsToSceneCoords`.
3. **Offset-line origin** `anchorX/anchorY` (`pins.tsx` `keep()`): store scene coords too, so
   both dashed-line endpoints live in scene space and the line stays correct under pan/zoom.
4. **Agent tools** `comment.create` / `comment.move` (`comment/server.ts`): the `x/y` inputs
   are declared SCENE coordinates. Update the tool `description`/`promptSnippet` to say
   "scene coordinates"; the agent already reasons in scene space via `canvas.read` (element
   x/y are scene). The headless server stores them verbatim — no conversion.

### Rendering

`PinsLayer` projects every pin scene->screen with `sceneCoordsToViewportCoords` in a
`createMemo` over the viewport signal, so pins reposition whenever the viewport changes. The
`ThreadPopover` anchor and `Compose` anchor read the same projection. No `requestAnimationFrame`
loop; the memo recompute on the throttled scroll signal is sufficient.

Feed click: `panToScene(pin.x, pin.y)` then `setOpenCid(cid)`.

## 7. ui-kit primitives to add

Thin Ark wrappers in `packages/ui-kit-system/src/`, same shape as `hover-card.tsx`, each with
a `.stories.tsx`, verified in Storybook. Render every Positioner inline — never inside a
solid `<Portal>` (a Portal escapes the shadow root and the `EnvironmentProvider`). New
wrappers inherit the environment automatically.

| Wrapper   | Ark                                                                           | Used by                                      |
| --------- | ----------------------------------------------------------------------------- | -------------------------------------------- |
| `Avatar`  | `Avatar` (Root/Image/Fallback)                                                | comment rows, feed, presence; stacks are CSS |
| `Menu`    | `Menu` (incl. `CheckboxItem`, `RadioItemGroup`, `RadioItem`, `ItemIndicator`) | overflow menu, filter menu                   |
| `Tooltip` | `Tooltip`                                                                     | header icon buttons                          |
| `Switch`  | `Switch`                                                                      | standalone only                              |
| `Tabs`    | `Tabs`                                                                        | inbox header                                 |
| `Popover` | `Popover` (expose `Anchor`)                                                   | thread card, mention listbox                 |

Corrected mappings (do not deviate):

- **@mention is NOT an Ark `Combobox`.** Combobox is input-bound and owns Arrow/Enter/Esc; it
  fights a multiline textarea. Use a plain `<textarea>` + a `Popover`-anchored listbox at the
  caret (§11).
- **Show-resolved is NOT a `Switch` inside a `Menu.Item`** (a focusable input inside a
  menuitem breaks roving focus). Use `Menu.CheckboxItem` (`menuitemcheckbox`) styled like a
  switch, with `closeOnSelect={false}`.
- **Sort uses `Menu.RadioItemGroup` / `Menu.RadioItem` / `Menu.ItemIndicator`.**
- **Tooltip describes, it does not name** — every icon button keeps a real `aria-label`.

## 8. Surface A — pin thread card

One **controlled** Ark `Popover` rendered in `Canvas` (not per-pin), `open={!!openCid()}`,
`positioning.strategy:'fixed'`, placement `right-start` with collision flip. Width 340px,
max-height 70vh. The pin stays a plain `<button>` calling `onOpen(cid)` (an Ark
`Popover.Trigger` would collide with the pin's `DRAG_THRESHOLD` click/drag logic).

```
+--------------------------------------------------+
|  < >              (resolve)        (trash)  (x)  |  header toolbar
+--------------------------------------------------+
|  (av) Dev        a day ago                (...)  |  comment row
|  comment text…                                   |
|                                                  |
|  (av) Opus       30min ago                (...)  |  <- overflow menu
|  comment text…                      +--------+   |
|                                     | Remove |   |  (danger)
|                                     +--------+   |
+--------------------------------------------------+
|  (you) [ Reply, @mention someone…       ] ( ^ )  |  composer
+--------------------------------------------------+
```

- **Anchor across subtrees**: `PinsLayer` keeps a `Map<cid, HTMLButtonElement>` ref registry;
  `Canvas` reads it to position `Popover.Anchor` at the selected pin's projected position.
- **Drag**: clear `openCid` when the selected pin starts dragging; the popover re-anchors on
  the next open. Do not follow a moving pin.
- **Focus**: non-modal popover. `initialFocusEl` -> the composer. `finalFocusEl` -> the pin
  element from the registry (Ark restores to its trigger, which is not the pin here, so wire
  it explicitly).
- **Header**: `< >` step through `orderedThreads` (the §13 model, shared with the inbox);
  resolve toggles `status`; trash deletes the whole thread with reply cascade (Dialog
  confirm, §10); X closes. Each icon wrapped in `Tooltip` with an `aria-label`.
- **Comment row**: `Avatar` (image -> initials fallback), author name (`--pw-text`), relative
  time (`--pw-text-3`), trailing overflow `Menu` shown on row hover/focus and always present
  for keyboard users. The row preserves `renderPart` -> `ToolCallCard` for `type:'tool'`
  parts (AI tool calls), with the new `MentionPart` branch slotted before the raw-JSON
  fallback in `thread.tsx`.
- **Composer**: avatar + auto-growing `<textarea>` (CSS `field-sizing: content`; Chromium
  target, degrades to non-growing) + send button disabled until non-empty. @mention per §11.

The popover is always mounted (controlled), preserving the reply draft across prev/next; keep
a `draftByCid` map for per-thread drafts. Reuse the existing `resolve()` / `send()` logic.

## 9. Surface B — per-comment overflow menu

Ark `Menu` triggered by the `...` button. Items: leading icon + label. **Remove** is the only
item in v1 (no copy-link); `--pw-danger` text with a `bg-pw-danger-10` hover wash. The Remove
item renders only when `comment.authorId` equals the dev's account id (null authorId = not
the dev). Ark provides roving focus, type-ahead, Esc, and `aria-*`.

## 10. Surface C — inbox panel

A fixed right-edge panel in the existing overlay layer (overlay is `position:fixed; inset:0;
pointer-events:none`; the panel sets `pointer-events:auto`). Width `clamp(320px, 28vw,
400px)`, full height with inset margin, card radius/shadow.

```
+-------------------------------------------+
| (comments)                       (pin)(x) |  Ark Tabs + actions
+-------------------------------------------+
| (search)  Quick search              ⌘3   |  TextField (local state)
+-------------------------------------------+
| (filter)              v  Mark all as read |  Menu trigger + action
+-------------------------------------------+
|  | (av) Dev        a moment ago           |  feed item (unread = left bar)
|  |  comment text…                         |
|  |  (av)(av)  2 replies                    |
|    (av) Opus      a moment ago            |
|     comment text…                         |
|     (av)  1 reply                          |
|  …                                  scroll |  ScrollArea
+-------------------------------------------+
```

- **Tabs**: Ark `Tabs`, comments active. Library/Present tabs are hidden in v1 (no targets).
- **Filter menu**: Ark `Menu` with `RadioItemGroup` ("Sort by date" / "Sort by unread") and a
  `CheckboxItem` "Show resolved comments" (`closeOnSelect={false}`). Show-resolved defaults
  OFF (resolved threads hidden from the feed; the resolved pin stays on canvas with its green
  fill; resolving collapses the open card).
- **Feed item**: a `<button>` labelled author + time + unread. Click -> `panToScene(pin.x,
pin.y)` + `setOpenCid(cid)`. Unread -> `--pw-accent` left bar + heavier title. Participant
  avatars = distinct authors in the thread (dedupe by `authorKind`+`authorModel`, human is a
  singleton; no "+99" math). Reply count = thread children minus root (omit "N replies" for a
  single-comment thread).
- **Mark all as read**: upserts `reads.lastReadAt = now` for every visible thread.
- **Search**: local signal, filters the feed only; it does NOT constrain the card's prev/next.

Sort/filter are client-side derivations over `useAll`. The accent-colored `⌘3` hint uses
`--pw-accent-hi` (small text).

## 11. @mention composer

Plain `<textarea>` + a `Popover`-anchored listbox (NOT Ark `Combobox`):

- On `onInput`, detect a trailing `@token` at the caret; compute the caret rect with a
  Range and store it in a signal; feed it to the listbox `positioning.getAnchorRect`. No
  effect, no `scrollHeight` measuring.
- Options = the dev + the agents, sourced from a stable participant list (distinct comment
  `authorId`/`authorModel`), independent of the ephemeral `cursors` rows.
- Select -> splice a mention chip into the draft and append `{type:'mention', id, label}` to
  `parts` (`col.json()`, no migration). `label` stays human-readable for the AI
  `comment.read` path.
- Esc / space closes; arrow/enter navigate via the listbox.
- A mention is label-only: it renders a chip and stores an id; it does not notify or trigger
  an agent. An unresolved id renders as its plain `label`.

## 12. Agent presence

Show where an AI agent is acting on the canvas, reusing the render substrate (`cursors`
subscription -> `api.updateScene({collaborators})` -> Excalidraw labeled pointers). Only the
write side and GC are new.

- **Write (server-side, idempotent).** The browser cursor writer (`cursorRowId` + heartbeat)
  is per-mount browser state and is not reusable; agents write via `ctx.db`. On a
  coordinate-bearing action, the tool upserts:
  `upsert(app.cursors, {room: sessionId, peerId: agentId, kind:'agent', name:
ctx.model(request) ?? 'AI', color: --pw-agent, x, y, lastSeen: now}, {id:
stableUuid(sessionId + agentId)})` — `stableUuid` is the existing idempotent-upsert helper
  (`island.tsx:33`). `agentId` is a fixed per-agent id.
- **Coordinate source (only coord-backed actions write presence).** `comment.create` /
  `comment.move` use `input.x/y` (scene). Any `cid`-bearing tool looks up the pin via
  `pinByCid` (`comment/server.ts:31`). `canvas.update` / `canvas.delete` read `current.data`
  for the stored x/y/w/h center. `canvas.draw` / `canvas.diagram` / `canvas.connect` convert
  in the browser, so the server has no scene coord — they write NO presence row. Read/list/
  export/reference actions write no presence.
- **Throttle** server-side (mirror `CURSOR_THROTTLE_MS`) so bursty multi-tool turns do not
  storm the `cursors` subscription.
- **Cleanup (client GC).** Jazz has no TTL; rows persist until deleted. The dev's client, in
  the `cursors` subscription handler, deletes any `kind:'agent'` row whose `lastSeen` is older
  than `CURSOR_STALE_MS` (delete is permitted). One owner, bounded growth, no server turn-end
  hook. The 15s render filter still hides stale rows before deletion.
- **Label**: `ctx.model(request)` (§5) gives the model name; `--pw-agent` color. Excalidraw
  renders it as a labeled pointer (the v1 affordance). A long single tool call does not
  refresh `lastSeen` mid-call, so its marker blinks out at 15s and returns on the next
  action — accepted for v1.

## 13. Component / signal tree

```
Canvas                      owns createCommentModel(sessionId, accountId):
                              openCid / setOpenCid          (single selection source)
                              sortMode, showResolved        (shared: feed + card nav order)
                              orderedThreads = memo          (shared ordering)
                              readOf / markAllRead           (reads, keyed on accountId)
                              composePick, createComment
  Island                    exposes viewport{…} + panToScene (§6)
  PinsLayer                 pins scene->screen projected via viewport; drag/prompt local;
                              pinRefs Map<cid,HTMLButton>; onOpen->setOpenCid; clears
                              openCid on drag-start
  ThreadPopover (controlled, open=!!openCid; Popover.Anchor at projected pin)
    ThreadHeader            prev/next over orderedThreads; resolve / trash / close
    CommentRow xN           Avatar + relative time + overflow Menu (author-gated);
                              renderPart/ToolCallCard + MentionPart
    MentionComposer         textarea (field-sizing) + caret-anchored Popover listbox;
                              send-disabled memo; draftByCid
  Inbox (fixed right surface, pointer-events:auto)
    InboxHeader             Ark Tabs (comments only) + actions
    InboxFilter             Menu + CheckboxItem(show-resolved) + RadioItemGroup(sort)
    FeedItem xN             orderedThreads; onSelect -> panToScene + setOpenCid
  Compose                   new-comment
```

Ownership: selection + ordering inputs + read-state live in the `Canvas` model (shared by the
card's prev/next and the inbox feed). `search` and tab state are local to `Inbox`. `drag` is
local to `PinsLayer`. `draft`/caret-rect are local to `ThreadPopover`. `createCommentModel`
is a function, not a class. No `useEffect`: sequence via handlers and derived memos.

## 14. Motion, a11y, responsive

- **Motion**: card/popover entrance = `anim-combo` (opacity + 4px translate, `--pw-ease-expo`).
  Feed items stagger on first load via a CSS keyframe (not a mount effect). Respect
  `prefers-reduced-motion`. The `Switch` thumb uses a `transform` transition.
- **a11y**: every control is an Ark primitive or a real `<button>` with `aria-label`. Thread
  popover = `role="dialog"`. Avatars carry name/`alt`. Feed items are buttons with descriptive
  labels. Roles come from Ark; do not hand-roll them.
- **Shadow DOM**: `EnvironmentProvider(layer.getRootNode())` is already in `overlay.tsx`; new
  wrappers inherit it. wind4 `@property` is hoisted to `document.head` by the widget's
  `registerWind4Properties` — no new manual hoist.
- **Responsive**: `@container` on the overlay; under ~640px the inbox becomes a bottom sheet
  and the thread card goes near-full-width. No features removed on small screens.

## 15. Build sequence

Each step lands independently and is verified before the next. Tests live in
`packages/extensions/whiteboard/test` via `@mandarax/extension-testkit` (real plugin + Jazz +
browser). Never add tests to the example app. ui-kit primitives are verified in Storybook.
Assertions are role/text only. Agent-write echo is verified with `api.callTool(...)` then
`api.page`; `secondClient` is used only for the dev's two-tab read-state durability.

0. **Identity + permissions + model wiring (§5).** Expose the Jazz account id to `Canvas`;
   add `'reads'` to `scopedTables`; add `comments` author columns, the `reads` table, and
   `cursors.kind`; thread `ToolRequest.model` (extension type + `turn.ts` store write +
   `mcp.ts` resolver + whiteboard `context.ts`). Verify: reload `api.page`, assert the same
   account id persists; assert a `reads` write succeeds (not denied).
   0.5 **Pin scene-coord migration + pan (§6).** Convert all four write sites; Island exposes
   the viewport signal + `panToScene`; `PinsLayer` projects scene->screen. Verify: create a
   pin, pan the canvas, assert the pin moved with the content; call `panToScene` and assert
   the target element is centered.
1. **ui-kit primitives (§7)**: Avatar, Menu, Tooltip, Switch, Tabs, Popover (+ stories).
   Verify in Storybook.
2. **Dark canvas (§4)**: flip theme, add the opaque backdrop, flip the anchor-line stroke.
   Visual-review gate (no automated assertion).
3. **Thread card (§8)**: controlled `ThreadPopover` anchored via `pinRefs`; author avatars,
   relative time (`Intl.RelativeTimeFormat`, ticking signal), per-comment Menu; preserve
   `ToolCallCard` + `MentionPart`. Verify: `api.callTool('comment.create'/'comment.reply')`
   -> `api.page` renders the rows; open/close focus moves to composer/pin.
4. **Header toolbar (§8)**: prev/next over `orderedThreads`, resolve, delete-thread cascade
   (server `comment.delete` cascades `threadId` + pin; client confirm Dialog), close +
   Tooltips. Verify: delete a thread, assert all its comments + pin are gone (no orphan in
   `useAll`).
5. **@mention composer (§11)**: textarea + caret-anchored Popover listbox; `MentionPart`
   persisted. Verify: type `@`, assert the listbox lists participants; select, assert a chip
   - the stored part. (Caret position is a visual-review gate.)
6. **`reads` unread derivation (§5)**: exclude self-authored. Verify: `api.callTool` an agent
   reply -> `api.page` shows the thread unread; mark read -> not unread. Use `secondClient`
   only to assert read-state set in one tab shows read in the other.
7. **Inbox panel (§10)**: Tabs (comments only), local search, filter Menu (sort
   RadioItemGroup + show-resolved CheckboxItem), feed over `orderedThreads`, mark-all-read,
   feed->thread select + `panToScene`. Verify: `api.callTool` to create threads -> `api.page`
   feed renders; filter/sort change order; click pans + opens.
8. **Participant avatar stacks (§10)**: dedupe by `authorKind`+`authorModel`, null fallback;
   no overflow math. Verify: `api.callTool` an AI reply -> `api.page` shows dev + agent
   avatars.
   8.5 **Agent presence (§12)**: `cursors.kind`; server upsert keyed `stableUuid(sessionId+
agentId)` on coord-backed actions, throttled; client GC of stale agent rows. Verify:
   `api.callTool('comment.create', {x,y})` -> `api.page` renders an agent-labeled
   collaborator at that scene point; idle past the stale window -> the row is GC'd.
9. **Edge states + responsive (§16, §14)**: empty inbox, search-no-results, single-comment
   thread, long names/text truncation, AI-only thread; `@container` bottom-sheet. Verify the
   semantic states via role/text; the bottom-sheet layout is a visual-review gate.

## 16. Edge and empty states (per surface)

- **Inbox empty**: a teaching empty state (how to leave a comment), not "nothing here".
- **Search no results**: explicit no-results row, search term echoed.
- **Single-comment thread**: no "N replies" line.
- **Long author name / long body**: truncate with ellipsis; full text in the open card.
- **AI-only thread**: agent avatar + model label; "AI" fallback when `authorModel` is null.
- **Participant stack of one**: render the single avatar, no overflow.
- **Resolved thread**: hidden from the feed unless show-resolved is on; pin stays on canvas.
