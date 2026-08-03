# conciv init Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npx conciv@latest init` sets a project up for conciv end to end — detects framework + package manager + installed harnesses, installs `@conciv/it`, wires the bundler/framework files via confidence-gated codemods, teaches every consented agent harness the conciv CLI (claude additionally gets its native plugin), and prints exactly what happened.

**Architecture:** A new `init` subcommand in `packages/cli` (citty, sibling of `tools`), built as a pipeline of self-contained step modules, each `{id, detect, plan, apply, verify, manualCard}`. The runner owns ordering, `--dry-run`, and the done/already/manual/skipped ledger (failures degrade to manual cards per spec decision 7 — there is no terminal 'failed' state). Framework codemods apply only on exact-shape matches; anything unrecognized degrades to a styled snippet card and the run still exits 0. Harness wiring is CLI-first: agents use `conciv tools` directly; only claude gets a deeper (plugin) integration.

**Tech Stack:** citty ^0.2.2 (already in packages/cli), @clack/prompts ^1.7.0 (version precedent: packages/try), nypm (new), consola (new), codemod engine chosen by spike in Task 8 (@ast-grep/napi vs magicast).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-01-conciv-init-design.md` — decisions there are settled; do not relitigate.
- Zero code comments; no `any`/`as`/IIFE/classes; oxfmt style (no semicolons, single quotes, printWidth 120). TS strict, NodeNext.
- Node >= 22, pnpm workspace, turbo. `pnpm test` builds first.
- Tests: node-environment vitest for all pipeline/codemod work (`test: {environment: 'node'}`); NO predicate-polling helpers (`until`-style banned; `conciv/no-timers-in-tests` lint rule is live in test globs); no mocks of product code — fixture dirs + PATH-shim fakes per harness-testkit conventions.
- Never print raw `npm install` at the user — nypm resolves the project's package manager.
- Init never boots the user's app, never starts an agent session, never writes user-global config (project-scoped only; claude goes through its native plugin manager with `--scope local`).
- Idempotency: every step's `detect` must recognize its own prior output and report "already wired" without editing.
- Dirty git tree ⇒ hard abort unless `--force` (preflight); `--yes` accepts all detected defaults; `--dry-run` prints the plan, touches nothing, exits 0.
- Package naming: bare npm name `conciv` (Task 14) requires touching `packages/publish/src/guards.ts` — `assertValidPackageName` currently rejects non-`@conciv/*` names; the relaxation is explicit and allowlisted to exactly `conciv`.
- New runtime deps for the CLI package were user-approved as a class: @clack/prompts, nypm, consola, codemod engine.

## File Structure

```
packages/cli/src/
  bin.ts                    (modify: register init subcommand)
  init.ts                   (citty command definition; flags --yes --dry-run --force)
  init/
    pipeline.ts             (step contract + runner + ledger)
    preflight.ts            (package.json, git state, abort semantics)
    detect.ts               (framework + package manager detection)
    harness-detect.ts       (installed-harness scan)
    wizard.ts               (clack confirm/multiselect; --yes bypass)
    cards.ts                (manual snippet-card rendering, consola theming)
    outro.ts                (done/already/manual/skipped summary + next steps)
    steps/
      install-it.ts         (nypm addDevDependency @conciv/it)
      framework/
        engine.ts           (codemod engine facade — chosen in Task 8)
        vite.ts             (vite.config plugins[] insertion)
        nextjs.ts           (withConciv wrapper + instrumentation files)
        webpack-family.ts   (webpack/rspack: config codemod + widgetUrl card)
        fallback.ts         (rollup/esbuild/unknown → card only)
      harness/
        claude.ts               (native plugin-manager install — the only MCP-wired harness)
        consent.ts              (.conciv/harnesses.json consent record)
        agents-md.ts            (marked AGENTS.md/CLAUDE.md section teaching conciv tools)
packages/cli/test/
  init-pipeline.test.ts
  init-preflight.test.ts
  init-detect.test.ts
  init-harness-detect.test.ts
  init-cards.test.ts
  steps/install-it.test.ts
  steps/framework/*.test.ts (per transform, fixture-driven)
  steps/harness/*.test.ts   (PATH-shim fakes)
  fixtures/                 (seeded from e2e/* configs + hand-made weird shapes)
```

---

### Task 1: init command skeleton + flags

**Files:**

- Create: `packages/cli/src/init.ts`
- Modify: `packages/cli/src/bin.ts` (add `init` to `subCommands`)
- Test: `packages/cli/test/init-command.test.ts`

**Interfaces:**

- Consumes: `runInit` from `init/pipeline.ts` (Task 2) — until Task 2 lands, `init.ts` calls a local `runInit` stub defined in the same file returning `{outcome: 'done', steps: []}`.
- Produces: `initCommand` (citty `defineCommand`) with args `yes: boolean`, `dryRun: boolean`, `force: boolean`; exported for `bin.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest'
import {initCommand} from '../src/init.js'

describe('init command', () => {
  it('declares the three flags with kebab-case names', () => {
    const args = initCommand.args
    expect(args).toMatchObject({
      yes: {type: 'boolean', default: false},
      'dry-run': {type: 'boolean', default: false},
      force: {type: 'boolean', default: false},
    })
  })

  it('registers under the root command', async () => {
    const {main} = await import('../src/bin.js')
    const subCommands = await Promise.resolve(main.subCommands)
    expect(Object.keys(subCommands ?? {})).toContain('init')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @conciv/cli exec vitest run test/init-command.test.ts`
Expected: FAIL — `Cannot find module '../src/init.js'`

- [ ] **Step 3: Implement**

`packages/cli/src/init.ts`:

```ts
import {defineCommand} from 'citty'

export type InitFlags = {yes: boolean; dryRun: boolean; force: boolean}

export const initCommand = defineCommand({
  meta: {name: 'init', description: 'Set this project up for conciv: install, wire the bundler, connect your agents.'},
  args: {
    yes: {type: 'boolean', default: false, description: 'accept every detected default (no prompts)'},
    'dry-run': {type: 'boolean', default: false, description: 'print the plan without touching anything'},
    force: {type: 'boolean', default: false, description: 'run even with uncommitted git changes'},
  },
  run: async ({args}) => {
    const {runInit} = await import('./init/pipeline.js')
    await runInit({yes: args.yes, dryRun: args['dry-run'], force: args.force, cwd: process.cwd()})
  },
})
```

`bin.ts`: change `subCommands: {tools: toolsCommand}` to `subCommands: {tools: toolsCommand, init: initCommand}` and export `main` if not already exported (it is defined as `main` today — add `export`). Until Task 2 exists, create `packages/cli/src/init/pipeline.ts` with the minimal shape below (Task 2 replaces its body):

```ts
export type StubLedgerEntry = {id: string; title: string; status: string}

export type InitOptions = {yes: boolean; dryRun: boolean; force: boolean; cwd: string}

export async function runInit(options: InitOptions): Promise<StubLedgerEntry[]> {
  void options
  return []
}
```

(Task 2 replaces this file wholesale, including swapping `StubLedgerEntry` for the real `LedgerEntry` — the stub exists only so Task 1 compiles alone.)

(`runInit` returns the ledger so the Task 14 end-to-end assertions read it directly; the Task 2 rework keeps this return type.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @conciv/cli exec vitest run test/init-command.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/init.ts packages/cli/src/init/pipeline.ts packages/cli/src/bin.ts packages/cli/test/init-command.test.ts
git commit -m "feat(cli): register the conciv init subcommand"
```

### Task 2: pipeline runner + ledger

**Files:**

- Create: `packages/cli/src/init/pipeline.ts` (replace Task 1 stub)
- Test: `packages/cli/test/init-pipeline.test.ts`

**Interfaces:**

- Produces (later tasks build on these exact shapes):

```ts
export type StepStatus = 'done' | 'already' | 'manual' | 'skipped'
export type ManualCard = {title: string; body: string; snippet?: string}
export type StepOutcome =
  | {status: 'done'}
  | {status: 'skipped'; detail?: string}
  | {status: 'manual'; cards: ManualCard[]; detail?: string}
export type StepPlan = {summary: string; wouldEdit: string[]}
export type InitStep = {
  id: string
  title: string
  detect: (ctx: InitContext) => Promise<'missing' | 'present'>
  plan: (ctx: InitContext) => Promise<StepPlan>
  apply: (ctx: InitContext) => Promise<StepOutcome>
  verify: (ctx: InitContext) => Promise<boolean>
  manualCard: (ctx: InitContext) => ManualCard
}
export type InitContext = {cwd: string; yes: boolean; dryRun: boolean; report: (line: string) => void}
export type LedgerEntry = {id: string; title: string; status: StepStatus; cards: ManualCard[]; detail?: string}
export async function runSteps(steps: InitStep[], ctx: InitContext): Promise<LedgerEntry[]>
```

- Semantics under test (SPEC decision 7: every mid-pipeline failure degrades to its manual card, run continues, exit 0 — there is NO 'failed' terminal status, failure detail rides on a `manual` entry): `detect() === 'present'` ⇒ status `already`, `apply` never called. `dryRun` ⇒ every missing step reports its `plan().summary`, status `skipped`, nothing applied. `apply` throwing ⇒ status `manual` with `cards: [step.manualCard(ctx)]` and the error message as `detail`, pipeline CONTINUES. `apply` returning `manual` carries its own cards through; `apply` returning `skipped` (a step declaring itself not applicable — e.g. claude without consent) passes through as `skipped` with no verify. `verify() === false` after a `done` apply ⇒ status `manual` with the step's manualCard and detail `'verification failed'`.

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest'
import {runSteps, type InitContext, type InitStep} from '../src/init/pipeline.js'

const ctx = (over: Partial<InitContext> = {}): InitContext => ({
  cwd: '/tmp/nowhere',
  yes: true,
  dryRun: false,
  report: () => {},
  ...over,
})

const step = (over: Partial<InitStep>): InitStep => ({
  id: 'x',
  title: 'X',
  detect: async () => 'missing',
  plan: async () => ({summary: 'would do x', wouldEdit: []}),
  apply: async () => ({status: 'done'}),
  verify: async () => true,
  manualCard: () => ({title: 'Wire X by hand', body: 'add x to your config'}),
  ...over,
})

describe('runSteps', () => {
  it('skips apply for already-wired steps', async () => {
    let applied = false
    const entries = await runSteps(
      [step({detect: async () => 'present', apply: async () => ((applied = true), {status: 'done'})})],
      ctx(),
    )
    expect(applied).toBe(false)
    expect(entries[0]?.status).toBe('already')
  })

  it('degrades a throwing step to its manual card and continues', async () => {
    const entries = await runSteps(
      [step({id: 'boom', apply: async () => Promise.reject(new Error('nope'))}), step({id: 'after'})],
      ctx(),
    )
    expect(entries.map((entry) => entry.status)).toEqual(['manual', 'done'])
    expect(entries[0]?.cards[0]?.title).toBe('Wire X by hand')
    expect(entries[0]?.detail).toBe('nope')
  })

  it('dry-run plans without applying', async () => {
    let applied = false
    const lines: string[] = []
    const entries = await runSteps(
      [step({apply: async () => ((applied = true), {status: 'done'})})],
      ctx({dryRun: true, report: (line) => lines.push(line)}),
    )
    expect(applied).toBe(false)
    expect(entries[0]?.status).toBe('skipped')
    expect(lines.join('\n')).toContain('would do x')
  })

  it('degrades to the manual card when verify rejects the result', async () => {
    const entries = await runSteps([step({verify: async () => false})], ctx())
    expect(entries[0]?.status).toBe('manual')
    expect(entries[0]?.cards[0]?.title).toBe('Wire X by hand')
    expect(entries[0]?.detail).toBe('verification failed')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @conciv/cli exec vitest run test/init-pipeline.test.ts`
Expected: FAIL — `runSteps` not exported

- [ ] **Step 3: Implement `runSteps`**

```ts
export async function runSteps(steps: InitStep[], ctx: InitContext): Promise<LedgerEntry[]> {
  const entries: LedgerEntry[] = []
  for (const current of steps) {
    entries.push(await runOne(current, ctx))
  }
  return entries
}

async function runOne(step: InitStep, ctx: InitContext): Promise<LedgerEntry> {
  const found = await step.detect(ctx).catch(() => 'missing' as const)
  if (found === 'present') return {id: step.id, title: step.title, status: 'already', cards: []}
  if (ctx.dryRun) {
    const planned = await step.plan(ctx)
    ctx.report(`${step.title}: ${planned.summary}`)
    return {id: step.id, title: step.title, status: 'skipped', cards: []}
  }
  const outcome = await step.apply(ctx).catch((error: unknown) => manualOutcome(step, ctx, error))
  if (outcome.status === 'skipped')
    return {id: step.id, title: step.title, status: 'skipped', cards: [], detail: outcome.detail}
  if (outcome.status === 'manual')
    return {id: step.id, title: step.title, status: 'manual', cards: outcome.cards, detail: outcome.detail}
  const verified = await step.verify(ctx).catch(() => false)
  if (!verified)
    return {
      id: step.id,
      title: step.title,
      status: 'manual',
      cards: [step.manualCard(ctx)],
      detail: 'verification failed',
    }
  return {id: step.id, title: step.title, status: 'done', cards: []}
}

function manualOutcome(step: InitStep, ctx: InitContext, error: unknown): StepOutcome {
  const detail = error instanceof Error ? error.message : String(error)
  return {status: 'manual', cards: [step.manualCard(ctx)], detail}
}
```

(`runInit` stays a thin assembly function; it grows as steps land in later tasks — after this task it runs an empty step list and returns.)

- [ ] **Step 4: Run test to verify it passes** — same command, PASS.
- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/init/pipeline.ts packages/cli/test/init-pipeline.test.ts
git commit -m "feat(cli): init pipeline runner with manual-card degradation ledger"
```

### Task 3: preflight

**Files:**

- Create: `packages/cli/src/init/preflight.ts`
- Test: `packages/cli/test/init-preflight.test.ts`

**Interfaces:**

- Produces: `preflight(cwd: string, force: boolean): Promise<{ok: true} | {ok: false; reason: string}>` — checks in order: `package.json` exists in cwd (reason `'no package.json here — run init from your app directory'`); `git status --porcelain` empty unless `force` (reason `'uncommitted changes — commit first or pass --force'`); a non-git directory is NOT an error (init still works, the dirty-tree guard just doesn't apply).
- Test style: real temp dirs (`fs.mkdtemp`), real `git init` + file writes; no mocks.

- [ ] **Step 1: Failing test** — four cases: no package.json ⇒ refused; clean git repo with package.json ⇒ ok; dirty repo ⇒ refused; dirty repo + force ⇒ ok. Use `execFileSync('git', ['init'], {cwd: dir})` and write files with `writeFileSync`; assert exact `reason` strings above.

```ts
import {execFileSync} from 'node:child_process'
import {mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {preflight} from '../src/init/preflight.js'

const dir = (): string => mkdtempSync(join(tmpdir(), 'conciv-init-'))

describe('preflight', () => {
  it('refuses without package.json', async () => {
    expect(await preflight(dir(), false)).toEqual({
      ok: false,
      reason: 'no package.json here — run init from your app directory',
    })
  })
  it('accepts a clean repo (file committed, not just written)', async () => {
    const cwd = dir()
    writeFileSync(join(cwd, 'package.json'), '{}')
    execFileSync('git', ['init'], {cwd})
    execFileSync('git', ['add', 'package.json'], {cwd})
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'seed'], {cwd})
    expect(await preflight(cwd, false)).toEqual({ok: true})
  })
  it('refuses untracked, staged, and unstaged dirt; force overrides each', async () => {
    const cwd = dir()
    writeFileSync(join(cwd, 'package.json'), '{}')
    execFileSync('git', ['init'], {cwd})
    const refused = {ok: false, reason: 'uncommitted changes — commit first or pass --force'}
    expect(await preflight(cwd, false)).toEqual(refused)
    execFileSync('git', ['add', 'package.json'], {cwd})
    expect(await preflight(cwd, false)).toEqual(refused)
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'seed'], {cwd})
    writeFileSync(join(cwd, 'package.json'), '{"name":"edited"}')
    expect(await preflight(cwd, false)).toEqual(refused)
    expect(await preflight(cwd, true)).toEqual({ok: true})
  })
})
```

- [ ] **Step 2: Run, expect FAIL** (`preflight` missing).
- [ ] **Step 3: Implement** with `existsSync` + `execFile('git', ['status', '--porcelain'])`; treat git exit-failure (not a repo) as clean.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(cli): init preflight — package.json + clean-tree gates`

### Task 4: framework + package-manager detection

**Files:**

- Create: `packages/cli/src/init/detect.ts`
- Test: `packages/cli/test/init-detect.test.ts`

**Interfaces:**

- Produces:

```ts
export type Framework = 'nextjs' | 'vite' | 'webpack' | 'rspack' | 'rollup' | 'esbuild' | 'unknown'
export type Detected = {framework: Framework; configFile: string | null; packageManager: string}
export function detectFramework(cwd: string): {framework: Framework; configFile: string | null}
export async function detectProject(cwd: string): Promise<Detected>
```

- Rules (from the quick-start set): read `package.json` deps+devDeps; precedence `next` > `vite` > `@rspack/core|@rspack/cli` > `webpack` > `rollup` > `esbuild` > `unknown`. `configFile` = first existing of the framework's conventional names (`next.config.ts|js|mjs`, `vite.config.ts|js|mts|mjs`, `webpack.config.js|ts`, `rspack.config.js|ts`, `rollup.config.js|mjs`, none for esbuild). Package manager via nypm's `detectPackageManager(cwd)` (fallback `'npm'`).

- [ ] **Step 1: Failing test** — fixture temp dirs: next+vite both present picks nextjs; vite project with `vite.config.mts` returns that filename; deps-less package.json ⇒ unknown/null; a dir with `packageManager: "pnpm@10.0.0"` field detects pnpm (nypm honors the field).
- [ ] **Step 2: FAIL run.**
- [ ] **Step 3: Implement** (pure fs reads; nypm added to `packages/cli/package.json` dependencies in this commit — latest stable version).
- [ ] **Step 4: PASS run.**
- [ ] **Step 5: Commit** `feat(cli): detect the project's framework and package manager`

### Task 5: harness detection

**Files:**

- Create: `packages/cli/src/init/harness-detect.ts`
- Test: `packages/cli/test/init-harness-detect.test.ts`

**Interfaces:**

- Produces:

```ts
export type HarnessId = 'claude' | 'codex' | 'opencode' | 'pi'
export type FoundHarness = {id: HarnessId; via: 'path' | 'config'}
export function detectHarnesses(env: {PATH: string; HOME: string}): FoundHarness[]
```

- Rules: binary on PATH (walk `PATH` dirs, `existsSync(join(dir, bin))` with the exec bit — bins: `claude`, `codex`, `opencode`, `pi`) OR config marker under HOME (`.claude/`, `.codex/`, `.config/opencode/`, `.pi/`). PATH hit wins the `via` label. gemini is deliberately absent (spec: recipe slot reserved, resume broken upstream).
- Test style: temp HOME + temp PATH dir with shim files (`writeFileSync` + `chmodSync 0o755`) — the PATH-shim fake pattern from harness-testkit. No mocking of `process.env`; pass `env` explicitly.

- [ ] **Step 1: Failing test** — shim `claude` on PATH ⇒ `[{id: 'claude', via: 'path'}]`; empty PATH + `~/.codex` dir ⇒ `[{id: 'codex', via: 'config'}]`; both mechanisms for one harness ⇒ single entry `via: 'path'`; nothing ⇒ `[]`.
- [ ] **Step 2: FAIL.** **Step 3: Implement.** **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(cli): detect installed agent harnesses by PATH and config markers`

### Task 6: wizard + cards + outro (the UX shell)

**Files:**

- Create: `packages/cli/src/init/wizard.ts`, `packages/cli/src/init/cards.ts`, `packages/cli/src/init/outro.ts`
- Test: `packages/cli/test/init-cards.test.ts`

**Interfaces:**

- `wizard.ts` produces `confirmSelections(found: {framework: Framework; harnesses: FoundHarness[]}, yes: boolean): Promise<{framework: boolean; harnesses: HarnessId[]} | 'cancelled'>` — with `yes: true` it returns everything selected WITHOUT importing @clack (pure); interactive path uses `@clack/prompts` `intro`/`multiselect` (harnesses pre-checked) /`confirm`. `isCancel` ⇒ `'cancelled'`.
- `cards.ts` produces `renderCard(card: ManualCard): string` — bordered box, title, body, fenced snippet; plain string so tests assert content, consola only at the call site.
- `outro.ts` produces `renderOutro(entries: LedgerEntry[], next: string[]): string` — groups by status with counts, lists every card from each entry's `cards` array, then `Next steps:` lines (`pnpm dev` etc., package-manager-aware run command passed in by the caller).
- Wizard cancellation (`isCancel`) is a CLEAN NO-OP: print "nothing changed", exit 0 (the spec's only hard-abort paths stay preflight failures).
- Live checklist UX: each pipeline step renders a named clack spinner line that resolves to a per-step check/cross/skip glyph (the shadcn per-step succeed/fail pattern) — one line per step, never a single opaque spinner.
- Deps added this commit: `@clack/prompts@^1.7.0`, `consola` (latest stable) to `packages/cli/package.json`.

- [ ] **Step 1: Failing test** — `renderCard` output contains title, body, and snippet lines; `renderOutro` with one done + two-cards-manual + one skipped prints `1 done`, `1 manual`, `1 skipped` and BOTH card bodies; `confirmSelections(..., true)` resolves all-selected without prompting (assert no TTY needed by running in the plain vitest env).
- [ ] **Step 2: FAIL.** **Step 3: Implement.** **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(cli): init wizard, manual cards, and outro summary`

### Task 7: install step (`@conciv/it` via nypm)

**Files:**

- Create: `packages/cli/src/init/steps/install-it.ts`
- Test: `packages/cli/test/steps/install-it.test.ts`

**Interfaces:**

- Produces `installItStep(): InitStep` with `id: 'install'`. `detect`: `present` when `@conciv/it` appears in the project's package.json dependencies or devDependencies. `apply`: `nypm.addDevDependency('@conciv/it', {cwd, silent: true})`; failure card says to run the manager-appropriate add command (`nypm` exposes the detected manager name for the card text). `verify`: re-read package.json.
- Test style: real temp project with a minimal package.json and a stub registry is NOT available — so `apply` is exercised against a temp dir with `nypm`'s `workspace` off and network denied? No: keep the REAL call but point it at a local `file:` target — create the temp project, run `apply` with an injected `add` function ONLY at the test seam already offered by nypm? nypm has no injection seam. Resolution: split the step so the pure parts are testable and the nypm call stays thin: `install-it.ts` exports `hasIt(pkg: PackageJson): boolean` and `installItStep(add: AddDep = nypmAdd)` where `type AddDep = (name: string, opts: {cwd: string}) => Promise<void>`; the default is the real nypm call; tests pass a recording `add` that writes the dep into package.json (this is dependency injection of a boundary function, not a mock of product code — same pattern as `openTerminal` injection in core).

- [ ] **Step 1: Failing test** — `detect` present/missing on real package.json files; `apply` with recording `add` transitions detect to `present` and `verify` true; recording `add` that throws ⇒ outcome `manual` with a card naming the add command.
- [ ] **Step 2: FAIL.** **Step 3: Implement.** **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(cli): init step — install @conciv/it with the project's package manager`

### Task 8: codemod engine spike + decision (fixture corpus first)

**Files:**

- Create: `packages/cli/test/fixtures/` — copy the REAL config files (only the configs, not whole apps) from `e2e/vite-react/vite.config.ts`, `e2e/vite-vanilla/vite.config.ts`, `e2e/solid-start/vite.config.ts`, `e2e/svelte/vite.config.ts`, `e2e/tanstack-start/vite.config.ts`, `e2e/astro/astro.config.mjs`, `e2e/nextjs/next.config.ts` + hand-made weird fixtures: `vite.config.no-plugins.ts` (config object without a `plugins` key), `vite.config.function.ts` (`defineConfig(() => ({...}))`), `vite.config.spread.ts` (`plugins: [...base, react()]`), `next.config.wrapped.ts` (already `withSentry(nextConfig)`), `next.config.mjs-default.mjs`.
- Create: `packages/cli/src/init/steps/framework/engine.ts`
- Test: `packages/cli/test/steps/framework/engine.test.ts`

**Interfaces:**

- Produces the engine facade the recipe tasks consume:

```ts
export type Transform = {matched: boolean; output: string | null}
export function addToPluginsArray(
  source: string,
  importName: string,
  importFrom: string,
  callExpr: string,
  opts: {importStyle: 'default' | 'named'},
): Transform
export function wrapDefaultExport(source: string, wrapperName: string, importFrom: string): Transform
```

- Contract (binding, engine-independent): `matched: false` ⇒ `output: null` and the caller emits a snippet card — never a guessed edit. Matched output preserves surrounding formatting byte-for-byte outside the edit span, is idempotent (running twice returns `matched: true` with output identical to input on the second run — detected via existing import/call), and inserts at the END of an existing `plugins: []` array.
- The SPIKE: implement `addToPluginsArray` twice — once with `@ast-grep/napi`, once with `magicast` — behind the same test file, run the corpus, and keep whichever passes more fixtures with simpler code; delete the loser in the same commit and record the choice + fixture pass-counts in the commit body. Whichever wins is added to `packages/cli/package.json` dependencies.

- [ ] **Step 1: Failing corpus test** — table-driven over every fixture: e2e-derived vite configs all `matched: true` and output contains `conciv()` appended inside `plugins: [` plus the DEFAULT import line `import conciv from '@conciv/it/plugin/vite'` (VERIFIED: `packages/it/src/plugin/vite.ts` exports default only — a named `{conciv}` import does not exist; the engine's import insertion takes an `importStyle: 'default' | 'named'` argument and every conciv recipe passes `'default'`); `vite.config.no-plugins.ts` and `vite.config.function.ts` ⇒ `matched: false, output: null` (confidence gate — these shapes are Task 9+ card material until a transform is PROVEN); re-running a matched output ⇒ idempotent. `wrapDefaultExport` over `next.config.ts` fixture wraps `export default nextConfig` into `export default withConciv(nextConfig)` with the import added; `next.config.wrapped.ts` (foreign wrapper) still matches by wrapping the existing expression: `withConciv(withSentry(nextConfig))`.
- [ ] **Step 2: FAIL.** **Step 3: Implement both candidates, decide, delete loser.** **Step 4: PASS with winner.**
- [ ] **Step 5: Commit** `feat(cli): confidence-gated codemod engine (spike-decided) with e2e-seeded fixture corpus`

### Task 9: vite-family framework step

**Files:**

- Create: `packages/cli/src/init/steps/framework/vite.ts`
- Test: `packages/cli/test/steps/framework/vite.test.ts`

**Interfaces:**

- Produces `viteStep(detected: Detected): InitStep` (`id: 'framework'`). `detect`: config file content contains `@conciv/it/plugin/vite` ⇒ `present`. `apply`: run `addToPluginsArray(source, 'conciv', '@conciv/it/plugin/vite', 'conciv()', {importStyle: 'default'})`; `matched` ⇒ back up the config file first (exit-listener restore on abnormal exit — the shadcn `restoreBackupOnExit` pattern), write, show the applied diff via `ctx.report` (unified diff of before/after); unmatched or no config file ⇒ `manual` card whose snippet is exactly the quick-start block (DEFAULT import — `@conciv/it/plugin/vite` has no named export):

```ts
import conciv from '@conciv/it/plugin/vite'
export default defineConfig({plugins: [conciv()]})
```

- `verify`: re-read + re-detect. Astro rides this step (its `astro.config.mjs` `vite: {plugins: []}` nesting is a fixture; if the transform can't prove that shape it cards — acceptable v1).

- [ ] **Step 1: Failing test** — temp project seeded from the `e2e/vite-react` fixture: apply edits the real file and detect flips to `present`; second run reports `already`; `vite.config.no-plugins.ts` project gets status `manual` with the snippet card; dry-run leaves the file untouched.
- [ ] **Step 2: FAIL.** **Step 3: Implement.** **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(cli): init wires vite configs, cards what it cannot prove`

### Task 10: nextjs framework step (three wires)

**Files:**

- Create: `packages/cli/src/init/steps/framework/nextjs.ts`
- Test: `packages/cli/test/steps/framework/nextjs.test.ts`

**Interfaces:**

- Produces `nextjsStep(detected: Detected): InitStep`. Three wires per the quick-start, each independently idempotent inside one step: (1) config wrapper via `wrapDefaultExport(source, 'withConciv', '@conciv/it/plugin/nextjs')`; (2) `instrumentation.ts` created at project root with exactly `export {register} from '@conciv/it/plugin/nextjs'` — if the file EXISTS with other content, do not edit: card it; (3) `instrumentation-client.ts` with exactly `import '@conciv/it/plugin/nextjs/widget'` — same exists ⇒ card rule. `detect` is `present` only when all three are wired; partial wiring re-runs remaining wires only.
- `apply` returns `manual` (with per-wire cards concatenated) when ANY wire carded; `done` only when all three landed.

- [ ] **Step 1: Failing test** — fixture-seeded temp project: fresh run lands all three files (assert exact instrumentation file contents); re-run ⇒ `already`; pre-existing custom `instrumentation.ts` ⇒ config wire applies, instrumentation wire cards, status `manual`; wrapped-foreign-config fixture wraps outside-in (`withConciv(withSentry(nextConfig))`).
- [ ] **Step 2: FAIL.** **Step 3: Implement.** **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(cli): init wires next.js — config wrapper, instrumentation, client widget`

### Task 11: webpack/rspack + fallback steps

**Files:**

- Create: `packages/cli/src/init/steps/framework/webpack-family.ts`, `packages/cli/src/init/steps/framework/fallback.ts`
- Test: `packages/cli/test/steps/framework/webpack-family.test.ts`

**Interfaces:**

- `webpackFamilyStep(detected: Detected): InitStep` — codemods `plugins: []` in `webpack.config.js`/`rspack.config.js` with `conciv.default()` from `@conciv/it/plugin/webpack` / `@conciv/it/plugin/rspack` (CJS `require` insertion when the config is CJS — the engine's `addToPluginsArray` handles ESM; CJS configs that don't match card out). ALWAYS appends the widgetUrl manual card (these plugins don't inject the widget — quick-start requires serving `@conciv/widget/global` and setting `widgetUrl`), so best status is `manual` by design.
- `fallbackStep(detected: Detected): InitStep` — rollup/esbuild/unknown: pure card, status `manual`, never edits. Cards carry the REAL wiring for that stack from the quick-start docs: rollup → `@conciv/it/plugin/rollup` plugin registration snippet, esbuild → `@conciv/it/plugin/esbuild` snippet (both build-only today, and the card says so plus what that means: no live widget, dev via vite recommended); unknown framework → the generic vite-based snippet with a sentence saying conciv's full experience needs one of the supported bundlers. No invented product positioning — copy mirrors `apps/site/content/docs/quick-start/*.mdx`.

- [ ] **Step 1: Failing test** — webpack fixture: matched CJS-with-plugins-array config gets the require + plugin line AND the widgetUrl card (status `manual`); rollup project ⇒ card-only, zero file writes (assert directory mtime-stable file set).
- [ ] **Step 2: FAIL.** **Step 3: Implement.** **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(cli): init webpack/rspack wiring and card-only fallbacks`

### Task 12: harness wiring — AGENTS.md teaching + consent (no MCP for non-claude)

**Files:**

- Create: `packages/cli/src/init/steps/harness/agents-md.ts`, `packages/cli/src/init/steps/harness/consent.ts`
- Test: `packages/cli/test/steps/harness/agents-md.test.ts`

**Interfaces:**

- DESIGN (user-ruled, final): non-claude harnesses get NO MCP wiring, no config files, no addresses — a codex/opencode/pi agent uses the conciv CLI directly (`conciv tools ...`), which self-describes and resolves the running dev server itself. The ONLY artifact init writes for them is the AGENTS.md teaching section. claude alone gets its native plugin (Task 13) because that integration already exists and carries session binding + hooks.
- `consent.ts`: `readConsent(cwd): HarnessId[]` / `writeConsent(cwd, ids)` over `.conciv/harnesses.json` — records which detected harnesses the user approved in the wizard multiselect; drives which harnesses Task 13 installs for (claude) and which get named in the AGENTS.md section copy.
- `agents-md.ts` produces `agentsMdStep(consented: () => HarnessId[]): InitStep` (`id: 'agents'`): a marked section between `<!-- conciv:start -->` and `<!-- conciv:end -->` appended to `AGENTS.md` (create-if-missing; mirror into `CLAUDE.md` ONLY if that file already exists), teaching: what conciv is (one line), `conciv tools --help` as the discovery entry, the three headline verbs (`conciv tools page`, `conciv tools react`, `conciv tools server`), and "needs your dev server running". Re-run replaces the marked span in place byte-preserving everything outside the markers. `detect` = markers present with current content hash; `manualCard` = the section text itself for hand-pasting.

- [ ] **Step 1: Failing test** — temp project: fresh run creates AGENTS.md with the marked section (assert exact section content); existing AGENTS.md with surrounding user text: section appended, outside text byte-identical; re-run with a stale section: replaced in place; CLAUDE.md mirrored only when pre-existing; consent round-trip + absent-file ⇒ `[]`.
- [ ] **Step 2: FAIL.** **Step 3: Implement.** **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(cli): init teaches agents conciv tools via a marked AGENTS.md section`

### Task 13: claude recipe (native plugin manager)

**Files:**

- Create: `packages/cli/src/init/steps/harness/claude.ts`
- Test: `packages/cli/test/steps/harness/claude.test.ts`

**Interfaces:**

- Produces `claudeStep(consented: () => HarnessId[], io: ClaudeIo): InitStep` where `type ClaudeIo = {home: string; run: (bin: string, args: string[]) => Promise<{code: number; output: string}>}` — the HOME/spawn seam, injected (real default = `os.homedir()` + execFile; tests pass a temp home and a recording `run`, never mutating `process.env`). `id: 'claude'`; `apply` returns `{status: 'skipped', detail: 'not selected'}` when claude is not in the consent record. Mechanism mirrors `packages/harness/src/claude/attach.ts` `install()` (the proven flow): shell out to the `claude` CLI — `claude plugin marketplace add <generated-root>`, `claude plugin install conciv-connect@conciv --scope local` — against a plugin directory generated with the SAME file layout `claudeConnectPluginFiles` produces (marketplace.json, plugin.json, bin bridge, .mcp.json, hooks/hooks.json). Implementation decision locked here: the CLI does NOT import `@conciv/harness` (server-weight package); instead this task EXTRACTS the plugin-file generation into a small shared module `packages/harness/src/claude/connect-plugin-files.ts` exported as `@conciv/harness/claude-connect-files` (pure functions, no server deps), and both `attach.ts` and the CLI recipe consume it. `detect`: read `~/.claude/plugins/installed_plugins.json` for `conciv-connect@conciv` (the `alreadyServing` pattern). Missing `claude` binary ⇒ card. Non-zero exit from the claude CLI ⇒ card with the exact command for the user to run.
- Test style: PATH-shim fake `claude` binary (a shell script recording argv to a file and exiting 0 / configurable exit 1), temp HOME — the harness-testkit PATH-shim pattern; assert the exact argv sequence, and that generated plugin files match the shared module's output byte-for-byte.

- [ ] **Step 1: Failing test** — recipe with shim: asserts argv sequence `plugin marketplace add`, `plugin install conciv-connect@conciv --scope local`; failing shim ⇒ `manual` card containing the install command; pre-populated installed_plugins.json ⇒ `already` without spawning (assert the recording file stays absent).
- [ ] **Step 2: FAIL.** **Step 3: Implement (including the harness-side extraction + its typecheck/test in the same commit).** **Step 4: PASS + `pnpm turbo run test --filter=...@conciv/harness` still green.**
- [ ] **Step 5: Commit** `feat(cli): claude recipe installs the connect plugin through claude's native plugin manager`

### Task 14: assemble runInit + rename to bare `conciv`

**Files:**

- Modify: `packages/cli/src/init/pipeline.ts` (`runInit` assembles preflight → detect → wizard → consent write → steps → outro), `packages/cli/package.json` (name `conciv`, keep bin `conciv`, rewrite description to the front-door text), `apps/conciv/package.json` (name `conciv` → `@conciv/app` — see the collision note), `packages/publish/src/guards.ts` (PUBLIC_PACKAGES + name-pattern allowlist), root docs references.
- Test: `packages/cli/test/init-run.test.ts`, `packages/publish` existing guard tests.

**Interfaces:**

- BLOCKER RESOLVED IN THIS TASK — workspace name collision: the widget app package (`apps/conciv`) is ALREADY named `conciv`, and pnpm cannot hold two packages with one name, so the bare-name rename REQUIRES renaming the private app first: `apps/conciv` package name becomes `@conciv/app` (private, unpublished, so no guard changes for it). Sweep EVERY reference to the old filter name in the same commit: `.github/workflows/*` (`--filter=conciv`, shard configs), `turbo` invocations in docs/scripts, any package.json dep or vitest/e2e config naming `conciv` — `grep -rn '\bconciv\b' .github package.json turbo.json e2e packages/vitest-config` and audit each hit. CI must be green on the SAME commit that renames both packages.
- `runInit` also writes the consent record: after the wizard resolves, `writeConsent(cwd, selections.harnesses)` (Task 12's API) runs before the steps so `claudeStep`/`agentsMdStep` read a fresh record.
- `runInit(options: InitOptions): Promise<LedgerEntry[]>` (returns the ledger for assertions and outro rendering): preflight failure prints reason and exits code 1 — the ONLY non-zero path (wizard cancel is a clean exit-0 no-op); step failures still exit 0 with the ledger (spec decision 7).
- `InitRuntime` injection: `runInit` takes an optional runtime `{addDependency, spawn, prompts}` (defaults = real nypm/execFile/clack) so the assembled end-to-end test runs hermetically — no network install, no real claude spawn; the recording implementations are the same boundary-injection pattern as Task 7.
- Idempotency assertions are scoped by design: second run asserts `already` ONLY for steps that reported `done` on the first run; manual-by-design steps (webpack-family, fallbacks, carded harnesses) assert they are STILL `manual` with identical cards. (No blanket all-`already` assertion exists anywhere.)
- guards.ts (CORRECTED after review): BOTH guards change — `assertValidPackageName` gains the exact-name allowlist `['conciv']`, AND `assertPublicSet`'s workspace scan currently filters `name.startsWith('@conciv/')`, which would silently drop the bare name forever — its filter becomes `name === 'conciv' || name.startsWith('@conciv/')`. Add a guard test for `assertPublicSet` seeing the bare package.
- Rename surface (verified consumers, not just `@conciv/it`): `packages/plugin/src/core/bin-shim.ts` resolves `@conciv/cli/bin` — update it and add/extend a bin-shim resolution test; grep the WHOLE workspace (`grep -rn '@conciv/cli' --include='*.json' --include='*.ts'`) and update every manifest, source, lockfile, and example-app reference in the same commit.
- OPERATIONAL (not code): first publish of the bare name needs the manual npm bootstrap (OIDC cannot create new package names) — record this in the PR body; do not attempt any publish from this plan.

- [ ] **Step 1: Failing test** — `runInit` end-to-end over a temp vite fixture project with `yes: true` and a PATH-shim claude: asserts the ledger contains install/framework/harness/agents-md entries, package.json gained `@conciv/it`, vite config wired; second-run assertions per the scoped idempotency rule above; dirty-tree run exits with the refusal reason. Guard test: `assertValidPackageName('conciv')` passes, `assertValidPackageName('rogue')` still throws.
- [ ] **Step 2: FAIL.** **Step 3: Implement.** **Step 4: PASS + full dependents green for BOTH renamed packages: `pnpm turbo run test --filter=...conciv --filter=...@conciv/app` (the first now resolves to the CLI package, the second to the widget app).**
- [ ] **Step 5: Commit** `feat(cli)!: conciv init assembled; package renamed to the bare conciv name`

### Task 15: e2e — real init runs against consumer-app clones

**Files:**

- Create: `e2e/init/init.e2e.test.ts` (follows the existing e2e consumer suite conventions — read `e2e/README.md` and one existing app's test setup first)
- Test: itself.

**Interfaces:**

- Create `e2e/init/package.json` FIRST (CORRECTED after review — CI shard discovery requires an `e2e/*/package.json` with a name and a `scripts.test:e2e` entry per `packages/vitest-config/src/shards.ts`; a bare test file would never run in CI): unique name `conciv-e2e-init`, `test:e2e` script running vitest over this dir, devDeps on vitest + the workspace CLI package. Add a shard-planner unit test asserting `conciv-e2e-init` is discovered by the LPT matrix.
- For each of `vite-react`, `nextjs`, `vite-vanilla`: copy the consumer app to a temp dir WITHOUT its conciv wiring (strip the plugin line / instrumentation files programmatically from the copy), `git init && git add -A && git commit` in the copy, run the built CLI (`node packages/cli/dist/bin.js init --yes`) with a PATH that has NO harnesses (harness steps all skip), then assert: package.json has `@conciv/it`, the config wiring matches the committed original app's wiring semantically (same import + call present), `git diff --stat` in the copy shows only the expected files, and the process exited 0. One dirty-tree case asserts exit 1.
- These tests run in the existing CONCIV_E2E dist mode (built packages), wired into the e2e shard like the other consumer apps (`.github/workflows` shard planner picks it up by convention — verify with the CI shard config, add the project to the LPT matrix source if it enumerates apps explicitly).

- [ ] **Step 1: Write the failing e2e** (CLI has no dist init yet in e2e mode ⇒ fails on unknown command).
- [ ] **Step 2: FAIL run** via the repo's real e2e invocation for one app.
- [ ] **Step 3: No new implementation expected** — this task is the integration proof; fix whatever it flushes out.
- [ ] **Step 4: PASS run for all three apps + dirty-tree case.**
- [ ] **Step 5: Commit** `test(e2e): conciv init end-to-end over consumer-app clones`

### Task 16: docs + site — init-first quick-starts with Manual tabs

**Files:**

- Modify: `apps/site/content/docs/quick-start/index.mdx`, `nextjs.mdx`, `vite.mdx`, `webpack.mdx`, `rspack.mdx`, `rollup.mdx`, `esbuild.mdx`
- Create: `apps/site/content/docs/quick-start/agents.mdx` (+ `meta.json` entry)
- Test: the site's existing docs e2e/prerender checks (`apps/site` test suite) — no new test project.

**Interfaces:**

- Consumes: the shipped behavior of Tasks 1-15 (flag names, card copy, harness list) — docs claims must match the CLI verbatim; copy any command/snippet from the implementation, never retype from memory.
- Produces: the docs story init's manual cards point at — card fallback text in Tasks 9-13 links to these pages' Manual sections, so THIS task also does a copy-sync pass over the card bodies (cards say "full steps: conciv.dev/docs/quick-start/<framework>#manual").

Structure per framework page (the shadcn pattern, fumadocs `<Tabs items={['init', 'Manual']}>`):

- Tab "init": `npx conciv@latest init` + two sentences on what it detects/wires for THIS framework + a note that a dirty git tree is refused (`--force`) and `--dry-run` previews. Then "what you get" (the same bullets the page has today).
- Tab "Manual": the page's ENTIRE current step-by-step content, moved verbatim (these steps are also what init's snippet cards show when a codemod can't prove a config shape — one source of truth, same wording).
- `index.mdx`: hero becomes the init one-liner with a framework-agnostic pitch; the framework grid stays.
- `agents.mdx` (new "Connect your agents" page): the model in one breath — agents use the conciv CLI directly (`conciv tools`, self-describing, finds your running dev server itself; no MCP config, no addresses, nothing to maintain); init teaches it via the marked AGENTS.md section and installs claude's native plugin (the one harness with a deeper integration); consent multiselect decides both. Manual tab shows the AGENTS.md section text and the claude plugin install command for hand-wiring.
- rollup/esbuild pages: init tab explains these are build-only (cards mirror this — Task 11 copy).

- [ ] **Step 1: Restructure one page (vite.mdx) with the Tabs layout; run the site dev build to verify fumadocs renders both tabs**

Run: `pnpm turbo run build --filter=site`
Expected: build passes, no MDX errors.

- [ ] **Step 2: Roll the same structure across the remaining framework pages + index + agents.mdx, updating `meta.json`**
- [ ] **Step 3: Copy-sync pass** — diff every snippet in the Manual tabs against the card snippets in `packages/cli/src/init/steps/**` and the real `@conciv/it` exports; fix drift on the CLI side if the docs are right, on the docs side if the code is right.
- [ ] **Step 4: Run site checks**

Run: `pnpm turbo run test --filter=site` and the prerender check the site uses in CI.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/site/content/docs/quick-start packages/cli/src/init/steps
git commit -m "docs(site): init-first quick-starts with manual tabs and an agents page"
```

---

## Self-Review (done at write time)

- Spec coverage: docs/site story → Task 16 (init-first + Manual tabs, agents page, card/doc copy-sync); decision 1 → Tasks 2/6/14 (verify-cheap + outro + never-boot); 2 → Task 14; 3 → Tasks 5/6; 4 → Tasks 12/13; 5 → Tasks 8-11; 6 → Tasks 3 + idempotent detects throughout; 7 → Tasks 2/14 (failure semantics, exit codes); 8 → Tasks 1/6 (citty/clack/nypm/consola) + 8 (engine spike). Testing section → per-task fixture/PATH-shim style + Task 15.
- Placeholders: none — every step carries code or exact rules; the one deliberate open point (codemod engine choice) is a structured SPIKE with binding contracts, per the spec's own wording.
- Type consistency: `InitStep`/`InitContext`/`LedgerEntry`/`ManualCard` defined once in Task 2 and consumed by name everywhere; `Detected`/`Framework` from Task 4; `HarnessId`/`FoundHarness` from Task 5; `Transform` from Task 8; `readConsent`/`writeConsent` + `agentsMdStep` from Task 12; `claudeStep` from Task 13.
- Workspace collision audited: bare `conciv` requires the `apps/conciv` → `@conciv/app` rename (Task 14) — caught in orchestrator cold read 2026-08-02.
