# harness-init/src

## Overview

Top-level sources of `@conciv/harness-init`: the init-contribution registry for all five harnesses, the shared agent-guide text, init contributions with `init: 'none'` for codex, gemini-cli, opencode and pi, and small JSON and path helpers. Each file is its own export subpath.

## Interface

- `initContributions` (`registry.ts`, export `./registry`), keyed by `INIT_HARNESS_IDS` (`['claude', 'codex', 'gemini-cli', 'opencode', 'pi']`) and `InitHarnessId` from `@conciv/protocol/harness-types` (browser-safe, so the oRPC contract can validate a harness id).
- `createHubConnections(home, run?)` (`hub.ts`, subpath `./hub`; `run` spawns an argv, default `execFile` with a 30 s timeout): the one implementation of hub connections over the home db (`@conciv/db`): `list()` (`{harness, name, connectedAt}` rows of harnesses with a `hub`; never creates the home db: an absent one is no connections), `revokedAt()` (the last disconnect time, 0 when none), `connect(harness, command)` (`hub.add` with `CONCIV_HOME`, remove-then-add when the CLI says the entry already exists, then the row; the row is refused with "<Name> was disconnected while connecting; connect again" when a disconnect landed after the connect started, so a slow agent CLI never reconnects an agent disconnected meanwhile), `disconnect(harness)` (deletes the row FIRST and records the disconnect time in one transaction, so revocation never depends on the CLI and reaches every engine sharing the home, then `hub.remove` best-effort; no `remove` (opencode) or a failing remove still answers ok with a `note` saying the entry stays and is refused until reconnected; a CLI answer like "not found" counts as removed), `refusal(client)` (null unless the client names a harness with a `hub` and no row, then the "<name> is disconnected from conciv; reconnect it from the conciv widget or run `conciv mcp connect <harness>`" text; an unreadable home db refuses)
- `hub.name` / `hub.shellEnv` on each hub contribution: the display name and the env var that agent CLI sets for its shell commands (claude `CLAUDECODE`, codex `CODEX_THREAD_ID`, gemini-cli `GEMINI_CLI`, opencode `OPENCODE`, read from the CLI builds pinned in CI)
- `hub.add(command)` on the claude, codex, gemini-cli and opencode contributions: the argv that registers `conciv-hub` as a user-scope stdio MCP server in that CLI (pi has none); `hub.remove` on claude, codex and gemini-cli is the argv that drops an existing `conciv-hub` so the installer can re-add it with this engine's `CONCIV_HOME` (opencode has no non-interactive remove, so an existing entry there stays as is).
- `CONCIV_BIN` = `'.conciv/bin/conciv'`, `CONCIV_RANKING_SENTENCE`, `CONCIV_COMMAND_GUIDE` (`agent-guide.ts`, export `./agent-guide`): text telling agents to prefer `conciv tools page|react|design|server` over browser MCP. The `AGENTS.md` write itself happens in the CLI (`packages/cli/src/init/steps/harness/agents-md.ts`).
- `codexInit` (`codex.ts`): detection `{bin: 'codex', configDir: ['.codex']}`, `init: 'none'`.
- `geminiCliInit` (`gemini-cli.ts`): detection `{bin: 'gemini', configDir: ['.gemini']}`, `init: 'none'`.
- `opencodeInit` (`opencode.ts`): detection `{bin: 'opencode', configDir: ['.config', 'opencode']}`, `init: 'none'`.
- `piInit` (`pi.ts`): detection `{bin: 'pi', configDir: ['.pi']}`, `init: 'none'`.
- `detectHarnesses(env)` / `FoundHarness` (`detect.ts`, export `./detect`): installed harnesses by an executable on PATH or a config dir under HOME, from each contribution's `detection`; the cli uses it for `conciv init`, core for the set of harnesses a session can switch to.
- `parseJsonOrNull(raw)` (`json.ts`, export `./json`).
- `inside(parent, child)`, `realpathOrSelf(path)`, `sameCwd(a, b)` (`paths.ts`, export `./paths`).
- [claude/README.md](./claude/README.md): `claudeInit`, plugin files, MCP bridge and install-state checks.

## Invariants

- `initContributions` is a mapped type over `InitHarnessId`, so every id in `INIT_HARNESS_IDS` needs a contribution with a matching `harnessId` (`registry.ts`).
- `detectHarnesses` reports one entry per harness, `via: 'path'` winning over `'config'`; a PATH match requires the execute bit (`detect.ts`).
- `inside` returns false when the child equals the parent, or when `relative()` starts with `..` or is absolute (`paths.ts`).

## Side Effects

- `realpathSync` read in `realpathOrSelf` (`paths.ts`).
- `detectHarnesses` (`detect.ts`) checks PATH entries and HOME config dirs with `existsSync` / `statSync`.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/harness-init` from the repo root (turbo builds the package and its dependencies first)
