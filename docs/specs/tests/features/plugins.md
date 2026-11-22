# plugins-r: feature pass, plugins area (READ ONLY), kit at 4079f98b7

Area: every plugin under packages/plugins: page, whiteboard, recorder, ios, terminal, tanstack, test-runner and try-it. packages/extensions holds only design (excluded), so no extension is in scope.

Method:

- Four opus subagents, each read only and told not to run memo.
- They read product source, READMEs and the wiring in apps/conciv, embed and core, and listed every feature a user, plugin author or outside agent can use.
- They re-read every file in packages/harness-testkit/src and packages/plugin-testkit/src at 4079f98b7. kit-gaps.md was ignored and nothing was counted as coming.
- Opencode was looked up for every NO.
- No deleted tests, old test files or test-split were read.

Verification:

- I re-opened these kit lines myself (read):
  - harness-engine.ts:26-32 (options), :41-59 (session, engine), :164-170 (approve always 'once'), :224 (policies hard-coded []), :243 (watcher off), :246 (mkdtemp root), :251 (serveHono with no port);
  - plugin-testkit engine.ts:21-28 and :36 (no address on the test's engine), mount.ts:59-78 (one render, memory route, waits for the launcher), browser-commands.ts:23-26 (only page errors);
  - harness-testkit package.json exports "." only.
- Product and opencode file:line come from the subagents. They marked each claim read or inferred; their inferred items are listed at the end.

## Counts

| plugin      | features | YES | NO  | could not judge |
| ----------- | -------- | --- | --- | --------------- |
| page        | 57       | 29  | 25  | 3               |
| whiteboard  | 80       | 54  | 24  | 2               |
| recorder    | 34       | 15  | 16  | 3               |
| ios         | 22       | 5   | 16  | 1               |
| terminal    | 21       | 12  | 5   | 4               |
| tanstack    | 32       | 12  | 20  | 0               |
| test-runner | 23       | 8   | 15  | 0               |
| try-it      | 9        | 0   | 9   | 0               |
| total       | 278      | 135 | 130 | 13              |

## NO rows

Columns: feature | where the test belongs | missing capability | product file:line | kit file:line | opencode file:line.

Abbreviations:

- HE = harness-testkit/src/harness-engine.ts
- PE = plugin-testkit/src/engine.ts
- MT = plugin-testkit/src/mount.ts
- BC = plugin-testkit/src/browser-commands.ts
- TL = harness-testkit/src/test-llm.ts
- CT = harness-testkit/src/call-tool.ts
- OC = _ref/opencode/packages

### page (packages/plugins/page; app journeys live in apps/conciv/src)

- Page tool cards per verb (labels, target chips, react/read/edit-live/effect cards) | happy-dom app | scripted reply calling a code-mode tool without the test writing the TS program | cards.tsx:44-614, rpc.ts:645-691 | TL:35-41, CT:49 | OC/core/test/codemode.test.ts:79 writes the string
- Failed page call shows the error card | happy-dom app | same | shared.tsx:142, renderer.tsx:105 | same | same
- A run of page calls folds into one session card | happy-dom app | same | session-card.tsx:269-441 | same | same
- Before/after captures in cards | browser app | same | tools.ts:71-76, captures.tsx:42 | same | same
- Screenshot reaches the next model request as an image | node | same | tools.ts:194-216 | same | same
- Stop via the page mask interrupts the run | browser app | same | renderer.tsx:72-77, simulator.ts:151-160 | same | same
- Several tabs: tabId, last-focused tab, focus/blur | browser app | second app instance (tab) on one session | machine.ts:516, attachment.ts | MT:59-77 | OC/plugin-browser/test/machine.test.ts:363 (machine only)
- Tab URL redaction (params, path, hash) | happy-dom app | set the host page's own URL | attachment.ts:290-316 | MT:70 (memory route only) | OC/app/e2e/utils/command-palette.ts:49 page.goto
- hmr waits for the hot update after a file edit | e2e | host page served by a dev server from the engine's project | operations.ts:924, rpc.ts:245 | HE:212,246 | nothing like it
- locate gives source file and line through symbolicate and source maps | browser app | same | tools.ts:183-192, symbolicate.ts | same | nothing like it
- override props, hooks or context | browser app | React host page with the bridge installed before React, as embed does | react.ts:198-252 | MT:68-75 | nothing
- track re-renders | browser app | same | react.ts:31-35,448; embed mount-impl.tsx:145 | MT:68-75 | nothing
- Inspect click opens the source in the editor | browser app | a desktop for the mounted app | open-source.ts:37-58 | MT:68-74, HE:229 | nothing found (inferred)
- reload op; a reading call is resent after the tab returns | e2e | reload the host page | rpc.ts:332,523, connection.ts:59 | MT (no reload) | OC/app/e2e/user-story/model-selection-flow.spec.ts:208
- Tab re-attaches after the stream drops or the engine restarts | happy-dom app | drop the stream / restart the engine | renderer.tsx:39-58 | no such call in HE | OC gui-plugins pane-machine.test.ts:153 (machine)
- Attachment ended by the engine with the stream still up; tab waits for focus | happy-dom app | make the engine end an attachment (plugin reload, permission withdrawn) | attachment.ts:38,230-236 | HE:243 | OC/plugin-browser/test/machine.test.ts:401
- Transient refusal retries with back-off | node/happy-dom | set engine timeouts (permissionSyncTimeoutMs), and hold one engine answer | attachment.ts:36 | HE:213-234 | OC/core/test/browser-attach.test.ts:36-60 (replaced layer)
- [page.timeout] past pageReplyTimeoutMs | happy-dom app | set engine timeouts | README options | HE:213-234 | OC/plugin-browser/test/machine.test.ts:322
- Queued action that never confirms fails at queuedActionTimeoutMs | browser app | same | queue.ts | same | same
- Queued fill released after a session switch does not type | browser app | hold one engine answer | act.ts:104-120 | no hold call in HE | OC/core/test/browser-attach.test.ts:36-60
- Outside caller leaves mid-call, page cancels | happy-dom app | abandon a tool call mid-flight | machine.ts cancelPending | HE:36-39 (call has no signal) | OC/plugin-browser/test/machine.test.ts:328
- Outside agent's discover_tools lists page tools only while a tab is attached | node/happy-dom | an outside agent's tool listing | plugin-host/src/core/tool.ts:246-250 | CT:52 (execute_typescript only) | OC/core/test/codemode.test.ts:34
- Hub: list_tabs, the tab argument, queue.wait delivered once, page.changes | e2e/cli | hub and CLI against the kit engine | cli/src/hub.ts:52-103,551; core/src/api/tabs.ts; core/src/page/page-plugin.ts:134-137 | CT:41-61 | nothing like it
- CLI conciv tools page <verb>, signatures, plugin call queue.wait | e2e/cli | same | core/src/runtime/plugin-signatures.ts:8 | no CLI runner in either kit | cli/test (inferred)
- Agent mask hides after 60 s idle | browser app | PRODUCT GAP: hard-coded timer, not an option | simulator.ts:26,283-286 | n/a | OC/core/test/browser-idle.test.ts:28-40 (own Clock)

### whiteboard (mounts the app from its own package)

- COMMIT_TIMEOUT keeps the draft when no tab is left | browser | close the tab while the engine runs | canvas-tools.ts:143-165 | MT:57,62-66 | OC/app/e2e/service-worker/cache.spec.ts:289 page.close
- anchor_resolve moved/ambiguous/drifted after a source edit | node | change a project file while the engine runs | anchor-resolver.ts:50-93 | HE:30,212; no file call HE:51-59 | OC/core/test/fixture/tmpdir.ts:8
- anchor_resolve moved through git; anchor records HEAD | node | git project | git-track.ts:16-52 | HE:26-32,246 | OC/core/test/fixture/git.ts:25 initGit
- Agent tool turn shows whiteboard cards | happy-dom | code-mode tool call in a scripted reply | cards.tsx:574-583 | TL:35-41 | OC/core/test/codemode.test.ts:78-79 (string)
- Draft auto-committed when a turn ends | browser | wait until plugin or page background work reaches the engine, with no polling | index.ts:21-28,77-81 | HE:51-59; until.ts not exported | OC/core/test/lib/eventually.ts:5
- User drawing saved to the shared board, the agent reads it | browser | same | island.tsx:93-94,221 | same | same
- Engine enriches human source comments | node/browser | same | enrich-worker.ts:36-50 | same | same
- Agent cursor with model name on the canvas | browser | check canvas pixels | agent-cursor.ts:44-58 | BC:23-26 | nothing
- Canvas follows the theme | browser | same | island.tsx:138-148 | same | nothing
- Canvas background setting changes the canvas | browser | same | island.tsx:181-183 | same | nothing
- "drawing…" cursor during the commit replay | browser | same | island-model.ts:13-22,155-173 | same | nothing
- Plugin rpc table methods (list/get/insert/update/remove/upsert CONFLICT/bulk/claim), public ./rpc | node | call a plugin's own rpc | rpc.ts:68-116, rpc-handlers.ts:17-160 | PE:36 (no address) | nothing like it
- since cursor, changed and cursor events | node | same | rpc.ts:109-122 | same | nothing
- Drag a floating pin moves it | browser | same (stored position only visible through rpc) | pin-drag.ts:95-97 | same | nothing
- Drift prompt "Keep link" saves offset and origin | browser | same | pin-drag.ts:46-57 | same | nothing
- Board persists; a second engine on the same state root reads it | node | restart the engine on the same state root | README | HE:246-247,261 | nothing found
- Chunk load failure toast, pill retries | browser | make a lazy chunk fail to load | overlay.tsx:12-19 | no call in MT, BC | OC/app/e2e settings.spec.ts:145 route.abort
- Comment pill on a host element, source-linked comment | browser | host page element with a source location | plugin-experimental.tsx:103-129, comment-compose.ts:59-85 | MT:13-17 | nothing
- "Comment not added" toast | browser | same, plus PRODUCT GAP: BINDING_WAIT 5 s hard-coded | comment-compose.ts:27,43-50 | MT:13-17 | nothing
- Second tab follows the board live | e2e | second page on one engine | change-feed.ts:41-65 | MT:59-78 | OC cache.spec.ts:277 newPage
- Catch-up through since after a reconnect | browser | drop the socket | change-feed.ts:110-120 | no call in HE | OC/app/e2e/utils/mock-server.ts:445 routeWebSocket
- Failed since retried with backoff | browser | fail one engine answer | change-feed.ts:79-86 | no call in HE, MT | OC model-selection-flow.spec.ts:12 route.abort
- "Could not save your whiteboard change" toast | browser | same | whiteboard-db.ts:30-35 | same | same
- User denies a destructive tool (canvas_delete/clear, comment_resolve/delete) | node | answer a permission ask with reject | refusal.ts:12-40 | HE:44,169 ('once' only) | OC/core/test/lib/permission.ts:4

### recorder (mounts the app from its own package)

- Load errors with Retry ("could not load the recording/player", capture failed) | browser | fail one engine answer, and make a lazy chunk fail | panel-view.tsx:123-128, player-kit.tsx:22-24 | HE:51-59 | OC/app/e2e/utils/persistent-pty.ts:111
- "New recording" fails: toast | browser | fail one engine answer | panel.ts:92,198-204 | same | same
- Export fails: toast | browser | same | panel.ts:90 | same | same
- GO LIVE / LIVE badge; arrows scrub ±5 s | browser | a clock (engine and page) | player.ts:97-185 | HE:26-32 | OC timeline-stream.spec.ts:754 page.clock.install
- Replay "not found" / "expired" | browser | a clock, and remove a saved file | recording-card.tsx:132-137 | HE:26-32,51-59 | same
- recording_start with no page fails after 5 s | node | shorten the plugin's own wait, or a clock | tools.ts:13,40-48 | HE:26-32 | OC/core/test/automation-event.test.ts:301 TestClock
- Stop at the 20 s lease or 10 min capture lifetime | browser | a clock | capture-control-machine.ts:4-6 | same | same
- Pause after the page has been hidden 30 s | browser | a clock, and hide the page | visibility-pause-machine.ts:2, page-capture.ts:48-50 | no call in BC | same
- Sliding window of windowMinutes | node/browser | a clock | index.ts:116 | same | same
- Saved recordings kept 7 days, pruned past 50 / 200 MB | node | a clock | recordings.ts:7-10,122-132 | same | same
- Save refused toasts (io-error; empty and too-large are not reachable from the UI) | browser | a project folder that refuses a write | panel.ts:26-30, recordings.ts:109,136-138 | HE:30,212 | not found (inferred)
- Export video downloads recording.webm | browser | see a file the page hands over to save | download.ts:6-13 | BC:23-26 | OC home.spec.ts:155 waitForEvent('download')
- Export video from the replay dialog | browser | same | recording-card.tsx:14-50 | same | same
- "page reloaded" entry in the action log | browser | reload | distill.ts:41-43 | MT:59-78 | OC terminal.spec.ts:32
- Thread cards for recording_start/stop/pull | browser | code-mode tool call in a scripted reply | plugin-experimental.tsx:82-145 | TL:35-41 | nothing (inferred)
- pull follows the most recently active page | browser | second page client in one test | runtime.ts:44 | MT:59-78 | OC timeline-stream.spec.ts:3015 newPage

### ios (in the app through embed; node in the package, native page e2e)

- ios_build in swiftc mode; xcodebuild mode; missing Info.plist diagnostic; ios_run boot/install/launch stages; CONCIV_URL and autoshow; ios_screenshot PNG; ios_logs; no matching simulator; one build at a time (9 features) | node | a simulator/xcrun the engine plugin can reach | build.ts:166-267, simulator.ts:49-190, tools.ts:83-120 | PE:21-28, HE:242-245 (process.env only; simctl.ts:50-51 spawns from it) | nothing like it (no simctl/xcrun in OC)
- Rejecting the build/run ask denies the tool | node | answer a permission ask with reject or always | tools.ts:155-165,185-189 | HE:44,164-170 | OC/core/test/tool-shell.test.ts:374-378
- iOS rules in the system prompt | node | system prompt in the recorded model request | tools.ts:244-246 | scripted-harness.ts:70-75, TL:9 | OC/core/test/session-runner.test.ts:123 request.system
- Unsupported bridge alert; app opens/closes the panel; native view pick (10 s timeout); rebind to a new api base; panel/mascot state forwarded (5 features) | e2e | a native app peer (WKWebView bridge) on the page, and mounting the native entry; pick also needs a clock | client.tsx:91-178, bridge.ts:43,126-144 | MT:13-17,68-75 | nothing like it

### terminal (in the app; browser mode in apps/conciv)

- Model list fails, Retry | browser app | fail one engine answer | terminal-toolbar.tsx:16-19,45 | HE:51-59 | OC/app/e2e/utils/persistent-pty.ts:111; terminal.spec.ts:287-304
- Open fails: toast and alert with Retry | browser app | same | terminal-surface.tsx:91-96 | same | same
- Restart fails: toast ("CLI is busy") | browser app | same | terminal-state.ts:57-59,94-106 | same | same
- Output replayed after a page reload | browser or e2e | reload | terminal-transport.ts:42-46 | MT:59-78 | OC terminal.spec.ts:15-32 page.reload
- Resizing the pane resizes the shell | browser app | change the viewport size | terminal-transport.ts:62 | no call in MT, BC | OC terminal.spec.ts:243 setViewportSize

### tanstack (in the app)

- build_errors from the dev server | node | an engine with a running Vite dev server attached as its bundler bridge | tools.ts:62-70,148-160 | HE:213-234 (no bridge; core accepts one at app.ts:201) | nothing like it (OC/plugin/test/gui-vite.test.ts:21 builds only)
- server_fn_trace of real calls | node | same | serverfn-trace.ts:49-92 | same | nothing
- Thread cards with dev-server data | happy-dom app | same | plugin-experimental.tsx:392-420,460-499 | same | nothing
- CLI conciv plugin call experimental.tanstack ... | node | call a plugin's rpc method as the CLI does | index.ts:30-42; cli/src/plugin.ts:27 | PE:36, CT:41-61 | OC/server/test/fixture/routes.ts:23 serveRoutes; rpc-handler-errors.test.ts:57
- 14 page operations (detect, router_state, route_tree, data_entries, loader_data, data_invalidate, errors_snapshot, query_cache, query_invalidate, query_refetch, navigate, router_invalidate, back, result-size guard), counted as 14 | happy-dom app | a running TanStack React app on the test page beside the widget | rpc.ts:133-218, operations.ts:57-148 | MT:13-17,75 | nothing like it
- Thread cards with page data | happy-dom app | same | plugin-experimental.tsx:140-385 | same | nothing
- Tab goes away mid-call (disconnected before/after dispatch) | happy-dom app | drop the page's connection or close the tab during a call | tools.ts:91-97, failures.ts:31-45 | no call in HE, MT | OC multi-server.spec.ts:202 holdRoute

### test-runner (mounts the app from its own package)

- run, run with pattern, status after a run, list files, playwright runner, one run at a time, panel while running, panel when done, panel "Fix this", run card live/finished, card "Fix this" (11 features) | node / happy-dom | a project folder with vitest (or playwright and its browsers) really installed and real test files | tools.ts:25-56, vitest-run.ts:94,127-143, playwright-run.ts:29-102, run.ts:99-122, tests-panel.tsx, plugin-experimental.tsx:185-334 | HE:212,246; no fixture option HE:26-32 | nothing like it (closest OC/core/test/fixture/tmpdir.ts:24)
- stop from the CLI kills the run; CLI plugin call status/current/list/run (2 features) | node | call a plugin's rpc method, plus the project | index.ts:37-59, rpc.ts:23-33 | no call in HE, PE:36 | OC routes.ts:23
- "Open file:line" in the editor | happy-dom | a desktop for the mounted app, plus the project | plugin-experimental.tsx:275-283 | MT:68-74 | not reopened
- Panel re-reads status after a reconnect | happy-dom | drop and restore the engine connection | follow-machine.ts | no call in HE, MT | OC multi-server.spec.ts:202

### try-it (mounts the app from its own package)

- Connect cover, copy the command, hand-off prompt, "Waiting for your agent…", slow hint, non-UUID token fails (6 features) | happy-dom | mount in servers mode with a host-composed window plugin and its options | plugin-experimental.tsx:15-64, connect-pane.tsx:22-153 | MT:13-17,69 (only kind 'bound') | OC/app/e2e/utils/app.ts:42,97 seeds servers
- A core answers on a connect port and is held, then bound; a core up at the first sweep binds with no hold (2 features) | happy-dom | same, plus an engine on a chosen connect port with the pairing token as its token | connect-machine.ts:31-87, probe.ts:19-41 | HE:251 (no port), :254 (own token) | OC multi-server.spec.ts (seeded URLs)
- Local network blocked step and status | browser | servers mode, plus setting Chrome's local-network-access permission | local-network-access.ts:26-37 | BC:23-26 | nothing (only clipboard grants, OC terminal.spec.ts:10)

## Distinct missing capabilities (features that need each, across the area)

1. A real host app on the test page beside the widget: a TanStack React app, a React app with the bridge installed before React, an element with a source location. 19 (tanstack 15, page 2, whiteboard 2).
2. A project folder made from real fixture files with dependencies installed (vitest, playwright and its browsers). 13 (test-runner).
3. A clock for the engine and page, or plugin waits shortened. 8 (recorder 7, ios pick 1).
4. A scripted reply that calls a code-mode plugin tool by name and input, without the test writing the TypeScript program. 8 (page 6, whiteboard 1, recorder 1). opencode writes the string itself, so this may be a ruling rather than a gap.
5. Fail one engine answer. 8 (terminal 3, recorder 3, whiteboard 2).
6. Call a plugin's own rpc the way the browser or `conciv plugin call` does. 7 (whiteboard 4, test-runner 2, tanstack 1).
7. A simulator/xcrun the ios plugin can reach. 9 (ios).
8. Mount in servers mode with a host-composed window plugin and its options. 9 (try-it).
9. A native app peer (WKWebView bridge) and mounting the native entry. 5 (ios).
10. A dev server bound to the engine's project: the tanstack bundler bridge, and host sources for hmr and source maps. 5 (tanstack 3, page 2).
11. Drop and restore the connection, or close the tab, during a call. 5 (page 1, tanstack 1, test-runner 1, whiteboard 2).
12. Set the engine's own timeouts (pageReplyTimeoutMs, queuedActionTimeoutMs, permissionSyncTimeoutMs). 3 (page).
13. A second page or tab on one engine. 3 (page, whiteboard, recorder).
14. Reload the host page. 3 (page, terminal, recorder).
15. Wait until page or plugin background work has reached the engine, with no polling. 3 (whiteboard).
16. Check what a canvas paints. 4 (whiteboard).
17. Answer a permission ask with reject or always. 2 (whiteboard, ios).
18. Hold one engine answer (not a model reply). 2 (page).
19. Hub and CLI against the kit engine. 2 (page).
20. A desktop for the mounted app (open in editor). 2 (page, test-runner).
21. Make a lazy chunk fail to load. 2 (whiteboard, recorder).
22. See a file the page hands over to save. 2 (recorder).
23. A project folder that refuses a write or loses a saved file. 2 (recorder).
24. Each of these is needed by 1 feature:
    - restart the engine on the same state root (whiteboard);
    - change a project file while the engine runs (whiteboard);
    - git project (whiteboard);
    - make the engine end an attachment with the stream up (page);
    - abandon a tool call mid-flight (page);
    - an outside agent's tool listing (page);
    - set the host page's URL (page);
    - system prompt in the recorded request (ios);
    - change the viewport size (terminal);
    - hide the page (recorder);
    - an engine on a chosen port and token (try-it);
    - set the local-network-access permission (try-it).

Some features need two capabilities, so the counts add up to more than 130.

Product gaps, not kit gaps (a hard-coded timer a test must cross):

- page simulator.ts:26 (60 s mask idle);
- whiteboard comment-compose.ts:27 (BINDING_WAIT 5 s);
- recorder tools.ts:13 (5 s start wait).

Set-up gaps: apps/conciv has no @conciv/plugin-testkit devDependency and no test project (apps/conciv/package.json:61-80). React fixtures need @testing-library/react, which is not a dependency.

## YES (short)

- **page (29):**
  - Page tools are absent without a tab and work with one; tabs.list; route.
  - dom/query/text/value/attr/exists; snapshot refs used by click/fill; masked password and one-time-code fields; open shadow roots, never the widget's.
  - console; screenshot; wait.
  - click/hover/press/submit/scroll; fill/select/check/uncheck/fill_form and contenteditable; refusals.
  - DOM edits; effect.
  - Alt inspector and Esc; eval approve (deny only through the card).
  - queue and queue_async; mask with two-click stop.
  - Session delete detaches; re-attach to a new session.
  - Grab staged and sent; page skill and catalog in requests(); find/tree/inspect.
  - A plugin's own PageOperation; machine.ts and symbolicate.ts node tests.
  - Kit calls: createEngine, mount, session.tool().call/failure, approve, requests, Testing Library render of a fixture, user-event.
- **whiteboard (54):**
  - Node: svg/diagram/no-canvas/export failures, commit with no draft, comment create/reply/read/list/resolve/delete (allowed), move, pin state, anchor fresh/orphaned, element_reference, secret redaction, outside-path refusal, skill and namespace in requests(), bad options.
  - Browser with the canvas open: canvas_read/draw/svg/mermaid/connect/update/export/commit/discard/delete/clear/preview.
  - Happy-dom: confirm card, background settings row.
  - Browser UI: pill, Escape layering, toasts, pins, thread, reply with @mention, resolve/delete/previous-next, inbox search/sort/filter, chat pane hidden, Disconnect a source pin, per-session boards.
  - Kit calls: createEngine (plugin option tuple, files), session.tool, approve, requests, mount, user-event.
- **recorder (15):**
  - Recorder tab; empty notice; live capture and player controls.
  - Send to agent (note plus requests()); new recording; replay dialog.
  - recording_start/stop/pull/get, including unknown and expired ids.
  - Masking options; console option.
  - Kit calls: createEngine with options, mount, session.tool, requests, user-event.
- **ios (5):**
  - Unconfigured tools answer "not configured", both direct and code-mode.
  - Configured build and run ask (approve).
  - concivUrl schema; bridge machine (node, no kit).
- **terminal (12):**
  - Tab listed; shell start line; typing and output.
  - Model picker restart; model remembered; New terminal.
  - Busy lock; Escape interrupt; focus kept.
  - Grab paste; scrollback on reopen; back to chat.
  - Kit calls: createEngine (quick harness), mount, user-event, getByText (xterm screenReaderMode).
- **tanstack (12):**
  - build_errors without a dev server; bad bundlerWaitMs.
  - route_manifest from `files`; MANIFEST_UNREADABLE; empty server_fn_trace.
  - Skill in requests().
  - router_not_found on a page with no router; tabs.list; tab_unavailable; page.disconnected.
  - Inspector chip; cards for outputs the kit can produce.
- **test-runner (8):**
  - status before any run; vitest unavailable; jest/node-test rejected at start.
  - Skill in requests().
  - Idle tab; panel when unavailable; run card when unavailable; status card.
- **try-it (0).**

## Could not judge (13)

- **page 3:**
  - invalid-result protocol error (needs another page version);
  - unsupported/unavailable refusals;
  - grab card "could not be read" (needs a corrupt attachment).
- **whiteboard 2:**
  - DRAW_UNFINISHED (a timing race);
  - "Loading the whiteboard…" toast (only shows while the chunk loads).
- **terminal 4:**
  - tab hidden for a harness with no terminal: the quick harness always has one, and harness options are gone;
  - pick() failure toast (unknown trigger);
  - theme colours (seen only as colours);
  - pruning a deleted session's model (nothing a user sees).
- **ios 1:** where an invalid-options failure surfaces.
- **recorder 3:**
  - "page plugin not active" (no clean way, and policies are hard-coded []);
  - recorder skill (may reach the model only through the system prompt, which is not recorded);
  - invalid options.

## Kit facts that differ from what a brief might assume (read, 4079f98b7)

- The test's engine carries no address (PE:36). It is kept internally for mount only (PE:42).
- approve() always answers 'once' (HE:164-170).
- policies are hard-coded [] (HE:224), and plugin-testkit's createEngine has no policies option (PE:21-28).
- TestLLM has only text, toolCall, failAfter and hangAfter (TL:27-49).
- harness-testkit exports "." only; there is no test-llm subpath.
- mount always uses memory navigation (MT:70) and waits for the "Open conciv chat" button (MT:76).
- Browser mode refuses `harness` and streamed replies.

## Inferred, not read

- That the mounted app attaches the test document as a page tab, on engine.session.
- That a tool ask raised over MCP lands in pendingApprovals.
- That ctx.location.directory is the kit's project root.
- That skill and namespace text sits in requests().
- That denying `execute` makes the tanstack tools direct.
- That a plugin's activation failure rejects createEngine.
- That vitest cannot be resolved from the bare temp root.
- That pins, inbox and thread cannot run in happy-dom.
- That recorder keyframes need Playwright's Chromium on the engine host.
