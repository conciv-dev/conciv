# harness/src/init

## Overview

The init side of the harnesses, published as the `./init/*` subpaths of `@conciv/harness`: the init-contribution registry for all five harnesses (`./init/registry`; claude's lives in [claude/](./claude/README.md), the others are `init: 'none'`), harness detection for `conciv init` and the engine's harness list (`./init/detect`), the hub connections over the home db (`./init/hub`), the agent-guide text the CLI writes into `AGENTS.md` (`./init/agent-guide`; the write itself is `packages/cli/src/init/steps/harness/agents-md.ts`), and small JSON and path helpers.

## Invariants

- `initContributions` is a mapped type over `InitHarnessId` (`@conciv/types/harness-types`), so every harness id needs a contribution with a matching `harnessId` (`registry.ts`).
- `detectHarnesses` reports one entry per harness, from an executable on PATH or a config dir under HOME; `via: 'path'` wins over `'config'`, and a PATH match requires the execute bit (`detect.ts`).
- `inside` returns false when the child equals the parent, or when `relative()` starts with `..` or is absolute (`paths.ts`).
- Hub connections (`hub.ts`) are the one implementation over the home db (`@conciv/home`):
  - `list()` never creates the home db: an absent one is no connections.
  - `connect` answers `{ok: false}` with the reason instead of throwing when the home db cannot be read. It runs the harness's `hub.add` with `CONCIV_HOME` (remove-then-add when the CLI says the entry exists), and refuses the row with "<Name> was disconnected while connecting; connect again" when a disconnect happened meanwhile.
  - The agent CLI runs under the harness's `hub_operations` lease with a 30 s per-command timeout. A live lease held by another connect or disconnect (its owner pid or the CLI child alive, started within the 10 minute ceiling that guards against pid reuse) answers "<Name> is still being (dis)connected"; a stale one is taken over. A child whose pid the lease cannot record is SIGKILLed, so no untracked agent CLI change outlives its owner.
  - `disconnect` deletes the row first and bumps the generation in one transaction, so revocation never depends on the CLI or the lease and reaches every engine sharing the home; `hub.remove` then runs best-effort (opencode has none, so its entry stays and is refused until reconnected).
  - `refusal(client)` names a harness with a `hub` and no row: "<name> is disconnected from conciv; reconnect it from the conciv widget or run `conciv mcp connect <harness>`"; an unreadable home db refuses.

## Side Effects

- `realpathSync` read in `realpathOrSelf` (`paths.ts`).
- `detectHarnesses` (`detect.ts`) checks PATH entries and HOME config dirs with `access` / `stat` from `node:fs/promises`.
- `hub.ts` spawns each harness's `hub.add` / `hub.remove` argv and writes the home db.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/harness` from the repo root (turbo builds the package and its dependencies first)
