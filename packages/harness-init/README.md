# @conciv/harness-init

Per-harness init contributions for `conciv init`: detection markers, optional AGENTS.md teaching
text, and the generated install work (for claude: marketplace manifest, plugin manifest, MCP
bridge, and install-state probing). Used by the `conciv` CLI, `@conciv/harness` and `@conciv/core`.

Part of [conciv](https://github.com/conciv-dev/conciv).

## Overview

- [src/README.md](./src/README.md): registry, hub connections, harness detection, agent-guide text, non-claude contributions, JSON and path helpers.
- [src/claude/README.md](./src/claude/README.md): Claude plugin marketplace files (including `.mcp.json` and `skills/conciv/SKILL.md`), MCP bridge and install-state probing.

## Invariants

- Every exports entry has a matching tsdown `entry` (`package.json`, `tsdown.config.ts`); a contribution with no outside importer is reached through `./registry` and has no subpath.
- Only `dist` is published (`files`). tsdown emits the JavaScript (`dts: false`); `tsc` emits the declarations.
- The package only exports AGENTS.md text constants; writing `AGENTS.md` is done by the CLI.

## Side Effects

- `build` writes `dist/`. Runtime reads are listed in [src/README.md](./src/README.md) and [src/claude/README.md](./src/claude/README.md).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/harness-init` from the repo root (turbo builds the package and its dependencies first)
