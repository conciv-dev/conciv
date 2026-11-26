# try/src

## Overview

Source of the `conciv-try` CLI. `cli.ts` parses arguments with citty and reports progress with `@clack/prompts` on a TTY, or plain lines otherwise. `connect.ts` resolves a harness adapter and a workspace, seeds a temporary workspace with the landing-page source fetched from `<origin>/site-source.json`, and starts the engine (`start` from `@conciv/backend/start`) on the first free port in the connect range.

## Interface

- CLI flags (`cli.ts`): `--token` (required pairing token), `--harness` (`claude` default, `codex`, `gemini-cli`, `opencode`, `pi`), `--workspace` (`.` = cwd; default is a temp dir), `--origin` (override the allowed browser origin, for testing).

## Invariants

- `workspace`, when given, must be exactly `.`; otherwise `resolveWorkspace` throws `workspace must be "." when provided` (`connect.ts`).
- An unknown harness throws `conciv: unknown harness "<x>". Known harnesses: <registered ids>.` before the workspace is seeded, the same text the engine's `start` refuses it with; `harnessAdapter` overrides `harness` (`resolveAdapter`).
- Seeding runs only when `workspace` is undefined (`connect.ts`).
- Ports are tried from `CONNECT_FIRST_PORT` to `CONNECT_LAST_PORT` (`@conciv/types/connect-ports`); only `EADDRINUSE` moves to the next port, other errors are rethrown, and exhaustion throws `no free port between ...` (`connect.ts`).
- The engine starts with `accessToken: opts.token`, `allowedOrigins: [origin ?? 'https://conciv.dev']`, `port: {exact}`, a no-op `launchEditor` and `systemPrompt: CONNECT_SYSTEM_PROMPT` (`connect.ts`).
- Manifest paths must be `package.json` or `src/...` with no backslashes and no empty, `.` or `..` segments; values must be strings (`allowedManifestPath`, `manifestEntries`, `seed-workspace.ts`).
- The manifest is capped at `MAX_MANIFEST_BYTES` (8 MiB), checked on content-length and body length; a non-OK response or fetch/parse error returns false (`seed-workspace.ts`).

## Side Effects

- `fetch(<origin>/site-source.json)` (`fetchManifest`, `seed-workspace.ts`).
- Writes manifest files under the workspace root and an `AGENTS.md` when seeding succeeds; per-file write errors are skipped (`seedWorkspace`).
- Creates a `conciv-connect-*` temp dir in `os.tmpdir()`, or reads `process.cwd()` when workspace is `.` (`resolveWorkspace`).
- Starts an HTTP conciv engine on 127.0.0.1 through `start` from `@conciv/backend/start` (`connect.ts`).
- Writes progress to stdout, plain or through clack, chosen by `process.stdout.isTTY` (`cli.ts`).
- Registers a `SIGINT` handler that calls `engine.stop()` then `process.exit(0)`; `onShutdown` sends SIGINT to its own pid; the command awaits a promise that never resolves to keep the process alive (`cli.ts`).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/try` from the repo root (turbo builds the package and its dependencies first)
