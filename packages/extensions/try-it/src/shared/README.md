# try-it/src/shared

## Overview

`probe.ts` races `GET /t/<token>/health` on every loopback connect port and returns the first healthy base. `try-steps.ts` maps the copied and connected flags to the state of the three connect steps.

## Interface

- `probeCore(token, ports, signal?)` (`probe.ts`): resolves the first `http://127.0.0.1:<port>/t/<token>` whose `/health` answers OK, or `null`
- `preflight(token, timeoutMs, ports)` (`probe.ts`): `probeCore` with `AbortSignal.timeout(timeoutMs)`
- `stepStates({copied, connected})` (`try-steps.ts`): returns a `Record<TryStep, StepState>`
- `TryStep`, `StepState` (`try-steps.ts`): `'copy' | 'run' | 'approve'` and `'pending' | 'active' | 'done'`

## Invariants

- `probeCore` (`probe.ts`) treats a non-OK response as a failure and returns `null` when every port fails (`Promise.any` rejection)
- `stepStates` (`try-steps.ts`): `connected` marks every step done; otherwise `copied` advances only to `run`

## Side Effects

- `probeCore` (`probe.ts`) issues `fetch` requests to `http://127.0.0.1:<port>/t/<token>/health`

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-try-it` from the repo root (turbo builds the package and its dependencies first)
