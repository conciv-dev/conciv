# terminal/src/server

## Overview

`createTtySessions` keeps one `@lydell/node-pty` process per session id. It records output into a capped replay buffer, fans data and control frames out to attached sinks, and evicts idle unattached sessions. `createOscBusyTracker` derives busy state from OSC 9;4 progress sequences. `createFrameInjector` holds injected text until no synchronized-output frame (CSI ?2026h/l) is open.

## Interface

- `createTtySessions(opts?: {idleEvictMs?, replayCap?})` / `TtySessions` / `TtySession` / `TtySink` (`pty-sessions.ts`): open/get/close/shutdown sessions; each session supports write, interrupt, inject, resize, attach, busy, kill, exited
- `createOscBusyTracker` / `OscBusyTracker` (`osc-busy.ts`): `feed`, `busy`, `seen`, `onChange`
- `createFrameInjector(write)` / `FrameInjector` (`frame-injector.ts`): `feed`, `inject`, `pending`
- `ensureSpawnHelperExecutable` (`spawn-helper-fix.ts`): on darwin, chmods the `@lydell/node-pty-darwin-<arch>/spawn-helper` binary to 0755 if it is not executable

## Invariants

- `open` drops any existing entry for the same session id before spawning (`pty-sessions.ts`)
- The replay buffer is capped at `REPLAY_CAP` (4 MiB) by shifting old chunks, always keeping at least one (`pty-sessions.ts`)
- Idle eviction runs after `IDLE_EVICT_MS` (5 min) only when no sinks are attached and the tracker is not busy (`pty-sessions.ts`)
- `interrupt` is debounced to `INTERRUPT_DEBOUNCE_MS` (1000 ms) and writes `\x03` (`pty-sessions.ts`)
- write, inject, resize and interrupt do nothing once the pty has exited (`pty-sessions.ts`)
- `attach` on a missing entry sends `{type:'error', message:'terminal session gone'}`; otherwise it replays history, then sends busy, then either error or exit (`pty-sessions.ts`)
- A spawn failure sets `exit = {code:-1}` and records the error message (`pty-sessions.ts`)
- `spawnEnv` removes env vars matching `command.unsetEnvPrefixes`, then overlays `command.env` (`pty-sessions.ts`)
- An OSC 9;4 state of '0' means not busy and any other state means busy; listeners fire only on change; the carry buffer is capped at 64 chars (`osc-busy.ts`)
- Injected text is stripped of every ANSI sequence except SGR and is flushed only outside a ?2026 synchronized frame; the carry is capped at 16 chars (`frame-injector.ts`)

## Side Effects

- `spawnPty` (`pty-sessions.ts`) spawns child processes via `@lydell/node-pty` (xterm-256color, 120x32 by default); `drop` kills them
- `createTtySessions` (`pty-sessions.ts`) sets unref'd idle-eviction timers
- `ensureSpawnHelperExecutable` (`spawn-helper-fix.ts`) may chmod the node-pty spawn-helper binary on disk

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-terminal` from the repo root (turbo builds the package and its dependencies first)
