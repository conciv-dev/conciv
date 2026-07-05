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
- Dev loop (`pnpm dev`): widget/UI edits only need a browser hard reload; edits to core, harness, or
  tool packages need the dev server restarted — a reload alone runs stale server code.
- On large commits the prek hook can abort with a `next-index-*.lock.lock` error (file-lock race).
  Recover by running `pnpm format` manually, then `git commit --no-verify`.
- Never kill a dev server with `kill $(lsof -ti tcp:PORT)` — that also matches the user's connected
  browser and kills their tab. Use `lsof -ti tcp:PORT -sTCP:LISTEN` (or `pkill -f vite`).

## Code style

- Functions, not classes. (Sole exception: the `BaseTextAdapter` subclass in
  `packages/harness/src/_shared/text-adapter.ts`, which the library's typing forces.)
- No IIFEs unless explicitly required.
- Zero code comments in TS/JS (only tool directives like `@ts-`/`eslint-` survive). The
  `conciv/no-comments` lint rule autofix-DELETES anything else — don't write comments and let lint
  strip them; write self-explanatory code.
- TypeScript is strict (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, NodeNext). Avoid
  `any`/`as`/`@ts-ignore`.
- oxfmt: no semicolons, single quotes, no bracket spacing, trailing commas, printWidth 120.

## Testing

- Widget UI is tested in a REAL browser (Playwright/Chromium), never jsdom/happy-dom.
- Widget integration tests load the PREBUILT bundle (`packages/widget/dist/conciv-widget.global.js`):
  rebuild the widget (`pnpm turbo run build --filter=@conciv/widget`) before running them, or you test
  stale code.
- In widget ITs use `browser.newPage()`, not `newContext()` (contexts leak and spike CPU/memory).
- Never add tests under `apps/examples/*` — example apps are demos; verify behavior via the owning
  package's tests or `@conciv/extension-testkit`.
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

## Harness & runner adapters

- `HarnessAdapter` is capability-typed (`packages/protocol/src/harness-types.ts`): `transcriptHistory:
true` ⇒ `history` required; `compaction: true` ⇒ `buildCompactArgs` required — enforced at compile
  time. Add a harness by satisfying the capability contract; never special-case a CLI in core/widget.
- Test runners follow the same registry/stub pattern.

## Extension landmines

- Whiteboard (Jazz CRDT): never write to the db inside a `subscribe`/`useAll` callback, effect, or
  render body — it triggers a re-render storm. Writes go in event handlers only.
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
