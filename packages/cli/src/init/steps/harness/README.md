# cli/src/init/steps/harness

## Overview

Init steps that connect agent harnesses. They write the consent file .conciv/harnesses.json, add a marked conciv section to AGENTS.md (and CLAUDE.md), and run each harness's file and command plan from the @conciv/harness-init registry.

## Interface

- `agentsMdStep(consented)` (`agents-md.ts`): InitStep 'agents' that adds or updates the conciv section in AGENTS.md and CLAUDE.md
- `agentsSection(consented)` (`agents-md.ts`): builds the section between `<!-- conciv:start -->` and `<!-- conciv:end -->`
- `harnessInitStep(init, consented, io)` (`install-harness.ts`): InitStep with id init.harnessId that writes plan files and runs plan commands
- `HarnessInitIo` {home, run} (`install-harness.ts`)
- `consentFile(cwd)` / `writeConsent(cwd, ids)` (`consent.ts`): the .conciv/harnesses.json path and its writer

## Invariants

- `markerSpan` (`agents-md.ts`): more than one start or end marker, or an end before the start, is mismatched; apply then returns manual and writes nothing
- `targets` (`agents-md.ts`): CLAUDE.md is also edited when it exists and has no `@AGENTS.md` line
- `needsClaudeImport` (`agents-md.ts`): with 'claude' consented and no CLAUDE.md, it creates CLAUDE.md containing `@AGENTS.md`
- `agentsMdStep.detect` (`agents-md.ts`): present only when every target's marked span equals the current section
- `applyInit` / `serves` (`install-harness.ts`): a harness that was not consented is skipped as 'not selected'
- `applyInit` (`install-harness.ts`): stops at the first failing command and returns manual with `init.manualCard(plan.root)`
- `writePlanFiles` (`install-harness.ts`): mode 0o600 unless the plan file sets its own mode

## Side Effects

- `agentsMdStep.apply` (`agents-md.ts`): backs up and writes AGENTS.md and CLAUDE.md
- `writeConsent` (`consent.ts`): creates .conciv and writes harnesses.json
- `writePlanFiles` (`install-harness.ts`): writes harness plan files, possibly outside cwd (for example under home)
- `runCommand` (`install-harness.ts`): spawns the harness command through io.run and streams its lines to ctx.feed

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/cli` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/cli && pnpm typecheck && pnpm lint`
