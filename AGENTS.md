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

- pnpm (exact version pinned in root `package.json` `packageManager`), Node >= 22. Monorepo orchestrated by turbo.
- Build: `pnpm build`. Typecheck: `pnpm typecheck`. Test: `pnpm test`. Lint: `pnpm lint`
  (oxlint). Format: `pnpm format:check` / `pnpm format` (oxfmt).
- `pnpm test` builds first (`turbo run test` dependsOn `build`). Don't hand-rebuild `dist/` — use turbo.
- Commit hooks: `prek` (devDep `@j178/prek`, config `.pre-commit-config.yaml`) runs oxfmt + oxlint on
  staged files. `pnpm install` auto-activates the hook via the `prepare` script — no per-clone step.
  Whole-project gates (typecheck/build/test) are not in hooks — run them manually.
- Dev loop (`pnpm dev`): browser packages (ui-kits, solid libs, client/grab/page/storage-history)
  hot-serve from source in vite hosts — edit and reload, no rebuild. Mechanism: the conciv plugin's
  `resolveId` maps a workspace-resolved `@conciv/*` dist entry to its `src/` sibling
  (`concivSrcEntry` in extension-compiler) and solid-compiles the TSX (`isConcivSrcTsx`); manifests
  stay plain dist exports, so tsc, node, and non-vite bundlers (Turbopack in the nextjs example)
  resolve dist. `@conciv/extension` (shared singleton) and node-side packages (core, harness,
  tools, plugin) always resolve dist: rebuild embed for widget-shell edits, restart the dev server
  for server-side edits. NEW UnoCSS utility classes added in ui-kit src need an embed rebuild to
  appear (css is generated at embed build).
- On large commits the prek hook can abort with a `next-index-*.lock.lock` error (file-lock race).
  Recover by running `pnpm format` manually, then `git commit --no-verify`.
- Never kill a dev server with `kill $(lsof -ti tcp:PORT)` — that also matches the user's connected
  browser and kills their tab. Use `lsof -ti tcp:PORT -sTCP:LISTEN` (or `pkill -f vite`).

## Code style

- Functions, not classes. (Sole exception: the `BaseTextAdapter` subclass behind `makeTextAdapter`
  in `packages/harness/src/_shared/text-adapter.ts`, which the library's typing forces.)
- No IIFEs unless explicitly required.
- Zero code comments in TS/JS (only tool directives like `@ts-`/`eslint-` survive). The
  `conciv/no-comments` lint rule autofix-DELETES anything else — don't write comments and let lint
  strip them; write self-explanatory code.
- TypeScript is strict (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, NodeNext). Avoid
  `any`/`as`/`@ts-ignore`.
- oxfmt: no semicolons, single quotes, no bracket spacing, trailing commas, printWidth 120.

## Testing

- Widget UI is tested in a REAL browser (Playwright/Chromium), never jsdom/happy-dom.
- Widget integration tests load the PREBUILT bundle (`packages/embed/dist/conciv-widget.global.js`):
  rebuild it (`pnpm turbo run build --filter=@conciv/embed`) before running them, or you test
  stale code.
- In widget ITs use `browser.newPage()`, not `newContext()` (contexts leak and spike CPU/memory).
- Never add tests under `apps/examples/*` — example apps are demos; verify behavior via the owning
  package's tests, `@conciv/extension-testkit`, or an `e2e/` consumer app.
- Every Solid package's `vitest.config.ts` must pin `test: {environment: 'node'}` —
  `vite-plugin-solid` otherwise injects a jsdom environment and the run exits 1 even with all tests
  passing.
- Never wait for Playwright `networkidle` on a page with the live widget — its SSE stream keeps the
  network busy forever; wait for `domcontentloaded` (or a UI signal) instead.
- zod validates every HTTP boundary (`readValidatedBody`); add validation for new routes.

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
  API and never "unused" — don't delete those. CI builds packages first so `@conciv/*` imports resolve
  against their dist-only exports; don't re-add an `ignoreUnresolvedImports: @conciv/*` hack.

## Releasing (npm publish)

- Publishing is CI-only, via OIDC trusted publishing (`.github/workflows/release.yml` runs
  `changesets/action` with `id-token: write`, `NPM_TOKEN` empty). There is NO npm token for humans —
  running `pnpm release` locally 404s (`E404` on the registry PUT). Never publish from a laptop.
- The flow, end to end:
  1. Land a PR that adds a changeset (`pnpm changeset`, or hand-write `.changeset/<name>.md`). Do NOT
     run `release:version` or `release` yourself — those are the CI steps.
  2. On merge to `main`, `changesets/action` opens a `chore: version packages` PR that runs
     `pnpm release:version` (consumes changesets → bumps versions + CHANGELOGs, resyncs the lockfile).
  3. Merging that version PR triggers `pnpm release` in CI: `turbo run build publint attw`, then
     `changeset publish` to npm with provenance.
- All `@conciv/*` share ONE version: `.changeset/config.json` sets `fixed: [["@conciv/*"]]`, so a single
  changeset bumps the whole set in lockstep (currently the 0.0.x patch line). One changeset entry naming
  any `@conciv/*` package is enough to release them all.
- Adding a new PUBLISHED package (`private` unset/false)? Add its name to `PUBLIC_PACKAGES` in
  `packages/publish/src/guards.ts` or `assertPublicSet` aborts the release on drift; give it
  `homepage: https://conciv.dev` + a `repository` block with its `directory` (matches every public manifest).
- Before opening a release PR: `pnpm typecheck && pnpm build && pnpm test`, run
  `pnpm exec fallow audit --changed-since main --format json` and fix anything INTRODUCED (see the fallow
  section). `pnpm release:check` (build + publint + attw) mirrors the CI validate step locally.

## Harness & runner adapters

- A harness is `chatConfig(deps)` returning a published `@tanstack/ai-*` text adapter (+ optional
  `modelOptions`/`prepareMessages`) plus sidecars (`models`, `history`, `launch`, `tty`, `commands`).
  Turns run through `chat()` with the conciv sandbox + permission-gate middleware; never spawn or
  decode a CLI yourself, and never special-case a CLI in core/widget.
- `HarnessAdapter` is capability-typed (`packages/protocol/src/harness-types.ts`): `transcriptHistory:
true` ⇒ `history` required; `slashCommands` ≠ `'none'` ⇒ `commands` required — enforced at compile
  time. Add a harness by satisfying the capability contract.
- Harness workdirs are sandbox-virtual: the local-process sandbox root IS the cwd and adapters
  default to `/workspace`. Never pass a host-absolute cwd into an adapter config — it nests a junk
  `Users/...` tree inside the workspace and runs the CLI there.
- Test runners follow the same registry/stub pattern.

## Extension landmines

- Whiteboard (TanStack DB over libSQL): never write to the db inside a collection subscription,
  effect, or render body — it triggers a re-render storm. Writes go in event handlers only.
- The widget bundle must externalize every `@conciv/extension/*` subpath and shared Ark/Solid deps;
  a second bundled copy splits the Solid/Ark context and extension popovers render at 0,0. Guarded
  by the mount-externals build test — don't weaken it.

## Security & safety

- The core dev server binds `127.0.0.1` only. Never commit or log credentials/tokens.
- Risky Bash from the agent is gated (`packages/core/src/api/chat/permission.ts` +
  `packages/core/src/policy/command-policy.ts`) — read-only commands auto-allow, everything else
  asks. Keep that policy conservative when editing it.

## Project status

- Pre-release (v0), no external users: reshape internal APIs freely and update all call sites; no
  back-compat shims.
