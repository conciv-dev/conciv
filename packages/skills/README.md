# @conciv/skills

## Overview

Published package that ships agent skill markdown, discovered through @tanstack/intent, for conciv setup, extension development, harness adapters and debugging. A dev-only `check:refs` script checks file and line citations in the skill docs.

## Interface

- `name` (`package.json`): @conciv/skills, public, keyword 'tanstack-intent'; no exports and no bin
- `files` (`package.json`): publishes `skills` and excludes `skills/_artifacts`
- Script `check:refs` (`package.json`): `node --experimental-strip-types src/cli.ts`, exits 1 on findings
- Script `intent:validate` (`package.json`): `intent validate skills --check`
- Script `intent:stale` (`package.json`): `intent stale --json`
- Scripts `lint` / `typecheck` / `test` (`package.json`): oxlint, tsc --noEmit, vitest run
- Subdirectories:
  - src: [./src/README.md](./src/README.md) - citation checker behind `check:refs`
  - conciv-setup: [./skills/conciv-setup/SKILL.md](./skills/conciv-setup/SKILL.md) - installing or mounting the widget
  - conciv-develop: [./skills/conciv-develop/SKILL.md](./skills/conciv-develop/SKILL.md) - building extensions
  - conciv-harness: [./skills/conciv-harness/SKILL.md](./skills/conciv-harness/SKILL.md) - harness adapters
  - conciv-debug: [./skills/conciv-debug/SKILL.md](./skills/conciv-debug/SKILL.md) - runtime debugging

## Invariants

- `files` (`package.json`): skills/_artifacts (domain_map.yaml, skill_spec.md, skill_tree.yaml) is not published
- Each `skills/*/SKILL.md`: frontmatter has name, description and metadata.package '@conciv/skills'

## Side Effects

- None at the package root; see the src contract

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/skills` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/skills && pnpm typecheck && pnpm lint`
