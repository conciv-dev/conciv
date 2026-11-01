# try/src

## Overview

Source of the `conciv-try` CLI. `cli.ts` parses arguments with citty and reports progress with `@clack/prompts` on a TTY, or plain lines otherwise. `connect.ts` resolves a harness adapter and a workspace, seeds a temporary workspace with the landing-page source fetched from `<origin>/site-source.json`, and starts `@conciv/core` with the terminal extension on the first free port in the connect range.

## Interface

- `runCli()` (`cli.ts`): `runMain` for command `conciv-try`, called by `bin.ts` (shebang `node --disable-warning=ExperimentalWarning`).
- CLI flags (`cli.ts`): `--token` (required pairing token), `--harness` (`claude` default, `codex`, `gemini-cli`, `opencode`, `pi`), `--workspace` (`.` = cwd; default is a temp dir), `--origin` (override the allowed browser origin, for testing).
- `attachCommand(port, token)` (`cli.ts`): the `claude --continue --mcp-config '...'` command pointing at `http://127.0.0.1:<port>/t/<token>/api/mcp`.
- `plainLines(event, token)` (`cli.ts`): non-TTY output lines per `ConnectEvent`.
- `runConnect(opts: ConnectOpts)` -> `Engine` (`connect.ts`): package entry (`exports["."]`).
- `ConnectOpts` `{token, harness?, workspace?, origin?, harnessAdapter?, onEvent?, onShutdown?}`; `ConnectEvent` = `seeded` | `started` (port, harness) | `client-connected` (`connect.ts`).
- `seedWorkspace(origin, root)` -> boolean (`seed-workspace.ts`).
- `CONNECT_SYSTEM_PROMPT` (`system-prompt.ts`): agent system prompt (static build without HMR, workspace edits are a sandbox, drive the page through `external_*` functions in `execute_typescript`, use `discover_tools` and `external_conciv_ui`).

## Invariants

- `workspace`, when given, must be exactly `.`; otherwise `resolveWorkspace` throws `workspace must be "." when provided` (`connect.ts`).
- An unknown harness throws `unknown harness "<x>"; try claude, codex, gemini-cli, opencode or pi`; `harnessAdapter` overrides `harness` (`resolveAdapter`).
- Seeding runs only when `workspace` is undefined (`connect.ts`).
- Ports are tried from `CONNECT_FIRST_PORT` to `CONNECT_LAST_PORT` (`@conciv/protocol/connect-ports`); only `EADDRINUSE` moves to the next port, other errors are rethrown, and exhaustion throws `no free port between ...` (`connect.ts`).
- Core starts with `accessToken: opts.token`, `allowedOrigins: [origin ?? 'https://conciv.dev']`, `extensions: [terminal]`, `port: {exact}`, a no-op `launchEditor` and `systemPrompt: CONNECT_SYSTEM_PROMPT` (`connect.ts`).
- Manifest paths must be `package.json` or `src/...` with no backslashes and no empty, `.` or `..` segments; values must be strings (`allowedManifestPath`, `manifestEntries`, `seed-workspace.ts`).
- The manifest is capped at `MAX_MANIFEST_BYTES` (8 MiB), checked on content-length and body length; a non-OK response or fetch/parse error returns false (`seed-workspace.ts`).

## Side Effects

- `fetch(<origin>/site-source.json)` (`fetchManifest`, `seed-workspace.ts`).
- Writes manifest files under the workspace root and an `AGENTS.md` when seeding succeeds; per-file write errors are skipped (`seedWorkspace`).
- Creates a `conciv-connect-*` temp dir in `os.tmpdir()`, or reads `process.cwd()` when workspace is `.` (`resolveWorkspace`).
- Starts an HTTP conciv core on 127.0.0.1 through `start` from `@conciv/core/start` (`connect.ts`).
- Writes progress to stdout, plain or through clack, chosen by `process.stdout.isTTY` (`cli.ts`).
- Registers a `SIGINT` handler that calls `engine.stop()` then `process.exit(0)`; `onShutdown` sends SIGINT to its own pid; the command awaits a promise that never resolves to keep the process alive (`cli.ts`).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/try` from the repo root (turbo builds the package and its dependencies first)
