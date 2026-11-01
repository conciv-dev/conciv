# @conciv/harness-init

Per-harness init contributions for `conciv init`: detection markers, optional AGENTS.md teaching
text, and the generated install work (for claude: marketplace manifest, plugin manifest, MCP
bridge, and install-state probing). Used by the `conciv` CLI and `@conciv/harness`.

Part of [conciv](https://github.com/conciv-dev/conciv).

## Interface

- [src/README.md](./src/README.md): registry, agent-guide text, non-claude contributions, JSON and path helpers.
- [src/claude/README.md](./src/claude/README.md): Claude plugin marketplace files (including `.mcp.json` and `skills/conciv/SKILL.md`), MCP bridge and install-state probing.
- Exports (`package.json`): `./registry`, `./agent-guide`, `./claude` (-> `claude/init`), `./claude/bridge`, `./claude/endpoint`, `./claude/files` (-> `claude/plugin-files`), `./claude/names`, `./claude/state` (-> `claude/install-state`), `./codex`, `./gemini-cli`, `./opencode`, `./pi`, `./json`, `./paths`. No bin.
- Also imported by `@conciv/core` (`packages/core/src/start.ts`). Dependencies: `@conciv/protocol`, `zod`.
- Scripts: `build` (`tsdown`), `typecheck`, `lint` (`oxlint`), `test` (`vitest run`), `publint`, `attw`.

## Invariants

- Every exports entry needs a matching tsdown `entry`; both list the same 14 files (`package.json`, `tsdown.config.ts`).
- Only `dist` is published (`files`).
- The package only exports AGENTS.md text constants; writing `AGENTS.md` is done by the CLI.

## Side Effects

- `build` writes `dist/`. Runtime reads are listed in [src/README.md](./src/README.md) and [src/claude/README.md](./src/claude/README.md).

## Verification

- Run: `cd packages/harness-init && pnpm test`
