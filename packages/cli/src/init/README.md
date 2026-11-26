# cli/src/init

## Overview

Runs the `conciv init` pipeline. It checks the project, detects framework, package manager and agent harnesses, asks the user to approve a plan, then runs ordered steps (detect, plan, apply, verify). It backs up files and restores them on interrupt, and prints a summary with manual cards at the end. The steps live in [steps/](./steps/README.md).

## Invariants

- `runInit` (`pipeline.ts`): refuses on a non-interactive terminal unless --yes or --dry-run, and refuses when `preflight` fails, before anything is written
- `preflight` (`pipeline.ts`): needs package.json in cwd; without force, refuses a dirty git tree or an unreadable git status; no repository is allowed
- `settleStep` (`pipeline.ts`): detect 'present' records 'already' and skips apply; a detect error counts as missing; dry run calls only plan
- `settleStep` (`pipeline.ts`): an apply throw, or verify false after apply, makes the step manual with `step.manualCard`
- `stepList` (`pipeline.ts`): order is install @conciv/it, framework (if selected), AGENTS.md, one step per harness file init, one `connect-<agent>` step per found harness that has a `hub` (already connected ones settle as 'already'), docs pack (if selected)
- `connectableAgents` (`pipeline.ts`): the found hub harnesses not yet in the conciv home db (`InitRuntime.concivHome`); the wizard's "Connect these agents to conciv" multiselect offers only these, all checked; an unreadable home db offers every found hub harness
- `frameworkStep` (`pipeline.ts`): vite and astro use viteStep, nextjs nextjsStep, webpack and rspack webpackFamilyStep, everything else fallbackStep
- `approvePlan` (`wizard.ts`): dry run and --yes take the defaults (framework true, every found harness, every connectable agent, docsPack false), so `--dry-run` and `--json` list each `Connect <Name> to conciv` step and `--yes` connects them
- `detectFramework` (`detect.ts`): rule order sets priority; an invalid manifest gives 'unknown'
- `execFileOutcome` (`pipeline.ts`): a signal exit resolves with code 1
- `guardBackups` (`interrupt.ts`): restores in reverse order; a file captured as null is deleted on restore

## Side Effects

- `defaultRuntime` (`pipeline.ts`): reads PATH, HOME and the conciv home (`concivHome`, CONCIV_HOME or the platform data folder); calls process.exit with 128 plus the signal number on interrupt (130 for SIGINT, 143 for SIGTERM, 129 for SIGHUP)
- `guardBackups` / `onInterrupt` (`interrupt.ts`): add process 'exit', SIGINT, SIGTERM and SIGHUP listeners and rewrite or delete backed-up files
- `execFileOutcome` (`pipeline.ts`): spawns child processes
- `preflight` (`pipeline.ts`): runs `git status --porcelain` with LC_ALL=C
- `detect.ts`: reads package.json and config files; `detectHarnesses` (`@conciv/harness/init/detect`) reads PATH entries and HOME config dirs
- `clackOutput` / `clackPrompts` (`wizard.ts`): write to the terminal and prompt for input

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/cli` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/cli && pnpm typecheck`, then `pnpm lint` at the repo root
