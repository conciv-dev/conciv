# test-runner/src/runner

## Overview

contract.ts defines the manager and adapter types and the tagged runner-unavailable error. driver.ts implements `makeChildManager`. It spawns the adapter's child script with stdio fd 3 as a pipe, parses each line against `ChildMessageSchema`, caches the last run result and the state of each file, and fans events out to subscribers. registry.ts lists all four adapters.

## Interface

- `TestRunnerManager`, `TestRunnerAdapter`, `TestRunnerCapabilities`, `RunArgs`, `ListResult`, `UiServerInfo` types (`contract.ts`)
- `runnerUnavailableError(runnerId, reason)` (`contract.ts`): returns an Error with message `${id} unavailable: ${reason}`, tagged `conciv:runner-unavailable`
- `isRunnerUnavailable(e)` (`contract.ts`): type guard that checks the tag with zod
- `defineRunner(adapter)` (`contract.ts`): validates an adapter
- `ChildRunnerSpec`, `SpawnRunner`, `MakeManagerOptions` types (`driver.ts`)
- `makeChildManager(spec, cwd, {spawnRunner?})` (`driver.ts`): builds a TestRunnerManager on top of a child process
- `defineChildRunner(spec)` (`driver.ts`): returns an adapter whose `create` is `makeChildManager`
- `defineStubRunner({id, capabilities, reason})` (`driver.ts`): returns an adapter whose `create()` throws `reason`
- `ChildMessageSchema`, `ListMessageSchema`, `ErrorMessageSchema`, `ChildMessage` (`child-protocol.ts`): the union of a TestEvent, a `list` message and an `error` message
- `adapters` = [vitest, jest, nodeTest, playwright] and `getRunner(id)` (`registry.ts`)

## Invariants

- `defineRunner` (`contract.ts`) throws 'runner: id is required' and `runner "<id>": create() factory is required`
- `driveChild` (`driver.ts`) rejects with unavailable 'runner did not expose its event channel (fd 3)' if `child.stdio[3]` is not a Readable
- `driveChild` (`driver.ts`): a child `error` message makes the run reject with that reason when the child closes. Lines that are blank, invalid JSON or fail the schema are dropped silently.
- `driveChild` (`driver.ts`) rejects with 'child exited without producing results (exit code X, signal Y)' only when no messages arrived and the exit was non-zero or caused by a signal
- `updateCache` (`driver.ts`): `run-start` clears the file cache and the replay buffer, `file-end` records pass or fail, and `run-end` replaces `cache.last`
- `subscribeRaw` (`driver.ts`) replays the current run's buffered events to each new subscriber
- `emitSnapshot` (`driver.ts`) always reports `watching:false`, and `openUiServer` always returns `{available:false}`
- `cleanEnv` (`driver.ts`) removes `NODE_OPTIONS` and every `VIBE_*` env var before spawning

## Side Effects

- `defaultSpawnRunner` (`driver.ts`) spawns `process.execPath <childScript> ...args` with cwd set to the app and stdio ['ignore','pipe','pipe','pipe']
- `stop` (`driver.ts`) sends SIGTERM to the active child
- `makeChildManager` (`driver.ts`) keeps mutable state for each manager: the subscriber set, the last-run cache, the replay buffer and the active child

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-test-runner` from the repo root (turbo builds the package and its dependencies first)
