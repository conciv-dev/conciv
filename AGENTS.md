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
  `TURBO_CONCURRENCY=70%` and are not niced; test gates stay serial (`TURBO_CONCURRENCY=1 VITEST_MAX_FORKS=1`).
- Build: `pnpm build`. Typecheck: `pnpm typecheck`. Test: `pnpm test`. Lint: `pnpm lint`
  (oxlint). Format: `pnpm format:check` / `pnpm format` (oxfmt).
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
  inputs or a task it depends on is selected: a test-only edit reruns that package's `test`, `typecheck` and
  `lint` and no dependent and no build, a `src` edit reruns every dependent through `^build`, and a file another
  package's build scans (the UnoCSS `$TURBO_ROOT$/...` build inputs in `packages/embed`, `apps/conciv`,
  `packages/ui-kit-chat`, `packages/ui-kit-chat-tools` and `packages/ui-kit-tap`) reruns that build. That holds
  only while every task `test` and `typecheck` depend on (`build`) excludes tests,
  specs and stories from its `inputs`, and while each `$TURBO_ROOT$` build input carries the same exclusion as
  the `content.filesystem` globs in that package's `uno.config.ts`. `--filter=...[ref]` ignores the flag and
  still selects whole packages plus manifest dependents.
  A root file in `globalDependencies` (`pnpm-workspace.yaml`) selects every task; `.oxlintrc.json` is a
  `lint` input only.
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
  turbo), so vite and tsdown write no Node compile cache to `/private/tmp`.
- Commit hooks: `prek` (devDep `@j178/prek`, config `.pre-commit-config.yaml`) runs `oxlint --fix`
  and then oxfmt on staged files, so whatever the lint autofix rewrites is formatted before it is
  restaged. `pnpm install` auto-activates the hook via the `prepare` script; no per-clone step.
  Whole-project gates (typecheck/build/test) are not in hooks; run them manually.
- Dev loop: every host consumes workspace `@conciv/*` packages from `dist`, exactly like a consumer;
  nothing is served from `src/`. `pnpm dev:watch` runs `turbo watch dev --filter=@conciv/app`: the
  `apps/conciv` dev server plus a rebuild of each dependency's `build` when its sources change, so a
  kit edit rebuilds that package's `dist` and Vite reloads the page. Outside that loop, rebuild a
  package with `pnpm --filter <pkg> build`; restart the dev server for server-side edits. NEW
  UnoCSS utility classes added in ui-kit src appear after the embed rebuild (css is generated at
  embed build).
- Vite 8 auto-enables `server.forwardConsole` when it detects an agent env (`AI_AGENT` checked first,
  then `CLAUDECODE` etc.); combined with `@tanstack/devtools-vite`'s server-to-browser console pipe,
  a single page `console.error` round-trips forever as growing `[Server] ...` entries (12+ GB tabs
  observed). `concivSolidConfig` (unplugin) now sets `server.forwardConsole: false`
  unconditionally for every host wired through the conciv vite plugin, so scrubbing agent env vars
  before starting a dev server is no longer load-bearing.
- On large commits the prek hook can abort with a `next-index-*.lock.lock` error (file-lock race).
  Recover by running `pnpm format` manually, then `git commit --no-verify`.
- Never kill a dev server with `kill $(lsof -ti tcp:PORT)`. That also matches the user's connected
  browser and kills their tab. Use `lsof -ti tcp:PORT -sTCP:LISTEN` (or `pkill -f vite`).

## Code style

- Functions, not classes. (Sole exception: `DelegatingTextAdapter` behind `makeTextAdapter`
  in `packages/ai/src/adapters/adapters.ts`, which the library's typing forces.)
- No IIFEs unless explicitly required.
- No identifier ending in "Of" (`conciv/no-of-suffix`): name a function with a verb first that says what its body does,
  e.g. `readApprovalAsk`, not `approvalAskOf`. Files copied from opencode in `packages/plugin-host/src`,
  `packages/plugin/src` and `apps/conciv/src/runtime/{plugin,persistence}` keep the source's names.
- Porting from opencode: first check why opencode has the code, and whether our stack already does that job. For
  example, opencode's `client/src/solid/connection.ts` reconnect loop exists because its events are a bare fetch SSE
  stream; ours run on partysocket plus oRPC's `ClientRetryPlugin`, so the loop must not be ported. Port what our stack
  lacks, exactly; never port a workaround for a problem we do not have.
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

The plan and its rules are `docs/specs/test-rewrite-after-port.md`; the per-test plan is `docs/specs/test-split/`.

### Where a test lives: the package layers

A test may only use packages its own package can depend on without a cycle. A test that needs something higher up moves
up, to a package above it. Never hide a cycle with a package `turbo.json`, a task name or a `#build` entry.

- **Packages below core never start an engine.** That covers protocol, contract, db, plugin, plugin-host, ai, harness,
  chat, the UI kits, `@internal/*` and vitest-config. They test with `@conciv/vitest-config` only. They never
  devDepend on core, the app, cli, unplugin, embed, `@conciv/plugin-testkit` or any plugin.
- **A test that starts a real engine** lives in core (`packages/core/test`) or in a package above core (cli, unplugin,
  a plugin's own `test/engine.ts`). It gets the engine from `@conciv/core/testing`.
- **The test kits are leaves.**
  - `@conciv/harness-testkit` holds fakes only: TestLLM, the scripted harness and the clock. It depends on ai, harness,
    contract and protocol, never on core.
  - `@conciv/plugin-testkit` is the light kit for plugin authors. It runs a plugin's engine half in memory through
    `plugin-host`'s `Instance.layer` with fake replacements, and `mount` renders the plugin in a fake app shell
    (`ctx.ui` from `@internal/plugin`'s `createUi`). It never depends on core, the app, harness or cli.
- **A plugin, or a built-in in `@internal/builtin-plugins`,** tests its tools, RPC and cards on the light kit. Only a
  journey that needs a real agent turn uses the real engine, through the package's `test/engine.ts` on
  `@conciv/core/testing`.
- **A journey that needs the real app with a real engine** lives in `apps/conciv`'s browser tests (its `test/` bridge).
  The app may devDepend on the plugins those tests load, and its `src` still names no plugin. The app depends on
  `@internal/builtin-plugins` only.
- **The real built widget in a host page** is an e2e consumer app under `e2e/`.

- The file name picks the runner. `src/x.test.ts` beside `src/x.ts` runs in node; `src/x.dom.test.tsx` beside
  `src/x.tsx` runs in happy-dom; one browser-mode file per package (`*.browser.test.tsx`; `apps/conciv`: one
  `src/<area>.browser.test.tsx` per product area) runs in vitest browser mode (Chromium). Playwright Test exists
  only under `e2e/` (`conciv/playwright-test-in-e2e`). Never jsdom.
- One `vite.config.ts` per package and no `vitest*.config` file. `concivTest()` adds the test projects:
  - a package below the plugins uses `@conciv/vitest-config/test-config` (node, happy-dom and plain browser projects);
  - a plugin, `@internal/builtin-plugins` and the app use `@conciv/plugin-testkit/vitest`, which builds on the same
    defaults and adds the fake-shell browser projects.

  `conciv()` (`@conciv/unplugin`) adds nothing under vitest.

- A behaviour lives in the cheapest place that proves it, and only there: node, then happy-dom, then browser mode,
  then `e2e/` (the built bundle in a real host app, real harness CLIs). Mounted app behaviour is tested in a real browser on
  the app's own test setup (`apps/conciv/test/mount.ts` and `test/browser-engine.ts`, on `@conciv/core/testing`);
  happy-dom is for tests that mount nothing (functions, models, reducers), as opencode
  (`_ref/opencode/packages/app/happydom.ts`).
- A framework app under e2e/ holds ONE test: the user signs in and the widget opens with no error in that framework.
  It gets a second test only for something that broke in that framework, and the test title or its ledger row names
  what broke. Behaviour that needs the real built widget in a real browser but is not about a framework (reload, real
  windows and downloads, the file chooser, focus between the host page and the widget, real CLIs, the CLI binary) is
  tested once, in one host app, never per framework.
- Budgets (`conciv/test-file-budget`): never more test files than source files in a package; a node or happy-dom
  test lives beside the source it tests; one browser-mode file per package (add a `describe`, never a second file);
  a test file is at most 1,000 lines. The app is the one exception, as opencode's keeper suites
  (`_ref/opencode/packages/app/e2e/regression/`): `apps/conciv` has one browser-mode file per product area
  (`src/<area>.browser.test.tsx`), and a new case goes into its area's file.
- Test budget (`test-budget.json`, `conciv-publish check-test-budget`, CI repo checks): it counts test cases in every
  test file, beside the source or not. The budget is a review gate, not a counter to bump. Before you raise any
  number: (1) list every new test case in the package over its budget, by file and test name; (2) for each one, name
  the existing test or suite you checked and say why it does not already cover this; (3) fold it into an existing
  journey test when one fits (one journey, not one test per behaviour); (4) only a test that survives this gets a
  raised number, and the PR body carries this account, test by test, for the maintainer to approve.
- The kits. `@conciv/plugin-testkit` (plugin authors, no core): `PluginEngine` (the plugin's engine part in memory
  through `plugin-host`) and `testEffect`. `@conciv/core/testing`: the engine fixture (vitest `test.extend`) and `createHarnessEngine`, the real
  engine with a scripted chat (`engine.reply(...)` with `TestLLM` replies: `text`, `toolCall`, `failAfter`, `hang`;
  `engine.gate()` holds a reply), used by core, cli, the app and a plugin's agent-turn journeys (`test/engine.ts`).
  `config` is the product's own `ConcivConfig`; `start` is only what is not product config. `@conciv/cli/testing`:
  `cli()` and the hub fixture `test`.
  Nothing else is exported; a new kit export or option needs the maintainer's yes.
- Tests run through one runner, `@conciv/vitest-config`'s `run-tests.ts`. It starts vitest with a home of its own
  and none of the developer's secrets or `CONCIV_*` variables, and keeps the developer's Playwright browsers folder.
  - Packages below the plugins run `node node_modules/@conciv/vitest-config/src/run-tests.ts`.
  - Plugin-testkit users run its bundled copy, `node node_modules/@conciv/plugin-testkit/bin/conciv-test.js`.

  Always run the committed file, never a bin name: pnpm's repeat-install check skips relinking bins, so a bin added
  after a checkout's install is never linked there.

- A package that runs kit tests lists the kit in its own `devDependencies`. The kits never depend on a package that
  depends on them, through `dependencies`, `devDependencies` or peers: there is no loop to allow. See "Where a test
  lives" above.
- Who mounts the real app. Only `apps/conciv`'s own browser tests, through `apps/conciv/test/mount.ts`. A plugin or
  built-in mounts its own browser half in the light kit's fake shell (`@conciv/plugin-testkit/browser` `mount`), never
  the app.
- Tests do what a user does: queries by role, label and text, `user-event` (never `fireEvent`, except
  `fireEvent.keyDown` with `isComposing` for the IME guard). No CSS, DOM or geometry reads (`toHaveCSS`,
  `getComputedStyle`, `page.evaluate` reads), no class or id locators, no test-ids.
- Assert with the jest-dom matchers (`toBeVisible`, `toHaveAccessibleName`, `toBeDisabled`, ...), never
  `toBeDefined()` or `toBeTruthy()` on a Testing Library query: a `find`/`get` query already throws when nothing
  matches, so those asserts prove nothing. One visible match is `getByRole(...)` (it throws on two) then
  `toBeVisible()`. The kit loads the matchers in happy-dom and their types come with `@conciv/plugin-testkit`;
  browser mode uses vitest's own.
- No mocks or stubs (`vi.fn`, `vi.mock`, `vi.spyOn`, `vi.stubGlobal`, `vi.stubEnv`, fake modules). A fake is a real
  implementation the product accepts (the scripted harness, an in-memory draft store). Config goes through Effect
  `ConfigProvider`, never env writes.
- No sleeps and no per-call timeouts. A product timer a test must cross becomes an option the product reads, default
  unchanged; fake timers are allowed.
- One `describe` per user flow, consecutive steps in one test; inputs as `it.each` tables. A test is never written per
  old test or per spec line.
- Tests never write app state outside their temp dirs, and never add `afterEach`/`onTestFinished` for kit resources:
  the kit cleans up.
- The calm perf gate (frame-gap budgets) is `pnpm --filter @conciv/app test:perf`, kept out of `pnpm test`;
  run it locally in Chromium and Firefox before merging a chat-plane change.
- Flame graph of a slow test: run it through the bin with `CONCIV_TEST_CPU_PROF=<folder>`
  (`CONCIV_TEST_CPU_PROF=/tmp/prof node node_modules/@conciv/vitest-config/src/run-tests.ts <file>`); every test process
  writes a `.cpuprofile` there. Open it in Chrome DevTools (Performance, Load profile) or speedscope.
- `e2e/` suites load the PREBUILT bundle (`packages/embed/dist/conciv-widget.global.js`): rebuild it
  (`pnpm turbo run build --filter=@conciv/embed`) before running them, or you test stale code. Use
  `browser.newPage()`, not `newContext()` (contexts leak and spike CPU/memory), and never wait for Playwright
  `networkidle` on a page with the live widget: its stream keeps the network busy forever; wait for
  `domcontentloaded` (or a UI signal).
- Never add tests under `apps/examples/*`: example apps are demos; verify behavior via the owning
  package's tests, `@conciv/plugin-testkit`, or an `e2e/` consumer app. Sanctioned exception:
  `apps/examples/tanstack-start` carries a handful of demo tests so the in-chat test runner has
  something to run out of the box; they are demo content, not behavior verification.
- zod validates every untrusted input where it enters: RPC procedures declare `oc.input(...)` in
  `packages/contract/src/contract.ts`; plain Hono routes zod-parse each piece they read (body,
  params, query, headers), e.g. `ChunkFileSchema.safeParse(c.req.param('file'))` in
  `packages/core/src/api/widget-page.ts`.

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
- EVERY PR that changes published packages (including `apps/conciv`, which ships inside `@conciv/embed`)
  needs a changeset or the `no-changeset` label — CI `check-changesets --require-coverage` blocks
  otherwise. Verify locally before handoff:
  `pnpm exec conciv-publish check-changesets --require-coverage --base origin/main`.
- Adding a new PUBLISHED package (`private` unset/false)? Add its name to `PUBLIC_PACKAGES` in
  `packages/publish/src/guards.ts` or `assertPublicSet` aborts the release on drift; give it
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
- Built-ins and served plugins draw differently.
  - A built-in (page's and terminal's browser halves) lives in `@internal/builtin-plugins`, is bundled into the app,
    and imports the UI kits directly, as opencode's `gui-plugins` do. Its engine half lives in its own package, with a
    pure `./rpc`.
  - A served plugin never imports a kit (`conciv-publish check-plugin-ui-kit`). It draws through `ctx.ui`, and a
    first-party served plugin reads the app's extra members with `OpaqueUi.toInternal(ctx.ui)` from
    `@internal/plugin`.
- Whiteboard (TanStack DB collections): never write to the db inside a collection subscription,
  effect, or render body: it triggers a re-render storm. Writes go in event handlers only.
- The widget bundle must externalize the shared Ark/Solid deps; a second bundled copy splits the
  Solid/Ark context and plugin popovers render at 0,0. Guarded by the mount-externals build test (`packages/embed/src/mount-impl.test.ts`);
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
