# Kit build cycle: who may dev-depend on the test kits

Status: research, 2026-11-20, read at `test/plugin-testkit-mounts` ea3ff2d06. No code or manifest changed. The turbo
results below come from `turbo run ... --dry=json` in a throwaway worktree (since removed) with the manifest edits
named in each probe. A dry run plans the task graph and runs nothing. Anything marked **unverified** was not checked.

Constraint (maintainer): `@conciv/plugin-testkit` and `@conciv/harness-testkit` stay separate packages with today's
exports. The options below only move the edge that closes the cycle.

## The problem

`packages/plugin-testkit/src/mount.ts:4` imports `ConcivApp` from `@conciv/app`. The kit lists `@conciv/app` as both a
devDependency and a peerDependency (packages/plugin-testkit/package.json, `devDependencies` and `peerDependencies`).
The kit's engine comes from `@conciv/harness-testkit` (`packages/plugin-testkit/src/engine.ts:5-13`). harness-testkit
depends on `@conciv/ai`, `contract`, `core`, `harness`, `protocol` and `serve` (packages/harness-testkit/package.json
`dependencies`).

turbo builds its package graph from `dependencies`, `devDependencies` and `optionalDependencies`. `build`, `typecheck`
and `test` all depend on `^build` (root turbo.json:13, :47, :51). So when a package X dev-depends on a kit while the kit
already reaches X through its own dependencies, `X#build -> kit#build -> ... -> X#build` is a task cycle.

Reproduced: adding `"@conciv/plugin-testkit": "workspace:*"` to apps/conciv devDependencies makes
`turbo run test --filter=@conciv/app --dry=json` fail with "Cyclic dependency detected". The same dry run passes
without that edge.

## 1. Packages the test-split plan gives kit tests, and whether each cycles

Kit rows were counted per target package with a text match over docs/specs/test-split/*.md. A row counts when its
destination is `happy-dom` or `browser mode` (each uses `createEngine` + `mount`), or when it is `node` and names an
engine (`createEngine`, `createHarnessEngine`, "engine"). The counts are **approximate**; the yes/no cycle answer is
exact.

The chains below are the shortest path from the kit back to the package, read from the package.json files. turbo.json
adds no edge that closes a cycle (a per-package `dependsOn` only adds edges toward packages lower in the graph).

| package                                       | kit rows (approx.)                        | kit                                                                                            | cycles today?                                          | edge chain (manifests)                                                                                |
| --------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| apps/conciv (`@conciv/app`)                   | happy-dom 123, browser 30, node+engine 18 | plugin-testkit                                                                                 | **yes**                                                | plugin-testkit -(dev)-> app                                                                           |
| packages/core                                 | node+engine 55                            | plugin-testkit or harness-testkit                                                              | **yes**                                                | harness-testkit -> core                                                                               |
| packages/contract                             | node+engine 31                            | harness-testkit                                                                                | **yes**                                                | harness-testkit -> contract                                                                           |
| packages/cli                                  | node+engine 30                            | harness-testkit                                                                                | **yes** for plugin-testkit, **no** for harness-testkit | plugin-testkit -(dev)-> app -> plugin-tanstack -> unplugin -> cli; harness-testkit does not reach cli |
| packages/harness-testkit (own tests)          | node+engine 11                            | itself                                                                                         | no (self)                                              | -                                                                                                     |
| packages/unplugin                             | node+engine 12                            | plugin-testkit                                                                                 | **yes**                                                | plugin-testkit -(dev)-> app -> plugin-tanstack -> unplugin                                            |
| packages/ai                                   | node+engine 9                             | harness-testkit                                                                                | **yes**                                                | harness-testkit -> ai                                                                                 |
| packages/harness                              | node+engine 6                             | harness-testkit                                                                                | **yes**                                                | harness-testkit -> harness                                                                            |
| packages/plugin-host                          | node+engine 6                             | plugin-testkit                                                                                 | **yes**                                                | harness-testkit -> core -> plugin-host                                                                |
| packages/plugin                               | node+engine 5, happy-dom 6                | plugin-testkit                                                                                 | **yes**                                                | plugin-testkit -(dev)-> app -> plugin, and harness-testkit -> core -> plugin                          |
| packages/client                               | node+engine 4                             | harness-testkit                                                                                | **yes**                                                | harness-testkit -> core -> client                                                                     |
| packages/db                                   | node+engine 3                             | harness-testkit                                                                                | **yes**                                                | harness-testkit -> ai -> db                                                                           |
| packages/try                                  | node+engine 4                             | plugin-testkit                                                                                 | no                                                     | -                                                                                                     |
| packages/plugins/page (`@conciv/plugin-page`) | happy-dom 64, browser 82                  | plugin-testkit                                                                                 | **yes**                                                | plugin-testkit -(dev)-> app -> plugin-page, and harness-testkit -> core -> plugin-page                |
| packages/plugins/terminal                     | happy-dom 0, browser 1                    | plugin-testkit                                                                                 | **yes**                                                | plugin-testkit -(dev)-> app -> plugin-terminal                                                        |
| packages/plugins/tanstack                     | happy-dom 1, browser 1, node+engine 2     | plugin-testkit                                                                                 | **yes**                                                | plugin-testkit -(dev)-> app -> plugin-tanstack                                                        |
| packages/plugins/ios                          | happy-dom 1, node+engine 3                | plugin-testkit                                                                                 | **yes**                                                | plugin-testkit -(dev)-> app -> plugin-tanstack -> embed -> plugin-ios                                 |
| packages/plugins/test-runner                  | happy-dom 3, node+engine 2                | plugin-testkit                                                                                 | **no** (works today)                                   | -                                                                                                     |
| packages/plugins/try-it                       | happy-dom 3, browser 1                    | plugin-testkit                                                                                 | no                                                     | -                                                                                                     |
| packages/plugins/whiteboard                   | happy-dom 1, browser 4, node+engine 2     | plugin-testkit                                                                                 | no                                                     | -                                                                                                     |
| packages/plugins/recorder                     | browser 8, node+engine 2                  | plugin-testkit                                                                                 | no                                                     | -                                                                                                     |
| packages/mascot                               | happy-dom 29, browser 14                  | plugin-testkit                                                                                 | **yes**                                                | plugin-testkit -(dev)-> app -> mascot                                                                 |
| packages/mascot-react                         | happy-dom 12                              | plugin-testkit                                                                                 | no                                                     | -                                                                                                     |
| packages/ui-kit-system                        | happy-dom 11, browser 7                   | plugin-testkit (**unverified** that these rows mount the app rather than render one component) | **yes**                                                | plugin-testkit -(dev)-> app -> ui-kit-system                                                          |
| packages/ui-kit-chat                          | browser 10                                | as above, **unverified**                                                                       | **yes**                                                | plugin-testkit -(dev)-> app -> ui-kit-chat                                                            |
| packages/ui-kit-terminal                      | browser 14                                | as above, **unverified**                                                                       | **yes**                                                | plugin-testkit -(dev)-> app -> plugin-terminal -> ui-kit-terminal                                     |
| packages/brand-react                          | browser 3                                 | as above, **unverified**                                                                       | no                                                     | -                                                                                                     |

Rows the matcher could not tie to a package: about 22 node+engine, 25 happy-dom and 3 browser. Most sit in core.md and
kits.md rows that name another plan's area instead of a path, for example "page plugin (plugins.md area)".

Two separate chains close the cycles:

- **the app edge**: the kit's devDependency on `@conciv/app` pulls in everything the app reaches. 37 packages cycle
  today. Removing this edge alone clears 12 of them: app, cli, embed, mascot, plugin-internal, plugin-ios,
  plugin-tanstack, plugin-terminal, ui-kit-chat-tools, ui-kit-tap, ui-kit-terminal and unplugin.
- **the engine edge**: harness-testkit's dependencies on core, ai, contract, harness and serve. With the app edge gone,
  the kit still cycles with 25 packages. 20 of them are real libraries: ai, chat, client, contract, core, db, grab,
  harness, harness-init, plugin, plugin-host, plugin-page, protocol, serve, solid-diffs, solid-streamdown,
  storage-history, tools, ui-kit-chat and ui-kit-system. The other 5 are tooling or the kits themselves.

### Why packages/plugins/test-runner works today

It dev-depends on `@conciv/plugin-testkit` (it is the only package that does). Nothing in the kit's closure reaches
test-runner: the app does not depend on `@conciv/plugin-test-runner` (apps/conciv/package.json), and neither does core
or harness-testkit. So `test-runner#test -> plugin-testkit#build` is one-way. Its build order is pinned by
packages/plugins/test-runner/turbo.json (`build.dependsOn`: plugin, plugin-internal, unplugin, uno-preset). try-it,
whiteboard, recorder, mascot-react, try and brand-react are outside the closure for the same reason.

## 2. How opencode arranges this

Full notes with citations: the research file kept beside this one at
/private/tmp/claude-501/-Users-omrikatz-Public-web-aidx/1929ba4e-d617-49a8-944f-3909dabd397d/scratchpad/kit-cycle/opencode.md.
Paths below are relative to `_ref/opencode`.

- **No testkit package.** Helpers live in the package whose tests use them: `packages/app/e2e/utils/`,
  `packages/core/test/{lib,fixture}/`, `packages/server/test/fixture/`, `packages/stories/playwright/`. Other packages
  reuse them by relative path, never through package.json. There are 106 imports of `../../core/test/...`: server 43
  files, sdk 8, cli 6, tui 1, gui-plugins 1 (examples: packages/server/test/artifact.test.ts:6-7,
  packages/gui-plugins/src/ssh/askpass.test.ts:6). The one shipped test helper is a subpath of a leaf package:
  `@opencode/ai` `./testing` (`TestLLM`, packages/ai/package.json:21).
- **Whole-app tests live in the app and never boot the real server.** packages/app/e2e/utils/mock-server.ts builds an
  Effect HttpApi mock and serves it through Playwright `page.route` and `routeWebSocket` (mock-server.ts:359, :445,
  :513-529). So app has no dependency on core or server. Only `@opencode/desktop` depends on app
  (packages/desktop/package.json:35), and nothing app depends on imports app.
- **Plugin UI is never mounted by the plugin packages.**
  - gui-plugins runs only state-machine tests under happy-dom (packages/gui-plugins/src/terminal/pane-machine.test.ts:71-74).
  - Its UI runs in two places. One is stories, through the private, undeclared `@opencode/stories`, which reaches app,
    ui, gui-plugins and plugin by relative path and Vite glob and swaps the app's context modules with Vite aliases
    (packages/stories/src/plugin.tsx:28-53, packages/stories/vite.config.ts:48-66). The other is app's own component
    tests (packages/app/component-tests/plugin-host.fixture.tsx:39-56).
  - gui-plugins' AGENTS.md says it outright: "UI behavior is proven by the app e2e keeper suites"
    (packages/gui-plugins/AGENTS.md:106-114).
  - plugin-browser has no UI and only pure logic tests (packages/plugin-browser/test/tools.test.ts:1-8).
- **Core and server tests run in-process, with fixtures in their own folder.**
  - core: `testEffect(layer)` (packages/core/test/lib/effect.ts:77-80) and a runner with a temp HOME
    (packages/core/script/test.ts:5-44).
  - server: `ServerProcess.start` on port 0 with an in-memory database (packages/server/test/fixture/server.ts:5-19),
    and `Layer.build(createRoutes)` as a web handler (packages/server/test/fixture/routes.ts:23-36).
- **No build cycle can form.** Every package exports `src/*.ts`, and turbo's `test` and `typecheck` depend on a
  script-less `transit` task that only folds dependency hashes, never on `build` (opencode turbo.json). Conciv cannot copy
  this part: our hosts and tests consume `@conciv/*` from `dist` (AGENTS.md, "Dev loop"), and `test` depends on `^build`.

In short, opencode's shape is: the package that owns the whole app (app) owns the whole-app tests and depends
downward; no package below app ever needs app, and no package below core ever needs a booted core.

## 3. Options

The kits stay packages with today's exports in every option. The options differ only in where the closing edge goes.
O1 is needed in every combination: without it the app itself cannot use `mount`. O2 and O3 are alternatives for the
packages below the app.

### O1. The kit knows the app as a peer only (closest to opencode)

What moves: `@conciv/app` leaves plugin-testkit's devDependencies. It stays in `peerDependencies`, where it already is.
apps/conciv adds `"@conciv/plugin-testkit": "workspace:*"` to devDependencies. plugin-testkit gets a turbo.json whose
`build` and `typecheck` list the builds of every package whose dist it reads through the app's source. The app exports
`"."` as `./src/index.tsx`, so tsc follows into app source. `pnpm exec conciv-publish check-turbo-depends-on` already
enforces this list, the same check that found the plugin-testkit typecheck race on main (8bf811e37).

Manifests after:

- plugin-testkit: `dependencies` harness-testkit, protocol, zod; `peerDependencies` `@conciv/app`, playwright, vitest;
  no app devDependency; turbo.json `build`/`typecheck` `dependsOn: ["^build", <app's dist reads>...]`.
- apps/conciv: devDependencies plus plugin-testkit. turbo.json unchanged.

Proven by dry run: the app dev-depends on the kit and the kit lists app-side builds (ui-kit-chat, plugin-page in the
probe). No cycle; `app#test` waits for `plugin-testkit#build`, and the kit's build does not wait for `app#build`. turbo
ignores peerDependencies (the kit's peer `@conciv/app` adds no edge).

Costs and open points:

- **unverified:** whether pnpm 11 (default `auto-install-peers`) still links `@conciv/app` into
  packages/plugin-testkit/node_modules when it is only a workspace peer. The kit's own tsc and the runtime
  `import '@conciv/app'` from its dist both need it. One `pnpm install` plus `ls packages/plugin-testkit/node_modules/@conciv`
  settles it; I did not run it (machine-load rule). If pnpm does not link it, O1 needs a resolution rule instead, for
  example a Vite alias set by the kit's own test-projects config. That is a design call, not proven here.
- A hand-kept list in plugin-testkit/turbo.json, guarded by the existing check.
- O1 alone fixes the app and every package that cycled only through the app. Among kit users these are cli (if it ever
  took plugin-testkit), unplugin, mascot, plugin-terminal, plugin-tanstack, plugin-ios and ui-kit-terminal. I checked
  the remaining closure with the manifest graph. It does not fix core, plugin-page, plugin, plugin-host,
  ui-kit-chat, ui-kit-system or the libraries the engine edge reaches.
- Found on the way, not caused here: `@conciv/app` is `"private": true` (apps/conciv/package.json:4), yet the published
  plugin-testkit peers on it and imports it in `mount`. An outside plugin author cannot install that peer today. O1 does
  not change this.

Test-split rows that change target file under O1: **none**.

### O2. The kit knows the engine packages as peers too

What moves (on top of O1): harness-testkit's dependencies on `@conciv/core`, `ai`, `contract`, `harness` and `serve`
become peerDependencies. harness-testkit gets a turbo.json whose `build`/`typecheck` list those five builds. Each kit
user that sits below core gets a turbo.json whose `build.dependsOn` lists its own `@conciv/*` dependencies' builds in
place of `^build`. Their `test` keeps `["^build", "build"]`, so tests still wait for the kit. Without that,
`X#build -> ^build -> kit#build -> core#build -> ... -> X#build`.

Manifests after:

- harness-testkit: `dependencies` protocol only (plus non-workspace ones); `peerDependencies` core, ai, contract,
  harness, serve; turbo.json lists their builds.
- core, ai, contract, client, db, harness, plugin, plugin-host, plugin-page, ui-kit-chat, ui-kit-system: devDependency on
  the kit they use, plus a turbo.json with an explicit `build.dependsOn` (core: 14 edges, one per `@conciv/*`
  dependency).

Proven by dry run: with all 18 kit users from the table given their kit devDependency and the 11 packages above given
explicit build lists, `turbo run test typecheck build --dry=json` plans with no cycle. Removing the explicit list from
any one of the 11 brings the cycle back (each tried alone). After O1+O2 the kit's closure cycles only with protocol and
the tooling packages (tsconfig, uno-preset, vitest-config), and none of those takes kit tests.

Costs:

- 12 hand-kept build lists (11 users plus harness-testkit), guarded by check-turbo-depends-on. That check enforces
  imports and typecheck dist reads today. **unverified** whether it also flags a list that drops a needed edge only
  through a peer.
- Published manifests change: harness-testkit asks its consumers to bring core, ai, contract, harness and serve. Needs a
  changeset.
- The same **unverified** pnpm peer-link question as O1, for each of the five peers.

Test-split rows that change target file under O2: **none**. Every row keeps its colocated target and its kit.

### O3. Below the app, packages test with their own fixtures, as opencode's core and server do

What moves (on top of O1): no kit devDependency in core, contract, ai, client, db, harness, plugin, plugin-host. Their
engine rows use in-package fixtures, as opencode's core (`testEffect`) and server (`ServerProcess.start`,
`serveRoutes`) do, kept in the package's own test support folder. The kits stay as they are, used by the app and the
plugins outside the engine closure.

The one package this cannot serve is plugin-page. Its whole-app rows need `mount`, and it is in the engine closure
(core -> plugin-page). As opencode does with gui-plugins, its UI rows move to the app.

Manifests after: as O1; no new turbo lists below core.

Costs:

- It contradicts the 2026-11-19 ruling that every conciv engine test uses `@conciv/plugin-testkit` "like any author
  would". That ruling needs to be reopened.
- It re-creates per-package engine fixtures: the duplication the kits were made to remove. The maintainer prefers the
  kit packages over opencode's in-package helpers.
- It does not help ui-kit-chat or ui-kit-system if their rows really mount the app (**unverified**). Under O3 those rows
  move to the app too.

Test-split rows that change target under O3:

- Same target file, different fixture (no move): every node+engine row in core (about 55), contract (about 31), ai
  (about 9), client (about 4), db (about 3), harness (about 6), plugin (about 5) and plugin-host (about 6).
- Move to `apps/conciv/src/*.dom.test.tsx` or the app's browser file: plugin-page's happy-dom (about 64) and browser-mode
  (about 82) rows that mount the app. This needs a per-row check that they mount the app and do not drive a served host
  page. Also the ui-kit-chat (about 10) and ui-kit-system (about 18) rows, if they mount the app.
- plugin's 6 happy-dom rows (the Solid helpers) render components, not the app (plugin-sdk.md). They stay.

### Not offered

Moving the helpers into the app is excluded by the maintainer. A separate private test-host package is not offered
either: it would add a package, which the 2026-11-19 ruling refuses. That is opencode's undeclared `@opencode/stories`
pattern.

## Recommendation

O1 + O2. These keep both kit packages, every test-split row's target file, and the "every test uses the kit" ruling.
The price is 12 turbo build lists that an existing repo check already guards. Before any writer starts, one probe
settles the only unverified step: `pnpm install` on a branch with the O1+O2 manifests, then check that `@conciv/app`
and the five engine peers link into the kits' node_modules. O3 is opencode's own shape, but it gives up the
kit-everywhere ruling.
