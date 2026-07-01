# Plan: "Open in <harness>" button

Status: **awaiting approval** — no code written yet.

## Goal

A button in the web chat composer that reopens the current chat session in the user's own
harness CLI (Claude Code, Codex, ...) in a real terminal. Each harness defines how it launches.

## Feasibility (spiked, confirmed)

- Button -> `POST /api/chat/launch` -> `fetch`: trivial; the server already has POST routes.
- Server -> terminal: node `spawn('open', ['-a', <app>, <tmp>.command])` pops the terminal, runs
  the command, and stays alive for a long-running CLI. Verified on this mac (TERM_PROGRAM=iTerm.app).
- The "session ended very soon" iTerm warning seen during the spike was an artifact of the spike's
  instant-exit echo command. A real interactive `claude --resume <id>` stays alive -> no warning.

## Approved decisions

1. Scope: build **Phase 1 + Phase 2** together.
2. Button label: **harness-named** ("Open in Claude" / "Open in Codex").
3. Terminal opener: **mac + windows + linux**.

## Design

Core owns ALL the "how to open" logic (OS detection, cwd handling, shell quoting, spawning,
copy-fallback bookkeeping) and passes it to the harness as a **smart launch context**. A harness
does only its tiny bit - decide which CLI command to run - then calls a context method to actually
open it. No harness reimplements open logic.

```ts
// What a launch reports back. `command` is the resolved, paste-able command string so the widget
// can copy it when `opened` is false (the Phase 1 floor).
type HarnessLaunchResult = { opened: boolean; command: string }

// The smart context core hands each harness. open* take an ARGV (like buildArgs returns) - core
// shell-quotes it, prepends `cd '<cwd>'`, spawns the per-OS terminal, and returns {opened, command}.
// The carry-over fields (model, mcpUrl) mirror what the chat turn used, so the resumed session
// matches. cwd/sessionId are here too.
type HarnessLaunchContext = {
  cwd: string
  sessionId: string | null
  model: string | null          // the model the widget currently has selected
  mcpUrl: string | null         // the conciv MCP-over-HTTP endpoint (for tool parity)
  openTerminal: (argv: string[]) => Promise<HarnessLaunchResult>
  openUrl: (url: string) => Promise<HarnessLaunchResult>
}

launch?: (ctx: HarnessLaunchContext) => HarnessLaunchResult | Promise<HarnessLaunchResult>
```

Harness adapters build an INTERACTIVE argv, reusing the same MCP/plugin arg-builders `buildArgs`
already uses (extracted so the two cannot drift) - but NOT the headless `-p` / `--output-format
stream-json` / `exec` flags, which would make the CLI non-interactive:

```ts
// claude — claude [--resume <id>] [--model <m>] [--mcp-config ... --strict-mcp-config --allowedTools ...] [--plugin-dir ...]
launch: (ctx) => {
  const argv = ['claude']
  if (ctx.sessionId) argv.push('--resume', ctx.sessionId)
  if (ctx.model) argv.push('--model', ctx.model)
  if (ctx.mcpUrl) argv.push(...claudeMcpArgs(ctx.mcpUrl)) // shared with buildClaudeArgs
  if (CONCIV_PLUGIN_DIR) argv.push('--plugin-dir', CONCIV_PLUGIN_DIR)
  return ctx.openTerminal(argv)
}
// codex — codex [resume <id>] [-m <m>]  (+ MCP via codex's own mechanism, see verification)
```

- Core's `openTerminal(argv)` shell-quotes each arg, prepends `cd '<cwd>' && `, runs the per-OS
  opener, and returns `{opened, command}` where `command` is the full resolved shell string.
- `opened: false` (open failed / unsupported platform) -> widget copies `command` (Phase 1 floor).
- A harness with no interactive entry omits `launch` -> reported unsupported, button hidden.
- `child_process` + shell-quoting stay in core; the harness only builds argv.

## Carry-over (decided: model + conciv MCP tools)

The launch POST carries the widget's current model; the server adds the same `mcpUrl` the chat turn
uses. Both land on the launch context so the terminal session resumes on the same model AND has the
same conciv page tools (`conciv_ui` / `conciv_page` / `conciv_test`) as the in-widget agent.

Deliberately NOT carried: headless stream-json flags, the permission-hook `--settings` (its HTTP
gate has no widget loop in a bare terminal), and the temp `--append-system-prompt-file` (may be gone).

## Two phases

- **Phase 1 (floor):** click -> server returns the launch spec -> widget copies `command` to the
  clipboard and shows a transient notice ("Command copied - paste in your terminal"). Zero OS risk.
- **Phase 2 (direct open):** server tries `open` first. On success the terminal pops and the user
  does nothing. On failure (unsupported platform, missing terminal app, spawn error) it returns
  `opened: false` and the widget does the Phase 1 copy.

## Phase 2 terminal opener (per OS) — lives in core, exposed via `ctx.openTerminal`

- **mac:** write the command to a temp `*.command` file, then `open -a <app> <file>` where `<app>`
  is mapped from `$TERM_PROGRAM` inherited by the dev server (iTerm.app->iTerm, Apple_Terminal->
  Terminal, Warp/WezTerm/Ghostty/Hyper/kitty -> their app). Unknown/empty -> plain `open <file>`
  (the OS default terminal handler).
- **windows:** `start cmd /k <command>` (best-effort; the POSIX `cd '...' &&` command is shaky on
  cmd, so this may fall back to copy - acceptable, copy still works in git-bash/WSL).
- **linux:** `x-terminal-emulator -e bash -lc '<command>; exec bash'` (absent -> spawn error ->
  copy fallback).
- Spawn is detached + unref'd so the terminal outlives the dev server. "Spawned OK" = `opened: true`;
  we cannot truly confirm the window appeared, which is why the copy fallback always exists.

## Files to change

Contract / protocol:

- `packages/protocol/src/harness-types.ts` - add `HarnessLaunchResult`, `HarnessLaunchContext`
  (with `openTerminal`/`openUrl`), the `launch?` method, and `displayName?` on the adapter base.
- `packages/protocol/src/chat-types.ts` - add `ChatLaunchSchema` (`{supported, opened, command}`);
  extend `ChatSessionSchema` with `harness: {id, name, canLaunch}` so the widget can name + gate the
  button before any click.

Harness adapters (build argv only, no open logic):

- `packages/harness/src/claude/args.ts` - extract the MCP arg-builder (`claudeMcpArgs(mcpUrl)`) out of
  `buildClaudeArgs` so `launch` reuses the exact same flags (no drift).
- `packages/harness/src/claude/index.ts` - `displayName: 'Claude'` + `launch` (interactive argv).
- `packages/harness/src/codex/index.ts` - `displayName: 'Codex'` + `launch` (interactive argv);
  MCP wiring per codex's own mechanism (see verification).
- gemini-cli / opencode / pi: unchanged (omit `launch` -> unsupported, button hidden, no break).
- No `_shared/shell-quote.ts` - shell quoting + `cd` now live in core's opener.

Core server (owns all the open logic):

- `packages/core/src/api/chat/launch.ts` (new) - the smart opener (`openTerminal(argv)`/`openUrl`:
  shell-quote argv, `cd` wrap, per-OS spawn) + `POST /api/chat/launch`: read `{model}` from the body,
  build the `HarnessLaunchContext` (cwd, sessionId, model, mcpUrl), call `harness.launch(ctx)`,
  return `{supported, opened, command}`.
- `packages/core/src/api/chat/chat.ts` - register the launch route; thread `mcpUrl` to it the same
  way the turn route gets it.
- `packages/core/src/api/chat/session.ts` - include `harness: {id, name, canLaunch}` in the response.

Widget:

- `packages/widget/src/chat-api.ts` - add `launch()`; `ChatSession` gains the `harness` field.
- `packages/widget/src/open-in-terminal-action.tsx` (new) - the composer action (a factory taking
  the harness display name): opened -> notice; else copy command + notice.
- `packages/widget/src/mount.tsx` - fetch the session once, register the action only when
  `harness.canLaunch`, with label "Open in <name>".
- `packages/widget/src/widget-shell.tsx` - add `notify(message)` to `ComposerActionContext`.
- `packages/widget/src/chat-panel.tsx` - implement `notify` (transient notice above composer +
  aria-live), pass it into `runAction`.
- `packages/widget/src/styles.css` - `.pw-chat-notice` styling.

## Out of scope / not doing

- No new npm dependencies.
- No URL-scheme / native GUI app (earlier idea, dropped - the target is the CLI).
- No changes to gemini-cli / opencode / pi adapters.

## Spiked + confirmed

- **claude interactive accepts the carry-over args.** Verified by launching `claude --model sonnet
--add-dir … --mcp-config '<json>' --strict-mcp-config --allowedTools …` under a PTY: the TUI
  started, showed "Sonnet 4.6" (model applied) and "1 MCPs" (mcp-config registered). No flag errors.
  All carry-over flags are global, not print-only (`--output-format`/`--input-format` are the
  print-only ones and we drop them).
- **No-TTY caveat (not a problem):** without a TTY claude auto-switches to print mode and demands
  input. The terminal launch always gives a real TTY (proven by the earlier `.command` spike), so
  interactive mode is what actually runs.
- **codex:** `codex resume <id>` + `-m <model>` confirmed. Codex has NO `--mcp-config` flag - MCP is
  configured via `~/.codex/config.toml` or `-c` TOML overrides. So codex carry-over = model via
  `-m`, and MCP only via `-c 'mcp_servers.conciv…'` overrides (heavier) OR model-only for v1.

## Open verifications (do at build time, before relying on them)

- **MCP endpoint lifetime:** confirm the conciv MCP-over-HTTP server is up for the dev server's
  lifetime (not spun per-turn). If it is per-turn, a resumed terminal can't reach it -> degrade the
  MCP carry-over to model-only and note it.
- **How the turn route derives `mcpUrl`:** thread the identical value into the launch route.

## Verification

- `turbo` build + typecheck across the touched packages.
- Manual: run the dev server, click the button, confirm the harness CLI opens in the terminal at the
  right cwd, resumes the session, on the selected model, with the conciv tools available; confirm the
  copy fallback when `open` is forced to fail.
