# try-it/src/client

## Overview

`ConnectPane` renders three numbered steps (copy the `npx @conciv/try --token` command, run it, approve Chrome's local-network prompt) and a status footer. `useCoreProbe` polls the connect ports through a small pure state machine in `probe-machine.ts` and hands the found base to `connect.found` after a short hold. `useLocalNetworkAccessPermission` reads the `local-network-access` permission so the pane can show a blocked state.

## Interface

- `ConnectPane(props: {token, connect})` (`connect-pane.tsx`): the guided connect UI
- `ConnectCapability` (`connect-pane.tsx`): type of `ExtensionApi['useConnect']` return value
- `useCoreProbe({token, onFound})` (`use-core-probe.ts`): returns `{connected, slow}` accessors
- `CoreProbe` (`use-core-probe.ts`): return type of `useCoreProbe`
- `ProbeState`, `ProbeEvent`, `ProbePlan`, `SEARCHING` (`probe-machine.ts`): probe state machine types and initial state
- `probeTransition`, `probePlanFor`, `reachedCore`, `hintedSlow`, `holdingBase` (`probe-machine.ts`): pure transition and query functions
- `useLocalNetworkAccessPermission()` (`use-lna-permission.ts`): accessor over `LocalNetworkAccessState`
- `LocalNetworkAccessState` (`use-lna-permission.ts`): `'unknown' | 'unsupported' | 'prompt' | 'granted' | 'denied'`

## Invariants

- `probeTransition` (`probe-machine.ts`) moves only `probing -> holding -> connected`; `answered` is ignored outside `probing`, `held` is ignored outside `holding`
- `onSlow` (`probe-machine.ts`) sets the slow hint at most once and only while probing
- `probePlanFor` (`probe-machine.ts`) hands off the base exactly once, on the transition into `connected`
- `useCoreProbe` (`use-core-probe.ts`) stops polling once `reachedCore` is true; intervals are `PROBE_INTERVAL_MS` 2000, `SLOW_HINT_MS` 60000, `CONNECTED_HOLD_MS` 600
- `useLocalNetworkAccessPermission` (`use-lna-permission.ts`) returns `'unsupported'` when `navigator.permissions` is missing or the query rejects, and subscribes to `change` only once

## Side Effects

- `useCoreProbe` (`use-core-probe.ts`) fetches `/t/<token>/health` on every connect port every 2 s via `probeCore`; aborts through an `AbortController` on cleanup
- `useCoreProbe` (`use-core-probe.ts`) calls `onFound(base)` (wired to `connect.found`) once connected
- `useLocalNetworkAccessPermission` (`use-lna-permission.ts`) calls `navigator.permissions.query({name: 'local-network-access'})` and listens for its `change` event
- `ConnectPane` (`connect-pane.tsx`) focuses the pane on mount via `requestAnimationFrame` and writes to the clipboard through `ClipboardCopyButton`

## Verification

- Run: `cd packages/extensions/try-it && pnpm test`
