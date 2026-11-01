# harness-init/src

## Overview

Top-level sources of `@conciv/harness-init`: the init-contribution registry for all five harnesses, the shared agent-guide text, init contributions with `init: 'none'` for codex, gemini-cli, opencode and pi, and small JSON and path helpers. Each file is its own export subpath.

## Interface

- `INIT_HARNESS_IDS` (`['claude', 'codex', 'gemini-cli', 'opencode', 'pi']`), `InitHarnessId`, `initContributions` (`registry.ts`, export `./registry`).
- `CONCIV_BIN` = `'.conciv/bin/conciv'`, `CONCIV_RANKING_SENTENCE`, `CONCIV_COMMAND_GUIDE` (`agent-guide.ts`, export `./agent-guide`): text telling agents to prefer `conciv tools page|react|design|server` over browser MCP. The `AGENTS.md` write itself happens in the CLI (`packages/cli/src/init/steps/harness/agents-md.ts`).
- `codexInit` (`codex.ts`): detection `{bin: 'codex', configDir: ['.codex']}`, `init: 'none'`.
- `geminiCliInit` (`gemini-cli.ts`): detection `{bin: 'gemini', configDir: ['.gemini']}`, `init: 'none'`.
- `opencodeInit` (`opencode.ts`): detection `{bin: 'opencode', configDir: ['.config', 'opencode']}`, `init: 'none'`.
- `piInit` (`pi.ts`): detection `{bin: 'pi', configDir: ['.pi']}`, `init: 'none'`.
- `parseJsonOrNull(raw)` (`json.ts`, export `./json`).
- `inside(parent, child)`, `realpathOrSelf(path)`, `sameCwd(a, b)` (`paths.ts`, export `./paths`).
- [claude/README.md](./claude/README.md): `claudeInit`, plugin files, MCP bridge and install-state checks.

## Invariants

- `initContributions` is a mapped type over `InitHarnessId`, so every id in `INIT_HARNESS_IDS` needs a contribution with a matching `harnessId` (`registry.ts`).
- `inside` returns false when the child equals the parent, or when `relative()` starts with `..` or is absolute (`paths.ts`).

## Side Effects

- `realpathSync` read in `realpathOrSelf` (`paths.ts`).

## Verification

- Run: `cd packages/harness-init && pnpm test`
