# cli/src/init

## Overview

Runs the `conciv init` pipeline. It checks the project, detects framework, package manager and agent harnesses, asks the user to approve a plan, then runs ordered steps (detect, plan, apply, verify). It backs up files and restores them on interrupt, and prints a summary with manual cards at the end.

## Interface

- `runInit(options, overrides?)` (`pipeline.ts`): returns `InitResult` with outcome refused, cancelled, planned (dry run) or completed
- `runSteps(steps, settings, output)` (`pipeline.ts`): runs `InitStep`s in order and returns `LedgerEntry[]`
- `InitStep`, `InitContext`, `RunSettings`, `InitOptions` {yes, dryRun, force, cwd}, `InitResult`, `SpawnBin`, `InitRuntime` (`pipeline.ts`)
- `approvePlan(args)` / `PlanApproval` (`wizard.ts`): selections, cancelled or dry-run
- `renderPlan(rows, harnesses)` (`wizard.ts`): plan text with one row per step and a Harnesses line
- `clackOutput` / `clackPrompts` / `interactiveTerminal` (`wizard.ts`): @clack/prompts output and prompts, and the TTY/CI check
- `detectProject(cwd)` / `detectFramework(cwd)` / `Framework` (`detect.ts`): nextjs, astro, vite, webpack, rspack, rollup, esbuild or unknown
- `execFileOutcome(bin, args, options, onLine)` (`exec.ts`): spawns a process and resolves {code, output}
- `detectHarnesses(env)` / `harnessIds` / `harnessFileInits` / `harnessAgentsMdNote` (`harness-detect.ts`): from `@conciv/harness-init/registry`
- `captureFile` / `guardBackups` / `onInterrupt` (`interrupt.ts`): file backup and restore, and the SIGINT hook
- `StepStatus`, `ManualCard`, `StepNote`, `StepPlan`, `StepOutcome`, `LedgerEntry` (`ledger.ts`)
- `emitOutro(output, entries, next)` (`outro.ts`), `preflight(cwd, force)` (`preflight.ts`), `silentOutput()` (`silent.ts`)
- Subdirectories:
  - steps: [./steps/README.md](./steps/README.md) - the init steps

## Invariants

- `runInit` (`pipeline.ts`): refuses on a non-interactive terminal unless --yes or --dry-run, and refuses when `preflight` fails, before anything is written
- `preflight` (`preflight.ts`): needs package.json in cwd; without force, refuses a dirty git tree or an unreadable git status; no repository is allowed
- `settleStep` (`pipeline.ts`): detect 'present' records 'already' and skips apply; a detect error counts as missing; dry run calls only plan
- `settleStep` (`pipeline.ts`): an apply throw, or verify false after apply, makes the step manual with `step.manualCard`
- `stepList` (`pipeline.ts`): order is install @conciv/it, framework (if selected), AGENTS.md, one step per harness file init, docs pack (if selected)
- `frameworkStep` (`pipeline.ts`): vite and astro use viteStep, nextjs nextjsStep, webpack and rspack webpackFamilyStep, everything else fallbackStep
- `approvePlan` (`wizard.ts`): dry run and --yes take the defaults (framework true, every found harness, docsPack false)
- `detectFramework` (`detect.ts`): rule order sets priority; an invalid manifest gives 'unknown'
- `execFileOutcome` (`exec.ts`): a signal exit resolves with code 1
- `guardBackups` (`interrupt.ts`): restores in reverse order; a file captured as null is deleted on restore
- `detectHarnesses` (`harness-detect.ts`): a PATH match requires the execute bit

## Side Effects

- `runInit` (`pipeline.ts`): `writeConsent` writes .conciv/harnesses.json after a backup
- `defaultRuntime` (`pipeline.ts`): reads PATH and HOME; calls process.exit(130) on interrupt
- `guardBackups` / `onInterrupt` (`interrupt.ts`): add process 'exit' and SIGINT listeners and rewrite or delete backed-up files
- `execFileOutcome` (`exec.ts`): spawns child processes
- `preflight` (`preflight.ts`): runs `git status --porcelain` with LC_ALL=C
- `detect.ts`, `harness-detect.ts`: read package.json, config files, PATH entries and HOME config dirs
- `clackOutput` / `clackPrompts` (`wizard.ts`): write to the terminal and prompt for input

## Verification

- Run: `cd packages/cli && pnpm test`
- Typecheck and lint: `cd packages/cli && pnpm typecheck && pnpm lint`
