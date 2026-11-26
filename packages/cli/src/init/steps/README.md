# cli/src/init/steps

## Overview

Init steps that install dependencies: @conciv/it as a dev dependency and the optional @conciv/skills docs pack (dependency plus a TanStack intent install that adds a block to AGENTS.md). It also holds a zod-validated package.json reader and the framework and harness step groups.

## Invariants

- `docsPackStep.detect` (`docs-pack.ts`): present only when @conciv/skills is declared and AGENTS.md has both intent-skills markers
- `docsPackStep.apply` (`docs-pack.ts`): skips what is already there; an add or spawn failure, or a non-zero exit, gives a manual card
- `resolveIntentCommands` (`docs-pack.ts`): throws when nypm dlxCommand is empty; uses npm when no package manager is detected
- `installItStep.apply` (`install-it.ts`): an add failure gives a manual card with the add command
- `readManifest` (`manifest.ts`): returns {} on schema failure; JSON.parse still throws on invalid JSON or a missing file

## Side Effects

- `installItStep.apply` (`install-it.ts`): backs up package.json and installs through nypm
- `docsPackStep.apply` (`docs-pack.ts`): backs up package.json and AGENTS.md, installs @conciv/skills and spawns the intent install, which writes AGENTS.md
- `readManifest` (`manifest.ts`), `intentBlockPresent` (`docs-pack.ts`): read package.json and AGENTS.md; nypm detectPackageManager reads lockfiles

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/cli` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/cli && pnpm typecheck`, then `pnpm lint` at the repo root
