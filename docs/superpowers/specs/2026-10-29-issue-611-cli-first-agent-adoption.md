# Issue #611: agents pick the CLI, so make the CLI the first-class agent surface

Date: 2026-10-29. Branch `issue-611-cli-dx` (plus `issue-611-plugin-instructions`, merged into it before the PR). Refs #611.

## Problem

The bench in #611 ran 46 headless Claude Code sessions with conciv installed beside a browser MCP. The MCP tool
`execute_typescript` was called zero times. The CLI was used, but only when a system-prompt sentence or the
absence of the browser MCP pushed the agent to it. The transcripts show five concrete CLI frictions that cost
calls: ANSI escapes in piped `--help`, `--help` refusing without a running server, `page eval` returning
`"undefined"` for a bare expression, `page fill --ref` rejecting a textbox ref, and `CONCIV_PORT` being the only
way to find the engine while the docs say conciv finds it itself.

## Decision

This PR ships items 1 to 3 of the issue's suggested order plus the two transcript bugs. It does not touch the
fate of `execute_typescript` over MCP (item 5, a product decision), the HMR-settled wait (item 4, needs a design
for completion semantics) or the `conciv init` findings (section 5 of the issue). Those are listed in the PR body
as follow-ups.

### 1. Plugin instructions rank conciv above a browser MCP

The claude-connect plugin that `conciv init` installs (`packages/harness-init/src/claude/plugin-files.ts`) gains a
skill at `skills/conciv/SKILL.md` (Claude Code plugins auto-load skill frontmatter descriptions). The skill body
is the "When to use conciv instead of the browser MCP" block from the issue, led by the sentence that worked in
the bench:

> This project has conciv installed. For everything in the running browser, use the conciv CLI through Bash
> (`conciv tools page ...`, `conciv tools react ...`, `conciv tools server ...`). Use browser MCP tools only when a
> conciv command cannot do what you need.

The `AGENTS.md` section written by `conciv init` (`packages/cli/src/init/steps/harness/agents-md.ts`,
`agentsSection`) is rewritten CLI-first: the ranking sentence, the command table from the issue, then the MCP
sandbox note as the second path. Markers and the idempotent update logic stay as they are; existing tests for the
section update their expected text.

### 2. CLI friction

- **ANSI off when piped.** citty decides colour once at import (`NO_COLOR === '1' || TERM === 'dumb' || TEST ||
  CI`). `bin.ts` imports a tiny `color-env.ts` first that sets `process.env.NO_COLOR = '1'` when
  `process.stdout.isTTY !== true` and `FORCE_COLOR` is unset. Test: run the built CLI with `--help` through a pipe
  and assert the output has no `\u001b`.
- **`--help` works offline for `page` and `react`.** `pageCommand`/`reactCommand` build their sub-commands from
  the live registry catalog. When the catalog request fails with the offline failure, help falls back to the
  static page tool definitions (`PAGE_TOOL_DEFS` or equivalent export from `@conciv/extension-page/defs`, which
  already carries name, summary, category and input schema) so the catalog can be learned before the app is up.
  Running a command still needs the server and keeps the offline failure. The fallback help prints one trailing
  line: `offline: showing the built-in page capabilities; a running server may add more`. `@conciv/cli` adds
  `@conciv/extension-page` as a dependency only if the defs entry is not already reachable; prefer the existing
  dependency graph (check `pnpm why`).
- **`page eval` evaluates a bare expression.** `evalTool` (`packages/extensions/page/src/client/bodies.ts`)
  first tries `new Function('return (async () => (' + code + '))()')`; on `SyntaxError` at construction it falls
  back to the current statement-body form. A snippet ending in a statement keeps returning what it returns.
  Browser test in the page extension: `document.title` (expression) and `const a = 1; return a + 1` (statements)
  both return their value.
- **`page fill --ref` on a textbox ref.** Root-cause why a ref that `page snapshot` listed as a textbox resolves
  to an element that fails `isField`. Likely candidates: the snapshot lists the role-bearing element (a wrapper
  with `role="textbox"`, a contenteditable, or a label) and `fill` needs the underlying control; or refs are
  assigned to a different node than the one with the role. Fix at the resolution step shared by every act
  verb (`ctx.target`), not in `fill`: when the resolved element is not a field but contains or labels exactly one
  field, act on that field. Reproduce first against a real login form (react-admin's `<TextInput>` is MUI:
  `<div class="MuiInputBase-root"><input/></div>`) in the page extension browser tests.
- **Engine port autodiscovery.** `defaultOrigin()` in `packages/cli/src/request.ts` resolves, in order:
  `CONCIV_PORT`, then `.conciv/server.json` (`{port}`) found by walking from `cwd` up to the filesystem root
  (reuse `concivStateDir` from `@conciv/protocol/state-types` for the directory name), then `5173`. The core
  writes `server.json` in every port mode, not only the persisted-port mode (`packages/core/src/start.ts`
  `servePort`: write after a successful `exact`/`preferred` serve too; `writePersistedPort` in
  `packages/core/src/lib/server-port.ts`). The offline hint becomes: `Start your app (pnpm dev). conciv reads the
  engine port from .conciv/server.json; CONCIV_PORT=<engine port> overrides it (this is the conciv engine port,
  not Vite's).`

## Non-goals

- No change to which tools exist or to the MCP surface.
- No new `page wait --hmr` / `server reload` semantics.
- No `conciv init` behaviour change beyond the AGENTS.md section text and the plugin skill file.

## Verification

- `@conciv/cli` tests: piped `--help` has no escape codes; `conciv tools page --help` with no server lists the
  built-in verbs and the offline line; `defaultOrigin` order with a temp `.conciv/server.json`; `tools page
  snapshot` with no server still fails with the new hint.
- `@conciv/core`: `start` with an exact port writes `server.json`.
- `packages/extensions/page` browser tests: eval expression/statement; fill through a MUI-style wrapper ref.
- `packages/harness-init`: plugin file list includes `skills/conciv/SKILL.md` with the ranking sentence; the init
  AGENTS.md tests assert the new section.
- Changeset: patch on `@conciv/cli` (fixed set bumps all).
