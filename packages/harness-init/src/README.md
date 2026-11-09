# harness-init/src

## Overview

Top-level sources of `@conciv/harness-init`: the init-contribution registry for all five harnesses, the shared agent-guide text, init contributions with `init: 'none'` for codex, gemini-cli, opencode and pi, and small JSON and path helpers. Each file is its own export subpath.

## Interface

- `initContributions` (`registry.ts`, export `./registry`), keyed by `INIT_HARNESS_IDS` (`['claude', 'codex', 'gemini-cli', 'opencode', 'pi']`) and `InitHarnessId` from `@conciv/protocol/harness-types` (browser-safe, so the oRPC contract can validate a harness id).
- `createHubConnections(home, run?)` (`hub.ts`, subpath `./hub`; `run` spawns an argv with the 30 s per-command timeout it is handed and reports the child pid through `started`, which answers a refusal when the lease cannot record it, and the runner then SIGKILLs the child and fails with that message ("conciv could not record the <bin> process in its home db: …"), so no untracked agent CLI change outlives its owner; default `execFile` with SIGKILL on timeout; releasing the lease never replaces the outcome: a failed release leaves a lease that goes stale by the usual rules): the one implementation of hub connections over the home db (`@conciv/db`): `list()` (`{harness, name, connectedAt}` rows of harnesses with a `hub`; never creates the home db: an absent one is no connections), `generation()` (the home's hub generation, bumped by every disconnect, 0 when none, null when the home db cannot be read; `connect` answers `{ok: false}` with the reason in that case instead of throwing), `connect(harness, command)` (`hub.add` with `CONCIV_HOME`, remove-then-add when the CLI says the entry already exists, then the row; the row is refused with "<Name> was disconnected while connecting; connect again" when the generation moved past the one captured when the connect started, so a slow agent CLI never reconnects an agent disconnected meanwhile; the agent CLI runs under the harness's `hub_operations` lease, and a live lease held by another connect or disconnect (its owner pid or the agent CLI child it spawned still alive, started within the 10 minute ceiling that guards against pid reuse) answers "<Name> is still being (dis)connected; try again in a moment", a stale one is taken over), `disconnect(harness)` (deletes the row FIRST and bumps the generation in one transaction, so revocation never depends on the CLI or the lease and reaches every engine sharing the home, then `hub.remove` best-effort under the lease (a busy lease leaves the entry and says so in the `note`); no `remove` (opencode) or a failing remove still answers ok with a `note` saying the entry stays and is refused until reconnected; a CLI answer like "not found" counts as removed), `refusal(client)` (null unless the client names a harness with a `hub` and no row, then the "<name> is disconnected from conciv; reconnect it from the conciv widget or run `conciv mcp connect <harness>`" text; an unreadable home db refuses)
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
