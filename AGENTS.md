<!-- intent-skills:start -->

## Skill Loading

Before substantial work:

- Skill check: run `pnpm dlx @tanstack/intent@latest list`, or use skills already listed in context.
- Skill guidance: if one local skill clearly matches the task, run `pnpm dlx @tanstack/intent@latest load <package>#<skill>` and follow the returned `SKILL.md`.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.

<!-- intent-skills:end -->

# AGENTS.md

Conventions for agents and contributors working in this repo. Product/architecture overview lives in
README.md; this file is the non-obvious operational rules.

## Packages: what goes where, and why

The repo is laid out as Backstage lays out its packages (`_ref/backstage/packages`), and its engine, simulation and
tests follow opencode (`_ref/opencode/packages`). When a question of where something goes is not answered here, the
answer is what those two do.

Each side of conciv has the same four kinds of package:

| Kind       | Backend (the engine, node)   | Frontend (the widget, browser) | Holds                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------- | ---------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plugin API | `@conciv/backend-plugin-api` | `@conciv/frontend-plugin-api`  | what a plugin author imports: `Plugin.define`, the rpc contract helpers, the tool and context types. Public, stable, no implementation.                                                                                                                                                                                                                                                                        |
| App API    | `@conciv/backend-app-api`    | `@internal/frontend-app-api`   | the machinery behind the plugin API: the plugin host, the tool service, permissions, hooks (backend); the opaque definitions, plugin loading, persistence (frontend). Plugins never import these.                                                                                                                                                                                                              |
| Defaults   | `@conciv/backend-defaults`   | `@internal/frontend-defaults`  | the product with no plugin in it: the engine and its HTTP, rpc, MCP and login surface (`src/engine`), chat, code mode (backend); the shell, router, pane, composer, sessions and settings (frontend). Defaults ship NO plugin.                                                                                                                                                                                 |
| App        | `@conciv/backend`            | `@conciv/app`                  | the shipped product: the defaults plus the plugins conciv ships, listed in one place (`backend/src` passes `plugins: [page]` to `createBackend`; `app/src/builtins.ts` lists the page and terminal renderers), as Backstage's `packages/backend` (`backend.add(...)`) and `packages/app` (`createApp({features})`). `@conciv/app` also builds the widget bundle (`packages/app/dist/conciv-widget.global.js`). |

The rest:

- `packages/plugins/*`: one package per plugin (page, terminal, tanstack, ios, recorder, test-runner, try-it,
  whiteboard). A plugin's code lives only in its own package, engine part and browser part together, never in core,
  defaults or app. The page plugin's tools, rpc, connection and tab handling are in `@conciv/plugin-page`; the engine
  knows nothing about tabs. pty is the exception that stays in the engine (`backend-defaults`), as opencode keeps it in
  `packages/core/src/pty`.
- `@conciv/protocol` (the oRPC contract and shared schemas), `@conciv/types` (wire types), `@conciv/client` (the
  browser's engine connection and rpc client), `@conciv/home` (the per-user home registry),
  `@conciv/harness` (harness adapters), `@conciv/serve` (the node HTTP server), `@conciv/simulation` (opencode's
  simulation: the scripted agent and fixed network table, switched on with `CONCIV_SIMULATE`; and the driver side of
  the widget's drive mode, `@conciv/simulation/frontend`: with `CONCIV_DRIVE` set the engine listens on the manifest's
  `ui` endpoint and serves `uiContract` from `@conciv/protocol/simulation`, as opencode's `OPENCODE_DRIVE`, and asks
  the widget over its own engine socket; dev builds only), `@conciv/cli`, `@conciv/unplugin` and `@conciv/it` (the
  host-side install), the `ui-kit-*` packages, `@conciv/mascot`.
- Test utilities, as Backstage's `backend-test-utils` and `frontend-test-utils` (see Testing): `@conciv/backend-test-utils`,
  `@internal/frontend-test-utils`, `@internal/engine-kit` (the engine kit both backend-defaults' own tests and
  backend-test-utils use), `@internal/vitest-config`.
- `@internal/*` is private (never published, inlined where it is used); `@conciv/*` is published. The published set is
  every workspace package that is not `private`, read from the manifests (`readPublishedNames`,
  `packages/publish/src/guards.ts`); there is no list to update.

Rules that hold the layout:

- No dependency loop between workspace packages through ANY field: `dependencies`, `devDependencies`,
  `peerDependencies` and `optionalDependencies` all count (`conciv-publish check-dependency-loops`, CI repo checks).
  Backstage's own `plugin-app` dev-depends on `frontend-test-utils`, a dev loop; ours may not.
- Turbo order comes from real dependencies alone: every package task depends on `^build`, with no cross-package
  `pkg#task`, no `build:types` and no `kit-runtime` task. A build-order problem is fixed by a real dependency, never
  by a turbo edge (`conciv-publish check-turbo-depends-on`, CI repo checks). The root package depends on no workspace
  package: root scripts run a tool by its file (`pnpm conciv-publish`, `pnpm conciv-ci-shards`,
  `pnpm conciv-bundle-size`), so editing a tool selects only it.
- No module-level state anywhere, product or test code: no module-level `Map`/`Set`/`WeakMap`/`WeakSet`, no
  module-level `let`, no module-level engine, connection, store, queue or registry, no `globalThis` writes
  (`conciv/no-module-state`). State is created by its owner and passed in: an id maker made once at engine start
  (`Identifier.makeMaker()`), caches owned by the component that reads them. A constant lookup is an array or object
  literal.
- No code exists for tests. A test reaches the product through what a user or host has (the rpc, the plugin API, the
  config); a test-only option, export or branch in product code is refused.

## Toolchain

- pnpm (exact version pinned in root `package.json` `packageManager`), Node >= 26. Monorepo orchestrated by turbo.
- `intent list` needs `pnpm install` to have run in the tree you invoke it from. Intent discovers skills by
  resolving each workspace package's dependencies; in a git worktree with no `node_modules` of its own, Node
  resolution escapes upward into the MAIN checkout's `node_modules` and finds only what is hoisted there
  (`fallow`, `@conciv/skills`). The result is a list showing `fallow` alone and every other entry reported as
  "declared in intent.skills but was not discovered" — and `@conciv/*` resolved from the main checkout is
  additionally mismatched, because its `packageRoot` falls outside this root's workspace globs so it is typed
  `npm` and the `workspace:` matcher misses it. `load` does not apply that kind check, so it keeps working and
  masks the problem. `pnpm install` in the worktree is the whole fix; nothing in `intent.skills` needs changing.
- Local turbo runs default to 50% concurrency (`turbo.json`) so builds don't saturate the workstation;
  CI re-uncaps with `TURBO_CONCURRENCY=100%` per workflow. Agent/background gate runs use
  `TURBO_CONCURRENCY=70%` and are not niced.
- Build: `pnpm build`. Typecheck: `pnpm typecheck`. Test: `pnpm test`. Lint: `pnpm lint` / `pnpm lint:fix`
  (oxlint). Format: `pnpm format` (check) / `pnpm format:fix` (oxfmt). Both: `turbo run quality` /
  `turbo run quality:fix`.
- Libraries build with tsdown, as devframe (`_ref/devframe-main`) builds its packages: each has one small
  `tsdown.config.ts` (entry, platform, tsconfig, `dts`; `fixedExtension: false` on a node build, so its files keep the
  `.js` names `exports` points at; no source or declaration maps, as devframe; `unbundle: true` for a
  library with several entries, so no hashed `.d.ts` chunk sits outside `exports`; Solid libraries add
  `unplugin-solid/rolldown`). Types come from tsdown's `dts` (rolldown-plugin-dts, tsgo on TS 7); no `tsc` in a build
  script. Externals are tsdown's defaults (`dependencies` and `peerDependencies` stay external); an exception goes
  through tsdown's `deps` (`alwaysBundle`, `neverBundle`, `onlyImport`), never a hand-written list. A library that
  bundles dependencies on purpose builds its JS bundled and its declarations in a second `dts: {dtsOnly: true}` config.
  A plugin's UnoCSS sheet is generated before tsdown, as devframe's `build:css`: `scripts/build-css.ts` is one line,
  `console.log(await buildPluginSheet(import.meta.url))` (`@internal/uno-preset/build-shadow-css`), which runs
  `pluginSheetConfig` over the plugin's `src` and
  writes `src/.generated/css.ts` (`export default "<css>"`, gitignored); `build` runs `build:css` first, the browser
  part imports `./.generated/css.js`, and the turbo `build:css` task (outputs `src/.generated/**`, also a `build`
  output) runs before `typecheck`. The script runs on Node 22.18+ type stripping, so it stays erasable-only TS. The three kits that use Vite's inline imports (`?worker&inline`, `.css?inline`, the
  `.woff2?inline` fonts) build their JS with Vite in their own `vite.config.ts` (ui-kit-chat, solid-diffs,
  ui-kit-terminal; `tsdown` writes only their declarations, then `vite build`), so their dist holds the worker, CSS and
  fonts itself: Next.js and other non-Vite hosts bundle these kits too.
- Vite builds only app bundles, each from its own config next to the app code, run after `tsdown` in the `build`
  script: `@conciv/app` (`vite.config.ts`: the `mount` bundle and the widget bundle; `tsdown` writes `mount.d.ts`),
  `@internal/frontend-defaults` (the standalone shell), and the `./plugin-experimental` bundle `experimental()` builds
  in recorder, tanstack, test-runner and whiteboard.
- Lint and format are turbo ROOT tasks (`//#lint`, `//#format`, `//#quality` in `turbo.json`), as Turborepo's
  Oxc guide: one oxlint and one oxfmt over the whole repo, no per-package `lint` script. `//#lint` depends on
  nothing: the `unocss/order` rule reads the one root `uno.config.ts` (`.oxlintrc.json` `settings.unocss.configPath`),
  which loads the preset from its source, and the order the preset gives is the same in every package. A root task's inputs are every file in the repo, so any
  edit misses its cache; that is the guide's stated trade-off. A `--filter` run never selects a root task.
- New package: `turbo gen package` (non-interactive: `turbo gen package --args <published|internal|plugin> <kebab-name> "<description>" <node|browser|both> <install|skip>`; `skip` leaves out `pnpm install`, to make several packages and install once). `published` makes `@conciv/<name>`, built with tsdown (`tsdown.config.ts`) and registered for release; `internal` makes `@internal/<name>`, private and source-only (exports point at `src`, no build script). Both live in `packages/<name>`. `plugin` makes `@conciv/plugin-<name>` in `packages/plugins/<name>`, registered for release like a published one: the runtime picks its parts (`node` the engine part `src/<name>.ts`, `browser` the browser part `src/plugin-experimental.tsx` built by `experimental()` in `vite.config.ts` with its `uno.config.ts` and `scripts/build-css.ts` sheet, `both` both), in the #1217 plugin shape. Each kind comes with the five test folders, and get a `test` script with their first test. The generator lives in `packages/publish/turbo/generators/`; its test is `packages/publish/test/it/package-generator.it.test.ts`.
- `pnpm test` builds first (`turbo run test` dependsOn `build`). Don't hand-rebuild `dist/`; use turbo.
  So a green `test` already proves the build: don't run a separate `build` gate unless the package has
  no `test` script (`@conciv/serve`, `@conciv/ui-kit-tap`, the `conciv-e2e-*` apps).
- Package gates filter bare: `turbo run test --filter=<pkg>`. A TRAILING `<pkg>...` means "and all its
  DEPENDENCIES" (28 real suites here instead of 1), not "and its dependents"; `.claude/hooks/turbo-filter-gate.sh`
  blocks it for test/typecheck. The dependents selector is the LEADING form `--filter=...<pkg>`.
  The same hook also blocks an unfiltered `turbo run test` or `turbo run typecheck`, including the bare
  root scripts `pnpm test` and `pnpm typecheck` (which expand to it), and a bare `vitest` or `vitest run`
  with no test file/glob and no `-t`/`--testNamePattern`; pass a `--filter` (or a file argument) instead.
- Affected-only shortcuts for a branch: `pnpm test:affected` / `typecheck:affected` / `build:affected`
  (`TURBO_SCM_BASE=origin/main turbo run <task> --affected`). `turbo.json` sets
  `futureFlags.affectedUsingTaskInputs`, so `--affected` selects a TASK when a changed file is one of its
  inputs or a task it depends on is selected: a test-only edit reruns that package's `test` and `typecheck`
  and no dependent and no build, and a `src` edit reruns every dependent through `^build`. A UnoCSS config scans
  only its own package and packages it depends on (the app: its kits); no package scans a plugin's source, and every
  plugin, the built-ins page, terminal and ios included, builds its own utilities-only sheet
  (`presetConciv({sheet: 'plugin'})`) and adds it with `ctx.add(Style, css)`. That holds only while every task `test` and `typecheck` depend on (`build`) excludes tests,
  specs and stories from its `inputs`, as the `content.filesystem` globs do. `apps/storybook` keeps one root input:
  the story files it reads, which no build reads. `--filter=...[ref]` ignores the flag and
  still selects whole packages plus manifest dependents.
  A root file in `globalDependencies` (`pnpm-workspace.yaml`) selects every task.
- Gates run with the turbo cache on. `turbo run --force` is banned by `.claude/hooks/turbo-filter-gate.sh`
  (the cache hash already covers source and deps); if a dist looks stale, delete that package's dist
  (`rm -rf packages/<pkg>/dist`) and rerun without `--force`. `turbo.json` pins no `cacheDir`, so turbo
  uses its own default inside the checkout: a committed `cacheDir` pointing outside the repo escapes the
  checkout on CI runners, where nothing exists above the workspace.
  Turbo shares the main checkout's `.turbo/cache` with every git worktree automatically. Never set
  `TURBO_CACHE_DIR` or pass `--cache-dir`: a second store makes runs miss each other's results, and
  `.claude/hooks/turbo-filter-gate.sh` blocks it.
- Disk: the local turbo cache is capped at 5GB and 7 days by turbo's own `cacheMaxSize` and `cacheMaxAge`
  (`turbo.json`); the e2e app builds (`e2e/*` with `.next`, `.output` or `.svelte-kit` output) are not cached;
  agent sessions run with `NODE_DISABLE_COMPILE_CACHE=1` (`.claude/settings.json` `env`, passed through by
  turbo), so vite writes no Node compile cache to `/private/tmp`.
- Commit hooks: `prek` (devDep `@j178/prek`, config `.pre-commit-config.yaml`) runs `oxlint --fix`
  and then oxfmt on staged files, so whatever the lint autofix rewrites is formatted before it is
  restaged. `pnpm install` auto-activates the hook via the `prepare` script; no per-clone step.
  Whole-project gates (typecheck/build/test) are not in hooks; run them manually.
- Dev loop: every host consumes workspace `@conciv/*` packages from `dist`, exactly like a consumer;
  nothing is served from `src/`. `pnpm dev:watch` runs `turbo watch dev --filter=@internal/frontend-defaults`:
  the shell's dev server plus a rebuild of each dependency's `build` when its sources change, so a
  kit edit rebuilds that package's `dist` and Vite reloads the page. Outside that loop, rebuild a
  package with `pnpm --filter <pkg> build`; restart the dev server for server-side edits. NEW
  UnoCSS utility classes added in ui-kit src appear after the `@conciv/app` rebuild (the widget css is
  generated at that build).
- Vite 8 auto-enables `server.forwardConsole` when it detects an agent env (`AI_AGENT` checked first,
  then `CLAUDECODE` etc.); combined with `@tanstack/devtools-vite`'s server-to-browser console pipe,
  a single page `console.error` round-trips forever as growing `[Server] ...` entries (12+ GB tabs
  observed). `concivSolidConfig` (unplugin) now sets `server.forwardConsole: false`
  unconditionally for every host wired through the conciv vite plugin, so scrubbing agent env vars
  before starting a dev server is no longer load-bearing.
- On large commits the prek hook can abort with a `next-index-*.lock.lock` error (file-lock race).
  Recover by running `pnpm format:fix` manually, then `git commit --no-verify`.
- Never kill a dev server with `kill $(lsof -ti tcp:PORT)`. That also matches the user's connected
  browser and kills their tab. Use `lsof -ti tcp:PORT -sTCP:LISTEN` (or `pkill -f vite`).

## Code style

- Functions, not classes. (Sole exception: `DelegatingTextAdapter` behind `makeTextAdapter`
  in `packages/harness/src/adapters/adapters.ts`, which the library's typing forces.)
- No IIFEs unless explicitly required.
- No identifier ending in "Of" (`conciv/no-of-suffix`): name a function with a verb first that says what its body does,
  e.g. `readApprovalAsk`, not `approvalAskOf`. Files copied from opencode in `packages/backend-app-api/src`,
  `packages/frontend-plugin-api/src` and `packages/frontend-defaults/src/runtime/{plugin,persistence}` keep the source's names.
- Zero code comments in TS/JS (only tool directives like `@ts-`/`eslint-` survive). The
  `conciv/no-comments` lint rule autofix-DELETES anything else, so don't write comments and let lint
  strip them; write self-explanatory code.
- TypeScript is strict (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, NodeNext). Avoid
  `any`/`as`/`@ts-ignore`.
- Solid: no raw `createSignal`/`createEffect` in new code; use `createMemo`, `createResource`, solid-query,
  or `@solid-primitives/*`; if none fits, say why in the PR and get maintainer sign-off. React (`apps/site`): no `useEffect`/`useLayoutEffect`. Full review laws:
  `.github/skills/code-review/SKILL.md`.
- Styling is UnoCSS classes only, from the preset's existing tokens: no new `.css` files or rules, no arbitrary
  values where a token exists (breakpoints use the named container variants `@xs`/`@sm`/`@md`/`@lg`, never
  `@[360px]`; motion uses the preset `anim-*` shortcuts).
- oxfmt: no semicolons, single quotes, no bracket spacing, trailing commas, printWidth 120.

## TanStack Router

- Before any router work: `pnpm dlx @tanstack/intent@latest load @tanstack/router-core#<skill>`
  (`router-core/search-params` for params, `router-core/code-splitting` for `getRouteApi`).
- Files under `src/routes/` use route-scoped APIs only: `Route.useSearch()`, `Route.useNavigate()`,
  `Route.useParams()`, `Route.useLoaderData()`, or `getRouteApi('/path')` in a split component. Bare
  `useSearch`/`useNavigate`/`useParams`/`useLoaderData` imports there are a lint error.
- Shared cross-route components read params with `useSearch({strict: false})`. Never mine
  `useRouterState().matches` and never hand-parse `window.location`: ask the router
  (`router.matchRoutes`).
- Declare a search param on the shallowest route whose layout reads it; inheritance is
  downward-only. Children contribute their own defaults through `search.middlewares`, and masked
  defaults are stripped with `stripSearchParams`.
- `validateSearch` must never throw: every zod field carries `.default()` or `.optional()` AND
  `.catch()` (zod v4, plain `.catch()`, no `zodValidator` adapter, no `fallback()`). Search schemas
  live in files named `*-schemas.ts` with `const <name>SearchSchema`, which is what the
  `conciv/router-idioms` lint rule matches on to check fields across files.

## Testing

Tests are laid out as Backstage's and run as opencode's. The rules are this section; where the old tests are and the
rulings the rewrite still carries are in `docs/specs/test-rewrite-after-port.md`.

### Where a test lives

- Every package and app has `test/unit`, `test/it`, `test/e2e`, `test/fixtures` and `test/utils` (an empty one holds a
  `.gitkeep`). The file name carries its folder's kind:
  - `test/unit/x.unit.test.ts`: plain vitest in node (or happy-dom) that starts nothing: functions, models, reducers,
    machines.
  - `test/it/x.it.test.ts`: node, starts real things: an engine, files, git, a CLI.
  - `test/e2e/x.e2e.test.tsx`: vitest browser mode (Chromium), mounts the app or a plugin; a perf file is
    `test/e2e/x.perf.e2e.test.tsx`.
  - Helpers and fakes in `test/utils`, fixture files in `test/fixtures`.
- The repo-root `e2e/` holds the real-host suites (Playwright Test, the built widget bundle in real host apps, real
  harness CLIs). Playwright exists only there (`conciv/playwright-test-in-e2e`). Never jsdom.
- A test lives in the package whose code it tests, and only there: an engine behaviour in `backend-defaults`, a shell
  behaviour in `frontend-defaults`, a plugin's tools and screens in that plugin's package. Nothing tests another
  package's internals.
- A behaviour lives in the cheapest place that proves it, and only there: unit, then it, then e2e (browser mode), then
  the root `e2e/` host app. Happy-dom is for code that mounts nothing, as opencode (`_ref/opencode/packages/app/happydom.ts`).
- Only `packages/cli`'s own tests and the root `e2e/init` suite spawn the CLI, as opencode's `packages/cli`. The one
  package that depends on `@conciv/cli` is `@conciv/unplugin`, and it never runs it: `bin-shim.ts` links the CLI's bin
  into the engine's `PATH` so the agent the engine starts can run `conciv`.
- A framework app under `e2e/` holds ONE test: the user signs in and the widget opens with no error in that framework.
  It gets a second test only for something that broke in that framework, named in its title. Behaviour that needs the
  real built widget in a real browser but is not about a framework (reload, real windows and downloads, the file
  chooser, focus between host page and widget, real CLIs) is tested once, in the one e2e host app. A plugin's own
  journeys, a real engine or a real pty included, stay in that plugin's `test/e2e`: nothing plugin-related goes in
  the root `e2e/`.
- Never add tests under `apps/examples/*` (demos). Exception: `apps/examples/tanstack-start` carries demo tests so the
  in-chat test runner has something to run.

### The test utilities

The point of the test utilities, as Backstage's: a plugin tests EVERYTHING about itself from its own package, against
the real engine or the fake one, in node or the browser, with the same calls. The utilities provide every fake a
plugin needs (as Backstage's `mockApis`); a plugin's `test/utils` holds only that plugin's own sample data, never a
re-implementation of engine or shell behaviour. If a plugin's test has to live anywhere else, the utilities are
missing something: add it there. Nothing else is exported; a new export or option on any of them needs the
maintainer's yes.

- `@conciv/backend-test-utils` (published, as `@backstage/backend-test-utils`): `test`, `TestLLM`, `pluginDirectory`.
  `test` is vitest's `test` extended with a `createEngine` fixture:

  ```ts
  import {test as it, TestLLM} from '@conciv/backend-test-utils'
  import page from '../../src/page.js'

  it('the agent reads the page', async ({createEngine}) => {
    const engine = await createEngine({}, {plugins: [page]})
    await engine.reply(TestLLM.text('done'))
    await engine.session.send('Look at the page')
  })
  ```

  `createEngine(config, start)` starts the REAL engine (`createBackend` from `@conciv/backend-defaults/backend`) on a
  free port, as Backstage's `startTestBackend`, with the simulation's scripted model. `config` is the product's own
  `ConcivConfig`; `start` is only what is not product config (`plugins`, `directory`, `timeouts`, `harnesses`, `env`,
  `fs`, `clock`, `tokensPerSecond`). The engine ships no plugin: a test passes the plugins it needs in
  `start.plugins`. Replies are scripted with `engine.reply(...)`, which takes only `TestLLM` replies (`text`,
  `toolCall`, `failAfter`, `hang`); `engine.gate()` holds a reply. The fixture stops every engine its test started when
  the test ends, pass or fail; a test never stops one itself. `start.plugins` takes plugin objects or package names
  (a name loads that package's `.` export from the package under test).
  The same `test` works in browser mode: the package's `browser` export condition gives a fixture whose engine lives
  in node and is reached through vitest browser commands (`concivCreateEngine`, `concivSend`, `concivToolCall`,
  `concivEvent`, `concivClockTick`, ...), which `concivTest({browser: true})` registers from
  `@conciv/backend-test-utils/vitest` when the package under test has it. In browser mode only data crosses: a
  function reply (other than `hang()`), a `start.harness` or a plugin object is refused; plugins go by package name.

- `@internal/engine-kit` (private): the engine kit itself, taking `createBackend` as an argument so it depends on
  neither backend-defaults nor backend-test-utils. `backend-test-utils` bundles it; `backend-defaults` uses it from its
  own `test/utils` (it cannot depend on backend-test-utils, which depends on it). Nobody else imports it.
- `@internal/frontend-test-utils` (private, as `@backstage/frontend-test-utils`): it depends on
  `@internal/frontend-defaults`, the real shell, as Backstage's depends on `plugin-app`.
  - `renderInTestApp({plugins, engine})`: a minimal host with one plugin's parts and the shell's chrome off, for a
    plugin's own screens.
  - `renderTestApp({plugins, engine})` (`@internal/frontend-test-utils/app`): the full shell from frontend-defaults
    with the given plugins, for journeys through the chat. `engine` is the fake engine, a real engine from
    `createEngine` (bound to its address and token over the real `@conciv/client` connection), or `'none'`;
    `renderInTestApp` takes the same two.
  - `createExtensionTester(...)`: one extension (a tool card, a tab) on its own.
  - `useFakeEngine(engine?)`: the fake engine the render uses.
- `@internal/test-utils`: `createFakeEngine()` and `FakeLLM`. The fake engine is built with oRPC's
  `implement(contract)` on the real contract (`@conciv/protocol`), reached through an in-memory link, and answers like
  the real engine: sessions and paging, past CLI sessions, compaction, harness models, run events, permission asks,
  plugin bundles (`servePluginBundle` in `@internal/frontend-test-utils/app` serves a plugin's built bundle as the
  engine does, so the shell loads it through its real loader). Per-procedure handlers can be overridden for one test,
  and `plugins: {<id>: handlers}` answers a plugin's own rpc. When the fake cannot do something a test needs, extend
  the fake to match the real engine; never drop the step.
- A plugin's own fakes ship from the plugin, as Backstage's `@backstage/plugin-catalog-react/testUtils`
  (`catalogApiMock`): a `./test-utils` subpath, e.g. `@conciv/plugin-page/test-utils` (`pageTestPlugin`, the page
  built-in as the test app renders it) and `@conciv/plugin-test-runner/test-utils` (`createTestRunState`). Other
  plugins' tests import them; nothing re-creates them.
- `@internal/vitest-config`: `concivTest({environment?, browser?})` in the package's `vitest.config.ts`, or in its
  `vite.config.ts` when the package has a Vite app config (then no `vitest.config.ts`), adds the `unit` and `it` projects, and with `browser: true` the `browser` and `perf` ones.
  `conciv()` (`@conciv/unplugin`) adds nothing under vitest. `test/unit` runs in node unless the package passes
  `environment: 'happy-dom'`; one file may override it with a first-line `// @vitest-environment happy-dom`. vitest
  collects tests only from `test/{unit,it,e2e}/**`.
- Every package's `test` script is plain `vitest run`. `concivTest()` adds a `globalSetup` that gives the run its own
  home (removed after) with none of the developer's secrets or `CONCIV_*` variables; it keeps the developer's
  Playwright browsers folder.
- A package lists the test utilities it uses in its own `devDependencies`, and that must close no loop (a plugin
  dev-depends on `@internal/frontend-test-utils`, never the reverse).

### How a test is written

- Tests do what a user does: queries by role, label and text, `user-event` (never `fireEvent`, except
  `fireEvent.keyDown` with `isComposing` for the IME guard). No CSS, DOM or geometry reads (`toHaveCSS`,
  `getComputedStyle`, `page.evaluate` reads), no class or id locators, no test-ids.
- Assert with the jest-dom matchers (`toBeVisible`, `toHaveAccessibleName`, `toBeDisabled`, ...), never
  `toBeDefined()` or `toBeTruthy()` on a Testing Library query. One visible match is `getByRole(...)` then
  `toBeVisible()`.
- No mocks or stubs (`vi.fn`, `vi.mock`, `vi.spyOn`, `vi.stubGlobal`, `vi.stubEnv`, fake modules). A fake is a real
  implementation the product accepts (the scripted harness, the fake engine, an in-memory store). Config goes through
  Effect `ConfigProvider` or the product's config, never env writes.
- No sleeps and no per-call timeouts. A product timer a test must cross becomes an option the product reads, default
  unchanged; fake timers are allowed.
- One `describe` per user flow, consecutive steps in one test; inputs as `it.each`/`it.for` tables.
- Tests never write app state outside their temp dirs, and never add `afterEach`/`onTestFinished` for a kit resource:
  the fixtures and the render helpers clean up.
- Budgets (`conciv/test-file-budget`): a package lacking one of the five folders fails; a test file outside
  `test/unit`, `test/it` and `test/e2e` fails; a name whose kind is not its folder fails; never more test files than
  source files; a test file is at most 1,000 lines.
- Test budget (`test-budget.json`, `conciv-publish check-test-budget`): it counts test cases. It is a review gate, not a
  counter to bump. Before you raise a number: (1) list every new test case over budget, by file and name; (2) for each,
  name the existing test you checked and why it does not cover this; (3) fold it into an existing journey when one
  fits; (4) only a survivor gets a raised number, and the PR body carries the account for the maintainer.

### Running

- One package: `turbo run test --filter=<pkg>`; one file: `pnpm vitest run <file>` in that package.
- The calm perf gate (frame-gap budgets) is `pnpm --filter @internal/frontend-defaults test:perf`, kept out of
  `pnpm test`; run it locally in Chromium and Firefox before merging a chat-plane change.
- Flame graph of a slow test: `NODE_OPTIONS='--cpu-prof --cpu-prof-dir=/tmp/prof' pnpm vitest run <file>`; each test
  process writes a `.cpuprofile`. Open it in Chrome DevTools (Performance, Load profile) or speedscope.
- `e2e/` suites load the PREBUILT widget bundle (`packages/app/dist/conciv-widget.global.js`): rebuild it
  (`pnpm turbo run build --filter=@conciv/app`) before running them, or you test stale code. Use `browser.newPage()`,
  not `newContext()`, and never wait for Playwright `networkidle` on a page with the live widget; wait for
  `domcontentloaded` or a UI signal.

### Untrusted input

- zod validates every untrusted input where it enters: rpc procedures declare `oc.input(...)` in
  `packages/protocol/src/contract.ts` (a plugin, in its own contract); plain Hono routes zod-parse each piece they read
  (body, params, query, headers), e.g. `ChunkFileSchema.safeParse(c.req.param('file'))` in
  `packages/backend-defaults/src/engine/api/widget-page.ts`.

## Codebase analysis (fallow)

- Before finishing a task, run `pnpm exec fallow audit --changed-since main --format json` and fix
  anything it flags as INTRODUCED: dead code, unused exports/deps, duplication, complexity, circular
  deps. Fallow builds the whole module graph, so it catches cross-file dead code and unused deps you
  can't see from context. CI runs the same audit (`.github/workflows/fallow.yml`) and blocks on
  newly-introduced findings.
- Before deleting a supposedly-unused export/dep, verify with
  `pnpm exec fallow dead-code --trace 'file.ts:Symbol'` (or `--trace-dependency <pkg>`). "USED but file
  unreachable" means a missing entry point, not dead code.
- Config is `.fallowrc.json`. `publicPackages` lists our published libraries whose exports are public
  API and never "unused"; don't delete those. CI builds packages first so `@conciv/*` imports resolve
  against their dist-only exports; don't re-add an `ignoreUnresolvedImports: @conciv/*` hack.

## Releasing (npm publish)

- Publishing is CI-only, via OIDC trusted publishing (`.github/workflows/release.yml` runs
  `changesets/action` with `id-token: write`, `NPM_TOKEN` empty). There is NO npm token for humans;
  running `pnpm release` locally 404s (`E404` on the registry PUT). Never publish from a laptop.
- The flow, end to end:
  1. Land a PR that adds a changeset (`pnpm changeset`, or hand-write `.changeset/<name>.md`). Do NOT
     run `release:version` or `release` yourself; those are the CI steps.
  2. On merge to `main`, `changesets/action` opens a `chore: version packages` PR that runs
     `pnpm release:version` (consumes changesets → bumps versions + CHANGELOGs, resyncs the lockfile).
  3. Merging that version PR triggers `pnpm release` in CI: `turbo run build publint attw`, then
     `changeset publish` to npm with provenance.
- All `@conciv/*` share ONE version: `.changeset/config.json` sets `fixed: [["@conciv/*"]]`, so a single
  changeset bumps the whole set in lockstep (currently the 0.0.x patch line). One changeset entry naming
  any `@conciv/*` package is enough to release them all.
- EVERY PR that changes published packages (including `@internal/frontend-defaults`, which ships inside the `@conciv/app` widget bundle)
  needs a changeset or the `no-changeset` label — CI `check-changesets --require-coverage` blocks
  otherwise. Verify locally before handoff:
  `pnpm conciv-publish check-changesets --require-coverage --base origin/main`.
- Adding a new PUBLISHED package (`private` unset/false)? Name it `@conciv/<kebab-name>` (`assertPublicSet`
  refuses any other name on a package that is not private, and any `@internal/*` one); give it
  `homepage: https://conciv.dev` + a `repository` block with its `directory` (matches every public manifest).
- Before opening a release PR: `pnpm typecheck && pnpm build && pnpm test`, run
  `pnpm exec fallow audit --changed-since main --format json` and fix anything INTRODUCED (see the fallow
  section). `pnpm release:check` (build + publint + attw) mirrors the CI validate step locally.

## Harness & runner adapters

- A harness is `chatConfig(deps)` returning a published `@tanstack/ai-*` text adapter (+ optional
  `modelOptions`/`prepareMessages`) plus sidecars (`models`, `history`, `tty`, `commands`).
  Turns run through `chat()` with the conciv sandbox middleware; never spawn or
  decode a CLI yourself, and never special-case a CLI in core/widget.
- `HarnessAdapter` is capability-typed (`packages/protocol/src/harness-types.ts`): `transcriptHistory:
  true` ⇒ `history` required; `slashCommands` ≠ `'none'` ⇒ `commands` required, enforced at compile
  time. Add a harness by satisfying the capability contract.
- Harness workdirs are sandbox-virtual: the local-process sandbox root IS the cwd and adapters
  default to `/workspace`. Never pass a host-absolute cwd into an adapter config: it nests a junk
  `Users/...` tree inside the workspace and runs the CLI there.
- Test runners follow the same registry/stub pattern.

## Solid & Ark landmines

- zag gates a listbox item's `data-highlighted`/`focused`/`focusVisible` on the listbox itself
  holding DOM focus (`@zag-js/listbox` `listbox.connect.mjs:47`), and marks `highlighted` deprecated
  in its own source. Under virtual focus (the editor keeps focus, listbox content is not a tab stop)
  they never fire, so highlight styling keys off `highlightedValue` through our own `data-active`
  (`ui-kit-system/src/anchored-listbox.tsx`). That is compensation, not duplicated state: don't
  "consolidate" it onto `data-highlighted`. `highlightedValue` is _not_ focus-gated, which is exactly
  why `aria-activedescendant` works.

## Plugin landmines

- Import CSS with `?inline` and contribute it through `ctx.add(Style, css)`.
- Whiteboard (TanStack DB collections): never write to the db inside a collection subscription,
  effect, or render body: it triggers a re-render storm. Writes go in event handlers only.
- The widget bundle must externalize the shared Ark/Solid deps; a second bundled copy splits the
  Solid/Ark context and plugin popovers render at 0,0. Guarded by the mount-externals build test (`packages/app/test/unit/mount-impl.unit.test.ts`);
  don't weaken it.

## Security & safety

- The core dev server binds `127.0.0.1` only. Never commit or log credentials/tokens.
- CLI commands are governed by each CLI's native permission mode (Claude Code runs `permissionMode: 'auto'`
  plus the ask rules `CLAUDE_ASK_RULES` in `packages/harness/src/claude/chat.ts`).
  When a CLI asks, the ask goes to conciv's permission service (`permission.assert`) and waits on the user's card:
  Claude Code through its permission prompt tool on conciv's tool bridge, an ACP CLI (Gemini) through
  `onPermissionRequest`. An ask dies with its run (a stop, or a prompt call the CLI gives up on) and its card goes.
  Codex never asks (`approvalPolicy: 'never'`); opencode's asks do not reach conciv (pending a ruling).

## Project status

- Pre-release (v0), no external users: reshape internal APIs freely and update all call sites; no
  back-compat shims.

---

<!-- fallow:setup-hooks:start -->

## Fallow local gate

Before any `git commit`, run `fallow audit --format json --quiet --explain --gate-marker agent`. A `git push` is not audited: it moves only commits the commit gate already audited, and CI audits the PR (`.github/workflows/fallow.yml`). If the verdict is `fail`, fix the reported findings before retrying. Treat JSON runtime errors like `{ "error": true, ... }` as non-blocking. Agent sessions pin the comparison base to `origin/main` through `.claude/settings.json` `env.FALLOW_AUDIT_BASE`, so every commit is judged as the whole branch against main; a session started before that setting existed must be restarted to pick it up.

To attribute findings, the audit keeps a checkout of the base commit per worktree and base, a `fallow-audit-base-cache-*` folder of about 70 MB in the OS temp dir. `.fallowrc.json` sets `audit.cacheMaxAgeDays: 1`, so each audit sweeps its own copies unused for a day (fallow's default is 30); `pnpm exec fallow audit-cache prune` applies the same sweep by hand.

`.claude/hooks/fallow-gate.sh` is generated by `fallow setup-hooks` (3.36.0, which has no commit-only switch) and hand-edited here so that it audits `git commit` only and skips `git push` with one stderr line. A rerun of `fallow setup-hooks` or `fallow agent install` undoes that: re-apply it by passing the subcommand to `is_git_write_command` and `gate_loose_write`, testing `commit` first and exiting 0 on `push`, then run `bash .claude/hooks/fallow-gate.test.sh`.

Audit defaults to `gate=new-only`: only findings introduced by the current changeset affect the verdict. Inherited findings on touched files are reported under `attribution` and annotated with `introduced: false`, but do not block the commit. Set `[audit] gate = "all"` in `fallow.toml` to gate every finding in changed files.

For non-skill agents, treat the task map below as the local onboarding source: run the listed fallow command before destructive edits, before commits, and before pull request handoff.

## Fallow task map

| When the agent is about to...     | Run                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| delete an "unused" export or file | `fallow dead-code --trace <file>:<export>`                                           |
| delete an "unused" dependency     | `fallow dead-code --trace-dependency <name>`                                         |
| commit (CI audits the PR)         | `fallow audit --base <ref>`                                                          |
| prioritize refactoring            | `fallow health --hotspots --targets`                                                 |
| ask who owns code                 | `fallow health --ownership`                                                          |
| check untested-but-reachable code | `fallow health --coverage-gaps`                                                      |
| consolidate duplication           | `fallow dupes --trace dup:<fingerprint>`                                             |
| find feature flags                | `fallow flags`                                                                       |
| surface security candidates       | `fallow security`                                                                    |
| understand a finding              | `fallow explain <issue-type>`                                                        |
| scope a monorepo                  | `--workspace <glob> / --changed-workspaces <ref>` (global flags, prefix any command) |

<!-- fallow:setup-hooks:end -->
