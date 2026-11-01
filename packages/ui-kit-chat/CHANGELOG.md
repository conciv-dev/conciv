# @conciv/ui-kit-chat

## 0.0.21

### Patch Changes

- [#625](https://github.com/conciv-dev/conciv/pull/625) [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c) Thanks [@omridevk](https://github.com/omridevk)! - Upgrade mermaid to 12.2 for chat diagrams (ELK is now the default layout).

- [#672](https://github.com/conciv-dev/conciv/pull/672) [`621c280`](https://github.com/conciv-dev/conciv/commit/621c2802782a5f7420bc0c9b2030a948b793a156) Thanks [@omridevk](https://github.com/omridevk)! - Cut the ui-kit-chat test suites to the component behaviours they own, dropping duplicate, mechanism and library cases.

- [#663](https://github.com/conciv-dev/conciv/pull/663) [`3cff847`](https://github.com/conciv-dev/conciv/commit/3cff847f9737309ef22fcac06fb84ff974d1340a) Thanks [@omridevk](https://github.com/omridevk)! - Fold the ui-kit-chat tests into four browser files and drop the node test project.

- [#623](https://github.com/conciv-dev/conciv/pull/623) [`23c7842`](https://github.com/conciv-dev/conciv/commit/23c78425c6f53b434d4bf3b4e97666b0cbb95103) Thanks [@omridevk](https://github.com/omridevk)! - The thread virtualizer rounds turn height estimates to whole pixels, so a reader who scrolled up no longer shifts by a fraction of a pixel when rows above the viewport get their first real measurement.

- [#665](https://github.com/conciv-dev/conciv/pull/665) [`14fec2c`](https://github.com/conciv-dev/conciv/commit/14fec2caf05dc77879f79055c04ee12f84ea9379) Thanks [@omridevk](https://github.com/omridevk)! - Restore the attachment adapter, run clock and grouping diff node tests in one node test file.

- [#651](https://github.com/conciv-dev/conciv/pull/651) [`19bd8e7`](https://github.com/conciv-dev/conciv/commit/19bd8e7423d375af888579a5bffff335a3e4c7a3) Thanks [@omridevk](https://github.com/omridevk)! - Warm tooltips: `Tooltip.Group` turns a toolbar's tooltips into one label that pops in on the first trigger, then glides and resizes to the next while the text swaps, with an optional lean and fuse. Ungrouped tooltips get the same pop. `TooltipIconButton` accepts a `shortcut` rendered as a keycap. The chat action bar, composer, terminal actions and whiteboard thread header share one warm tooltip.

  Switch: the thumb travels on a spring, squishes with its velocity, swells on hover and can be dragged; reduced motion jumps.

- [#675](https://github.com/conciv-dev/conciv/pull/675) [`f31c74a`](https://github.com/conciv-dev/conciv/commit/f31c74ad91e9ed4ee2def6b062a6f616dbef6ec1) Thanks [@omridevk](https://github.com/omridevk)! - Tool result images open in a viewer: click the thumbnail for a fit-to-window dialog, click the image for actual size. Image attachments in the composer and on sent messages open the same viewer.
- Updated dependencies [[`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`ad66158`](https://github.com/conciv-dev/conciv/commit/ad66158ab8919dd5a482f30cca45367df5a9566b), [`71a7483`](https://github.com/conciv-dev/conciv/commit/71a74838dd923c10f8559054495a770f9f8cc0c8), [`96acad4`](https://github.com/conciv-dev/conciv/commit/96acad42d70fcb83a2ab535999a1c97ecb34a21f), [`0208423`](https://github.com/conciv-dev/conciv/commit/02084232ad633479dcbb7d6949700a31df1173ee), [`19bd8e7`](https://github.com/conciv-dev/conciv/commit/19bd8e7423d375af888579a5bffff335a3e4c7a3), [`f31c74a`](https://github.com/conciv-dev/conciv/commit/f31c74ad91e9ed4ee2def6b062a6f616dbef6ec1)]:
  - @conciv/protocol@0.0.21
  - @conciv/ui-kit-system@0.0.21
  - @conciv/solid-streamdown@0.0.21
  - @conciv/solid-diffs@0.0.21
  - @conciv/storage-history@0.0.21

## 0.0.20

### Patch Changes

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Retire the `Activity.Now` narration surface: the pin above the composer is rendered from `NowLine`
  fed by the thread grouping store, so the parallel activity-store copy is gone. `useChatSession` now
  exposes a non-suspending `sessionRunning` signal derived from run lifecycle events, so a pane that
  joins a turn another client started narrates it too.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Render the thread through one tree at every length. Crossing the virtualization threshold no longer
  swaps a flat list for a virtualized one, so every turn root keeps its DOM identity as a conversation
  grows. Below the threshold the virtualizer windows nothing; at and above it eviction is unchanged.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Upgrade the @tanstack/ai family 0.43.1 → 0.48.0 in lockstep (ai-client 0.26.0, ai-solid 0.18.3,
  ai-code-mode 0.4.3, ai-isolate-node 0.1.51, ai-isolate-quickjs 0.3.1, ai-mcp 0.3.4, ai-sandbox 0.5.0,
  ai-sandbox-local-process 0.2.4, ai-claude-code/ai-codex 0.4.4, ai-opencode/ai-acp 0.3.4). Upstream
  moved every sibling package's peer range from an exact pin to a caret range, so the pnpm catalog
  comment explaining the old exact-pin poison is rewritten. Code Mode's dynamic binding hook was
  renamed `getSkillBindings` → `getSnippetBindings` upstream; a per-turn `RUN_FINISHED` token-usage
  chunk can now arrive as either the legacy `TokenUsage` shape or the new AG-UI spec `usage[]` array,
  so the run-log fold rebuilds it with `fromSpecTokenUsage` before turning it into a usage snapshot.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Calm surfaces: a streaming activity now gets one surface that is born once, streams into itself, and settles in place. Completed surfaces stay open and inspectable until the next prompt is sent, page-session grouping is minted once per part and only reclassified once the run settles, and the server keeps the user message id the client minted so a prompt row is never remounted mid-thread.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - The chat thread now has a single owner for its scroll position: the virtualizer. The stick-to-bottom phase machine, the thread pins, the top-anchor reserve and the follow-pause helper are gone, along with the `turnAnchor`, `topAnchorMessageClamp`, `scrollToBottomOn*` and `autoScroll` props on `Thread.Viewport` and the `data-follow` / `data-escaped` attributes. `data-at-bottom` is the remaining scroll attribute, and the only writes are the Latest button and sending a prompt. `@conciv/solid-stick-to-bottom` is deleted: the two non-virtual log scrollers that still used it (the streaming reasoning preview and the activity timeline) now pin to the bottom with a `column-reverse` scroll container, which the platform keeps pinned as content grows and releases when the reader scrolls up.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Chat thread: land on the latest turn with a single scroll write instead of the virtualizer's `scrollToEnd`, which armed a five-second reconcile loop that dragged a reader back whenever they scrolled up right after mount or right after sending.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - A settled turn keeps its identity when the server re-broadcasts the transcript. The run-start history snapshot re-mints assistant message ids, which changed the turn key and made the thread destroy and rebuild that row: the settled answer replayed its entrance animation and slid under the reader. Turn reuse now compares a turn's messages by value, so a re-keyed snapshot of the same conversation leaves the rendered turn untouched.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Bind the thread virtualizer to its scroll element only once that element is in the document. A
  virtualized transcript re-entered through a view tab used to come back blank: the virtualizer
  resolved its target window while the subtree was still detached, cached a null one, and never
  recomputed a range. The scroll element is now reported only while connected, and the binding runs
  again whenever it resizes.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Code blocks in chat replies no longer flip between plain and colored text while a reply streams in: lines that are already colored stay colored and only the newly arrived code is added. Selecting text inside a code block now survives the reply re-rendering around it, so you can copy from a block while the agent is still writing.

- [#553](https://github.com/conciv-dev/conciv/pull/553) [`9549d4a`](https://github.com/conciv-dev/conciv/commit/9549d4a6b484da8e40135eb8abd676ade23ba1b2) Thanks [@omridevk](https://github.com/omridevk)! - Collapsible open/close (tool cards, chain-of-thought groups) now animates `grid-template-rows` via CSS keyframes instead of the box-model `height`. `@zag-js/collapsible` determines whether an exit animation exists by reading the content element's computed `animationName`, and waits for `animationend` before letting the state settle; a CSS `transition` on `height` never fires that event, so the earlier attempt to swap in a `transition`-based approach snapped instantly instead of animating. The content element is a CSS grid with a single `1fr`/`0fr` row track; its child wrapper carries `overflow: hidden` and `min-height: 0` so the collapsed track visually and structurally clips to zero. `prefers-reduced-motion` is honored on both variants. Measured in the live-widget rig: toggle-window p99 dropped to 9.3ms versus 16-17.5ms for the prior height-based animation; the worst-case catastrophic frames were independent of which toggle animation was in flight.

  `usePauseFollowOnToggle` previously waited on `animationend` for every toggle, including under `prefers-reduced-motion`, where `motion-reduce:animate-none` means no animation ever starts and no `animationend` ever fires. Thread auto-follow stayed paused for the full 1000ms ceiling on every toggle for reduced-motion readers. The hook now checks the toggled element's computed `animationName` synchronously after the toggle: when it is `none` (no animation running), follow releases immediately instead of waiting on an event that will never arrive.

- [#540](https://github.com/conciv-dev/conciv/pull/540) [`fd6d4ce`](https://github.com/conciv-dev/conciv/commit/fd6d4ce64ab6a3350406c02e462f5b0bc14dd5f1) Thanks [@omridevk](https://github.com/omridevk)! - Composer actions collapse into a shared overflow menu; extensions author buttons through `ComposerActions.ActionButton` (or the `ComposerActions.Action` + `ActionMenuItem` pairing for divergent inline/menu content) and `ComposerActions.Inline` from @conciv/ui-kit-chat, registered with the host via context — no ids, no separate menu-item JSX to author by hand. `ComposerActionsHost` takes `maxInlineAuto` to cap how many unpinned auto actions may stay inline, and the conciv composer caps it at zero: only `visible="always"` buttons sit in the row. Session refresh moved out of the composer into pane chrome. `ComposerActionsHost` reads its regions from the `ComposerActions.Leading`, `ComposerActions.Trailing` and `ComposerActions.Trigger` slot components instead of leading/trailing/triggerContent props.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Removed the unused Claude `attach` slot (`claudeAttach`, `parseLiveSessions`, `meetsReloadFloor`) and
  its `HarnessAttach`/`HarnessLiveSession`/`HarnessAttachInstall`/`HarnessAttachResult`/`HarnessAttachRemoval`
  protocol types. Nothing in the codebase called `harness.attach`, `candidates()`, `install()`, or
  `uninstall()` outside the deleted `claude/attach.ts` and its own test.

  Consolidated the duplicate `chatBusy`/`busyOf` check (identical bodies in `@conciv/ui-kit-chat` and
  `@conciv/client`) into a single `chatBusy` export from `@conciv/protocol/chat-busy`, which both
  packages already depend on.

  `@conciv/client`'s `stopping` state is now derived from the server-published run lifecycle phase
  (`runSource().lifecycle.phase === 'stopping'`) instead of a local 10s-timeout approximation; deleted
  the now-redundant `createStopState`/`isStopping` local timer and its `@solid-primitives/timer`
  dependency.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Delete dead chat-plane code found in a source audit of the calm-chat-plane branch:
  `snapshotToTokenUsage` (only consumer was its own test), the self-referential
  `ChatMessageSchema`/`ChatRequestSchema` (no import site anywhere), and the `replies`
  table plus `writeReply`/`replyFor` (truncated on every boot, no non-test consumer).
  A drizzle migration drops the `replies` table.

  Delete our bespoke `APPROVAL_REQUESTED_EVENT`/`ApprovalRequest`/`aguiApprovalRequestedFor`
  helpers in `@conciv/protocol`; the single emitter in `@conciv/core`'s permission gate now
  builds `@tanstack/ai`'s `ApprovalRequestedEvent` directly and stamps it with tanstack
  run/thread metadata via `withTanstackMetadata`, keeping the event name string sourced from
  `@tanstack/ai-sandbox`'s `APPROVAL_REQUESTED_EVENT` constant.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Prime the diffs highlight worker pool when the thread mounts. Until the pool finished
  initialising, `File` had no plain-text AST to paint, so the first code surface of a run
  appeared empty and then jumped to its real height, shifting every trace row below it.

- [#483](https://github.com/conciv-dev/conciv/pull/483) [`bf64cd8`](https://github.com/conciv-dev/conciv/commit/bf64cd840bb9be69201d7a78b33a7fe3338ac79a) Thanks [@omridevk](https://github.com/omridevk)! - Chat transcript grouping is now derived from message data (assistant-ui groupParts model): unrenderable parts can no longer produce an empty Chain of Thought wrapper, tool cards always show a chevron, and grouped presentations (chain, page session) register through a generic GroupEntry. Every tool card body now renders a data-derived floor — input chips, a state row such as "searching…" or "recording…", or a quiet "no input" row — so no card expands into an empty strip. The page-session card is the one deliberate exception: it is a group summary rather than a single tool call, so it renders its step rail instead of an input row.

- [#570](https://github.com/conciv-dev/conciv/pull/570) [`e1a0c8b`](https://github.com/conciv-dev/conciv/commit/e1a0c8b982297279cc8ac4cab0c2d8d26a139dd1) Thanks [@omridevk](https://github.com/omridevk)! - The widget now adapts to the host page's color scheme instead of always rendering dark. It resolves
  the scheme at mount, before first paint, from a computed `color-scheme` on the host root, then a
  `.light`/`.dark` class or `data-theme` attribute, then `prefers-color-scheme`, and re-resolves live
  when the host page toggles its theme. Every color token is declared once as a `light-dark()` pair,
  so a scheme is a single `color-scheme` flip: scrollbars, native controls, Shiki code blocks, the
  diffs component, popped-out windows, and the terminal pane all follow. UnoCSS `dark:`/`light:`
  variants key off the widget's own scheme classes. Extension `chat-accent` / `chat-hue` overrides keep
  working in both schemes.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Rename the mutating tool badge copy from "edits page" to "page edit".

- [#549](https://github.com/conciv-dev/conciv/pull/549) [`e74ef75`](https://github.com/conciv-dev/conciv/commit/e74ef75b8635457db259b32bbad61e08f57f582e) Thanks [@omridevk](https://github.com/omridevk)! - Eliminated a shiki main-thread stall during streaming chat turns by moving syntax highlighting off the main thread entirely into a Web Worker, instead of merely scheduling it.

  Live-rig measurement across five rounds narrowed this down: `requestIdleCallback`-based scheduling shrank the compile burst but could not eliminate it, because once the browser forces the callback to run under sustained streaming load, the compile still executes synchronously on the main thread — deferral relocates the work, it does not remove it. A pre-turn warmup hitch of up to ~226ms remained on fresh sessions whenever the user typed within a couple seconds of the pane mounting.

  The chat markdown renderer now:
  - Runs both shiki highlighter cores (the precompiled+raw-engine core for typescript/tsx/javascript/jsx/json/css/html/markdown, and the regex-engine core for bash) inside a dedicated Web Worker, constructed via `new Worker(...)` behind an inline (`?worker&inline`) Vite worker import so the worker's own bundle — shiki included — ships self-contained, with no separate chunk file to resolve. Verified this survives both packages' real build pipelines: `packages/ui-kit-chat`'s library build and, critically, `packages/embed`'s single-file IIFE bundle which explicitly disables Rollup code-splitting (`output: {codeSplitting: false}`) — an inline worker sidesteps that entirely since it never needs a second output file. The `mount-externals` build test (guarding against a second bundled Solid/Ark copy) passes unchanged.
  - Keeps the main thread doing exactly what it should: the highlight cache, the plain-escaped-fallback rendering path while a highlight is pending, per-language streaming supersession, and the `Markdown` component re-render notification. A cache miss posts `{code, lang}` to the worker and returns the plain escaped fallback immediately; the worker's reply fills the cache and notifies. Warmup — one representative snippet per language — runs as a worker-boot task, off the main thread entirely.
  - Has no main-thread highlighter path anymore: since conciv is a local-only dev tool, a strict-CSP host page and the previous ~170KB fallback-duplication cost were both judged near-irrelevant, and a dead code path that only exists to highlight without a Worker was pure complexity for no real benefit. If `Worker` is unavailable or construction throws, code fences render as plain escaped text permanently — no error, no highlighting, decided once at module init. This removed the entire second shiki import graph (the hybrid dual-core main-thread highlighter construction and its own staggered warmup) that previously shipped independently of the worker's copy.
  - `Thread.Root`'s eager `onMount` hook constructs the worker (or resolves to the permanently-degraded mode) as early as possible, well before any turn can produce a fence.

  All 9 languages remain byte-identical to the original pre-worker single-thread output. Embed bundle size (`conciv-widget.global.js`): pre-worker baseline 14,843.25 kB raw / 3,074.24 kB gzip; with the (now-removed) main-thread fallback, 16,189.98 kB / 3,244.15 kB; with the fallback deleted, 15,215.83 kB / 3,143.65 kB — close to the pre-worker baseline (+372.58 kB raw / +69.41 kB gzip), matching expectations for shipping one self-contained worker copy of shiki instead of a shared main-thread graph.

- [#591](https://github.com/conciv-dev/conciv/pull/591) [`1ff8988`](https://github.com/conciv-dev/conciv/commit/1ff89883697627cf4d9c108a602607a0af921bc6) Thanks [@omridevk](https://github.com/omridevk)! - Host marker strings renamed off the dead `pw` prefix to `conciv`: the `pw-widget` / `pw-api-base` meta tags, every `data-pw-*` attribute, the `pw-chat-panel` id (and its `aria-controls` references), the `pw-session-` id prefix, the `pw-conciv-model` localStorage key (now `conciv-model`, saved preference intentionally dropped), `pw-grab-pseudo-` capture-clone classes, and the `.pw-fab-*` / `.pw-rig-*` mascot rig classes. Breaking for any host or tooling still targeting the old meta names, data attributes, ids, or storage key.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Mermaid code blocks in chat replies now render as diagrams once the reply finishes streaming. The diagram follows the widget's light or dark scheme, and a block that does not parse stays a plain code block. Mermaid loads only when the first diagram appears, so replies without diagrams pay nothing for it.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Pin model-selector search filtering so disabled options are filtered and restored with the enabled ones.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Keep one narration line mounted for the whole run. It used to be handed off between a row inside the running chain group and a copy below the transcript, so every time streaming moved between a thinking, tool-call, and text part the line unmounted and remounted — the spinner reset and the line appeared to blink. The chain group no longer hosts a narration row at all (`Trace` loses its `now` slot); the single line lives in the transcript flow after the last message, aligned to the trace gutter, and is gated only on whether the run is live.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Rebuild the narration label swap on Ark's Presence so the outgoing activity unmounts after its exit instead of lingering, and cut straight to the latest title when activities churn faster than the animation. The swap is now a vertical slide inside a clipped line box, so two labels can never overlap into unreadable text. Drops the blurred keyframe that animated `filter` on text, and moves the fallback narration into the transcript flow so it sits tight to the last content instead of far below it.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Tool results read as data again. An exec run now shows its console logs and its typed result separately: objects and arrays open as a JSON tree, strings stay strings, and scalars sit on one compact line instead of being flattened into an escaped one-line blob. Meta-driven cards with an object output schema take the same structural path. Page script steps label themselves with the first line of the script they ran, and a long value no longer squeezes the step target out of a narrow session card.

- [#550](https://github.com/conciv-dev/conciv/pull/550) [`a3e61ec`](https://github.com/conciv-dev/conciv/commit/a3e61ec0c47879314362b8b9656bc708b675d313) Thanks [@omridevk](https://github.com/omridevk)! - Fix a long main-thread frame when a pane opens on a session with a large restored transcript: the viewport resize/font-ready estimator reset and virtualizer remeasure now schedule via `requestAnimationFrame` instead of running inline in the resize observer callback, so the expensive text-metrics recompute lands in its own frame instead of blocking alongside the `MESSAGES_SNAPSHOT` websocket handler.

- [#559](https://github.com/conciv-dev/conciv/pull/559) [`436aff0`](https://github.com/conciv-dev/conciv/commit/436aff0ae80ab2d33d06b50128b48e5404dc7b23) Thanks [@omridevk](https://github.com/omridevk)! - Redesign the chat panel as a terminal session log: chronological turns with an execution trace tree, geometric connectors, inline tool bodies for every tool card, themed shiki code surfaces, JSON payloads through the tree viewer, and a single swappable terminal theme owning all chat tokens.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Code blocks the highlighter has no grammar for (for example a `mermaid` diagram), and blocks still waiting for their colors, now show readable code text on the same flat surface as highlighted blocks instead of pale grey text in a grey box.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Restore the narration line to the widget's trace language: a braille spinner glyph in the accent color plus a mono micro label at the trace gutter, with no fill slab. The line now rides as the last row of the running turn's chain group, animates the label swap when the activity changes, and freezes the glyph at `⠿` under `prefers-reduced-motion`. The pinned copy above the composer is kept as the late-join fallback.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Stop the trace clamp from re-laying out inside its ResizeObserver callback, which tripped a ResizeObserver notification loop and deferred the rest of each cycle's measurements during card-heavy scrolling. The trace rail no longer observes the svg it sizes and reads the gutter from its token instead.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Trace rail: the accent now marks the running step and nothing else. Each row owns its inbound connector, liveness is derived from tool status instead of "last part while the turn streams", the scroll reading-band highlight that shared the accent's styling is gone, a collapsed trace draws no rail at all, and a resolved permission request no longer leaves an empty row behind that shifted the rail's arms.

- [#479](https://github.com/conciv-dev/conciv/pull/479) [`5bf76b9`](https://github.com/conciv-dev/conciv/commit/5bf76b9869374877e54ffcde85556d4bfbe2615f) Thanks [@omridevk](https://github.com/omridevk)! - File-read tool cards infer syntax-highlighting language from the filename instead of rendering plain text

- [#555](https://github.com/conciv-dev/conciv/pull/555) [`f178ec8`](https://github.com/conciv-dev/conciv/commit/f178ec87227ebdb60c10b21426e972083f9a1d05) Thanks [@omridevk](https://github.com/omridevk)! - Fixed a `ResizeObserver loop completed with undelivered notifications` window error that fired repeatedly while a thread's turns were virtualized (above the virtualize threshold). The thread virtualizer's viewport-rect observer now defers its handling to the next animation frame (`useAnimationFrameWithResizeObserver`), matching the existing `top-anchor.ts` convention for resize-driven layout writes, instead of recomputing measurements synchronously inside the `ResizeObserver` callback.

- [#593](https://github.com/conciv-dev/conciv/pull/593) [`6699828`](https://github.com/conciv-dev/conciv/commit/669982843b265d397771ca9bfd607aa5976a8ff3) Thanks [@omridevk](https://github.com/omridevk)! - Skin axis: named looks over a 37-anchor token contract, selected with `--conciv-skin`.

  A host page picks the widget's look by declaring one CSS custom property on `html` or `body`:

  ```css
  html {
    --conciv-skin: terminal;
  }
  ```

  Two skins ship in-repo: `conciv` (the default) and `terminal`. Each is a typed object in
  `@conciv/ui-kit-system` that sets only the anchors — surfaces, ink, overlays, accent, status, type,
  radii, shadows, easing and a density unit — as `{light, dark}` pairs or single values, so a skin is
  complete for both colour schemes by construction and omitting anything is a compile error. Every
  other `--chat-*` custom property stays internal and is derived once from the anchors, so hand-tuned
  semantics stay consistent across skins.

  The resolved skin is stamped on every render root the widget owns, including the shadow host (so
  Ark portals follow), the body-level effects overlay and popped-out windows, which now carry both the
  scheme and the skin. An unknown value falls back to `conciv` with one console warning. The skin's
  `--chat-space` scales the spacing base of the thread and composer only; frame geometry does not
  follow it.

  Two contract documents are generated from the same typed source and committed, with a CI drift
  check: `docs/skin-anchors.md` (what a skin may write) and `docs/extension-tokens.md` (what an
  extension may read). Every skin's colour pairs are checked for WCAG contrast in CI.

  BREAKING: the per-extension theme map is removed. `defineExtension({theme})`, the `ThemeTokens` type,
  the runtime theme applier and its injected `style[data-conciv-theme]` element, the catalog's theme
  validation and `overridable` token flag, and the `theme` scaffold kind are all gone. Extensions style
  exclusively through the public `--chat-*` tokens and utilities; derive a bespoke colour locally with
  `color-mix` over a public token instead.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Thread scroll follow is now a cause-driven state machine with a single owner of `scrollTop`.

- [#546](https://github.com/conciv-dev/conciv/pull/546) [`2054a18`](https://github.com/conciv-dev/conciv/commit/2054a1840c680cfaddd07f721cb09591b69d5b51) Thanks [@omridevk](https://github.com/omridevk)! - Stop streamed text from flickering. Each markdown block is now a keyed node tree held in a store and reconciled by key, so words that have already settled keep their DOM node and never replay their fade; only newly mounted words animate in. The old character-counting animate plugin, its stagger variables, and the `createImmutable` hast wrapper are gone. The streaming answer also drops `text-wrap: pretty`, which re-balanced line breaks as text grew and moved settled words between lines; settled answers keep it.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Gate progressive rendering of both streamed code surfaces: a fenced block inside streamed markdown and the diff body of a tool card.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - A code block that streams in mid-line keeps its colored lines on screen while each new chunk arrives, instead of dropping back to plain text and rebuilding every line until the next highlight lands. Streaming a long code block costs far less work per chunk.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - A reader parked at the end of the thread keeps following a streaming reply when the reply's layout settles a pixel or two shorter. Only a wheel, touch, key press or pointer drag on the thread now releases the follow; a browser clamp of the scroll position re-lands on the end instead.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - A run whose reply streams into the same message as its page acts no longer crashes the widget when the settled grouping moves the page-session card to a new position.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - A thread row evicted before its deferred measurement no longer records a zero height, so the latest-turn gesture lands in one write and history prepends keep the real thread height.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - The chat thread survives a viewport re-insertion. When an ancestor of the thread viewport is removed and re-inserted — a Solid `Suspense` above the pane re-suspending on a session switch, for instance — the browser discards the scroll offset, and the reset used to reach the scroll owner looking exactly like a reader dragging to the top. The owner now records a resting anchor (preserve the reader's position, or resume following the end) and restores it through the single landing call site when the viewport comes back.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Scrolling up while a reply streams now lets go of the end right away. Before, a reader sitting at the end of the thread who nudged up with a trackpad was pulled back down on every new chunk, and a reader scrolled into a long streaming reply kept drifting with it. Now a small scroll up is enough to stop following, the text you are reading stays still while the reply keeps growing below it, and a reader who stays at the end still follows the whole stream.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Tool trace rows no longer draw an empty bordered frame around a card that renders nothing: a tool card
  entry can now declare `hasEmbeddedBody`, and `execute_typescript` uses it so a void-returning run keeps
  its row (title, `ok`, status) without an empty output box. Card headers also baseline-align their title
  and metric text, so counts like `4 actions` and durations like `0.1s` no longer sit below the title.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Narrate what the agent is doing instead of going silent: a pinned now-line above the composer names the running tool, thinking-only segments keep a readable trace, and the collapsed trace line reports the current activity while a run streams. The session status bar gains a pulsing running dot and a clearly marked active view tab, and the panel header switches to padding-driven spacing.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Stop re-rendering every settled trace row on each stream chunk: per-row result and duration lookups are value-stable memos, the live-row key and derived row class names are memoized, and the trace rail writes only changed attributes.

- [#564](https://github.com/conciv-dev/conciv/pull/564) [`5b79c2a`](https://github.com/conciv-dev/conciv/commit/5b79c2ac9dc82e91f7ff67bc927f36c575086688) Thanks [@omridevk](https://github.com/omridevk)! - Trace connectors are now a single measured SVG rail per trace (fumadocs-style): one path draws the header junction, spine, row ticks, and end corner; a live accent segment tracks the running step and a reading-line scroll spy highlights the active row on settled traces. The Latest chip becomes an out-of-flow overlay so it no longer shifts the scrollbar.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Estimate settled turn heights from the real answer-row DOM: the metrics probe now mirrors the assistant root, answer row, answer content and prose paragraphs, and the estimator accounts for row padding, root padding and paragraph spacing instead of compensating with a flat extra.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Bump the `@tanstack/ai` family from the 0.48 lockstep to 0.51 (catalog-only, see `pnpm-workspace.yaml`).
  Picks up upstream fix [#1248](https://github.com/TanStack/ai/pull/1248): the client `StreamProcessor`
  dropped the first `TEXT_MESSAGE_CONTENT` delta of an assistant turn that called a tool before
  replying, so every answer that followed a tool call lost its opening text (an opening code fence,
  most visibly).

- [#590](https://github.com/conciv-dev/conciv/pull/590) [`ac969c5`](https://github.com/conciv-dev/conciv/commit/ac969c50f746645d5a5b3bbf51547ed49317c7c3) Thanks [@omridevk](https://github.com/omridevk)! - Lower the thread virtualization threshold from 50 to 15 turns so long sessions virtualize sooner.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Run lifecycle: stop now acknowledges immediately and the session badge and timer read the run record.

  The server publishes a run-lifecycle event on the session stream when a run starts, when a stop is
  requested, and when the run driver settles it, and replays the last one to every new subscriber. Stop
  marks the run cancel-requested and acknowledges before waiting for settlement, and the transcript read
  that computes context occupancy moved off the settlement path into a later usage update.

  The widget shows a disabled "Stopping…" control from the click until the run settles, with a timeout
  fallback. FAILED now derives only from a run that ended with a terminal error, carrying that error as
  the chip's title; a denied or nonzero-exit tool call stays in the per-turn rollup and no longer flags
  the session. The elapsed timer keys on the persisted run id, so it survives a reload or a snapshot
  that re-keys every message.

- Updated dependencies [[`ec28181`](https://github.com/conciv-dev/conciv/commit/ec28181dc8b49c979e6bd36284eb7148bee092f3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`9549d4a`](https://github.com/conciv-dev/conciv/commit/9549d4a6b484da8e40135eb8abd676ade23ba1b2), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`efef98a`](https://github.com/conciv-dev/conciv/commit/efef98ab991cd2ce4aca49d7696a135ec0894bec), [`e1a0c8b`](https://github.com/conciv-dev/conciv/commit/e1a0c8b982297279cc8ac4cab0c2d8d26a139dd1), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`6699828`](https://github.com/conciv-dev/conciv/commit/669982843b265d397771ca9bfd607aa5976a8ff3), [`2054a18`](https://github.com/conciv-dev/conciv/commit/2054a1840c680cfaddd07f721cb09591b69d5b51), [`2054a18`](https://github.com/conciv-dev/conciv/commit/2054a1840c680cfaddd07f721cb09591b69d5b51), [`2054a18`](https://github.com/conciv-dev/conciv/commit/2054a1840c680cfaddd07f721cb09591b69d5b51), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`478c83b`](https://github.com/conciv-dev/conciv/commit/478c83bdee4d5d7c5e7a27c3586d030907ccf80c), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d23d7c8`](https://github.com/conciv-dev/conciv/commit/d23d7c820af745fd87c4048a2d089c9d995f664a), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6)]:
  - @conciv/protocol@0.0.20
  - @conciv/ui-kit-system@0.0.20
  - @conciv/solid-streamdown@0.0.20
  - @conciv/solid-diffs@0.0.20
  - @conciv/storage-history@0.0.20

## 0.0.19

### Patch Changes

- [#437](https://github.com/conciv-dev/conciv/pull/437) [`e628f93`](https://github.com/conciv-dev/conciv/commit/e628f93ed9d4067c6ad164a2af0369e543abd62f) Thanks [@omridevk](https://github.com/omridevk)! - Chat transcript scrolling is now owned by @conciv/solid-stick-to-bottom, a faithful Solid port of use-stick-to-bottom: the viewport only moves for pinned streaming follow, the scroll-to-bottom button, and sending a message. Chain-of-thought/reasoning cards auto-close once when their own content completes, and user toggles after that are permanent. Tool approval force-opens the tool card once. User card toggles never shift the viewport. Chain content defaults to grow, with a `grow` prop for the capped pane.

- [#313](https://github.com/conciv-dev/conciv/pull/313) [`39c6072`](https://github.com/conciv-dev/conciv/commit/39c6072687cdedeabc42dabe798d88fa10dc716b) Thanks [@omridevk](https://github.com/omridevk)! - The widget composer now runs on the TipTap rich text field from @conciv/ui-kit-tap: slash commands and mentions are atomic chips with typeahead popovers, lowering to the same directive strings the server always received. The string-splice trigger layer is removed from @conciv/ui-kit-chat (trigger popover primitives, slash/mention adapters, directive formatter, the styled composer popover slot); ComposerPrimitive.Input remains the plain textarea primitive.

- [#460](https://github.com/conciv-dev/conciv/pull/460) [`23f62c9`](https://github.com/conciv-dev/conciv/commit/23f62c9ad8a810cdf177a53701a1516b191436fe) Thanks [@omridevk](https://github.com/omridevk)! - Transcript virtualization: long threads render through a TanStack virtual-core window with stable turn identity, pretext-based height estimates, and lazy collapsed card bodies; fast-scroll main-thread stalls drop from ~380ms to ~70ms.

- Updated dependencies [[`e628f93`](https://github.com/conciv-dev/conciv/commit/e628f93ed9d4067c6ad164a2af0369e543abd62f), [`6ce79cf`](https://github.com/conciv-dev/conciv/commit/6ce79cf66cb0629ba965af4d4d06b242c673b017)]:
  - @conciv/solid-stick-to-bottom@0.0.19
  - @conciv/ui-kit-system@0.0.19
  - @conciv/protocol@0.0.19
  - @conciv/solid-diffs@0.0.19
  - @conciv/solid-streamdown@0.0.19
  - @conciv/storage-history@0.0.19

## 0.0.18

### Patch Changes

- [#212](https://github.com/conciv-dev/conciv/pull/212) [`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd) Thanks [@omridevk](https://github.com/omridevk)! - Fix double-constructed JSX props and tighten composer state handling.
  - `ToolChip`'s `tip` and `Terminal`'s `rail` resolve their JSX prop through a `children()` memo, so a
    component passed as that prop is built once instead of two or three times.
  - The model selector no longer disappears when the model list fails to load: it renders a retry
    affordance, announces the failure, and restores the picker once the retry succeeds.
  - Thread auto-scroll runs off an explicit machine, and reactive-scope listeners and timers go through
    solid-primitives so they clean themselves up with their owner.

- [#175](https://github.com/conciv-dev/conciv/pull/175) [`3f9bf5d`](https://github.com/conciv-dev/conciv/commit/3f9bf5dc25bcf911e788ef53547436f46cab11b6) Thanks [@omridevk](https://github.com/omridevk)! - Load shiki grammars and themes lazily so code-splitting consumers don't hoist doubly-reachable modules.

- [#212](https://github.com/conciv-dev/conciv/pull/212) [`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd) Thanks [@omridevk](https://github.com/omridevk)! - ModelSelector no longer drops keystrokes typed right after the trigger is tapped. The combobox open
  state is owned by the machine unless a consumer passes `open`, so the list opens in the same turn as
  the trigger activation instead of after a round trip through Solid.
- Updated dependencies [[`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd)]:
  - @conciv/protocol@0.0.18
  - @conciv/solid-diffs@0.0.18
  - @conciv/solid-streamdown@0.0.18
  - @conciv/storage-history@0.0.18
  - @conciv/ui-kit-system@0.0.18

## 0.0.17

### Patch Changes

- [#153](https://github.com/conciv-dev/conciv/pull/153) [`2aa2b01`](https://github.com/conciv-dev/conciv/commit/2aa2b01db001973dd3432253fabc915462b3ec85) Thanks [@omridevk](https://github.com/omridevk)! - Let the composer's model picker shrink so Stop and Send stay reachable at phone widths. While a turn is running the composer shows Stop next to Send, and the action row had nothing that could give up space: the icon buttons are fixed size by design, and the model pill sat inside wrappers that were all sized to their full label. The row overflowed, and on a 320px phone the Send button was pushed off screen entirely. The pill now shrinks and truncates its label ("Claude Sonnet 4.5" becomes "Claude S...") so the whole row fits, which also removes the few pixels of overflow at 393px and on any narrower device.

- [#154](https://github.com/conciv-dev/conciv/pull/154) [`cf6fc75`](https://github.com/conciv-dev/conciv/commit/cf6fc75ddc841c4fd01b331b93568af7283b320a) Thanks [@omridevk](https://github.com/omridevk)! - Touch, wheel, and keyboard scrolling in the thread now detaches auto-follow, so scrolling back through a reply while the assistant is still streaming no longer fights a re-pin that snaps you to the bottom. This was most visible on iOS, where the browser reports scrolling later than the streamed content arrives. Auto-follow resumes as soon as you return to the bottom or press the scroll-to-end button.

- Updated dependencies []:
  - @conciv/protocol@0.0.17
  - @conciv/solid-diffs@0.0.17
  - @conciv/solid-streamdown@0.0.17
  - @conciv/ui-kit-system@0.0.17

## 0.0.16

### Patch Changes

- [#141](https://github.com/conciv-dev/conciv/pull/141) [`aa06a88`](https://github.com/conciv-dev/conciv/commit/aa06a88067430bd97934f4abb0b096bfdf1812f4) Thanks [@omridevk](https://github.com/omridevk)! - Render code and tool output through SolidCodeBlock instead of hand-rolled pre blocks, with explicit languages: plaintext for payloads, TypeScript for eval'd page code, and ANSI for terminal streams so command colors render natively.

- Updated dependencies [[`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b)]:
  - @conciv/protocol@0.0.16
  - @conciv/solid-diffs@0.0.16
  - @conciv/solid-streamdown@0.0.16
  - @conciv/ui-kit-system@0.0.16

## 0.0.15

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.15
  - @conciv/solid-streamdown@0.0.15
  - @conciv/ui-kit-system@0.0.15

## 0.0.14

### Patch Changes

- [#94](https://github.com/conciv-dev/conciv/pull/94) [`757071f`](https://github.com/conciv-dev/conciv/commit/757071f4bf394cb591b4f45c5bee9fc63c9afb41) Thanks [@omridevk](https://github.com/omridevk)! - Replace the custom busy-send queue with TanStack AI's native FIFO queue, queued-message controls, and interrupt steering.

- Updated dependencies []:
  - @conciv/protocol@0.0.14
  - @conciv/solid-streamdown@0.0.14
  - @conciv/ui-kit-system@0.0.14

## 0.0.13

### Patch Changes

- Updated dependencies [[`73c451e`](https://github.com/conciv-dev/conciv/commit/73c451e8d4175732a0e3f421300bda19b8dcf45c)]:
  - @conciv/protocol@0.0.13
  - @conciv/solid-streamdown@0.0.13
  - @conciv/ui-kit-system@0.0.13

## 0.0.12

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.12
  - @conciv/solid-streamdown@0.0.12
  - @conciv/ui-kit-system@0.0.12

## 0.0.11

### Patch Changes

- Updated dependencies [[`5f76cc2`](https://github.com/conciv-dev/conciv/commit/5f76cc2d14ae93265f8c72b3eb6d5254abe3bb59)]:
  - @conciv/solid-streamdown@0.0.11
  - @conciv/protocol@0.0.11
  - @conciv/ui-kit-system@0.0.11

## 0.0.10

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.10
  - @conciv/solid-streamdown@0.0.10
  - @conciv/ui-kit-system@0.0.10

## 0.0.9

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.9
  - @conciv/solid-streamdown@0.0.9
  - @conciv/ui-kit-system@0.0.9

## 0.0.8

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.8
  - @conciv/solid-streamdown@0.0.8
  - @conciv/ui-kit-system@0.0.8

## 0.0.7

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.7
  - @conciv/solid-streamdown@0.0.7
  - @conciv/ui-kit-system@0.0.7

## 0.0.6

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.6
  - @conciv/solid-diffs@0.0.6
  - @conciv/solid-streamdown@0.0.6
  - @conciv/ui-kit-system@0.0.6

## 0.0.5

### Patch Changes

- [`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139) Thanks [@omridevk](https://github.com/omridevk)! - new version with fixed deps

- Updated dependencies [[`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139)]:
  - @conciv/protocol@0.0.5
  - @conciv/solid-diffs@0.0.5
  - @conciv/solid-streamdown@0.0.5
  - @conciv/ui-kit-system@0.0.5

## 0.0.4

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.4
  - @conciv/solid-diffs@0.0.4
  - @conciv/solid-streamdown@0.0.4
  - @conciv/ui-kit-system@0.0.4

## 0.0.3

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.3
  - @conciv/solid-diffs@0.0.3
  - @conciv/solid-streamdown@0.0.3
  - @conciv/ui-kit-system@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.2
  - @conciv/solid-diffs@0.0.2
  - @conciv/solid-streamdown@0.0.2
  - @conciv/ui-kit-system@0.0.2

## 0.0.1

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.1
  - @conciv/solid-diffs@0.0.1
  - @conciv/solid-streamdown@0.0.1
  - @conciv/ui-kit-system@0.0.1
