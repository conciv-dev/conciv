plugins3: feature pass, READ ONLY. Nothing was edited.

Scope:

- Area: plugin author and host surfaces: packages/plugin, packages/plugin-host, packages/unplugin, packages/embed, packages/mascot, packages/grab, packages/client, the connection machine in packages/contract, apps/site widget embedding, and the e2e/ apps.
- Kit: judged at worktree aidx-wt-kit-mounts head 4079f98b7, after the revert. Nothing counts as coming. e2e/e2e-utils is not treated as a kit.
- Who did the reading: three opus readers, read only, told not to run memo. I read the kits myself in full.
- What I checked myself, all of which held:
  - call-tool.ts:49-52
  - plugin-testkit engine.ts:36 and :55-73
  - scripted-harness.ts:70-75
  - harness-engine.ts:26-59, :213-245 and :257-278
  - mount.ts:13-17 and :68-76
  - protocol config-types.ts:85, unplugin core/boot.ts:19-28 and core start.ts:101
  - core api/mcp.ts:372-375, client index.ts:70-76
  - opencode component-tests/new-session-wordmark.spec.ts:10-36
- Unless marked "inferred", every claim was read.
- Rule for the opencode column: where opencode's way is not a clean test by our rules (expect.poll, data-component locators, a mock server), the row says so.

## The kit at 4079f98b7 (read)

- **harness-testkit options** (harness-engine.ts:26-32): only `harness`, `config`, `replies`, `files`, `settings`.
- **Session** (:41-47): `id`, `send`, `approve()` (always 'once', :169), `stop`, `tool`.
- **Engine** (:51-59): `session`, `newSession`, `setting`, `gate`, `requests`, `address`, `stop`.
- **How bootApp starts the engine:**
  - It calls core `makeApp`, served by `serveHono`. It never calls core `start()` and runs no bundler.
  - These values are fixed: `policies: []` (:224), `harnesses: []` (:231), `openInEditor` a no-op (:229), `print` swallowed (:213).
  - It passes no bridge, no childEnv and no nativePageDir (:213-234).
  - The env is `process.env` plus `CONCIV_DISABLE_FILEWATCHER: 'true'` (:242-245).
  - Each engine gets a fresh temp root (:246).
- **What the scripted harness records:** messages, plus each tool's name and description only (scripted-harness.ts:70-75). The model list is fixed (:14-19), and it has `compaction: false`.
- **TestLLM:** `text`, `toolCall`, `failAfter`, `hangAfter` only.
- **plugin-testkit:**
  - Engine is a Pick of `session`, `newSession`, `setting`, `gate`, `requests` (engine.ts:36). A test has no `address` and no `stop`.
  - Every string plugin entry is mapped to a directory (:55-73), so a remove entry like `-id` throws.
- **mount** (mount.ts:13-17, 68-76):
  - Options are `engine`, `seed.storage`, `route` only.
  - It always binds the right token, always uses an in-memory route and `root: document`, and uses a memory draft store.
  - It renders `ConcivApp` directly, never the embed bundle.
- **Vitest projects:** node, happy-dom and browser only (test-projects.ts:210-266). The package exports `./node` and `./browser` only. Browser commands are the engine calls plus page errors (:262).
- **No e2e kit exists.** No file in e2e/, apps/site, unplugin or embed imports either kit.
- **e2e-utils** (private, not a kit) gives:
  - one real dev server per app;
  - a boot check;
  - magic-link or code login;
  - a bundle hot swap;
  - a real-CLI matrix.
  - It has no scripted replies, and its login wait uses `expect.poll` (widget.ts:134).
- **Product blocker for e2e:** no e2e app can run the scripted harness. `conciv()` takes `harness` as a string id only (config-types.ts:85), and unplugin never passes an adapter to `start` (boot.ts:19-28). Every e2e app runs the real default harness.
- **Stale doc:** docs/testing-plugins.md:5-11 documents `bootCoreKit` and `openPluginWidget`, which do not exist.

## NO rows

Columns: feature | test belongs | missing capability | product | kit | opencode.

### Plugin SDK and plugin-host (31)

| #   | feature                                                                                                                                  | belongs             | missing capability                                                                  | product                                                            | kit                                              | opencode                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------ | --------------------------------------------------------------------------- |
| P1  | Outside agent calls a direct (`codemode: false`) plugin tool by its own name over MCP                                                    | node                | call an MCP tool other than execute_typescript                                      | core api/mcp.ts:372-375; plugin-host core/tool.ts:246-250          | call-tool.ts:49-52                               | opencode tests call tools on the layer, not over MCP                        |
| P2  | Outside agent runs `discover_tools`                                                                                                      | node                | a discover call                                                                     | core api/mcp.ts:361-371                                            | no such call in call-tool.ts                     | core/test/codemode.test.ts:18 (layer)                                       |
| P3  | Code-mode catalog (pinned tools, budget) in execute_typescript's description                                                             | node                | read the MCP tool list                                                              | core api/mcp.ts:91-95; plugin-host core/codemode/catalog.ts:52-160 | no such call in call-tool.ts                     | core/test/codemode/catalog.test.ts:37-96 (pure function)                    |
| P4  | Code-mode preface reaches the model as a system prompt                                                                                   | node                | record a model request's system prompts                                             | chat/src/turn.ts:335; ai chat-server.ts:597-601                    | scripted-harness.ts:70-75                        | ai/src/testing.ts:157-170 records the whole request                         |
| P5  | Outside client calls `plugin.call` / `plugin.list`                                                                                       | node                | engine address on the plugin-testkit engine                                         | contract.ts:573-578                                                | engine.ts:36                                     | not looked further                                                          |
| P6  | Config remove entries (`-id`, `-conciv.*`, `*`) drop a plugin                                                                            | node                | pass config plugin entries through untouched                                        | plugin-host supervisor.ts:33-40; config/plugin/source.ts:189-191   | engine.ts:55-73 (throws)                         | core/test/plugin/supervisor.test.ts:40-51                                   |
| P7  | `./` plugin paths resolve against the project; a file path warns                                                                         | node                | same as P6                                                                          | config/plugin/source.ts:197-201, 219-222                           | engine.ts:66 (resolved against cwd)              | supervisor.test.ts:41                                                       |
| P8  | Plugin dropped into the project's `conciv/plugins/` loads                                                                                | node                | place a committed fixture folder inside the project root (`files` are strings only) | plugin/source-directory.ts:7-33; config/plugin/source.ts:206-214   | harness-engine.ts:26-32                          | supervisor-reload.test.ts:92 writes plugin source as a string (banned here) |
| P9  | Server part hot reload; a failing revision keeps the old one                                                                             | node                | file watcher on, plus an editable copy of a fixture                                 | supervisor.ts:187-220; plugin.ts:218-231                           | harness-engine.ts:243                            | supervisor-reload.test.ts:169-183 (Watcher test emit)                       |
| P10 | Browser part edit reloads only the browser part                                                                                          | node + e2e          | same as P9                                                                          | config/plugin/source.ts:241-255; plugin/module.ts:166              | harness-engine.ts:243                            | supervisor-reload.test.ts:169                                               |
| P11 | A lazy chunk is refused when its bytes changed since load                                                                                | node                | an editable fixture copy                                                            | plugin.ts:350-352                                                  | harness-engine.ts:212                            | not looked                                                                  |
| P12 | npm `name@version` plugin installs and loads                                                                                             | node                | npm targets reach the engine, plus a package registry or cache                      | plugin/module.ts:110-116; util/npm.ts                              | engine.ts:55-62                                  | core/test/npm.test.ts:13-22, 169-195; plugin/fixture.ts:54                  |
| P13 | Update check (outdated / updating, 24 h recheck)                                                                                         | node                | same as P12, plus a settable clock                                                  | plugin/update.ts:33-66; supervisor.ts:141-148, 194                 | engine.ts:55-62                                  | npm.test.ts:381-443                                                         |
| P14 | Organization policy `plugin.use` deny blocks a plugin                                                                                    | node                | a policies option                                                                   | plugin/module.ts:51-52; managed-policy.ts:24-26                    | harness-engine.ts:224                            | core/test/fixture/policy.ts:16-33                                           |
| P15 | An ask answered "always" (saved) or "reject"                                                                                             | node                | a reply kind on approve                                                             | permission/saved.ts; plugin/host.ts:140-148                        | harness-engine.ts:44, 169                        | core/test/permission.test.ts:389, 436                                       |
| P16 | Plugin storage survives an engine restart                                                                                                | node                | restart one engine on the same root                                                 | plugin/host.ts:237-273                                             | harness-engine.ts:246                            | core/test/kv.test.ts (layer, not opened)                                    |
| P17 | Home skills, and project-over-home order                                                                                                 | node                | seed the conciv home folder                                                         | plugin README.md:305; config/plugin/skill.ts                       | harness-engine.ts:232                            | core/test/fixture/global.ts:6-26                                            |
| P18 | A skill folder change rescans                                                                                                            | node                | file watcher on                                                                     | README.md:305                                                      | harness-engine.ts:243                            | supervisor-reload.test.ts:169                                               |
| P19 | Skill autoinvoke instructions reach the model                                                                                            | node                | record system prompts                                                               | core runtime/permission-cards.ts:131-160                           | scripted-harness.ts:70-75                        | ai/src/testing.ts:157-170                                                   |
| P20 | Session instruction entry: first-turn text reaches the model                                                                             | node                | same as P19                                                                         | plugin/host.ts:213-229                                             | same                                             | same                                                                        |
| P21 | `context` hook edits to system, model options and tool input schema reach the model                                                      | node                | record system prompts, options and input schemas                                    | README.md:285                                                      | scripted-harness.ts:73                           | same                                                                        |
| P22 | `compaction` hook result replaces the compaction request                                                                                 | node                | a compact call and a harness that compacts                                          | README.md:285                                                      | harness-engine.ts:41-59; scripted-harness.ts:142 | core/test/plugin/session-compact.test.ts (not opened)                       |
| P23 | Plugin `model.list` with another model list, or none                                                                                     | node                | a models option                                                                     | plugin/host.ts:99-102                                              | scripted-harness.ts:14-19                        | not looked                                                                  |
| P24 | Dev server attached: `bundler.status` and `bundler.diagnostic`, plus the server tools (config, urls, resolve, graph, transform, restart) | node                | attach a dev-server bridge                                                          | tool/plugin/server.ts:131-216; plugin/host.ts:105-110              | harness-engine.ts:213-234                        | opencode has nothing like it                                                |
| P25 | `server` rpc `open` / `Desktop.launch` opens a file in the editor                                                                        | node                | see what the engine asked the editor to open                                        | tool/plugin/server.ts:72-79, 136-138                               | harness-engine.ts:229                            | opencode has nothing like it                                                |
| P26 | Engine `ctx.servers` lists other engines on the machine                                                                                  | node                | two engines sharing one home                                                        | README.md:170, 263                                                 | harness-engine.ts:232, 246                       | opencode has nothing like it                                                |
| P27 | `ctx.system.save` (download) and `openExternal` (new tab)                                                                                | browser             | observe a download or a new page                                                    | experimental/context.ts:111                                        | browser-commands.ts:6-26                         | app/e2e/regression/review.spec.ts:1085, composer.spec.ts:432                |
| P28 | `ctx.overlay` content found by role                                                                                                      | happy-dom / browser | queries inside the overlay's shadow root                                            | apps/conciv/src/runtime/plugin/overlay.tsx:28                      | no such call in mount.ts                         | opencode has nothing like it                                                |
| P29 | `ServerRef.connected` detaches while the stream reopens, then attaches                                                                   | happy-dom           | drop or stall the engine socket                                                     | README.md:333                                                      | no such call in engine.ts or browser-commands.ts | not found                                                                   |
| P30 | Server registry `cover` drawn while the widget has no engine (try-it)                                                                    | happy-dom           | mount with no bound engine                                                          | README.md:370-372                                                  | mount.ts:69                                      | not looked                                                                  |
| P31 | SDK client: reconnect loop, idle watchdog (`idleTimeout`), status transitions                                                            | node / happy-dom    | same as P29 (a client built in the test is a banned raw client)                     | README.md:174; client/promise/client.ts                            | no such call in engine.ts                        | not found                                                                   |

### unplugin, embed, site, e2e apps (54)

O1 means opencode's app e2e kit: packages/app/e2e/utils (`seed` app.ts:62, `mockOpenCodeServer` mock-server.ts:203-215, `trackPageErrors` errors.ts:3-14). It runs its own app dev server (playwright.config.ts:23-25, 45-57), fakes the backend at the network, and reloads with `page.reload()` (user-story/model-selection-flow.spec.ts:208). A faked server is not allowed by our rules.

O2 means opencode has nothing like it: no bundler plugin and no embeddable widget (no attachShadow, no openInEditor found).

K1 means "an e2e kit". Each K1 cell says what e2e-utils already gives.

| #     | feature                                                                                                                                                                                                                           | belongs | missing capability                                                                  | product                                                                    | kit                                            | opencode              |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------- | --------------------- |
| U1    | Vite `conciv()` boots the engine at dev start                                                                                                                                                                                     | e2e     | K1 (e2e-utils: dev server + boot check)                                             | unplugin core/vite.ts:355-370                                              | test-projects.ts:210-266; package.json exports | O1                    |
| U2    | A second Vite dev server still boots (the port is a preference)                                                                                                                                                                   | e2e     | K1 + an engine booted as the dev server boots it; e2e-utils runs one server per app | core/vite.ts:149                                                           | same                                           | O2                    |
| U3    | Served HTML gets the meta tags and script, and the widget appears                                                                                                                                                                 | e2e     | K1 (boot check)                                                                     | core/vite.ts:342-354; widget-middleware.ts:13-23                           | same                                           | O1                    |
| U4    | SSR hosts get the tags through the middleware; no second script, frames skipped                                                                                                                                                   | e2e     | K1 (boot check on svelte, solid-start, tanstack-start, astro)                       | widget-middleware.ts:105-173                                               | same                                           | O2                    |
| U5    | `widget:false` boots the engine and injects no widget                                                                                                                                                                             | e2e     | K1                                                                                  | widget-middleware.ts:37; index.ts:131                                      | same                                           | O2                    |
| U6    | `conciv({widget})` settings (modal position, quickTerminal hotkeys, `modal:false`) reach the widget                                                                                                                               | browser | mount takes widget settings                                                         | widget-middleware.ts:20, 41-42; embed mount-impl.tsx:46-53, 147            | mount.ts:13-17, 68-74                          | O2                    |
| U7    | `enabled:false` boots nothing, adds no tags, stamps nothing                                                                                                                                                                       | node    | a bundler run on a temp project in a node test                                      | core/vite.ts:339, 348, 359                                                 | no bundler in either kit                       | O2                    |
| U8    | With Vite DevTools, the widget opens as a dock panel with no launcher                                                                                                                                                             | e2e     | K1 + a DevTools dock driver                                                         | core/vite.ts:255-258, 272-294; widget-module.ts:27-50                      | no dock call anywhere                          | O2                    |
| U9    | The dock gets its engine token over DevTools rpc, with no login                                                                                                                                                                   | e2e     | same as U8                                                                          | core/vite.ts:282-292; widget-module.ts:31-32                               | same                                           | O2                    |
| U10   | JSX source stamps: a picked element carries file:line to the agent                                                                                                                                                                | e2e     | K1 + the scripted harness inside an e2e app                                         | core/vite.ts:111-114, 338-341                                              | harness-engine.ts:239-278                      | O1 (server faked)     |
| U11   | A file:line opens in the editor, only inside the project root                                                                                                                                                                     | node    | an engine booted as the dev server boots it (editor opener)                         | core/open-editor.ts:7-13                                                   | harness-engine.ts:229                          | O2                    |
| U12   | The agent's bundler tools (config, resolve, graph, transform, urls, restart)                                                                                                                                                      | node    | same, with the bridge                                                               | core/vite-bridge.ts:7-62                                                   | harness-engine.ts:213-234                      | O2                    |
| U13   | Build errors, HMR updates and request traces reach the agent                                                                                                                                                                      | node    | same                                                                                | core/vite-bridge.ts:64-120                                                 | same                                           | O2                    |
| U14   | The agent CLI finds `conciv` on its PATH, with CONCIV_PORT set                                                                                                                                                                    | e2e     | same (childEnv) + the scripted harness in e2e                                       | core/bin-shim.ts:14-24; boot.ts:27                                         | harness-engine.ts:213-245                      | O2                    |
| U15   | One Solid copy, and no console echo loop on the host                                                                                                                                                                              | e2e     | K1 (e2e-utils checks it, widget.ts:15, 40)                                          | core/vite.ts:20-56, 296-322                                                | test-projects.ts:210-266                       | O2                    |
| U17   | Closing or restarting the dev server stops the engine once, and the widget comes back                                                                                                                                             | e2e     | K1 + restart the host dev server from a test                                        | core/vite.ts:161-174, 371-373                                              | same                                           | O2                    |
| U18   | webpack/rspack dev boots on port 24170 exactly and starts the widget from every entry                                                                                                                                             | e2e     | K1 + a webpack or rspack consumer app (none exists)                                 | index.ts:20-43, 124-140                                                    | e2e-utils config.ts:6-21                       | O2                    |
| U19   | A webpack/rspack production build starts no engine                                                                                                                                                                                | node    | a bundler run in a node test                                                        | index.ts:125                                                               | no bundler                                     | O2                    |
| U20   | Taken port, bad port or unwritable `.conciv`: one `conciv:` line, and the build goes on                                                                                                                                           | e2e     | same as U18 (in node it would need a console spy)                                   | index.ts:20-43, 81-92                                                      | same                                           | O2                    |
| U21   | webpack/rspack `widget:false` adds no widget entry                                                                                                                                                                                | e2e     | same as U18                                                                         | index.ts:131                                                               | same                                           | O2                    |
| U22   | The rollup and esbuild entries are no-ops                                                                                                                                                                                         | node    | a bundler run in a node test                                                        | index.ts:148-149                                                           | no bundler                                     | O2                    |
| U24   | Next `register()` boots the engine in dev, on the nodejs runtime only                                                                                                                                                             | e2e     | K1 (nextjs boot check)                                                              | core/nextjs.ts:90-97                                                       | test-projects.ts:210-266                       | O2                    |
| U25   | The Next widget starts from instrumentation-client                                                                                                                                                                                | e2e     | K1                                                                                  | nextjs-widget.ts:1-5; widget-start.ts:20-25                                | same                                           | O2                    |
| U26   | Login: locked launcher, code printed in the dev log, or magic link                                                                                                                                                                | e2e     | K1 (e2e-utils login.ts:9-41); kit mount skips login                                 | e2e-utils login.ts:9-41                                                    | mount.ts:69                                    | O1                    |
| E1    | A host page loads the widget with one `<script src=conciv-widget.global.js>`; chunks come from `widget/`                                                                                                                          | e2e     | K1 + mount the widget the way a host page does                                      | embed vite.config.ts `widget` environment                                  | mount.ts:75                                    | O2                    |
| E2    | API base order: the global, then the meta tag, then `?core=` (loopback or same origin only, otherwise a warning)                                                                                                                  | browser | mount as a host page does; engine address reachable                                 | embed mount-impl.tsx:22-40                                                 | mount.ts:68-74; engine.ts:36                   | O2                    |
| E3    | Open shadow root, fixed full-viewport overlay                                                                                                                                                                                     | browser | same                                                                                | mount-impl.tsx:108-133                                                     | mount.ts:71                                    | O2                    |
| E4    | Keys typed in widget inputs never reach host page handlers                                                                                                                                                                        | browser | same                                                                                | mount-impl.tsx:68-80                                                       | same                                           | O2                    |
| E5    | A selection that starts in the widget stays in the widget                                                                                                                                                                         | browser | same                                                                                | mount-impl.tsx:82-106                                                      | same                                           | O2                    |
| E6    | `createConciv` handle: mount, unmount, open/close/toggle, rebind                                                                                                                                                                  | browser | same                                                                                | embed mount.ts:39-124                                                      | mount.ts:59-78                                 | O2                    |
| E7    | `mountConciv` keeps one instance, skips capture frames, removes its element on failure                                                                                                                                            | browser | same                                                                                | embed mount.ts:126-147                                                     | same                                           | O2                    |
| E8    | A failed mount is logged and reset                                                                                                                                                                                                | browser | same (`pageErrors` exists)                                                          | embed mount.ts:72-80                                                       | same                                           | O2                    |
| E9    | Servers mode: plugins and no api base open the connect flow at /panel/connect                                                                                                                                                     | browser | servers mode (mount with no bound engine)                                           | mount-impl.tsx:64-66, 135-139, 157                                         | mount.ts:69                                    | O2                    |
| E10   | A typed draft survives a real reload in the browser store                                                                                                                                                                         | e2e     | K1 (e2e-utils types a draft, widget.ts:149-160); kit mount uses a memory store      | mount-impl.tsx:55-62                                                       | mount.ts:26-50, 73                             | O1 (`page.reload`)    |
| E12   | Native iOS page: `?launcher=mascot`, unmount on pagehide                                                                                                                                                                          | e2e     | an engine that serves the native page                                               | embed native-entry.ts:17-44                                                | harness-engine.ts:213-234                      | O2                    |
| E13   | React, Preact and Solid `<ConcivWidget/>`                                                                                                                                                                                         | e2e     | K1 (four component apps boot)                                                       | packages/react/src/index.ts:14-36                                          | test-projects.ts:210-266                       | O2                    |
| S1    | Site shows the live widget with the try-it plugin on desktop, not on mobile                                                                                                                                                       | e2e     | K1 + servers mode + a site e2e config (none)                                        | site components/live-widget-mount.tsx:8-20; lib/mount-live-widget.ts:43-65 | mount.ts:69                                    | O2                    |
| S2    | Home page auto-opens unless dismissed; `?widget` overrides                                                                                                                                                                        | e2e     | same                                                                                | lib/try-state.ts:1-8; routes/__root.tsx:16-20                              | same                                           | O2                    |
| S3    | `?try=1` opens the panel; Back closes it; closing strips `?try`                                                                                                                                                                   | e2e     | same                                                                                | lib/mount-live-widget.ts:23-41, 67-77                                      | same                                           | O2                    |
| S4    | Closing before connecting dismisses the try panel for 24 h by cookie                                                                                                                                                              | e2e     | same                                                                                | lib/mount-live-widget.ts:75-76; lib/try-state.ts:10-12                     | same                                           | O2                    |
| A1-A9 | Each e2e app (vite-vanilla, vite-react, vite-solid, svelte, solid-start, tanstack-start with plugin-tanstack, tanstack-start-redact, nextjs, astro): open the page, launcher, panel, composer, no errors, no third-party requests | e2e     | K1 (e2e-utils boot check, widget.ts:69-90)                                          | each e2e/<app> config                                                      | test-projects.ts:210-266                       | O1                    |
| A11   | Packed tarball installs (CI only)                                                                                                                                                                                                 | e2e     | K1                                                                                  | e2e/README.md Packed suites                                                | same                                           | O2                    |
| A12   | Widget against each real harness CLI                                                                                                                                                                                              | e2e     | K1 (e2e-utils config.ts:159-185)                                                    | e2e/harnesses/vite.shared.ts:7-15                                          | same                                           | O1                    |
| A13   | Chat in an e2e app: send, reply, tool cards, approvals                                                                                                                                                                            | e2e     | K1 + the scripted harness inside an e2e app (blocked in product code)               | config-types.ts:85; unplugin boot.ts:19-28                                 | harness-engine.ts:239-278                      | O1 (fakes the server) |
| A14   | plugin-tanstack journeys that need the agent to call its tools                                                                                                                                                                    | e2e     | same                                                                                | e2e/tanstack-start/vite.config.ts:13, 23                                   | same                                           | O1                    |
| A15   | A rebuilt `conciv/plugins/live-line` bundle swaps in place and keeps the draft                                                                                                                                                    | e2e     | K1 (e2e-utils widget.ts:138-165)                                                    | e2e/vite-solid and e2e/nextjs conciv/plugins/live-line                     | same                                           | O1                    |

### Mascot, grab, client, connection machine (25)

M1 means opencode component-tests/new-session-wordmark.spec.ts:10-36. It does a pixel read and a frame count on a story mount, using `expect.poll` and data-component locators, which are not clean by our rules.

| #   | feature                                                                                                                 | belongs           | missing capability                                            | product                                                         | kit                                                   | opencode                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------ |
| C1  | The robot rests while the chat is closed, and wakes animated when it opens                                              | browser (app)     | see what is drawn (pixels or frames) without DOM or CSS reads | mascot core/mascot.ts:148-151; apps/conciv/src/shell/fab.tsx:23 | test-projects.ts:262                                  | M1                                                                       |
| C2  | While closed, the eyes and antenna follow the pointer                                                                   | browser           | same                                                          | core/parts/follow.ts:173; fab.tsx:25                            | same                                                  | M1 :19-31                                                                |
| C3  | While the agent works, head bob, antenna throb, eye blink                                                               | browser           | same                                                          | core/parts/activity.ts:183; core/config.ts:52-79                | same                                                  | M1                                                                       |
| C4  | Binary digits rise from the antenna and route around the open panel                                                     | browser           | same                                                          | core/effects/binary.ts; fab.tsx:30                              | same                                                  | M1                                                                       |
| C5  | Reduced motion: still pose, no gaze, no work loop                                                                       | browser           | the page's reduced-motion setting, plus C1                    | core/config.ts:37-40; parts/activity.ts:330                     | same                                                  | M1 :35 (`page.emulateMedia`)                                             |
| C6  | The animation pauses off screen                                                                                         | browser           | same as C1 (the pause itself is inferred)                     | core/mascot.ts:225                                              | same                                                  | M1 :16                                                                   |
| C7  | Skins and the sixteen antenna-tip effects                                                                               | stories / browser | a component mount from a story, plus C1                       | core/skin.ts; core/effects/*.ts                                 | mount.ts:75                                           | M1 :12                                                                   |
| C8  | A failed pick shows the toast "Couldn't grab that element. Try again."                                                  | happy-dom (app)   | hand the app a picker, or make it fail                        | apps/conciv/src/composer/actions.tsx:89-92                      | mount.ts:13-17, 68-74                                 | opencode has nothing like it                                             |
| C9  | A host-supplied picker (the iOS shell's grab provider)                                                                  | happy-dom (app)   | same                                                          | embed mount.ts:17; apps/conciv/src/pane/pane-grab.ts:6          | same                                                  | opencode has nothing like it                                             |
| C10 | A reply keeps streaming after a socket blip, resuming from the last event id; it fails after 5 tries with no progress   | happy-dom (app)   | drop the socket mid-run and let it come back                  | client/src/chat-connection.ts:119-155                           | harness-engine.ts:257-267; engine.ts:36               | e2e/utils/sse-transport.ts:39; client/test/solid-connection.test.ts:8-47 |
| C11 | A stream refused after a revoke or logout waits for trust, then resumes                                                 | happy-dom         | revoke or log out the browser from outside, then log back in  | chat-connection.ts:131-136, 316-356                             | harness-engine.ts:51-59                               | e2e/utils/mock-server.ts:176-177 (mock)                                  |
| C12 | Queries pause while the engine is unreachable and refetch when it returns                                               | happy-dom         | take the engine down and back mid-test                        | client/src/reachability.ts:47-71                                | same as C10                                           | e2e/regression/multi-server.spec.ts:198-217                              |
| C13 | Browser goes offline; the engine counts as offline                                                                      | browser           | set the browser offline                                       | reachability.ts:13-23                                           | test-projects.ts:262                                  | opencode has nothing like it                                             |
| C14 | Allow on an ask already settled elsewhere stays quiet (UNKNOWN_REQUEST)                                                 | happy-dom         | hold one engine answer                                        | client/src/index.ts:71-76                                       | gate holds model replies only (harness-engine.ts:273) | e2e/utils/app.ts:208 `holdRoute`                                         |
| C15 | Engine down: after the grace time "conciv lost connection to the engine." with Retry; it clears when the engine is back | happy-dom         | same as C12                                                   | apps/conciv/src/shell/engine-notice.tsx:82-107                  | same as C10                                           | multi-server.spec.ts:198-217                                             |
| C16 | A route fails while the engine is down: error screen with Retry, retried once trust returns                             | happy-dom         | same as C12                                                   | apps/conciv/src/router.tsx:25-50                                | same                                                  | same                                                                     |
| C17 | A one-shot call made during a blip still succeeds (retries up to 3 s)                                                   | happy-dom         | same as C10                                                   | contract README.md:45 (code inferred)                           | same                                                  | sse-transport.ts:39                                                      |
| C18 | Slow engine: no trust answer in 3 s turns "unreachable", and it asks again on the next open                             | happy-dom         | hold one engine answer, plus `authTimeoutMs` on mount         | contract engine-connection-machine.ts:149, 208                  | mount.ts:19-24                                        | multi-server.spec.ts:202-210                                             |
| C19 | Logged out: "Log in to use conciv on this page."; the launcher reads "Unauthorized. Authorize conciv"                   | happy-dom         | mount with no token or a wrong one                            | shell/engine-lock-messages.ts:4; engine-notice.tsx:109-148      | mount.ts:69                                           | mock-server.ts:176 (mock)                                                |
| C20 | Login dialog: the 6-digit code from the terminal; mismatch, expired, new code, failed                                   | happy-dom         | C19, plus get the code the engine prints, plus a short expiry | apps/conciv/src/app/engine-login.tsx:100-181                    | harness-engine.ts:213                                 | multi-server.spec.ts:158-182                                             |
| C21 | Magic link: `#conciv_otp=` logs in and is removed from the URL                                                          | e2e / browser     | C19, plus an issued code, plus a URL hash at mount            | engine-login.tsx:75-98                                          | mount.ts:70                                           | e2e/regression/home.spec.ts:509-510                                      |
| C22 | Revoked: "This browser is no longer authorized to use conciv."; reconnects stop                                         | happy-dom         | revoke this browser from outside                              | engine-lock-messages.ts:3; machine :161-165                     | harness-engine.ts:51-59                               | home.spec.ts:527-560                                                     |
| C23 | With browser storage blocked, the token is kept in memory only                                                          | browser           | block browser storage                                         | contract README.md:49                                           | mount.ts:52-55                                        | opencode has nothing like it                                             |
| C24 | Engine older than the widget: standing version notice                                                                   | happy-dom         | an engine that reports an older version                       | engine-notice.tsx:57-80; core lib/cors.ts:57                    | engine.ts:21-28                                       | client/test/service-reconnect.test.ts:59                                 |
| C25 | Stale engine: "Engine is running outdated code..."                                                                      | happy-dom         | make the engine's server code newer on disk while it runs     | engine-notice.tsx:18, 26-55; core lib/engine-stamp.ts:51        | harness-engine.ts:30                                  | opencode has nothing like it (inferred, not searched)                    |

Also a NO, kept out of the counts: the servers-mode connect route error "conciv couldn't connect to that workspace" (apps/conciv/src/routes/panel.connect.tsx:11-43). It is servers mode again (E9), in the app area.

## Distinct missing capabilities (each once; features needing it)

1. **An e2e kit:** a host page on a real bundler with the real engine, a Playwright page, login and a real reload. Needed by 36 (U1-5, U8-10, U15, U17-18, U20-21, U24-26, E1, E10, E13, S1-4, A1-9, A11-15).
2. **The scripted harness inside an e2e app.** Product code blocks it, not only the kit: `harness` is a string id, and unplugin passes no adapter. Needed by 4 (U10, U14, A13, A14).
3. **An engine booted the way the dev server boots it,** through core `start` with the bridge, child env and editor opener. Needed by 7 (U2, U11-14, P24, P25).
4. **Mounting the widget the way a host page does:** the embed handle or bundle, the shadow root, finding the api base, and queries that reach inside it. Needed by 9 (E1-8, P28).
5. **Dropping or stalling the engine socket, or taking the engine down and back mid-test.** Needed by 7 (C10, C12, C15-17, P29, P31). The plugin-testkit engine cannot even stop itself (engine.ts:36).
6. **Mount options the kit lacks:**
   - no or wrong token: 3 (C19-21);
   - no bound engine, or servers mode: 6 (E9, S1-4, P30);
   - widget settings: 1 (U6);
   - a grab provider, or a failing picker: 2 (C8, C9);
   - a URL hash: 1 (C21);
   - `authTimeoutMs`: 1 (C18).
7. **Recording the full model request** (system prompts, model options, tool input schemas). Needed by 5 (P4, P19-21, part of P22).
8. **A file watcher switched on, plus an editable copy of a fixture plugin inside the project root.** Needed by 6 (P8-11, P18, and P8's placement).
9. **Config plugin entries passed through untouched** (remove entries, project-relative paths, npm targets). Needed by 4 (P6, P7, P12, P13). A package registry or cache is needed by 2 (P12, P13).
10. **Missing engine options or calls:**
    - policies: 1 (P14);
    - reply kind on approve: 1 (P15);
    - restart on the same root, or a second engine on the same home: 2 (P16, P26);
    - seeding the home folder: 1 (P17);
    - compact, plus a compacting harness: 1 (P22);
    - models: 1 (P23);
    - an engine address on the plugin-testkit engine: 2 (P5, E2);
    - direct MCP calls (a named tool, `discover_tools`, the tool list): 3 (P1-3).
11. **Engine-side faults and outside actions:**
    - hold one engine answer: 2 (C14, C18);
    - revoke or log out the browser from outside: 2 (C11, C22);
    - get the login code the engine prints: 2 (C20, C21);
    - an engine reporting an older version: 1 (C24);
    - stale engine server code: 1 (C25).
12. **Browser page controls:**
    - pixel or frame read: 6 (C1-4, C6, C7);
    - reduced motion: 1 (C5);
    - offline: 1 (C13);
    - blocked storage: 1 (C23);
    - observing a download or a new page: 1 (P27).
13. **A component mount from a story.** Needed by 1 (C7).
14. **Other host setups:**
    - a webpack or rspack consumer app: 3 (U18, U20, U21);
    - a Vite DevTools dock driver: 2 (U8, U9);
    - an engine serving the native page: 1 (E12);
    - a bundler run on a temp project in a node test: 3 (U7, U19, U22, plus U16's edge cases).

## YES (short)

### Plugin SDK and host (51)

Node, `createEngine` with committed fixture plugin folders, using `tool().call` / `.failure`, `replies`, `requests`, `approve`, `gate`, `stop`, `permission`:

- promise and Effect entries;
- `[dir, options]`;
- input schema failure;
- invalid names and the reserved `execute`;
- permission deny;
- a direct tool the model calls;
- the unknown-tool message;
- `execute.before` / `execute.after` hooks;
- cancel on Stop;
- a tool error reaches the model;
- rpc register, call and its errors;
- `ctx.plugin.list` with failures;
- load-failure isolation (bad export, missing entry, setup throws, type stripping);
- transform failure;
- duplicate id;
- ask once;
- `fallback: 'ask'`;
- asks list, get and reply;
- agent rules;
- storage and `storage.directory`;
- `skill.transform` and the skill tool;
- built-in skills;
- project skills from `files`;
- an instruction changed after the first turn;
- the prompt hook (what the model gets);
- context hook edits to messages and tools;
- `experimental.idle`;
- the session domain from a plugin;
- `model.list` against the fixed list;
- `event.subscribe`;
- server tools with no dev server answer "unable", and restart asks.

Happy-dom in the app, with `createEngine` plus `mount`, queries and user-event:

- rpc from the browser part, and rpc events;
- skills in the `@` list;
- what the prompt hook stores;
- lazy chunk load;
- page registries (Panel, Slot, ComposerPill, LinkHandler, SettingsPage, CodeBlock, NoteCard, ToolRegistry with errorComponent);
- stores (global, project, session);
- `ctx.screen`, `ctx.toast`, `ctx.dialogs`, `ctx.ui`, `ctx.system.copy`, `ctx.tabs`, `ctx.router`, `ctx.layout`, `ctx.keybinds`, `ctx.appearance`;
- `MountedSession.run`;
- a browser part that fails to set up while the others still render.

No kit (node unit): reactive helpers and Scope; `experimental()` vite build; `Host.resolve`; `Rpc.define` reserved names.

Caveats (inferred):

- Every page row needs a committed fixture plugin whose browser bundle turbo builds, and nothing builds one today.
- Engine-wide journeys belong in core or the app, not in plugin-host or plugin. Their package.json files list no kit, and the kit depends on core, so a kit test there would make a package loop.

### unplugin, embed, site (3)

- U16: `conciv()` under vitest sets the three kit test projects. Every kit run carries it.
- No kit: U23 `withConciv` config, S5 try button label.

### Mascot, grab, client, machine (28)

- With the kit (14, via `mount`, `replies` with hangAfter, `permission`, toolCall, `session.send`, `session.stop`, `newSession`, `requests`):
  - the launcher name flips; busy while working; the "Waiting for your Allow" badge;
  - pick an element and the agent receives it; grab disabled until the picker loads; Escape cancels; chip removal; chips across a session switch;
  - a turn (send, stream, Stop, Allow);
  - an outside run streams in; an outside stop ends it cleanly;
  - older history pages;
  - `makeQueryUtils`;
  - engine up, launcher shown.
  - Inferred: rendering a host element beside the app, and react-grab working in headless Chromium.
- No kit, node or happy-dom (14):
  - mascot path geometry, style merge, the slot error, defaults;
  - the grab payload budget, parsing, labels, what a pick captures;
  - the connection machine: back-off, trust transitions, a 1008 close, Retry, a stalled socket, stale attempts.

## Counts

| part                          | features | YES    | NO      | could not judge |
| ----------------------------- | -------- | ------ | ------- | --------------- |
| plugin SDK + host             | 83       | 51     | 31      | 1               |
| unplugin, embed, site, e2e    | 58       | 3      | 54      | 1               |
| mascot, grab, client, machine | 55       | 28     | 25      | 2               |
| **total**                     | **196**  | **82** | **110** | **4**           |

In the second part, A1-A9 count as 9 features.

Could not judge:

- The SDK page contracts (`Page.capture`, `pick`, `symbolicate`, `ReactTree`, `GrabPicker`). The SDK only declares their types; the page and grab plugins implement them.
- The embed restoring the host's `window.__TSR_ROUTER__` (mount-impl.tsx:146, 169, 183). It is the host devtools bridge, outside this area.
- React source grounding after a pick (symbolicate or `data-tsd-source`). It needs a real React build, so it is e2e.
- The agent asking the user to pick an element. That is the page plugin's tool path.

Not counted:

- SDK members marked not implemented (`permission.hook`, `session.generate`, `command`, `synthetic`, CodeBlockAction drawing);
- `conciv init` (CLI area).
