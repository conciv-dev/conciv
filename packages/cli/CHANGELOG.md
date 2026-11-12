# @conciv/cli

## 0.0.23

### Patch Changes

- [#839](https://github.com/conciv-dev/conciv/pull/839) [`fe94df4`](https://github.com/conciv-dev/conciv/commit/fe94df49d1089d57a4e08f19b731cc24f4a4f031) Thanks [@omridevk](https://github.com/omridevk)! - New `conciv auth link <page-url>` prints a one-time login link for the conciv dev server of the current project, for example `http://localhost:3001/#conciv_otp=123456`. Opening it logs that browser in without reading a code from the terminal, so a headless run (Playwright, `claude -p`) can log in on its own. The code comes from the new `auth.issueCode` procedure, which only the engine token may call.

  Outside agents that name the tab they act on (the `conciv` CLI with `--tab`, a `conciv mcp serve` call with a `tab`, and the Claude plugin bridge) no longer get a per-call Approve card for tools that ask: their own permission mode decides. A `conciv` CLI call with no `--tab` that finds its engine through the home db acts on the user's latest tab, so it keeps the Approve card. The agent inside the tab keeps its Approve cards, and the one-time Allow under `hubAccess: 'session'` or `'project'` is unchanged.

- [#835](https://github.com/conciv-dev/conciv/pull/835) [`33345d3`](https://github.com/conciv-dev/conciv/commit/33345d3bbc25419086a899a36f96991ae37a59ae) Thanks [@omridevk](https://github.com/omridevk)! - The hub talks to engines over the typed oRPC contract. `conciv mcp serve` now calls `code.execute`, `code.discover`, `code.describe`, `tabs.get` and `page.queue.wait` instead of reading MCP text from `/api/mcp`, so a queue call becomes an MCP task whenever the script started a queue, whatever it returns, and a script that only returns a queue-shaped object no longer does. `GET /api/tabs` is replaced by `tabs.list` / `tabs.get`; an engine without them is reported as too old. `/api/mcp` and `code.execute` run one shared engine function. The image helpers (`imagesIn`, `withoutImages`, `imageBlocks`) move from `@conciv/ai/server` to `@conciv/protocol/chat-message-types`.

  `page_queue` now plays the list and returns every outcome in the same call (if the list outlasts 120 s it returns the progress so far plus a queueId and the rest arrives on its own); `page_queue_async` answers with a queueId at once and pushes the outcomes back when the list ends. `page_queue_wait` is gone as an agent tool; only queues still playing when a call returns become an MCP task.

- [#805](https://github.com/conciv-dev/conciv/pull/805) [`7c4cf8c`](https://github.com/conciv-dev/conciv/commit/7c4cf8cfba7eff9dcd09da39e8aeda9947c58d3b) Thanks [@omridevk](https://github.com/omridevk)! - Outside agents: the hub sends a block straight to the engine that holds the tab named by the new optional `tab` input (no forwarding between engines, `external_use_tab` is gone), the hub keeps its runner, one browser tab answers each page query, and outside approvals default to open.

- [#829](https://github.com/conciv-dev/conciv/pull/829) [`4a710d4`](https://github.com/conciv-dev/conciv/commit/4a710d475e8975be8162a2740884c69d1e03231d) Thanks [@omridevk](https://github.com/omridevk)! - Agents can queue a list of page actions in one call; the page plays them in order with the pointer and the results come back when the list is done.
- Updated dependencies [[`1feae4a`](https://github.com/conciv-dev/conciv/commit/1feae4aefa390212f63d656a9ad718d4b23a1be9), [`15cc7ed`](https://github.com/conciv-dev/conciv/commit/15cc7ed773ab889319370b8070426756d6cf98bb), [`23d0787`](https://github.com/conciv-dev/conciv/commit/23d078759618f08b80223d26187abb7b2fc5843f), [`33345d3`](https://github.com/conciv-dev/conciv/commit/33345d3bbc25419086a899a36f96991ae37a59ae), [`4a710d4`](https://github.com/conciv-dev/conciv/commit/4a710d475e8975be8162a2740884c69d1e03231d), [`cba0682`](https://github.com/conciv-dev/conciv/commit/cba0682d62058e28428ebbfc64a3a1422ba6bf77), [`eaa4b2a`](https://github.com/conciv-dev/conciv/commit/eaa4b2a94f44bbfeb14b6a85b343cd16a9c2d743), [`7925199`](https://github.com/conciv-dev/conciv/commit/79251997f75892d7b445f3dbebb1dbb5109aac53)]:
  - @conciv/protocol@0.0.23
  - @conciv/contract@0.0.23
  - @conciv/db@0.0.23
  - @conciv/harness-init@0.0.23

## 0.0.22

### Patch Changes

- [#749](https://github.com/conciv-dev/conciv/pull/749) [`11d67e1`](https://github.com/conciv-dev/conciv/commit/11d67e18038a54bc51b1c81e81e9e2f93ca463e4) Thanks [@omridevk](https://github.com/omridevk)! - The `conciv` CLI now reads its commands with `@bomb.sh/router` instead of citty. `conciv --version` and `conciv -v` print the CLI version. Help output has a new layout. Argument mistakes still come back as one JSON error with a suggested fix.

- [#756](https://github.com/conciv-dev/conciv/pull/756) [`146920e`](https://github.com/conciv-dev/conciv/commit/146920e36b9a58fab33341be2aab997dc80ff748) Thanks [@omridevk](https://github.com/omridevk)! - `conciv tools` builds every tool group from the running dev server's catalog, so a mounted extension's tools appear under their own name and the CLI no longer depends on any extension package. `npx @conciv/cli` installs 47 packages (49 MB) instead of 500 (681 MB). Without a running server, `conciv tools ...` and its `--help` print the "No conciv dev server" error instead of an offline list.

- [#775](https://github.com/conciv-dev/conciv/pull/775) [`7dc089b`](https://github.com/conciv-dev/conciv/commit/7dc089b47dc616da95bba7d6c328db957c3500e4) Thanks [@omridevk](https://github.com/omridevk)! - `conciv mcp` is now a group: `conciv mcp connect <agent>`, `conciv mcp disconnect <agent>` and `conciv mcp list` manage which agents (claude, codex, gemini-cli, opencode) can use your conciv tabs, and `conciv mcp serve --agent <agent>` is the MCP server each agent runs. `conciv init` offers to connect every detected agent that is not connected yet. Every connected agent can be disconnected from the widget, opencode included; conciv refuses a disconnected agent at once, and a disconnect from the widget or the terminal voids the Allow every open tab held, so each tab asks again. `conciv tools` run from inside an agent names that agent instead of a generic caller.

- [#765](https://github.com/conciv-dev/conciv/pull/765) [`2a0b55e`](https://github.com/conciv-dev/conciv/commit/2a0b55e7dc935a8a8d9bb9daca9a1f544f78c07a) Thanks [@omridevk](https://github.com/omridevk)! - Outside agents can use a conciv tab: `conciv mcp` is a hub any harness (Claude Code, Codex, Gemini CLI) can add as an MCP server, and the widget's "Connect agents" menu installs it with one click. The agent finds the open tabs with `external_tabs`, picks one with `external_use_tab`, and its calls run there after you allow them; they show in that tab's chat tagged "from <agent>" and survive a reload, and the launcher badges a closed panel while an agent waits for your Allow. `conciv tools` lists every open tab and acts on one with `--tab`. The composer's terminal launch menu and the terminal's "Open externally" button are gone.

- [#726](https://github.com/conciv-dev/conciv/pull/726) [`bbc5760`](https://github.com/conciv-dev/conciv/commit/bbc57606fd20f68b991cb04690fa42ce99c7cafd) Thanks [@omridevk](https://github.com/omridevk)! - The engine now refuses every request from a browser it does not trust. A browser becomes trusted by entering the 6-digit code the dev server prints (or opening the printed link); the widget shows a locked launcher until then. Inside the Vite DevTools dock the widget is trusted through DevTools' own login. `conciv auth revoke [id] [--all]` lists and removes trusted browsers.

  Revoking a browser takes effect on the running engine without a restart. The open `/health` route now answers only `{ok, harness, engine: {stale}}`; the full staleness reading stays on the gated `meta.engine` RPC. When any engine call answers 401 the widget checks its login again and shows the locked launcher if the engine no longer trusts it; Retry on the unreachable screen does the same check. A revoke also closes every socket the browser opened (close code 1008), which locks an open tab right away. A missing session header now answers 400 BAD_REQUEST, so 401 only means the login gate refused.

  The launcher now drags like the TanStack Devtools trigger: drop it anywhere, throw it, pin it into a corner, or drag it off an edge to tuck it into a tab (click the tab to bring it back). Arrows move the focused launcher and Shift with an arrow sends it to a corner. The chat panel opens toward the free side of wherever the launcher sits, and the spot is remembered per browser.

- [#747](https://github.com/conciv-dev/conciv/pull/747) [`238ccf4`](https://github.com/conciv-dev/conciv/commit/238ccf4fca0ff9e135bf130f1a32f537cad416a8) Thanks [@omridevk](https://github.com/omridevk)! - Packages now report their real release version, for future migrations; a version difference never breaks anything. `conciv` carries it as its `meta.version`, the Claude Code connect plugin is stamped with it instead of `0.0.0`, and every engine response carries an `x-conciv-version` header. Node rpc clients send their own version in the same header; browser requests send no new header, so a newer widget still reaches an older engine. When the engine is older than the widget (or predates versions), the panel shows a notice asking to update the @conciv packages. `conciv init` now also runs `claude plugin update`, so an install recorded at an earlier release moves onto the current one.
- Updated dependencies [[`5af74ae`](https://github.com/conciv-dev/conciv/commit/5af74ae55b8e53b0b0e51c598d8d05a3b477b679), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`0ff249d`](https://github.com/conciv-dev/conciv/commit/0ff249d2a4fd84fb3325d150ce48b061bfdcbe0b), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`bbc5760`](https://github.com/conciv-dev/conciv/commit/bbc57606fd20f68b991cb04690fa42ce99c7cafd), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`550d871`](https://github.com/conciv-dev/conciv/commit/550d8718dc7aa496bc2c42dd7495a5dd6436abde), [`82fcd6a`](https://github.com/conciv-dev/conciv/commit/82fcd6a504661ad43f22d3b6a1d4b447e10e3805), [`b591c13`](https://github.com/conciv-dev/conciv/commit/b591c138b32b293a14f1d3f2dc92d5c58889402c), [`4c7cded`](https://github.com/conciv-dev/conciv/commit/4c7cdedfb8841a03edb84eecf2047e76f1269640), [`61a66bf`](https://github.com/conciv-dev/conciv/commit/61a66bfb44ebb179ddda4139443587bdda863bb3), [`238ccf4`](https://github.com/conciv-dev/conciv/commit/238ccf4fca0ff9e135bf130f1a32f537cad416a8), [`2721b7c`](https://github.com/conciv-dev/conciv/commit/2721b7cb943e4bfdedc5ae12024d2ed0f6c60ca2), [`ef77625`](https://github.com/conciv-dev/conciv/commit/ef7762536509fb2eb2000908ae91ca98f50a9ab6), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`d1ac2b9`](https://github.com/conciv-dev/conciv/commit/d1ac2b9749d82f70effb017557605a301bc59986), [`6d78e3d`](https://github.com/conciv-dev/conciv/commit/6d78e3d61a2daaa2f27d27c7be5c0634a9d37b09)]:
  - @conciv/protocol@0.0.22
  - @conciv/contract@0.0.22
  - @conciv/db@0.0.22
  - @conciv/harness-init@0.0.22

## 0.0.21

### Patch Changes

- [#650](https://github.com/conciv-dev/conciv/pull/650) [`0208423`](https://github.com/conciv-dev/conciv/commit/02084232ad633479dcbb7d6949700a31df1173ee) Thanks [@omridevk](https://github.com/omridevk)! - New built-in design extension, mounted by `@conciv/it`: register a design image as the target of a route at a width, then `conciv tools design diff` compares the live page with it and ranks the components that differ, with the deltas and the source that sets them. `conciv tools design status` says when every registered width matches. The agent guide written by `conciv init` describes the loop.

- [#621](https://github.com/conciv-dev/conciv/pull/621) [`377d894`](https://github.com/conciv-dev/conciv/commit/377d894a25c2a83fa009b3240b64dc512e0eef95) Thanks [@omridevk](https://github.com/omridevk)! - New page capability `page_hmr` (`conciv tools page hmr`): after editing a file, wait until Vite's hot update has been applied in the browser before reading the page. `server reload` now waits on it as well and reports `applied` and `waitedMs`.

  `conciv init` adds a `CLAUDE.md` containing `@AGENTS.md` when the claude harness is chosen and no `CLAUDE.md` exists yet, can now wire vite configs written as a function (`defineConfig(() => ({...}))`, async functions, function bodies with a single return), and prints every command as `.conciv/bin/conciv ...` so it runs as written without `conciv` on PATH.

  The core dev server writes `.conciv/mcp-endpoint.json` when it boots, so the claude stdio MCP bridge works in headless runs.

- [#646](https://github.com/conciv-dev/conciv/pull/646) [`71a7483`](https://github.com/conciv-dev/conciv/commit/71a74838dd923c10f8559054495a770f9f8cc0c8) Thanks [@omridevk](https://github.com/omridevk)! - Remove test-only and unused exports from the package surfaces.
- Updated dependencies [[`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`0208423`](https://github.com/conciv-dev/conciv/commit/02084232ad633479dcbb7d6949700a31df1173ee), [`0d9fe32`](https://github.com/conciv-dev/conciv/commit/0d9fe3275ada18af5e0e65c37c79b8f3662c8d3a), [`377d894`](https://github.com/conciv-dev/conciv/commit/377d894a25c2a83fa009b3240b64dc512e0eef95), [`71a7483`](https://github.com/conciv-dev/conciv/commit/71a74838dd923c10f8559054495a770f9f8cc0c8), [`5b93081`](https://github.com/conciv-dev/conciv/commit/5b930812c5e4ff718da8799d3fddd1429dc6c7a3), [`62f5429`](https://github.com/conciv-dev/conciv/commit/62f5429329a717535efe3a9ec6c61f00cb2f1a61), [`f31c74a`](https://github.com/conciv-dev/conciv/commit/f31c74ad91e9ed4ee2def6b062a6f616dbef6ec1)]:
  - @conciv/protocol@0.0.21
  - @conciv/extension-page@0.0.21
  - @conciv/extension-design@0.0.21
  - @conciv/harness-init@0.0.21
  - @conciv/contract@0.0.21
  - @conciv/tools@0.0.21

## 0.0.20

### Patch Changes

- [#614](https://github.com/conciv-dev/conciv/pull/614) [`9e20b2a`](https://github.com/conciv-dev/conciv/commit/9e20b2a3c3eb225216daf54f5341cd66e167a650) Thanks [@omridevk](https://github.com/omridevk)! - The `conciv` CLI is friendlier to coding agents. Piped output no longer carries colour escape codes (set
  `FORCE_COLOR` to keep them). `conciv tools page --help` and `conciv tools react --help` list the built-in
  page capabilities even before your app is running. `conciv tools page eval` returns the value of a bare
  expression such as `document.title`, not only of code that uses `return`. A ref from an older `page snapshot`
  now fails as stale instead of silently pointing at a different element once the page has changed. The CLI
  finds the conciv engine by itself: it reads the port from `.conciv/server.json` (searching up from the
  current directory), with `CONCIV_PORT` as an override, and the engine records its port there however it was
  started.

- [#482](https://github.com/conciv-dev/conciv/pull/482) [`423f50d`](https://github.com/conciv-dev/conciv/commit/423f50d1c636dc0ac1be88748a95327e130949af) Thanks [@omridevk](https://github.com/omridevk)! - `conciv init` now teaches agents the MCP discovery workflow (`await external_catalog({})`) instead of a static AGENTS.md command list. It also offers an opt-in docs pack step during plan review, declined by default and never enabled by `--yes`, that adds `@conciv/skills` as a dev dependency and runs `@tanstack/intent install` for setup, extension-authoring, and debugging guidance.

  The interactive wizard was reworked to a single-pass flow, modeled on the TanStack CLI: it asks the harness, framework, and docs-pack questions once, renders one plan, and asks for one confirmation, and declining cancels outright instead of dropping into an edit loop. The execution phase now streams each step's live command output through clack's `taskLog`, instead of buffering it behind a spinner until the step settles.

- [#614](https://github.com/conciv-dev/conciv/pull/614) [`9e20b2a`](https://github.com/conciv-dev/conciv/commit/9e20b2a3c3eb225216daf54f5341cd66e167a650) Thanks [@omridevk](https://github.com/omridevk)! - The claude plugin installed by `conciv init` now ships a `conciv` skill that ranks the conciv CLI above a browser MCP for anything in the running app, and the AGENTS.md section init writes leads with the same CLI command guide before the MCP sandbox note.
- Updated dependencies [[`ec28181`](https://github.com/conciv-dev/conciv/commit/ec28181dc8b49c979e6bd36284eb7148bee092f3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`958dde7`](https://github.com/conciv-dev/conciv/commit/958dde7a862c8cfd735c2232ca13cef659b301f3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`ee779f0`](https://github.com/conciv-dev/conciv/commit/ee779f0456f0c4aedb5c00d8c2d69229de7598a1), [`09f620a`](https://github.com/conciv-dev/conciv/commit/09f620a62d8d65e5721dd16eeaf7f2651225975e), [`6699828`](https://github.com/conciv-dev/conciv/commit/669982843b265d397771ca9bfd607aa5976a8ff3), [`d23d7c8`](https://github.com/conciv-dev/conciv/commit/d23d7c820af745fd87c4048a2d089c9d995f664a), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`1cb8a51`](https://github.com/conciv-dev/conciv/commit/1cb8a51610a59d764ce064216a50b5209d28bde0)]:
  - @conciv/protocol@0.0.20
  - @conciv/tools@0.0.20
  - @conciv/contract@0.0.20
  - @conciv/extension-page@0.0.20
  - @conciv/harness-init@0.0.20

## 0.0.19

### Patch Changes

- Updated dependencies [[`ea23bf6`](https://github.com/conciv-dev/conciv/commit/ea23bf6fa956703ba66399513c5de4af40770323), [`ea23bf6`](https://github.com/conciv-dev/conciv/commit/ea23bf6fa956703ba66399513c5de4af40770323)]:
  - @conciv/contract@0.0.19
  - @conciv/tools@0.0.19
  - @conciv/harness-init@0.0.19
  - @conciv/protocol@0.0.19

## 0.0.18

### Patch Changes

- [#259](https://github.com/conciv-dev/conciv/pull/259) [`e93318a`](https://github.com/conciv-dev/conciv/commit/e93318a331d3a7b695c08eb77d7c0b67c5ba68b0) Thanks [@omridevk](https://github.com/omridevk)! - The CLI keeps its scoped name `@conciv/cli`. npm rejects the unscoped name `conciv` as too similar to the existing `config` and `concat` packages, so install it with `npx @conciv/cli@latest init`. The command you run afterwards is still `conciv`.

- [#215](https://github.com/conciv-dev/conciv/pull/215) [`ce52c4f`](https://github.com/conciv-dev/conciv/commit/ce52c4ff059e2c701fa81d18b68a793df2b937e8) Thanks [@omridevk](https://github.com/omridevk)! - Every harness now declares init as a capability (`'files' | 'none'`), backed by a per-harness init
  contribution in the new dependency-light `@conciv/harness-init` package, which replaces
  `@conciv/claude-connect`. The `conciv` CLI derives detection and install steps from those
  contributions instead of a hand-listed marker table, and no longer depends on `@conciv/harness`, so
  `npx @conciv/cli@latest init` stops installing every runtime agent SDK. This also makes gemini-cli
  detectable and initializable like its sibling harnesses. `@conciv/harness` consumes
  `@conciv/harness-init` for its own harness contributions; the old `./claude-connect-files` and
  `./claude-connect-state` subpaths are gone.
- Updated dependencies [[`b687236`](https://github.com/conciv-dev/conciv/commit/b687236db6e3793f1ecb909ebafa7bf1ed02ff8f), [`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd), [`83272f7`](https://github.com/conciv-dev/conciv/commit/83272f77e201bfb76b958243f90d0ba884de844d), [`d019477`](https://github.com/conciv-dev/conciv/commit/d0194773d25aa4656a20e77f3e63049f351e43e5), [`0f4bb5e`](https://github.com/conciv-dev/conciv/commit/0f4bb5e713f5e09006f43bb951782b2a6ad853a0), [`ce52c4f`](https://github.com/conciv-dev/conciv/commit/ce52c4ff059e2c701fa81d18b68a793df2b937e8)]:
  - @conciv/tools@0.0.18
  - @conciv/protocol@0.0.18
  - @conciv/harness-init@0.0.18
  - @conciv/contract@0.0.18

## 0.0.17

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.17
  - @conciv/protocol@0.0.17

## 0.0.16

### Patch Changes

- Updated dependencies [[`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b)]:
  - @conciv/protocol@0.0.16
  - @conciv/contract@0.0.16

## 0.0.15

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.15
  - @conciv/protocol@0.0.15

## 0.0.14

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.14
  - @conciv/protocol@0.0.14

## 0.0.13

### Patch Changes

- Updated dependencies [[`73c451e`](https://github.com/conciv-dev/conciv/commit/73c451e8d4175732a0e3f421300bda19b8dcf45c)]:
  - @conciv/protocol@0.0.13
  - @conciv/contract@0.0.13

## 0.0.12

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.12
  - @conciv/protocol@0.0.12

## 0.0.11

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.11
  - @conciv/protocol@0.0.11

## 0.0.10

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.10
  - @conciv/protocol@0.0.10

## 0.0.9

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.9
  - @conciv/protocol@0.0.9

## 0.0.8

### Patch Changes

- Updated dependencies [[`05dd101`](https://github.com/conciv-dev/conciv/commit/05dd101ff9401cbdfd5545cffa63f4bb3cfd2fbf)]:
  - @conciv/contract@0.0.8
  - @conciv/protocol@0.0.8

## 0.0.7

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.7

## 0.0.6

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.6

## 0.0.5

### Patch Changes

- [`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139) Thanks [@omridevk](https://github.com/omridevk)! - new version with fixed deps

- Updated dependencies [[`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139)]:
  - @conciv/protocol@0.0.5

## 0.0.4

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.4

## 0.0.3

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.2

## 0.0.1

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.1
